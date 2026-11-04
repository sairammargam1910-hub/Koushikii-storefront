import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { columns, fingerprint, mediaIds, saveExport, readExport, validateExport } from "../src/content-migration.ts";

function row(id = "11111111-1111-4111-8111-111111111111") {
  return Object.fromEntries(columns.map(column => [column,
    column === "id" ? id :
    column === "created_at" || column === "updated_at" ? "2026-11-05T00:00:00.000Z" : null]));
}
test("hashes normalize dates and row order, but detect changed content", () => {
  const a = row(), b = row("22222222-2222-4222-8222-222222222222");
  const dates = { ...a, created_at: new Date(a.created_at), updated_at: new Date(a.updated_at) };
  assert.equal(fingerprint([a, b]), fingerprint([b, dates]));
  assert.notEqual(fingerprint([a]), fingerprint([{ ...a, title: "changed" }]));
});
test("exports inventory referenced uploaded media only", () => {
  const a = row(); a.image_url = `/api/site-content/media/${a.id}`; a.media_url = a.image_url;
  assert.deepEqual(mediaIds([a, { ...a, image_url: "/images/bundled.png", media_url: "https://example.test/photo.jpg" }]), [a.id]);
});
test("migration manifests reject tampering, missing columns, and altered media inventories", () => {
  const rows = [row()];
  const valid = { version: 1, rows, sha256: fingerprint(rows), assetIds: [] };
  validateExport(valid);
  assert.throws(() => validateExport({ ...valid, sha256: "tampered" }));
  assert.throws(() => validateExport({ ...valid, assetIds: ["unexpected"] }));
  const incomplete = [{ id: rows[0].id }];
  assert.throws(() => validateExport({ ...valid, rows: incomplete, sha256: fingerprint(incomplete) }));
});
test("export never overwrites an existing backup and round-trips empty data", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "koushikii-export-"));
  try {
    const file = path.join(root, "data.json");
    await saveExport(file, []);
    assert.equal((await readExport(file)).rows.length, 0);
    await assert.rejects(saveExport(file, []), { code: "EEXIST" });
  } finally { await rm(root, { recursive: true }); }
});

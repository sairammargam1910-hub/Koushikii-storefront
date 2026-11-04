import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import pg from "pg";

export const columns = [
  "id", "kind", "placement", "title", "eyebrow", "body", "image_url", "media_url", "alt_text",
  "cta_label", "cta_url", "linked_product_id", "sort_order", "published", "approved", "created_at", "updated_at",
];
export type ContentRow = Record<string, unknown>;
export type ContentExport = { version: 1; rows: ContentRow[]; assetIds: string[]; sha256: string };
export const defaultExportFile = fileURLToPath(new URL("../../generated-artifacts/migration/site-content.json", import.meta.url));
export function fingerprint(rows: ContentRow[]) {
  const ordered = [...rows].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return createHash("sha256").update(JSON.stringify(ordered.map(row => columns.map(column => {
    const value = row[column];
    return value instanceof Date ? value.toISOString() :
      ((column === "created_at" || column === "updated_at") && typeof value === "string" ? new Date(value).toISOString() : value);
  })))).digest("hex");
}
export function mediaIds(rows: ContentRow[]) {
  return [...new Set(rows.flatMap(row => [row.image_url, row.media_url]).flatMap(value => {
    const match = typeof value === "string" && /^\/api\/site-content\/media\/([0-9a-f-]{36})$/i.exec(value);
    return match ? [match[1]] : [];
  }))].sort();
}
export function validateExport(data: ContentExport) {
  if (data.version !== 1 || !Array.isArray(data.rows) || data.sha256 !== fingerprint(data.rows) ||
    JSON.stringify(data.assetIds) !== JSON.stringify(mediaIds(data.rows))) throw new Error("Invalid or altered migration export.");
  const ids = new Set();
  for (const row of data.rows) {
    if (columns.some(column => !(column in row)) || Object.keys(row).some(column => !columns.includes(column))) {
      throw new Error("Unexpected content export columns.");
    }
    if (!/^[0-9a-f-]{36}$/i.test(String(row.id)) || ids.has(row.id)) throw new Error("Invalid or duplicate content ID.");
    ids.add(row.id);
  }
}
export async function readExport(file: string) {
  const data = JSON.parse(await readFile(file, "utf8")) as ContentExport;
  validateExport(data);
  return data;
}
export async function saveExport(file: string, rows: ContentRow[]) {
  const data: ContentExport = { version: 1, rows, assetIds: mediaIds(rows), sha256: fingerprint(rows) };
  await mkdir(dirname(file), { recursive: true, mode: 0o700 });
  await writeFile(file, JSON.stringify(data, null, 2), { mode: 0o600, flag: "wx" });
  return data;
}

async function main() {
  const command = process.argv[2];
  const file = resolve(process.argv.slice(3).find(arg => !arg.startsWith("--")) || defaultExportFile);
  if (!["export", "import", "verify", "schema"].includes(command)) {
    throw new Error("Usage: migrate:content export|import|verify|schema [export-file] [--apply]");
  }
  const url = command === "export" ? process.env.SOURCE_DATABASE_URL : process.env.NEON_DATABASE_URL;
  if (!url) throw new Error(command === "export" ? "Set SOURCE_DATABASE_URL explicitly for read-only export." : "Set NEON_DATABASE_URL for the destination.");
  if (command !== "export" && !new URL(url).hostname.endsWith(".neon.tech")) throw new Error("Destination must be the approved Neon database.");
  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 10000 });
  try {
    await client.connect();
    if (command === "schema") {
      if (!process.argv.includes("--apply")) throw new Error("Schema creation requires --apply; use only on a fresh Neon database.");
      const inventory = await client.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public'");
      if (inventory.rowCount) throw new Error("Destination is not empty. Refusing to modify existing tables.");
      await client.query("BEGIN");
      await client.query(await readFile(new URL("../sql/neon-site-content.sql", import.meta.url), "utf8"));
      await client.query("COMMIT");
      process.stdout.write("Fresh Neon schema created.\n");
      return;
    }
    if (command === "export") {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const { rows } = await client.query("SELECT * FROM site_content_items ORDER BY id");
      await saveExport(file, rows);
      await client.query("COMMIT");
      process.stdout.write(`Exported ${rows.length} records; ${mediaIds(rows).length} referenced assets. Source unchanged.\n`);
      return;
    }
    const data = await readExport(file);
    if (command === "import") {
      if (!process.argv.includes("--apply")) {
        process.stdout.write(`Dry run: ${data.rows.length} records and ${data.assetIds.length} assets. Add --apply only after confirming the destination.\n`);
        return;
      }
      await client.query("BEGIN");
      await client.query("LOCK TABLE site_content_items IN EXCLUSIVE MODE");
      const count = await client.query("SELECT count(*)::int AS count FROM site_content_items");
      if (count.rows[0].count) throw new Error("Destination contains content. Refusing to overwrite it.");
      for (const row of data.rows) {
        await client.query(`INSERT INTO site_content_items (${columns.join(",")}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(",")})`, columns.map(column => row[column]));
      }
    } else {
      await client.query("BEGIN READ ONLY");
    }
    const target = await client.query("SELECT * FROM site_content_items ORDER BY id");
    if (fingerprint(target.rows) !== data.sha256) throw new Error("Source and destination records do not match.");
    await client.query("COMMIT");
    process.stdout.write(`Verified ${target.rows.length} records; hashes match. Source unchanged.\n`);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally { await client.end(); }
}
if (process.argv[1]?.endsWith("content-migration.ts")) {
  main().catch(error => {
    process.stderr.write(`Content migration failed: ${String(error.message).replace(/postgres(?:ql)?:\/\/[^\s]+/g, "[database URL redacted]")}\n`);
    process.exitCode = 1;
  });
}

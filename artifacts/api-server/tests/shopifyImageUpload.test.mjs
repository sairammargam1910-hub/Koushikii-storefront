import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { build } from "esbuild";
import sharp from "sharp";

// Compile the real upload service, replacing only network boundaries.
const compiled = await build({
  entryPoints: [new URL("../src/lib/shopifyImageUpload.ts", import.meta.url).pathname],
  bundle: true, write: false, format: "cjs", platform: "node",
  external: ["sharp"], define: { fetch: "uploadFetch" },
  plugins: [{
    name: "shopify-transport-test",
    setup(builder) {
      builder.onResolve({ filter: /^@replit\/connectors-sdk$/ }, () => ({ path: "connector", namespace: "test" }));
      builder.onLoad({ filter: /.*/, namespace: "test" }, () => ({
        contents: "export class ReplitConnectors { proxy(...args) { return sdkProxy(...args); } }",
      }));
    },
  }],
});
const target = {
  url: "https://storage.googleapis.com/shopify-upload",
  resourceUrl: "https://storage.googleapis.com/shopify-upload/photo.jpeg",
  parameters: [{ name: "key", value: "signed-key" }, { name: "policy", value: "signed-policy" }],
};
function load({ result, upload } = {}) {
  const calls = [];
  const module = { exports: {} };
  new Function("require", "module", "exports", "sdkProxy", "uploadFetch", compiled.outputFiles[0].text)(
    createRequire(import.meta.url), module, module.exports,
    async (_connector, _path, request) => {
      calls.push(JSON.parse(request.body));
      return Response.json(result ?? {
        data: { stagedUploadsCreate: { stagedTargets: [target], userErrors: [] } },
      });
    },
    upload ?? (async () => new Response("", { status: 201 })),
  );
  return { ...module.exports, calls };
}
const photo = await sharp({ create: { width: 12, height: 16, channels: 3, background: "#b22222" } }).jpeg().toBuffer();

test("validates and decodes JPEG, PNG, and WebP; strips metadata", async () => {
  const { prepareProductImage } = load();
  for (const [format, mime] of [["jpeg", "image/jpeg"], ["png", "image/png"], ["webp", "image/webp"]]) {
    const original = await sharp(photo).toFormat(format).withMetadata().toBuffer();
    const clean = await prepareProductImage(original, mime);
    const meta = await sharp(clean).metadata();
    assert.equal(meta.format, format);
    assert.equal(meta.width, 12);
    assert.equal(meta.height, 16);
    assert.equal(meta.exif, undefined);
    assert.equal(meta.icc, undefined);
  }
});

test("rejects empty, oversized, corrupt, mismatched, SVG, and HEIC input", async () => {
  const { prepareProductImage, MAX_IMAGE_BYTES } = load();
  for (const [bytes, mime] of [
    [Buffer.alloc(0), "image/jpeg"],
    [Buffer.alloc(MAX_IMAGE_BYTES + 1), "image/jpeg"],
    [Buffer.from("not an image"), "image/jpeg"],
    [photo.subarray(0, 40), "image/jpeg"],
    [photo, "image/png"],
    [Buffer.from("<svg/>"), "image/svg+xml"],
    [photo, "image/heic"],
  ]) {
    await assert.rejects(() => prepareProductImage(bytes, mime));
  }
});

test("rejects decompression-heavy images over 25 megapixels", async () => {
  const { prepareProductImage } = load();
  const large = await sharp({ create: { width: 6000, height: 5000, channels: 3, background: "white" } }).png().toBuffer();
  await assert.rejects(() => prepareProductImage(large, "image/png"), /25 megapixels/);
});

test("stages through the authorized Admin proxy and uploads signed multipart fields before the file", async () => {
  let body;
  const { stageProductImage, calls } = load({
    upload: async (url, options) => {
      assert.equal(url, target.url);
      assert.equal(options.method, "POST");
      assert.equal(options.redirect, "error");
      body = options.body;
      return new Response("", { status: 201 });
    },
  });
  assert.equal(await stageProductImage(photo, "image/jpeg"), target.resourceUrl);
  assert.match(calls[0].query, /stagedUploadsCreate/);
  assert.equal(calls[0].variables.input[0].resource, "IMAGE");
  assert.equal(calls[0].variables.input[0].mimeType, "image/jpeg");
  assert.deepEqual([...body.keys()], ["key", "policy", "file"]);
  assert.equal(body.get("file").type, "image/jpeg");
  assert.equal(calls[0].variables.input[0].fileSize, String(body.get("file").size));
});

test("invalid input never contacts Shopify", async () => {
  const { stageProductImage, calls } = load();
  await assert.rejects(() => stageProductImage(Buffer.from("bad"), "image/jpeg"));
  assert.equal(calls.length, 0);
});

test("surfaces Shopify user errors and missing targets", async () => {
  const rejected = load({ result: { data: { stagedUploadsCreate: { stagedTargets: [], userErrors: [{ message: "Upload not permitted" }] } } } });
  await assert.rejects(() => rejected.stageProductImage(photo, "image/jpeg"), /Upload not permitted/);
  const missing = load({ result: { data: { stagedUploadsCreate: { stagedTargets: [], userErrors: [] } } } });
  await assert.rejects(() => missing.stageProductImage(photo, "image/jpeg"), /secure upload target/);
});

test("network failures and rejected storage uploads do not return a usable source", async () => {
  const rejected = load({ upload: async () => new Response("", { status: 403 }) });
  await assert.rejects(() => rejected.stageProductImage(photo, "image/jpeg"), /could not receive/);
  const interrupted = load({ upload: async () => { throw new Error("Network interrupted"); } });
  await assert.rejects(() => interrupted.stageProductImage(photo, "image/jpeg"), /Network interrupted/);
});

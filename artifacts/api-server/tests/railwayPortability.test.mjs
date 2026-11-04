import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { build } from "esbuild";
import express from "express";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { Readable } from "node:stream";
import path from "node:path";

async function load(relative) {
  const compiled = await build({ entryPoints: [new URL(relative, import.meta.url).pathname], bundle: true, write: false, platform: "node", format: "cjs", packages: "external" });
  const module = { exports: {} };
  new Function("require", "module", "exports", compiled.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
  return module.exports;
}

test("combined hosting supports SPA routes, immutable assets, and API 404s", async () => {
  const { serveStorefront } = await load("../src/lib/serveStorefront.ts");
  const root = await mkdtemp(path.join(tmpdir(), "koushikii-spa-"));
  await mkdir(path.join(root, "assets"));
  await writeFile(path.join(root, "index.html"), "<html>Koushikii fixture</html>");
  await writeFile(path.join(root, "assets", "fixture.js"), "window.fixture = true;");
  const app = express();
  serveStorefront(app, root);
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const route of ["/", "/Cart", "/admin/content", "/sign-in/factor-one"]) {
      const res = await fetch(`${origin}${route}`);
      assert.equal(res.status, 200);
      assert.match(await res.text(), /Koushikii fixture/);
      assert.equal(res.headers.get("cache-control"), "no-store");
    }
    const api = await fetch(`${origin}/api/missing`);
    assert.equal(api.status, 404);
    assert.deepEqual(await api.json(), { error: "API route not found." });
    const asset = await fetch(`${origin}/assets/fixture.js`);
    assert.match(asset.headers.get("cache-control"), /immutable/);
    assert.equal((await fetch(`${origin}/assets/missing.js`)).status, 404);
    assert.equal((await fetch(`${origin}/Cart`, { method: "POST" })).status, 404);
  } finally { await new Promise(resolve => server.close(resolve)); await rm(root, { recursive: true }); }
});

test("direct Shopify uses the configured store and token, never the Replit connection lookup", async () => {
  const env = { ...process.env };
  const original = globalThis.fetch;
  try {
    process.env.SHOPIFY_CONNECTION_MODE = "direct";
    process.env.SHOPIFY_SHOP_DOMAIN = "fixture.myshopify.com";
    process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN = "fixture-storefront-token";
    globalThis.fetch = async (url, init) => {
      assert.equal(String(url), "https://fixture.myshopify.com/api/2026-04/graphql.json");
      assert.equal(init.headers["X-Shopify-Storefront-Access-Token"], "fixture-storefront-token");
      return Response.json({ data: { fixture: true } });
    };
    const client = await load("../src/lib/shopifyStorefrontClient.ts");
    assert.deepEqual(await client.shopifyStorefrontRequest("query { fixture }"), { fixture: true });
    assert.equal(await client.getShopifyCustomerAccountUrl(), "https://fixture.myshopify.com/account");
    process.env.SHOPIFY_SHOP_DOMAIN = "https://malicious.example/";
    await assert.rejects(client.getShopifyCustomerAccountUrl(), /myshopify/);
  } finally { process.env = env; globalThis.fetch = original; }
});

test("new Shopify apps cache and refresh client-credentials tokens", async () => {
  const env = { ...process.env };
  const original = globalThis.fetch;
  try {
    delete process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
    process.env.SHOPIFY_CONNECTION_MODE = "direct";
    process.env.SHOPIFY_SHOP_DOMAIN = "fixture.myshopify.com";
    process.env.SHOPIFY_CLIENT_ID = "fixture-id";
    process.env.SHOPIFY_CLIENT_SECRET = "fixture-secret";
    let tokenRequests = 0;
    globalThis.fetch = async (url, init) => {
      assert.equal(String(url), "https://fixture.myshopify.com/admin/oauth/access_token");
      assert.equal(new URLSearchParams(init.body).get("grant_type"), "client_credentials");
      tokenRequests++;
      return Response.json({ access_token: `fixture-token-${tokenRequests}`, expires_in: 86400 });
    };
    const { getDirectShopifyAdminToken, invalidateShopifyAdminToken } = await load("../src/lib/shopifyAdminToken.ts");
    const pair = await Promise.all([getDirectShopifyAdminToken(), getDirectShopifyAdminToken()]);
    assert.deepEqual(pair, ["fixture-token-1", "fixture-token-1"]);
    assert.equal(tokenRequests, 1);
    invalidateShopifyAdminToken();
    assert.equal(await getDirectShopifyAdminToken(), "fixture-token-2");
  } finally { process.env = env; globalThis.fetch = original; }
});

test("R2 adapter distinguishes a missing object from permission failure", async () => {
  const { R2AssetFile } = await load("../src/lib/r2SiteMedia.ts");
  const missing = new R2AssetFile("fixture-id", "fixture-bucket", { send: async () => { throw { $metadata: { httpStatusCode: 404 } }; } });
  assert.deepEqual(await missing.exists(), [false]);
  const denied = new R2AssetFile("fixture-id", "fixture-bucket", { send: async () => { throw { $metadata: { httpStatusCode: 403 } }; } });
  await assert.rejects(denied.exists());
});

test("R2 range streaming preserves bytes and private owner metadata", async () => {
  const { R2AssetFile } = await load("../src/lib/r2SiteMedia.ts");
  const commands = [];
  const file = new R2AssetFile("fixture-id", "fixture-bucket", {
    send: async command => {
      commands.push(command);
      if (command.constructor.name === "HeadObjectCommand") return { ContentType: "video/mp4", ContentLength: 10 };
      if (command.constructor.name === "GetObjectCommand") return { Body: Readable.from(Buffer.from("345")) };
      return {};
    },
  });
  assert.deepEqual(await file.getMetadata(), [{ contentType: "video/mp4", size: 10 }]);
  const chunks = [];
  for await (const chunk of file.createReadStream({ start: 3, end: 5 })) chunks.push(chunk);
  assert.equal(Buffer.concat(chunks).toString(), "345");
  assert.equal(commands.find(c => c.constructor.name === "GetObjectCommand").input.Range, "bytes=3-5");
  await file.markPrivate("fixture-merchant");
  const copy = commands.find(c => c.constructor.name === "CopyObjectCommand");
  assert.deepEqual(copy.input.Metadata, { owner: "fixture-merchant", visibility: "private" });
  assert.equal(copy.input.MetadataDirective, "REPLACE");
});

test("R2 upload signatures bind length and content type with a 15-minute expiry", async () => {
  const env = { ...process.env };
  try {
    process.env.R2_ENDPOINT = "https://fixture.r2.cloudflarestorage.com";
    process.env.R2_BUCKET_NAME = "fixture-bucket";
    process.env.R2_ACCESS_KEY_ID = "fixture-id";
    process.env.R2_SECRET_ACCESS_KEY = "fixture-secret";
    const { r2UploadUrl } = await load("../src/lib/r2SiteMedia.ts");
    const signed = new URL(await r2UploadUrl("fixture-asset", "image/png", 1234));
    assert.equal(signed.searchParams.get("X-Amz-Expires"), "900");
    assert.match(signed.searchParams.get("X-Amz-SignedHeaders"), /content-length/);
    assert.match(signed.searchParams.get("X-Amz-SignedHeaders"), /content-type/);
    assert.match(signed.pathname, /uploads\/fixture-asset$/);
  } finally { process.env = env; }
});

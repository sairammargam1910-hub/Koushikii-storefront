import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { build } from "esbuild";

const compiled = await build({
  entryPoints: [new URL("../src/lib/shopifyStorefrontClient.ts", import.meta.url).pathname],
  bundle: true,
  write: false,
  format: "cjs",
  platform: "node",
});

async function withShopDomain(shopDomain, run) {
  const previousFetch = globalThis.fetch;
  const previousHostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const previousIdentity = process.env.REPL_IDENTITY;
  process.env.REPLIT_CONNECTORS_HOSTNAME = "localhost:4321";
  process.env.REPL_IDENTITY = "test-identity";
  globalThis.fetch = async (input) => {
    assert.equal(new URL(String(input)).pathname, "/api/v2/connection");
    return Response.json({
      items: [{
        settings: {
          shop_domain: shopDomain,
          storefront_access_token: "fixture-token",
        },
      }],
    });
  };

  try {
    const module = { exports: {} };
    new Function("require", "module", "exports", compiled.outputFiles[0].text)(
      createRequire(import.meta.url),
      module,
      module.exports,
    );
    await run(module.exports.getShopifyCustomerAccountUrl);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousHostname === undefined) delete process.env.REPLIT_CONNECTORS_HOSTNAME;
    else process.env.REPLIT_CONNECTORS_HOSTNAME = previousHostname;
    if (previousIdentity === undefined) delete process.env.REPL_IDENTITY;
    else process.env.REPL_IDENTITY = previousIdentity;
  }
}

test("builds the Shopify-hosted account page from the connected store domain", async () => {
  await withShopDomain("chenetha.myshopify.com", async (getAccountUrl) => {
    assert.equal(
      await getAccountUrl(),
      "https://chenetha.myshopify.com/account",
    );
  });
});

test("rejects a connected store domain that includes a path or non-HTTPS origin", async () => {
  await withShopDomain("https://chenetha.myshopify.com/untrusted", async (getAccountUrl) => {
    await assert.rejects(getAccountUrl(), /invalid store domain/i);
  });
});

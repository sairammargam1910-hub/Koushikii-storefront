import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { build } from "esbuild";
import express from "express";

const compiled = await build({
  entryPoints: [new URL("../src/routes/shopify.ts", import.meta.url).pathname],
  bundle: true,
  write: false,
  format: "cjs",
  platform: "node",
  external: ["express"],
  plugins: [{
    name: "shopify-customer-account-boundaries",
    setup(builder) {
      builder.onResolve({ filter: /shopifyStorefrontClient$/ }, () => ({
        path: "storefront-client",
        namespace: "test",
      }));
      builder.onResolve({ filter: /logger$/ }, () => ({
        path: "logger",
        namespace: "test",
      }));
      builder.onLoad({ filter: /.*/, namespace: "test" }, ({ path }) => ({
        contents: {
          "storefront-client": [
            "export const shopifyStorefrontRequest = async () => { throw new Error('unexpected Shopify query'); };",
            "export const getShopifyCustomerAccountUrl = async () => accountUrl();",
          ].join("\n"),
          logger: "export const logger = { error() {} };",
        }[path],
      }));
    },
  }],
});

async function harness(run) {
  const state = {
    accountUrl: "https://chenetha.myshopify.com/account",
    fail: false,
    calls: 0,
  };
  const module = { exports: {} };
  new Function("require", "module", "exports", "accountUrl", compiled.outputFiles[0].text)(
    createRequire(import.meta.url),
    module,
    module.exports,
    async () => {
      state.calls += 1;
      if (state.fail) throw new Error("Shopify connection unavailable");
      return state.accountUrl;
    },
  );

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.log = { error() {} };
    next();
  });
  app.use("/api", module.exports.default);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const endpoint = `http://127.0.0.1:${server.address().port}/api/shopify/customer-account`;
  const get = async () => {
    const response = await fetch(endpoint);
    return {
      status: response.status,
      cacheControl: response.headers.get("cache-control"),
      data: await response.json(),
    };
  };
  try {
    await run({ state, get });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("returns the connected Shopify account page, not an order status", async () => {
  await harness(async ({ state, get }) => {
    const result = await get();
    assert.equal(result.status, 200);
    assert.equal(result.data.accountUrl, state.accountUrl);
    assert.equal(result.cacheControl, "public, max-age=300");
    assert.equal(state.calls, 1);
  });
});

test("returns a useful error when the connected Shopify account page is unavailable", async () => {
  await harness(async ({ state, get }) => {
    state.fail = true;
    const result = await get();
    assert.equal(result.status, 502);
    assert.deepEqual(result.data, {
      error: "The Shopify account page is temporarily unavailable.",
    });
  });
});

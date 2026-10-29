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
    name: "shopify-cart-boundaries",
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
            "export const shopifyStorefrontRequest = (...args) => storefrontRequest(...args);",
            "export const getShopifyCustomerAccountUrl = async () => 'https://chenetha.myshopify.com/account';",
          ].join("\n"),
          logger: "export const logger = { error() {} };",
        }[path],
      }));
    },
  }],
});

const variantId = "gid://shopify/ProductVariant/123";
const checkoutUrl = "https://chenetha.myshopify.com/checkouts/test-checkout";

function cart(overrides = {}) {
  return {
    id: "gid://shopify/Cart/cart-123",
    checkoutUrl,
    totalQuantity: 1,
    cost: { subtotalAmount: { amount: "1250.00", currencyCode: "INR" } },
    lines: {
      nodes: [{
        id: "gid://shopify/CartLine/line-123",
        quantity: 1,
        merchandise: {
          id: variantId,
          title: "Default",
          availableForSale: true,
          price: { amount: "1250.00", currencyCode: "INR" },
          selectedOptions: [{ name: "Title", value: "Default" }],
          product: {
            title: "Kanchipuram saree",
            handle: "kanchipuram-saree",
            description: "Handwoven silk",
            tags: ["saree"],
            featuredImage: null,
          },
        },
      }],
    },
    ...overrides,
  };
}

async function harness(run) {
  const state = {
    variant: {
      id: variantId,
      availableForSale: true,
      product: { title: "Kanchipuram saree", description: "Handwoven silk", tags: ["saree"] },
    },
    calls: [],
    cartMutationResult: { cart: cart(), userErrors: [] },
  };
  const module = { exports: {} };
  new Function("require", "module", "exports", "storefrontRequest", compiled.outputFiles[0].text)(
    createRequire(import.meta.url),
    module,
    module.exports,
    async (query, variables) => {
      state.calls.push({ query, variables });
      if (query.includes("ShopifyVariantForCart")) return { node: state.variant };
      if (query.includes("mutation CreateShopifyCart")) {
        return { cartCreate: state.cartMutationResult };
      }
      if (query.includes("mutation AddShopifyCartLines")) {
        return { cartLinesAdd: state.cartMutationResult };
      }
      throw new Error(`Unexpected Shopify query: ${query}`);
    },
  );

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.log = { error() {} }; next(); });
  app.use("/api", module.exports.default);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const endpoint = `http://127.0.0.1:${server.address().port}/api/shopify/cart`;
  const post = async (body) => {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: response.status, data: await response.json() };
  };
  try {
    await run({ state, post });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("rejects malformed variant IDs before contacting Shopify", async () => {
  await harness(async ({ state, post }) => {
    for (const merchandiseId of ["not-a-shopify-id", "gid://shopify/Product/123", "gid://shopify/ProductVariant/not-numeric"]) {
      const result = await post({ merchandiseId, quantity: 1 });
      assert.equal(result.status, 400);
      assert.match(result.data.error, /invalid/i);
    }
    assert.equal(state.calls.length, 0, "malformed IDs must not trigger validation or cart mutations");
  });
});

test("rejects demo, unavailable, and stale variants without creating a cart", async () => {
  await harness(async ({ state, post }) => {
    state.variant.product = {
      title: "Sample Kanchipuram saree",
      description: "Handwoven silk",
      tags: ["saree"],
    };
    const demo = await post({ merchandiseId: variantId, quantity: 1 });
    assert.equal(demo.status, 400);
    assert.match(demo.data.error, /demo/i);

    state.variant.product = {
      title: "Kanchipuram saree",
      description: "Handwoven silk",
      tags: ["saree"],
    };
    state.variant.availableForSale = false;
    const unavailable = await post({ merchandiseId: variantId, quantity: 1 });
    assert.equal(unavailable.status, 400);
    assert.match(unavailable.data.error, /unavailable/i);

    state.variant = null;
    const stale = await post({ merchandiseId: variantId, quantity: 1 });
    assert.equal(stale.status, 400);
    assert.match(stale.data.error, /could not be found/i);
    assert.equal(state.calls.some((call) => call.query.includes("mutation ")), false);
  });
});

test("forwards Shopify cart user errors and returns Shopify's checkout URL on success", async () => {
  await harness(async ({ state, post }) => {
    state.cartMutationResult = {
      cart: null,
      userErrors: [{ message: "This item is no longer available." }],
    };
    const rejected = await post({ merchandiseId: variantId, quantity: 1 });
    assert.equal(rejected.status, 400);
    assert.equal(rejected.data.error, "This item is no longer available.");

    state.cartMutationResult = { cart: cart(), userErrors: [] };
    const successful = await post({ merchandiseId: variantId, quantity: 1 });
    assert.equal(successful.status, 200);
    assert.equal(successful.data.checkoutUrl, checkoutUrl);
    assert.equal(successful.data.id, "gid://shopify/Cart/cart-123");
  });
});

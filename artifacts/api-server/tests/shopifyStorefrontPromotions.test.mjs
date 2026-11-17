import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { build } from "esbuild";
import express from "express";

const compiled = await build({
  stdin: {
    contents: `
      import shopifyAdminRouter from "./src/routes/shopifyAdmin.ts";
      import { store } from "@workspace/db";
      export { shopifyAdminRouter, store };
    `,
    resolveDir: new URL("../", import.meta.url).pathname,
    sourcefile: "shopify-storefront-promotions-harness.ts",
    loader: "ts",
  },
  bundle: true,
  write: false,
  format: "cjs",
  platform: "node",
  external: ["express"],
  plugins: [{
    name: "shopify-storefront-promotions-boundaries",
    setup(builder) {
      builder.onResolve({ filter: /^@workspace\/db$/ }, () => ({ path: "db", namespace: "test" }));
      builder.onResolve({ filter: /^drizzle-orm$/ }, () => ({ path: "drizzle", namespace: "test" }));
      builder.onResolve({ filter: /merchantAdminAuth$/ }, () => ({ path: "auth", namespace: "test" }));
      builder.onResolve({ filter: /shopifyAdminClient$/ }, () => ({ path: "shopify-admin", namespace: "test" }));
      builder.onResolve({ filter: /shopifyImageUpload$/ }, () => ({ path: "image", namespace: "test" }));
      builder.onResolve({ filter: /routes\/shopify$/ }, () => ({ path: "shopify-route", namespace: "test" }));
      builder.onResolve({ filter: /lib\/logger$/ }, () => ({ path: "logger", namespace: "test" }));
      builder.onLoad({ filter: /.*/, namespace: "test" }, ({ path }) => ({
        contents: {
          db: `
            const store = new Set();
            const storefrontPromotionsTable = { discountId: { name: "discountId" } };
            const db = {
              select: () => ({ from: async () => [...store].map((discountId) => ({ discountId })) }),
              insert: () => ({ values: (row) => ({ onConflictDoUpdate: async () => { store.add(row.discountId); } }) }),
              delete: () => ({ where: async (condition) => { store.delete(condition.value); } }),
            };
            export { db, store, storefrontPromotionsTable };
          `,
          drizzle: `export const eq = (column, value) => ({ column, value });`,
          auth: `export const requireMerchantAdmin = (req, res, next) => req.get("x-test-admin") === "yes" ? next() : res.status(403).json({ error: "Forbidden" });`,
          "shopify-admin": `
            export class ShopifyAdminError extends Error {}
            export class ShopifyInputError extends Error {}
            export const assertNoUserErrors = () => {};
            export const escapeProductDescription = (value) => value;
            export const isShopifyDiscountId = (value) => /^gid:\\/\\/shopify\\/DiscountCodeNode\\/\\d+$/.test(value);
            export const isShopifyProductId = () => true;
            export const normalizeProductDescription = (value) => value;
            export const shopifyAdminRequest = (...args) => globalThis.__testShopifyAdminRequest(...args);
            export const validatePublicImageUrl = () => {};
          `,
          image: `export const MAX_IMAGE_BYTES = 100; export const stageProductImage = async () => "";`,
          "shopify-route": `export const invalidateShopifyCatalog = () => {};`,
          logger: `export const logger = { error() {} };`,
        }[path],
      }));
    },
  }],
});

const module = { exports: {} };
new Function("require", "module", "exports", compiled.outputFiles[0].text)(
  createRequire(import.meta.url),
  module,
  module.exports,
);
const { shopifyAdminRouter, store } = module.exports;

const activeId = "gid://shopify/DiscountCodeNode/101";
const privateId = "gid://shopify/DiscountCodeNode/102";
const expiredId = "gid://shopify/DiscountCodeNode/103";

function createDiscountNode(id, { status = "ACTIVE", startsAt = new Date(Date.now() - 60_000).toISOString(), endsAt = null } = {}) {
  return {
    id,
    discount: {
      title: `Offer ${id.slice(-3)}`,
      status,
      startsAt,
      endsAt,
      codes: { nodes: [{ code: `SAVE${id.slice(-3)}` }] },
      customerGets: { value: { percentage: 0.15 } },
    },
  };
}

test("storefront returns only advertised, currently active Shopify offers and confirms admin toggles", async (t) => {
  store.clear();
  let shopifyCalled = false;
  globalThis.__testShopifyAdminRequest = async () => {
    shopifyCalled = true;
    return {
      discountNodes: {
        nodes: [
          createDiscountNode(activeId),
          createDiscountNode(privateId),
          createDiscountNode(expiredId, { endsAt: new Date(Date.now() - 30_000).toISOString() }),
          createDiscountNode("gid://shopify/DiscountCodeNode/104", { status: "SCHEDULED" }),
        ],
      },
    };
  };

  const app = express();
  app.use(express.json());
  app.use(shopifyAdminRouter);
  const server = app.listen(0);
  t.after(() => server.close());
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const emptyResponse = await fetch(`${baseUrl}/shopify/storefront/promotions`);
  assert.equal(emptyResponse.status, 200);
  assert.deepEqual(await emptyResponse.json(), { promotions: [] });
  assert.equal(shopifyCalled, false);

  for (const discountId of [activeId, expiredId]) {
    const response = await fetch(`${baseUrl}/shopify/admin/discounts/${encodeURIComponent(discountId)}/storefront`, {
      method: "PUT",
      headers: { "content-type": "application/json", "x-test-admin": "yes" },
      body: JSON.stringify({ advertiseOnStorefront: true }),
    });
    assert.equal(response.status, 200);
  }

  const publicResponse = await fetch(`${baseUrl}/shopify/storefront/promotions`);
  assert.equal(publicResponse.status, 200);
  assert.deepEqual(await publicResponse.json(), {
    promotions: [{
      title: "Offer 101",
      code: "SAVE101",
      percentage: 15,
      endsAt: null,
    }],
  });

  const enableResponse = await fetch(`${baseUrl}/shopify/admin/discounts/${encodeURIComponent(privateId)}/storefront`, {
    method: "PUT",
    headers: { "content-type": "application/json", "x-test-admin": "yes" },
    body: JSON.stringify({ advertiseOnStorefront: true }),
  });
  assert.equal(enableResponse.status, 200);
  assert.deepEqual(await enableResponse.json(), { advertiseOnStorefront: true });

  const refreshedResponse = await fetch(`${baseUrl}/shopify/storefront/promotions`);
  const refreshed = await refreshedResponse.json();
  assert.equal(refreshed.promotions.length, 2);
  assert.ok(refreshed.promotions.some((offer) => offer.code === "SAVE102"));
  assert.ok(!refreshed.promotions.some((offer) => offer.code === "SAVE103"));

  const adminResponse = await fetch(`${baseUrl}/shopify/admin/discounts`, {
    headers: { "x-test-admin": "yes" },
  });
  assert.equal(adminResponse.status, 200);
  const adminDiscounts = (await adminResponse.json()).discounts;
  assert.equal(adminDiscounts.find((discount) => discount.id === activeId).advertiseOnStorefront, true);
  assert.equal(adminDiscounts.find((discount) => discount.id === privateId).advertiseOnStorefront, true);
});

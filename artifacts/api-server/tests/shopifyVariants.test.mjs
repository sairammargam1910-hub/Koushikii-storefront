import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { build } from "esbuild";
import express from "express";

// Exercise the real router, schemas and Admin client, replacing only auth and remote I/O.
const compiled = await build({
  entryPoints: [new URL("../src/routes/shopifyAdmin.ts", import.meta.url).pathname],
  bundle: true, write: false, format: "cjs", platform: "node", external: ["express"],
  plugins: [{
    name: "variant-boundaries",
    setup(builder) {
      builder.onResolve({ filter: /^@replit\/connectors-sdk$/ }, () => ({ path: "connector", namespace: "test" }));
      builder.onResolve({ filter: /merchantAdminAuth$/ }, () => ({ path: "auth", namespace: "test" }));
      builder.onResolve({ filter: /^\.\/shopify$/ }, () => ({ path: "catalog", namespace: "test" }));
      builder.onResolve({ filter: /shopifyImageUpload$/ }, () => ({ path: "image", namespace: "test" }));
      builder.onLoad({ filter: /.*/, namespace: "test" }, ({ path }) => ({
        contents: {
          connector: "export class ReplitConnectors { proxy(...args) { return sdkProxy(...args); } }",
          auth: 'export const requireMerchantAdmin = (req,res,next) => req.get("x-test-admin") === "yes" ? next() : res.status(403).json({error:"Forbidden"});',
          catalog: "export const invalidateShopifyCatalog = () => {};",
          image: "export const MAX_IMAGE_BYTES = 100; export const stageProductImage = async () => '';",
        }[path],
      }));
    },
  }],
});
const gid = (type, id) => `gid://shopify/${type}/${id}`;
const productId = gid("Product", 1);
const variantId = gid("ProductVariant", 11);
const locationId = gid("Location", 20);
function fixture() {
  return {
    id: productId, title: "Saree", handle: "saree", description: "", productType: "Saree",
    status: "ACTIVE", tags: [], featuredMedia: null,
    variants: { nodes: [11, 12, 13].map((id) => ({
      id: gid("ProductVariant", id), title: `Size ${id}`, price: "100.00",
      selectedOptions: [{ name: "Size", value: String(id) }], inventoryQuantity: 12,
      inventoryPolicy: "CONTINUE",
      inventoryItem: {
        id: gid("InventoryItem", id), tracked: true,
        inventoryLevels: { nodes: [
          { location: { id: locationId, name: "Hyderabad", isActive: true }, quantities: [{ name: "available", quantity: 5 }] },
          { location: { id: gid("Location", 21), name: "Vijayawada", isActive: true }, quantities: [{ name: "available", quantity: 7 }] },
        ], pageInfo: { hasNextPage: false, endCursor: null } },
      },
    })), pageInfo: { hasNextPage: false, endCursor: null } },
  };
}
async function harness(run, configure = () => {}) {
  const state = { product: fixture(), calls: [], conflict: false, mutationError: false, inventoryPage: false };
  configure(state);
  const module = { exports: {} };
  new Function("require", "module", "exports", "sdkProxy", compiled.outputFiles[0].text)(
    createRequire(import.meta.url), module, module.exports,
    async (connector, path, request) => {
      assert.equal(connector, "shopify-store");
      assert.match(path, /\/admin\/api\/2026-04\/graphql.json/);
      const { query, variables: v } = JSON.parse(request.body);
      state.calls.push({ query, variables: v });
      let data;
      if (query.includes("MerchantVariantPage")) {
        data = { product: { variants: { nodes: state.product.variants.nodes.slice(2), pageInfo: { hasNextPage: false, endCursor: null } } } };
      } else if (query.includes("MerchantInventoryPage")) {
        data = { inventoryItem: { inventoryLevels: { nodes: [state.product.variants.nodes[0].inventoryItem.inventoryLevels.nodes[1]], pageInfo: { hasNextPage: false, endCursor: null } } } };
      } else if (query.includes("query MerchantProduct(")) {
        const product = structuredClone(state.product);
        product.variants.nodes = product.variants.nodes.slice(0, 2);
        product.variants.pageInfo = { hasNextPage: state.product.variants.nodes.length > 2, endCursor: "variant-page" };
        if (state.inventoryPage) {
          const levels = product.variants.nodes[0].inventoryItem.inventoryLevels;
          levels.nodes = levels.nodes.slice(0, 1);
          levels.pageInfo = { hasNextPage: true, endCursor: "inventory-page" };
        }
        data = { shop: { currencyCode: "INR" }, product };
      } else if (query.includes("mutation MerchantProductVariantUpdate")) {
        const input = v.variants[0];
        const variant = state.product.variants.nodes.find((entry) => entry.id === input.id);
        if (input.price) variant.price = input.price;
        if (input.inventoryPolicy) variant.inventoryPolicy = input.inventoryPolicy;
        if (input.optionValues) variant.selectedOptions = input.optionValues.map((option) => ({ name: option.optionName, value: option.name }));
        data = { productVariantsBulkUpdate: { userErrors: [] } };
      } else if (query.includes("mutation MerchantInventorySetQuantity")) {
        const input = v.input.quantities[0];
        assert.equal(v.input.ignoreCompareQuantity, undefined);
        assert.equal(input.compareQuantity, undefined);
        assert.match(query, /@idempotent\(key: \$idempotencyKey\)/);
        assert.match(v.idempotencyKey, /^[a-f\d-]{36}$/);
        if (state.conflict) data = { inventorySetQuantities: { userErrors: [{ message: "Quantity stale", code: "CHANGE_FROM_QUANTITY_STALE" }] } };
        else if (state.mutationError) data = { inventorySetQuantities: { userErrors: [{ message: "Shopify rejected inventory", code: "INVALID" }] } };
        else {
          const item = state.product.variants.nodes.find((entry) => entry.inventoryItem.id === input.inventoryItemId).inventoryItem;
          const level = item.inventoryLevels.nodes.find((entry) => entry.location.id === input.locationId);
          assert.equal(input.changeFromQuantity, level.quantities[0].quantity);
          level.quantities[0].quantity = input.quantity;
          data = { inventorySetQuantities: { userErrors: [] } };
        }
      } else throw new Error(`Unexpected query: ${query}`);
      return Response.json({ data });
    },
  );
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.log = { error() {} }; next(); });
  app.use("/api", module.exports.default);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/shopify/admin/products/${encodeURIComponent(productId)}`;
  const request = async (body, suffix = `/variants/${encodeURIComponent(variantId)}`, admin = true) => {
    const response = await fetch(base + suffix, {
      method: body === undefined ? "GET" : "PATCH",
      headers: { "Content-Type": "application/json", ...(admin ? { "x-test-admin": "yes" } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, data: await response.json() };
  };
  try { await run({ state, request }); }
  finally { await new Promise((resolve) => server.close(resolve)); }
}
const stock = (quantity = 3, compareQuantity = 5, id = locationId) => ({ stock: { locationId: id, quantity, compareQuantity } });
const mutations = (state) => state.calls.filter((call) => call.query.includes("mutation "));

test("loads every variant and each location using bounded nested pages and separate inventory pagination", async () => {
  await harness(async ({ request, state }) => {
    const result = await request(undefined, "");
    assert.equal(result.status, 200);
    assert.equal(result.data.product.variants.length, 3);
    assert.deepEqual(result.data.product.variants[0].inventoryLevels.map((level) => [level.locationName, level.available]), [["Hyderabad", 5], ["Vijayawada", 7]]);
    const variantPages = state.calls.filter((call) => call.query.includes("MerchantVariantPage"));
    assert.equal(variantPages.length, 1, "fixture must cross the two-variant preview boundary");
    assert.match(variantPages[0].query, /variants\(first: 25, after: \$after\)/);
    assert.match(variantPages[0].query, /inventoryLevels\(first: 1\)/);
    assert.equal(state.calls.filter((call) => call.query.includes("MerchantInventoryPage")).length, 1);
  }, (state) => { state.inventoryPage = true; });
});
test("updates only the resolved variant and location with compare-and-set; prevents overselling", async () => {
  await harness(async ({ request, state }) => {
    const result = await request(stock(0));
    assert.equal(result.status, 200);
    const variant = result.data.product.variants[0];
    assert.equal(variant.inventoryLevels[0].available, 0);
    assert.equal(variant.inventoryLevels[1].available, 7);
    assert.equal(variant.inventoryPolicy, "DENY");
    const quantity = mutations(state)[1].variables.input.quantities[0];
    assert.deepEqual(quantity, { inventoryItemId: gid("InventoryItem", 11), locationId, quantity: 0, changeFromQuantity: 5 });
    assert.equal(result.data.product.variants[1].inventoryLevels[0].available, 5);
  });
});
test("rejects stale reads without writing, and races detected by Shopify", async () => {
  await harness(async ({ request, state }) => {
    assert.equal((await request(stock(3, 4))).status, 409);
    assert.equal(mutations(state).length, 0);
    state.conflict = true;
    const raced = await request(stock());
    assert.equal(raced.status, 409);
    assert.match(raced.data.error, /Refresh/);
  });
});
test("rejects foreign variant/location, inactive location, untracked inventory, and invalid numbers", async () => {
  await harness(async ({ request, state }) => {
    assert.equal((await request(stock(), `/variants/${encodeURIComponent(gid("ProductVariant", 999))}`)).status, 404);
    for (const body of [stock(3, 5, gid("Location", 999)), stock(-1), stock(1.5), stock(1, 0.5), stock(1000001), { price: -1 }, {}]) {
      assert.equal((await request(body)).status, 400);
    }
    state.product.variants.nodes[0].inventoryItem.tracked = false;
    assert.equal((await request(stock())).status, 400);
    state.product.variants.nodes[0].inventoryItem.tracked = true;
    state.product.variants.nodes[0].inventoryItem.inventoryLevels.nodes[0].location.isActive = false;
    assert.equal((await request(stock())).status, 400);
    assert.equal(mutations(state).length, 0);
  });
});
test("edits existing size/color values and price without changing any stock", async () => {
  await harness(async ({ request, state }) => {
    const result = await request({ price: 225.50, selectedOptions: [{ name: "Size", value: "Large" }] });
    assert.equal(result.status, 200);
    assert.equal(result.data.product.variants[0].price, "225.50");
    assert.equal(result.data.product.variants[0].selectedOptions[0].value, "Large");
    assert.equal(mutations(state).length, 1);
    assert.equal((await request({ selectedOptions: [{ name: "Other", value: "X" }] })).status, 400);
    assert.equal((await request({ selectedOptions: [{ name: "Size", value: " " }] })).status, 400);
  });
});
test("old aggregate stock endpoint is rejected; merchant authorization gates new routes", async () => {
  await harness(async ({ request, state }) => {
    assert.equal((await request({ inventoryQuantity: 99 }, "")).status, 400);
    assert.equal((await request(stock(), undefined, false)).status, 403);
    assert.equal((await request(undefined, "", false)).status, 403);
    assert.equal(mutations(state).length, 0);
  });
});
test("surfaces Shopify user errors rather than reporting a successful stock save", async () => {
  await harness(async ({ request }) => {
    const result = await request(stock());
    assert.equal(result.status, 400);
    assert.match(result.data.error, /Shopify rejected/);
  }, (state) => { state.mutationError = true; });
});

test("generated client keeps Shopify GIDs inside single encoded path segments", async () => {
  const output = await build({
    entryPoints: [new URL("../../../lib/api-client-react/src/generated/api.ts", import.meta.url).pathname],
    bundle: true, write: false, format: "cjs", platform: "node",
    external: ["@tanstack/react-query"],
  });
  const module = { exports: {} };
  new Function("require", "module", "exports", output.outputFiles[0].text)(
    () => ({}), module, module.exports,
  );
  assert.equal(module.exports.getGetShopifyAdminProductUrl(productId), `/api/shopify/admin/products/${encodeURIComponent(productId)}`);
  assert.equal(module.exports.getUpdateShopifyAdminVariantUrl(productId, variantId), `/api/shopify/admin/products/${encodeURIComponent(productId)}/variants/${encodeURIComponent(variantId)}`);
});

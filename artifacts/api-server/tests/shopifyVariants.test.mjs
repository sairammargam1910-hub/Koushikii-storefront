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
    options: [{ id: gid("ProductOption", 30), name: "Size", optionValues: [11, 12, 13].map((id) => ({ id: gid("ProductOptionValue", id), name: String(id) })) }],
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
  const state = { product: fixture(), calls: [], conflict: false, mutationError: false, deleteError: false, deleteNetworkError: false, inventoryPage: false, nextOptionValueId: 31, nextVariantId: 100 };
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
      if (query.includes("mutation MerchantProductDelete")) {
        assert.equal(v.input.id, productId);
        assert.equal(v.synchronous, true);
        if (state.deleteNetworkError) throw new Error("Shopify connection timed out.");
        data = {
          productDelete: {
            deletedProductId: state.deleteError ? null : productId,
            userErrors: state.deleteError ? [{ message: "Shopify rejected deletion." }] : [],
          },
        };
      } else if (query.includes("MerchantVariantPage")) {
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
      } else if (query.includes("mutation MerchantProductOptionUpdate")) {
        const option = state.product.options.find((entry) => entry.id === v.option.id);
        const name = v.optionValuesToAdd[0].name;
        const id = gid("ProductOptionValue", state.nextOptionValueId++);
        option.optionValues.push({ id, name });
        data = { productOptionUpdate: { productOption: structuredClone(option), userErrors: [] } };
      } else if (query.includes("mutation MerchantProductVariantCreate")) {
        const selectedOptions = v.variants[0].optionValues.map(({ optionId, id }) => {
          const option = state.product.options.find((entry) => entry.id === optionId);
          const value = option.optionValues.find((entry) => entry.id === id);
          assert.ok(value, "variant creation uses a Shopify-issued option value ID");
          return { name: option.name, value: value.name };
        });
        const createdId = gid("ProductVariant", state.nextVariantId++);
        state.product.variants.nodes.push({
          id: createdId, title: selectedOptions.map((option) => option.value).join(" / "),
          price: v.variants[0].price, selectedOptions, inventoryQuantity: null,
          inventoryPolicy: "DENY", inventoryItem: { id: gid("InventoryItem", 200), tracked: false, inventoryLevels: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } },
        });
        data = { productVariantsBulkCreate: { productVariants: [{ id: createdId }], userErrors: [] } };
      } else if (query.includes("mutation MerchantProductVariantDelete")) {
        const deletedId = v.variantsIds[0];
        state.product.variants.nodes = state.product.variants.nodes.filter((entry) => entry.id !== deletedId);
        data = { productVariantsBulkDelete: { product: { id: productId }, userErrors: [] } };
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
  const request = async (body, suffix = `/variants/${encodeURIComponent(variantId)}`, admin = true, methodOverride) => {
    const response = await fetch(base + suffix, {
      method: methodOverride ?? (body === undefined ? "GET" : "PATCH"),
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

test("permanently deletes the selected product synchronously and requires merchant access", async () => {
  await harness(async ({ request, state }) => {
    const result = await request(undefined, "/permanently", true, "DELETE");
    assert.equal(result.status, 200);
    assert.deepEqual(result.data, { success: true, deletedProductId: productId });
    assert.equal(mutations(state).length, 1);
    assert.match(mutations(state)[0].query, /productDelete\(input: \$input, synchronous: \$synchronous\)/);
    assert.equal((await request(undefined, "/permanently", false, "DELETE")).status, 403);
  });
});

test("reports Shopify deletion errors without claiming the product was removed", async () => {
  await harness(async ({ request, state }) => {
    state.deleteError = true;
    const result = await request(undefined, "/permanently", true, "DELETE");
    assert.equal(result.status, 400);
    assert.match(result.data.error, /Shopify rejected deletion/);
  });
});

test("keeps deletion retryable after a Shopify connection error", async () => {
  await harness(async ({ request, state }) => {
    state.deleteNetworkError = true;
    const failed = await request(undefined, "/permanently", true, "DELETE");
    assert.equal(failed.status, 502);
    assert.match(failed.data.error, /could not permanently delete this product/i);
    assert.match(failed.data.error, /check the store connection and try again/i);

    state.deleteNetworkError = false;
    const retried = await request(undefined, "/permanently", true, "DELETE");
    assert.equal(retried.status, 200);
    assert.deepEqual(retried.data, { success: true, deletedProductId: productId });
    assert.equal(state.calls.filter((call) => call.query.includes("mutation MerchantProductDelete")).length, 2);
  });
});

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
test("creates a variant from Shopify-resolved option IDs and adds missing values without inventing stock", async () => {
  await harness(async ({ request, state }) => {
    const result = await request({
      price: 250,
      selectedOptions: [{ name: "Size", value: "XXL" }],
    }, "/variants", true, "POST");
    assert.equal(result.status, 200);
    assert.equal(result.data.product.variants.length, 4);
    assert.deepEqual(result.data.product.variants[3].selectedOptions, [{ name: "Size", value: "XXL" }]);
    assert.equal(result.data.product.variants[3].inventoryTracked, false);
    assert.deepEqual(result.data.product.variants[3].inventoryLevels, []);
    const createCall = state.calls.find((call) => call.query.includes("mutation MerchantProductVariantCreate"));
    assert.deepEqual(createCall.variables.variants[0].optionValues, [{
      optionId: gid("ProductOption", 30),
      id: gid("ProductOptionValue", 31),
    }]);
    assert.ok(state.calls.some((call) => call.query.includes("MerchantProductOptionUpdate")));
    assert.equal(state.calls.filter((call) => call.query.includes("query MerchantProduct(")).length, 3, "loads before, after adding the value, and after variant creation");
  });
});
test("rejects duplicate combinations and option mismatches without creating variants", async () => {
  await harness(async ({ request, state }) => {
    const duplicate = await request({ price: 200, selectedOptions: [{ name: "Size", value: "11" }] }, "/variants", true, "POST");
    assert.equal(duplicate.status, 400);
    const invalid = await request({ price: 200, selectedOptions: [{ name: "Colour", value: "Red" }] }, "/variants", true, "POST");
    assert.equal(invalid.status, 400);
    assert.equal(state.calls.some((call) => call.query.includes("mutation MerchantProductVariantCreate")), false);
  });
});
test("requires real size/color product options instead of Shopify's standalone Title option", async () => {
  await harness(async ({ request, state }) => {
    state.product.options = [{ id: gid("ProductOption", 30), name: "Title", optionValues: [{ id: gid("ProductOptionValue", 31), name: "Default Title" }] }];
    state.product.variants.nodes = [{
      ...state.product.variants.nodes[0],
      title: "Default Title",
      selectedOptions: [{ name: "Title", value: "Default Title" }],
    }];
    const result = await request({ price: 200, selectedOptions: [{ name: "Title", value: "New" }] }, "/variants", true, "POST");
    assert.equal(result.status, 400);
    assert.match(result.data.error, /real product option/);
    assert.equal(state.calls.some((call) => call.query.includes("mutation MerchantProductVariantCreate")), false);
  });
});
test("deletes selected variant and protects the last and default variants", async () => {
  await harness(async ({ request, state }) => {
    const result = await request(undefined, `/variants/${encodeURIComponent(variantId)}`, true, "DELETE");
    assert.equal(result.status, 200);
    assert.equal(result.data.product.variants.length, 2);
    assert.equal(result.data.product.variants.some((variant) => variant.id === variantId), false);
    assert.deepEqual(state.calls.find((call) => call.query.includes("mutation MerchantProductVariantDelete")).variables.variantsIds, [variantId]);
    state.product.variants.nodes = [state.product.variants.nodes[0]];
    assert.equal((await request(undefined, `/variants/${encodeURIComponent(state.product.variants.nodes[0].id)}`, true, "DELETE")).status, 400);
    state.product.variants.nodes.push({ ...fixture().variants.nodes[1], id: gid("ProductVariant", 99), title: "Default Title", selectedOptions: [{ name: "Title", value: "Default Title" }] });
    const defaultVariant = state.product.variants.nodes[1];
    assert.equal((await request(undefined, `/variants/${encodeURIComponent(defaultVariant.id)}`, true, "DELETE")).status, 400);
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
  assert.equal(module.exports.getCreateShopifyAdminVariantUrl(productId), `/api/shopify/admin/products/${encodeURIComponent(productId)}/variants`);
  assert.equal(module.exports.getDeleteShopifyAdminVariantUrl(productId, variantId), `/api/shopify/admin/products/${encodeURIComponent(productId)}/variants/${encodeURIComponent(variantId)}`);
});

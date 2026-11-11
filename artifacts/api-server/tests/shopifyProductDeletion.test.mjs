import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { build } from "esbuild";
import express from "express";

const compiled = await build({
  stdin: {
    contents: `
      import shopifyRouter from "./src/routes/shopify.ts";
      import shopifyAdminRouter from "./src/routes/shopifyAdmin.ts";
      export { shopifyRouter, shopifyAdminRouter };
    `,
    resolveDir: new URL("../", import.meta.url).pathname,
    sourcefile: "shopify-product-deletion-harness.ts",
    loader: "ts",
  },
  bundle: true,
  write: false,
  format: "cjs",
  platform: "node",
  external: ["express"],
  plugins: [{
    name: "shopify-product-deletion-boundaries",
    setup(builder) {
      builder.onResolve({ filter: /^@replit\/connectors-sdk$/ }, () => ({ path: "connector", namespace: "test" }));
      builder.onResolve({ filter: /merchantAdminAuth$/ }, () => ({ path: "auth", namespace: "test" }));
      builder.onResolve({ filter: /shopifyStorefrontClient$/ }, () => ({ path: "storefront", namespace: "test" }));
      builder.onResolve({ filter: /shopifyImageUpload$/ }, () => ({ path: "image", namespace: "test" }));
      builder.onResolve({ filter: /lib\/logger$/ }, () => ({ path: "logger", namespace: "test" }));
      builder.onLoad({ filter: /.*/, namespace: "test" }, ({ path }) => ({
        contents: {
          connector: "export class ReplitConnectors { proxy(...args) { return sdkProxy(...args); } }",
          auth: 'export const requireMerchantAdmin = (req,res,next) => req.get("x-test-admin") === "yes" ? next() : res.status(403).json({error:"Forbidden"});',
          storefront: "export const shopifyStorefrontRequest = (...args) => storefrontProxy(...args); export const getShopifyCustomerAccountUrl = async () => '';",
          image: "export const MAX_IMAGE_BYTES = 100; export const stageProductImage = async () => '';",
          logger: "export const logger = { error() {} };",
        }[path],
      }));
    },
  }],
});

const productId = "gid://shopify/Product/880068";
const productHandle = "deletion-test-table-runner-880068";
const variantId = "gid://shopify/ProductVariant/880068";
const locationId = "gid://shopify/Location/1";

function createProduct() {
  const location = {
    location: { id: locationId, name: "Test location", isActive: true },
    quantities: [{ name: "available", quantity: 4 }],
  };
  return {
    id: productId,
    title: "Crafted cotton table runner 880068",
    handle: productHandle,
    description: "Dedicated Shopify fixture for product deletion verification.",
    productType: "Home textile",
    tags: ["handmade", "deletion-test"],
    fabricMetafield: null,
    craftTechniqueMetafield: null,
    regionMetafield: null,
    colourMetafield: null,
    collections: {
      nodes: [],
      pageInfo: { hasNextPage: false, endCursor: null },
    },
    status: "ACTIVE",
    featuredMedia: { image: { url: "https://cdn.example.test/deletion-test.jpg", altText: "Test saree" } },
    images: { nodes: [{ url: "https://cdn.example.test/deletion-test.jpg", altText: "Test saree" }] },
    options: [],
    variants: {
      nodes: [{
        id: variantId,
        title: "Default",
        price: "1250.00",
        availableForSale: true,
        inventoryQuantity: 4,
        inventoryPolicy: "DENY",
        selectedOptions: [{ name: "Title", value: "Default" }],
        inventoryItem: {
          id: "gid://shopify/InventoryItem/880068",
          tracked: true,
          inventoryLevels: { nodes: [location], pageInfo: { hasNextPage: false, endCursor: null } },
        },
      }],
      pageInfo: { hasNextPage: false, endCursor: null },
    },
  };
}

test("permanent deletion refreshes shopper catalog, product detail lookup, merchant list, and inventory", async (t) => {
  const product = createProduct();
  const storefrontProduct = {
    ...structuredClone(product),
    fabric: { value: "Cotton" },
    craftTechnique: { value: "Block print" },
    region: null,
    colour: { value: "Indigo" },
    collections: { nodes: [] },
  };
  const state = { deleted: false, storefrontReads: 0 };
  const module = { exports: {} };

  new Function("require", "module", "exports", "sdkProxy", "storefrontProxy", compiled.outputFiles[0].text)(
    createRequire(import.meta.url),
    module,
    module.exports,
    async (connector, path, request) => {
      assert.equal(connector, "shopify-store");
      assert.match(path, /\/admin\/api\/2026-04\/graphql.json/);
      const { query, variables = {} } = JSON.parse(request.body);
      if (query.includes("mutation MerchantProductDelete")) {
        assert.equal(variables.input.id, productId);
        assert.equal(variables.synchronous, true);
        state.deleted = true;
        return Response.json({ data: { productDelete: { deletedProductId: productId, userErrors: [] } } });
      }
      if (query.includes("query MerchantCollections")) {
        return Response.json({
          data: {
            collections: {
              nodes: [
                { id: "gid://shopify/Collection/1", title: "Home page", handle: "frontpage", ruleSet: { appliedDisjunctively: true } },
                { id: "gid://shopify/Collection/2", title: "The Crafts Edit", handle: "the-crafts-edit", ruleSet: null },
              ],
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        });
      }
      if (query.includes("query MerchantProducts")) {
        const adminProduct = structuredClone(product);
        delete adminProduct.images;
        return Response.json({
          data: {
            shop: { currencyCode: "INR" },
            products: { nodes: state.deleted ? [] : [adminProduct] },
          },
        });
      }
      if (query.includes("query MerchantInventoryWatch")) {
        return Response.json({
          data: {
            productVariants: {
              nodes: state.deleted ? [] : [{
                id: variantId,
                title: "Default",
                inventoryPolicy: "DENY",
                product: { id: productId, title: product.title, status: "ACTIVE" },
                inventoryItem: structuredClone(product.variants.nodes[0].inventoryItem),
              }],
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        });
      }
      throw new Error(`Unexpected Shopify Admin query: ${query}`);
    },
    async (query) => {
      assert.match(query, /query ChenethaProducts/);
      state.storefrontReads += 1;
      return {
        products: {
        nodes: state.deleted ? [] : [storefrontProduct],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      };
    },
  );

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.log = { error() {} }; next(); });
  app.use("/api", module.exports.shopifyRouter);
  app.use("/api", module.exports.shopifyAdminRouter);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}/api`;

  const catalogBefore = await fetch(`${base}/shopify/products`);
  assert.equal(catalogBefore.status, 200);
  assert.equal(catalogBefore.headers.get("cache-control"), "no-store");
  const uncategorizedCatalog = await catalogBefore.json();
  assert.deepEqual(uncategorizedCatalog.products.map(({ id }) => id), [productId]);
  assert.equal(uncategorizedCatalog.products[0].productType, "Home textile");
  assert.deepEqual(uncategorizedCatalog.products[0].collections, []);
  const cachedCatalog = await fetch(`${base}/shopify/products`);
  assert.deepEqual((await cachedCatalog.json()).products.map(({ id }) => id), [productId]);
  assert.equal(state.storefrontReads, 1, "the shopper catalog is initially served from its server cache");

  const adminProductsBeforeResponse = await fetch(`${base}/shopify/admin/products`, {
    headers: { "x-test-admin": "yes" },
  });
  assert.equal(adminProductsBeforeResponse.status, 200);
  assert.deepEqual((await adminProductsBeforeResponse.json()).products.map(({ id }) => id), [productId]);
  const collectionsResponse = await fetch(`${base}/shopify/admin/collections`, {
    headers: { "x-test-admin": "yes" },
  });
  assert.equal(collectionsResponse.status, 200);
  assert.deepEqual((await collectionsResponse.json()).collections.map(({ title }) => title), ["The Crafts Edit"]);

  const inventoryBeforeResponse = await fetch(`${base}/shopify/admin/inventory`, {
    headers: { "x-test-admin": "yes" },
  });
  assert.equal(inventoryBeforeResponse.status, 200);
  assert.deepEqual((await inventoryBeforeResponse.json()).variants.map(({ productId: id }) => id), [productId]);

  const deleteResponse = await fetch(`${base}/shopify/admin/products/${encodeURIComponent(productId)}/permanently`, {
    method: "DELETE",
    headers: { "x-test-admin": "yes" },
  });
  assert.equal(deleteResponse.status, 200);
  assert.deepEqual(await deleteResponse.json(), { success: true, deletedProductId: productId });

  const catalogAfter = await fetch(`${base}/shopify/products`);
  assert.equal(catalogAfter.headers.get("cache-control"), "no-store");
  const refreshedCatalog = await catalogAfter.json();
  assert.deepEqual(refreshedCatalog.products, []);
  assert.equal(state.storefrontReads, 2, "successful deletion invalidates the server-side product catalog cache");
  assert.equal(refreshedCatalog.products.find(({ handle }) => handle === productHandle), undefined,
    "the Shopify product detail route resolves handles from the refreshed catalog");

  const adminProductsResponse = await fetch(`${base}/shopify/admin/products`, {
    headers: { "x-test-admin": "yes" },
  });
  assert.equal(adminProductsResponse.status, 200);
  assert.deepEqual((await adminProductsResponse.json()).products, []);

  const inventoryResponse = await fetch(`${base}/shopify/admin/inventory`, {
    headers: { "x-test-admin": "yes" },
  });
  assert.equal(inventoryResponse.status, 200);
  assert.deepEqual((await inventoryResponse.json()).variants, []);
});

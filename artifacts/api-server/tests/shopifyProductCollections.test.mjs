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
    sourcefile: "shopify-product-collections-harness.ts",
    loader: "ts",
  },
  bundle: true,
  write: false,
  format: "cjs",
  platform: "node",
  external: ["express"],
  plugins: [{
    name: "shopify-product-collections-boundaries",
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

const productId = "gid://shopify/Product/991100";
const variantId = "gid://shopify/ProductVariant/991100";
const inventoryItemId = "gid://shopify/InventoryItem/991100";
const locationId = "gid://shopify/Location/1";
const collectionId = "gid://shopify/Collection/991100";

function createFixtureProduct() {
  return {
    id: productId,
    title: "Hand-block cotton table runner",
    handle: "hand-block-cotton-table-runner",
    description: "A structured-catalog fixture.",
    productType: "Home textile",
    status: "DRAFT",
    tags: [],
    metafields: [],
    collections: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
    featuredMedia: null,
    options: [],
    variants: {
      nodes: [{
        id: variantId,
        title: "Default Title",
        price: "1800.00",
        inventoryQuantity: 4,
        inventoryPolicy: "DENY",
        selectedOptions: [{ name: "Title", value: "Default Title" }],
        inventoryItem: {
          id: inventoryItemId,
          tracked: true,
          inventoryLevels: {
            nodes: [{
              location: { id: locationId, name: "Main location", isActive: true },
              quantities: [{ name: "available", quantity: 4 }],
            }],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      }],
      pageInfo: { hasNextPage: false, endCursor: null },
    },
  };
}

test("publishes an unassigned non-saree product, then adds it to a newly created collection", async (t) => {
  const state = { product: null, collections: [], productCreateCount: 0, published: new Set() };
  const module = { exports: {} };
  new Function("require", "module", "exports", "sdkProxy", "storefrontProxy", compiled.outputFiles[0].text)(
    createRequire(import.meta.url),
    module,
    module.exports,
    async (_connector, path, request) => {
      assert.match(path, /\/admin\/api\/2026-04\/graphql.json/);
      const { query, variables = {} } = JSON.parse(request.body);

      if (query.includes("mutation MerchantProductCreate")) {
        state.productCreateCount += 1;
        state.product = createFixtureProduct();
        state.product.status = variables.product.status;
        state.product.title = variables.product.title;
        state.product.description = variables.product.descriptionHtml;
        state.product.productType = variables.product.productType;
        state.product.tags = variables.product.tags;
        return Response.json({ data: { productCreate: { product: { id: productId }, userErrors: [] } } });
      }
      if (query.includes("query MerchantProduct(")) {
        return Response.json({ data: { shop: { currencyCode: "INR" }, product: structuredClone(state.product) } });
      }
      if (query.includes("mutation MerchantProductVariantUpdate")) {
        state.product.variants.nodes[0].price = variables.variants[0].price;
        return Response.json({ data: { productVariantsBulkUpdate: { userErrors: [] } } });
      }
      if (query.includes("mutation MerchantInventoryItemUpdate")) {
        return Response.json({ data: { inventoryItemUpdate: { userErrors: [] } } });
      }
      if (query.includes("query MerchantInventoryLocations")) {
        return Response.json({ data: { locations: { nodes: [{ id: locationId, name: "Main location" }] } } });
      }
      if (query.includes("mutation MerchantInventorySetQuantity")) {
        return Response.json({ data: { inventorySetQuantities: { userErrors: [] } } });
      }
      if (query.includes("query ChenethaProductAttributeDefinitions")) {
        return Response.json({
          data: {
            metafieldDefinitions: {
              nodes: ["fabric", "craft_technique", "region", "colour"].map((key) => ({
                id: `gid://shopify/MetafieldDefinition/${key}`,
                namespace: "chenetha",
                key,
                type: { name: "single_line_text_field" },
                access: { storefront: "PUBLIC_READ" },
              })),
            },
          },
        });
      }
      if (query.includes("mutation ChenethaProductMetafieldsSet")) {
        state.product.metafields = variables.metafields.map(({ key, value }) => ({ key, value }));
        return Response.json({ data: { metafieldsSet: { metafields: state.product.metafields, userErrors: [] } } });
      }
      if (query.includes("query MerchantCollections")) {
        return Response.json({
          data: {
            collections: {
              nodes: state.collections,
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        });
      }
      if (query.includes("mutation MerchantCollectionCreate")) {
        const collection = {
          id: collectionId,
          title: variables.input.title,
          handle: "the-crafts-edit",
          ruleSet: null,
        };
        state.collections.push(collection);
        state.product.collections.nodes.push(collection);
        return Response.json({ data: { collectionCreate: { collection, userErrors: [] } } });
      }
      if (query.includes("mutation MerchantProductUpdate")) {
        const input = variables.product;
        if (input.status) state.product.status = input.status;
        for (const id of input.collectionsToJoin ?? []) {
          const collection = state.collections.find((entry) => entry.id === id);
          if (collection && !state.product.collections.nodes.some((entry) => entry.id === id)) {
            state.product.collections.nodes.push(collection);
          }
        }
        state.product.collections.nodes = state.product.collections.nodes.filter(
          (entry) => !(input.collectionsToLeave ?? []).includes(entry.id),
        );
        return Response.json({ data: { productUpdate: { product: { id: productId }, userErrors: [] } } });
      }
      if (query.includes("query MerchantStorefrontPublication")) {
        return Response.json({ data: { publications: { nodes: [{ id: "gid://shopify/Publication/1", name: "Replit" }] } } });
      }
      if (query.includes("mutation MerchantPublishable")) {
        state.published.add(variables.publishableId);
        return Response.json({ data: { publishablePublish: { userErrors: [] } } });
      }
      throw new Error(`Unexpected Shopify Admin query: ${query}`);
    },
    async (query) => {
      assert.match(query, /query ChenethaProducts/);
      const publishedProduct = state.product && state.published.has(productId)
        ? {
            ...structuredClone(state.product),
            images: { nodes: [] },
            variants: {
              nodes: state.product.variants.nodes.map((variant) => ({
                id: variant.id,
                title: variant.title,
                availableForSale: true,
                price: { amount: variant.price, currencyCode: "INR" },
                selectedOptions: variant.selectedOptions,
              })),
            },
            fabric: state.product.metafields.find(({ key }) => key === "fabric")
              ? { value: state.product.metafields.find(({ key }) => key === "fabric").value }
              : null,
            craftTechnique: state.product.metafields.find(({ key }) => key === "craft_technique")
              ? { value: state.product.metafields.find(({ key }) => key === "craft_technique").value }
              : null,
            region: state.product.metafields.find(({ key }) => key === "region")
              ? { value: state.product.metafields.find(({ key }) => key === "region").value }
              : null,
            colour: state.product.metafields.find(({ key }) => key === "colour")
              ? { value: state.product.metafields.find(({ key }) => key === "colour").value }
              : null,
            collections: { nodes: state.published.has(collectionId) ? state.product.collections.nodes : [] },
          }
        : null;
      return {
        products: {
          nodes: publishedProduct ? [publishedProduct] : [],
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
  const adminHeaders = { "content-type": "application/json", "x-test-admin": "yes" };

  const created = await fetch(`${base}/shopify/admin/products`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({
      title: "Hand-block cotton table runner",
      description: "A table textile.",
      productType: "Home textile",
      tags: [],
      price: 1800,
      inventoryQuantity: 4,
      publishToWebsite: true,
      collectionIds: [],
      fabric: "Cotton",
      craftTechnique: "Block printing",
      region: "Telangana",
      colour: "Indigo",
    }),
  });
  assert.equal(created.status, 201, await created.text());
  assert.equal(state.product.status, "ACTIVE");
  assert.equal(state.productCreateCount, 1);
  assert.deepEqual(state.product.collections.nodes, []);

  const allProducts = await fetch(`${base}/shopify/products`);
  assert.equal(allProducts.status, 200);
  const unassigned = await allProducts.json();
  assert.deepEqual(unassigned.products.map(({ id }) => id), [productId]);
  assert.deepEqual(unassigned.products[0].collections, []);

  const updated = await fetch(`${base}/shopify/admin/products/${encodeURIComponent(productId)}`, {
    method: "PATCH",
    headers: adminHeaders,
    body: JSON.stringify({
      collectionIds: [],
      newCollectionTitle: "The Crafts Edit",
      publishToWebsite: true,
    }),
  });
  assert.equal(updated.status, 200, await updated.text());
  assert.equal(state.productCreateCount, 1, "collection assignment must not create another product");
  assert.equal(state.collections.length, 1);
  assert.equal(state.collections[0].title, "The Crafts Edit");
  assert.deepEqual(state.product.collections.nodes.map(({ id }) => id), [collectionId]);

  const catalogAfterAssignment = await fetch(`${base}/shopify/products`);
  const assigned = await catalogAfterAssignment.json();
  assert.deepEqual(assigned.products[0].collections.map(({ handle }) => handle), ["the-crafts-edit"]);
  assert.equal(assigned.products[0].attributes.fabric, "Cotton");
});

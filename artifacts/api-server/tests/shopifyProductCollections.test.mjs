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
          measurement: { weight: { value: 0.5, unit: "KILOGRAMS" } },
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

function adminProductResponse(product) {
  const { metafields, ...rest } = structuredClone(product);
  return {
    ...rest,
    fabricMetafield: metafields.find(({ key }) => key === "fabric") ?? null,
    regionalHandloomMetafield: metafields.find(({ key }) => key === "regional_handloom") ?? null,
    blouseAvailabilityMetafield: metafields.find(({ key }) => key === "blouse_availability") ?? null,
    craftTechniqueMetafield: metafields.find(({ key }) => key === "craft_technique") ?? null,
    regionMetafield: metafields.find(({ key }) => key === "region") ?? null,
    colourMetafield: metafields.find(({ key }) => key === "colour") ?? null,
    productDetailsMetafield: metafields.find(({ key }) => key === "product_details") ?? null,
  };
}

function assertAdminProductMetafieldQuery(query) {
  assert.doesNotMatch(query, /metafields\s*\(\s*identifiers\s*:/);
  for (const [alias, key] of [
    ["fabricMetafield", "fabric"],
    ["regionalHandloomMetafield", "regional_handloom"],
    ["blouseAvailabilityMetafield", "blouse_availability"],
    ["craftTechniqueMetafield", "craft_technique"],
    ["regionMetafield", "region"],
    ["colourMetafield", "colour"],
    ["productDetailsMetafield", "product_details"],
  ]) {
    assert.match(query, new RegExp(`${alias}:\\s*metafield\\(namespace: "chenetha", key: "${key}"\\)\\s*\\{ key value \\}`));
  }
}

test("admin product list and detail use supported nullable Admin API metafield selectors", async (t) => {
  const product = createFixtureProduct();
  product.metafields = [
    { key: "fabric", value: "Cotton" },
    { key: "craft_technique", value: "Handwoven" },
    { key: "region", value: "Telangana" },
    { key: "product_details", value: JSON.stringify({ fabricComposition: "100% cotton" }) },
  ];
  let productQueries = 0;
  const module = { exports: {} };
  new Function("require", "module", "exports", "sdkProxy", "storefrontProxy", compiled.outputFiles[0].text)(
    createRequire(import.meta.url),
    module,
    module.exports,
    async (_connector, path, request) => {
      assert.match(path, /\/admin\/api\/2026-04\/graphql.json/);
      const { query } = JSON.parse(request.body);
      assertAdminProductMetafieldQuery(query);
      productQueries += 1;
      if (query.includes("query MerchantProducts")) {
        return Response.json({ data: { shop: { currencyCode: "INR" }, products: { nodes: [adminProductResponse(product)] } } });
      }
      assert.match(query, /query MerchantProduct\(/);
      return Response.json({ data: { shop: { currencyCode: "INR" }, product: adminProductResponse(product) } });
    },
    async () => { throw new Error("This admin read must not call the Storefront API."); },
  );

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.log = { error() {} }; next(); });
  app.use("/api", module.exports.shopifyAdminRouter);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}/api/shopify/admin/products`;
  const headers = { "x-test-admin": "yes" };

  for (const url of [base, `${base}/${encodeURIComponent(productId)}`]) {
    const response = await fetch(url, { headers });
    assert.equal(response.status, 200);
    const body = await response.json();
    const result = body.products?.[0] ?? body.product;
    assert.equal(result.fabric, "Cotton");
    assert.equal(result.craftTechnique, "Handwoven");
    assert.equal(result.region, "Telangana");
    assert.equal(result.colour, "", "missing metafields must remain an empty optional attribute");
    assert.equal(result.productDetails.fabricComposition, "100% cotton");
    assert.equal(result.productDetails.sareeLength, "");
  }
  assert.equal(productQueries, 2);
});

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
        assertAdminProductMetafieldQuery(query);
        return Response.json({ data: { shop: { currencyCode: "INR" }, product: adminProductResponse(state.product) } });
      }
      if (query.includes("mutation MerchantProductVariantUpdate")) {
        state.product.variants.nodes[0].price = variables.variants[0].price;
        return Response.json({ data: { productVariantsBulkUpdate: { userErrors: [] } } });
      }
      if (query.includes("mutation MerchantInventoryItemUpdate")) {
        const item = state.product.variants.nodes[0].inventoryItem;
        if (variables.input.measurement) item.measurement = variables.input.measurement;
        if (variables.input.tracked !== undefined) item.tracked = variables.input.tracked;
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
              nodes: ["fabric", "regional_handloom", "craft_technique", "region", "colour"].map((key) => ({
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
      if (query.includes("mutation ChenethaMetafieldDefinitionCreate")) {
        if (variables.definition.key === "blouse_availability") {
          assert.deepEqual(variables.definition, {
            namespace: "chenetha",
            key: "blouse_availability",
            name: "Blouse piece availability",
            description: "Structured blouse piece availability attribute used by the Chenetha storefront.",
            ownerType: "PRODUCT",
            type: "single_line_text_field",
            access: { storefront: "PUBLIC_READ" },
          });
        } else {
          assert.deepEqual(variables.definition, {
            namespace: "chenetha",
            key: "product_details",
            name: "Chenetha product details",
            description: "Product-specific fabric composition, measurements, border, design, care and additional details.",
            ownerType: "PRODUCT",
            type: "json",
            access: { storefront: "PUBLIC_READ" },
          });
        }
        return Response.json({
          data: {
            metafieldDefinitionCreate: {
              createdDefinition: {
                id: `gid://shopify/MetafieldDefinition/${variables.definition.key}`,
                namespace: "chenetha",
                key: variables.definition.key,
                type: { name: variables.definition.type },
                access: { storefront: "PUBLIC_READ" },
              },
              userErrors: [],
            },
          },
        });
      }
      if (query.includes("mutation ChenethaProductMetafieldsSet")) {
        for (const { key, value } of variables.metafields) {
          const current = state.product.metafields.find((entry) => entry.key === key);
          if (current) current.value = value;
          else state.product.metafields.push({ key, value });
        }
        return Response.json({ data: { metafieldsSet: { metafields: state.product.metafields, userErrors: [] } } });
      }
      if (query.includes("mutation ChenethaProductMetafieldsDelete")) {
        for (const { key } of variables.metafields) {
          state.product.metafields = state.product.metafields.filter((entry) => entry.key !== key);
        }
        return Response.json({ data: { metafieldsDelete: { deletedMetafields: [], userErrors: [] } } });
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
      assert.match(query, /blouseAvailability:\s*metafield\(namespace: "chenetha", key: "blouse_availability"\)\s*\{ value \}/);
      assert.match(query, /productDetails:\s*metafield\(namespace: "chenetha", key: "product_details"\)\s*\{ value \}/);
      assert.match(query, /nodes\s*\{\s*id handle title description\s*\}/);
      assert.match(query, /sku/);
      const publishedProduct = state.product && state.published.has(productId)
        ? {
            ...structuredClone(state.product),
            images: { nodes: [] },
            variants: {
              nodes: state.product.variants.nodes.map((variant) => ({
                id: variant.id,
                title: variant.title,
                sku: variant.sku ?? null,
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
            blouseAvailability: state.product.metafields.find(({ key }) => key === "blouse_availability")
              ? { value: state.product.metafields.find(({ key }) => key === "blouse_availability").value }
              : null,
            productDetails: state.product.metafields.find(({ key }) => key === "product_details")
              ? { value: state.product.metafields.find(({ key }) => key === "product_details").value }
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
  const productDetails = {
    fabricComposition: "100% cotton",
    sareeLength: "6.2 m",
    blousePieceLength: "0.8 m",
    borderDetails: "Contrasting border",
    designPattern: "Ikat",
    washCareInstructions: "Follow the care label.",
    additionalInformation: "Woven in Telangana.",
  };

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
      weightKg: 0.875,
      publishToWebsite: true,
      collectionIds: [],
      fabric: "Cotton",
      craftTechnique: "Block printing",
      region: "Telangana",
      colour: "Indigo",
      blouseAvailability: "included",
      productDetails,
    }),
  });
  assert.equal(created.status, 201, await created.clone().text());
  const createdData = await created.json();
  assert.equal(state.product.status, "ACTIVE");
  assert.equal(state.productCreateCount, 1);
  assert.deepEqual(state.product.collections.nodes, []);
  assert.equal(state.product.variants.nodes[0].inventoryItem.measurement.weight.value, 0.875);
  assert.equal(state.product.variants.nodes[0].inventoryItem.measurement.weight.unit, "KILOGRAMS");
  assert.equal(createdData.product.variants[0].weightKg, 0.875);
  assert.equal(createdData.product.blouseAvailability, "included");
  assert.equal(state.product.metafields.find(({ key }) => key === "blouse_availability")?.value, "included");
  assert.deepEqual(createdData.product.productDetails, productDetails);
  assert.deepEqual(
    JSON.parse(state.product.metafields.find(({ key }) => key === "product_details")?.value),
    productDetails,
  );

  const allProducts = await fetch(`${base}/shopify/products`);
  assert.equal(allProducts.status, 200);
  const unassigned = await allProducts.json();
  assert.deepEqual(unassigned.products.map(({ id }) => id), [productId]);
  assert.deepEqual(unassigned.products[0].collections, []);
  assert.equal(unassigned.products[0].variants[0].sku, null);
  assert.equal(unassigned.products[0].attributes.blouseAvailability, "included");
  assert.deepEqual(unassigned.products[0].productDetails, productDetails);

  const updated = await fetch(`${base}/shopify/admin/products/${encodeURIComponent(productId)}`, {
    method: "PATCH",
    headers: adminHeaders,
    body: JSON.stringify({
      collectionIds: [],
      newCollectionTitle: "The Crafts Edit",
      publishToWebsite: true,
      blouseAvailability: "not_included",
      productDetails: {
        ...productDetails,
        washCareInstructions: "Dry clean only.",
      },
    }),
  });
  assert.equal(updated.status, 200, await updated.clone().text());
  assert.equal((await updated.json()).product.blouseAvailability, "not_included");
  assert.equal(state.product.metafields.find(({ key }) => key === "blouse_availability")?.value, "not_included");
  assert.equal(
    JSON.parse(state.product.metafields.find(({ key }) => key === "product_details")?.value).washCareInstructions,
    "Dry clean only.",
  );
  assert.equal(state.productCreateCount, 1, "collection assignment must not create another product");
  assert.equal(state.collections.length, 1);
  assert.equal(state.collections[0].title, "The Crafts Edit");
  assert.deepEqual(state.product.collections.nodes.map(({ id }) => id), [collectionId]);

  const clearedDetails = await fetch(`${base}/shopify/admin/products/${encodeURIComponent(productId)}`, {
    method: "PATCH",
    headers: adminHeaders,
    body: JSON.stringify({
      productDetails: {
        fabricComposition: "",
        sareeLength: "",
        blousePieceLength: "",
        borderDetails: "",
        designPattern: "",
        washCareInstructions: "",
        additionalInformation: "",
      },
    }),
  });
  assert.equal(clearedDetails.status, 200, await clearedDetails.clone().text());
  assert.equal(state.product.metafields.some(({ key }) => key === "product_details"), false);
  assert.equal((await clearedDetails.json()).product.productDetails.fabricComposition, "");

  const invalidBlouse = await fetch(`${base}/shopify/admin/products/${encodeURIComponent(productId)}`, {
    method: "PATCH",
    headers: adminHeaders,
    body: JSON.stringify({ blouseAvailability: "maybe" }),
  });
  assert.equal(invalidBlouse.status, 400);
  assert.equal(state.product.metafields.find(({ key }) => key === "blouse_availability")?.value, "not_included");

  const catalogAfterAssignment = await fetch(`${base}/shopify/products`);
  const assigned = await catalogAfterAssignment.json();
  assert.deepEqual(assigned.products[0].collections.map(({ handle }) => handle), ["the-crafts-edit"]);
  assert.equal(assigned.products[0].collections[0].description, "");
  assert.equal(assigned.products[0].attributes.fabric, "Cotton");
});

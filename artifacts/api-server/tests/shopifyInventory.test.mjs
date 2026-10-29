import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { build } from "esbuild";
import express from "express";

const compiled = await build({
  entryPoints: [new URL("../src/routes/shopifyAdmin.ts", import.meta.url).pathname],
  bundle: true, write: false, format: "cjs", platform: "node", external: ["express"],
  plugins: [{
    name: "inventory-boundaries",
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

test("inventory watch pages every variant and location, retaining tracked zero separately from inactive and untracked", async (t) => {
  const calls = [];
  const module = { exports: {} };
  new Function("require", "module", "exports", "sdkProxy", compiled.outputFiles[0].text)(
    createRequire(import.meta.url), module, module.exports,
    async (connector, path, request) => {
      assert.equal(connector, "shopify-store");
      assert.match(path, /\/admin\/api\/2026-04\/graphql.json/);
      const { query, variables } = JSON.parse(request.body);
      calls.push({ query, variables });
      if (query.includes("MerchantInventoryWatch")) {
        if (variables.after === "variant-page") {
          return Response.json({ data: { productVariants: {
            nodes: [
              { id: "gid://shopify/ProductVariant/2", title: "Green", inventoryPolicy: "DENY", product: { id: "gid://shopify/Product/1", title: "Saree", status: "ACTIVE" }, inventoryItem: { id: "gid://shopify/InventoryItem/2", tracked: false, inventoryLevels: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } } },
              { id: "gid://shopify/ProductVariant/3", title: "Gold", inventoryPolicy: "DENY", product: { id: "gid://shopify/Product/1", title: "Saree", status: "ACTIVE" }, inventoryItem: { id: "gid://shopify/InventoryItem/3", tracked: true, inventoryLevels: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } } },
            ],
            pageInfo: { hasNextPage: false, endCursor: null },
          } } });
        }
        return Response.json({ data: { productVariants: {
          nodes: [
            { id: "gid://shopify/ProductVariant/1", title: "Red", inventoryPolicy: "CONTINUE", product: { id: "gid://shopify/Product/1", title: "Saree", status: "ACTIVE" }, inventoryItem: { id: "gid://shopify/InventoryItem/1", tracked: true, inventoryLevels: {
              nodes: [{ location: { id: "gid://shopify/Location/1", name: "Chennai", isActive: true }, quantities: [{ name: "available", quantity: 0 }] }],
              pageInfo: { hasNextPage: true, endCursor: "location-page" },
            } } },
          ],
          pageInfo: { hasNextPage: true, endCursor: "variant-page" },
        } } });
      }
      if (query.includes("MerchantInventoryLocationPage")) {
        assert.equal(variables.id, "gid://shopify/InventoryItem/1");
        return Response.json({ data: { inventoryItem: { inventoryLevels: {
          nodes: [{ location: { id: "gid://shopify/Location/2", name: "Old store", isActive: false }, quantities: [{ name: "available", quantity: 8 }] }],
          pageInfo: { hasNextPage: false, endCursor: null },
        } } } });
      }
      throw new Error(`Unexpected Shopify operation: ${query}`);
    },
  );
  const app = express();
  app.use((req, _res, next) => { req.log = { error() {} }; next(); });
  app.use("/api", module.exports.default);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => server.close());

  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/shopify/admin/inventory`, {
    headers: { "x-test-admin": "yes" },
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(Number.isNaN(Date.parse(body.refreshedAt)), false);
  assert.deepEqual(body.variants.map(({ tracked, inventoryPolicy, locations }) => ({ tracked, inventoryPolicy, locations })), [
    { tracked: true, inventoryPolicy: "CONTINUE", locations: [
      { locationId: "gid://shopify/Location/1", locationName: "Chennai", active: true, available: 0 },
      { locationId: "gid://shopify/Location/2", locationName: "Old store", active: false, available: 8 },
    ] },
    { tracked: false, inventoryPolicy: "DENY", locations: [] },
    { tracked: true, inventoryPolicy: "DENY", locations: [] },
  ]);
  assert.equal(calls.length, 3);
  assert.ok(calls.every(({ query }) => !query.includes("mutation")));
});

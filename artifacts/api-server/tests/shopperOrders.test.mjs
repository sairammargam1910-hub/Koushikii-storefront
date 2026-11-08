import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { build } from "esbuild";
import express from "express";

const compiled = await build({
  entryPoints: [new URL("../src/routes/shopperOrders.ts", import.meta.url).pathname],
  bundle: true,
  write: false,
  format: "cjs",
  platform: "node",
  external: ["express"],
  plugins: [{
    name: "shopper-orders-route-fixtures",
    setup(builder) {
      const stubs = {
        clerk: `
          const state = globalThis.__shopperOrdersTest;
          export const getAuth = (req) => ({ userId: req.get("x-test-user") || null });
          export const clerkClient = {
            users: { getUser: async () => state.user },
          };
        `,
        db: `
          const columns = (names) => Object.fromEntries(names.map((name) => [name, { key: name }]));
          export const cashfreeCheckoutOrdersTable = columns(["id","shopifyOrderId"]);
          export const checkoutShipmentPackagesTable = columns(["id","checkoutOrderId"]);
          export const db = {
            select() {
              const query = {
                from() { return this; },
                where() { return this; },
                limit() { return Promise.resolve([]); },
                then(resolve, reject) { return Promise.resolve([]).then(resolve, reject); },
              };
              return query;
            },
            update() {
              const query = {
                set() { return this; },
                where() { return this; },
                then(resolve, reject) { return Promise.resolve([]).then(resolve, reject); },
              };
              return query;
            },
          };
        `,
        drizzle: `
          export const eq = (column, value) => ({ column, value });
        `,
        apiZod: `
          const pass = { safeParse: (data) => ({ success: true, data }), parse: (data) => data };
          export const GetShopifyOrdersQueryParams = pass;
          export const GetShopifyOrdersResponse = pass;
          export const GetShopifyOrderDetailsParams = pass;
          export const GetShopifyOrderDetailsResponse = pass;
          export const GetShopifyOrderTrackingParams = pass;
          export const GetShopifyOrderTrackingResponse = pass;
        `,
        shopifyAdmin: `
          const state = globalThis.__shopperOrdersTest;
          export async function shopifyAdminRequest(query, variables) {
            state.adminCalls.push({ query, variables });
            if (query.includes("ShopperShopifyOrders")) {
              return {
                orders: {
                  nodes: state.orders,
                  pageInfo: { hasNextPage: false, endCursor: null },
                },
              };
            }
            if (query.includes("ShopperShopifyOrder")) {
              return { node: state.orders.find((order) => order.id === variables.id) ?? null };
            }
            throw new Error("Unexpected Shopify request.");
          }
        `,
        shiprocket: `export const getShiprocketTracking = async () => { throw new Error("Not used in these tests."); };`,
        logger: `
          export const logger = {
            error() {},
            warn() {},
          };
        `,
      };
      const routes = [
        [/@clerk\/express$/, "clerk"],
        [/@workspace\/db$/, "db"],
        [/drizzle-orm$/, "drizzle"],
        [/@workspace\/api-zod$/, "apiZod"],
        [/shopifyAdminClient$/, "shopifyAdmin"],
        [/shiprocketClient$/, "shiprocket"],
        [/logger$/, "logger"],
      ];
      for (const [filter, key] of routes) {
        builder.onResolve({ filter }, () => ({ path: key, namespace: "shopper-orders-test" }));
      }
      builder.onLoad({ filter: /.*/, namespace: "shopper-orders-test" }, ({ path }) => ({
        contents: stubs[path],
        loader: "js",
      }));
    },
  }],
});

function order(id, email) {
  return {
    id,
    name: "#1001",
    email,
    customer: null,
    createdAt: "2026-11-08T10:00:00.000Z",
    processedAt: "2026-11-08T10:01:00.000Z",
    displayFinancialStatus: "PAID",
    displayFulfillmentStatus: "UNFULFILLED",
    totalPriceSet: { shopMoney: { amount: "120.00", currencyCode: "INR" } },
    currentTotalPriceSet: { shopMoney: { amount: "120.00", currencyCode: "INR" } },
    lineItems: {
      nodes: [{
        id: "gid://shopify/LineItem/55",
        title: "Handwoven saree",
        variantTitle: "Maroon",
        sku: "SAREE-55",
        quantity: 1,
        originalUnitPriceSet: { shopMoney: { amount: "120.00", currencyCode: "INR" } },
        discountedTotalSet: { shopMoney: { amount: "120.00", currencyCode: "INR" } },
        image: { url: "https://cdn.shopify.com/saree.jpg", altText: "Maroon saree" },
      }],
    },
    fulfillments: { nodes: [] },
  };
}

function loadRouter(state) {
  globalThis.__shopperOrdersTest = state;
  const module = { exports: {} };
  new Function("require", "module", "exports", compiled.outputFiles[0].text)(
    createRequire(import.meta.url),
    module,
    module.exports,
  );
  return module.exports.default;
}

async function withServer(state, callback) {
  const app = express();
  app.use(loadRouter(state));
  const server = app.listen(0);
  try {
    await new Promise((resolve) => server.once("listening", resolve));
    const address = server.address();
    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
    delete globalThis.__shopperOrdersTest;
  }
}

function stateFixture() {
  return {
    user: {
      emailAddresses: [
        { emailAddress: "buyer@example.com", verification: { status: "verified" } },
        { emailAddress: "unverified@example.com", verification: { status: "unverified" } },
      ],
    },
    orders: [
      order("gid://shopify/Order/1001", "buyer@example.com"),
      order("gid://shopify/Order/1002", "someone-else@example.com"),
    ],
    adminCalls: [],
  };
}

test("order history requires sign-in and returns only orders matching verified emails", async () => {
  const state = stateFixture();
  await withServer(state, async (base) => {
    const signedOut = await fetch(`${base}/shopify/orders`);
    assert.equal(signedOut.status, 401);
    assert.equal(state.adminCalls.length, 0);

    const response = await fetch(`${base}/shopify/orders`, {
      headers: { "x-test-user": "shopper-1" },
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body.orders.map((entry) => entry.name), ["#1001"]);
    assert.equal(body.orders[0].financialStatus, "PAID");
    assert.equal(body.orders[0].lineItems[0].quantity, 1);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.match(state.adminCalls[0].variables.query, /buyer@example\.com/);
    assert.doesNotMatch(state.adminCalls[0].variables.query, /unverified@example\.com/);
  });
});

test("an order detail is hidden when its email does not match the signed-in shopper", async () => {
  const state = stateFixture();
  const otherOrderRef = Buffer.from("gid://shopify/Order/1002").toString("base64url");
  await withServer(state, async (base) => {
    const response = await fetch(`${base}/shopify/orders/${otherOrderRef}`, {
      headers: { "x-test-user": "shopper-1" },
    });
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: "This order could not be found." });
  });
});

test("order detail response omits the shopper email and preserves Shopify order facts", async () => {
  const state = stateFixture();
  const ownOrderRef = Buffer.from("gid://shopify/Order/1001").toString("base64url");
  await withServer(state, async (base) => {
    const response = await fetch(`${base}/shopify/orders/${ownOrderRef}`, {
      headers: { "x-test-user": "shopper-1" },
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.order.name, "#1001");
    assert.equal(body.order.currencyCode, "INR");
    assert.equal(body.order.lineItems[0].image.url, "https://cdn.shopify.com/saree.jpg");
    assert.equal("email" in body.order, false);
  });
});

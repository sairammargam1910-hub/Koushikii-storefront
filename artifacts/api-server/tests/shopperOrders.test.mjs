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
          const state = globalThis.__shopperOrdersTest;
          const columns = (names) => Object.fromEntries(names.map((name) => [name, { key: name }]));
          export const cashfreeCheckoutOrdersTable = columns(["id","shopifyOrderId"]);
          export const checkoutShipmentPackagesTable = columns(["id","checkoutOrderId","shiprocketOrderId","shiprocketShipmentId","awbCode","courierName","trackingStatus","trackingEvents","trackingUrl","estimatedDeliveryAt","trackingUpdatedAt","lastError","updatedAt"]);
          const rowsFor = (table, condition) => {
            if (table !== checkoutShipmentPackagesTable || !condition) return [];
            if (condition.column.key === "awbCode") return state.shipments.filter((row) => row.awbCode === condition.value);
            if (condition.column.key === "shiprocketShipmentId") return state.shipments.filter((row) => row.shiprocketShipmentId === condition.value);
            if (condition.column.key === "shiprocketOrderId") return state.shipments.filter((row) => row.shiprocketOrderId === condition.value);
            if (condition.column.key === "id") return state.shipments.filter((row) => row.id === condition.value);
            return [];
          };
          const select = () => {
            const query = {
              table: null,
              condition: null,
              count: Infinity,
              from(table) { this.table = table; return this; },
              where(condition) { this.condition = condition; return this; },
              limit(count) { this.count = count; return this; },
              for() { return this; },
              then(resolve, reject) {
                return Promise.resolve(rowsFor(this.table, this.condition).slice(0, this.count)).then(resolve, reject);
              },
            };
            return query;
          };
          const update = (table) => {
            const query = {
              values: null,
              condition: null,
              set(values) { this.values = values; return this; },
              where(condition) { this.condition = condition; return this; },
              then(resolve, reject) {
                if (table === checkoutShipmentPackagesTable && this.condition?.column.key === "id") {
                  const row = state.shipments.find((entry) => entry.id === this.condition.value);
                  if (row) Object.assign(row, this.values);
                }
                return Promise.resolve([]).then(resolve, reject);
              },
            };
            return query;
          };
          export const db = {
            select,
            update,
            transaction: async (callback) => callback({ select, update }),
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
        shiprocket: `
          const state = globalThis.__shopperOrdersTest;
          export async function getShiprocketTracking(awbCode) {
            state.trackingCalls.push(awbCode);
            if (state.trackingError) throw state.trackingError;
            return state.trackingResults?.length ? state.trackingResults.shift() : state.trackingResult;
          }
          export function mergeShiprocketTrackingSnapshot(current, incoming) {
            const events = new Map();
            for (const event of [...current.events, ...incoming.events]) {
              const key = [event.occurredAt ?? "", event.status, event.description, event.location ?? ""].join("|");
              if (!events.has(key)) events.set(key, event);
            }
            const mergedEvents = [...events.values()].sort((a, b) => (a.occurredAt ?? "").localeCompare(b.occurredAt ?? ""));
            const currentTime = Math.max(...current.events.map((event) => Date.parse(event.occurredAt ?? "")).filter(Number.isFinite), -Infinity);
            const incomingTime = Math.max(...incoming.events.map((event) => Date.parse(event.occurredAt ?? "")).filter(Number.isFinite), -Infinity);
            return {
              ...incoming,
              status: currentTime !== -Infinity && (incomingTime === -Infinity || incomingTime < currentTime) && current.status
                ? current.status
                : incoming.status,
              events: mergedEvents,
            };
          }
          export function parseShiprocketTrackingWebhook(payload) {
            const data = payload.tracking_data ?? payload.data ?? payload;
            const activities = data.shipment_track_activities ?? data.tracking_activity ?? data.activities ?? data.activity ?? [];
            const events = (Array.isArray(activities) ? activities : [activities]).flatMap((event) => {
              if (!event || typeof event !== "object") return [];
              const description = event.activity ?? event.description ?? event.status;
              if (!description) return [];
              return [{
                occurredAt: event.date ?? event.timestamp ?? null,
                status: event["sr-status-label"] ?? event.status ?? data.current_status ?? String(description),
                description: String(description),
                location: event.location ?? null,
                statusCode: data.shipment_status_id ?? data.status_id ?? data.status_code ??
                  event["sr-status"] ?? event.status_id ?? null,
              }];
            });
            const awbCode = data.awb ?? data.awb_code ?? data.shipment_track?.[0]?.awb_code ?? null;
            const shipmentId = data.shipment_id ?? data.shipmentId ?? null;
            const orderId = data.order_id ?? data.orderId ?? null;
            const statusCode = data.shipment_status_id ?? data.status_id ?? data.status_code ?? null;
            const status = data.current_status ?? data.status ?? events.at(-1)?.status ??
              (statusCode ? "Shipment status " + statusCode : "Tracking update unavailable");
            if (data.current_status && !events.some((event) => event.status === data.current_status)) {
              events.push({
                occurredAt: data.status_date ?? null,
                status: data.current_status,
                description: data.current_status,
                location: data.location ?? null,
                statusCode,
              });
            }
            return {
              awbCode,
              shipmentId,
              orderId,
              tracking: {
                status,
                statusCode: statusCode == null ? null : String(statusCode),
                awbCode: awbCode == null ? "" : String(awbCode),
                courierName: data.courier_name ?? data.courier_company_name ?? null,
                trackingUrl: data.track_url ?? null,
                estimatedDeliveryAt: null,
                events,
              },
            };
          }
        `,
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
    fulfillments: [],
  };
}

function shipment(overrides = {}) {
  return {
    id: "shipment-package-1",
    checkoutOrderId: "checkout-1",
    shiprocketOrderId: "shiprocket-order-1",
    shiprocketShipmentId: "shiprocket-shipment-1",
    awbCode: "19041424751540",
    courierName: "Delhivery Surface",
    trackingUrl: "https://shiprocket.co/tracking/19041424751540",
    trackingStatus: "Out for Delivery",
    trackingEvents: [{
      occurredAt: "2026-11-08T12:00:00.000Z",
      status: "Out for Delivery",
      description: "Shipment out for delivery",
      location: "Hyderabad",
    }],
    estimatedDeliveryAt: null,
    trackingUpdatedAt: null,
    updatedAt: new Date("2026-11-08T12:00:00.000Z"),
    ...overrides,
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
  app.use(express.json());
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
    shipments: [],
    trackingCalls: [],
    trackingResults: [],
    trackingResult: {
      status: "In Transit",
      statusCode: "5",
      awbCode: "19041424751540",
      courierName: "Delhivery Surface",
      trackingUrl: "https://shiprocket.co/tracking/19041424751540",
      estimatedDeliveryAt: null,
      events: [],
    },
  };
}

async function withWebhookSecret(secret, callback) {
  const previous = process.env.SHIPROCKET_WEBHOOK_SECRET;
  if (secret === null) delete process.env.SHIPROCKET_WEBHOOK_SECRET;
  else process.env.SHIPROCKET_WEBHOOK_SECRET = secret;
  try {
    await callback();
  } finally {
    if (previous === undefined) delete process.env.SHIPROCKET_WEBHOOK_SECRET;
    else process.env.SHIPROCKET_WEBHOOK_SECRET = previous;
  }
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
    assert.doesNotMatch(state.adminCalls[0].query, /customer\s*\{\s*email\s*\}/);
  });
});

test("order history does not use customer email to expose an order", async () => {
  const state = stateFixture();
  const customerOnlyOrder = order("gid://shopify/Order/1003", "");
  customerOnlyOrder.customer = { email: "buyer@example.com" };
  state.orders = [customerOnlyOrder];
  await withServer(state, async (base) => {
    const response = await fetch(`${base}/shopify/orders`, {
      headers: { "x-test-user": "shopper-1" },
    });
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).orders, []);
    assert.doesNotMatch(state.adminCalls[0].query, /customer\s*\{\s*email\s*\}/);
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
    assert.deepEqual(body.order.fulfillments, []);
    assert.equal("email" in body.order, false);
    assert.match(state.adminCalls[0].query, /fulfillments\s*\{\s*status/);
    assert.doesNotMatch(state.adminCalls[0].query, /fulfillments\s*\(\s*first\s*:/);
    assert.doesNotMatch(state.adminCalls[0].query, /fulfillments\s*\{\s*nodes/);
  });
});

test("tracking returns no shipments for a sandbox order before a shipment is booked", async () => {
  const state = stateFixture();
  const ownOrderRef = Buffer.from("gid://shopify/Order/1001").toString("base64url");
  await withServer(state, async (base) => {
    const response = await fetch(`${base}/shopify/orders/${ownOrderRef}/tracking`, {
      headers: { "x-test-user": "shopper-1" },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { orderRef: ownOrderRef, shipments: [] });
    assert.match(state.adminCalls[0].query, /fulfillments\s*\{\s*status/);
  });
});

test("delivery tracking callback rejects missing or invalid x-api-key values", async () => {
  const state = stateFixture();
  state.shipments = [shipment()];
  await withWebhookSecret("local-test-token", () => withServer(state, async (base) => {
    for (const headers of [
      { "content-type": "application/json" },
      { "content-type": "application/json", "x-api-key": "wrong-token" },
    ]) {
      const response = await fetch(`${base}/events/delivery`, {
        method: "POST",
        headers,
        body: JSON.stringify({ awb: "19041424751540" }),
      });
      assert.equal(response.status, 401);
    }
    assert.deepEqual(state.trackingCalls, []);
    assert.equal(state.shipments[0].trackingStatus, "Out for Delivery");
  }));
});

test("delivery tracking callback fails closed when its secret is not configured", async () => {
  const state = stateFixture();
  state.shipments = [shipment()];
  await withWebhookSecret(null, () => withServer(state, async (base) => {
    const response = await fetch(`${base}/events/delivery`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": "local-test-token",
      },
      body: JSON.stringify({ awb: "19041424751540" }),
    });
    assert.equal(response.status, 503);
    assert.deepEqual(state.trackingCalls, []);
    assert.equal(state.shipments[0].trackingStatus, "Out for Delivery");
  }));
});

test("delivery callback parses and idempotently stores tracking details from Shiprocket payloads", async () => {
  const state = stateFixture();
  state.shipments = [
    shipment({ trackingStatus: "Shipment booked", trackingEvents: [] }),
    shipment({
      id: "shipment-package-2",
      shiprocketOrderId: "shiprocket-order-2",
      shiprocketShipmentId: "shiprocket-shipment-2",
      awbCode: "99998888777766",
      trackingStatus: "Shipment booked",
      trackingEvents: [],
    }),
  ];
  const payload = {
    awb: "19041424751540",
    order_id: "shiprocket-order-1",
    shipment_id: "shiprocket-shipment-1",
    courier_name: "Delhivery Surface",
    current_status: "In Transit",
    status_id: "5",
    shipment_track_activities: [{
      activity: "Arrived at the regional hub",
      date: "2026-11-09 10:00:00",
      location: "Vijayawada",
      "sr-status-label": "In Transit",
      "sr-status": "IT",
    }],
  };

  await withWebhookSecret("local-test-token", () => withServer(state, async (base) => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await fetch(`${base}/events/delivery`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": "local-test-token",
        },
        body: JSON.stringify(payload),
      });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { received: true, matched: true });
    }

    assert.deepEqual(state.trackingCalls, []);
    assert.equal(state.shipments[0].trackingStatus, "In Transit");
    assert.equal(state.shipments[0].courierName, "Delhivery Surface");
    assert.deepEqual(state.shipments[0].trackingEvents.map((event) => event.description), [
      "Arrived at the regional hub",
    ]);
    assert.equal(state.shipments[0].trackingEvents[0].statusCode, "5");
    assert.equal(state.shipments[0].trackingUpdatedAt instanceof Date, true);
    assert.equal(state.shipments[1].trackingStatus, "Shipment booked");
    assert.deepEqual(state.shipments[1].trackingEvents, []);
  }));
});

test("delivery callback matches a shipment by reference when the AWB is omitted", async () => {
  const state = stateFixture();
  state.shipments = [shipment({ trackingStatus: "Shipment booked", trackingEvents: [] })];
  await withWebhookSecret("local-test-token", () => withServer(state, async (base) => {
    const response = await fetch(`${base}/events/delivery`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": "local-test-token",
      },
      body: JSON.stringify({
        shipment_id: "shiprocket-shipment-1",
        current_status: "Delivered",
        status_id: "7",
        activity: {
          activity: "Delivered to recipient",
          date: "2026-11-09 11:30:00",
          location: "Hyderabad",
        },
      }),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { received: true, matched: true });
    assert.equal(state.shipments[0].trackingStatus, "Delivered");
    assert.deepEqual(state.shipments[0].trackingEvents.map((event) => event.description), [
      "Delivered to recipient",
    ]);
    assert.deepEqual(state.trackingCalls, []);
  }));
});

test("delivery callback rejects authenticated payloads without a valid shipment reference", async () => {
  const state = stateFixture();
  await withWebhookSecret("local-test-token", () => withServer(state, async (base) => {
    const response = await fetch(`${base}/events/delivery`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": "local-test-token",
      },
      body: JSON.stringify({ current_status: "Delivered" }),
    });
    assert.equal(response.status, 400);
  }));
});

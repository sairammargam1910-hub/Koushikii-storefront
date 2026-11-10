import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { build } from "esbuild";
import express from "express";

const routePath = new URL("../src/routes/cashfreeCheckout.ts", import.meta.url).pathname;
const compiled = await build({
  entryPoints: [routePath],
  bundle: true,
  write: false,
  format: "cjs",
  platform: "node",
  external: ["express"],
  plugins: [{
    name: "cashfree-checkout-route-fixtures",
    setup(builder) {
      const stubs = {
        db: `
          const state = globalThis.__checkoutRouteTest;
          const columns = (names) => Object.fromEntries(names.map((name) => [name, { key: name }]));
          export const cashfreeCheckoutOrdersTable = columns(["id","cashfreeOrderId","status","paymentStatus","quoteHash","cartId","purchasedCartLines","cartCleanupStatus","destinationCountryCode","currencyCode","itemSubtotal","discountAmount","shippingAmount","taxAmount","totalAmount","quoteExpiresAt","checkoutSnapshot","paymentSessionId","paymentReference","paidAt","shopifyOrderId","shopifyOrderName","lastError","createdAt","updatedAt"]);
          export const checkoutShipmentPackagesTable = columns(["id","checkoutOrderId","packageIndex","shiprocketOrderId","shiprocketShipmentId","courierId","courierName","quotedAmount","status","awbCode","trackingUrl","trackingStatus","trackingEvents","estimatedDeliveryAt","trackingUpdatedAt","lastError","createdAt","updatedAt"]);
          function tableRows(table) { return table === cashfreeCheckoutOrdersTable ? state.orders : state.shipments; }
          function matches(expression, row) {
            if (!expression) return true;
            if (expression.op === "and") return expression.items.every((item) => matches(item, row));
            if (expression.op === "or") return expression.items.some((item) => matches(item, row));
            const actual = row[expression.column.key];
            if (expression.op === "eq") return actual === expression.value;
            if (expression.op === "lt") return new Date(actual).getTime() < new Date(expression.value).getTime();
            if (expression.op === "gt") return new Date(actual).getTime() > new Date(expression.value).getTime();
            return false;
          }
          export const db = {
            select() {
              let table, condition, max = Infinity;
              const query = {
                from(value) { table = value; return this; },
                where(value) { condition = value; return this; },
                orderBy() { return this; },
                limit(value) { max = value; return Promise.resolve(tableRows(table).filter((row) => matches(condition, row)).slice(0, max)); },
                for() { return this; },
                then(resolve, reject) { return Promise.resolve(tableRows(table).filter((row) => matches(condition, row)).slice(0, max)).then(resolve, reject); },
              };
              return query;
            },
            update(table) {
              let values, condition;
              const run = () => {
                const changed = tableRows(table).filter((row) => matches(condition, row));
                for (const row of changed) Object.assign(row, values);
                return changed;
              };
              const query = {
                set(value) { values = value; return this; },
                where(value) { condition = value; return this; },
                returning() { return Promise.resolve(run()); },
                then(resolve, reject) { return Promise.resolve(run()).then(resolve, reject); },
              };
              return query;
            },
            insert(table) {
              let values;
              const query = {
                values(value) { values = value; return this; },
                returning() {
                  const rows = Array.isArray(values) ? values : [values];
                  tableRows(table).push(...rows);
                  return Promise.resolve(rows);
                },
                then(resolve, reject) {
                  const rows = Array.isArray(values) ? values : [values];
                  tableRows(table).push(...rows);
                  return Promise.resolve(rows).then(resolve, reject);
                },
              };
              return query;
            },
            async transaction(callback) { return callback(this); },
          };
        `,
        clerk: `
          const state = globalThis.__checkoutRouteTest;
          export const getAuth = (req) => {
            const requestedUser = req.get("x-test-user");
            return { userId: requestedUser === "anonymous" ? null : requestedUser || "shopper-1" };
          };
          export const clerkClient = {
            users: {
              getUser: async (userId) => ({
                emailAddresses: [{
                  emailAddress: userId === "shopper-2" ? "other@example.com" : "buyer@example.com",
                  verification: { status: "verified" },
                }],
              }),
            },
          };
        `,
        drizzle: `
          const expression = (op, column, value) => ({ op, column, value });
          export const eq = (column, value) => expression("eq", column, value);
          export const lt = (column, value) => expression("lt", column, value);
          export const gt = (column, value) => expression("gt", column, value);
          export const and = (...items) => ({ op: "and", items });
          export const or = (...items) => ({ op: "or", items });
          export const desc = () => ({});
        `,
        apiZod: `
          const schema = { safeParse: (data) => ({ success: true, data }), parse: (data) => data };
          export const CreateShopifyCheckoutPaymentSessionBody = schema;
          export const CreateShopifyCheckoutPaymentSessionResponse = schema;
          export const CreateShopifyCheckoutQuoteBody = schema;
          export const CreateShopifyCheckoutQuoteResponse = schema;
          export const GetShopifyCheckoutPaymentStatusQueryParams = schema;
          export const GetShopifyCheckoutPaymentStatusResponse = schema;
        `,
        cashfree: `
          const state = globalThis.__checkoutRouteTest;
          export class CashfreeError extends Error {
            constructor(message, details = {}) {
              super(message);
              Object.assign(this, details);
            }
          }
          export const assertCashfreeLiveReadiness = (currencyCode, isInternational) => {
            state.cashfreeReadinessCheck = { currencyCode, isInternational };
            if (state.cashfreeReadinessError) throw new CashfreeError(state.cashfreeReadinessError);
          };
          export const getCashfreeEnvironment = () => state.environment;
          export const createCashfreeOrder = async (input) => {
            state.cashfreeCreateInput = input;
            if (state.cashfreeCreateError) {
              throw new CashfreeError(state.cashfreeCreateError.message, state.cashfreeCreateError.details);
            }
            return { order_id: input.orderId, order_amount: Number(input.amount), order_currency: input.currencyCode, order_status: "ACTIVE", payment_session_id: "sandbox-session" };
          };
          export const getCashfreeOrder = async (orderId) => {
            state.cashfreeReads += 1;
            return state.remoteOrder ?? { order_id: orderId, order_amount: state.order.totalAmount, order_currency: state.order.currencyCode, order_status: state.providerStatus, cf_order_id: "cf-order-ref" };
          };
          export const getCashfreePaymentReference = async () => state.paymentReference;
          export const getCashfreePaymentOutcome = async () => state.paymentOutcome ?? null;
          export const verifyCashfreeWebhookSignature = () => state.signatureValid;
        `,
        pricing: `
          export const addMoney = (amounts) => amounts.reduce((sum, amount) => sum + Number(amount), 0).toFixed(2);
          export const checkoutCartFingerprint = () => "hash";
          export const getShopperQuoteHash = (shopperUserId, fingerprint) => shopperUserId + ":" + fingerprint;
          export const getCartDiscountAmount = () => "0.00";
          export const getCheckoutItemTotal = () => "100.00";
          export const minimalCartSnapshot = (cart) => cart;
          export const splitMoney = (amount, count) => Array(count).fill((Number(amount) / count).toFixed(2));
        `,
        shiprocket: `
          const state = globalThis.__checkoutRouteTest;
          export const getShiprocketModeForProductTags = (tags) =>
            tags?.some((tag) => tag.trim().toLowerCase() === "shiprocket-surface-only")
              ? "Surface"
              : undefined;
          export class ShiprocketError extends Error {
            constructor(message, diagnostics = {}) {
              super(message);
              this.diagnostics = diagnostics;
            }
          }
          export const bookShiprocketPackage = async (input) => {
            state.awbCalls += 1;
            state.awbInputs.push(input);
            if (state.awbErrorStatus) throw new ShiprocketError("test booking rejected", { httpStatus: state.awbErrorStatus });
            if (state.awbBodyRejected) throw new ShiprocketError("test booking rejected", {
              httpStatus: 200, bookingRejected: true,
              errorCode: "AWB_ASSIGNMENT_REJECTED", message: "Courier rejected assignment",
            });
            if (state.awbError) throw new Error("test ambiguous network failure");
            return { awbCode: "awb-test" };
          };
          export const getShiprocketShipmentDetails = async (shipmentId) => {
            state.shipmentDetailsCalls.push(shipmentId);
            if (state.shipmentDetailsError) throw new Error("test provider read failed");
            return state.shipmentDetails ?? { awbCode: null };
          };
          export const quoteShiprocketPackage = async (input) => {
            state.rateCalls += 1;
            state.quoteInputs.push(input);
            if (state.noSurfaceCourier && input.mode === "Surface") {
              throw new ShiprocketError(
                "Shiprocket has no serviceable Surface courier for this address. Verify Surface serviceability for the pickup and delivery postcodes; this product cannot fall back to Air.",
              );
            }
            return input.mode === "Surface"
              ? { courierId: "44", courierName: "Delhivery Surface 2 Kgs", amount: "20.00", currencyCode: "INR" }
              : { courierId: "10", courierName: "Economy", amount: "20.00", currencyCode: "INR" };
          };
          export const createShiprocketPackage = async (input) => {
            state.carrierCreateCalls.push(input);
            if (state.carrierCreateFailure) throw new ShiprocketError("test unavailable");
            return { orderId: "sr-paid-1", shipmentId: "sr-shipment-1" };
          };
          export const getConfiguredParcel = () => ({ weightKg: 1, lengthCm: 35, breadthCm: 25, heightCm: 8 });
        `,
        shopifyOrder: `
          const state = globalThis.__checkoutRouteTest;
          export class ShopifyCheckoutSyncError extends Error {}
          export const assertShopifyCheckoutCapabilities = async () => {};
          export const createOrFindShopifyPaidOrder = async (input) => {
            state.shopifySyncAttempts += 1;
            state.shopifySyncInput = input;
            if (state.shopifyFailures > 0) {
              state.shopifyFailures -= 1;
              throw new ShopifyCheckoutSyncError("temporary test failure");
            }
            return { id: "gid://shopify/Order/100", name: "#1001" };
          };
        `,
        shopifyRoute: `
          export class ShopifyCheckoutInputError extends Error {
            constructor(message, statusCode) { super(message); this.statusCode = statusCode; }
          }
          export const getAvailableCountries = async () => [{ isoCode: "IN", name: "India" }, { isoCode: "US", name: "United States" }];
          export const removePurchasedCartQuantities = async (input) => {
            globalThis.__checkoutRouteTest.cartCleanupCalls.push(input);
          };
          export const prepareShopifyCheckoutCart = async () => globalThis.__checkoutRouteTest.cart;
        `,
        storefrontClient: `export const getShopifyStorefrontDomain = async () => "gtnbsw-x3.myshopify.com";`,
        logger: `
          const state = globalThis.__checkoutRouteTest;
          export const logger = {
            error(fields, message) { state.logs.push({ level: "error", fields, message }); },
            warn(fields, message) { state.logs.push({ level: "warn", fields, message }); },
          };
        `,
      };
      const routes = [
        [/@workspace\/db$/, "db"],
        [/@clerk\/express$/, "clerk"],
        [/drizzle-orm$/, "drizzle"],
        [/@workspace\/api-zod$/, "apiZod"],
        [/cashfreeClient$/, "cashfree"],
        [/checkoutPricing$/, "pricing"],
        [/shiprocketClient$/, "shiprocket"],
        [/shopifyCheckoutOrder$/, "shopifyOrder"],
        [/^\.\/shopify$/, "shopifyRoute"],
        [/shopifyStorefrontClient$/, "storefrontClient"],
        [/logger$/, "logger"],
      ];
      for (const [filter, key] of routes) {
        builder.onResolve({ filter }, () => ({ path: key, namespace: "checkout-test" }));
      }
      builder.onLoad({ filter: /.*/, namespace: "checkout-test" }, ({ path }) => ({
        contents: stubs[path],
        loader: "js",
      }));
    },
  }],
});

function makeOrder(overrides = {}) {
  const cart = {
    id: "gid://shopify/Cart/1",
    totalQuantity: 1,
    cost: {
      subtotalAmount: { amount: "100.00", currencyCode: "INR" },
      totalAmount: { amount: "100.00", currencyCode: "INR" },
      totalTaxAmount: { amount: "0.00", currencyCode: "INR" },
    },
    lines: {
      nodes: [{
        id: "gid://shopify/CartLine/1",
        quantity: 1,
        cost: {
          subtotalAmount: { amount: "100.00", currencyCode: "INR" },
          totalAmount: { amount: "100.00", currencyCode: "INR" },
        },
        merchandise: {
          id: "gid://shopify/ProductVariant/1",
          title: "Default",
          sku: "TEST-1",
          availableForSale: true,
          product: { title: "Handwoven saree", description: "Silk saree", tags: ["saree"] },
        },
      }],
    },
  };
  return {
    id: "f991fda7-d46f-4113-a93a-64020aab037a",
    cashfreeOrderId: "chenetha_test-order",
    status: "payment_pending",
    paymentStatus: "pending",
    quoteHash: "shopper-1:hash",
    cartId: "gid://shopify/Cart/1",
    purchasedCartLines: [],
    cartCleanupStatus: "not_started",
    destinationCountryCode: "IN",
    currencyCode: "INR",
    itemSubtotal: "100.00",
    discountAmount: "0.00",
    shippingAmount: "20.00",
    taxAmount: "0.00",
    totalAmount: "120.00",
    quoteExpiresAt: new Date(Date.now() + 30 * 60_000),
    checkoutSnapshot: {
      shopperUserId: "shopper-1",
      email: "buyer@example.com",
      phone: "+919876543210",
      address: { recipient: "Asha Rao", street: "12 Example Road", city: "Hyderabad", pin: "500008", countryCode: "IN" },
      cart,
      providerPackages: [],
      courierName: "Economy",
      parcelCount: 1,
    },
    paymentSessionId: "session-test",
    paymentReference: null,
    paidAt: null,
    shopifyOrderId: null,
    shopifyOrderName: null,
    lastError: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

async function harness(run, options = {}) {
  const state = {
    environment: "sandbox",
    providerStatus: "PAID",
    paymentReference: options.paymentReference ?? "cf-payment-1",
    remoteOrder: options.remoteOrder ?? null,
    signatureValid: true,
    cashfreeReads: 0,
    cashfreeCreateInput: null,
    cashfreeCreateError: null,
    cashfreeReadinessCheck: null,
    cashfreeReadinessError: null,
    logs: [],
    shopifySyncAttempts: 0,
    shopifySyncInput: null,
    shopifyFailures: 0,
    cartCleanupCalls: [],
    rateCalls: 0,
    quoteInputs: [],
    noSurfaceCourier: false,
    carrierCreateCalls: [],
    awbCalls: 0,
    awbInputs: [],
    awbError: false,
    awbErrorStatus: null,
    awbBodyRejected: false,
    shipmentDetailsCalls: [],
    shipmentDetails: null,
    shipmentDetailsError: false,
    orders: [makeOrder(options.order)],
    shipments: [],
  };
  state.order = state.orders[0];
  state.cart = state.order.checkoutSnapshot.cart;
  globalThis.__checkoutRouteTest = state;
  const module = { exports: {} };
  new Function("require", "module", "exports", compiled.outputFiles[0].text)(
    createRequire(import.meta.url),
    module,
    module.exports,
  );
  const app = express();
  app.use("/api/cashfree/webhook", express.raw({ type: "application/json" }));
  app.use(express.json());
  app.use("/api", module.exports.default);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const getStatus = async (headers = {}) => {
    const response = await fetch(`${base}/shopify/checkout/payment-status?orderId=${encodeURIComponent(state.order.cashfreeOrderId)}`, {
      headers: { "x-test-user": "shopper-1", ...headers },
    });
    return { status: response.status, body: await response.json() };
  };
  const postSession = async (body, headers = {}) => {
    const response = await fetch(`${base}/shopify/checkout/payment-session`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-test-user": "shopper-1", ...headers },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  };
  const postQuote = async (body, headers = {}) => {
    const response = await fetch(`${base}/shopify/checkout/quote`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-test-user": "shopper-1", ...headers },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  };
  const sendWebhook = async (event) => {
    const response = await fetch(`${base}/cashfree/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-webhook-signature": "valid-test-signature",
        "x-webhook-timestamp": "1762516800",
      },
      body: JSON.stringify(event),
    });
    return { status: response.status, body: await response.json() };
  };
  try {
    await run({ state, getStatus, postQuote, postSession, sendWebhook });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    delete globalThis.__checkoutRouteTest;
  }
}

async function withLiveAwbBooking(callback) {
  const previous = process.env.SHIPROCKET_LIVE_BOOKING_ENABLED;
  process.env.SHIPROCKET_LIVE_BOOKING_ENABLED = "true";
  try {
    await callback();
  } finally {
    if (previous === undefined) delete process.env.SHIPROCKET_LIVE_BOOKING_ENABLED;
    else process.env.SHIPROCKET_LIVE_BOOKING_ENABLED = previous;
  }
}

test("checkout quote, payment session, and status require Clerk sign-in", async () => {
  await harness(async ({ state, getStatus, postQuote, postSession }) => {
    const quote = await postQuote({}, { "x-test-user": "anonymous" });
    const session = await postSession(
      { quoteId: state.order.id },
      { "x-test-user": "anonymous" },
    );
    const status = await getStatus({ "x-test-user": "anonymous" });

    assert.equal(quote.status, 401);
    assert.equal(session.status, 401);
    assert.equal(status.status, 401);
    assert.equal(state.cashfreeCreateInput, null);
    assert.equal(state.cashfreeReads, 0);
    assert.equal(state.shopifySyncAttempts, 0);
  });
});

test("a shopper cannot use another account's quote or payment status", async () => {
  await harness(async ({ state, getStatus, postSession }) => {
    const session = await postSession(
      { quoteId: state.order.id },
      { "x-test-user": "shopper-2", Origin: "https://preview.replit.dev" },
    );
    const status = await getStatus({ "x-test-user": "shopper-2" });

    assert.equal(session.status, 404);
    assert.equal(status.status, 404);
    assert.equal(state.cashfreeCreateInput, null);
    assert.equal(state.cashfreeReads, 0);
  });
});

test("legacy quote ownership is bound only to a matching verified account email", async () => {
  await harness(async ({ state, postSession }) => {
    delete state.order.checkoutSnapshot.shopperUserId;
    const result = await postSession(
      { quoteId: state.order.id },
      { Origin: "https://preview.replit.dev" },
    );

    assert.equal(result.status, 200);
    assert.equal(state.order.checkoutSnapshot.shopperUserId, "shopper-1");
  });
});

test("legacy quotes cannot be claimed with another account's email", async () => {
  await harness(async ({ state, postSession }) => {
    delete state.order.checkoutSnapshot.shopperUserId;
    const result = await postSession(
      { quoteId: state.order.id },
      { "x-test-user": "shopper-2", Origin: "https://preview.replit.dev" },
    );

    assert.equal(result.status, 404);
    assert.equal(state.cashfreeCreateInput, null);
  });
});

test("shipping quote performs rate lookup only and saves no carrier order IDs", async () => {
  await harness(async ({ state, postQuote, postSession }) => {
    state.order.quoteHash = "old-hash";
    const result = await postQuote({
      cartId: state.order.cartId,
      email: "buyer@example.com",
      phone: "+919876543210",
      deliveryAddress: {
        recipient: "Asha Rao",
        street: "12 Example Road",
        city: "Hyderabad",
        state: "Telangana",
        pin: "500008",
        countryCode: "IN",
      },
    });
    assert.equal(result.status, 200);
    assert.equal(state.rateCalls, 1);
    assert.equal(state.quoteInputs[0].mode, undefined);
    assert.equal(state.carrierCreateCalls.length, 0);
    assert.equal(state.awbCalls, 0);
    const createdQuote = state.orders.find((order) => order.id === result.body.quoteId);
    assert.ok(createdQuote.quoteExpiresAt.getTime() - Date.now() > 29 * 60_000);
    assert.equal(state.shipments.at(-1).shiprocketOrderId, undefined);
    assert.equal(state.shipments.at(-1).shiprocketShipmentId, undefined);
    const session = await postSession(
      { quoteId: result.body.quoteId },
      { Origin: "https://preview.replit.dev" },
    );
    assert.equal(session.status, 200);
    assert.equal(session.body.amount, "120.00");
  });
});

test("Surface-only Shopify tag saves and books the courier selected by the Surface quote", async () => {
  await withLiveAwbBooking(() => harness(async ({ state, postQuote, postSession, getStatus }) => {
    state.cart.lines.nodes[0].merchandise.product.tags.push("shiprocket-surface-only");
    state.order.quoteHash = "prior-untagged-quote";
    const quote = await postQuote({
      cartId: state.order.cartId,
      email: "buyer@example.com",
      phone: "+919876543210",
      deliveryAddress: {
        recipient: "Asha Rao",
        street: "12 Example Road",
        city: "Hyderabad",
        state: "Telangana",
        pin: "500008",
        countryCode: "IN",
      },
    });

    assert.equal(quote.status, 200);
    assert.equal(state.quoteInputs.at(-1).mode, "Surface");
    const savedPackage = state.shipments.at(-1);
    assert.equal(savedPackage.courierId, "44");
    assert.equal(savedPackage.courierName, "Delhivery Surface 2 Kgs");
    assert.equal(savedPackage.status, "quoted");

    state.order = state.orders.find((order) => order.id === quote.body.quoteId);
    state.environment = "production";
    const session = await postSession(
      { quoteId: quote.body.quoteId },
      { Origin: "https://preview.replit.dev" },
    );
    assert.equal(session.status, 200);
    const paidStatus = await getStatus();
    assert.equal(paidStatus.status, 200);
    assert.equal(state.carrierCreateCalls.length, 1);
    assert.equal(state.awbCalls, 1);
    assert.equal(state.awbInputs[0].courierId, "44");
    assert.equal(state.awbInputs[0].shipmentId, "sr-shipment-1");
    assert.equal(state.shipments.at(-1).courierId, "44");
  }), {
    order: {
      quoteHash: "existing-quote-hash",
    },
  });
});

test("Surface-only quote failure stays actionable and does not fall back to Air", async () => {
  await harness(async ({ state, postQuote }) => {
    state.cart.lines.nodes[0].merchandise.product.tags.push("shiprocket-surface-only");
    state.order.quoteHash = "prior-quote";
    state.noSurfaceCourier = true;

    const result = await postQuote({
      cartId: state.order.cartId,
      email: "buyer@example.com",
      phone: "+919876543210",
      deliveryAddress: {
        recipient: "Asha Rao",
        street: "12 Example Road",
        city: "Hyderabad",
        state: "Telangana",
        pin: "500008",
        countryCode: "IN",
      },
    });

    assert.equal(result.status, 409);
    assert.match(result.body.error, /Surface serviceability.*cannot fall back to Air/i);
    assert.equal(state.quoteInputs.at(-1).mode, "Surface");
    assert.equal(state.shipments.length, 0);
    assert.equal(state.carrierCreateCalls.length, 0);
    assert.equal(state.awbCalls, 0);
  });
});

test("duplicate Cashfree success notifications create only one Shopify order", async () => {
  await harness(async ({ state, sendWebhook, getStatus }) => {
    const event = {
      type: "PAYMENT_SUCCESS_WEBHOOK",
      data: { order: { order_id: state.order.cashfreeOrderId }, payment: { cf_payment_id: "cf-payment-1" } },
    };
    assert.equal((await sendWebhook(event)).status, 200);
    assert.equal((await sendWebhook(event)).status, 200);
    assert.equal(state.shopifySyncAttempts, 1);
    assert.equal(state.order.status, "shopify_synced");
    assert.equal(state.order.paymentStatus, "paid");
    assert.equal(state.order.cartCleanupStatus, "completed");
    assert.deepEqual(state.order.purchasedCartLines, [{
      id: "gid://shopify/CartLine/1",
      quantity: 1,
    }]);
    assert.equal(state.cartCleanupCalls.length, 1);
    assert.equal(state.order.shopifyOrderName, "#1001");
    assert.deepEqual(state.order.checkoutSnapshot, { shopperUserId: "shopper-1" });
    const status = await getStatus();
    assert.equal(status.status, 200);
    assert.equal(status.body.status, "shopify_synced");
  });
});

test("a paid international-destination sandbox checkout matches the quote and syncs its payment reference", async () => {
  await harness(async ({ state, getStatus }) => {
    const result = await getStatus();
    assert.equal(result.status, 200);
    assert.equal(result.body.status, "shopify_synced");
    assert.equal(state.cashfreeReads, 1);
    assert.equal(state.shopifySyncAttempts, 1);
    assert.equal(state.order.paymentReference, "cf-intl-payment-42");
    assert.equal(state.shopifySyncInput.paymentReference, "cf-intl-payment-42");
    assert.equal(state.shopifySyncInput.snapshot.totalAmount, "120.00");
    assert.equal(state.shopifySyncInput.snapshot.shippingCurrencyCode, "INR");
    assert.equal(state.shopifySyncInput.snapshot.cart.cost.totalAmount.amount, "100.00");
    assert.equal(state.shopifySyncInput.snapshot.cart.cost.totalAmount.currencyCode, "INR");
  }, {
    order: {
      status: "payment_pending",
      destinationCountryCode: "US",
      currencyCode: "INR",
      checkoutSnapshot: {
        ...makeOrder().checkoutSnapshot,
        address: {
          ...makeOrder().checkoutSnapshot.address,
          countryCode: "US",
        },
      },
    },
    remoteOrder: {
      order_id: "chenetha_test-order",
      order_amount: 120,
      order_currency: "INR",
      order_status: "PAID",
      cf_order_id: "cf-order-reference",
    },
    paymentReference: "cf-intl-payment-42",
  });
});

test("a paid Cashfree order with a different amount or currency is not synced to Shopify", async (t) => {
  for (const [label, remoteOrder] of [
    ["amount", {
      order_id: "chenetha_test-order",
      order_amount: 121,
      order_currency: "INR",
      order_status: "PAID",
    }],
    ["currency", {
      order_id: "chenetha_test-order",
      order_amount: 120,
      order_currency: "USD",
      order_status: "PAID",
    }],
  ]) {
    await t.test(`rejects a mismatched ${label}`, async () => {
      await harness(async ({ state, getStatus }) => {
        const result = await getStatus();
        assert.equal(result.body.status, "reconciliation_required");
        assert.match(state.order.lastError, /amount or currency does not match/i);
        assert.equal(state.shopifySyncAttempts, 0);
      }, { remoteOrder });
    });
  }
});

test("an expired or failed Cashfree payment never creates a paid Shopify order", async () => {
  await harness(async ({ state, getStatus }) => {
    state.providerStatus = "EXPIRED";
    const result = await getStatus();
    assert.equal(result.status, 200);
    assert.equal(result.body.status, "payment_failed");
    assert.equal(result.body.paymentStatus, "FAILED");
    assert.equal(state.shopifySyncAttempts, 0);
    assert.equal(state.carrierCreateCalls.length, 0);
    assert.equal(state.awbCalls, 0);
  });
});

test("failed and pending payment attempts never create Shiprocket orders or AWBs", async () => {
  for (const [orderStatus, paymentOutcome, expectedStatus] of [
    ["ACTIVE", "USER_DROPPED", "payment_failed"],
    ["ACTIVE", "PENDING", "payment_pending"],
  ]) {
    await harness(async ({ state, getStatus }) => {
      state.environment = "production";
      state.providerStatus = orderStatus;
      state.paymentOutcome = paymentOutcome;
      state.shipments = [{
        id: "package-before-payment",
        checkoutOrderId: state.order.id,
        packageIndex: 0,
        shiprocketOrderId: null,
        shiprocketShipmentId: null,
        courierId: "10",
        courierName: "Economy",
        quotedAmount: "20.00",
        status: "quoted",
        updatedAt: new Date(),
      }];
      const result = await getStatus();
      assert.equal(result.body.status, expectedStatus);
      assert.equal(state.shopifySyncAttempts, 0);
      assert.equal(state.carrierCreateCalls.length, 0);
      assert.equal(state.awbCalls, 0);
    });
  }
});

test("verified payment creates exactly one Shiprocket order; AWB stays gated", async () => {
  await harness(async ({ state, getStatus }) => {
    state.environment = "production";
    state.providerStatus = "PAID";
    state.shipments = [{
      id: "paid-package",
      checkoutOrderId: state.order.id,
      packageIndex: 0,
      shiprocketOrderId: null,
      shiprocketShipmentId: null,
      courierId: "10",
      courierName: "Economy",
      quotedAmount: "20.00",
      status: "quoted",
      updatedAt: new Date(),
    }];
    const result = await getStatus();
    assert.equal(result.body.paymentStatus, "PAID");
    assert.equal(state.shopifySyncAttempts, 1);
    assert.equal(state.carrierCreateCalls.length, 1);
    assert.equal(state.shipments[0].shiprocketOrderId, "sr-paid-1");
    assert.equal(state.shipments[0].shiprocketShipmentId, "sr-shipment-1");
    assert.equal(state.awbCalls, 0);
    assert.equal(state.order.status, "shipment_booking_pending");
    assert.deepEqual(state.order.checkoutSnapshot, { shopperUserId: "shopper-1" });
    await getStatus();
    assert.equal(state.carrierCreateCalls.length, 1);
    assert.equal(state.awbCalls, 0);
  });
});

test("an existing AWB is reconciled instead of assigning or creating another Shiprocket order", async () => {
  await withLiveAwbBooking(() => harness(async ({ state, getStatus }) => {
    state.environment = "production";
    state.providerStatus = "PAID";
    state.shipments = [{
      id: "existing-package",
      checkoutOrderId: state.order.id,
      packageIndex: 0,
      shiprocketOrderId: "1716900471",
      shiprocketShipmentId: "1712529624",
      courierId: "44",
      courierName: "Delhivery Surface 2 Kgs",
      quotedAmount: "116.72",
      status: "quoted",
      awbCode: null,
      trackingUrl: null,
      updatedAt: new Date(),
    }];
    state.shipmentDetails = {
      orderId: "1716900471",
      shipmentId: "1712529624",
      awbCode: "awb-existing",
      courierId: "44",
      courierName: "Delhivery Surface 2 Kgs",
      trackingUrl: "https://shiprocket.co/tracking/awb-existing",
      status: "PENDING",
    };

    await getStatus();
    assert.equal(state.awbCalls, 0);
    assert.equal(state.carrierCreateCalls.length, 0);
    assert.equal(state.shipments[0].shiprocketOrderId, "1716900471");
    assert.equal(state.shipments[0].shiprocketShipmentId, "1712529624");
    assert.equal(state.shipments[0].status, "booked");
    assert.equal(state.shipments[0].awbCode, "awb-existing");
    assert.equal(state.shipments[0].courierId, "44");
    assert.equal(state.shipments[0].courierName, "Delhivery Surface 2 Kgs");
    assert.equal(state.shipments[0].trackingUrl, "https://shiprocket.co/tracking/awb-existing");
  }));
});

test("ambiguous AWB responses are reconciled but never blindly retried", async () => {
  await withLiveAwbBooking(() => harness(async ({ state, getStatus }) => {
    state.environment = "production";
    state.providerStatus = "PAID";
    state.shipments = [{
      id: "existing-package",
      checkoutOrderId: state.order.id,
      packageIndex: 0,
      shiprocketOrderId: "1716900471",
      shiprocketShipmentId: "1712529624",
      courierId: "44",
      courierName: "Delhivery Surface 2 Kgs",
      quotedAmount: "116.72",
      status: "quoted",
      awbCode: null,
      trackingUrl: null,
      updatedAt: new Date(),
    }];
    state.awbError = true;

    await getStatus();
    assert.equal(state.awbCalls, 1);
    assert.equal(state.shipments[0].status, "booking_pending");
    assert.equal(state.shipments[0].shiprocketOrderId, "1716900471");
    assert.equal(state.shipments[0].shiprocketShipmentId, "1712529624");

    const preflightReads = state.shipmentDetailsCalls.length;
    await getStatus();
    assert.equal(state.awbCalls, 1);
    assert.equal(state.shipmentDetailsCalls.length, preflightReads);
    state.shipments[0].updatedAt = new Date(Date.now() - 61_000);
    state.shipmentDetails = {
      orderId: "1716900471",
      shipmentId: "1712529624",
      awbCode: "awb-after-timeout",
      courierId: "44",
      courierName: "Delhivery Surface 2 Kgs",
      trackingUrl: "https://shiprocket.co/tracking/awb-after-timeout",
      status: "Pickup Scheduled",
    };
    await getStatus();
    assert.equal(state.awbCalls, 1);
    assert.equal(state.shipments[0].status, "pickup_scheduled");
    assert.equal(state.shipments[0].awbCode, "awb-after-timeout");
    assert.equal(state.shipments[0].trackingUrl, "https://shiprocket.co/tracking/awb-after-timeout");
  }));
});

test("a definite provider rejection records booking_failed and does not auto-retry", async () => {
  await withLiveAwbBooking(() => harness(async ({ state, getStatus }) => {
    state.environment = "production";
    state.providerStatus = "PAID";
    state.shipments = [{
      id: "existing-package",
      checkoutOrderId: state.order.id,
      packageIndex: 0,
      shiprocketOrderId: "1716900471",
      shiprocketShipmentId: "1712529624",
      courierId: "44",
      courierName: "Delhivery Surface 2 Kgs",
      quotedAmount: "116.72",
      status: "quoted",
      awbCode: null,
      updatedAt: new Date(),
    }];
    state.awbErrorStatus = 422;

    await getStatus();
    assert.equal(state.awbCalls, 1);
    assert.equal(state.shipments[0].status, "booking_failed");
    await getStatus();
    assert.equal(state.awbCalls, 1);
  }));
});

test("an HTTP 200 courier rejection records booking_failed without losing paid order references", async () => {
  await withLiveAwbBooking(() => harness(async ({ state, getStatus }) => {
    state.environment = "production";
    state.providerStatus = "PAID";
    state.awbBodyRejected = true;
    state.shipments = [{
      id: "existing-package", checkoutOrderId: state.order.id, packageIndex: 0,
      shiprocketOrderId: "1716900471", shiprocketShipmentId: "1712529624",
      courierId: "44", courierName: "Delhivery Surface 2 Kgs", quotedAmount: "116.72",
      status: "quoted", awbCode: null, updatedAt: new Date(),
    }];
    await getStatus();
    assert.equal(state.shipments[0].status, "booking_failed");
    assert.match(state.shipments[0].lastError, /Courier rejected assignment/);
    assert.equal(state.order.paymentStatus, "paid");
    assert.equal(state.order.status, "reconciliation_required");
    assert.equal(state.shipments[0].shiprocketOrderId, "1716900471");
    assert.equal(state.shipments[0].shiprocketShipmentId, "1712529624");
    await getStatus();
    assert.equal(state.awbCalls, 1);
    assert.equal(state.carrierCreateCalls.length, 0);
  }));
});

test("an unauthenticated Cashfree webhook cannot change payment state", async () => {
  await harness(async ({ state, sendWebhook }) => {
    state.signatureValid = false;
    const result = await sendWebhook({
      type: "PAYMENT_SUCCESS_WEBHOOK",
      data: { order: { order_id: state.order.cashfreeOrderId }, payment: { cf_payment_id: "fake-payment" } },
    });
    assert.equal(result.status, 401);
    assert.equal(state.order.status, "payment_pending");
    assert.equal(state.shopifySyncAttempts, 0);
  });
});

test("a failed Shopify synchronization remains recoverable without asking for another payment", async () => {
  await harness(async ({ state, getStatus }) => {
    state.shopifyFailures = 1;
    const first = await getStatus();
    assert.equal(first.body.status, "shopify_sync_pending");
    assert.match(first.body.message, /do not pay again/i);
    assert.equal(state.shopifySyncAttempts, 1);

    state.order.updatedAt = new Date(Date.now() - 61_000);
    const recovered = await getStatus();
    assert.equal(recovered.body.status, "shopify_synced");
    assert.equal(recovered.body.shopifyOrderName, "#1001");
    assert.equal(state.shopifySyncAttempts, 2);
  });
});

test("signed refund notifications stop subsequent payment callbacks from creating an order", async () => {
  await harness(async ({ state, sendWebhook }) => {
    const refund = await sendWebhook({
      type: "REFUND_STATUS_WEBHOOK",
      data: { order: { order_id: state.order.cashfreeOrderId }, refund: { refund_status: "SUCCESS" } },
    });
    assert.equal(refund.status, 200);
    assert.equal(state.order.status, "refunded");
    const paid = await sendWebhook({
      type: "PAYMENT_SUCCESS_WEBHOOK",
      data: { order: { order_id: state.order.cashfreeOrderId }, payment: { cf_payment_id: "cf-payment-1" } },
    });
    assert.equal(paid.status, 200);
    assert.equal(state.shopifySyncAttempts, 0);
    assert.equal(state.order.status, "refunded");
  });
});

test("payment sessions use the validated quote and return to the same Replit preview origin", async () => {
  await harness(async ({ state, postSession }) => {
    const origin = "https://preview.replit.dev";
    const result = await postSession(
      { quoteId: state.order.id },
      { Origin: origin, Referer: `${origin}/chenetha-storefront/Checkout` },
    );
    assert.equal(result.status, 200);
    assert.equal(result.body.paymentSessionId, "sandbox-session");
    assert.equal(result.body.environment, "sandbox");
    assert.equal(state.cashfreeCreateInput.amount, "120.00");
    assert.deepEqual(state.cashfreeReadinessCheck, { currencyCode: "INR", isInternational: false });
    assert.equal(state.cashfreeCreateInput.isInternational, false);
    const cashfreeExpiryMs = Date.parse(state.cashfreeCreateInput.expiresAt) - Date.now();
    assert.ok(cashfreeExpiryMs > 19 * 60 * 1000 && cashfreeExpiryMs <= 20 * 60 * 1000);
    assert.ok(Date.parse(state.cashfreeCreateInput.expiresAt) <= state.order.quoteExpiresAt.getTime());
    assert.equal(
      state.cashfreeCreateInput.returnUrl,
      `${origin}/chenetha-storefront/Confirmation?cashfree_order_id=${state.order.cashfreeOrderId}`,
    );
    assert.equal(state.order.status, "payment_pending");
  }, {
    order: {
      status: "quote_ready",
      paymentSessionId: null,
    },
  });
});

test("international payment sessions identify their destination when checking Cashfree readiness", async () => {
  await harness(async ({ state, postSession }) => {
    state.order.destinationCountryCode = "US";
    const result = await postSession(
      { quoteId: state.order.id },
      { Origin: "https://preview.replit.dev" },
    );
    assert.equal(result.status, 200);
    assert.deepEqual(state.cashfreeReadinessCheck, { currencyCode: "INR", isInternational: true });
    assert.equal(state.cashfreeCreateInput.isInternational, true);
  }, {
    order: {
      status: "quote_ready",
      paymentSessionId: null,
      destinationCountryCode: "US",
    },
  });
});

test("Cashfree provider errors are logged privately and frontend receives a sanitized message", async () => {
  await harness(async ({ state, postSession }) => {
    state.cashfreeCreateError = {
      message: "Secure payment could not be prepared. Your bag has not been charged. Please try again.",
      details: {
        upstreamStatus: 400,
        providerCode: "request_invalid",
        providerType: "invalid_request_error",
        providerMessage: "The order request was rejected.",
        createOrderRequest: { orderCurrency: "INR", orderAmount: 120 },
      },
    };
    const result = await postSession(
      { quoteId: state.order.id },
      { Origin: "https://preview.replit.dev" },
    );
    assert.equal(result.status, 503);
    assert.match(result.body.error, /Your bag has not been charged/);
    assert.doesNotMatch(result.body.error, /request_invalid|rejected/);
    const providerLog = state.logs.find((entry) => entry.message ===
      "Cashfree Create Order API rejected the checkout request");
    assert.equal(providerLog.fields.cashfreeHttpStatus, 400);
    assert.equal(providerLog.fields.cashfreeErrorCode, "request_invalid");
    assert.equal(providerLog.fields.cashfreeErrorType, "invalid_request_error");
    assert.equal(providerLog.fields.cashfreeErrorMessage, "The order request was rejected.");
    assert.deepEqual(providerLog.fields.createOrderRequest, { orderCurrency: "INR", orderAmount: 120 });
  }, {
    order: {
      status: "quote_ready",
      paymentSessionId: null,
    },
  });
});

test("unconfirmed Cashfree account setup blocks payment with a clear message", async () => {
  await harness(async ({ state, postSession }) => {
    state.cashfreeReadinessError =
      "Live checkout is paused until Cashfree confirms international payments are enabled for this account.";
    const result = await postSession(
      { quoteId: state.order.id },
      { Origin: "https://preview.replit.dev" },
    );
    assert.equal(result.status, 503);
    assert.match(result.body.error, /Cashfree confirms international payments/);
    assert.equal(state.cashfreeCreateInput, null);
  }, {
    order: {
      status: "quote_ready",
      paymentSessionId: null,
    },
  });
});

test("expired quotes cannot create Cashfree payment sessions", async () => {
  await harness(async ({ state, postSession }) => {
    state.order.quoteExpiresAt = new Date(Date.now() - 1_000);
    const result = await postSession(
      { quoteId: state.order.id },
      { Origin: "https://preview.replit.dev" },
    );
    assert.equal(result.status, 409);
    assert.equal(state.cashfreeCreateInput, null);
  }, {
    order: {
      status: "quote_ready",
      paymentSessionId: null,
    },
  });
});

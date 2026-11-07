import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { build } from "esbuild";

const compiled = await build({
  entryPoints: [new URL("../src/lib/shopifyCheckoutOrder.ts", import.meta.url).pathname],
  bundle: true,
  write: false,
  format: "cjs",
  platform: "node",
  plugins: [{
    name: "shopify-checkout-order-boundaries",
    setup(builder) {
      builder.onResolve({ filter: /shopifyAdminClient$/ }, () => ({
        path: "shopify-admin",
        namespace: "test",
      }));
      builder.onResolve({ filter: /cashfreeClient$/ }, () => ({
        path: "cashfree",
        namespace: "test",
      }));
      builder.onLoad({ filter: /.*/, namespace: "test" }, ({ path }) => ({
        contents: {
          "shopify-admin": [
            "export class ShopifyAdminError extends Error {}",
            "export async function shopifyAdminRequest(query, variables) { return globalThis.__checkoutTest.adminRequest(query, variables); }",
            "export function assertNoUserErrors(errors) { if (errors?.[0]?.message) throw new Error(errors[0].message); }",
          ].join("\n"),
          cashfree: "export const getCashfreeEnvironment = () => globalThis.__checkoutTest.environment;",
        }[path],
      }));
    },
  }],
});

function loadModule(state) {
  globalThis.__checkoutTest = state;
  const module = { exports: {} };
  new Function("require", "module", "exports", compiled.outputFiles[0].text)(
    createRequire(import.meta.url),
    module,
    module.exports,
  );
  return module.exports;
}

function fixtureState(overrides = {}) {
  const state = {
    environment: "sandbox",
    domain: "gtnbsw-x3.myshopify.com",
    scopes: ["read_orders", "write_orders"],
    existing: null,
    savedOrder: {
      id: "gid://shopify/Order/999",
      name: "#1001",
      test: true,
      currencyCode: "INR",
      transactions: [{
        kind: "SALE",
        status: "SUCCESS",
        gateway: "Cashfree",
        authorizationCode: "cf_payment_123",
        test: true,
        amountSet: { shopMoney: { amount: "120.00", currencyCode: "INR" } },
      }],
    },
    calls: [],
    adminRequest: async (query, variables) => {
      state.calls.push({ query, variables });
      if (query.includes("CashfreeCheckoutCapabilities")) {
        return {
          shop: { myshopifyDomain: state.domain },
          currentAppInstallation: { accessScopes: state.scopes.map((handle) => ({ handle })) },
        };
      }
      if (query.includes("FindCashfreeOrder")) {
        return { orders: { nodes: state.existing ? [state.existing] : [] } };
      }
      if (query.includes("ReadCashfreeTestOrderPayment")) {
        return { order: state.savedOrder };
      }
      if (query.includes("CreateCashfreePaidOrder")) {
        state.createdOrderInput = variables.order;
        state.createdOptions = variables.options;
        return {
          orderCreate: {
            order: { id: "gid://shopify/Order/999", name: "#1001" },
            userErrors: [],
          },
        };
      }
      throw new Error(`Unexpected Shopify operation: ${query}`);
    },
    ...overrides,
  };
  return state;
}

function orderInput(overrides = {}) {
  return {
    orderId: "chenetha_test-123",
    paymentReference: "cf_payment_123",
    snapshot: {
      cart: {
        id: "gid://shopify/Cart/cart-1",
        totalQuantity: 2,
        cost: {
          subtotalAmount: { amount: "100.00", currencyCode: "INR" },
          totalAmount: { amount: "100.00", currencyCode: "INR" },
          totalTaxAmount: { amount: "0.00", currencyCode: "INR" },
        },
        lines: {
          nodes: [{
            id: "gid://shopify/CartLine/line-1",
            quantity: 2,
            cost: {
              subtotalAmount: { amount: "100.00", currencyCode: "INR" },
              totalAmount: { amount: "100.00", currencyCode: "INR" },
            },
            merchandise: {
              id: "gid://shopify/ProductVariant/55",
              title: "Blue",
              sku: "SAREE-55",
              availableForSale: true,
              product: { title: "Handwoven saree" },
            },
          }],
        },
      },
      email: "buyer@example.com",
      phone: "+919876543210",
      address: {
        recipient: "Asha Rao",
        street: "12 Example Road",
        city: "Hyderabad",
        state: "Telangana",
        pin: "500008",
        countryCode: "IN",
      },
      shippingAmount: "20.00",
      shippingCurrencyCode: "INR",
      courierName: "Economy",
      totalAmount: "120.00",
      taxAmount: "0.00",
      itemSubtotal: "100.00",
      discountAmount: "0.00",
    },
    ...overrides,
  };
}

test("verifies the Railway store and both order scopes before synchronizing", async () => {
  const state = fixtureState({ scopes: ["read_orders"] });
  const { assertShopifyCheckoutCapabilities } = loadModule(state);
  await assert.rejects(assertShopifyCheckoutCapabilities(), /write_orders/);
  assert.equal(state.calls.length, 1);
});

test("creates an idempotent Shopify test order with the external payment reference", async () => {
  const state = fixtureState();
  const { createOrFindShopifyPaidOrder } = loadModule(state);
  const result = await createOrFindShopifyPaidOrder(orderInput());
  assert.equal(result.name, "#1001");
  assert.equal(state.createdOrderInput.sourceIdentifier, "chenetha_test-123");
  assert.equal(state.createdOrderInput.test, true);
  assert.equal(state.createdOrderInput.currency, "INR");
  assert.equal(state.createdOrderInput.presentmentCurrency, "INR");
  assert.equal(state.createdOrderInput.transactions[0].test, true);
  assert.equal(state.createdOrderInput.transactions[0].authorizationCode, "cf_payment_123");
  assert.deepEqual(state.createdOrderInput.transactions[0].amountSet.shopMoney, {
    amount: "120.00",
    currencyCode: "INR",
  });
  assert.deepEqual(state.createdOrderInput.transactions[0].receiptJson, {
    cashfree_order_id: "chenetha_test-123",
    cashfree_payment_reference: "cf_payment_123",
  });
  assert.equal(state.createdOrderInput.customAttributes[0].value, "chenetha_test-123");
  assert.equal(state.createdOrderInput.customAttributes[1].value, "cf_payment_123");
  assert.equal(state.createdOrderInput.lineItems.length, 2);
  assert.equal(state.createdOrderInput.lineItems[0].priceSet.shopMoney.amount, "50.00");
  assert.equal(state.createdOrderInput.lineItems[0].taxable, false);
  assert.equal(state.createdOrderInput.taxesIncluded, false);
  assert.equal(state.createdOrderInput.taxLines, undefined);
  assert.match(state.createdOrderInput.note, /Catalog prices are final; checkout adds shipping only/);
  assert.equal(state.createdOptions.inventoryBehaviour, "BYPASS");
  assert.equal(
    state.calls.some((call) =>
      call.query.includes("ReadCashfreeTestOrderPayment") &&
      call.variables.id === "gid://shopify/Order/999"
    ),
    true,
  );

  state.existing = { id: "gid://shopify/Order/999", name: "#1001" };
  state.calls.length = 0;
  const recovered = await createOrFindShopifyPaidOrder(orderInput());
  assert.equal(recovered.id, "gid://shopify/Order/999");
  assert.equal(state.calls.some((call) => call.query.includes("CreateCashfreePaidOrder")), false);
});

test("syncs final item prices when Shopify omits its cart tax total", async () => {
  const state = fixtureState();
  const input = orderInput();
  input.snapshot.cart.cost.totalTaxAmount = null;
  const { createOrFindShopifyPaidOrder } = loadModule(state);

  const result = await createOrFindShopifyPaidOrder(input);

  assert.equal(result.name, "#1001");
  assert.equal(state.createdOrderInput.transactions[0].amountSet.shopMoney.amount, "120.00");
  assert.equal(state.createdOrderInput.lineItems[0].taxable, false);
  assert.equal(state.createdOrderInput.taxLines, undefined);
});

test("rejects sandbox orders when Shopify did not retain the quoted payment details", async () => {
  const mismatches = [
    ["amount", (transaction) => {
      transaction.amountSet.shopMoney.amount = "121.00";
    }],
    ["currency", (transaction) => {
      transaction.amountSet.shopMoney.currencyCode = "USD";
    }],
    ["payment reference", (transaction) => {
      transaction.authorizationCode = "cf_payment_other";
    }],
  ];

  for (const [label, alterTransaction] of mismatches) {
    const savedOrder = {
      id: "gid://shopify/Order/999",
      name: "#1001",
      test: true,
      currencyCode: "INR",
      transactions: [{
        kind: "SALE",
        status: "SUCCESS",
        gateway: "Cashfree",
        authorizationCode: "cf_payment_123",
        test: true,
        amountSet: { shopMoney: { amount: "120.00", currencyCode: "INR" } },
      }],
    };
    alterTransaction(savedOrder.transactions[0]);
    const state = fixtureState({
      existing: { id: "gid://shopify/Order/999", name: "#1001" },
      savedOrder,
    });
    const { createOrFindShopifyPaidOrder } = loadModule(state);
    await assert.rejects(
      createOrFindShopifyPaidOrder(orderInput()),
      /did not retain the confirmed Cashfree payment details/,
      label,
    );
    assert.equal(state.calls.some((call) => call.query.includes("CreateCashfreePaidOrder")), false);
  }
});

test("retries a created sandbox order by reading it back without creating a duplicate", async () => {
  const state = fixtureState({
    savedOrder: {
      id: "gid://shopify/Order/999",
      name: "#1001",
      test: true,
      currencyCode: "INR",
      transactions: [{
        kind: "SALE",
        status: "SUCCESS",
        gateway: "Cashfree",
        authorizationCode: "cf_payment_123",
        test: true,
        amountSet: { shopMoney: { amount: "121.00", currencyCode: "INR" } },
      }],
    },
  });
  const { createOrFindShopifyPaidOrder } = loadModule(state);

  await assert.rejects(
    createOrFindShopifyPaidOrder(orderInput()),
    /did not retain the confirmed Cashfree payment details/,
  );
  assert.equal(state.calls.filter((call) => call.query.includes("CreateCashfreePaidOrder")).length, 1);

  state.existing = { id: "gid://shopify/Order/999", name: "#1001" };
  state.savedOrder.transactions[0].amountSet.shopMoney.amount = "120.00";
  state.calls.length = 0;
  const recovered = await createOrFindShopifyPaidOrder(orderInput());

  assert.equal(recovered.id, "gid://shopify/Order/999");
  assert.equal(state.calls.some((call) => call.query.includes("CreateCashfreePaidOrder")), false);
  assert.equal(state.calls.some((call) => call.query.includes("ReadCashfreeTestOrderPayment")), true);
});

test("refuses to synchronize against a different Shopify store", async () => {
  const state = fixtureState({ domain: "dev-store.myshopify.com" });
  const { assertShopifyCheckoutCapabilities } = loadModule(state);
  await assert.rejects(assertShopifyCheckoutCapabilities(), /not gtnbsw-x3\.myshopify\.com/);
});

test("production order records are not marked as Shopify test orders", async () => {
  const state = fixtureState({ environment: "production" });
  const { createOrFindShopifyPaidOrder } = loadModule(state);
  await createOrFindShopifyPaidOrder(orderInput());
  assert.equal(state.createdOrderInput.test, false);
  assert.equal(state.createdOrderInput.transactions[0].test, false);
  assert.equal(state.createdOptions.inventoryBehaviour, "DECREMENT_IGNORING_POLICY");
  assert.equal(state.calls.some((call) => call.query.includes("ReadCashfreeTestOrderPayment")), false);
});

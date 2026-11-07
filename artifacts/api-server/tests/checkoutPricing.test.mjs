import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { build } from "esbuild";

const compiled = await build({
  entryPoints: [new URL("../src/lib/checkoutPricing.ts", import.meta.url).pathname],
  bundle: true,
  write: false,
  format: "cjs",
  platform: "node",
});

function loadModule() {
  const module = { exports: {} };
  new Function("require", "module", "exports", compiled.outputFiles[0].text)(
    createRequire(import.meta.url),
    module,
    module.exports,
  );
  return module.exports;
}

const cart = {
  id: "gid://shopify/Cart/cart-test",
  cost: {
    subtotalAmount: { amount: "100.00", currencyCode: "INR" },
    totalAmount: { amount: "99.99", currencyCode: "INR" },
    totalTaxAmount: { amount: "0.00", currencyCode: "INR" },
  },
  lines: {
    nodes: [{
      id: "gid://shopify/CartLine/1",
      quantity: 3,
      cost: {
        subtotalAmount: { amount: "100.00", currencyCode: "INR" },
        totalAmount: { amount: "99.99", currencyCode: "INR" },
      },
      merchandise: { id: "gid://shopify/ProductVariant/1", availableForSale: true },
    }],
  },
};

test("money sums use integer minor units", () => {
  const { addMoney } = loadModule();
  assert.equal(addMoney(["100.01", "20.99", "0.10"]), "121.10");
});

test("checkout item totals use final Shopify line prices without adding a separate tax amount", () => {
  const { getCheckoutItemTotal } = loadModule();
  const cartWithoutTaxTotal = {
    ...cart,
    cost: {
      ...cart.cost,
      totalAmount: { amount: "109.99", currencyCode: "INR" },
      totalTaxAmount: null,
    },
  };
  assert.equal(getCheckoutItemTotal(cartWithoutTaxTotal), "99.99");
});

test("per-item parcel values preserve the exact discounted line total", () => {
  const { addMoney, divideMoney, splitMoney } = loadModule();
  const pieces = splitMoney("99.99", 3);
  assert.deepEqual(pieces, ["33.33", "33.33", "33.33"]);
  assert.equal(addMoney(pieces), "99.99");
  assert.throws(() => divideMoney("10.00", 3), /represented exactly/);
});

test("quote fingerprint changes when destination, cart, or parcel changes", () => {
  const { checkoutCartFingerprint } = loadModule();
  const baseInput = {
    cart,
    email: "Buyer@example.com",
    phone: "+919876543210",
    address: {
      recipient: "Asha Rao",
      street: "12 Example Road",
      city: "Hyderabad",
      pin: "500007",
      countryCode: "IN",
    },
    parcel: { weightKg: 1, lengthCm: 35, breadthCm: 25, heightCm: 8 },
  };
  const base = checkoutCartFingerprint(baseInput);
  assert.equal(checkoutCartFingerprint(baseInput), base);
  assert.notEqual(
    checkoutCartFingerprint({ ...baseInput, address: { ...baseInput.address, pin: "500008" } }),
    base,
  );
  assert.notEqual(
    checkoutCartFingerprint({ ...baseInput, parcel: { ...baseInput.parcel, weightKg: 1.1 } }),
    base,
  );
  assert.notEqual(
    checkoutCartFingerprint({
      ...baseInput,
      cart: { ...cart, cost: { ...cart.cost, totalAmount: { amount: "100.00", currencyCode: "INR" } } },
    }),
    base,
  );
});

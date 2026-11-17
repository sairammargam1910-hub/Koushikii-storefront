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
  discountCodes: [],
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
      discountAllocations: [],
       merchandise: {
         id: "gid://shopify/ProductVariant/1",
         availableForSale: true,
         weight: 750,
         weightUnit: "GRAMS",
       },
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

test("checkout totals use allocated cart-code savings even when line total has not changed", () => {
  const { getCartDiscountAmount, getCheckoutItemTotal } = loadModule();
  const cartWithCartCodeAllocation = {
    ...cart,
    lines: {
      nodes: [{
        ...cart.lines.nodes[0],
        cost: {
          subtotalAmount: { amount: "2000.00", currencyCode: "INR" },
          totalAmount: { amount: "2000.00", currencyCode: "INR" },
        },
        discountAllocations: [{
          discountedAmount: { amount: "200.00", currencyCode: "INR" },
          targetType: "LINE_ITEM",
        }],
      }],
    },
  };
  assert.equal(getCartDiscountAmount(cartWithCartCodeAllocation), "200.00");
  assert.equal(getCheckoutItemTotal(cartWithCartCodeAllocation), "1800.00");
});

test("shipping discount allocations do not reduce merchandise subtotal", () => {
  const { getCartDiscountAmount, getCheckoutItemTotal } = loadModule();
  const cartWithShippingAllocation = {
    ...cart,
    lines: {
      nodes: [{
        ...cart.lines.nodes[0],
        discountAllocations: [{
          discountedAmount: { amount: "25.00", currencyCode: "INR" },
          targetType: "SHIPPING_LINE",
        }],
      }],
    },
  };
  assert.equal(getCartDiscountAmount(cartWithShippingAllocation), "0.00");
  assert.equal(getCheckoutItemTotal(cartWithShippingAllocation), "100.00");
});

test("per-item parcel values preserve the exact discounted line total", () => {
  const { addMoney, divideMoney, splitMoney } = loadModule();
  const pieces = splitMoney("99.99", 3);
  assert.deepEqual(pieces, ["33.33", "33.33", "33.33"]);
  assert.equal(addMoney(pieces), "99.99");
  assert.throws(() => divideMoney("10.00", 3), /represented exactly/);
});

test("order-level coupons reduce all totals while keeping allocated line amounts exact", () => {
  const { getCartDiscountAmount, getCheckoutItemTotal, getCheckoutLineTotals } = loadModule();
  const discounted = {
    ...cart,
    discountAllocations: [{
      discountedAmount: { amount: "200.00", currencyCode: "INR" },
      targetType: "LINE_ITEM",
    }],
    lines: { nodes: [{
      ...cart.lines.nodes[0],
      cost: {
        subtotalAmount: { amount: "2000.00", currencyCode: "INR" },
        totalAmount: { amount: "2000.00", currencyCode: "INR" },
      },
    }] },
  };
  assert.equal(getCartDiscountAmount(discounted), "200.00");
  assert.equal(getCheckoutItemTotal(discounted), "1800.00");
  assert.deepEqual(getCheckoutLineTotals(discounted), ["1800.00"]);

  discounted.discountAllocations[0].discountedAmount.amount = "0.01";
  discounted.lines.nodes = Array.from({ length: 3 }, (_, i) => ({
    ...discounted.lines.nodes[0],
    id: `line-${i}`,
    cost: {
      subtotalAmount: { amount: "10.00", currencyCode: "INR" },
      totalAmount: { amount: "10.00", currencyCode: "INR" },
    },
  }));
  assert.deepEqual(getCheckoutLineTotals(discounted), ["9.99", "10.00", "10.00"]);
  assert.equal(getCheckoutItemTotal(discounted), "29.99");
});

test("variant weights normalize to kilograms and multiply by quantity", () => {
  const { getCartWeightKg, weightToKilograms } = loadModule();
  assert.equal(weightToKilograms(750, "GRAMS"), 0.75);
  assert.equal(weightToKilograms(2, "POUNDS"), 0.907);
  assert.equal(weightToKilograms(0, "KILOGRAMS"), null);
  assert.equal(getCartWeightKg(cart), 2.25);
  const missingWeightCart = {
    ...cart,
    lines: { nodes: [{
      ...cart.lines.nodes[0],
      merchandise: { ...cart.lines.nodes[0].merchandise, weight: 0 },
    }] },
  };
  assert.equal(getCartWeightKg(missingWeightCart), null);
});

test("shopper quote hashes stay stable and remain shopper-specific", () => {
  const { getShopperQuoteHash } = loadModule();
  const first = getShopperQuoteHash("shopper-1", "fingerprint");
  assert.equal(getShopperQuoteHash("shopper-1", "fingerprint"), first);
  assert.notEqual(getShopperQuoteHash("shopper-2", "fingerprint"), first);
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
    parcel: { weightKg: 1, lengthCm: 33, breadthCm: 37.5, heightCm: 5 },
  };
  const base = checkoutCartFingerprint(baseInput);
  assert.equal(checkoutCartFingerprint(baseInput), base);
  assert.notEqual(
    checkoutCartFingerprint({ ...baseInput, address: { ...baseInput.address, pin: "500008" } }),
    base,
  );
  assert.notEqual(
    checkoutCartFingerprint({ ...baseInput, parcel: { ...baseInput.parcel, lengthCm: 36 } }),
    base,
  );
  const changedProductWeight = {
    ...cart,
    lines: {
      nodes: cart.lines.nodes.map((line) => ({
        ...line,
        merchandise: { ...line.merchandise, weight: 800 },
      })),
    },
  };
  assert.notEqual(checkoutCartFingerprint({ ...baseInput, cart: changedProductWeight }), base);
  const changedLineTotal = {
    ...cart,
    lines: {
      nodes: cart.lines.nodes.map((line) => ({
        ...line,
        cost: { ...line.cost, totalAmount: { amount: "98.99", currencyCode: "INR" } },
      })),
    },
  };
  assert.notEqual(checkoutCartFingerprint({ ...baseInput, cart: changedLineTotal }), base);
  assert.notEqual(
    checkoutCartFingerprint({
      ...baseInput,
      cart: { ...cart, discountCodes: [{ code: "NEW26", applicable: true }] },
    }),
    base,
  );
  const surfaceOnlyCart = {
    ...cart,
    lines: {
      nodes: cart.lines.nodes.map((line) => ({
        ...line,
        merchandise: {
          ...line.merchandise,
          product: { tags: ["shiprocket-surface-only"] },
        },
      })),
    },
  };
  assert.notEqual(
    checkoutCartFingerprint({ ...baseInput, cart: surfaceOnlyCart }),
    base,
  );
});

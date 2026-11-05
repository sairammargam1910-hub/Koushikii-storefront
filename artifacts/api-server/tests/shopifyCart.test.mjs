import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { build } from "esbuild";
import express from "express";

const compiled = await build({
  entryPoints: [new URL("../src/routes/shopify.ts", import.meta.url).pathname],
  bundle: true,
  write: false,
  format: "cjs",
  platform: "node",
  external: ["express"],
  plugins: [{
    name: "shopify-cart-boundaries",
    setup(builder) {
      builder.onResolve({ filter: /shopifyStorefrontClient$/ }, () => ({
        path: "storefront-client",
        namespace: "test",
      }));
      builder.onResolve({ filter: /logger$/ }, () => ({
        path: "logger",
        namespace: "test",
      }));
      builder.onLoad({ filter: /.*/, namespace: "test" }, ({ path }) => ({
        contents: {
          "storefront-client": [
            "export const shopifyStorefrontRequest = (...args) => storefrontRequest(...args);",
            "export const getShopifyCustomerAccountUrl = async () => 'https://chenetha.myshopify.com/account';",
          ].join("\n"),
          logger: "export const logger = { error() {} };",
        }[path],
      }));
    },
  }],
});

const variantId = "gid://shopify/ProductVariant/123";
const checkoutUrl = "https://chenetha.myshopify.com/checkouts/test-checkout";

function cart(overrides = {}) {
  return {
    id: "gid://shopify/Cart/cart-123",
    checkoutUrl,
    totalQuantity: 1,
    cost: {
      subtotalAmount: { amount: "1250.00", currencyCode: "INR" },
      totalAmount: { amount: "1250.00", currencyCode: "INR" },
    },
    deliveryGroups: { nodes: [] },
    discountCodes: [],
    lines: {
      nodes: [{
        id: "gid://shopify/CartLine/line-123",
        quantity: 1,
        cost: {
          subtotalAmount: { amount: "1250.00", currencyCode: "INR" },
          totalAmount: { amount: "1250.00", currencyCode: "INR" },
        },
        merchandise: {
          id: variantId,
          title: "Default",
          availableForSale: true,
          price: { amount: "1250.00", currencyCode: "INR" },
          selectedOptions: [{ name: "Title", value: "Default" }],
          product: {
            title: "Kanchipuram saree",
            handle: "kanchipuram-saree",
            description: "Handwoven silk",
            tags: ["saree"],
            featuredImage: null,
          },
        },
      }],
    },
    ...overrides,
  };
}

async function harness(run, { useDevStorePreview = false } = {}) {
  const previousDevStorePreview = process.env.SHOPIFY_DEV_STORE_PREVIEW;
  if (useDevStorePreview) {
    process.env.SHOPIFY_DEV_STORE_PREVIEW = "true";
  } else {
    delete process.env.SHOPIFY_DEV_STORE_PREVIEW;
  }

  const state = {
    availableCountries: ["IN"],
    variant: {
      id: variantId,
      availableForSale: true,
      product: { title: "Kanchipuram saree", description: "Handwoven silk", tags: ["saree"] },
    },
    calls: [],
    cartMutationResult: { cart: cart(), userErrors: [] },
    shippingQuote: {
      id: "gid://shopify/Cart/cart-123",
      deliveryGroups: { nodes: [] },
    },
  };
  const module = { exports: {} };
  new Function("require", "module", "exports", "storefrontRequest", compiled.outputFiles[0].text)(
    createRequire(import.meta.url),
    module,
    module.exports,
    async (query, variables) => {
      state.calls.push({ query, variables });
      if (query.includes("query ShopifyCartMarket")) {
        const countryNames = {
          IN: "India",
          US: "United States",
          GB: "United Kingdom",
        };
        return {
          localization: {
            availableCountries: state.availableCountries.map((isoCode) => ({
              isoCode,
              name: countryNames[isoCode] ?? isoCode,
            })),
          },
        };
      }
      if (query.includes("query ShopifyCartShippingEstimate")) {
        return { cart: state.shippingQuote };
      }
      if (query.includes("query ShopifyCart")) {
        return { cart: state.cartMutationResult.cart };
      }
      if (query.includes("ShopifyVariantForCart")) return { node: state.variant };
      if (query.includes("mutation CreateShopifyCart")) {
        return { cartCreate: state.cartMutationResult };
      }
      if (query.includes("mutation AddShopifyCartLines")) {
        return { cartLinesAdd: state.cartMutationResult };
      }
      if (query.includes("mutation UpdateShopifyCartDiscountCodes")) {
        return { cartDiscountCodesUpdate: state.cartMutationResult };
      }
      if (query.includes("mutation UpdateShopifyCartBuyerIdentity")) {
        return { cartBuyerIdentityUpdate: state.cartMutationResult };
      }
      if (query.includes("mutation ReplaceShopifyCartDeliveryAddress")) {
        return { cartDeliveryAddressesReplace: state.cartMutationResult };
      }
      throw new Error(`Unexpected Shopify query: ${query}`);
    },
  );

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.log = { error() {} }; next(); });
  app.use("/api", module.exports.default);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const endpoint = `http://127.0.0.1:${server.address().port}/api/shopify/cart`;
  const countriesEndpoint = `http://127.0.0.1:${server.address().port}/api/shopify/countries`;
  const post = async (body) => {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: response.status, data: await response.json() };
  };
  const postDiscount = async (body) => {
    const response = await fetch(`${endpoint}/discount-codes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: response.status, data: await response.json() };
  };
  const postBuyerIdentity = async (body) => {
    const response = await fetch(`${endpoint}/buyer-identity`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: response.status, data: await response.json() };
  };
  const getCart = async (cartId) => {
    const response = await fetch(`${endpoint}?cartId=${encodeURIComponent(cartId)}`);
    return { status: response.status, data: await response.json() };
  };
  const getCountries = async () => {
    const response = await fetch(countriesEndpoint);
    return { status: response.status, data: await response.json() };
  };
  try {
    await run({ state, post, postDiscount, postBuyerIdentity, getCart, getCountries });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    if (previousDevStorePreview === undefined) {
      delete process.env.SHOPIFY_DEV_STORE_PREVIEW;
    } else {
      process.env.SHOPIFY_DEV_STORE_PREVIEW = previousDevStorePreview;
    }
  }
}

test("rejects malformed variant IDs before contacting Shopify", async () => {
  await harness(async ({ state, post }) => {
    for (const merchandiseId of ["not-a-shopify-id", "gid://shopify/Product/123", "gid://shopify/ProductVariant/not-numeric"]) {
      const result = await post({ merchandiseId, quantity: 1 });
      assert.equal(result.status, 400);
      assert.match(result.data.error, /invalid/i);
    }
    assert.equal(state.calls.length, 0, "malformed IDs must not trigger validation or cart mutations");
  });
});

test("rejects demo, unavailable, and stale variants without creating a cart", async () => {
  await harness(async ({ state, post }) => {
    state.variant.product = {
      title: "Sample Kanchipuram saree",
      description: "Handwoven silk",
      tags: ["saree"],
    };
    const demo = await post({ merchandiseId: variantId, quantity: 1 });
    assert.equal(demo.status, 400);
    assert.match(demo.data.error, /demo/i);

    state.variant.product = {
      title: "Kanchipuram saree",
      description: "Handwoven silk",
      tags: ["saree"],
    };
    state.variant.availableForSale = false;
    const unavailable = await post({ merchandiseId: variantId, quantity: 1 });
    assert.equal(unavailable.status, 400);
    assert.match(unavailable.data.error, /unavailable/i);

    state.variant = null;
    const stale = await post({ merchandiseId: variantId, quantity: 1 });
    assert.equal(stale.status, 400);
    assert.match(stale.data.error, /could not be found/i);
    assert.equal(state.calls.some((call) => call.query.includes("mutation ")), false);
  });
});

test("forwards Shopify cart user errors and returns Shopify's checkout URL on success", async () => {
  await harness(async ({ state, post }) => {
    state.cartMutationResult = {
      cart: null,
      userErrors: [{ message: "This item is no longer available." }],
    };
    const rejected = await post({ merchandiseId: variantId, quantity: 1 });
    assert.equal(rejected.status, 400);
    assert.equal(rejected.data.error, "This item is no longer available.");

    state.cartMutationResult = { cart: cart(), userErrors: [] };
    const successful = await post({ merchandiseId: variantId, quantity: 1 });
    assert.equal(successful.status, 200);
    assert.equal(successful.data.checkoutUrl, checkoutUrl);
    assert.equal(successful.data.id, "gid://shopify/Cart/cart-123");
    assert.equal(successful.data.totalAmount, "1250.00");
  });
});

test("adds the online-store channel to password-protected preview checkout URLs", async () => {
  await harness(async ({ state, post }) => {
    state.cartMutationResult.cart.checkoutUrl = `${checkoutUrl}?key=fixture-checkout-key`;

    const result = await post({ merchandiseId: variantId, quantity: 1 });

    assert.equal(result.status, 200);
    const resultUrl = new URL(result.data.checkoutUrl);
    assert.equal(resultUrl.pathname, "/checkouts/test-checkout");
    assert.equal(resultUrl.searchParams.get("key"), "fixture-checkout-key");
    assert.equal(resultUrl.searchParams.get("channel"), "online_store");
  }, { useDevStorePreview: true });
});

test("applies, validates, and removes discount codes on the Shopify cart", async () => {
  await harness(async ({ state, postDiscount, postBuyerIdentity }) => {
    const blank = await postDiscount({
      cartId: "gid://shopify/Cart/cart-123",
      discountCodes: ["   "],
    });
    assert.equal(blank.status, 400);
    assert.equal(state.calls.length, 0);

    const discountedCart = cart({
        cost: {
          subtotalAmount: { amount: "1125.00", currencyCode: "INR" },
          totalAmount: { amount: "1125.00", currencyCode: "INR" },
        },
        discountCodes: [{ code: "SILK10", applicable: true }],
        lines: {
          nodes: cart().lines.nodes.map((line) => ({
            ...line,
            cost: {
              subtotalAmount: { amount: "1250.00", currencyCode: "INR" },
              totalAmount: { amount: "1125.00", currencyCode: "INR" },
            },
          })),
        },
      });
    state.cartMutationResult = {
      cart: discountedCart,
      userErrors: [],
    };
    const applied = await postDiscount({
      cartId: "gid://shopify/Cart/cart-123",
      discountCodes: [" SILK10 "],
    });
    assert.equal(applied.status, 200);
    assert.deepEqual(applied.data.discountCodes, [{ code: "SILK10", applicable: true }]);
    assert.equal(applied.data.subtotalAmount, "1250.00");
    assert.equal(applied.data.discountAmount, "125.00");
    assert.equal(applied.data.totalAmount, "1125.00");
    assert.deepEqual(state.calls.at(-1).variables, {
      cartId: "gid://shopify/Cart/cart-123",
      discountCodes: ["SILK10"],
    });
    assert.match(state.calls.at(-1).query, /cartDiscountCodesUpdate/);

    const savedAddressCart = cart({
      ...discountedCart,
      cost: {
        subtotalAmount: { amount: "1125.00", currencyCode: "INR" },
        totalAmount: { amount: "1385.00", currencyCode: "INR" },
      },
    });
    state.cartMutationResult = { cart: savedAddressCart, userErrors: [] };
    const withAddress = await postBuyerIdentity({
      cartId: "gid://shopify/Cart/cart-123",
      email: "shopper@example.com",
      deliveryAddress: {
        recipient: "Asha Rao",
        street: "12 Example Road",
        city: "Chennai",
        state: "Tamil Nadu",
        pin: "600001",
        countryCode: "IN",
      },
    });
    assert.equal(withAddress.status, 200);
    assert.equal(withAddress.data.subtotalAmount, "1250.00");
    assert.equal(withAddress.data.discountAmount, "125.00");
    assert.equal(withAddress.data.totalAmount, "1385.00");

    state.cartMutationResult = {
      cart: cart({ discountCodes: [{ code: "EXPIRED", applicable: false }] }),
      userErrors: [],
    };
    const rejectedByShopify = await postDiscount({
      cartId: "gid://shopify/Cart/cart-123",
      discountCodes: ["EXPIRED"],
    });
    assert.equal(rejectedByShopify.status, 200);
    assert.deepEqual(rejectedByShopify.data.discountCodes, [{ code: "EXPIRED", applicable: false }]);

    state.cartMutationResult = { cart: cart({ discountCodes: [] }), userErrors: [] };
    const removed = await postDiscount({
      cartId: "gid://shopify/Cart/cart-123",
      discountCodes: [],
    });
    assert.equal(removed.status, 200);
    assert.deepEqual(removed.data.discountCodes, []);
  });
});

test("returns the selected or lowest Shopify shipping rate and a shipping-inclusive estimate", async () => {
  await harness(async ({ state, postBuyerIdentity }) => {
    state.shippingQuote = {
      id: "gid://shopify/Cart/cart-123",
      deliveryGroups: {
        nodes: [
          {
            selectedDeliveryOption: null,
            deliveryOptions: [
              {
                title: "Standard",
                deliveryMethodType: "SHIPPING",
                estimatedCost: { amount: "100.00", currencyCode: "INR" },
              },
              {
                title: "Economy",
                deliveryMethodType: "SHIPPING",
                estimatedCost: { amount: "75.00", currencyCode: "INR" },
              },
              {
                title: "Pickup",
                deliveryMethodType: "PICK_UP",
                estimatedCost: { amount: "0.00", currencyCode: "INR" },
              },
            ],
          },
          {
            selectedDeliveryOption: {
              title: "Express",
              deliveryMethodType: "SHIPPING",
              estimatedCost: { amount: "250.00", currencyCode: "INR" },
            },
            deliveryOptions: [],
          },
        ],
      },
    };

    const result = await postBuyerIdentity({
      cartId: "gid://shopify/Cart/cart-123",
      email: "shopper@example.com",
      deliveryAddress: {
        recipient: "Asha Rao",
        street: "12 Example Road",
        city: "Chennai",
        pin: "600001",
        countryCode: "IN",
      },
    });

    assert.equal(result.status, 200);
    assert.deepEqual(result.data.shippingEstimate, {
      amount: "325.00",
      currencyCode: "INR",
      method: "Economy, Express",
      basis: "lowest_available",
    });
    assert.equal(result.data.estimatedTotalAmount, "1575.00");
    assert.match(state.calls.at(-1).query, /deliveryGroups\(first: 20\)/);
    assert.match(state.calls.at(-1).query, /estimatedCost \{ amount currencyCode \}/);
  });
});

test("prefills Shopify checkout with a saved shopper address", async () => {
  await harness(async ({ state, postBuyerIdentity }) => {
    const saved = await postBuyerIdentity({
      cartId: "gid://shopify/Cart/cart-123",
      email: "shopper@example.com",
      phone: "+919876543210",
      deliveryAddress: {
        recipient: "Asha Rao",
        street: "12 Example Road",
        city: "Chennai",
        state: "Tamil Nadu",
        pin: "600001",
        countryCode: "IN",
      },
    });
    assert.equal(saved.status, 200);
    assert.equal(saved.data.checkoutUrl, checkoutUrl);
    const identityCall = state.calls.find((call) => call.query.includes("cartBuyerIdentityUpdate"));
    assert.ok(identityCall);
    assert.deepEqual(identityCall.variables, {
      cartId: "gid://shopify/Cart/cart-123",
      buyerIdentity: {
        countryCode: "IN",
        email: "shopper@example.com",
        phone: "+919876543210",
      },
    });
    const addressCall = state.calls.find((call) =>
      call.query.includes("ReplaceShopifyCartDeliveryAddress"),
    );
    assert.match(addressCall.query, /cartDeliveryAddressesReplace/);
    assert.deepEqual(addressCall.variables, {
      cartId: "gid://shopify/Cart/cart-123",
      addresses: [{
        address: {
          deliveryAddress: {
            firstName: "Asha",
            lastName: "Rao",
            address1: "12 Example Road",
            city: "Chennai",
            provinceCode: "TN",
            zip: "600001",
            countryCode: "IN",
            phone: "+919876543210",
          },
        },
        selected: true,
        oneTimeUse: true,
      }],
    });

    const invalid = await postBuyerIdentity({
      cartId: "gid://shopify/Cart/cart-123",
      email: "shopper@example.com",
      deliveryAddress: {
        recipient: "Asha Rao",
        street: "12 Example Road",
        city: "Chennai",
        state: "Tamil Nadu",
        pin: "",
        countryCode: "IN",
      },
    });
    assert.equal(invalid.status, 400);
  });
});

test("lists active Shopify checkout countries", async () => {
  await harness(async ({ state, getCountries }) => {
    state.availableCountries = ["US", "IN", "GB"];
    const result = await getCountries();
    assert.equal(result.status, 200);
    assert.deepEqual(result.data.countries, [
      { isoCode: "IN", name: "India" },
      { isoCode: "GB", name: "United Kingdom" },
      { isoCode: "US", name: "United States" },
    ]);
  });
});

test("prepares an international Shopify delivery address using active market country", async () => {
  await harness(async ({ state, postBuyerIdentity }) => {
    state.availableCountries = ["IN", "US"];
    const result = await postBuyerIdentity({
      cartId: "gid://shopify/Cart/cart-123",
      email: "shopper@example.com",
      phone: "+12025550101",
      deliveryAddress: {
        recipient: "Mira Rao",
        street: "42 Market Street",
        address2: "Suite 12",
        city: "San Francisco",
        state: "CA",
        pin: "94105",
        countryCode: "US",
      },
    });
    assert.equal(result.status, 200);
    const identityCall = state.calls.find((call) => call.query.includes("cartBuyerIdentityUpdate"));
    assert.deepEqual(identityCall.variables.buyerIdentity, {
      countryCode: "US",
      email: "shopper@example.com",
      phone: "+12025550101",
    });
    const addressCall = state.calls.find((call) =>
      call.query.includes("ReplaceShopifyCartDeliveryAddress"),
    );
    assert.deepEqual(addressCall.variables.addresses[0].address.deliveryAddress, {
      firstName: "Mira",
      lastName: "Rao",
      address1: "42 Market Street",
      address2: "Suite 12",
      city: "San Francisco",
      provinceCode: "CA",
      zip: "94105",
      countryCode: "US",
      phone: "+12025550101",
    });
  });
});

test("rejects a shipping country not enabled in Shopify markets", async () => {
  await harness(async ({ state, postBuyerIdentity }) => {
    state.availableCountries = ["IN"];
    const result = await postBuyerIdentity({
      cartId: "gid://shopify/Cart/cart-123",
      email: "shopper@example.com",
      deliveryAddress: {
        recipient: "Mira Rao",
        street: "42 Market Street",
        city: "San Francisco",
        pin: "94105",
        countryCode: "US",
      },
    });
    assert.equal(result.status, 409);
    assert.match(result.data.error, /not currently set up to deliver/i);
    assert.equal(state.calls.some((call) => call.query.includes("mutation ")), false);
  });
});

test("blocks Indian cart and coupon requests until the Shopify market is enabled", async () => {
  await harness(async ({ state, post, postDiscount, getCart }) => {
    state.availableCountries = ["US"];

    const add = await post({ merchandiseId: variantId, quantity: 1 });
    assert.equal(add.status, 409);
    assert.match(add.data.error, /set up to deliver to India/i);

    const cartLoad = await getCart("gid://shopify/Cart/cart-123");
    assert.equal(cartLoad.status, 409);
    assert.match(cartLoad.data.error, /set up to deliver to India/i);

    const coupon = await postDiscount({
      cartId: "gid://shopify/Cart/cart-123",
      discountCodes: ["KOU1234"],
    });
    assert.equal(coupon.status, 409);
    assert.match(coupon.data.error, /set up to deliver to India/i);
    assert.equal(state.calls.some((call) => call.query.includes("mutation ")), false);
  });
});

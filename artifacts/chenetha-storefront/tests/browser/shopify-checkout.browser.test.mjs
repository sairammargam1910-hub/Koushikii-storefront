import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { chromium } from "playwright-core";

const packageDir = new URL("../../", import.meta.url).pathname;
const fixtureUrl = "/tests/browser/shopify-checkout-fixture.html";
const variantId = "gid://shopify/ProductVariant/123";
const productResponse = {
  products: [{
    id: "gid://shopify/Product/456",
    handle: "fixture-saree",
    title: "Kanchipuram silk saree",
    description: "Handwoven silk",
    productType: "Saree",
    tags: ["kanchipooram", "new arrival", "Silk"],
    images: [],
    variants: [{
      id: variantId,
      title: "Default Title",
      availableForSale: true,
      price: "1250.00",
      currencyCode: "INR",
      selectedOptions: [{ name: "Title", value: "Default Title" }],
    }],
  }],
};
const cartResponse = {
  id: "gid://shopify/Cart/browser-cart-123",
  checkoutUrl: null,
  totalQuantity: 1,
  subtotalAmount: "1250.00",
  discountAmount: "0.00",
  totalAmount: "1250.00",
  currencyCode: "INR",
  shippingEstimate: null,
  estimatedTotalAmount: null,
  discountCodes: [],
  lines: [{
    id: "gid://shopify/CartLine/browser-line-123",
    merchandiseId: variantId,
    productHandle: "fixture-saree",
    productTitle: "Kanchipuram silk saree",
    variantTitle: "Default Title",
    quantity: 1,
    unitPrice: "1250.00",
    currencyCode: "INR",
    availableForSale: true,
    isDemo: false,
    image: null,
  }],
};
let server;
let browser;
let origin;

async function findPort() {
  const listener = createServer();
  await new Promise((resolve, reject) => {
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", resolve);
  });
  const { port } = listener.address();
  await new Promise((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function startVite() {
  const port = await findPort();
  origin = `http://127.0.0.1:${port}`;
  server = spawn("pnpm", ["exec", "vite", "--config", "vite.config.ts", "--host", "127.0.0.1", "--strictPort"], {
    cwd: packageDir,
    env: { ...process.env, PORT: String(port), BASE_PATH: "/", NODE_ENV: "test" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  server.stdout.on("data", (chunk) => { output += chunk; });
  server.stderr.on("data", (chunk) => { output += chunk; });
  for (let attempt = 0; attempt < 240; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`Vite stopped before starting:\n${output}`);
    try {
      if ((await fetch(`${origin}${fixtureUrl}`)).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 125));
  }
  server.kill("SIGTERM");
  throw new Error(`Vite did not become ready:\n${output}`);
}

before(async () => {
  await startVite();
  const executablePath = process.env.CHROMIUM_PATH || "/repl/tools/bin/chromium";
  await access(executablePath);
  browser = await chromium.launch({ executablePath, headless: true, args: ["--no-sandbox"] });
});

after(async () => {
  await browser?.close();
  if (server && server.exitCode === null) {
    server.kill("SIGTERM");
    await new Promise((resolve) => {
      const timeout = setTimeout(() => { server.kill("SIGKILL"); resolve(); }, 3000);
      server.once("exit", () => { clearTimeout(timeout); resolve(); });
    });
  }
});

async function openProduct({ savedCart } = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  if (savedCart) {
    await context.addInitScript((cart) => localStorage.setItem("kq-shopify-cart", JSON.stringify(cart)), savedCart);
  }
  const page = await context.newPage();
  page.on("pageerror", (error) => console.error("[shopify-browser-page-error]", error.message));
  await page.route("**/api/shopify/products", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(productResponse),
  }));
  await page.goto(`${origin}${fixtureUrl}?screen=product`);
  await page.getByTestId("button-add-shopify-to-cart").waitFor({ timeout: 5000 });
  return { context, page };
}

async function openCart({ savedCart }) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addInitScript((cart) => localStorage.setItem("kq-shopify-cart", JSON.stringify(cart)), savedCart);
  const page = await context.newPage();
  page.on("pageerror", (error) => console.error("[shopify-browser-page-error]", error.message));
  await page.route("**/api/shopify/cart**", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ...cartResponse, id: savedCart.id }),
      });
      return;
    }
    await route.continue();
  });
  await page.goto(`${origin}${fixtureUrl}?screen=cart`);
  await page.getByRole("heading", { name: "Kanchipuram silk saree" }).waitFor({ timeout: 5000 });
  return { context, page };
}

async function openCheckout({
  savedCart,
  onCartRequest,
  onQuoteRequest,
  onPaymentSessionRequest,
  onPaymentStatusRequest,
  returnOrderId,
  holdCashfreeCheckout = false,
} = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addInitScript((cart) => localStorage.setItem("kq-shopify-cart", JSON.stringify(cart)), savedCart);
  await context.addInitScript((holdCheckout) => {
    window.__cashfreeCalls = [];
    window.Cashfree = (options) => ({
      checkout: async (checkoutOptions) => {
        window.__cashfreeCalls.push({ mode: options.mode, ...checkoutOptions });
        if (holdCheckout) {
          return new Promise((resolve) => { window.__cashfreeCheckoutResolver = resolve; });
        }
        return {};
      },
    });
  }, holdCashfreeCheckout);
  const page = await context.newPage();
  await page.route("**/api/shopify/cart**", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    await onCartRequest(route);
  });
  await page.route("**/api/shopify/countries**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        countries: [
          { isoCode: "IN", name: "India" },
          { isoCode: "US", name: "United States" },
        ],
      }),
    });
  });
  if (onQuoteRequest) {
    await page.route("**/api/shopify/checkout/quote", (route) => onQuoteRequest(route));
  }
  if (onPaymentSessionRequest) {
    await page.route("**/api/shopify/checkout/payment-session", (route) => onPaymentSessionRequest(route));
  }
  if (onPaymentStatusRequest) {
    await page.route("**/api/shopify/checkout/payment-status**", (route) => onPaymentStatusRequest(route));
  }
  const returnQuery = returnOrderId ? `&cashfree_order_id=${encodeURIComponent(returnOrderId)}` : "";
  await page.goto(`${origin}${fixtureUrl}?screen=checkout${returnQuery}`);
  return { context, page };
}

test("shows Shopify quantity errors and keeps the saved bag visible", async () => {
  const savedCart = { id: "gid://shopify/Cart/already-saved", totalQuantity: 1 };
  const { context, page } = await openCart({ savedCart });
  let mutation;
  await page.route("**/api/shopify/cart**", async (route) => {
    if (route.request().method() !== "PATCH") {
      await route.continue();
      return;
    }
    mutation = route.request().postDataJSON();
    await route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({ error: "This item is no longer available." }),
    });
  });

  await page.getByTestId("button-increase-quantity").click();
  await page.getByRole("alert").getByText(/This item is no longer available/).waitFor();

  assert.deepEqual(mutation, {
    cartId: savedCart.id,
    lines: [{ id: cartResponse.lines[0].id, quantity: 2 }],
  });
  assert.equal(await page.getByTestId("text-quantity").innerText(), "1");
  assert.equal(await page.getByRole("heading", { name: "Kanchipuram silk saree" }).isVisible(), true);
  assert.deepEqual(
    await page.evaluate(() => JSON.parse(localStorage.getItem("kq-shopify-cart"))),
    savedCart,
  );
  await context.close();
});

test("hides Shopify's placeholder variant title from shoppers", async () => {
  const product = await openProduct();
  assert.equal(await product.page.locator(".shopify-variant-select").count(), 0);
  assert.equal(await product.page.getByText("Default Title").count(), 0);
  await product.context.close();

  const savedCart = { id: "gid://shopify/Cart/default-title-cart", totalQuantity: 1 };
  const cart = await openCart({ savedCart });
  assert.equal(await cart.page.locator(".cart-variant").count(), 0);
  assert.equal(await cart.page.getByText("Default Title").count(), 0);
  await cart.context.close();

  const checkout = await openCheckout({
    savedCart,
    onCartRequest: (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ...cartResponse, id: savedCart.id }),
    }),
  });
  await checkout.page.getByTestId("button-submit-checkout-details").waitFor();
  assert.equal(await checkout.page.getByText("Default Title").count(), 0);
  await checkout.context.close();
});

test("shows Shopify cart user errors without clearing the shopper's saved bag", async () => {
  const savedCart = { id: "gid://shopify/Cart/already-saved", totalQuantity: 2 };
  const { context, page } = await openProduct({ savedCart });
  const mutations = [];
  await page.route("**/api/shopify/cart**", async (route) => {
    mutations.push(route.request().postDataJSON());
    await route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({ error: "This item is no longer available." }),
    });
  });

  await page.getByTestId("button-add-shopify-to-cart").click();
  await page.getByRole("alert").getByText("This item is no longer available.").waitFor();
  assert.deepEqual(mutations, [{
    cartId: savedCart.id,
    merchandiseId: variantId,
    quantity: 1,
  }]);
  assert.deepEqual(
    await page.evaluate(() => JSON.parse(localStorage.getItem("kq-shopify-cart"))),
    savedCart,
  );
  await context.close();
});

test("opens the website checkout from a Shopify bag without a Shopify checkout URL", async () => {
  const { context, page } = await openProduct();
  await page.route("**/api/shopify/cart**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(cartResponse),
    });
  });

  await page.getByTestId("button-add-shopify-to-cart").click();
  await page.getByRole("status").getByText(/Added to your Shopify bag/).waitFor();
  await page.getByTestId("header-cart-count").getByText("1").waitFor();
  assert.deepEqual(
    await page.evaluate(() => JSON.parse(localStorage.getItem("kq-shopify-cart"))),
    { id: cartResponse.id, totalQuantity: 1 },
  );

  const viewBagLink = page.getByRole("link", { name: "View bag →" });
  await viewBagLink.click();
  await page.waitForURL("**/Cart", { timeout: 5000 });
  await page.getByTestId("text-cart-items-count").getByText(/Shopify products · 1 piece/).waitFor();
  const checkoutLink = page.getByTestId("link-site-checkout");
  assert.equal(await checkoutLink.getAttribute("href"), "/Checkout");
  assert.equal(await checkoutLink.getAttribute("target"), null);
  assert.match(await page.locator(".secure-caption").last().innerText(), /Cashfree/);
  await context.close();
});

test("Buy now saves the selected Shopify product to the guest bag before checkout", async () => {
  const { context, page } = await openProduct();
  let cartMutation;
  await page.route("**/api/shopify/cart**", async (route) => {
    cartMutation = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(cartResponse),
    });
  });

  await page.getByTestId("button-buy-shopify-now").click();
  await page.waitForURL("**/Checkout", { timeout: 5000 });
  assert.equal(cartMutation.merchandiseId, variantId);
  assert.equal(cartMutation.quantity, 1);
  assert.deepEqual(
    await page.evaluate(() => JSON.parse(localStorage.getItem("kq-shopify-cart"))),
    { id: cartResponse.id, totalQuantity: cartResponse.totalQuantity },
  );
  await context.close();
});

test("quotes the current address and hands payment to Cashfree without Shopify checkout", async () => {
  const savedCart = { id: "gid://shopify/Cart/cashfree-browser-cart", totalQuantity: 1 };
  const quoteRequests = [];
  let paymentSessionRequest;
  let paymentStatusChecks = 0;
  const { context, page } = await openCheckout({
    savedCart,
    holdCashfreeCheckout: true,
    onCartRequest: (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ...cartResponse, id: savedCart.id }),
    }),
    onQuoteRequest: async (route) => {
      quoteRequests.push(route.request().postDataJSON());
      const quoteId = `quote-${quoteRequests.length}`;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          quoteId,
          expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
          destinationCountryCode: "IN",
          currencyCode: "INR",
          itemSubtotal: "1250.00",
          discountAmount: "0.00",
          shippingAmount: "100.00",
          taxAmount: "0.00",
          totalAmount: "1350.00",
          carrier: "Shiprocket",
          courierName: "Economy",
          parcelCount: 1,
          excludedCharges: ["Import duties and customs charges"],
        }),
      });
    },
    onPaymentSessionRequest: async (route) => {
      paymentSessionRequest = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          orderId: "cashfree-order-123",
          paymentSessionId: "sandbox-session-123",
          amount: "1350.00",
          currencyCode: "INR",
          environment: "sandbox",
        }),
      });
    },
    onPaymentStatusRequest: async (route) => {
      assert.equal(new URL(route.request().url()).searchParams.get("orderId"), "cashfree-order-123");
      paymentStatusChecks += 1;
      const confirmed = paymentStatusChecks > 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          orderId: "cashfree-order-123",
          status: confirmed ? "shopify_synced" : "payment_pending",
          paymentStatus: confirmed ? "PAID" : "PENDING",
          shopifyOrderName: confirmed ? "#1001" : null,
          message: confirmed ? "Payment confirmed." : "Cashfree is still processing this payment.",
        }),
      });
    },
  });

  await page.getByTestId("input-checkout-email").fill("buyer@example.com");
  await page.getByTestId("input-checkout-phone").fill("+919876543210");
  await page.getByTestId("input-checkout-recipient").fill("Asha Rao");
  await page.getByTestId("input-checkout-address1").fill("12 Example Road");
  await page.getByTestId("input-checkout-city").fill("Chennai");
  await page.getByTestId("input-checkout-state").fill("Tamil Nadu");
  await page.getByTestId("input-checkout-postal").fill("600001");

  const checkoutButton = page.getByTestId("button-submit-checkout-details");
  await checkoutButton.click();
  await page.getByTestId("text-checkout-total").getByText(/1,350/).waitFor();
  assert.match(await page.getByTestId("text-checkout-item-subtotal").innerText(), /1,250/);
  assert.match(await page.getByTestId("text-checkout-shipping").innerText(), /100/);
  assert.equal(await page.getByTestId("text-checkout-tax").count(), 0);
  assert.match(await page.getByTestId("checkout-customs-note").innerText(), /duties and customs charges are excluded/i);
  assert.match(await checkoutButton.innerText(), /Continue to Cashfree/i);
  assert.deepEqual(quoteRequests[0], {
    cartId: savedCart.id,
    email: "buyer@example.com",
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

  await page.getByTestId("input-checkout-city").fill("Coimbatore");
  await checkoutButton.getByText(/Get delivery quote/).waitFor();
  assert.equal(await page.getByTestId("text-checkout-total").count(), 0);
  await checkoutButton.click();
  await page.getByTestId("text-checkout-total").getByText(/1,350/).waitFor();
  assert.equal(quoteRequests.length, 2);
  assert.equal(quoteRequests[1].deliveryAddress.city, "Coimbatore");

  await checkoutButton.click();
  await page.waitForFunction(() => window.__cashfreeCalls?.length === 1);
  await page.waitForFunction(() => typeof window.__cashfreeCheckoutResolver === "function");
  assert.deepEqual(paymentSessionRequest, { quoteId: "quote-2" });
  assert.deepEqual(await page.evaluate(() => window.__cashfreeCalls), [{
    mode: "sandbox",
    paymentSessionId: "sandbox-session-123",
    redirectTarget: "_modal",
  }]);
  await page.getByTestId("status-cashfree-payment").getByRole("heading", { name: "Payment is pending." }).waitFor();
  assert.match(await page.getByTestId("status-cashfree-payment").innerText(), /scan its QR code with your phone/i);
  await page.getByRole("button", { name: /Check payment status/i }).click();
  await page.getByTestId("status-cashfree-payment").getByRole("heading", { name: "Your order is recorded." }).waitFor();
  assert.ok(paymentStatusChecks >= 2);
  await context.close();
});

test("shows a bare Silk catalog tag under the Silk and Kanchipuram filters", async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.route("**/api/shopify/products", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(productResponse),
  }));
  await page.goto(`${origin}${fixtureUrl}?screen=collections&fabric=Silk&weave=Kanchipuram`);
  const productTitle = page.getByText("Kanchipuram silk saree", { exact: true });
  await productTitle.waitFor();
  assert.equal(await productTitle.isVisible(), true);
  await context.close();
});

test("applies shopper-entered discount codes to the Shopify bag", async () => {
  const savedCart = { id: "gid://shopify/Cart/browser-cart-123", totalQuantity: 1 };
  const { context, page } = await openCart({ savedCart });
  let mutation;
  await page.route("**/api/shopify/cart/discount-codes", async (route) => {
    mutation = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...cartResponse,
        discountAmount: "125.00",
        totalAmount: "1125.00",
        discountCodes: [{ code: "SILK10", applicable: true }],
      }),
    });
  });

  await page.getByTestId("input-shopify-discount-code").fill("SILK10");
  await page.getByTestId("button-apply-shopify-discount").click();
  await page.getByTestId("status-shopify-discount").waitFor();
  assert.deepEqual(mutation, { cartId: savedCart.id, discountCodes: ["SILK10"] });
  assert.match(await page.getByTestId("status-shopify-discount").innerText(), /SILK10.*applied/i);
  assert.match(await page.getByTestId("text-shopify-cart-discount").innerText(), /125/);
  assert.match(await page.getByTestId("text-shopify-cart-total").innerText(), /1,125/);
  await context.close();
});

test("shows discounted final item prices plus the address-based carrier quote", async () => {
  const savedCart = { id: "gid://shopify/Cart/discounted-quote-cart", totalQuantity: 1 };
  const { context, page } = await openCheckout({
    savedCart,
    onCartRequest: (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...cartResponse,
        id: savedCart.id,
        discountAmount: "125.00",
        totalAmount: "1125.00",
        discountCodes: [{ code: "SILK10", applicable: true }],
      }),
    }),
    onQuoteRequest: (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        quoteId: "discounted-quote",
        expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
        destinationCountryCode: "IN",
        currencyCode: "INR",
        itemSubtotal: "1250.00",
        discountAmount: "125.00",
        shippingAmount: "100.00",
        taxAmount: "0.00",
        totalAmount: "1225.00",
        carrier: "Shiprocket",
        courierName: "Economy",
        parcelCount: 1,
        excludedCharges: [],
      }),
    }),
  });

  assert.equal(await page.getByTestId("text-checkout-total").count(), 0);
  await page.getByTestId("input-checkout-email").fill("buyer@example.com");
  await page.getByTestId("input-checkout-phone").fill("+919876543210");
  await page.getByTestId("input-checkout-recipient").fill("Asha Rao");
  await page.getByTestId("input-checkout-address1").fill("12 Example Road");
  await page.getByTestId("input-checkout-city").fill("Chennai");
  await page.getByTestId("input-checkout-postal").fill("600001");
  await page.getByTestId("button-submit-checkout-details").click();
  await page.getByTestId("text-checkout-total").getByText(/1,225/).waitFor();
  assert.match(await page.getByTestId("text-checkout-item-subtotal").innerText(), /1,250/);
  assert.match(await page.getByTestId("text-checkout-discount").innerText(), /125/);
  assert.match(await page.getByTestId("text-checkout-shipping").innerText(), /100/);
  assert.equal(await page.getByTestId("text-checkout-tax").count(), 0);
  await context.close();
});

test("shows only server-verified Shopify order status after Cashfree returns", async () => {
  const savedCart = { id: "gid://shopify/Cart/verified-return-cart", totalQuantity: 1 };
  const orderId = "cashfree-return-123";
  const { context, page } = await openCheckout({
    savedCart,
    returnOrderId: orderId,
    onCartRequest: (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ...cartResponse, id: savedCart.id }),
    }),
    onPaymentStatusRequest: async (route) => {
      assert.equal(new URL(route.request().url()).searchParams.get("orderId"), orderId);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          orderId,
          status: "shopify_synced",
          paymentStatus: "PAID",
          shopifyOrderName: "#1001",
          message: "Sandbox payment verified and Shopify test order recorded; no shipment was booked.",
        }),
      });
    },
  });

  await page.getByTestId("status-cashfree-payment").getByRole("heading", { name: "Your order is recorded." }).waitFor();
  assert.match(await page.getByTestId("status-cashfree-payment").innerText(), /Shopify test order recorded; no shipment was booked/i);
  assert.equal(await page.getByRole("link", { name: /View your orders/ }).getAttribute("href"), "/Orders");
  await context.close();
});

test("explains the India market setup blocker instead of showing an empty checkout", async () => {
  const savedCart = { id: "gid://shopify/Cart/india-market-cart", totalQuantity: 0 };
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addInitScript((cart) => localStorage.setItem("kq-shopify-cart", JSON.stringify(cart)), savedCart);
  const page = await context.newPage();
  await page.route("**/api/shopify/cart**", (route) => route.fulfill({
    status: 409,
    contentType: "application/json",
    body: JSON.stringify({ error: "This store is not currently set up to deliver to India. Please contact the store owner." }),
  }));
  await page.goto(`${origin}${fixtureUrl}?screen=cart`);
  await page.getByTestId("error-shopify-cart-load").getByText(/not currently set up to deliver to India/i).waitFor();
  assert.equal(await page.getByTestId("link-site-checkout").count(), 0);
  await context.close();
});

test("does not claim a product was added when Shopify blocks the India market", async () => {
  const { context, page } = await openProduct();
  await page.route("**/api/shopify/cart", (route) => route.fulfill({
    status: 409,
    contentType: "application/json",
    body: JSON.stringify({ error: "This store is not currently set up to deliver to India. Please contact the store owner." }),
  }));

  await page.getByTestId("button-add-shopify-to-cart").click();
  await page.getByRole("alert").getByText(/not currently set up to deliver to India/i).waitFor();
  assert.equal(await page.evaluate(() => localStorage.getItem("kq-shopify-cart")), null);
  await context.close();
});

test("retries a failed checkout cart refresh with the same saved cart ID", async () => {
  const savedCart = { id: "gid://shopify/Cart/retry-saved-cart", totalQuantity: 1 };
  const requestedCartIds = [];
  let attempt = 0;
  const { context, page } = await openCheckout({
    savedCart,
    onCartRequest: async (route) => {
      const requestUrl = new URL(route.request().url());
      requestedCartIds.push(requestUrl.searchParams.get("cartId"));
      attempt += 1;
      if (attempt === 1) {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "Shopify is temporarily unavailable." }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ...cartResponse, id: savedCart.id }),
      });
    },
  });

  await page.getByRole("alert").getByText(/Shopify is temporarily unavailable/).waitFor();
  assert.equal(await page.getByTestId("button-retry-shopify-cart-refresh").isVisible(), true);
  await page.getByTestId("button-retry-shopify-cart-refresh").click();

  const checkoutButton = page.getByTestId("button-submit-checkout-details");
  await checkoutButton.waitFor();
  assert.deepEqual(requestedCartIds, [savedCart.id, savedCart.id]);
  assert.deepEqual(
    await page.evaluate(() => JSON.parse(localStorage.getItem("kq-shopify-cart"))),
    savedCart,
  );
  await context.close();
});

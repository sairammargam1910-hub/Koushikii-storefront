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
    attributes: { fabric: "Silk", regionalHandloom: null, craftTechnique: "Kanchipuram", region: "Tamil Nadu", colour: "Maroon" },
    collections: [],
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
const liveCollectionProducts = [
  {
    ...productResponse.products[0],
    id: "gid://shopify/Product/cotton",
    handle: "cotton-fixture",
    title: "Cotton handloom saree",
    tags: ["cotton"],
    attributes: { fabric: "Cotton", regionalHandloom: null, craftTechnique: null, region: "Telangana", colour: "Maroon" },
    collections: [{ id: "gid://shopify/Collection/cotton", handle: "cotton-collection", title: "Cotton Collection" }],
    variants: [{ ...productResponse.products[0].variants[0], id: "gid://shopify/ProductVariant/cotton" }],
  },
  {
    ...productResponse.products[0],
    id: "gid://shopify/Product/silk",
    handle: "silk-fixture",
    title: "Silk handloom saree",
    tags: ["silk"],
    attributes: { fabric: "Silk", regionalHandloom: null, craftTechnique: null, region: "Tamil Nadu", colour: "Gold" },
    collections: [{ id: "gid://shopify/Collection/silk", handle: "silk-collection", title: "Silk Collection" }],
    variants: [{ ...productResponse.products[0].variants[0], id: "gid://shopify/ProductVariant/silk" }],
  },
  {
    ...productResponse.products[0],
    id: "gid://shopify/Product/narayanpet",
    handle: "narayanpet-fixture",
    title: "Narayanpet cotton saree",
    tags: ["cotton", "narayanpet"],
    attributes: { fabric: "Cotton", regionalHandloom: "Narayanpet", craftTechnique: null, region: "Telangana", colour: "Maroon" },
    collections: [],
    variants: [{ ...productResponse.products[0].variants[0], id: "gid://shopify/ProductVariant/narayanpet" }],
  },
  {
    ...productResponse.products[0],
    id: "gid://shopify/Product/ikkat",
    handle: "ikkat-fixture",
    title: "Ikkat cotton saree",
    tags: ["cotton", "ikkat"],
    attributes: { fabric: "Cotton", regionalHandloom: null, craftTechnique: "Ikkat", region: "Telangana", colour: "Indigo" },
    collections: [],
    variants: [{ ...productResponse.products[0].variants[0], id: "gid://shopify/ProductVariant/ikkat" }],
  },
];
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

async function assertNoProviderBrandInPublicCopy(page) {
  const copy = await page.locator("body").evaluate((root) => [
    root.innerText,
    ...Array.from(root.querySelectorAll("[aria-label], [title], [alt], [placeholder]"))
      .flatMap((element) => ["aria-label", "title", "alt", "placeholder"].map((attribute) => element.getAttribute(attribute) ?? "")),
  ].join("\n"));
  assert.doesNotMatch(copy, /Shopify|Cashfree|Shiprocket|Delhivery|Xpressbees|Blue Dart/i);
}

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

async function openCart({
  savedCart,
  viewport = { width: 1280, height: 900 },
  mutationDelay = 0,
}) {
  const context = await browser.newContext({ viewport });
  await context.addInitScript((cart) => localStorage.setItem("kq-shopify-cart", JSON.stringify(cart)), savedCart);
  const page = await context.newPage();
  page.on("pageerror", (error) => console.error("[shopify-browser-page-error]", error.message));
  const requests = [];
  let currentCart = {
    ...cartResponse,
    id: savedCart.id,
    lines: savedCart.lines ?? [{
      ...cartResponse.lines[0],
      quantity: savedCart.totalQuantity ?? cartResponse.totalQuantity,
    }],
  };
  const refreshTotals = () => {
    currentCart.totalQuantity = currentCart.lines.reduce((sum, line) => sum + line.quantity, 0);
    const subtotal = currentCart.lines.reduce(
      (sum, line) => sum + Number(line.unitPrice) * line.quantity,
      0,
    );
    currentCart.subtotalAmount = subtotal.toFixed(2);
    currentCart.totalAmount = subtotal.toFixed(2);
  };
  refreshTotals();
  await page.route("**/api/shopify/cart**", async (route) => {
    const request = route.request();
    const method = request.method();
    if (method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(currentCart),
      });
      return;
    }
    const body = request.postDataJSON();
    requests.push({ method, url: new URL(request.url()).pathname, body });
    if (mutationDelay > 0) await new Promise((resolve) => setTimeout(resolve, mutationDelay));
    if (method === "PATCH") {
      for (const update of body.lines) {
        const line = currentCart.lines.find((item) => item.id === update.id);
        if (line) line.quantity = update.quantity;
      }
    } else if (method === "POST" && request.url().includes("/remove-lines")) {
      currentCart.lines = currentCart.lines.filter((line) => !body.lineIds.includes(line.id));
    }
    refreshTotals();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(currentCart),
    });
  });
  await page.goto(`${origin}${fixtureUrl}?screen=cart`);
  await page.getByRole("heading", { name: "Kanchipuram silk saree" }).waitFor({ timeout: 5000 });
  return { context, page, requests };
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
  await page.getByRole("status").getByText(/Added to your bag/).waitFor();
  await page.getByTestId("header-cart-count").getByText("1").waitFor();
  assert.deepEqual(
    await page.evaluate(() => JSON.parse(localStorage.getItem("kq-shopify-cart"))),
    { id: cartResponse.id, totalQuantity: 1 },
  );

  const viewBagLink = page.getByRole("link", { name: "View bag →" });
  await viewBagLink.click();
  await page.waitForURL("**/Cart", { timeout: 5000 });
  await page.getByTestId("text-cart-items-count").getByText(/Your pieces · 1 piece/).waitFor();
  const checkoutLink = page.getByTestId("link-site-checkout");
  assert.equal(await checkoutLink.getAttribute("href"), "/Checkout");
  assert.equal(await checkoutLink.getAttribute("target"), null);
  assert.match(await page.locator(".secure-caption").last().innerText(), /pay securely online/i);
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
          courierName: "Delhivery Surface 2 Kgs",
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
  assert.match(await checkoutButton.innerText(), /Continue to secure payment/i);
  await assertNoProviderBrandInPublicCopy(page);
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

test("collection query changes update products immediately on desktop and mobile", async () => {
  for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({
      viewport,
      isMobile: viewport.width < 600,
      hasTouch: viewport.width < 600,
    });
    const page = await context.newPage();
    let catalogRequests = 0;
    let documentRequests = 0;
    page.on("request", (request) => {
      if (request.url().includes("/api/shopify/products")) catalogRequests += 1;
      if (request.isNavigationRequest()) documentRequests += 1;
    });
    await page.route("**/api/shopify/products", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ products: liveCollectionProducts }),
    }));
    await page.goto(`${origin}${fixtureUrl}?screen=collections`);
    await page.getByTestId("card-shopify-cotton-fixture").waitFor();
    assert.equal(await page.locator("[data-testid^='card-shopify-']").count(), 4);
    const initialDocumentRequests = documentRequests;

    const changeQuery = async (key, value) => page.evaluate(({ key, value }) => {
      const url = new URL(window.location.href);
      url.pathname = "/Collections";
      url.search = "";
      url.searchParams.set(key, value);
      window.history.pushState({}, "", url);
    }, { key, value });

    await changeQuery("fabric", "Cotton");
    await page.getByTestId("card-shopify-cotton-fixture").waitFor();
    assert.equal(await page.locator("[data-testid^='card-shopify-']").count(), 3);
    assert.equal(await page.getByTestId("card-shopify-silk-fixture").count(), 0);

    await page.evaluate(() => window.scrollTo(0, 250));
    await page.waitForFunction(() => window.scrollY > 0);
    const filterScroll = await page.evaluate(() => window.scrollY);
    await page.evaluate(() => {
      const url = new URL(window.location.href);
      url.searchParams.set("minPrice", "1000");
      window.history.pushState({}, "", url);
    });
    await page.getByTestId("card-shopify-cotton-fixture").waitFor();
    await page.getByRole("button", { name: /Price: 1000/ }).waitFor();
    assert.ok(filterScroll > 0 && await page.evaluate(() => window.scrollY > 0), "adding a filter within the same collection should not jump to the top");

    await page.evaluate(() => window.scrollTo(0, 450));
    await page.waitForFunction(() => window.scrollY > 0);
    await changeQuery("fabric", "Silk");
    await page.getByTestId("card-shopify-silk-fixture").waitFor();
    assert.equal(await page.locator("[data-testid^='card-shopify-']").count(), 1);
    await page.waitForFunction(() => window.scrollY === 0);

    await changeQuery("regionalHandloom", "Narayanpet");
    await page.getByTestId("card-shopify-narayanpet-fixture").waitFor();
    assert.equal(await page.locator("[data-testid^='card-shopify-']").count(), 1);
    await changeQuery("weave", "Ikkat");
    await page.getByTestId("card-shopify-ikkat-fixture").waitFor();
    assert.equal(await page.locator("[data-testid^='card-shopify-']").count(), 1);
    await page.goBack();
    await page.waitForURL(/\/Collections\?regionalHandloom=Narayanpet/);
    await page.getByTestId("card-shopify-narayanpet-fixture").waitFor();
    await page.goForward();
    await page.waitForURL(/\/Collections\?weave=Ikkat/);
    await page.getByTestId("card-shopify-ikkat-fixture").waitFor();

    assert.equal(catalogRequests, 1, "changing client-side filters should use the loaded catalog without another page or API reload");
    assert.equal(documentRequests, initialDocumentRequests, "filter navigation should not reload the document");
    await page.reload();
    await page.getByTestId("card-shopify-ikkat-fixture").waitFor();
    assert.equal(await page.locator("[data-testid^='card-shopify-']").count(), 1, "refresh should preserve the selected collection filter");
    await context.close();
  }
});

test("homepage collection links start at the top and browser back restores listing position", async () => {
  for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({
      viewport,
      isMobile: viewport.width < 600,
      hasTouch: viewport.width < 600,
    });
    const page = await context.newPage();
    await page.route("**/api/shopify/products", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ products: liveCollectionProducts }),
    }));
    await page.route("**/api/site-content", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items: [] }),
    }));
    await page.goto(`${origin}${fixtureUrl}?screen=home`);
    const collectionLink = page.locator(".home-weave-section .weave-grid > a").filter({
      has: page.getByRole("heading", { name: "Cotton Collection", exact: true }),
    });
    await collectionLink.waitFor();
    await page.evaluate(() => window.scrollTo(0, 700));
    await page.waitForFunction(() => window.scrollY > 0);
    await collectionLink.click();
    await page.waitForURL(/\/Collections\?collection=cotton-collection/);
    await page.getByTestId("card-shopify-cotton-fixture").waitFor();
    await page.waitForFunction(() => window.scrollY === 0);

    const savedListingScroll = await page.evaluate(async () => {
      window.scrollTo(0, 250);
      await new Promise((resolve) => requestAnimationFrame(resolve));
      return window.scrollY;
    });
    assert.ok(savedListingScroll > 0, "listing page should have a restorable scroll position");
    await page.getByTestId("card-shopify-cotton-fixture").getByRole("link").first().click();
    await page.waitForURL(/\/Product\?/);
    await page.goBack();
    await page.waitForURL(/\/Collections\?collection=cotton-collection/);
    await page.getByTestId("card-shopify-cotton-fixture").waitFor();
    await page.waitForFunction((expected) => Math.abs(window.scrollY - expected) < 2, savedListingScroll);
    if (viewport.width < 600) {
      await page.getByTestId("button-mobile-menu").click();
      await page.locator(".collection-nav summary").click();
      await page.locator(".collection-nav").getByRole("link", { name: "Narayanpet", exact: true }).click();
      await page.waitForURL(/\/Collections\?regionalHandloom=Narayanpet/);
      await page.getByTestId("card-shopify-narayanpet-fixture").waitFor();
      await page.waitForFunction(() => window.scrollY === 0);
    }
    await context.close();
  }
});

test("all published products appear without collections and dynamic filters use Shopify data", async () => {
  const unassignedProduct = {
    id: "gid://shopify/Product/unassigned-runner",
    handle: "hand-block-cotton-runner",
    title: "Hand-block cotton table runner",
    description: "A newly published home textile",
    productType: "Home textile",
    tags: [],
    attributes: {
      fabric: "Cotton",
      regionalHandloom: '["Narayanpet"]',
      craftTechnique: '["Block printing","Bagru"]',
      region: "Telangana",
      colour: "Indigo",
    },
    collections: [],
    images: [],
    variants: [{
      id: "gid://shopify/ProductVariant/unassigned-runner",
      title: "Default Title",
      availableForSale: true,
      price: "1800.00",
      currencyCode: "INR",
      selectedOptions: [{ name: "Title", value: "Default Title" }],
    }],
  };
  const assignedProduct = {
    ...productResponse.products[0],
    collections: [{
      id: "gid://shopify/Collection/crafts",
      handle: "the-crafts-edit",
      title: "The Crafts Edit",
    }],
  };
  const customFabricProduct = {
    ...productResponse.products[0],
    id: "gid://shopify/Product/test-fabric",
    handle: "test-fabric-shawl",
    title: "Test fabric shawl",
    attributes: { fabric: "Test Fabric", regionalHandloom: null, craftTechnique: null, region: null, colour: null },
    collections: [],
  };
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.route("**/api/shopify/products", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ products: [assignedProduct, unassignedProduct, customFabricProduct] }),
  }));
  await page.goto(`${origin}${fixtureUrl}?screen=collections`);
  await page.getByText("Kanchipuram silk saree", { exact: true }).waitFor();
  await page.getByText("Hand-block cotton table runner", { exact: true }).waitFor();
  await assertNoProviderBrandInPublicCopy(page);
  assert.equal(await page.getByText("3 published products").count(), 1);
  assert.equal(await page.getByText(/Cotton handlooms · Explore regional weaves/i).count(), 0);
  assert.equal(await page.getByText(/Uncategorised/i).count(), 0);

  await page.locator(".filter-sort-drawer > summary").click();
  await page.locator(".filter-section.is-primary > summary").click();
  await page.getByLabel("Filter by fabric: Cotton").check();
  await page.getByLabel("Filter by fabric: Silk").check();
  await page.getByRole("button", { name: "Apply Filters" }).click();
  assert.equal(await page.getByText("2 published products").count(), 1, "two fabric selections use OR logic");
  await page.getByRole("button", { name: "Clear All" }).click();
  await page.getByLabel("Filter by fabric: Test Fabric").check();
  await page.getByRole("button", { name: "Apply Filters" }).click();
  await page.getByText("Test fabric shawl", { exact: true }).waitFor();
  assert.equal(await page.getByText("1 published product").count(), 1, "custom fabric filters should match only that value");
  assert.equal(await page.getByText("Hand-block cotton table runner", { exact: true }).count(), 0);
  await page.getByRole("button", { name: "Clear All" }).click();

  await page.locator(".filter-section").filter({ has: page.getByText("Regional Handloom", { exact: true }) }).locator("summary").click();
  await page.getByLabel("Filter by regional handloom: Narayanpet").check();
  await page.locator(".filter-section").filter({ has: page.getByText("Weave / Print", { exact: true }) }).locator("summary").click();
  await page.getByLabel("Filter by weave / print: Bagru").check();
  await page.getByRole("button", { name: "Apply Filters" }).click();
  assert.equal(await page.getByText("1 published product").count(), 1, "different classification groups use AND logic");
  assert.equal(await page.getByText("Kanchipuram silk saree", { exact: true }).count(), 0);
  await page.getByRole("button", { name: "Clear All" }).click();

  await page.locator(".filter-section").filter({ has: page.getByText("Collection", { exact: true }) }).locator("summary").click();
  const collectionFilter = page.getByLabel("Filter by collection");
  assert.deepEqual(await collectionFilter.locator("option").allTextContents(), ["All collections", "The Crafts Edit"]);
  await collectionFilter.selectOption("the-crafts-edit");
  await page.getByRole("button", { name: "Apply Filters" }).click();
  await page.getByText("Kanchipuram silk saree", { exact: true }).waitFor();
  assert.equal(await page.getByText("Hand-block cotton table runner", { exact: true }).count(), 0);

  await collectionFilter.selectOption("");
  await page.locator(".filter-section").filter({ has: page.getByText("Product Type", { exact: true }) }).locator("summary").click();
  await page.getByLabel("Filter by product type: Home textile").check();
  await page.getByRole("button", { name: "Apply Filters" }).click();
  await page.getByText("Hand-block cotton table runner", { exact: true }).waitFor();
  assert.equal(await page.getByText("Kanchipuram silk saree", { exact: true }).count(), 0);

  await page.locator(".filter-section").filter({ has: page.getByText("Colour", { exact: true }) }).locator("summary").click();
  await page.getByLabel("Filter by colour: Indigo").check();
  await page.getByRole("button", { name: "Apply Filters" }).click();
  await page.getByText("Hand-block cotton table runner", { exact: true }).waitFor();
  assert.equal(await page.getByText("Kanchipuram silk saree", { exact: true }).count(), 0);
  await context.close();
});

test("a Shopify catalog failure never substitutes the sample catalog", async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.route("**/api/shopify/products", (route) => route.fulfill({
    status: 503,
    contentType: "application/json",
    body: JSON.stringify({ error: "Shopify temporarily unavailable" }),
  }));
  await page.goto(`${origin}${fixtureUrl}?screen=collections`);
  await page.getByRole("heading", { name: "We couldn’t load the products just now." }).waitFor({ timeout: 15000 });
  assert.equal(await page.getByText("Nila Ikat", { exact: true }).count(), 0);
  assert.equal(await page.getByRole("button", { name: "Sarees", exact: true }).count(), 0);
  await assertNoProviderBrandInPublicCopy(page);
  await context.close();
});

test("The Crafts Edit tile uses its assigned Shopify collection and adapts on mobile", async () => {
  const tileProduct = {
    ...productResponse.products[0],
    images: [{
      url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8'%3E%3Crect width='8' height='8' fill='%23b22222'/%3E%3C/svg%3E",
      altText: "Crafted silk detail",
    }],
    collections: [{
      id: "gid://shopify/Collection/crafts",
      handle: "the-crafts-edit",
      title: "The Crafts Edit",
    }],
  };
  const openHome = async (viewport, products, contentItems = []) => {
    const context = await browser.newContext({ viewport, isMobile: viewport.width < 600, hasTouch: viewport.width < 600 });
    const page = await context.newPage();
    await page.route("**/api/shopify/products", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ products }),
    }));
    await page.route("**/api/site-content", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items: contentItems }),
    }));
    await page.goto(`${origin}${fixtureUrl}?screen=home`);
    return { context, page };
  };
  const assertHorizontalTrack = async (track) => {
    await track.waitFor();
    assert.equal(await track.getAttribute("role"), "region");
    const metrics = await track.evaluate((element) => ({
      overflowX: getComputedStyle(element).overflowX,
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
    }));
    assert.equal(metrics.overflowX, "auto");
    assert.ok(metrics.scrollWidth > metrics.clientWidth, "track should overflow horizontally rather than add vertical rows");
    await track.evaluate((element) => { element.scrollLeft = element.scrollWidth; });
    assert.ok(await track.evaluate((element) => element.scrollLeft > 0), "track should be horizontally scrollable");
  };

  const withoutCollection = await openHome({ width: 1280, height: 900 }, [productResponse.products[0]]);
  await withoutCollection.page.getByRole("heading", { name: "Shop by Fabric" }).waitFor();
  await assertNoProviderBrandInPublicCopy(withoutCollection.page);
  assert.equal(await withoutCollection.page.locator(".home-fabric-section .fabric-card").count(), 3);
  await withoutCollection.page.getByRole("heading", { name: "Shop by Collection", exact: true }).waitFor();
  assert.equal(await withoutCollection.page.locator(".home-regional-section").count(), 0);
  assert.equal(await withoutCollection.page.locator(".home-weave-section .weave-grid > a").count(), 13);
  await withoutCollection.page.getByRole("heading", { name: "Shop by Weave", exact: true }).waitFor();
  await assertHorizontalTrack(withoutCollection.page.locator(".home-technique-section .home-horizontal-track"));
  await assertHorizontalTrack(withoutCollection.page.locator(".home-weave-section .home-horizontal-track"));
  assert.equal(await withoutCollection.page.getByRole("heading", { name: "The Crafts Edit", exact: true }).count(), 0);
  await withoutCollection.page.getByRole("heading", { name: "New Arrivals", exact: true }).waitFor();
  assert.equal(await withoutCollection.page.getByRole("heading", { name: "Kanchipuram silk saree", exact: true }).count(), 1);
  assert.equal(await withoutCollection.page.getByRole("heading", { name: "Premium Collection", exact: true }).count(), 0);
  await withoutCollection.context.close();

  const premiumTaggedProduct = {
    ...productResponse.products[0],
    id: "gid://shopify/Product/457",
    handle: "premium-tagged-saree",
    title: "Premium tagged saree",
    tags: ["premium"],
    collections: [{
      id: "gid://shopify/Collection/kanchipuram",
      handle: "kanchipuram",
      title: "Kanchipuram",
    }],
  };
  const premiumCollectionProduct = {
    ...productResponse.products[0],
    id: "gid://shopify/Product/458",
    handle: "premium-collection-saree",
    title: "Premium collection saree",
    tags: [],
    collections: [{
      id: "gid://shopify/Collection/premium",
      handle: "premium-collection",
      title: "Premium Collection",
    }, {
      id: "gid://shopify/Collection/kanchipuram",
      handle: "kanchipuram",
      title: "Kanchipuram",
    }],
  };
  const regularCollectionProduct = {
    ...productResponse.products[0],
    id: "gid://shopify/Product/459",
    handle: "regular-saree",
    title: "Regular saree",
    tags: [],
    collections: [{
      id: "gid://shopify/Collection/kanchipuram",
      handle: "kanchipuram",
      title: "Kanchipuram",
    }],
  };
  const featuredOnlyProduct = {
    ...productResponse.products[0],
    id: "gid://shopify/Product/460",
    handle: "featured-only-saree",
    title: "Featured only saree",
    tags: ["featured"],
    collections: [{
      id: "gid://shopify/Collection/banarasi",
      handle: "banarasi",
      title: "Banarasi",
    }],
  };
  const premiumHome = await openHome({ width: 1280, height: 900 }, [
    premiumTaggedProduct,
    premiumCollectionProduct,
    regularCollectionProduct,
    featuredOnlyProduct,
  ]);
  const premiumTile = premiumHome.page.locator(".home-premium-collection");
  await premiumHome.page.locator(".home-premium-section").waitFor();
  assert.equal(await premiumTile.count(), 1, "only collections containing premium items should be shown");
  assert.match(await premiumTile.getAttribute("href"), /Collections\?premium=1&premiumCategory=Kanchipuram$/);
  assert.match(await premiumTile.innerText(), /Kanchipuram[\s\S]*2 premium pieces/i);
  assert.equal(await premiumHome.page.locator(".home-premium-art img").count(), 0, "category art should not reuse a product photo");
  const desktopPremiumGrid = await premiumHome.page.locator(".home-premium-tiles").evaluate((element) => ({
    columns: getComputedStyle(element).gridTemplateColumns.split(" ").length,
    tileWidth: element.querySelector(".home-premium-collection")?.getBoundingClientRect().width ?? 0,
  }));
  assert.equal(desktopPremiumGrid.columns, 3, "desktop premium artwork should keep three collection slots");
  assert.ok(desktopPremiumGrid.tileWidth < 300, "one category should not stretch into an oversized product panel");
  await premiumHome.page.goto(`${origin}${fixtureUrl}?screen=collections&premium=1&premiumCategory=Kanchipuram`);
  await premiumHome.page.getByRole("heading", { name: "Premium Collection", exact: true }).waitFor();
  assert.equal(await premiumHome.page.locator(".shopify-product-card").count(), 2);
  assert.equal(await premiumHome.page.getByRole("heading", { name: "Premium tagged saree", exact: true }).count(), 1);
  assert.equal(await premiumHome.page.getByRole("heading", { name: "Premium collection saree", exact: true }).count(), 1);
  assert.equal(await premiumHome.page.getByRole("heading", { name: "Regular saree", exact: true }).count(), 0);
  assert.equal(await premiumHome.page.getByRole("heading", { name: "Featured only saree", exact: true }).count(), 0);
  await premiumHome.context.close();

  const premiumTraditionProduct = {
    ...productResponse.products[0],
    id: "gid://shopify/Product/462",
    handle: "premium-test-tradition",
    title: "Premium test tradition saree",
    tags: ["Premium"],
    attributes: { ...productResponse.products[0].attributes, regionalHandloom: "test tradition" },
    collections: [],
  };
  const regularTraditionProduct = {
    ...premiumTraditionProduct,
    id: "gid://shopify/Product/463",
    handle: "regular-test-tradition",
    title: "Regular test tradition saree",
    tags: [],
  };
  const premiumTraditionHome = await openHome({ width: 1280, height: 900 }, [
    premiumTraditionProduct,
    regularTraditionProduct,
  ]);
  const traditionTile = premiumTraditionHome.page.locator(".home-premium-collection");
  await premiumTraditionHome.page.locator(".home-premium-section").waitFor();
  assert.equal(await traditionTile.count(), 1, "a premium regional tradition should create a browse tile without Shopify collection membership");
  assert.match(await traditionTile.getAttribute("href"), /Collections\?premium=1&premiumCategory=test%20tradition$/);
  assert.match(await traditionTile.innerText(), /test tradition[\s\S]*1 premium piece/i);
  await premiumTraditionHome.page.goto(`${origin}${fixtureUrl}?screen=collections&premium=1&premiumCategory=test%20tradition`);
  assert.equal(await premiumTraditionHome.page.locator(".shopify-product-card").count(), 1);
  assert.equal(await premiumTraditionHome.page.getByRole("heading", { name: "Premium test tradition saree", exact: true }).count(), 1);
  assert.equal(await premiumTraditionHome.page.getByRole("heading", { name: "Regular test tradition saree", exact: true }).count(), 0);
  await premiumTraditionHome.context.close();

  const premiumTraditionMobile = await openHome({ width: 390, height: 844 }, [premiumTraditionProduct]);
  await premiumTraditionMobile.page.locator(".home-premium-section").waitFor();
  const mobilePremiumGrid = await premiumTraditionMobile.page.locator(".home-premium-tiles").evaluate((element) => ({
    columns: getComputedStyle(element).gridTemplateColumns.split(" ").length,
    tileWidth: element.querySelector(".home-premium-collection")?.getBoundingClientRect().width ?? 0,
  }));
  assert.equal(mobilePremiumGrid.columns, 2, "mobile premium artwork should keep compact collection slots");
  assert.ok(mobilePremiumGrid.tileWidth < 200, "one mobile category should not stretch across the panel");
  assert.equal(await premiumTraditionMobile.page.locator(".home-premium-art img").count(), 0);
  await premiumTraditionMobile.context.close();

  const featuredOnlyHome = await openHome({ width: 1280, height: 900 }, [featuredOnlyProduct]);
  await featuredOnlyHome.page.getByRole("heading", { name: "Shop by Fabric" }).waitFor();
  assert.equal(await featuredOnlyHome.page.locator(".home-premium-section").count(), 0, "featured tag alone must not mark an item premium");
  await featuredOnlyHome.context.close();

  const premiumWithoutBrowseCollection = {
    ...premiumTaggedProduct,
    id: "gid://shopify/Product/461",
    handle: "premium-without-browse-collection",
    collections: [],
  };
  const noBrowseablePremiumHome = await openHome({ width: 1280, height: 900 }, [premiumWithoutBrowseCollection]);
  await noBrowseablePremiumHome.page.getByRole("heading", { name: "Shop by Fabric" }).waitFor();
  assert.equal(await noBrowseablePremiumHome.page.locator(".home-premium-section").count(), 0, "the premium panel should hide when premium items have no browseable collection");
  await noBrowseablePremiumHome.context.close();

  const customFabricProduct = {
    ...productResponse.products[0],
    attributes: { ...productResponse.products[0].attributes, fabric: "Test Fabric" },
  };
  const customFabricContent = [{
    id: "test-fabric-tile-image",
    kind: "home_image",
    placement: "fabric_tile",
    title: "Test Fabric",
    imageUrl: "https://cdn.example.test/test-fabric.webp",
    altText: "A close-up of the test fabric",
    published: true,
    approved: false,
    sortOrder: 0,
  }];
  const customFabricHome = await openHome({ width: 1280, height: 900 }, [customFabricProduct], customFabricContent);
  const testFabricTile = customFabricHome.page.locator(".home-fabric-section .fabric-card").filter({
    has: customFabricHome.page.getByRole("heading", { name: "Test Fabric", exact: true }),
  });
  await testFabricTile.waitFor();
  assert.match(await testFabricTile.getAttribute("href"), /Collections\?fabric=Test%20Fabric$/);
  assert.equal(await customFabricHome.page.locator(".home-fabric-section .fabric-card").filter({
    has: customFabricHome.page.getByRole("heading", { name: "Others", exact: true }),
  }).count(), 0, "a custom fabric should not be hidden in the generic Others tile");
  assert.equal(await testFabricTile.locator("img").getAttribute("src"), "https://cdn.example.test/test-fabric.webp");
  await assertHorizontalTrack(customFabricHome.page.locator(".home-fabric-section .home-horizontal-track"));
  await customFabricHome.context.close();

  for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    const { context, page } = await openHome(viewport, [tileProduct]);
    if (viewport.width < 600) await assertHorizontalTrack(page.locator(".home-fabric-section .home-horizontal-track"));
    await assertHorizontalTrack(page.locator(".home-technique-section .home-horizontal-track"));
    await assertHorizontalTrack(page.locator(".home-weave-section .home-horizontal-track"));
    const tile = page.locator(".home-weave-section").getByRole("link", { name: /The Crafts Edit/ });
    await tile.waitFor();
    assert.equal(await page.locator(".home-fabric-section").getByRole("link", { name: /The Crafts Edit/ }).count(), 0);
    assert.match(await tile.getAttribute("href"), /Collections\?collection=the-crafts-edit/);
    const bounds = await tile.boundingBox();
    assert.ok(bounds && bounds.width > 0 && bounds.height > 0);
    if (viewport.width < 600) {
      assert.ok(bounds.width > 120, "mobile collection tile should remain readable");
      assert.ok(bounds.x + bounds.width <= viewport.width + 1, "mobile collection tile should not overflow the viewport");
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "mobile home should not scroll horizontally");
    }
    await context.close();
  }

  const narayanpetProduct = {
    ...productResponse.products[0],
    attributes: { ...productResponse.products[0].attributes, regionalHandloom: "Narayanpet" },
    collections: [{
      id: "gid://shopify/Collection/narayanpet",
      handle: "narayanpet",
      title: "Narayanpet",
    }],
  };
  for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    const { context, page } = await openHome(viewport, [narayanpetProduct]);
    const collectionGrid = page.locator(".home-weave-section .weave-grid");
    const narayanpet = collectionGrid.getByRole("link", { name: /Narayanpet/ });
    assert.equal(await narayanpet.count(), 1, "Narayanpet should appear only once when both a collection and regional value exist");
    assert.match(await narayanpet.getAttribute("href"), /Collections\?collection=narayanpet$/);
    assert.equal(await page.locator(".home-regional-section").count(), 0);
    await context.close();
  }

  const publishedImages = [
    {
      id: "cotton-tile-image",
      kind: "home_image",
      placement: "fabric_tile",
      title: "Cotton",
      imageUrl: "https://cdn.example.test/cotton-tile.webp",
      altText: "Close-up of natural cotton cloth",
      published: true,
      approved: false,
      sortOrder: 0,
    },
    {
      id: "ikkat-tile-image",
      kind: "home_image",
      placement: "weave_tile",
      title: "Ikkat",
      imageUrl: "https://cdn.example.test/ikkat-tile.webp",
      altText: "Close-up of indigo Ikkat",
      published: true,
      approved: false,
      sortOrder: 1,
    },
  ];
  const { context, page } = await openHome({ width: 1280, height: 900 }, [productResponse.products[0]], publishedImages);
  await page.getByRole("heading", { name: "Shop by Weave", exact: true }).waitFor();
  const cottonImage = page.locator(".home-fabric-section .fabric-card").filter({ has: page.getByRole("heading", { name: "Cotton", exact: true }) }).locator("img");
  const ikkatImage = page.locator(".home-technique-section a").filter({ hasText: "Ikkat" }).locator("img");
  assert.equal(await cottonImage.getAttribute("src"), "https://cdn.example.test/cotton-tile.webp");
  assert.equal(await cottonImage.getAttribute("alt"), "Close-up of natural cotton cloth");
  assert.equal(await ikkatImage.getAttribute("src"), "https://cdn.example.test/ikkat-tile.webp");
  assert.equal(await ikkatImage.getAttribute("alt"), "Close-up of indigo Ikkat");
  await context.close();
});

test("header groups starter and live product classifications into three taxonomies", async () => {
  const headerProduct = {
    ...productResponse.products[0],
    tags: ["fabric :Cotton", "weave :Narayanpet"],
    attributes: { fabric: '["Cotton","Test Fabric"]', regionalHandloom: "Narayanpet", craftTechnique: "Ikkat", region: null, colour: null },
    collections: [{
      id: "gid://shopify/Collection/narayanpet",
      handle: "narayanpet",
      title: "Narayanpet",
    }],
  };
  for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({
      viewport,
      isMobile: viewport.width < 600,
      hasTouch: viewport.width < 600,
    });
    const page = await context.newPage();
    await page.route("**/api/shopify/products", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ products: [headerProduct] }),
    }));
    await page.route("**/api/site-content", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items: [] }),
    }));
    await page.goto(`${origin}${fixtureUrl}?screen=home`);
    if (viewport.width < 600) await page.getByTestId("button-mobile-menu").click();
    await page.locator(".collection-nav > summary").click();

    const regionalSection = page.locator(".mega-menu > div").nth(0);
    const fabricSection = page.locator(".mega-menu > div").nth(1);
    const techniqueSection = page.locator(".mega-menu > div").nth(2);
    assert.equal(await regionalSection.getByText("Regional Handlooms", { exact: true }).count(), 1);
    assert.equal(await fabricSection.getByText("Shop by Fabric", { exact: true }).count(), 1);
    assert.equal(await techniqueSection.getByText("Weave / Print", { exact: true }).count(), 1);
    assert.equal(await regionalSection.locator(".menu-dynamic-links a").count(), 13);
    assert.equal(await fabricSection.locator(".menu-dynamic-links a").count(), 4);
    assert.equal(await techniqueSection.locator(".menu-dynamic-links a").count(), 5);
    const cotton = fabricSection.getByRole("link", { name: "Cotton", exact: true });
    const testFabric = fabricSection.getByRole("link", { name: "Test Fabric", exact: true });
    const narayanpet = regionalSection.getByRole("link", { name: "Narayanpet", exact: true });
    const ikkat = techniqueSection.getByRole("link", { name: "Ikkat", exact: true });
    await cotton.waitFor();
    await testFabric.waitFor();
    await narayanpet.waitFor();
    await ikkat.waitFor();
    assert.match(await cotton.getAttribute("href"), /Collections\?fabric=Cotton$/);
    assert.match(await testFabric.getAttribute("href"), /Collections\?fabric=Test%20Fabric$/);
    assert.match(await narayanpet.getAttribute("href"), /Collections\?regionalHandloom=Narayanpet$/);
    assert.match(await ikkat.getAttribute("href"), /Collections\?weave=Ikkat$/);
    await context.close();
  }
});

test("Filter & Sort drawer fits and remains usable on a phone", async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await page.route("**/api/shopify/products", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(productResponse),
  }));
  await page.goto(`${origin}${fixtureUrl}?screen=collections`);
  await page.getByTestId("button-filter-sort").click();
  const panel = page.locator(".filter-sort-panel");
  await panel.waitFor();
  const bounds = await panel.boundingBox();
  assert.ok(bounds && bounds.width > 0 && bounds.x >= 0 && bounds.x + bounds.width <= 391);
  await panel.locator(".filter-section.is-primary > summary").click();
  await panel.getByLabel("Filter by fabric: Silk").check();
  await panel.getByRole("button", { name: "Apply Filters" }).click();
  await page.getByText("1 published product", { exact: true }).waitFor();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
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

test("decreases three units to one, then removes the line on desktop and mobile", async () => {
  for (const viewport of [
    { width: 1280, height: 900 },
    { width: 390, height: 844 },
  ]) {
    const savedCart = {
      id: `gid://shopify/Cart/decrement-${viewport.width}`,
      totalQuantity: 3,
      lines: [{ ...cartResponse.lines[0], quantity: 3 }],
    };
    const { context, page, requests } = await openCart({ savedCart, viewport });
    const decrement = page.getByTestId("button-decrease-quantity");

    for (const expected of [2, 1]) {
      await decrement.click();
      await page.waitForFunction(
        (quantity) => document.querySelector('[data-testid="text-quantity"]')?.textContent === String(quantity),
        expected,
      );
      assert.match(
        (await page.getByTestId("text-cart-items-count").innerText()).toLowerCase(),
        new RegExp(`· ${expected} piece`),
      );
      assert.match(
        (await page.getByTestId("text-cart-quantity").innerText()).toLowerCase(),
        new RegExp(`${expected} ${expected === 1 ? "piece" : "pieces"}`),
      );
      assert.match(
        await page.getByTestId("text-shopify-cart-subtotal").innerText(),
        new RegExp(expected === 2 ? "2,500" : "1,250"),
      );
      assert.match(
        await page.getByTestId("text-shopify-cart-total").innerText(),
        new RegExp(expected === 2 ? "2,500" : "1,250"),
      );
    }

    await decrement.click();
    await page.getByRole("heading", { name: "Your bag is taking a quiet moment." }).waitFor();
    assert.match(
      (await page.getByTestId("text-cart-quantity").innerText()).toLowerCase(),
      /0 pieces/,
    );
    assert.equal(await page.getByTestId("link-site-checkout").count(), 0);
    assert.equal(await page.getByRole("link", { name: "Browse sarees" }).count(), 1);
    assert.deepEqual(requests.map((request) => [request.method, request.body.lines?.[0]?.quantity ?? request.body.lineIds?.length]), [
      ["PATCH", 2],
      ["PATCH", 1],
      ["POST", 1],
    ]);
    assert.deepEqual(requests[2].body.lineIds, ["gid://shopify/CartLine/browser-line-123"]);

    await page.reload();
    await page.getByRole("heading", { name: "Your bag is taking a quiet moment." }).waitFor();
    assert.equal(await page.getByTestId("text-cart-items-count").count(), 0);
    await context.close();
  }
});

test("removes one product without affecting others and preserves removal after refresh", async () => {
  const secondLine = {
    ...cartResponse.lines[0],
    id: "gid://shopify/CartLine/browser-line-456",
    productTitle: "Narayanpet cotton saree",
    productHandle: "narayanpet-cotton-saree",
    unitPrice: "850.00",
    quantity: 1,
  };
  const savedCart = {
    id: "gid://shopify/Cart/multi-line-cart",
    totalQuantity: 2,
    lines: [{ ...cartResponse.lines[0], quantity: 1 }, secondLine],
  };
  const { context, page, requests } = await openCart({ savedCart });

  await page.getByRole("button", { name: "Remove", exact: true }).first().click();
  await page.getByRole("heading", { name: "Narayanpet cotton saree" }).waitFor();
  assert.equal(await page.getByRole("heading", { name: "Kanchipuram silk saree" }).count(), 0);
  assert.equal(
    (await page.getByTestId("text-cart-items-count").innerText()).toLowerCase(),
    "your pieces · 1 piece",
  );
  assert.match(await page.getByTestId("text-shopify-cart-subtotal").innerText(), /850/);

  await page.reload();
  await page.getByRole("heading", { name: "Narayanpet cotton saree" }).waitFor();
  assert.equal(await page.getByRole("heading", { name: "Kanchipuram silk saree" }).count(), 0);
  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0].body.lineIds, ["gid://shopify/CartLine/browser-line-123"]);

  await page.getByRole("button", { name: "Remove item" }).click();
  await page.getByRole("heading", { name: "Your bag is taking a quiet moment." }).waitFor();
  assert.equal(await page.getByTestId("link-site-checkout").count(), 0);
  await context.close();
});

test("removes a single-unit line immediately", async () => {
  const savedCart = { id: "gid://shopify/Cart/single-unit-cart", totalQuantity: 1 };
  const { context, page, requests } = await openCart({ savedCart });

  await page.getByTestId("button-decrease-quantity").click();
  await page.getByRole("heading", { name: "Your bag is taking a quiet moment." }).waitFor();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].method, "POST");
  assert.deepEqual(requests[0].body.lineIds, ["gid://shopify/CartLine/browser-line-123"]);
  await context.close();
});

test("locks cart controls while a server update is pending", async () => {
  const savedCart = {
    id: "gid://shopify/Cart/serialized-update-cart",
    totalQuantity: 3,
    lines: [{ ...cartResponse.lines[0], quantity: 3 }],
  };
  const { context, page, requests } = await openCart({ savedCart, mutationDelay: 200 });
  const decrement = page.getByTestId("button-decrease-quantity");

  await decrement.click();
  await page.waitForFunction(() => document.querySelector('[data-testid="button-decrease-quantity"]')?.disabled);
  assert.equal(await page.getByTestId("button-increase-quantity").isDisabled(), true);
  assert.equal(await page.getByRole("button", { name: "Remove", exact: true }).isDisabled(), true);
  assert.equal(await page.getByTestId("button-apply-shopify-discount").isDisabled(), true);
  assert.equal(requests.length, 1);

  await page.waitForFunction(
    () => document.querySelector('[data-testid="text-quantity"]')?.textContent === "2",
  );
  assert.equal(requests.length, 1);
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
  const paymentStateText = await page.getByTestId("status-cashfree-payment").innerText();
  assert.match(paymentStateText, /Delivery updates will appear here when available/i);
  assert.doesNotMatch(paymentStateText, /shipped/i);
  assert.doesNotMatch(paymentStateText, /Shopify|Cashfree|Shiprocket/i);
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

  await page.getByRole("alert").getByText(/We could not refresh this bag just now/i).waitFor();
  assert.doesNotMatch(await page.locator("body").innerText(), /Shopify|Cashfree|Shiprocket/i);
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

test("delivery progress separates the current stage from expandable courier scans on desktop", async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.goto(`${origin}${fixtureUrl}?screen=shipment-progress`);

  const journey = page.getByTestId("progress-shipment-0");
  await journey.waitFor();
  assert.equal(await journey.locator(":scope > li").count(), 5);
  assert.equal(await journey.locator('[aria-current="step"] strong').innerText(), "In transit");
  assert.equal(await page.getByTestId("latest-scan-shipment-0").isVisible(), true);
  assert.equal(await page.getByTestId("details-shipment-history-0").getAttribute("open"), null);
  assert.equal(await page.getByTestId("text-tracking-number-0").innerText(), "CHN-5482-9137");
  await page.getByTestId("details-shipment-history-0").locator("summary").click();
  assert.equal(await page.getByTestId("timeline-shipment-0").locator(":scope > li").count(), 4);
  assert.equal(await page.getByTestId("event-shipment-0-3").innerText().then((text) => /DATA RECEIVED/.test(text)), true);
  await context.close();
});

test("delivery progress fits a phone viewport without horizontal page overflow", async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto(`${origin}${fixtureUrl}?screen=shipment-progress`);
  await page.getByTestId("progress-shipment-0").waitFor();

  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);
  assert.equal(await page.locator(".shipment-progress-step[aria-current='step']").count(), 1);
  await page.getByTestId("details-shipment-history-0").locator("summary").click();
  assert.equal(await page.getByTestId("timeline-shipment-0").isVisible(), true);
  await context.close();
});

test("delivery progress never exposes tracking for an unpaid order", async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.goto(`${origin}${fixtureUrl}?screen=shipment-progress&paid=0`);

  await page.getByTestId("notice-shipment-0").waitFor();
  assert.match(await page.getByTestId("notice-shipment-0").innerText(), /after payment is confirmed/i);
  assert.equal(await page.getByTestId("progress-shipment-0").count(), 0);
  assert.equal(await page.getByTestId("text-tracking-number-0").count(), 0);
  assert.equal(await page.getByTestId("latest-scan-shipment-0").count(), 0);
  await context.close();
});

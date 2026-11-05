import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { chromium } from "playwright-core";

const packageDir = new URL("../../", import.meta.url).pathname;
const fixtureUrl = "/tests/browser/shopify-checkout-fixture.html";
const variantId = "gid://shopify/ProductVariant/123";
const checkoutUrl = "https://chenetha.myshopify.com/checkouts/mock-returned-by-shopify";
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
  checkoutUrl,
  totalQuantity: 1,
  subtotalAmount: "1250.00",
  discountAmount: "0.00",
  totalAmount: "1250.00",
  currencyCode: "INR",
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

async function openCheckout({ savedCart, onCartRequest }) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addInitScript((cart) => localStorage.setItem("kq-shopify-cart", JSON.stringify(cart)), savedCart);
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
  await page.goto(`${origin}${fixtureUrl}?screen=checkout`);
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
  await checkout.page.getByTestId("text-shopify-checkout-subtotal").waitFor();
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

test("uses Shopify's returned checkout URL in the current tab", async () => {
  const { context, page } = await openProduct();
  await page.route("**/api/shopify/countries**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      countries: [
        { isoCode: "IN", name: "India" },
        { isoCode: "US", name: "United States" },
      ],
    }),
  }));
  await page.route("**/api/shopify/cart**", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(cartResponse),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(cartResponse),
    });
  });

  await page.getByTestId("button-add-shopify-to-cart").click();
  await page.getByRole("status").getByText(/Added to your Shopify bag/).waitFor();
  assert.deepEqual(
    await page.evaluate(() => JSON.parse(localStorage.getItem("kq-shopify-cart"))),
    { id: cartResponse.id, totalQuantity: 1 },
  );
  const headerCount = page.getByTestId("header-cart-count");
  await headerCount.waitFor();
  assert.equal(await headerCount.innerText(), "1");
  const viewBagLink = page.getByRole("link", { name: "View bag →" });
  assert.equal(await viewBagLink.getAttribute("href"), "/Cart");
  await viewBagLink.click();
  await page.waitForURL("**/Cart", { timeout: 5000 });
  await page.getByTestId("text-cart-quantity").getByText(/Your bag · 1 piece/).waitFor({ timeout: 5000 });
  await page.getByTestId("text-cart-items-count").getByText(/Shopify products · 1 piece/).waitFor({ timeout: 5000 });
  const cartCheckoutLink = page.getByTestId("link-site-checkout");
  await cartCheckoutLink.waitFor();
  assert.equal(await cartCheckoutLink.getAttribute("href"), "/Checkout");
  assert.equal(await cartCheckoutLink.getAttribute("target"), null);

  await page.goto(`${origin}${fixtureUrl}?screen=checkout`);
  await page.getByTestId("text-shopify-checkout-total").waitFor();
  assert.match(await page.getByTestId("text-shopify-checkout-total").innerText(), /1,250/);
  let postedBuyerDetails;
  await page.route("**/api/shopify/cart/buyer-identity", async (route) => {
    postedBuyerDetails = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(cartResponse),
    });
  });
  await page.route("https://chenetha.myshopify.com/checkouts/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<!doctype html><title>Hosted checkout fixture</title>",
    }),
  );
  await page.getByTestId("input-checkout-email").fill("buyer@example.com");
  await page.getByTestId("input-checkout-recipient").fill("Asha Rao");
  await page.getByTestId("input-checkout-address1").fill("12 Example Road");
  await page.getByTestId("input-checkout-city").fill("Chennai");
  await page.getByTestId("input-checkout-state").fill("Tamil Nadu");
  await page.getByTestId("input-checkout-postal").fill("600001");
  const checkoutButton = page.getByTestId("button-submit-checkout-details");
  await Promise.all([page.waitForURL(checkoutUrl), checkoutButton.click()]);
  assert.equal(page.url(), checkoutUrl);
  assert.deepEqual(postedBuyerDetails, {
    cartId: cartResponse.id,
    email: "buyer@example.com",
    deliveryAddress: {
      recipient: "Asha Rao",
      street: "12 Example Road",
      city: "Chennai",
      state: "Tamil Nadu",
      pin: "600001",
      countryCode: "IN",
    },
  });
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

test("shows coupon savings separately from Shopify's address-based estimated total", async () => {
  const savedCart = { id: "gid://shopify/Cart/address-estimate-cart", totalQuantity: 1 };
  const { context, page } = await openCheckout({
    savedCart,
    onCartRequest: (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...cartResponse,
        id: savedCart.id,
        discountAmount: "125.00",
        totalAmount: "1385.00",
        discountCodes: [{ code: "SILK10", applicable: true }],
      }),
    }),
  });

  await page.getByTestId("text-shopify-checkout-discount").waitFor();
  assert.match(await page.getByTestId("text-shopify-checkout-subtotal").innerText(), /1,250/);
  assert.match(await page.getByTestId("text-shopify-checkout-discount").innerText(), /125/);
  assert.match(await page.getByTestId("text-shopify-checkout-total").innerText(), /1,385/);
  assert.match(await page.getByText(/Shipping and taxes are calculated by Shopify/i).innerText(), /final amount before you pay/i);
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

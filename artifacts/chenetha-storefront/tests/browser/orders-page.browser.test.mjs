import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { chromium } from "playwright-core";

const packageDir = new URL("../../", import.meta.url).pathname;
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
      if ((await fetch(`${origin}/tests/browser/fixture.html`)).ok) return;
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

async function openOrders(state = "orders", viewport = { width: 1280, height: 900 }) {
  const page = await browser.newPage({ viewport });
  page.on("pageerror", (error) => console.error("[orders-page-error]", error.message));
  await page.goto(`${origin}/tests/browser/fixture.html?screen=orders&state=${state}`);
  return page;
}

test("order summaries preserve key details and cursor navigation on desktop", async () => {
  const page = await openOrders();
  try {
    await page.getByTestId("card-order-fixture-order-1001").waitFor();
    assert.match(await page.getByTestId("text-order-date-fixture-order-1001").textContent(), /2026/);
    assert.equal(await page.getByTestId("text-order-name-fixture-order-1001").textContent(), "#1001");
    assert.match(await page.getByTestId("text-order-total-fixture-order-1001").textContent(), /18,400/);
    assert.match(await page.getByTestId("text-order-item-fixture-order-1001").textContent(), /Narayanpet Cotton Saree \+ 1 more/);
    assert.equal(await page.getByTestId("status-payment-fixture-order-1001").textContent(), "Paid");
    assert.equal(await page.getByTestId("status-fulfillment-fixture-order-1001").textContent(), "In Transit");
    assert.equal(await page.getByTestId("link-order-details-fixture-order-1001").getAttribute("href"), "/Orders/fixture-order-1001");

    await page.getByTestId("button-refresh-orders").click();
    await page.getByTestId("button-next-orders").click();
    await page.getByText("Page 2 · 1 order").waitFor();
    assert.equal(await page.getByTestId("text-order-name-fixture-order-0998").textContent(), "#0998");
    await page.getByTestId("button-previous-orders").click();
    await page.getByText("Page 1 · 1 order").waitFor();
    assert.equal(await page.getByTestId("fixture-retry-count").textContent(), "1");
    assert.equal(await page.getByTestId("note-orders-privacy").isVisible(), true);
  } finally {
    await page.close();
  }
});

test("loading, signed-out, empty, and error states remain actionable", async () => {
  for (const [state, testId] of [
    ["not-loaded", "skeleton-orders"],
    ["loading", "skeleton-orders"],
    ["signed-out", "orders-sign-in-redirect"],
    ["empty", "empty-order-history"],
    ["error", "error-orders"],
  ]) {
    const page = await openOrders(state);
    try {
      await page.getByTestId(testId).waitFor();
      if (state === "signed-out") {
        assert.equal(await page.getByTestId("link-orders-sign-in").getAttribute("href"), "/sign-in?redirect_url=%2FOrders%3Ffrom%3Dfixture");
      }
      if (state === "error") {
        await page.getByTestId("button-retry-orders").click();
        assert.equal(await page.getByTestId("fixture-retry-count").textContent(), "1");
      }
    } finally {
      await page.close();
    }
  }
});

test("order summaries fit a narrow phone viewport and show keyboard focus", async () => {
  const page = await openOrders("orders", { width: 360, height: 780 });
  try {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    assert.equal(overflow, false, "the Orders view should not overflow horizontally");
    await page.getByTestId("button-refresh-orders").focus();
    const focusOutline = await page.getByTestId("button-refresh-orders").evaluate((element) => getComputedStyle(element).outlineStyle);
    assert.equal(focusOutline, "solid");
  } finally {
    await page.close();
  }
});

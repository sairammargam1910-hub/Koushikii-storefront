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
  await new Promise((resolve, reject) =>
    listener.close((error) => error ? reject(error) : resolve()),
  );
  return port;
}

async function startVite() {
  const port = await findPort();
  origin = `http://127.0.0.1:${port}`;
  server = spawn(
    "pnpm",
    ["exec", "vite", "--config", "vite.config.ts", "--host", "127.0.0.1", "--strictPort"],
    {
      cwd: packageDir,
      env: { ...process.env, PORT: String(port), BASE_PATH: "/", NODE_ENV: "test" },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "";
  server.stdout.on("data", (chunk) => { output += chunk; });
  server.stderr.on("data", (chunk) => { output += chunk; });
  for (let attempt = 0; attempt < 240; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`Vite stopped before starting:\n${output}`);
    try {
      if ((await fetch(`${origin}/sign-in`)).ok) return;
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

function redirectPath(page) {
  const currentUrl = new URL(page.url());
  const destination = currentUrl.searchParams.get("redirect_url");
  assert.ok(destination, "auth screen should preserve a redirect destination");
  const resolved = new URL(destination, currentUrl.origin);
  assert.equal(resolved.origin, currentUrl.origin, "auth redirects stay on this site");
  return resolved.pathname;
}

test("merchant destination survives switching between Clerk sign-in and sign-up", async () => {
  const page = await browser.newPage();
  try {
    await page.goto(`${origin}/admin`);
    await page.getByTestId("link-admin-sign-in").click();
    await page.getByText("Welcome back", { exact: true }).waitFor();
    assert.equal(new URL(page.url()).pathname, "/sign-in");
    assert.equal(redirectPath(page), "/admin");

    await page.getByText("Sign up", { exact: true }).click();
    await page.getByText("Create your Chenetha account", { exact: true }).waitFor();
    assert.equal(new URL(page.url()).pathname, "/sign-up");
    assert.equal(redirectPath(page), "/admin");

    await page.getByText("Sign in", { exact: true }).last().click();
    await page.getByText("Welcome back", { exact: true }).waitFor();
    assert.equal(new URL(page.url()).pathname, "/sign-in");
    assert.equal(redirectPath(page), "/admin");
  } finally {
    await page.close();
  }
});

test("shopper account shows email/password entry and recovery guidance", async () => {
  const page = await browser.newPage();
  try {
    await page.goto(`${origin}/Account`);
    await page.getByTestId("link-customer-sign-up").click();
    await page.getByText("Create your Chenetha account", { exact: true }).waitFor();
    assert.equal(redirectPath(page), "/Account");
    await page.getByLabel("Email address").waitFor();
    await page.getByRole("textbox", { name: "Password" }).waitFor();

    await page.goto(`${origin}/Account`);
    await page.getByText("Choose “Forgot password” on the sign-in page.", { exact: false }).waitFor();
    await page.getByTestId("panel-signed-out-account").getByTestId("link-customer-sign-in").click();
    await page.getByText("Welcome back", { exact: true }).waitFor();
    assert.equal(redirectPath(page), "/Account");
  } finally {
    await page.close();
  }
});

test("guests can browse and keep their bag, while checkout and profile require sign-in", async () => {
  const page = await browser.newPage();
  try {
    for (const path of [
      "/",
      "/Collections",
      "/Product?id=guest-saree",
      "/Cart",
      "/Wishlist",
      "/OurStory",
      "/Contact",
      "/CustomerCare",
      "/SareeCare",
      "/Videos",
    ]) {
      await page.goto(`${origin}${path}`);
      assert.equal(new URL(page.url()).pathname, path.split("?")[0], `${path} should remain public`);
    }

    const guestCart = { id: "gid://shopify/Cart/guest-auth-test", totalQuantity: 2 };
    await page.evaluate((cart) => localStorage.setItem("kq-shopify-cart", JSON.stringify(cart)), guestCart);
    await page.goto(`${origin}/Checkout?source=guest-bag`);
    await page.getByText("Welcome back", { exact: true }).waitFor();
    assert.equal(new URL(page.url()).pathname, "/sign-in");
    assert.equal(redirectPath(page), "/Checkout");
    const redirect = new URLSearchParams(new URL(page.url()).search).get("redirect_url");
    assert.equal(new URL(redirect, origin).searchParams.get("source"), "guest-bag");
    assert.deepEqual(
      await page.evaluate(() => JSON.parse(localStorage.getItem("kq-shopify-cart"))),
      guestCart,
      "the guest bag should survive the sign-in redirect",
    );

    await page.goto(`${origin}/Profile`);
    await page.getByText("Welcome back", { exact: true }).waitFor();
    assert.equal(redirectPath(page), "/Profile");
  } finally {
    await page.close();
  }
});

import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { chromium } from "playwright-core";

const packageDir = new URL("../../", import.meta.url).pathname;
const feedUrl = "/Videos";
const productId = "gid://shopify/Product/video-fixture";
const productHandle = "fixture-silk-saree";
const videos = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    title: "MP4 handloom clip",
    mediaUrl: "/tests/browser/media/short-sample.mp4",
    linkedProductId: productId,
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    title: "WebM handloom clip",
    mediaUrl: "/tests/browser/media/short-sample.webm",
    linkedProductId: null,
  },
].map((video, sortOrder) => ({
  kind: "video_post",
  placement: null,
  eyebrow: null,
  body: null,
  imageUrl: null,
  altText: null,
  ctaLabel: null,
  ctaUrl: null,
  sortOrder,
  published: true,
  approved: false,
  createdAt: "2026-10-30T00:00:00.000Z",
  updatedAt: "2026-10-30T00:00:00.000Z",
  ...video,
}));
const productResponse = {
  products: [{
    id: productId,
    handle: productHandle,
    title: "Fixture silk saree",
    description: "Handwoven silk",
    productType: "Saree",
    tags: ["silk"],
    images: [],
    variants: [{
      id: "gid://shopify/ProductVariant/video-fixture",
      title: "Default",
      availableForSale: true,
      price: "1250.00",
      currencyCode: "INR",
      selectedOptions: [{ name: "Title", value: "Default" }],
    }],
  }],
  totalPublishedProducts: 1,
  truncated: false,
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
      if ((await fetch(`${origin}${feedUrl}`)).ok) return;
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

async function openFeed({ items = videos, mobile = true, onContentRequest } = {}) {
  const context = await browser.newContext({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 },
    isMobile: mobile,
    hasTouch: mobile,
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => console.error("[video-browser-page-error]", error.message));
  await page.route("**/api/site-content", async (route) => {
    await onContentRequest?.();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items }),
    });
  });
  await page.route("**/api/shopify/products", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(productResponse),
  }));
  for (const [filename, contentType] of [
    ["short-sample.mp4", "video/mp4"],
    ["short-sample.webm", "video/webm"],
  ]) {
    await page.route(`**/tests/browser/media/${filename}`, (route) => route.fulfill({
      path: new URL(`./media/${filename}`, import.meta.url).pathname,
      contentType,
      headers: { "Accept-Ranges": "bytes" },
    }));
  }
  await page.goto(`${origin}${feedUrl}`, { waitUntil: "domcontentloaded" });
  return { context, page };
}

function assertNoHorizontalOverflow(width) {
  return async (page) => {
    const dimensions = await page.evaluate(() => ({
      viewport: window.innerWidth,
      document: document.documentElement.scrollWidth,
    }));
    assert.equal(dimensions.viewport, width);
    assert.ok(dimensions.document <= dimensions.viewport, `page overflows horizontally: ${JSON.stringify(dimensions)}`);
  };
}

test("phone feed plays and seeks real MP4 and WebM clips and links the right product", async () => {
  const { context, page } = await openFeed();
  await page.getByRole("heading", { name: "MP4 handloom clip" }).waitFor();
  await page.getByRole("heading", { name: "WebM handloom clip" }).waitFor();
  assert.equal(await page.locator(".video-card-grid").evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length), 2);
  await assertNoHorizontalOverflow(390)(page);

  for (const [index, format] of ["MP4", "WebM"].entries()) {
    const video = page.locator("video").nth(index);
    assert.equal(await video.getAttribute("controls"), "");
    assert.equal(await video.getAttribute("playsinline"), "");
    await video.evaluate((element) => element.readyState >= HTMLMediaElement.HAVE_METADATA
      ? Promise.resolve()
      : new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Video metadata did not load")), 8000);
      element.addEventListener("loadedmetadata", () => {
        clearTimeout(timeout);
        resolve();
      }, { once: true });
    }));
    assert.ok(await video.evaluate((element) => element.duration >= 2), `${format} duration should be readable`);
    await video.evaluate(async (element) => {
      element.muted = true;
      const playing = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("Video did not start playing")), 4000);
        element.addEventListener("playing", () => {
          clearTimeout(timeout);
          resolve();
        }, { once: true });
      });
      await element.play();
      await playing;
    });
    await page.waitForTimeout(250);
    assert.equal(await video.evaluate((element) => element.paused), false, `${format} should play`);
    await video.evaluate((element) => new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Video did not seek")), 4000);
      element.addEventListener("seeked", () => {
        clearTimeout(timeout);
        resolve();
      }, { once: true });
      element.currentTime = 1.25;
    }));
    assert.ok(Math.abs(await video.evaluate((element) => element.currentTime) - 1.25) < 0.3, `${format} should seek to the requested time`);
    await video.evaluate((element) => element.pause());
  }

  const productLink = page.getByRole("link", { name: "Fixture silk saree" });
  assert.equal(await productLink.getAttribute("href"), "/Product?shopify=fixture-silk-saree");
  await productLink.click();
  await page.getByRole("heading", { name: "Fixture silk saree" }).waitFor();
  assert.equal(new URL(page.url()).searchParams.get("shopify"), productHandle);
  await context.close();
});

test("phone loading and empty feed states stay readable without horizontal scrolling", async () => {
  let releaseContent;
  const pendingContent = new Promise((resolve) => { releaseContent = resolve; });
  const { context, page } = await openFeed({ items: [], onContentRequest: () => pendingContent });
  await page.getByRole("status").getByText("Loading published videos…").waitFor();
  await assertNoHorizontalOverflow(390)(page);
  releaseContent();
  await page.getByRole("heading", { name: "No videos published yet" }).waitFor();
  await assertNoHorizontalOverflow(390)(page);
  assert.ok(await page.getByText("New videos will appear here when the store publishes them.").isVisible());
  await context.close();
});

import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { chromium } from "playwright-core";

const packageDir = new URL("../../", import.meta.url).pathname;
const storageKey = "hero-focal-browser-fixture";
const fixtureId = "00000000-0000-4000-8000-000000000130";
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
  try {
    await access(executablePath);
  } catch {
    throw new Error(`Chromium not found at ${executablePath}; set CHROMIUM_PATH to an installed Chromium executable.`);
  }
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

async function openEditor({ orientation = "landscape", mobile = false } = {}) {
  const context = await browser.newContext({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 },
    isMobile: mobile,
    hasTouch: mobile,
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => console.error("[hero-focal-page-error]", error.message));
  await page.route("**/api/shopify/admin/products**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ currencyCode: "INR", products: [] }),
  }));
  await page.goto(`${origin}/tests/browser/fixture.html?screen=hero-editor&orientation=${orientation}`);
  await page.getByRole("dialog").waitFor();
  await page.waitForFunction(() => {
    const image = document.querySelector(".content-media-field img");
    return image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0;
  });
  return { context, page };
}

async function setRange(page, label, value) {
  const index = label === "Horizontal position" ? 0 : 1;
  const slider = page.locator(".hero-focal-controls input[type='range']").nth(index);
  await slider.focus();
  await slider.press("Home");
  for (let step = 0; step < value; step += 1) await slider.press("ArrowRight");
  assert.equal(await slider.inputValue(), String(value));
}

async function assertNoHorizontalOverflow(page, viewportWidth) {
  const sizes = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
  }));
  assert.equal(sizes.viewport, viewportWidth);
  assert.ok(sizes.document <= sizes.viewport, `unexpected horizontal overflow: ${JSON.stringify(sizes)}`);
}

async function waitForHeroImage(page) {
  await page.waitForFunction(() => {
    const image = document.querySelector(".home-hero-image");
    return image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0;
  });
}

test("saved focal positions survive closing and reopening a hero slide", async () => {
  for (const orientation of ["portrait", "landscape"]) {
    const { context, page } = await openEditor({ orientation });
    let savedBody;
    await page.route(`**/api/site-content/${fixtureId}`, async (route) => {
      assert.equal(route.request().method(), "PUT");
      savedBody = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ...savedBody,
          id: fixtureId,
          createdAt: "2026-11-17T00:00:00.000Z",
          updatedAt: "2026-11-17T00:01:00.000Z",
        }),
      });
    });

    await setRange(page, "Horizontal position", 37);
    await setRange(page, "Vertical position", 68);
    await page.getByRole("button", { name: "Save changes" }).click();
    await page.getByTestId("hero-editor-closed").waitFor();
    assert.equal(savedBody.focalPointX, 37);
    assert.equal(savedBody.focalPointY, 68);

    await page.evaluate(({ key, body }) => {
      localStorage.setItem(key, JSON.stringify({
        ...body,
        id: "00000000-0000-4000-8000-000000000130",
        createdAt: "2026-11-17T00:00:00.000Z",
        updatedAt: "2026-11-17T00:01:00.000Z",
      }));
    }, { key: storageKey, body: savedBody });
    await page.reload();
    await page.getByRole("dialog").waitFor();
    assert.equal(await page.locator(".hero-focal-controls input[type='range']").nth(0).inputValue(), "37");
    assert.equal(await page.locator(".hero-focal-controls input[type='range']").nth(1).inputValue(), "68");
    const positions = await page.locator(".hero-focal-preview img").evaluateAll((images) =>
      images.map((image) => getComputedStyle(image).objectPosition));
    assert.deepEqual(positions, ["37% 68%", "37% 68%"]);
    await assertNoHorizontalOverflow(page, 1280);
    await context.close();
  }
});

test("portrait and landscape crop previews work at desktop and mobile widths", async () => {
  for (const orientation of ["portrait", "landscape"]) {
    for (const mobile of [false, true]) {
      const { context, page } = await openEditor({ orientation, mobile });
      const image = page.locator(".content-media-field img");
      const dimensions = await image.evaluate((element) => ({
        width: (element).naturalWidth,
        height: (element).naturalHeight,
      }));
      assert.equal(dimensions.height > dimensions.width, orientation === "portrait");
      const previewBoxes = page.locator(".hero-focal-preview");
      assert.equal(await previewBoxes.count(), 2);
      assert.equal(await page.locator(".hero-focal-preview img").count(), 2);
      const fit = await page.locator(".hero-focal-preview img").evaluateAll((images) =>
        images.map((element) => getComputedStyle(element).objectFit));
      assert.deepEqual(fit, ["cover", "cover"]);
      const positions = await page.locator(".hero-focal-preview img").evaluateAll((images) =>
        images.map((element) => getComputedStyle(element).objectPosition));
      assert.deepEqual(positions, ["50% 54%", "62% 50%"]);
      await assertNoHorizontalOverflow(page, mobile ? 390 : 1280);
      await context.close();
    }
  }
});

test("published hero applies the saved focal point for portrait and landscape slides on desktop and mobile", async () => {
  for (const orientation of ["portrait", "landscape"]) {
    for (const mobile of [false, true]) {
      const context = await browser.newContext({
        viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 },
        isMobile: mobile,
        hasTouch: mobile,
      });
      const page = await context.newPage();
      await page.goto(`${origin}/tests/browser/fixture.html?screen=hero-preview&orientation=${orientation}&x=31&y=72`);
      await waitForHeroImage(page);
      const image = page.locator(".home-hero-image");
      assert.equal(await image.evaluate((element) => getComputedStyle(element).objectPosition), "31% 72%");
      const imageDimensions = await image.evaluate((element) => ({
        width: element.naturalWidth,
        height: element.naturalHeight,
      }));
      assert.equal(imageDimensions.height > imageDimensions.width, orientation === "portrait");
      assert.equal(await page.locator(".home-hero-images").evaluate((element) => element.classList.contains("has-portrait-image")), orientation === "portrait");
      await assertNoHorizontalOverflow(page, mobile ? 390 : 1280);
      await context.close();
    }
  }
});

test("manual and timed carousel changes keep each slide's focal point on desktop and mobile", async () => {
  for (const mobile of [false, true]) {
    const context = await browser.newContext({
      viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 },
      isMobile: mobile,
      hasTouch: mobile,
    });
    const page = await context.newPage();
    await page.clock.install();
    await page.goto(`${origin}/tests/browser/fixture.html?screen=hero-carousel`);
    await waitForHeroImage(page);

    const image = page.locator(".home-hero-image");
    assert.match(await image.getAttribute("src"), /hero-landscape\.svg$/);
    assert.equal(await image.evaluate((element) => getComputedStyle(element).objectPosition), "12% 28%");
    assert.equal(await page.getByRole("button", { name: "Show slide 1" }).getAttribute("aria-pressed"), "true");

    await page.getByRole("button", { name: "Show slide 2" }).click();
    await page.waitForFunction(() => {
      const activeImage = document.querySelector(".home-hero-image.is-active");
      return activeImage instanceof HTMLImageElement && activeImage.src.endsWith("/hero-portrait.svg")
        && getComputedStyle(activeImage).objectPosition === "76% 83%";
    });
    assert.equal(await page.locator(".home-hero-images").evaluate((element) => element.classList.contains("has-portrait-image")), true);
    assert.equal(await page.getByRole("button", { name: "Show slide 2" }).getAttribute("aria-pressed"), "true");

    await page.clock.fastForward(6000);
    await page.waitForFunction(() => {
      const activeImage = document.querySelector(".home-hero-image.is-active");
      return activeImage instanceof HTMLImageElement && activeImage.src.endsWith("/hero-landscape.svg")
        && getComputedStyle(activeImage).objectPosition === "12% 28%";
    });
    assert.equal(await page.locator(".home-hero-images").evaluate((element) => element.classList.contains("has-portrait-image")), false);
    assert.equal(await page.getByRole("button", { name: "Show slide 1" }).getAttribute("aria-pressed"), "true");

    await page.clock.fastForward(6000);
    await page.waitForFunction(() => {
      const activeImage = document.querySelector(".home-hero-image.is-active");
      return activeImage instanceof HTMLImageElement && activeImage.src.endsWith("/hero-portrait.svg")
        && getComputedStyle(activeImage).objectPosition === "76% 83%";
    });
    assert.equal(await page.locator(".home-hero-images").evaluate((element) => element.classList.contains("has-portrait-image")), true);
    await assertNoHorizontalOverflow(page, mobile ? 390 : 1280);
    await context.close();
  }
});

test("replacing a hero image clears its focal point until a new one is selected", async () => {
  const { context, page } = await openEditor({ orientation: "portrait", mobile: true });
  await page.evaluate((key) => {
    localStorage.setItem(key, JSON.stringify({
      id: "00000000-0000-4000-8000-000000000130",
      kind: "hero_slide",
      placement: null,
      title: "Focal point browser fixture",
      eyebrow: "A saved hero image",
      body: "Test copy",
      imageUrl: "/tests/browser/media/hero-portrait.svg",
      mediaUrl: null,
      altText: "Test hero image",
      focalPointX: 23,
      focalPointY: 79,
      ctaLabel: "Explore",
      ctaUrl: "/Collections",
      linkedProductId: null,
      sortOrder: 0,
      published: true,
      approved: false,
      createdAt: "2026-11-17T00:00:00.000Z",
      updatedAt: "2026-11-17T00:00:00.000Z",
    }));
  }, storageKey);
  await page.reload();
  await page.getByRole("dialog").waitFor();
  assert.equal(await page.locator(".hero-focal-controls input[type='range']").nth(0).inputValue(), "23");
  assert.equal(await page.locator(".hero-focal-controls input[type='range']").nth(1).inputValue(), "79");

  await page.route("**/api/site-content/uploads", (route) => route.fulfill({
    status: 201,
    contentType: "application/json",
    body: JSON.stringify({
      uploadUrl: `${origin}/mock-hero-upload`,
      assetUrl: "https://cdn.example.test/replacement-hero.webp",
    }),
  }));
  await page.route("**/mock-hero-upload", async (route) => {
    assert.equal(route.request().method(), "PUT");
    await route.fulfill({ status: 200, body: "" });
  });
  await page.locator('.content-media-field input[type="file"]').setInputFiles({
    name: "replacement-hero.webp",
    mimeType: "image/webp",
    buffer: Buffer.from("browser-test-image"),
  });
  await page.waitForFunction(() => {
    const image = document.querySelector(".content-media-field img[alt='Selected content preview']");
    return image instanceof HTMLImageElement && image.src.startsWith("blob:");
  });
  assert.equal(await page.locator(".hero-focal-controls input[type='range']").nth(0).inputValue(), "50");
  assert.equal(await page.locator(".hero-focal-controls input[type='range']").nth(1).inputValue(), "54");
  assert.equal(await page.getByRole("button", { name: "Use current framing" }).count(), 0);

  let savedBody;
  await page.route(`**/api/site-content/${fixtureId}`, async (route) => {
    savedBody = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...savedBody,
        id: fixtureId,
        createdAt: "2026-11-17T00:00:00.000Z",
        updatedAt: "2026-11-17T00:01:00.000Z",
      }),
    });
  });
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.getByTestId("hero-editor-closed").waitFor();
  assert.equal(savedBody.imageUrl, "https://cdn.example.test/replacement-hero.webp");
  assert.equal(savedBody.focalPointX, null);
  assert.equal(savedBody.focalPointY, null);

  await page.evaluate(({ key, body }) => localStorage.setItem(key, JSON.stringify({
    ...body,
    id: "00000000-0000-4000-8000-000000000130",
    createdAt: "2026-11-17T00:00:00.000Z",
    updatedAt: "2026-11-17T00:01:00.000Z",
  })), { key: storageKey, body: savedBody });
  await page.reload();
  await page.getByRole("dialog").waitFor();
  assert.equal(await page.locator(".hero-focal-controls input[type='range']").nth(0).inputValue(), "50");
  assert.equal(await page.locator(".hero-focal-controls input[type='range']").nth(1).inputValue(), "54");

  await setRange(page, "Horizontal position", 63);
  await page.route(`**/api/site-content/${fixtureId}`, async (route) => {
    savedBody = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...savedBody,
        id: fixtureId,
        createdAt: "2026-11-17T00:00:00.000Z",
        updatedAt: "2026-11-17T00:02:00.000Z",
      }),
    });
  });
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.getByTestId("hero-editor-closed").waitFor();
  assert.equal(savedBody.focalPointX, 63);
  assert.equal(savedBody.focalPointY, 54);
  await context.close();
});

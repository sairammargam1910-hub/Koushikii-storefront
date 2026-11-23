import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { chromium } from "playwright-core";

const packageDir = new URL("../../", import.meta.url).pathname;
const uploadUrl = "https://cdn.shopify.test/staged/photo-123.jpg";
const imageBytes = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
]);
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
      const response = await fetch(`${origin}/tests/browser/fixture.html`);
      if (response.ok) return;
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

async function openForm({ mobile = false, edit = false, setup } = {}) {
  const context = await browser.newContext({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 },
    isMobile: mobile,
    hasTouch: mobile,
  });
  const page = await context.newPage();
  const setupResult = await setup?.(page);
  await page.route("**/api/shopify/admin/collections", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      collections: [{ id: "gid://shopify/Collection/fixture", title: "The Crafts Edit", handle: "the-crafts-edit", manual: true }],
    }),
  }));
  await page.route("**/api/shopify/admin/products", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      currencyCode: "INR",
      products: [{
        id: "gid://shopify/Product/suggestion-fixture",
        title: "Existing cotton runner",
        handle: "existing-cotton-runner",
        description: "",
        productType: "Home textile",
        status: "ACTIVE",
        tags: [],
        fabric: '["Cotton","Linen"]',
        regionalHandloom: "Narayanpet",
        craftTechnique: '["Bagru","Ikkat"]',
        region: "Odisha",
        colour: "Indigo",
        collectionIds: [],
        imageUrl: null,
        options: [],
        variants: [],
      }],
    }),
  }));
  await page.route("**/api/shopify/admin/products/**", async (route) => {
    const request = route.request();
    if (request.method() === "GET" && !request.url().includes("/media")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          currencyCode: "INR",
          product: {
            id: "gid://shopify/Product/browser-fixture",
            title: "Fixture silk saree",
            handle: "fixture-silk-saree",
            description: "Existing details",
            productType: "Saree",
            status: "ACTIVE",
            tags: ["silk"],
            fabric: "Silk",
            regionalHandloom: "",
            blouseAvailability: "included",
            craftTechnique: "",
            region: "",
            colour: "",
            productDetails: {
              fabricComposition: "Pure silk",
              sareeLength: "",
              blousePieceLength: "",
              borderDetails: "",
              designPattern: "",
              washCareInstructions: "",
              additionalInformation: "",
            },
            collectionIds: [],
            imageUrl: "https://cdn.example.test/existing-cover.jpg",
            options: [],
            variants: [{
              id: "gid://shopify/ProductVariant/browser-fixture",
              title: "Default",
              price: "1250.00",
              inventoryQuantity: 3,
              inventoryTracked: true,
              inventoryPolicy: "DENY",
              selectedOptions: [{ name: "Title", value: "Default" }],
              inventoryLevels: [],
            }],
          },
        }),
      });
      return;
    }
    await route.fallback();
  });
  await page.goto(`${origin}/tests/browser/fixture.html${edit ? "?edit=1" : ""}`);
  await page.getByRole("dialog").waitFor();
  return { context, page, setupResult };
}

async function choosePhoto(page, { name = "handloom.jpg", mimeType = "image/jpeg", buffer = imageBytes } = {}) {
  await page.getByTestId("input-product-photo").setInputFiles({ name, mimeType, buffer });
}

async function useShortPhotoUploadTimeout(page) {
  await page.addInitScript(() => {
    const timeoutDescriptor = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, "timeout");
    if (!timeoutDescriptor?.get || !timeoutDescriptor.set) throw new Error("XMLHttpRequest timeout is not configurable");
    Object.defineProperty(XMLHttpRequest.prototype, "timeout", {
      configurable: timeoutDescriptor.configurable,
      enumerable: timeoutDescriptor.enumerable,
      get: timeoutDescriptor.get,
      set(value) {
        timeoutDescriptor.set.call(this, Math.min(value, 100));
      },
    });
  });
}

function observeShopifyRequests(page) {
  const requests = [];
  page.on("request", (request) => {
    const hostname = new URL(request.url()).hostname;
    if (hostname === "shopify.com" || hostname.endsWith(".shopify.com")) requests.push(request.url());
  });
  return requests;
}

async function mockCreateOrUpdate(page, { method = "POST", onMutation, beforeMediaResponse } = {}) {
  const observed = [];
  await page.route("**/api/shopify/admin/products**", async (route) => {
    const request = route.request();
    if (request.url().includes("/media")) {
      if (request.method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            featuredMediaId: "existing-photo",
            replacementStatus: null,
            media: [{
              id: "existing-photo",
              mediaContentType: "IMAGE",
              status: "READY",
              alt: "Existing gallery photo",
              imageUrl: "https://cdn.example.test/existing-gallery-photo.jpg",
              errors: [],
            }],
          }),
        });
      } else if (request.method() === "POST") {
        onMutation?.(request.postDataJSON(), request);
        await beforeMediaResponse?.();
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            featuredMediaId: "existing-photo",
            replacementStatus: null,
            media: [{
              id: "existing-photo",
              mediaContentType: "IMAGE",
              status: "READY",
              alt: "Existing gallery photo",
              imageUrl: "https://cdn.example.test/existing-gallery-photo.jpg",
              errors: [],
            }, {
              id: "new-photo",
              mediaContentType: "IMAGE",
              status: "PROCESSING",
              alt: null,
              imageUrl: null,
              errors: [],
            }],
          }),
        });
      } else {
        await route.continue();
      }
      return;
    }
    if (request.method() !== method) {
      await route.continue();
      return;
    }
    const body = request.postDataJSON();
    observed.push({ request, body });
    onMutation?.(body, request);
    await route.fulfill({
      status: method === "POST" ? 201 : 200,
      contentType: "application/json",
      body: JSON.stringify({ currencyCode: "INR", product: { id: "gid://shopify/Product/mock", imageUrl: null } }),
    });
  });
  return observed;
}

async function mockSuccessfulUpload(page, { delay } = {}) {
  await page.route("**/api/shopify/admin/images", async (route) => {
    if (delay) await delay();
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ resourceUrl: uploadUrl }),
    }).catch(() => {});
  });
}

async function mockReplacementFlow(page, replacementStatuses) {
  const original = {
    id: "existing-photo",
    mediaContentType: "IMAGE",
    status: "READY",
    alt: "Existing gallery photo",
    imageUrl: "https://cdn.example.test/existing-gallery-photo.jpg",
    errors: [],
  };
  let media = [original];
  let replacementCount = 0;
  const replacements = [];
  await page.route("**/api/shopify/admin/products/**/media**", async (route) => {
    const request = route.request();
    if (request.method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ featuredMediaId: media[0]?.id ?? null, replacementStatus: null, media }),
      });
      return;
    }
    if (request.method() === "POST") {
      const body = request.postDataJSON();
      replacements.push(body);
      const replacementStatus = replacementStatuses[replacementCount++];
      assert.ok(replacementStatus, "each mocked replacement should have an outcome");
      const replacement = {
        id: `replacement-photo-${replacementCount}`,
        mediaContentType: "IMAGE",
        status: replacementStatus === "REPLACED" ? "READY" : replacementStatus,
        alt: "Replacement gallery photo",
        imageUrl: replacementStatus === "REPLACED"
          ? `https://cdn.example.test/replacement-${replacementCount}.jpg`
          : null,
        errors: replacementStatus === "FAILED" ? [{ code: "PROCESSING_ERROR", message: "Shopify could not process this image.", details: null }] : [],
      };
      media = replacementStatus === "REPLACED" ? [replacement] : [...media, replacement];
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          featuredMediaId: media[0]?.id ?? null,
          replacementStatus,
          media,
        }),
      });
      return;
    }
    await route.continue();
  });
  return replacements;
}

test("mobile file selection previews the photo and rejects unsupported or oversized files", async () => {
  const { context, page } = await openForm({ mobile: true });
  const uploadRequests = [];
  await page.route("**/api/shopify/admin/images", async (route) => {
    uploadRequests.push(route.request());
    await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ resourceUrl: uploadUrl }) });
  });

  await choosePhoto(page);
  const preview = page.getByAltText("Selected new product photo");
  await preview.waitFor();
  assert.match(await preview.getAttribute("src"), /^blob:/);
  await page.getByText("handloom.jpg", { exact: true }).waitFor();
  await page.getByText("Photo uploaded. Save the product to add it.", { exact: false }).waitFor();

  await choosePhoto(page, { name: "not-a-photo.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg/>") });
  await page.getByTestId("text-photo-upload-error").getByText(/non-empty JPEG, PNG, or WebP.*10 MB/).waitFor();
  assert.equal(uploadRequests.length, 1, "unsupported files must not be uploaded");
  assert.equal(await page.getByTestId("button-save-product").isDisabled(), false);

  await choosePhoto(page, { name: "too-large.jpg", buffer: Buffer.alloc(10 * 1024 * 1024 + 1) });
  await page.getByTestId("text-photo-upload-error").getByText(/no larger than 10 MB/).waitFor();
  assert.equal(uploadRequests.length, 1, "oversized files must not be uploaded");
  await context.close();
});

test("merchant can upload and publish a matching Shop by Weave tile image", async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const uploads = [];
  const savedItems = [];
  await page.route("**/api/shopify/admin/products", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      currencyCode: "INR",
      products: [{
        id: "gid://shopify/Product/weave-options",
        title: "Ikat cotton textile",
        handle: "ikat-cotton-textile",
        description: "",
        productType: "Textile",
        status: "ACTIVE",
        tags: [],
        fabric: "Cotton",
        regionalHandloom: "",
        craftTechnique: '["Bagru","Ikkat"]',
        region: "",
        colour: "",
        collectionIds: [],
        imageUrl: null,
        variants: [],
        options: [],
      }],
    }),
  }));
  await page.route("**/api/site-content/uploads", async (route) => {
    const body = route.request().postDataJSON();
    uploads.push(body);
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        uploadUrl: `${origin}/mock-content-upload`,
        assetUrl: "https://cdn.example.test/home-ikkat.webp",
      }),
    });
  });
  await page.route("**/mock-content-upload", async (route) => {
    assert.equal(route.request().method(), "PUT");
    await route.fulfill({ status: 200, body: "" });
  });
  await page.route("**/api/site-content", async (route) => {
    if (route.request().method() !== "POST") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [] }) });
    const body = route.request().postDataJSON();
    savedItems.push(body);
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        ...body,
        id: "homepage-ikkat-image",
        createdAt: "2026-11-12T00:00:00.000Z",
        updatedAt: "2026-11-12T00:00:00.000Z",
      }),
    });
  });
  await page.goto(`${origin}/tests/browser/fixture.html?screen=home-image-editor`);
  await page.getByRole("dialog").waitFor();
  await page.locator(".admin-form select").nth(0).selectOption("weave_tile");
  await page.locator(".admin-form select").nth(1).selectOption("Ikkat");
  await page.locator('.content-media-field input[type="file"]').setInputFiles({
    name: "ikkat-closeup.webp",
    mimeType: "image/webp",
    buffer: Buffer.from("test-image"),
  });
  await page.getByAltText("Selected content preview").waitFor();
  await page.getByRole("textbox", { name: "Image description" }).fill("Close-up of an indigo Ikkat weave");
  await page.getByRole("checkbox", { name: /Publish/ }).check();
  await page.getByRole("button", { name: "Save content" }).click();
  await page.getByTestId("home-image-editor-closed").waitFor();

  assert.equal(uploads.length, 1);
  assert.equal(uploads[0].contentType, "image/webp");
  assert.equal(savedItems.length, 1);
  assert.equal(savedItems[0].kind, "home_image");
  assert.equal(savedItems[0].placement, "weave_tile");
  assert.equal(savedItems[0].title, "Ikkat");
  assert.equal(savedItems[0].imageUrl, "https://cdn.example.test/home-ikkat.webp");
  assert.equal(savedItems[0].altText, "Close-up of an indigo Ikkat weave");
  assert.equal(savedItems[0].published, true);
  await context.close();
});

test("merchant can publish fabric or weave descriptions without an image", async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const savedItems = [];
  await page.route("**/api/shopify/admin/products", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      currencyCode: "INR",
      products: [{
        id: "gid://shopify/Product/category-copy",
        title: "Cotton and Ikkat pieces",
        handle: "cotton-ikkat-pieces",
        description: "",
        productType: "Saree",
        status: "ACTIVE",
        tags: [],
        fabric: "Cotton",
        regionalHandloom: "",
        craftTechnique: '["Ikkat"]',
        region: "",
        colour: "",
        collectionIds: [],
        imageUrl: null,
        variants: [],
        options: [],
      }],
    }),
  }));
  await page.route("**/api/site-content", async (route) => {
    if (route.request().method() !== "POST") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [] }) });
    }
    const body = route.request().postDataJSON();
    savedItems.push(body);
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        ...body,
        id: "cotton-category-copy",
        createdAt: "2026-11-19T00:00:00.000Z",
        updatedAt: "2026-11-19T00:00:00.000Z",
      }),
    });
  });
  await page.goto(`${origin}/tests/browser/fixture.html?screen=home-image-editor`);
  await page.getByRole("dialog").waitFor();
  await page.locator(".admin-form select").nth(0).selectOption("fabric_tile");
  await page.locator(".admin-form select").nth(1).selectOption("Cotton");
  await page.getByRole("textbox", { name: /Category description/ }).fill("Light, breathable sarees for every day.");
  await page.getByRole("checkbox", { name: /Publish/ }).check();
  await page.getByRole("button", { name: "Save content" }).click();
  await page.getByTestId("home-image-editor-closed").waitFor();

  assert.equal(savedItems.length, 1);
  assert.equal(savedItems[0].kind, "home_image");
  assert.equal(savedItems[0].placement, "fabric_tile");
  assert.equal(savedItems[0].title, "Cotton");
  assert.equal(savedItems[0].body, "Light, breathable sarees for every day.");
  assert.equal(savedItems[0].imageUrl, null, "an image must not be required for category copy");
  assert.equal(savedItems[0].published, true);
  await context.close();
});

test("existing fabric categories remain selectable and save as edits", async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  let updatedItem;
  await page.route("**/api/shopify/admin/products", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      currencyCode: "INR",
      products: [{
        id: "gid://shopify/Product/cotton",
        title: "Cotton saree",
        handle: "cotton-saree",
        description: "",
        productType: "Saree",
        status: "ACTIVE",
        tags: [],
        fabric: "Cotton",
        regionalHandloom: "",
        blouseAvailability: "not_specified",
        craftTechnique: "",
        region: "",
        colour: "",
        collectionIds: [],
        imageUrl: null,
        variants: [],
        options: [],
      }],
    }),
  }));
  await page.route("**/api/site-content/existing-cotton-home-image", async (route) => {
    assert.equal(route.request().method(), "PUT");
    updatedItem = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...updatedItem,
        id: "existing-cotton-home-image",
        createdAt: "2026-11-19T00:00:00.000Z",
        updatedAt: "2026-11-19T00:01:00.000Z",
      }),
    });
  });
  await page.goto(`${origin}/tests/browser/fixture.html?screen=home-image-editor&existing=1`);
  await page.getByRole("dialog").waitFor();
  await page.locator(".admin-form select").nth(0).selectOption("fabric_tile");
  await page.locator(".admin-form select").nth(1).selectOption("Cotton");
  await page.getByRole("heading", { name: "Edit home category content" }).waitFor();
  await page.getByTestId("input-category-description").fill("Soft, breathable cotton for warm days.");
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.getByTestId("home-image-editor-closed").waitFor();

  assert.ok(updatedItem, "choosing an existing category should update its current content item");
  assert.equal(updatedItem.title, "Cotton");
  assert.equal(updatedItem.placement, "fabric_tile");
  assert.equal(updatedItem.body, "Soft, breathable cotton for warm days.");
  assert.equal(updatedItem.imageUrl, "https://cdn.example.test/cotton-tile.webp");
  await context.close();
});

test("fabric and collection choices load from the public Shopify catalog", async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.route("**/api/shopify/admin/products", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      currencyCode: "INR",
      products: [{
        id: "gid://shopify/Product/cotton-narayanpet",
        title: "Cotton Narayanpet saree",
        handle: "cotton-narayanpet-saree",
        description: "",
        productType: "Saree",
        status: "ACTIVE",
        tags: [],
        fabric: "",
        regionalHandloom: "",
        blouseAvailability: "not_specified",
        craftTechnique: "",
        region: "",
        colour: "",
        collectionIds: [],
        imageUrl: null,
        variants: [],
        options: [],
      }],
    }),
  }));
  await page.route("**/api/shopify/products", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      products: [{
        id: "gid://shopify/Product/cotton-narayanpet",
        handle: "cotton-narayanpet-saree",
        title: "Cotton Narayanpet saree",
        description: "",
        productType: "Saree",
        tags: [],
        attributes: {
          fabric: "Cotton",
          regionalHandloom: "Narayanpet",
          craftTechnique: "Ikkat",
          region: "Telangana",
          colour: "Red",
          blouseAvailability: "not_specified",
        },
        collections: [],
        images: [],
        variants: [],
      }],
      totalPublishedProducts: 1,
      truncated: false,
    }),
  }));
  await page.route("**/api/site-content", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ items: [] }),
  }));
  await page.goto(`${origin}/tests/browser/fixture.html?screen=home-image-editor`);
  await page.getByRole("dialog").waitFor();
  const rowSelect = page.locator(".admin-form select").nth(0);
  const categorySelect = page.locator(".admin-form select").nth(1);
  await rowSelect.selectOption("fabric_tile");
  await categorySelect.locator('option[value="Cotton"]').waitFor({ state: "attached" });
  await categorySelect.selectOption("Cotton");
  await rowSelect.selectOption("regional_handloom_tile");
  await categorySelect.locator('option[value="Narayanpet"]').waitFor({ state: "attached" });
  await categorySelect.selectOption("Narayanpet");
  assert.equal(await categorySelect.inputValue(), "Narayanpet");
  await context.close();
});

test("merchant can tune and save responsive collection image settings", async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const uploads = [];
  const savedItems = [];
  const product = {
    id: "gid://shopify/Product/narayanpet-image-settings",
    title: "Cotton Narayanpet saree",
    handle: "cotton-narayanpet-saree",
    description: "",
    productType: "Saree",
    status: "ACTIVE",
    tags: [],
    fabric: "Cotton",
    regionalHandloom: "Narayanpet",
    blouseAvailability: "not_specified",
    craftTechnique: "",
    region: "Telangana",
    colour: "",
    collectionIds: [],
    imageUrl: null,
    variants: [],
    options: [],
  };
  await page.route("**/api/shopify/admin/products", route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ currencyCode: "INR", products: [product] }),
  }));
  await page.route("**/api/shopify/products", route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      products: [{
        ...product,
        attributes: { fabric: "Cotton", regionalHandloom: "Narayanpet", craftTechnique: null, region: "Telangana", colour: null },
        collections: [],
        images: [],
      }],
      totalPublishedProducts: 1,
      truncated: false,
    }),
  }));
  await page.route("**/api/site-content/uploads", async route => {
    uploads.push(route.request().postDataJSON());
    const asset = uploads.length === 1 ? "desktop" : "mobile";
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        uploadUrl: `${origin}/mock-collection-image-upload`,
        assetUrl: `https://cdn.example.test/${asset}-narayanpet.webp`,
      }),
    });
  });
  await page.route("**/mock-collection-image-upload", async route => {
    assert.equal(route.request().method(), "PUT");
    await route.fulfill({ status: 200, body: "" });
  });
  await page.route("**/api/site-content", async route => {
    if (route.request().method() !== "POST") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [] }) });
    }
    const body = route.request().postDataJSON();
    savedItems.push(body);
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        ...body,
        id: "narayanpet-responsive-image",
        createdAt: "2026-11-23T00:00:00.000Z",
        updatedAt: "2026-11-23T00:00:00.000Z",
      }),
    });
  });
  await page.goto(`${origin}/tests/browser/fixture.html?screen=home-image-editor`);
  await page.getByRole("dialog").waitFor();
  await page.locator(".admin-form select").nth(0).selectOption("regional_handloom_tile");
  await page.locator(".admin-form select").nth(1).selectOption("Narayanpet");
  await page.locator('.content-media-field input[type="file"]').nth(0).setInputFiles({
    name: "narayanpet-wide.webp",
    mimeType: "image/webp",
    buffer: Buffer.from("desktop-image"),
  });
  await page.locator('.content-media-field input[type="file"]').nth(1).setInputFiles({
    name: "narayanpet-mobile.webp",
    mimeType: "image/webp",
    buffer: Buffer.from("mobile-image"),
  });
  const cropPreview = page.locator(".collection-image-position-editor");
  await cropPreview.scrollIntoViewIfNeeded();
  const cropBounds = await cropPreview.boundingBox();
  assert.ok(cropBounds);
  await page.mouse.move(cropBounds.x + cropBounds.width * 0.5, cropBounds.y + cropBounds.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(cropBounds.x + cropBounds.width * 0.22, cropBounds.y + cropBounds.height * 0.78);
  await page.mouse.up();
  assert.equal(await page.getByLabel("Horizontal image position").inputValue(), "custom");
  assert.equal(await page.getByLabel("Vertical image position").inputValue(), "custom");
  await page.getByLabel("Horizontal image position").selectOption("0");
  await page.getByLabel("Vertical image position").selectOption("100");
  await page.getByLabel("Collection image fit").selectOption("contain");
  await page.getByLabel("Desktop image aspect ratio").selectOption("3:2");
  await page.getByLabel("Mobile image aspect ratio").selectOption("4:3");
  const previews = page.locator(".collection-image-live-preview");
  assert.equal(await previews.count(), 2, "desktop and mobile live previews should both be visible in the editor");
  assert.match(await previews.nth(0).locator("img").getAttribute("src"), /^blob:/);
  assert.match(await previews.nth(1).locator("img").getAttribute("src"), /^blob:/);
  await page.getByRole("button", { name: "Save content" }).click();
  await page.getByTestId("home-image-editor-closed").waitFor();

  assert.equal(uploads.length, 2);
  assert.equal(savedItems.length, 1);
  assert.equal(savedItems[0].imageUrl, "https://cdn.example.test/desktop-narayanpet.webp");
  assert.equal(savedItems[0].mobileImageUrl, "https://cdn.example.test/mobile-narayanpet.webp");
  assert.equal(savedItems[0].imageFit, "contain");
  assert.equal(savedItems[0].desktopImageAspectRatio, "3:2");
  assert.equal(savedItems[0].mobileImageAspectRatio, "4:3");
  assert.equal(savedItems[0].focalPointX, 0);
  assert.equal(savedItems[0].focalPointY, 100);
  await context.close();
});

test("merchant can publish without a collection and later assign a Shopify collection", async () => {
  const created = await openForm();
  const createMutations = await mockCreateOrUpdate(created.page);
  await created.page.getByText("Fabric creates a separate “Shop by Fabric” tile.", { exact: false }).waitFor();
  await created.page.getByText("Collections group products under “Shop by Collection.”", { exact: false }).waitFor();
  await created.page.getByText("Use Fabric to create a home-page fabric tile.", { exact: false }).waitFor();
  await created.page.getByTestId("input-product-title").fill("Hand-block print cotton runner");
  await created.page.getByTestId("input-product-type").fill("Home textile");
  await created.page.getByTestId("input-product-price").fill("1800");
  await created.page.getByTestId("input-product-inventory").fill("4");
  await created.page.getByRole("combobox", { name: "Fabric value" }).fill("Cotton");
  assert.equal(await created.page.locator("#classification-options-fabric option").count() > 0, true);
  await created.page.getByRole("button", { name: "Add Fabric value" }).click();
  await created.page.getByRole("combobox", { name: "Fabric value" }).fill("Linen");
  await created.page.getByRole("button", { name: "Add Fabric value" }).click();
  await created.page.getByRole("combobox", { name: "Regional Handloom / Tradition value" }).fill("Narayanpet");
  await created.page.getByRole("button", { name: "Add Regional Handloom / Tradition value" }).click();
  await created.page.getByRole("combobox", { name: "Weave / Print Technique value" }).fill("Ikkat");
  await created.page.getByRole("button", { name: "Add Weave / Print Technique value" }).click();
  await created.page.getByRole("combobox", { name: "Region of Origin value" }).fill("Odisha");
  await created.page.getByRole("button", { name: "Add Region of Origin value" }).click();
  await created.page.getByRole("combobox", { name: "Colour value" }).fill("Indigo");
  await created.page.getByRole("button", { name: "Add Colour value" }).click();
  assert.equal(await created.page.getByTestId("input-product-publish").isChecked(), true);
  await created.page.getByTestId("button-save-product").click();
  await created.page.getByTestId("fixture-closed").waitFor();
  assert.equal(createMutations.length, 1);
  assert.equal(createMutations[0].body.productType, "Home textile");
  assert.deepEqual(createMutations[0].body.collectionIds, []);
  assert.equal(createMutations[0].body.publishToWebsite, true);
  assert.equal(createMutations[0].body.fabric, '["Cotton","Linen"]');
  assert.equal(createMutations[0].body.regionalHandloom, "Narayanpet");
  assert.equal(createMutations[0].body.craftTechnique, "Ikkat");
  assert.equal(createMutations[0].body.region, "Odisha");
  assert.equal(createMutations[0].body.colour, "Indigo");
  await created.context.close();

  const edited = await openForm({ edit: true });
  const updateMutations = await mockCreateOrUpdate(edited.page, { method: "PATCH" });
  await edited.page.getByLabel("Create or assign a collection").fill("New Craft Collection");
  await edited.page.getByTestId("button-save-product").click();
  await edited.page.getByTestId("fixture-closed").waitFor();
  assert.equal(updateMutations.length, 1);
  assert.deepEqual(updateMutations[0].body.collectionIds, []);
  assert.equal(updateMutations[0].body.newCollectionTitle, "New Craft Collection");
  await edited.context.close();
});

test("homepage fabric image picker includes custom product fabric values", async () => {
  const { context, page } = await openForm();
  await page.goto(`${origin}/tests/browser/fixture.html?screen=home-image-editor`);
  await page.getByRole("dialog").waitFor();
  await page.locator(".admin-form select").nth(0).selectOption("fabric_tile");
  const categories = page.locator(".admin-form select").nth(1);
  const options = await categories.locator("option").allTextContents();
  assert.ok(options.includes("Linen"), "a custom product fabric should be available for its homepage image");
  await context.close();
});

test("slow uploads disable Save until the staged photo reaches product creation", async () => {
  const { context, page } = await openForm({ mobile: true });
  const mutations = await mockCreateOrUpdate(page);
  let releaseUpload;
  let onUploadStarted;
  const started = new Promise((resolve) => { onUploadStarted = resolve; });
  const waiting = new Promise((resolve) => { releaseUpload = resolve; });
  await page.route("**/api/shopify/admin/images", async (route) => {
    onUploadStarted();
    await waiting;
    await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ resourceUrl: uploadUrl }) }).catch(() => {});
  });

  await page.getByTestId("input-product-title").fill("Golden border saree");
  await page.getByTestId("input-product-price").fill("2500");
  await page.getByTestId("input-product-inventory").fill("2");
  await choosePhoto(page);
  await started;
  assert.equal(await page.getByTestId("button-save-product").isDisabled(), true);
  assert.equal(mutations.length, 0, "a pending upload must not submit the product");

  releaseUpload();
  await page.getByText("Photo uploaded. Save the product to add it.", { exact: false }).waitFor();
  await page.getByTestId("button-save-product").click();
  await page.getByTestId("fixture-closed").waitFor();
  assert.equal(mutations.length, 1);
  assert.equal(mutations[0].body.imageUrl, uploadUrl);
  assert.equal(mutations[0].body.title, "Golden border saree");
  await context.close();
});

test("failed uploads can be retried and their source is sent with product creation", async () => {
  const { context, page } = await openForm();
  const mutations = await mockCreateOrUpdate(page);
  let attempts = 0;
  await page.route("**/api/shopify/admin/images", async (route) => {
    attempts += 1;
    await route.fulfill(attempts === 1
      ? { status: 502, contentType: "application/json", body: JSON.stringify({ error: "Storage is unavailable" }) }
      : { status: 201, contentType: "application/json", body: JSON.stringify({ resourceUrl: uploadUrl }) });
  });

  await page.getByTestId("input-product-title").fill("Retry test saree");
  await page.getByTestId("input-product-price").fill("1800");
  await choosePhoto(page);
  await page.getByTestId("text-photo-upload-error").getByText(/Storage is unavailable/).waitFor();
  assert.equal(await page.getByTestId("button-save-product").isDisabled(), true, "failed, still-pending photo must block Save");
  await page.getByTestId("button-retry-photo").click();
  await page.getByText("Photo uploaded. Save the product to add it.", { exact: false }).waitFor();
  await page.getByTestId("button-save-product").click();
  await page.getByTestId("fixture-closed").waitFor();
  assert.equal(attempts, 2);
  assert.equal(mutations[0].body.imageUrl, uploadUrl);
  await context.close();
});

test("a timed-out photo keeps Save blocked until retry succeeds", async () => {
  const { context, page } = await openForm({ setup: useShortPhotoUploadTimeout });
  const shopifyRequests = observeShopifyRequests(page);
  const mutations = await mockCreateOrUpdate(page);
  let attempts = 0;
  await page.route("**/api/shopify/admin/images", async (route) => {
    attempts += 1;
    if (attempts === 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ resourceUrl: uploadUrl }),
      }).catch(() => {});
      return;
    }
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ resourceUrl: uploadUrl }),
    });
  });

  await page.getByTestId("input-product-title").fill("Timeout recovery saree");
  await page.getByTestId("input-product-price").fill("2200");
  await choosePhoto(page);
  await page.getByTestId("text-photo-upload-error").getByText(/The photo upload took too long/).waitFor();
  await page.getByTestId("text-photo-upload-error").getByText(/Retry or remove this photo before saving/).waitFor();
  assert.equal(await page.getByTestId("button-save-product").isDisabled(), true);
  assert.equal(mutations.length, 0, "a timed-out, still-pending photo must block product creation");
  assert.equal(await page.getByTestId("button-retry-photo").isVisible(), true);

  await page.getByTestId("button-retry-photo").click();
  await page.getByText("Photo uploaded. Save the product to add it.", { exact: false }).waitFor();
  assert.equal(await page.getByTestId("button-save-product").isDisabled(), false);
  await page.getByTestId("button-save-product").click();
  await page.getByTestId("fixture-closed").waitFor();

  assert.equal(attempts, 2);
  assert.equal(mutations.length, 1);
  assert.equal(mutations[0].body.imageUrl, uploadUrl);
  assert.deepEqual(shopifyRequests, [], "all Shopify interactions must remain mocked by the browser test");
  await context.close();
});

test("a disconnected upload keeps Save blocked until the pending photo is removed", async () => {
  const { context, page } = await openForm();
  const shopifyRequests = observeShopifyRequests(page);
  const mutations = await mockCreateOrUpdate(page);
  await page.route("**/api/shopify/admin/images", async (route) => {
    await route.abort("internetdisconnected");
  });

  await page.getByTestId("input-product-title").fill("Disconnected upload saree");
  await page.getByTestId("input-product-price").fill("2300");
  await choosePhoto(page);
  await page.getByTestId("text-photo-upload-error").getByText(/The connection was interrupted/).waitFor();
  await page.getByTestId("text-photo-upload-error").getByText(/Retry or remove this photo before saving/).waitFor();
  assert.equal(await page.getByTestId("button-save-product").isDisabled(), true);
  assert.equal(mutations.length, 0, "a disconnected, still-pending photo must block product creation");

  await page.getByTestId("button-remove-photo").click();
  assert.equal(await page.getByTestId("button-save-product").isDisabled(), false);
  await page.getByTestId("button-save-product").click();
  await page.getByTestId("fixture-closed").waitFor();

  assert.equal(mutations.length, 1);
  assert.equal(Object.hasOwn(mutations[0].body, "imageUrl"), false);
  assert.deepEqual(shopifyRequests, [], "all Shopify interactions must remain mocked by the browser test");
  await context.close();
});

test("canceling a slow upload unblocks saving product details without a photo", async () => {
  const { context, page } = await openForm();
  const mutations = await mockCreateOrUpdate(page);
  let releaseUpload;
  const waiting = new Promise((resolve) => { releaseUpload = resolve; });
  await page.route("**/api/shopify/admin/images", async (route) => {
    await waiting;
    await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ resourceUrl: uploadUrl }) }).catch(() => {});
  });
  await page.getByTestId("input-product-title").fill("Cancel upload saree");
  await page.getByTestId("input-product-price").fill("1999");
  await choosePhoto(page);
  await page.getByTestId("button-remove-photo").getByText("Cancel upload").waitFor();
  await page.getByTestId("button-remove-photo").click();
  assert.equal(await page.getByTestId("button-save-product").isDisabled(), false);
  await page.getByTestId("button-save-product").click();
  await page.getByTestId("fixture-closed").waitFor();
  assert.equal(mutations.length, 1);
  assert.equal(Object.hasOwn(mutations[0].body, "imageUrl"), false);
  releaseUpload();
  await context.close();
});

test("removing a failed photo allows saving product details without a photo", async () => {
  const { context, page } = await openForm();
  const mutations = await mockCreateOrUpdate(page);
  await page.route("**/api/shopify/admin/images", async (route) => {
    await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Upload service unavailable" }) });
  });
  await page.getByTestId("input-product-title").fill("Updated product details only");
  await page.getByTestId("input-product-price").fill("2100");
  await choosePhoto(page);
  await page.getByTestId("text-photo-upload-error").waitFor();
  await page.getByTestId("button-remove-photo").click();
  await page.getByTestId("button-save-product").click();
  await page.getByTestId("fixture-closed").waitFor();

  assert.equal(mutations.length, 1);
  assert.equal(mutations[0].body.title, "Updated product details only");
  assert.equal(Object.hasOwn(mutations[0].body, "imageUrl"), false);
  await context.close();
});

test("staged photos reach the update gallery and saving details keeps the existing media", async () => {
  const galleryCalls = [];
  let releaseMedia;
  let onMediaStarted;
  const mediaStarted = new Promise((resolve) => { onMediaStarted = resolve; });
  const mediaGate = new Promise((resolve) => { releaseMedia = resolve; });
  const { context, page, setupResult: mutations } = await openForm({
    edit: true,
    setup: (targetPage) => mockCreateOrUpdate(targetPage, {
      method: "PATCH",
      beforeMediaResponse: async () => {
        onMediaStarted();
        await mediaGate;
      },
      onMutation: (body, request) => {
        if (request.url().includes("/media")) galleryCalls.push({ body, request });
      },
    }),
  });
  await mockSuccessfulUpload(page);
  await page.getByTestId("input-product-title").fill("Description refreshed");
  await page.getByTestId("input-product-fabric-composition").fill("Pure silk with zari");
  await page.getByTestId("input-product-saree-length").fill("5.5 metres");
  await page.getByTestId("input-product-wash-care").fill("Dry clean only");
  await page.getByTestId("button-add-gallery-photo").click();
  await page.getByLabel("Choose a product gallery photo").setInputFiles({
    name: "gallery-update.jpg",
    mimeType: "image/jpeg",
    buffer: imageBytes,
  });
  await mediaStarted;
  assert.equal(await page.getByTestId("button-save-product").isDisabled(), true, "product details cannot save while the gallery update is pending");
  releaseMedia();
  await page.getByText("Photo added to the gallery.", { exact: false }).waitFor();

  assert.equal(galleryCalls.length, 1);
  assert.equal(galleryCalls[0].request.method(), "POST");
  assert.ok(galleryCalls[0].request.url().endsWith("/media"));
  assert.equal(galleryCalls[0].body.resourceUrl, uploadUrl);
  await page.getByTestId("gallery-item-0").getByText("Existing gallery photo").waitFor();

  await page.getByTestId("input-product-title").fill("Description refreshed");
  await page.getByTestId("button-save-product").click();
  await page.getByTestId("fixture-closed").waitFor();

  assert.equal(mutations.length, 1);
  assert.equal(mutations[0].request.method(), "PATCH");
  assert.equal(Object.hasOwn(mutations[0].body, "imageUrl"), false);
  assert.deepEqual(mutations[0].body.productDetails, {
    fabricComposition: "Pure silk with zari",
    sareeLength: "5.5 metres",
    blousePieceLength: "",
    borderDetails: "",
    designPattern: "",
    washCareInstructions: "Dry clean only",
    additionalInformation: "",
  });
  await context.close();
});

test("merchant can edit one photo description and sees the saved Shopify value after reload", async () => {
  let savedAlt = "Existing gallery photo";
  const saves = [];
  const { context, page } = await openForm({
    edit: true,
    setup: async (targetPage) => {
      await targetPage.route("**/api/shopify/admin/products/**/media**", async (route) => {
        const request = route.request();
        if (request.method() === "GET") {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              featuredMediaId: "existing-photo",
              replacementStatus: null,
              media: [{
                id: "existing-photo",
                mediaContentType: "IMAGE",
                status: "READY",
                alt: savedAlt,
                imageUrl: "https://cdn.example.test/existing-gallery-photo.jpg",
                errors: [],
              }],
            }),
          });
          return;
        }
        if (request.method() === "PATCH") {
          const body = request.postDataJSON();
          saves.push(body);
          savedAlt = body.alt;
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              featuredMediaId: "existing-photo",
              replacementStatus: null,
              media: [{
                id: "existing-photo",
                mediaContentType: "IMAGE",
                status: "READY",
                alt: savedAlt,
                imageUrl: "https://cdn.example.test/existing-gallery-photo.jpg",
                errors: [],
              }],
            }),
          });
          return;
        }
        await route.continue();
      });
    },
  });

  await page.getByTestId("button-edit-gallery-alt-0").click();
  const input = page.getByTestId("input-gallery-alt-0");
  assert.equal(await input.inputValue(), "Existing gallery photo", "editing must start with the saved description");
  await input.fill("Blue silk saree with a gold zari border");
  await page.getByTestId("button-save-gallery-alt-0").click();
  await page.getByText("Image description saved.", { exact: false }).waitFor();
  assert.deepEqual(saves, [{ alt: "Blue silk saree with a gold zari border" }]);
  await page.reload();
  await page.getByRole("dialog").waitFor();
  await page.getByTestId("gallery-item-0").getByText("Blue silk saree with a gold zari border").waitFor();
  assert.equal(savedAlt, "Blue silk saree with a gold zari border");
  await context.close();
});

test("a failed gallery photo upload can be retried without losing existing media", async () => {
  const galleryCalls = [];
  const { context, page } = await openForm({
    edit: true,
    setup: (targetPage) => mockCreateOrUpdate(targetPage, {
      method: "PATCH",
      onMutation: (body, request) => {
        if (request.url().includes("/media")) galleryCalls.push({ body, request });
      },
    }),
  });
  let attempts = 0;
  await page.route("**/api/shopify/admin/images", async (route) => {
    attempts += 1;
    await route.fulfill(attempts === 1
      ? { status: 502, contentType: "application/json", body: JSON.stringify({ error: "Temporary storage failure" }) }
      : { status: 201, contentType: "application/json", body: JSON.stringify({ resourceUrl: uploadUrl }) });
  });

  const picker = page.getByLabel("Choose a product gallery photo");
  await page.getByTestId("gallery-item-0").getByText("Existing gallery photo").waitFor({ state: "attached" });
  await page.getByTestId("button-add-gallery-photo").click();
  await picker.setInputFiles({ name: "gallery-retry.jpg", mimeType: "image/jpeg", buffer: imageBytes });
  await page.getByTestId("text-gallery-error").getByText(/Temporary storage failure/).waitFor();
  assert.equal(await page.getByTestId("button-save-product").isDisabled(), false);
  assert.equal(galleryCalls.length, 0, "failed uploads must not change gallery media");
  await page.getByTestId("gallery-item-0").getByText("Existing gallery photo").waitFor({ state: "attached" });

  await page.getByTestId("button-add-gallery-photo").click();
  await picker.setInputFiles({ name: "gallery-retry.jpg", mimeType: "image/jpeg", buffer: imageBytes });
  await page.getByText("Photo added to the gallery.", { exact: false }).waitFor();
  assert.equal(attempts, 2);
  assert.equal(galleryCalls.length, 1);
  assert.equal(galleryCalls[0].body.resourceUrl, uploadUrl);
  await page.getByTestId("gallery-item-0").getByText("Existing gallery photo").waitFor();
  await context.close();
});

test("a failed gallery replacement keeps the original until a retry is ready", async () => {
  const { context, page, setupResult: replacements } = await openForm({
    edit: true,
    setup: (targetPage) => mockReplacementFlow(targetPage, ["FAILED", "REPLACED"]),
  });
  page.on("dialog", (dialog) => dialog.accept());
  await mockSuccessfulUpload(page);
  await page.getByTestId("gallery-item-0").getByText("Existing gallery photo").waitFor();

  const picker = page.getByLabel("Choose a product gallery photo");
  await page.getByTestId("button-gallery-replace-0").click();
  await picker.setInputFiles({ name: "failed-replacement.jpg", mimeType: "image/jpeg", buffer: imageBytes });
  await page.getByTestId("text-gallery-error").getByText(/Shopify could not process the replacement/).waitFor();

  const originalImage = page.locator('img[src="https://cdn.example.test/existing-gallery-photo.jpg"]');
  await originalImage.waitFor({ state: "visible" });
  await page.getByTestId("gallery-item-1").getByText("Failed", { exact: true }).waitFor();
  assert.equal(replacements.length, 1);
  assert.equal(replacements[0].replaceMediaId, "existing-photo");

  await page.getByTestId("button-gallery-replace-0").click();
  await picker.setInputFiles({ name: "ready-replacement.jpg", mimeType: "image/jpeg", buffer: imageBytes });
  await page.getByText("The selected image was replaced.", { exact: false }).waitFor();

  assert.equal(replacements.length, 2);
  assert.equal(replacements[1].replaceMediaId, "existing-photo");
  await originalImage.waitFor({ state: "detached" });
  await page.locator('img[src="https://cdn.example.test/replacement-2.jpg"]').waitFor({ state: "visible" });
  await context.close();
});

test("a processing gallery replacement leaves the original available for recovery", async () => {
  const { context, page, setupResult: replacements } = await openForm({
    edit: true,
    setup: (targetPage) => mockReplacementFlow(targetPage, ["PROCESSING", "REPLACED"]),
  });
  page.on("dialog", (dialog) => dialog.accept());
  await mockSuccessfulUpload(page);
  await page.getByTestId("gallery-item-0").getByText("Existing gallery photo").waitFor();

  const picker = page.getByLabel("Choose a product gallery photo");
  const originalImage = page.locator('img[src="https://cdn.example.test/existing-gallery-photo.jpg"]');
  await page.getByTestId("button-gallery-replace-0").click();
  await picker.setInputFiles({ name: "processing-replacement.jpg", mimeType: "image/jpeg", buffer: imageBytes });
  await page.getByText(/The new photo is processing\. The previous image was kept/).waitFor();

  await originalImage.waitFor({ state: "visible" });
  await page.getByTestId("gallery-item-1").getByText("Processing", { exact: true }).waitFor();
  assert.equal(replacements.length, 1);
  assert.equal(replacements[0].replaceMediaId, "existing-photo");

  await page.getByTestId("button-gallery-replace-0").click();
  await picker.setInputFiles({ name: "recovered-replacement.jpg", mimeType: "image/jpeg", buffer: imageBytes });
  await page.getByText("The selected image was replaced.", { exact: false }).waitFor();

  assert.equal(replacements.length, 2);
  assert.equal(replacements[1].replaceMediaId, "existing-photo");
  await originalImage.waitFor({ state: "detached" });
  await page.locator('img[src="https://cdn.example.test/replacement-2.jpg"]').waitFor({ state: "visible" });
  await context.close();
});

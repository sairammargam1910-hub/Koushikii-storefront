import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { build } from "esbuild";
import express from "express";

const compiled = await build({
  entryPoints: [new URL("../src/routes/shopifyAdmin.ts", import.meta.url).pathname],
  bundle: true, write: false, format: "cjs", platform: "node", external: ["express"],
  plugins: [{
    name: "gallery-boundaries",
    setup(builder) {
      builder.onResolve({ filter: /^@replit\/connectors-sdk$/ }, () => ({ path: "connector", namespace: "test" }));
      builder.onResolve({ filter: /merchantAdminAuth$/ }, () => ({ path: "auth", namespace: "test" }));
      builder.onResolve({ filter: /^\.\/shopify$/ }, () => ({ path: "catalog", namespace: "test" }));
      builder.onResolve({ filter: /shopifyImageUpload$/ }, () => ({ path: "image", namespace: "test" }));
      builder.onLoad({ filter: /.*/, namespace: "test" }, ({ path }) => ({
        contents: {
          connector: "export class ReplitConnectors { proxy(...args) { return sdkProxy(...args); } }",
          auth: 'export const requireMerchantAdmin = (req,res,next) => req.get("x-test-admin") === "yes" ? next() : res.status(403).json({error:"Forbidden"});',
          catalog: "export const invalidateShopifyCatalog = () => {};",
          image: "export const MAX_IMAGE_BYTES = 100; export const stageProductImage = async () => '';",
        }[path],
      }));
    },
  }],
});

const gid = (type, id) => `gid://shopify/${type}/${id}`;
const productId = gid("Product", 1);
const media = (id, overrides = {}) => ({
  id: gid("MediaImage", id), alt: `Photo ${id}`, mediaContentType: "IMAGE",
  status: "READY", mediaErrors: [], image: { url: `https://cdn.shopify.com/${id}.jpg`, altText: null },
  ...overrides,
});

async function harness(run, options = {}) {
  const state = {
    product: {
      id: productId, title: "Saree", handle: "saree", description: "", productType: "Saree",
      status: "ACTIVE", tags: [], featuredMedia: null,
      fabricMetafield: null, craftTechniqueMetafield: null, regionMetafield: null, colourMetafield: null,
      collections: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
      options: [],
      variants: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
    },
    media: options.media ?? [media(1), media(2), media(3)],
    calls: [],
    failCreate: false,
    failDelete: false,
    failUpdateAlt: false,
    reorderPending: false,
    createStatus: options.createStatus ?? "PROCESSING",
  };
  const module = { exports: {} };
  new Function("require", "module", "exports", "sdkProxy", compiled.outputFiles[0].text)(
    createRequire(import.meta.url), module, module.exports,
    async (_connector, path, request) => {
      assert.match(path, /\/admin\/api\/2026-04\/graphql.json/);
      const { query, variables } = JSON.parse(request.body);
      state.calls.push({ query, variables });
      let data;
      if (query.includes("query MerchantProductMedia")) {
        const start = variables.after ? 100 : 0;
        const nodes = state.media.slice(start, start + 100);
        data = { product: { featuredMedia: state.media[0] ? { id: state.media[0].id } : null, media: { nodes, pageInfo: {
          hasNextPage: start + 100 < state.media.length,
          endCursor: start + 100 < state.media.length ? "gallery-page-2" : null,
        } } } };
      } else if (query.includes("query MerchantProduct(")) {
        data = { shop: { currencyCode: "INR" }, product: structuredClone(state.product) };
      } else if (query.includes("mutation MerchantProductCreateMedia")) {
        if (state.failCreate) {
          data = { productCreateMedia: { media: [], mediaUserErrors: [{ message: "Shopify rejected the photo" }] } };
        } else {
          const next = media(500, { status: state.createStatus, image: null, alt: state.product.title });
          state.media.push(next);
          data = { productCreateMedia: { media: [{ id: next.id, status: next.status }], mediaUserErrors: [] } };
        }
      } else if (query.includes("mutation MerchantProductDeleteMedia")) {
        const ids = variables.mediaIds;
        if (state.failDelete) {
          data = { productDeleteMedia: { deletedMediaIds: [], mediaUserErrors: [{ message: "Shopify rejected the removal" }] } };
        } else {
          state.media = state.media.filter((item) => !ids.includes(item.id));
          data = { productDeleteMedia: { deletedMediaIds: ids, mediaUserErrors: [] } };
        }
      } else if (query.includes("mutation MerchantProductUpdateMediaAlt")) {
        if (state.failUpdateAlt) {
          data = { productUpdateMedia: { media: [], mediaUserErrors: [{ message: "Shopify rejected the description" }] } };
        } else {
          const updated = variables.media.map((input) => {
            const item = state.media.find((entry) => entry.id === input.id);
            if (item) item.alt = input.alt;
            return item && { id: item.id, alt: item.alt };
          }).filter(Boolean);
          data = { productUpdateMedia: { media: updated, mediaUserErrors: [] } };
        }
      } else if (query.includes("mutation MerchantProductReorderMedia")) {
        const positions = new Map(variables.moves.map((move) => [move.id, move.newPosition]));
        state.media.sort((left, right) => positions.get(left.id) - positions.get(right.id));
        data = { productReorderMedia: { job: { id: "gid://shopify/Job/99" }, mediaUserErrors: [] } };
      } else if (query.includes("query MerchantGalleryReorderJob")) {
        data = { job: { done: !state.reorderPending } };
      } else {
        throw new Error(`Unexpected query: ${query}`);
      }
      return Response.json({ data });
    },
  );
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.log = { error() {} }; next(); });
  app.use("/api", module.exports.default);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/shopify/admin/products/${encodeURIComponent(productId)}`;
  const request = async (method, suffix, body, admin = true) => {
    const response = await fetch(base + suffix, {
      method,
      headers: { "Content-Type": "application/json", ...(admin ? { "x-test-admin": "yes" } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, data: await response.json() };
  };
  try { await run({ state, request }); }
  finally { await new Promise((resolve) => server.close(resolve)); }
}

test("loads every media page and exposes Shopify processing errors", async () => {
  const entries = Array.from({ length: 101 }, (_, index) => media(index + 1));
  entries[0] = media(1, {
    status: "FAILED",
    mediaErrors: [{ code: "IMAGE_DOWNLOAD_FAILURE", message: "Image processing failed", details: "Source unavailable" }],
  });
  await harness(async ({ request, state }) => {
    const result = await request("GET", "/media");
    assert.equal(result.status, 200);
    assert.equal(result.data.media.length, 101);
    assert.equal(result.data.media[0].status, "FAILED");
    assert.deepEqual(result.data.media[0].errors[0], {
      code: "IMAGE_DOWNLOAD_FAILURE", message: "Image processing failed", details: "Source unavailable",
    });
    assert.equal(state.calls.filter((call) => call.query.includes("MerchantProductMedia")).length, 2);
  }, { media: entries });
});

test("saves image alternative text in Shopify and returns it on a later gallery load", async () => {
  await harness(async ({ request, state }) => {
    const oldDescriptions = state.media.map((item) => item.alt);
    const result = await request("PATCH", `/media/${encodeURIComponent(gid("MediaImage", 2))}`, {
      alt: "Indigo silk saree with a gold woven border",
    });
    assert.equal(result.status, 200);
    assert.equal(result.data.media.find((item) => item.id === gid("MediaImage", 2)).alt, "Indigo silk saree with a gold woven border");
    assert.equal(state.media[0].alt, oldDescriptions[0], "other Shopify descriptions must remain unchanged");
    assert.equal(state.media[2].alt, oldDescriptions[2], "other Shopify descriptions must remain unchanged");
    const savedInput = state.calls.find((call) => call.query.includes("mutation MerchantProductUpdateMediaAlt"));
    assert.deepEqual(savedInput.variables.media, [{
      id: gid("MediaImage", 2),
      alt: "Indigo silk saree with a gold woven border",
    }]);
    const reloaded = await request("GET", "/media");
    assert.equal(reloaded.data.media.find((item) => item.id === gid("MediaImage", 2)).alt, "Indigo silk saree with a gold woven border");
  });
});

test("validates image ownership, image type, description length, and Shopify update errors", async () => {
  await harness(async ({ request, state }) => {
    const imageUrl = `/media/${encodeURIComponent(gid("MediaImage", 2))}`;
    assert.equal((await request("PATCH", imageUrl, { alt: "x".repeat(513) })).status, 400);
    assert.equal((await request("PATCH", `/media/${encodeURIComponent(gid("MediaImage", 99))}`, { alt: "Description" })).status, 404);
    state.media[1] = media(2, { mediaContentType: "VIDEO" });
    assert.equal((await request("PATCH", imageUrl, { alt: "Description" })).status, 400);
    state.media[1] = media(2);
    state.failUpdateAlt = true;
    const failed = await request("PATCH", imageUrl, { alt: "Description" });
    assert.equal(failed.status, 400);
    assert.equal(state.media[1].alt, "Photo 2", "Shopify rejection must not overwrite the saved description");
    assert.equal((await request("PATCH", imageUrl, { alt: "" }, false)).status, 403);
  });
});

test("replaces only the selected image after Shopify accepts its replacement", async () => {
  await harness(async ({ request, state }) => {
    const result = await request("POST", "/media", {
      resourceUrl: "https://storage.googleapis.com/shopify-upload/new-photo.jpg",
      replaceMediaId: gid("MediaImage", 2),
    });
    assert.equal(result.status, 200);
    assert.deepEqual(state.media.map((item) => item.id), [gid("MediaImage", 1), gid("MediaImage", 3), gid("MediaImage", 500)]);
    assert.equal(result.data.replacementStatus, "REPLACED");
    assert.equal(result.data.media.find((item) => item.id === gid("MediaImage", 500)).status, "READY");
    assert.equal(state.calls.find((call) => call.query.includes("MerchantProductCreateMedia")).variables.media[0].originalSource, "https://storage.googleapis.com/shopify-upload/new-photo.jpg");
    assert.deepEqual(state.calls.find((call) => call.query.includes("MerchantProductDeleteMedia")).variables.mediaIds, [gid("MediaImage", 2)]);
  }, { createStatus: "READY" });
});

test("leaves the previous image untouched when Shopify rejects a replacement", async () => {
  await harness(async ({ request, state }) => {
    state.failCreate = true;
    const result = await request("POST", "/media", {
      resourceUrl: "https://storage.googleapis.com/shopify-upload/new-photo.jpg",
      replaceMediaId: gid("MediaImage", 2),
    });
    assert.equal(result.status, 400);
    assert.equal(state.media.some((item) => item.id === gid("MediaImage", 2)), true);
    assert.equal(state.calls.some((call) => call.query.includes("MerchantProductDeleteMedia")), false);
  });
});

test("keeps the original image while Shopify is still processing its replacement", async () => {
  await harness(async ({ request, state }) => {
    const result = await request("POST", "/media", {
      resourceUrl: "https://storage.googleapis.com/shopify-upload/new-photo.jpg",
      replaceMediaId: gid("MediaImage", 2),
    });
    assert.equal(result.status, 200);
    assert.equal(result.data.replacementStatus, "PROCESSING");
    assert.equal(state.media.some((item) => item.id === gid("MediaImage", 2)), true);
    assert.equal(state.calls.some((call) => call.query.includes("mutation MerchantProductDeleteMedia")), false);
  });
});

test("keeps the original image when Shopify fails to process its replacement", async () => {
  await harness(async ({ request, state }) => {
    const result = await request("POST", "/media", {
      resourceUrl: "https://storage.googleapis.com/shopify-upload/new-photo.jpg",
      replaceMediaId: gid("MediaImage", 2),
    });
    assert.equal(result.status, 200);
    assert.equal(result.data.replacementStatus, "FAILED");
    assert.equal(state.media.some((item) => item.id === gid("MediaImage", 2)), true);
    assert.equal(state.calls.some((call) => call.query.includes("mutation MerchantProductDeleteMedia")), false);
  }, { createStatus: "FAILED" });
});

test("does not delete the previous image or any other media when Shopify rejects removal", async () => {
  await harness(async ({ request, state }) => {
    state.failDelete = true;
    const result = await request("POST", "/media", {
      resourceUrl: "https://storage.googleapis.com/shopify-upload/new-photo.jpg",
      replaceMediaId: gid("MediaImage", 2),
    });
    assert.equal(result.status, 400);
    assert.deepEqual(state.media.map((item) => item.id), [gid("MediaImage", 1), gid("MediaImage", 2), gid("MediaImage", 3), gid("MediaImage", 500)]);
  }, { createStatus: "READY" });
});

test("reorders the full gallery so the first image becomes featured", async () => {
  await harness(async ({ request, state }) => {
    const expectedMediaIds = state.media.map((item) => item.id);
    const ids = [...expectedMediaIds].reverse();
    const result = await request("PATCH", "/media/order", { expectedMediaIds, mediaIds: ids });
    assert.equal(result.status, 200);
    assert.deepEqual(result.data.media.map((item) => item.id), ids);
    assert.deepEqual(state.calls.find((call) => call.query.includes("MerchantProductReorderMedia")).variables.moves.map((move) => move.newPosition), [0, 1, 2]);
    assert.equal(state.calls.some((call) => call.query.includes("MerchantGalleryReorderJob")), true);
  });
});

test("rejects a reorder based on a stale gallery order without writing", async () => {
  await harness(async ({ request, state }) => {
    const expectedMediaIds = state.media.map((item) => item.id);
    state.media.reverse();
    const currentIds = state.media.map((item) => item.id);
    const result = await request("PATCH", "/media/order", {
      expectedMediaIds,
      mediaIds: [...expectedMediaIds].reverse(),
    });
    assert.equal(result.status, 409);
    assert.match(result.data.error, /changed in another session.*Refresh/i);
    assert.deepEqual(state.media.map((item) => item.id), currentIds);
    assert.equal(state.calls.some((call) => call.query.includes("mutation MerchantProductReorderMedia")), false);
  });
});

test("rejects partial order writes and protects all gallery changes with merchant authorization", async () => {
  await harness(async ({ request, state }) => {
    const expectedMediaIds = state.media.map((item) => item.id);
    assert.equal((await request("PATCH", "/media/order", { expectedMediaIds, mediaIds: [gid("MediaImage", 1)] })).status, 400);
    assert.equal((await request("GET", "/media", undefined, false)).status, 403);
    assert.equal((await request("DELETE", `/media/${encodeURIComponent(gid("MediaImage", 1))}`, undefined, false)).status, 403);
    assert.equal((await request("POST", "/media", { resourceUrl: "https://storage.googleapis.com/photo.jpg" }, false)).status, 403);
    assert.equal(state.calls.some((call) => call.query.includes("mutation ")), false);
  });
});

test("generated media routes keep Shopify GIDs inside encoded path segments", async () => {
  const output = await build({
    entryPoints: [new URL("../../../lib/api-client-react/src/generated/api.ts", import.meta.url).pathname],
    bundle: true, write: false, format: "cjs", platform: "node",
    external: ["@tanstack/react-query"],
  });
  const module = { exports: {} };
  new Function("require", "module", "exports", output.outputFiles[0].text)(
    () => ({}), module, module.exports,
  );
  const mediaId = gid("MediaImage", 77);
  assert.equal(module.exports.getGetShopifyAdminProductMediaUrl(productId), `/api/shopify/admin/products/${encodeURIComponent(productId)}/media`);
  assert.equal(module.exports.getUpdateShopifyAdminProductMediaUrl(productId), `/api/shopify/admin/products/${encodeURIComponent(productId)}/media`);
  assert.equal(module.exports.getReorderShopifyAdminProductMediaUrl(productId), `/api/shopify/admin/products/${encodeURIComponent(productId)}/media/order`);
  assert.equal(module.exports.getDeleteShopifyAdminProductMediaUrl(productId, mediaId), `/api/shopify/admin/products/${encodeURIComponent(productId)}/media/${encodeURIComponent(mediaId)}`);
  assert.equal(module.exports.getUpdateShopifyAdminProductMediaAltUrl(productId, mediaId), `/api/shopify/admin/products/${encodeURIComponent(productId)}/media/${encodeURIComponent(mediaId)}`);
});

test("removes only a media item belonging to the requested product", async () => {
  await harness(async ({ request, state }) => {
    assert.equal((await request("DELETE", `/media/${encodeURIComponent(gid("MediaImage", 99))}`)).status, 404);
    assert.equal(state.calls.some((call) => call.query.includes("mutation MerchantProductDeleteMedia")), false);
    const result = await request("DELETE", `/media/${encodeURIComponent(gid("MediaImage", 1))}`);
    assert.equal(result.status, 200);
    assert.deepEqual(result.data.media.map((item) => item.id), [gid("MediaImage", 2), gid("MediaImage", 3)]);
  });
});

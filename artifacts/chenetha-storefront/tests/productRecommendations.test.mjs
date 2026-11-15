import test from "node:test";
import assert from "node:assert/strict";
import {
  getShopifyProductRecommendations,
  getShopifyProductSummary,
  isSareeProductType,
} from "../src/storefront/shopifyProductRecommendations.ts";

function product(id, overrides = {}) {
  return {
    id: `gid://shopify/Product/${id}`,
    createdAt: "2026-01-01T00:00:00Z",
    handle: `piece-${id}`,
    title: `Handloom piece ${id}`,
    description: "A handloom piece.",
    productType: "Saree",
    tags: [],
    attributes: {
      fabric: null,
      regionalHandloom: null,
      craftTechnique: null,
      region: null,
      colour: null,
      blouseAvailability: "not_specified",
    },
    collections: [],
    images: [{ url: `https://images.example/${id}.jpg`, altText: null }],
    variants: [{
      id: `gid://shopify/ProductVariant/${id}`,
      title: "Default Title",
      availableForSale: true,
      price: "1800.00",
      currencyCode: "INR",
      selectedOptions: [],
    }],
    ...overrides,
  };
}

test("recommendations follow tradition, weave, fabric, type, then collection relevance", () => {
  const current = product("current", {
    attributes: {
      fabric: "Cotton",
      regionalHandloom: "Narayanpet",
      craftTechnique: "Ikkat",
      region: "Telangana",
      colour: "Maroon",
      blouseAvailability: "included",
    },
    collections: [{ id: "collection-1", handle: "silk-edit", title: "Silk Edit" }],
  });
  const tradition = product("tradition", {
    attributes: { ...product("x").attributes, regionalHandloom: "Narayanpet" },
  });
  const weave = product("weave", {
    productType: "Dupatta",
    attributes: { ...product("x").attributes, craftTechnique: "Ikkat" },
  });
  const fabric = product("fabric", {
    productType: "Runner",
    attributes: { ...product("x").attributes, fabric: "Cotton" },
  });
  const sameType = product("type", {
    attributes: { ...product("x").attributes, regionalHandloom: null, craftTechnique: null, fabric: null },
  });
  const sameCollection = product("collection", {
    productType: "Dupatta",
    collections: [{ id: "collection-1", handle: "silk-edit", title: "Silk Edit" }],
  });
  const unrelated = product("unrelated", { productType: "Home Textile" });

  assert.deepEqual(
    getShopifyProductRecommendations(current, [
      sameCollection, sameType, fabric, weave, tradition, unrelated,
    ], 5).map(({ id }) => id),
    [tradition.id, weave.id, fabric.id, sameType.id, sameCollection.id],
  );
});

test("recommendations exclude unavailable, image-less, demo, duplicate, and current products", () => {
  const current = product("current");
  const unavailable = product("unavailable", {
    variants: [{ id: "gid://shopify/ProductVariant/2", availableForSale: false, price: "1200" }],
  });
  const noImage = product("no-image", { images: [] });
  const demo = product("demo-saree", { title: "Sample saree" });
  const related = product("related");

  assert.deepEqual(
    getShopifyProductRecommendations(current, [
      current,
      unavailable,
      noImage,
      demo,
      related,
      { ...related, title: "Duplicate record" },
    ]).map(({ id }) => id),
    [related.id],
  );
});

test("no matching products produces no recommendations and respects the requested limit", () => {
  const current = product("current", { productType: "Saree" });
  const unrelated = product("unrelated", { productType: "Home Textile" });
  assert.deepEqual(getShopifyProductRecommendations(current, [unrelated]), []);

  const sameTypeProducts = [product("a"), product("b"), product("c")];
  assert.equal(getShopifyProductRecommendations(current, sameTypeProducts, 2).length, 2);
});

test("product summary is a short safe text excerpt and saree relevance uses product type", () => {
  assert.equal(
    getShopifyProductSummary("A handwoven cotton saree. A longer second sentence follows."),
    "A handwoven cotton saree.",
  );
  assert.equal(
    getShopifyProductSummary("<p>A cotton saree</p>", 20),
    "A cotton saree",
  );
  assert.equal(isSareeProductType("Saree"), true);
  assert.equal(isSareeProductType("Dupatta"), false);
});

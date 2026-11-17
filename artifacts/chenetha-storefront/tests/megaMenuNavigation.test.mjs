import test from "node:test";
import assert from "node:assert/strict";
import { CreateSiteContentBody } from "../../../lib/api-zod/src/generated/api.ts";
import {
  getFabricCategoryOptions,
  getCustomerNavigationValues,
  getMegaMenuFabricOptions,
  getMegaMenuWeaveOptions,
  getRegionalHandloomOptionsForFabric,
  getShopifyClassificationValues,
  getShopifyFabricValues,
  getShopifyRegionalHandloomCategories,
  matchesShopifyNavigationSelection,
} from "../src/storefront/shopifyCatalogData.ts";

function product(id, { fabric = "", regionalHandloom = "", weave = "" } = {}) {
  return {
    id: `gid://shopify/Product/${id}`,
    title: `Published textile ${id}`,
    description: "",
    productType: "Saree",
    tags: [],
    attributes: {
      fabric: fabric || null,
      regionalHandloom: regionalHandloom || null,
      craftTechnique: weave || null,
      region: null,
      colour: null,
      blouseAvailability: "not_specified",
    },
    collections: [],
    images: [],
    variants: [],
  };
}

test("mega-menu fabrics only include non-empty standard categories and Others", () => {
  const products = [
    product("cotton", { fabric: "Cotton" }),
    product("silk", { fabric: "Silk" }),
    product("blend", { fabric: "Cotton-Silk" }),
    product("linen", { fabric: "Linen" }),
    product("test", { fabric: "test fabric" }),
  ];

  assert.deepEqual(getMegaMenuFabricOptions(products), [
    "Cotton",
    "Silk",
    "Cotton-Silk",
    "Others",
  ]);
  assert.deepEqual(getMegaMenuFabricOptions([product("cotton", { fabric: "Cotton" })]), [
    "Cotton",
  ]);
});

test("home fabric tiles keep custom categories and omit empty defaults and test values", () => {
  assert.deepEqual(getFabricCategoryOptions(["Cotton", "Linen", "test fabric"]), [
    "Cotton",
    "Linen",
  ]);
});

test("customer filters and product editor suggestions omit test and demo classifications", () => {
  const products = [
    product("cotton", { fabric: "Cotton", regionalHandloom: "Narayanpet", weave: "Ikat" }),
    product("bad-values", {
      fabric: "test fabric",
      regionalHandloom: "test tradition",
      weave: "demo print",
    }),
    product("placeholder", {
      fabric: "placeholder silk",
      regionalHandloom: "sample region",
      weave: "placeholder weave",
    }),
  ];

  assert.deepEqual(getShopifyFabricValues(products), ["Cotton"]);
  assert.deepEqual(getShopifyClassificationValues(products, "regionalHandloom"), ["Narayanpet"]);
  assert.deepEqual(getShopifyClassificationValues(products, "weave"), ["Ikkat"]);
  assert.deepEqual(getCustomerNavigationValues(["Telangana", "test region", "demo colour"]), ["Telangana"]);
});

test("homepage regional handloom row lists handloom classifications, not Shopify collection names", () => {
  const products = [
    product("narayanpet", { regionalHandloom: "Narayanpet" }),
    product("gadwal", { regionalHandloom: "Gadwal" }),
    {
      ...product("grouped"),
      collections: [{ id: "collection-1", handle: "cotton", title: "Cotton" }],
    },
    product("test", { regionalHandloom: "test tradition" }),
  ];

  assert.deepEqual(getShopifyRegionalHandloomCategories(products), ["Gadwal", "Narayanpet"]);
});

test("site content API accepts the Shop by Collection thumbnail placement", () => {
  const result = CreateSiteContentBody.safeParse({
    kind: "home_image",
    placement: "regional_handloom_tile",
    title: "Narayanpet",
    eyebrow: null,
    body: null,
    imageUrl: "/api/site-content/media/00000000-0000-4000-8000-000000000001",
    mediaUrl: null,
    altText: null,
    ctaLabel: null,
    ctaUrl: null,
    linkedProductId: null,
    sortOrder: 0,
    published: false,
    approved: false,
  });

  assert.equal(result.success, true);
});

test("regional handlooms are derived by selected fabric and deduplicated", () => {
  const products = [
    product("cotton-1", { fabric: "Cotton", regionalHandloom: "Narayanpet" }),
    product("cotton-2", { fabric: "Cotton", regionalHandloom: '["Narayanpet","Gadwal"]' }),
    product("silk", { fabric: "Silk", regionalHandloom: "Narayanpet" }),
    product("other", { fabric: "Linen", regionalHandloom: "Kota Cottons" }),
    product("test", { fabric: "Cotton", regionalHandloom: "test tradition" }),
  ];

  assert.deepEqual(getRegionalHandloomOptionsForFabric(products, "Cotton"), [
    "Gadwal",
    "Narayanpet",
  ]);
  assert.deepEqual(getRegionalHandloomOptionsForFabric(products, "Silk"), ["Narayanpet"]);
  assert.deepEqual(getRegionalHandloomOptionsForFabric(products, "Others"), ["Kota Cottons"]);
});

test("weave choices require published products, use the requested order, and hide test values", () => {
  const products = [
    product("jamdani", { weave: "Jamdani" }),
    product("ikat", { weave: "Ikat" }),
    product("ajrakh", { weave: "Ajrakh" }),
    product("test", { weave: "test print" }),
    product("unused", { weave: "Kanchipuram" }),
  ];

  assert.deepEqual(getMegaMenuWeaveOptions(products), ["Ajrakh", "Ikkat", "Jamdani"]);
});

test("combined fabric and regional filters use AND while weave browsing stays independent", () => {
  const cottonNarayanpet = product("cotton-narayanpet", {
    fabric: "Cotton",
    regionalHandloom: "Narayanpet",
  });
  const silkNarayanpet = product("silk-narayanpet", {
    fabric: "Silk",
    regionalHandloom: "Narayanpet",
  });
  const linenKota = product("linen-kota", {
    fabric: "Linen",
    regionalHandloom: "Kota Cottons",
  });
  const cottonIkat = product("cotton-ikat", { fabric: "Cotton", weave: "Ikat" });

  const cottonNarayanpetSelection = { fabrics: ["Cotton"], regionalHandlooms: ["Narayanpet"] };
  assert.equal(matchesShopifyNavigationSelection(cottonNarayanpet, cottonNarayanpetSelection), true);
  assert.equal(matchesShopifyNavigationSelection(silkNarayanpet, cottonNarayanpetSelection), false);
  assert.equal(matchesShopifyNavigationSelection(linenKota, {
    fabrics: ["Others"],
    regionalHandlooms: ["Kota Cottons"],
  }), true);
  assert.equal(matchesShopifyNavigationSelection(cottonIkat, { weaves: ["Ikkat"] }), true);
  assert.equal(matchesShopifyNavigationSelection(cottonIkat, {
    fabrics: ["Silk"],
    weaves: ["Ikkat"],
  }), false);
});

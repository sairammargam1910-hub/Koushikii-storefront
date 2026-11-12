import type { ShopifyProduct } from "@workspace/api-client-react";
import { normalizeWeave } from "./_shared/catalog-filter";

export const REGIONAL_HANDLOOMS = [
  "Mangalagiri Cotton",
  "Narayanpet",
  "Venkatagiri",
  "Gadwal",
  "Kasaragod",
  "Paithani",
  "Kala Cotton",
  "Patola",
  "Moirang Phee",
  "Kanchi Cottons",
  "Chettinad Cottons",
  "Banaras Cottons",
  "Kota Cottons",
];

export const WEAVE_PRINTS = [
  "Jamdani",
  "Ikkat",
  "Bandhani",
  "Bagru",
  "Ajrakh",
];

const STANDARD_FABRIC_CATEGORIES = ["Cotton", "Silk", "Cotton-Silk"] as const;

export const cottonWeaves = REGIONAL_HANDLOOMS;

function normalizedTag(value: string) {
  return value.trim().toLowerCase().replace(/[\s_]+/g, "-");
}

function normalizedAttributeKey(value: string) {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, "");
}

export function parseClassificationValues(value: string | null | undefined): string[] {
  const raw = value?.trim();
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return [...new Set(parsed.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean))];
    }
  } catch {
    // Existing metafields are plain single values; retain them as-is.
  }
  return [raw];
}

export function serializeClassificationValues(values: string[]) {
  const normalized = [...new Set(values.map((value) => value.trim()).filter(Boolean))];
  return normalized.length > 1 ? JSON.stringify(normalized) : normalized[0] ?? "";
}

export function canonicalFabric(value: string): string {
  const fabrics: Record<string, string> = {
    cotton: "Cotton",
    "pure-cotton": "Cotton",
    silk: "Silk",
    "pure-silk": "Silk",
    "cotton-silk": "Cotton-Silk",
    "silk-cotton": "Cotton-Silk",
  };
  return fabrics[normalizedTag(value)] ?? value.trim();
}

export function getShopifyFabricValues(products: ShopifyProduct[]): string[] {
  const values = new Map<string, string>();
  for (const product of products) {
    for (const value of getShopifyAttributeValues(product, "fabric")) {
      const canonical = canonicalFabric(value);
      const key = normalizedTag(canonical);
      if (key && !values.has(key)) values.set(key, canonical);
    }
  }
  return [...values.values()].sort((a, b) => a.localeCompare(b));
}

export function getFabricCategoryOptions(values: string[]): string[] {
  const observed = new Map<string, string>();
  for (const value of values) {
    const canonical = canonicalFabric(value);
    const key = normalizedTag(canonical);
    if (key && !observed.has(key)) observed.set(key, canonical);
  }

  const standardKeys = new Set(STANDARD_FABRIC_CATEGORIES.map(normalizedTag));
  const custom = [...observed.entries()]
    .filter(([key]) => key !== "others" && !standardKeys.has(key))
    .map(([, value]) => value)
    .sort((a, b) => a.localeCompare(b));

  return [
    ...STANDARD_FABRIC_CATEGORIES,
    ...custom,
    ...(observed.has("others") ? ["Others"] : []),
  ];
}

const weaveTags = new Map(
  [
    ...REGIONAL_HANDLOOMS,
    ...WEAVE_PRINTS,
    "Ikat",
    "Jamdani",
    "Kanchipuram",
    "Kanchipooram",
    "Banarasi",
    "Banaras",
    "Pashmina",
    "Moirang Phee",
    "Patola",
    "Paithani",
    "Gadwal",
    "Venkatagiri",
    "Narayanpet",
    "Mangalagiri",
    "Chettinad",
    "Kota",
  ].map((value) => [normalizedTag(value), normalizeWeave(value)] as const),
);

function canonicalWeave(value: string): string | undefined {
  return weaveTags.get(normalizedTag(value));
}

function tagValues(product: ShopifyProduct, key: string) {
  const normalizedKey = key.toLowerCase();
  return product.tags.flatMap((tag) => {
    const separator = tag.indexOf(":");
    if (separator < 0 || normalizedAttributeKey(tag.slice(0, separator)) !== normalizedAttributeKey(normalizedKey)) return [];
    return parseClassificationValues(tag.slice(separator + 1));
  });
}

export function getShopifyTagValue(product: ShopifyProduct, key: string) {
  const normalizedKey = key.toLowerCase();
  const tagged = tagValues(product, normalizedKey);
  if (tagged.length) {
    const value = tagged[0];
    return normalizedKey === "weave" ? normalizeWeave(value) : normalizedKey === "fabric" ? canonicalFabric(value) : value;
  }
  if (normalizedKey === "fabric") {
    return product.tags
      .flatMap((value) => parseClassificationValues(value))
      .map(canonicalFabric)
      .find((value) => ["Cotton", "Silk", "Cotton-Silk"].includes(value)) ?? "";
  }
  if (normalizedKey === "weave") {
    return product.tags
      .map((value) => canonicalWeave(value))
      .find((value): value is string => Boolean(value)) ?? "";
  }
  return "";
}

export function getShopifyAttribute(product: ShopifyProduct, key: string) {
  return getShopifyAttributeValues(product, key)[0] ?? "";
}

export function getShopifyAttributeValues(product: ShopifyProduct, key: string) {
  const normalizedKey = key.toLowerCase().replace(/[_\s-]/g, "");
  const attributeName =
    normalizedKey === "fabric" ? "fabric" :
      normalizedKey === "regionalhandloom" || normalizedKey === "tradition" ? "regionalHandloom" :
        normalizedKey === "weave" || normalizedKey === "crafttechnique" ? "craftTechnique" :
          normalizedKey === "region" || normalizedKey === "regionoforigin" ? "region" :
            normalizedKey === "colour" || normalizedKey === "color" ? "colour" : null;
  const raw = attributeName ? product.attributes?.[attributeName] : null;
  let values = parseClassificationValues(raw);
  if (!values.length) {
    const tagKey = normalizedKey === "regionalhandloom" || normalizedKey === "tradition"
      ? "regionalhandloom"
      : normalizedKey === "weave" || normalizedKey === "crafttechnique"
        ? "weave"
        : normalizedKey === "regionoforigin"
          ? "region"
          : normalizedKey;
    values = tagValues(product, tagKey);
    if (!values.length && normalizedKey === "colour") values = tagValues(product, "color");
    if (!values.length && normalizedKey === "fabric") {
      values = product.tags
        .flatMap((tag) => parseClassificationValues(tag))
        .filter((value) => ["Cotton", "Silk", "Cotton-Silk"].includes(canonicalFabric(value)));
    }
    if (!values.length && (normalizedKey === "weave" || normalizedKey === "crafttechnique")) {
      values = product.tags.flatMap((tag) => parseClassificationValues(tag)).filter((value) => canonicalWeave(value));
    }
  }
  const normalize = normalizedKey === "fabric"
    ? canonicalFabric
    : normalizedKey === "weave" || normalizedKey === "crafttechnique"
      ? normalizeWeave
      : (value: string) => value.trim();
  return [...new Set(values.map(normalize).filter(Boolean))];
}

export function getAvailableShopifyCollections(products: ShopifyProduct[]) {
  const collections = new Map<string, { id: string; handle: string; title: string }>();
  for (const product of products) {
    for (const collection of product.collections ?? []) {
      if (!collection.handle || collection.handle === "frontpage") continue;
      collections.set(collection.handle, collection);
    }
  }
  return [...collections.values()].sort((a, b) => a.title.localeCompare(b.title));
}

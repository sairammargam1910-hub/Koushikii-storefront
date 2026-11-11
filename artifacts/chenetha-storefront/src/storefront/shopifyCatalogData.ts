import type { ShopifyProduct } from "@workspace/api-client-react";
import { normalizeWeave } from "./_shared/catalog-filter";

export const cottonWeaves = [
  "Mangalagiri Cotton",
  "Narayanpet",
  "Venkatagiri",
  "Gadwal",
  "Kasaragod",
  "Paithani",
  "Kala Cotton",
  "Patola",
  "Ikat",
  "Moirang Phee",
  "Kanchi Cottons",
  "Chettinad Cottons",
  "Banaras Cottons",
  "Kota Cottons",
];

function normalizedTag(value: string) {
  return value.trim().toLowerCase().replace(/[\s_]+/g, "-");
}

function canonicalFabric(value: string): string | undefined {
  const fabrics: Record<string, string> = {
    cotton: "Cotton",
    silk: "Silk",
    "cotton-silk": "Cotton-Silk",
    "silk-cotton": "Cotton-Silk",
    "other-blend": "Other blends",
    "other-blends": "Other blends",
  };
  return fabrics[normalizedTag(value)];
}

const weaveTags = new Map(
  [
    ...cottonWeaves,
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

export function getShopifyTagValue(product: ShopifyProduct, key: string) {
  const normalizedKey = key.toLowerCase();
  const prefix = `${normalizedKey}:`;
  const tag = product.tags.find((value) => value.toLowerCase().startsWith(prefix));
  if (tag) {
    const value = tag.slice(prefix.length).trim();
    return normalizedKey === "weave" ? normalizeWeave(value) : canonicalFabric(value) ?? value;
  }

  if (normalizedKey === "fabric") {
    return product.tags
      .map((value) => canonicalFabric(value))
      .find((value): value is string => Boolean(value)) ?? "";
  }
  if (normalizedKey === "weave") {
    return product.tags
      .map((value) => canonicalWeave(value))
      .find((value): value is string => Boolean(value)) ?? "";
  }
  return "";
}

export function getShopifyAttribute(product: ShopifyProduct, key: string) {
  const normalizedKey = key.toLowerCase();
  const structuredValue =
    normalizedKey === "fabric" ? product.attributes?.fabric :
      normalizedKey === "weave" || normalizedKey === "crafttechnique" || normalizedKey === "craft_technique"
        ? product.attributes?.craftTechnique :
          normalizedKey === "region" ? product.attributes?.region :
            normalizedKey === "colour" || normalizedKey === "color"
              ? product.attributes?.colour
              : null;
  if (structuredValue?.trim()) return structuredValue.trim();
  if (normalizedKey === "colour" || normalizedKey === "color") {
    return getShopifyTagValue(product, "colour") || getShopifyTagValue(product, "color");
  }
  if (normalizedKey === "weave" || normalizedKey === "crafttechnique" || normalizedKey === "craft_technique") {
    return getShopifyTagValue(product, "weave");
  }
  return getShopifyTagValue(product, normalizedKey);
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

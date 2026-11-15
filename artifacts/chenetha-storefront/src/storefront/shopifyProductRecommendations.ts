import type { ShopifyProduct } from "@workspace/api-client-react";
import { getShopifyAttributeValues } from "./shopifyCatalogData.ts";

const MATCH_TIERS = {
  regionalHandloom: 5,
  weave: 4,
  fabric: 3,
  productType: 2,
  collection: 1,
} as const;

function normalized(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function sharedValues(left: string[], right: string[]) {
  const rightValues = new Set(right.map(normalized).filter(Boolean));
  return left.map(normalized).filter((value) => value && rightValues.has(value));
}

function hasPurchasableVariant(product: ShopifyProduct) {
  return product.variants.some((variant) =>
    variant.availableForSale &&
    variant.id.startsWith("gid://shopify/ProductVariant/") &&
    Number.isFinite(Number(variant.price)) &&
    Number(variant.price) > 0,
  );
}

function isDemoProduct(product: ShopifyProduct) {
  return /\b(demo|sample|template)\b/i.test(
    [product.title, product.description, ...product.tags].join(" "),
  ) || /\[[^\]]+\]/.test(`${product.title} ${product.description}`);
}

export function getShopifyProductRecommendations(
  product: ShopifyProduct,
  products: ShopifyProduct[],
  limit = 4,
): ShopifyProduct[] {
  const currentCollections = (product.collections ?? []).map((collection) =>
    collection.handle || collection.title,
  );
  const currentType = normalized(product.productType);
  const seenIds = new Set<string>([product.id]);
  const seenHandles = new Set<string>([product.handle]);
  const ranked: Array<{
    product: ShopifyProduct;
    tier: number;
    matchCount: number;
    collectionCount: number;
    originalIndex: number;
  }> = [];

  products.forEach((candidate, originalIndex) => {
    if (
      !candidate.id ||
      seenIds.has(candidate.id) ||
      seenHandles.has(candidate.handle) ||
      isDemoProduct(candidate) ||
      !candidate.images?.some((image) => Boolean(image.url)) ||
      !hasPurchasableVariant(candidate)
    ) return;
    seenIds.add(candidate.id);
    seenHandles.add(candidate.handle);

    const sameRegionalHandloom = sharedValues(
      getShopifyAttributeValues(product, "regionalHandloom"),
      getShopifyAttributeValues(candidate, "regionalHandloom"),
    );
    const sameWeave = sharedValues(
      getShopifyAttributeValues(product, "weave"),
      getShopifyAttributeValues(candidate, "weave"),
    );
    const sameFabric = sharedValues(
      getShopifyAttributeValues(product, "fabric"),
      getShopifyAttributeValues(candidate, "fabric"),
    );
    const sameProductType = currentType && currentType === normalized(candidate.productType);
    const sameCollections = sharedValues(
      currentCollections,
      (candidate.collections ?? []).map((collection) => collection.handle || collection.title),
    );

    const tier = sameRegionalHandloom.length
      ? MATCH_TIERS.regionalHandloom
      : sameWeave.length
        ? MATCH_TIERS.weave
        : sameFabric.length
          ? MATCH_TIERS.fabric
          : sameProductType
            ? MATCH_TIERS.productType
            : sameCollections.length
              ? MATCH_TIERS.collection
              : 0;
    if (!tier) return;

    const matchCount = tier === MATCH_TIERS.regionalHandloom
      ? sameRegionalHandloom.length
      : tier === MATCH_TIERS.weave
        ? sameWeave.length
        : tier === MATCH_TIERS.fabric
          ? sameFabric.length
          : tier === MATCH_TIERS.collection
            ? sameCollections.length
            : 1;
    ranked.push({
      product: candidate,
      tier,
      matchCount,
      collectionCount: sameCollections.length,
      originalIndex,
    });
  });

  const safeLimit = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 4;
  return ranked
    .sort((left, right) =>
      right.tier - left.tier ||
      right.matchCount - left.matchCount ||
      right.collectionCount - left.collectionCount ||
      left.originalIndex - right.originalIndex,
    )
    .slice(0, safeLimit)
    .map((entry) => entry.product);
}

export function getShopifyProductSummary(description: string, maxLength = 200) {
  const text = description.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  const firstSentence = text.match(/^.*?[.!?](?=\s|$)/)?.[0];
  const summary = firstSentence || text;
  if (summary.length <= maxLength) return summary;
  return `${summary.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…`;
}

export function isSareeProductType(productType: string) {
  return /\b(sarees?|saris?)\b/i.test(productType.trim());
}

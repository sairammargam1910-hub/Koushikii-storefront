import { Router, raw, type IRouter, type Request, type Response, type RequestHandler } from "express";
import { randomUUID } from "node:crypto";
import {
  ArchiveShopifyAdminProductResponse,
  PermanentlyDeleteShopifyAdminProductResponse,
  CreateShopifyAdminDiscountBody,
  CreateShopifyAdminDiscountResponse,
  CreateShopifyAdminProductBody,
  CreateShopifyAdminProductResponse,
  GetShopifyAdminCollectionsResponse,
  DeactivateShopifyAdminDiscountResponse,
  GetShopifyAdminDiscountsResponse,
  GetShopifyAdminInventoryResponse,
  GetShopifyAdminProductsResponse,
  GetShopifyAdminProductMediaResponse,
  UpdateShopifyAdminProductBody,
  UpdateShopifyAdminProductResponse,
  UploadShopifyAdminImageResponse,
  UpdateShopifyAdminVariantBody,
  UpdateShopifyAdminVariantResponse,
  GetShopifyAdminProductResponse,
  UpdateShopifyAdminProductMediaBody,
  UpdateShopifyAdminProductMediaResponse,
  UpdateShopifyAdminProductMediaAltBody,
  ReorderShopifyAdminProductMediaBody,
  CreateShopifyAdminVariantBody,
  CreateShopifyAdminVariantResponse,
  DeleteShopifyAdminVariantParams,
  DeleteShopifyAdminVariantResponse,
} from "@workspace/api-zod";
import { requireMerchantAdmin } from "../middlewares/merchantAdminAuth";
import { invalidateShopifyCatalog } from "./shopify";
import {
  assertNoUserErrors,
  escapeProductDescription,
  isShopifyDiscountId,
  isShopifyProductId,
  normalizeProductDescription,
  ShopifyAdminError,
  ShopifyInputError,
  shopifyAdminRequest,
  validatePublicImageUrl,
} from "../lib/shopifyAdminClient";
import { MAX_IMAGE_BYTES, stageProductImage } from "../lib/shopifyImageUpload";

const router: IRouter = Router();

type AdminVariant = {
  id: string;
  title: string;
  price: string;
  inventoryQuantity: number | null;
  inventoryPolicy: "DENY" | "CONTINUE";
  selectedOptions: Array<{ name: string; value: string }>;
  inventoryItem: {
    id: string;
    tracked: boolean;
    measurement: {
      weight: { value: number; unit: "GRAMS" | "KILOGRAMS" | "OUNCES" | "POUNDS" } | null;
    } | null;
    inventoryLevels: {
      nodes: Array<{ location: { id: string; name: string; isActive: boolean }; quantities: Array<{ name: string; quantity: number }> }>;
      pageInfo: { hasNextPage: boolean; endCursor: string };
    };
  } | null;
};

type AdminProductMetafield = { key: string; value: string | null };

type AdminProduct = {
  id: string;
  title: string;
  handle: string;
  description: string;
  productType: string;
  status: "ACTIVE" | "DRAFT" | "ARCHIVED";
  tags: string[];
  fabricMetafield: AdminProductMetafield | null;
  regionalHandloomMetafield: AdminProductMetafield | null;
  craftTechniqueMetafield: AdminProductMetafield | null;
  regionMetafield: AdminProductMetafield | null;
  colourMetafield: AdminProductMetafield | null;
  collections: {
    nodes: Array<{
      id: string;
      title: string;
      handle: string;
      ruleSet: { appliedDisjunctively: boolean } | null;
    }>;
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  };
  featuredMedia: { image: { url: string; altText: string | null } | null } | null;
  options: Array<{ id: string; name: string; optionValues: Array<{ id: string; name: string }> }>;
  variants: { nodes: AdminVariant[]; pageInfo: { hasNextPage: boolean; endCursor: string } };
};

type AdminCollection = {
  id: string;
  title: string;
  handle: string;
  ruleSet: { appliedDisjunctively: boolean } | null;
};

type AdminCollectionsPage = {
  collections: {
    nodes: AdminCollection[];
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  };
};

type ProductQueryResult = {
  shop: { currencyCode: string };
  products: { nodes: AdminProduct[] };
};

type SingleProductQueryResult = {
  shop: { currencyCode: string };
  product: AdminProduct | null;
};

type AdminInventoryVariant = {
  id: string;
  title: string;
  inventoryPolicy: "DENY" | "CONTINUE";
  product: { id: string; title: string; status: "ACTIVE" | "DRAFT" | "ARCHIVED" };
  inventoryItem: {
    id: string;
    tracked: boolean;
    inventoryLevels: {
      nodes: Array<{ location: { id: string; name: string; isActive: boolean }; quantities: Array<{ name: string; quantity: number }> }>;
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
    };
  } | null;
};

type AdminInventoryPage = {
  productVariants: {
    nodes: AdminInventoryVariant[];
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  };
};

const ADMIN_INVENTORY_QUERY = `#graphql
  query MerchantInventoryWatch($after: String) {
    productVariants(first: 25, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        title
        inventoryPolicy
        product { id title status }
        inventoryItem {
          id
          tracked
          inventoryLevels(first: 20) {
            pageInfo { hasNextPage endCursor }
            nodes { location { id name isActive } quantities(names: ["available"]) { name quantity } }
          }
        }
      }
    }
  }
`;

const ADMIN_INVENTORY_LEVEL_PAGE_QUERY = `#graphql
  query MerchantInventoryLocationPage($id: ID!, $after: String!) {
    inventoryItem(id: $id) {
      inventoryLevels(first: 100, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes { location { id name isActive } quantities(names: ["available"]) { name quantity } }
      }
    }
  }
`;

const ADMIN_PRODUCT_FIELDS = `#graphql
  id
  title
  handle
  description
  productType
  status
  tags
  fabricMetafield: metafield(namespace: "chenetha", key: "fabric") { key value }
  regionalHandloomMetafield: metafield(namespace: "chenetha", key: "regional_handloom") { key value }
  craftTechniqueMetafield: metafield(namespace: "chenetha", key: "craft_technique") { key value }
  regionMetafield: metafield(namespace: "chenetha", key: "region") { key value }
  colourMetafield: metafield(namespace: "chenetha", key: "colour") { key value }
  collections(first: 10) {
    nodes { id title handle ruleSet { appliedDisjunctively } }
    pageInfo { hasNextPage endCursor }
  }
  featuredMedia {
    ... on MediaImage {
      image { url altText }
    }
  }
  options {
    id
    name
    optionValues { id name }
  }
  variants(first: 2) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id
      title
      price
      inventoryQuantity
      inventoryPolicy
      selectedOptions { name value }
      inventoryItem {
        id
        tracked
        measurement { weight { value unit } }
        inventoryLevels(first: 1) {
          pageInfo { hasNextPage endCursor }
          nodes { location { id name isActive } quantities(names: ["available"]) { name quantity } }
        }
      }
    }
  }
`;

const ADMIN_PRODUCT_DETAIL_FIELDS = ADMIN_PRODUCT_FIELDS.replace(
  "collections(first: 10)",
  "collections(first: 100)",
);

const ADMIN_PRODUCTS_QUERY = `#graphql
  query MerchantProducts {
    shop { currencyCode }
    products(
      first: 100
      query: "status:active OR status:draft OR status:archived"
      sortKey: UPDATED_AT
      reverse: true
    ) {
      nodes { ${ADMIN_PRODUCT_FIELDS} }
    }
  }
`;

const ADMIN_PRODUCT_QUERY = `#graphql
  query MerchantProduct($id: ID!) {
    shop { currencyCode }
    product(id: $id) { ${ADMIN_PRODUCT_DETAIL_FIELDS} }
  }
`;

const ADMIN_PRODUCT_COLLECTION_PAGE_QUERY = `#graphql
  query MerchantProductCollections($id: ID!, $after: String!) {
    product(id: $id) {
      collections(first: 100, after: $after) {
        nodes { id title handle ruleSet { appliedDisjunctively } }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
`;

const ADMIN_COLLECTIONS_QUERY = `#graphql
  query MerchantCollections($after: String) {
    collections(first: 100, after: $after, sortKey: TITLE) {
      nodes { id title handle ruleSet { appliedDisjunctively } }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

const ADMIN_COLLECTION_CREATE = `#graphql
  mutation MerchantCollectionCreate($input: CollectionInput!) {
    collectionCreate(input: $input) {
      collection { id title handle ruleSet { appliedDisjunctively } }
      userErrors { field message }
    }
  }
`;

const ADMIN_PRODUCT_ATTRIBUTE_DEFINITIONS_QUERY = `#graphql
  query ChenethaProductAttributeDefinitions {
    metafieldDefinitions(ownerType: PRODUCT, namespace: "chenetha", first: 20) {
      nodes { id namespace key type { name } access { storefront } }
    }
  }
`;

const ADMIN_METAFIELD_DEFINITION_CREATE = `#graphql
  mutation ChenethaMetafieldDefinitionCreate($definition: MetafieldDefinitionInput!) {
    metafieldDefinitionCreate(definition: $definition) {
      createdDefinition { id namespace key type { name } access { storefront } }
      userErrors { field message }
    }
  }
`;

const ADMIN_METAFIELD_DEFINITION_UPDATE = `#graphql
  mutation ChenethaMetafieldDefinitionUpdate($definition: MetafieldDefinitionUpdateInput!) {
    metafieldDefinitionUpdate(definition: $definition) {
      updatedDefinition { id namespace key type { name } access { storefront } }
      userErrors { field message }
    }
  }
`;

const ADMIN_METAFIELDS_SET = `#graphql
  mutation ChenethaProductMetafieldsSet($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields { namespace key value }
      userErrors { field message }
    }
  }
`;

const ADMIN_METAFIELDS_DELETE = `#graphql
  mutation ChenethaProductMetafieldsDelete($metafields: [MetafieldIdentifierInput!]!) {
    metafieldsDelete(metafields: $metafields) {
      deletedMetafields { ownerId namespace key }
      userErrors { field message }
    }
  }
`;

const CHENETHA_PRODUCT_ATTRIBUTES = [
  { key: "fabric", name: "Fabric" },
  { key: "regional_handloom", name: "Regional Handloom / Tradition" },
  { key: "craft_technique", name: "Craft / Technique" },
  { key: "region", name: "Region" },
  { key: "colour", name: "Colour" },
] as const;

let productAttributeDefinitionsReady: Promise<void> | undefined;

const ADMIN_PRODUCT_MEDIA_QUERY = `#graphql
  query MerchantProductMedia($id: ID!, $after: String) {
    product(id: $id) {
      featuredMedia { id }
      media(first: 100, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          alt
          mediaContentType
          status
          mediaErrors { code details message }
          ... on MediaImage { image { url altText } }
        }
      }
    }
  }
`;

const ADMIN_PRODUCT_CREATE_MEDIA = `#graphql
  mutation MerchantProductCreateMedia($productId: ID!, $media: [CreateMediaInput!]!) {
    productCreateMedia(productId: $productId, media: $media) {
      media { id status }
      mediaUserErrors { field message }
    }
  }
`;

const ADMIN_PRODUCT_DELETE_MEDIA = `#graphql
  mutation MerchantProductDeleteMedia($productId: ID!, $mediaIds: [ID!]!) {
    productDeleteMedia(productId: $productId, mediaIds: $mediaIds) {
      deletedMediaIds
      mediaUserErrors { field message }
    }
  }
`;

const ADMIN_PRODUCT_UPDATE_MEDIA_ALT = `#graphql
  mutation MerchantProductUpdateMediaAlt($productId: ID!, $media: [UpdateMediaInput!]!) {
    productUpdateMedia(productId: $productId, media: $media) {
      media { id alt }
      mediaUserErrors { field message }
    }
  }
`;

const ADMIN_PRODUCT_REORDER_MEDIA = `#graphql
  mutation MerchantProductReorderMedia($id: ID!, $moves: [MoveInput!]!) {
    productReorderMedia(id: $id, moves: $moves) {
      job { id }
      mediaUserErrors { field message }
    }
  }
`;

const ADMIN_SHOPIFY_JOB_QUERY = `#graphql
  query MerchantGalleryReorderJob($id: ID!) {
    job(id: $id) { done }
  }
`;

const ADMIN_PRODUCT_CREATE = `#graphql
  mutation MerchantProductCreate(
    $product: ProductCreateInput!
    $media: [CreateMediaInput!]
  ) {
    productCreate(product: $product, media: $media) {
      product { id }
      userErrors { field message }
    }
  }
`;

const ADMIN_PRODUCT_UPDATE = `#graphql
  mutation MerchantProductUpdate(
    $product: ProductUpdateInput!
    $media: [CreateMediaInput!]
  ) {
    productUpdate(product: $product, media: $media) {
      product { id }
      userErrors { field message }
    }
  }
`;

const ADMIN_PRODUCT_DELETE = `#graphql
  mutation MerchantProductDelete($input: ProductDeleteInput!, $synchronous: Boolean!) {
    productDelete(input: $input, synchronous: $synchronous) {
      deletedProductId
      userErrors { field message }
    }
  }
`;

const ADMIN_PRODUCT_VARIANT_UPDATE = `#graphql
  mutation MerchantProductVariantUpdate(
    $productId: ID!
    $variants: [ProductVariantsBulkInput!]!
  ) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants) {
      userErrors { field message }
    }
  }
`;

const ADMIN_PRODUCT_OPTION_UPDATE = `#graphql
  mutation MerchantProductOptionUpdate(
    $productId: ID!
    $option: OptionUpdateInput!
    $optionValuesToAdd: [OptionValueCreateInput!]
    $variantStrategy: ProductOptionUpdateVariantStrategy
  ) {
    productOptionUpdate(
      productId: $productId
      option: $option
      optionValuesToAdd: $optionValuesToAdd
      variantStrategy: $variantStrategy
    ) {
      productOption { id optionValues { id name } }
      userErrors { field message }
    }
  }
`;

const ADMIN_PRODUCT_VARIANT_CREATE = `#graphql
  mutation MerchantProductVariantCreate(
    $productId: ID!
    $variants: [ProductVariantsBulkInput!]!
    $strategy: ProductVariantsBulkCreateStrategy
  ) {
    productVariantsBulkCreate(productId: $productId, variants: $variants, strategy: $strategy) {
      productVariants { id }
      userErrors { field message }
    }
  }
`;

const ADMIN_PRODUCT_VARIANT_DELETE = `#graphql
  mutation MerchantProductVariantDelete($productId: ID!, $variantsIds: [ID!]!) {
    productVariantsBulkDelete(productId: $productId, variantsIds: $variantsIds) {
      product { id }
      userErrors { field message }
    }
  }
`;

const INVENTORY_ITEM_UPDATE = `#graphql
  mutation MerchantInventoryItemUpdate($id: ID!, $input: InventoryItemInput!) {
    inventoryItemUpdate(id: $id, input: $input) {
      userErrors { field message }
    }
  }
`;

const INVENTORY_LOCATIONS_QUERY = `#graphql
  query MerchantInventoryLocations {
    locations(first: 20) { nodes { id name } }
  }
`;

const INVENTORY_ACTIVATE = `#graphql
  mutation MerchantInventoryActivate($inventoryItemId: ID!, $locationId: ID!) {
    inventoryActivate(inventoryItemId: $inventoryItemId, locationId: $locationId) {
      userErrors { field message }
    }
  }
`;

const INVENTORY_SET_QUANTITY = `#graphql
  mutation MerchantInventorySetQuantity($input: InventorySetQuantitiesInput!, $idempotencyKey: String!) {
    inventorySetQuantities(input: $input) @idempotent(key: $idempotencyKey) {
      userErrors { field message }
    }
  }
`;

const ADMIN_PUBLICATIONS_QUERY = `#graphql
  query MerchantStorefrontPublication {
    publications(first: 50) { nodes { id name } }
  }
`;

const ADMIN_PUBLISH_PRODUCT = `#graphql
  mutation MerchantPublishable($publishableId: ID!, $publicationId: ID!) {
    publishablePublish(
      id: $publishableId
      input: [{ publicationId: $publicationId }]
    ) {
      userErrors { field message }
    }
  }
`;

const ADMIN_DISCOUNTS_QUERY = `#graphql
  query MerchantDiscounts {
    discountNodes(first: 100) {
      nodes {
        id
        discount {
          ... on DiscountCodeBasic {
            title
            status
            startsAt
            endsAt
            codes(first: 1) { nodes { code } }
            customerGets {
              value {
                ... on DiscountPercentage { percentage }
              }
            }
          }
        }
      }
    }
  }
`;

const ADMIN_DISCOUNT_CREATE = `#graphql
  mutation MerchantDiscountCreate($basicCodeDiscount: DiscountCodeBasicInput!) {
    discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
      codeDiscountNode {
        id
        codeDiscount {
          ... on DiscountCodeBasic {
            title
            status
            startsAt
            endsAt
            codes(first: 1) { nodes { code } }
            customerGets {
              value {
                ... on DiscountPercentage { percentage }
              }
            }
          }
        }
      }
      userErrors { field message }
    }
  }
`;

const ADMIN_DISCOUNT_DEACTIVATE = `#graphql
  mutation MerchantDiscountDeactivate($id: ID!) {
    discountCodeDeactivate(id: $id) {
      codeDiscountNode { id }
      userErrors { field message }
    }
  }
`;

type ShopifyUserErrors = Array<{ field?: string[] | null; message: string }>;

class ShopifyNotFoundError extends Error {}
class ShopifyStockConflictError extends Error {}

type ShopifyProductMediaNode = {
  id: string;
  alt: string | null;
  mediaContentType: "IMAGE" | "VIDEO" | "EXTERNAL_VIDEO" | "MODEL_3D";
  status: "UPLOADED" | "PROCESSING" | "READY" | "FAILED";
  mediaErrors: Array<{ code: string | null; details: string | null; message: string | null }>;
  image?: { url: string; altText: string | null } | null;
};

async function fetchProductMedia(productId: string) {
  const media: ShopifyProductMediaNode[] = [];
  let after: string | null = null;
  let hasNextPage = true;
  let featuredMediaId: string | null = null;
  while (hasNextPage) {
    type ProductMediaPage = {
      product: {
        featuredMedia: { id: string } | null;
        media: {
          nodes: ShopifyProductMediaNode[];
          pageInfo: { hasNextPage: boolean; endCursor: string | null };
        };
      } | null;
    };
    const result: ProductMediaPage = await shopifyAdminRequest<ProductMediaPage>(
      ADMIN_PRODUCT_MEDIA_QUERY,
      { id: productId, after },
    );
    if (!result.product) throw new ShopifyNotFoundError("Product not found.");
    featuredMediaId = result.product.featuredMedia?.id ?? null;
    media.push(...result.product.media.nodes);
    hasNextPage = result.product.media.pageInfo.hasNextPage;
    after = result.product.media.pageInfo.endCursor;
    if (hasNextPage && !after) throw new ShopifyAdminError("Shopify did not return the next product media cursor.");
  }
  return GetShopifyAdminProductMediaResponse.parse({
    featuredMediaId,
    replacementStatus: null,
    media: media.map((entry) => ({
      id: entry.id,
      mediaContentType: entry.mediaContentType,
      status: entry.status,
      alt: entry.alt ?? null,
      imageUrl: entry.image?.url ?? null,
      errors: entry.mediaErrors.map((error) => ({
        code: error.code ?? null,
        message: error.message ?? "Shopify reported a media processing error.",
        details: error.details ?? null,
      })),
    })),
  });
}

async function assertProductMediaBelongsToProduct(productId: string, mediaId: string) {
  const { media } = await fetchProductMedia(productId);
  if (!media.some((entry) => entry.id === mediaId)) {
    throw new ShopifyNotFoundError("This media item does not belong to this product.");
  }
}

async function waitForShopifyJob(jobId: string) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const result = await shopifyAdminRequest<{ job: { done: boolean } | null }>(
      ADMIN_SHOPIFY_JOB_QUERY,
      { id: jobId },
    );
    if (result.job?.done) return;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new ShopifyAdminError("Shopify is still processing this gallery change. Refresh shortly.");
}

function productAttributeMetafields(product: AdminProduct): AdminProductMetafield[] {
  return [
    product.fabricMetafield,
    product.regionalHandloomMetafield,
    product.craftTechniqueMetafield,
    product.regionMetafield,
    product.colourMetafield,
  ].filter((entry): entry is AdminProductMetafield => entry != null);
}

function mapProduct(
  product: AdminProduct,
): ReturnType<typeof GetShopifyAdminProductsResponse.parse>["products"][number] {
  const attributes = productAttributeMetafields(product);
  const metafield = (key: string) =>
    attributes.find((entry) => entry.key === key)?.value ?? "";
  const manualCollections = product.collections?.nodes.filter((entry) => !entry.ruleSet) ?? [];
  return {
    id: product.id,
    title: product.title,
    handle: product.handle,
    description: normalizeProductDescription(product.description),
    productType: product.productType ?? "",
    status: product.status,
    tags: product.tags,
    fabric: metafield("fabric"),
    regionalHandloom: metafield("regional_handloom"),
    craftTechnique: metafield("craft_technique"),
    region: metafield("region"),
    colour: metafield("colour"),
    collectionIds: manualCollections.map((collection) => collection.id),
    imageUrl: product.featuredMedia?.image?.url ?? null,
    options: product.options.map((option) => ({
      id: option.id,
      name: option.name,
      values: option.optionValues,
    })),
    variants: product.variants.nodes.map((variant) => ({
      id: variant.id,
      title: variant.title,
      price: variant.price,
      inventoryQuantity: variant.inventoryQuantity ?? null,
      inventoryTracked: variant.inventoryItem?.tracked ?? false,
      inventoryPolicy: variant.inventoryPolicy,
      selectedOptions: variant.selectedOptions,
      weightKg: weightToKilograms(variant.inventoryItem?.measurement?.weight),
      inventoryLevels: variant.inventoryItem?.inventoryLevels.nodes.map((level) => ({
        locationId: level.location.id,
        locationName: level.location.name,
        active: level.location.isActive,
        available: level.quantities.find((entry) => entry.name === "available")!.quantity,
      })) ?? [],
    })),
  };
}

function weightToKilograms(
  weight: { value: number; unit: "GRAMS" | "KILOGRAMS" | "OUNCES" | "POUNDS" } | null | undefined,
): number | null {
  if (!weight || !Number.isFinite(weight.value) || weight.value <= 0) return null;
  const kilograms = ({
    GRAMS: weight.value / 1000,
    KILOGRAMS: weight.value,
    OUNCES: weight.value * 0.028349523125,
    POUNDS: weight.value * 0.45359237,
  } as const)[weight.unit];
  return Math.round(kilograms * 1000) / 1000;
}

function respondShopifyError(
  req: Request,
  res: Response,
  error: unknown,
  fallback: string,
) {
  if (error instanceof ShopifyStockConflictError) {
    res.status(409).json({ error: error.message });
    return;
  }
  if (error instanceof ShopifyInputError) {
    res.status(400).json({ error: error.message });
    return;
  }
  if (error instanceof ShopifyNotFoundError) {
    res.status(404).json({ error: error.message });
    return;
  }
  req.log.error(
    {
      error:
        error instanceof Error
          ? error.message
          : "Unknown Shopify Admin API error",
    },
    "Shopify merchant action failed",
  );
  res.status(502).json({
    error: fallback,
  });
}

async function fetchProduct(id: string): Promise<{
  product: AdminProduct;
  currencyCode: string;
}> {
  const result = await shopifyAdminRequest<SingleProductQueryResult>(
    ADMIN_PRODUCT_QUERY,
    { id },
  );
  if (!result.product) throw new ShopifyNotFoundError("Product not found.");
  const collectionCursors = new Set<string>();
  while (result.product.collections.pageInfo.hasNextPage) {
    const after = result.product.collections.pageInfo.endCursor;
    if (!after || collectionCursors.has(after)) {
      throw new ShopifyAdminError("Shopify returned an invalid product collection cursor.");
    }
    collectionCursors.add(after);
    const page = await shopifyAdminRequest<{
      product: { collections: AdminProduct["collections"] } | null;
    }>(ADMIN_PRODUCT_COLLECTION_PAGE_QUERY, { id, after });
    if (!page.product) throw new ShopifyNotFoundError("Product not found.");
    result.product.collections.nodes.push(...page.product.collections.nodes);
    result.product.collections.pageInfo = page.product.collections.pageInfo;
  }
  // Never mistake the catalog's two-variant preview for a complete product.
  const variants = result.product.variants;
  while (variants.pageInfo.hasNextPage) {
    const page = await shopifyAdminRequest<{ product: { variants: AdminProduct["variants"] } | null }>(
      `query MerchantVariantPage($id: ID!, $after: String!) {
        product(id: $id) { ${ADMIN_PRODUCT_FIELDS.replace("variants(first: 2)", "variants(first: 25, after: $after)")} }
      }`, { id, after: variants.pageInfo.endCursor },
    );
    if (!page.product) throw new ShopifyNotFoundError("Product not found.");
    variants.nodes.push(...page.product.variants.nodes);
    variants.pageInfo = page.product.variants.pageInfo;
  }
  for (const variant of variants.nodes) {
    const item = variant.inventoryItem;
    if (!item) continue;
    while (item.inventoryLevels.pageInfo.hasNextPage) {
      const page = await shopifyAdminRequest<{ inventoryItem: { inventoryLevels: NonNullable<AdminVariant["inventoryItem"]>["inventoryLevels"] } | null }>(
        `query MerchantInventoryPage($id: ID!, $after: String!) {
          inventoryItem(id: $id) { inventoryLevels(first: 100, after: $after) {
            pageInfo { hasNextPage endCursor }
            nodes { location { id name isActive } quantities(names: ["available"]) { name quantity } }
          } }
        }`, { id: item.id, after: item.inventoryLevels.pageInfo.endCursor },
      );
      if (!page.inventoryItem) throw new ShopifyInputError("Inventory changed. Reload this product.");
      item.inventoryLevels.nodes.push(...page.inventoryItem.inventoryLevels.nodes);
      item.inventoryLevels.pageInfo = page.inventoryItem.inventoryLevels.pageInfo;
    }
  }
  return { product: result.product, currencyCode: result.shop.currencyCode };
}

async function fetchShopifyCollections(): Promise<AdminCollection[]> {
  const collections: AdminCollection[] = [];
  const seenCursors = new Set<string>();
  let after: string | null = null;
  let hasNextPage = true;
  while (hasNextPage) {
    const page: AdminCollectionsPage = await shopifyAdminRequest<AdminCollectionsPage>(
      ADMIN_COLLECTIONS_QUERY,
      after ? { after } : {},
    );
    collections.push(...page.collections.nodes);
    hasNextPage = page.collections.pageInfo.hasNextPage;
    after = page.collections.pageInfo.endCursor;
    if (hasNextPage && (!after || seenCursors.has(after))) {
      throw new ShopifyAdminError("Shopify returned an invalid collection cursor.");
    }
    if (after) seenCursors.add(after);
  }
  return collections;
}

async function createProductAttributeDefinitions(): Promise<void> {
  const existing = await shopifyAdminRequest<{
    metafieldDefinitions: {
      nodes: Array<{
        id: string;
        namespace: string;
        key: string;
        type: { name: string };
        access: { storefront: string | null };
      }>;
    };
  }>(ADMIN_PRODUCT_ATTRIBUTE_DEFINITIONS_QUERY);

  for (const attribute of CHENETHA_PRODUCT_ATTRIBUTES) {
    let definition = existing.metafieldDefinitions.nodes.find(
      (entry) => entry.namespace === "chenetha" && entry.key === attribute.key,
    );
    if (definition && definition.type.name !== "single_line_text_field") {
      throw new ShopifyInputError(
        `Shopify metafield chenetha.${attribute.key} must use single-line text. Update its Shopify definition before saving product attributes.`,
      );
    }
    if (!definition) {
      const created = await shopifyAdminRequest<{
        metafieldDefinitionCreate: {
          createdDefinition: typeof definition;
          userErrors: ShopifyUserErrors;
        };
      }>(ADMIN_METAFIELD_DEFINITION_CREATE, {
        definition: {
          namespace: "chenetha",
          key: attribute.key,
          name: attribute.name,
          description: `Structured ${attribute.name.toLowerCase()} attribute used by the Chenetha storefront.`,
          ownerType: "PRODUCT",
          type: "single_line_text_field",
          access: { storefront: "PUBLIC_READ" },
        },
      });
      assertNoUserErrors(created.metafieldDefinitionCreate.userErrors);
      definition = created.metafieldDefinitionCreate.createdDefinition ?? undefined;
      if (!definition) {
        throw new ShopifyAdminError(
          `Shopify did not create the ${attribute.name.toLowerCase()} product attribute.`,
        );
      }
      existing.metafieldDefinitions.nodes.push(definition);
    } else if (definition.access.storefront !== "PUBLIC_READ") {
      const updated = await shopifyAdminRequest<{
        metafieldDefinitionUpdate: {
          updatedDefinition: typeof definition;
          userErrors: ShopifyUserErrors;
        };
      }>(ADMIN_METAFIELD_DEFINITION_UPDATE, {
        definition: {
          id: definition.id,
          access: { storefront: "PUBLIC_READ" },
        },
      });
      assertNoUserErrors(updated.metafieldDefinitionUpdate.userErrors);
      definition = updated.metafieldDefinitionUpdate.updatedDefinition ?? definition;
    }
  }
}

function ensureProductAttributeDefinitions(): Promise<void> {
  if (!productAttributeDefinitionsReady) {
    productAttributeDefinitionsReady = createProductAttributeDefinitions().catch((error: unknown) => {
      productAttributeDefinitionsReady = undefined;
      throw error;
    });
  }
  return productAttributeDefinitionsReady;
}

async function saveProductAttributes(
  productId: string,
  attributes: { fabric: string; regionalHandloom: string; craftTechnique: string; region: string; colour: string },
  existing: AdminProductMetafield[] = [],
): Promise<void> {
  const values = {
    fabric: attributes.fabric.trim(),
    regional_handloom: attributes.regionalHandloom.trim(),
    craft_technique: attributes.craftTechnique.trim(),
    region: attributes.region.trim(),
    colour: attributes.colour.trim(),
  };
  const current = new Set(
    (existing ?? []).filter((entry) => entry?.value).map((entry) => entry!.key),
  );
  const hasValues = Object.values(values).some(Boolean);
  if (!hasValues && current.size === 0) return;

  await ensureProductAttributeDefinitions();
  const toSet = Object.entries(values)
    .filter(([, value]) => value)
    .map(([key, value]) => ({
      ownerId: productId,
      namespace: "chenetha",
      key,
      type: "single_line_text_field",
      value,
    }));
  const toDelete = Object.entries(values)
    .filter(([key, value]) => !value && current.has(key))
    .map(([key]) => ({ ownerId: productId, namespace: "chenetha", key }));

  if (toSet.length) {
    const result = await shopifyAdminRequest<{
      metafieldsSet: { userErrors: ShopifyUserErrors };
    }>(ADMIN_METAFIELDS_SET, { metafields: toSet });
    assertNoUserErrors(result.metafieldsSet.userErrors);
  }
  if (toDelete.length) {
    const result = await shopifyAdminRequest<{
      metafieldsDelete: { userErrors: ShopifyUserErrors };
    }>(ADMIN_METAFIELDS_DELETE, { metafields: toDelete });
    assertNoUserErrors(result.metafieldsDelete.userErrors);
  }
}

function uniqueCollectionIds(ids: string[]): string[] {
  if (ids.some((id) => !/^gid:\/\/shopify\/Collection\/\d+$/.test(id))) {
    throw new ShopifyInputError("Choose valid Shopify collections.");
  }
  return [...new Set(ids)];
}

function validateCollectionSelection(
  ids: string[],
  title: string,
  collections: AdminCollection[],
): string[] {
  const manualIds = new Set(
    collections.filter((collection) => !collection.ruleSet).map((collection) => collection.id),
  );
  const selected = uniqueCollectionIds(ids);
  for (const id of selected) {
    if (!manualIds.has(id)) {
      const collection = collections.find((entry) => entry.id === id);
      throw new ShopifyInputError(
        collection
          ? `“${collection.title}” is automatically managed by Shopify. Assign its matching rules in Shopify instead.`
          : "A selected Shopify collection no longer exists. Refresh and try again.",
      );
    }
  }
  const trimmedTitle = title.trim();
  if (trimmedTitle) {
    const match = collections.find(
      (collection) => collection.title.trim().toLowerCase() === trimmedTitle.toLowerCase(),
    );
    if (match?.ruleSet) {
      throw new ShopifyInputError(
        `“${trimmedTitle}” is an automatically managed Shopify collection and cannot be created as a manual collection with the same name.`,
      );
    }
  }
  return selected;
}

async function prepareProductCollections(
  productId: string,
  current: AdminProduct["collections"]["nodes"],
  selectedIds: string[],
  newCollectionTitle: string,
  availableCollections?: AdminCollection[],
): Promise<{ join: string[]; leave: string[]; publish: string[] }> {
  const collections = availableCollections ?? await fetchShopifyCollections();
  const title = newCollectionTitle.trim();
  const selected = validateCollectionSelection(selectedIds, title, collections);
  let existingTitleCollection: AdminCollection | undefined;
  if (title) {
    existingTitleCollection = collections.find(
      (collection) => collection.title.trim().toLowerCase() === title.toLowerCase(),
    );
    let collectionId = existingTitleCollection?.id;
    if (!collectionId) {
      const created = await shopifyAdminRequest<{
        collectionCreate: {
          collection: { id: string; title: string; handle: string; ruleSet: null } | null;
          userErrors: ShopifyUserErrors;
        };
      }>(ADMIN_COLLECTION_CREATE, {
        input: { title, products: [productId] },
      });
      assertNoUserErrors(created.collectionCreate.userErrors);
      collectionId = created.collectionCreate.collection?.id;
      if (!collectionId) {
        throw new ShopifyAdminError("Shopify did not return the new collection.");
      }
    }
    selected.push(collectionId);
  }

  const desired = uniqueCollectionIds(selected);
  const currentManualIds = current.filter((collection) => !collection.ruleSet).map((collection) => collection.id);
  const newlyCreatedId = title && !existingTitleCollection ? desired.at(-1) : undefined;
  const currentIds = new Set(currentManualIds);
  return {
    join: desired.filter((id) => !currentIds.has(id) && id !== newlyCreatedId),
    leave: currentManualIds.filter((id) => !desired.includes(id)),
    publish: desired,
  };
}

async function fetchShopifyInventoryWatch() {
  const variants: AdminInventoryVariant[] = [];
  let after: string | null = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const page: AdminInventoryPage = await shopifyAdminRequest<AdminInventoryPage>(
      ADMIN_INVENTORY_QUERY,
      after ? { after } : {},
    );
    variants.push(...page.productVariants.nodes);
    hasNextPage = page.productVariants.pageInfo.hasNextPage;
    after = page.productVariants.pageInfo.endCursor;
    if (hasNextPage && !after) {
      throw new ShopifyAdminError("Shopify did not return the next inventory page cursor.");
    }
  }

  const mapped = [];
  for (const variant of variants) {
    const item = variant.inventoryItem;
    if (!item) {
      mapped.push({
        productId: variant.product.id,
        productTitle: variant.product.title,
        productStatus: variant.product.status,
        variantId: variant.id,
        variantTitle: variant.title,
        tracked: false,
        inventoryPolicy: variant.inventoryPolicy,
        locations: [],
      });
      continue;
    }
    const levels = item.inventoryLevels;
    while (levels.pageInfo.hasNextPage) {
      if (!levels.pageInfo.endCursor) {
        throw new ShopifyAdminError("Shopify did not return the next inventory location cursor.");
      }
      const page = await shopifyAdminRequest<{
        inventoryItem: { inventoryLevels: typeof levels } | null;
      }>(ADMIN_INVENTORY_LEVEL_PAGE_QUERY, {
        id: item.id,
        after: levels.pageInfo.endCursor,
      });
      if (!page.inventoryItem) {
        throw new ShopifyInputError("Inventory changed. Reload the stock watch.");
      }
      levels.nodes.push(...page.inventoryItem.inventoryLevels.nodes);
      levels.pageInfo = page.inventoryItem.inventoryLevels.pageInfo;
    }
    mapped.push({
      productId: variant.product.id,
      productTitle: variant.product.title,
      productStatus: variant.product.status,
      variantId: variant.id,
      variantTitle: variant.title,
      tracked: item.tracked,
      inventoryPolicy: variant.inventoryPolicy,
      locations: levels.nodes.map((level) => ({
        locationId: level.location.id,
        locationName: level.location.name,
        active: level.location.isActive,
        available: level.quantities.find((quantity) => quantity.name === "available")?.quantity ?? 0,
      })),
    });
  }

  return GetShopifyAdminInventoryResponse.parse({
    refreshedAt: new Date().toISOString(),
    variants: mapped,
  });
}

async function setVariantPrice(
  productId: string,
  variantId: string,
  price: number,
): Promise<void> {
  const result = await shopifyAdminRequest<{
    productVariantsBulkUpdate: { userErrors: ShopifyUserErrors };
  }>(ADMIN_PRODUCT_VARIANT_UPDATE, {
    productId,
    variants: [{ id: variantId, price: price.toFixed(2) }],
  });
  assertNoUserErrors(result.productVariantsBulkUpdate.userErrors);
}

async function setVariantWeight(variant: AdminVariant, weightKg: number): Promise<void> {
  const inventoryItem = variant.inventoryItem;
  if (!inventoryItem) {
    throw new ShopifyInputError("This product has no inventory item to store its shipping weight.");
  }
  const result = await shopifyAdminRequest<{
    inventoryItemUpdate: { userErrors: ShopifyUserErrors };
  }>(INVENTORY_ITEM_UPDATE, {
    id: inventoryItem.id,
    input: { measurement: { weight: { value: weightKg, unit: "KILOGRAMS" } } },
  });
  assertNoUserErrors(result.inventoryItemUpdate.userErrors);
}

async function setVariantInventory(
  variant: AdminVariant,
  quantity: number,
): Promise<void> {
  const inventoryItem = variant.inventoryItem;
  if (!inventoryItem) {
    throw new ShopifyInputError("This product has no inventory item to update.");
  }

  const trackedResult = await shopifyAdminRequest<{
    inventoryItemUpdate: { userErrors: ShopifyUserErrors };
  }>(INVENTORY_ITEM_UPDATE, {
    id: inventoryItem.id,
    input: { tracked: true },
  });
  assertNoUserErrors(trackedResult.inventoryItemUpdate.userErrors);

  const locations = await shopifyAdminRequest<{
    locations: { nodes: Array<{ id: string; name: string }> };
  }>(INVENTORY_LOCATIONS_QUERY);
  const existingLocationId =
    inventoryItem.inventoryLevels.nodes[0]?.location.id;
  const location = existingLocationId
    ? locations.locations.nodes.find(
        (entry) => entry.id === existingLocationId,
      )
    : locations.locations.nodes[0];
  if (!location) {
    throw new ShopifyInputError(
      "Set up an active Shopify location before tracking stock.",
    );
  }

  if (
    !inventoryItem.inventoryLevels.nodes.some(
      (level) => level.location.id === location.id,
    )
  ) {
    const activateResult = await shopifyAdminRequest<{
      inventoryActivate: { userErrors: ShopifyUserErrors };
    }>(INVENTORY_ACTIVATE, {
      inventoryItemId: inventoryItem.id,
      locationId: location.id,
    });
    assertNoUserErrors(activateResult.inventoryActivate.userErrors);
  }

  const quantityResult = await shopifyAdminRequest<{
    inventorySetQuantities: { userErrors: ShopifyUserErrors };
  }>(INVENTORY_SET_QUANTITY, {
    idempotencyKey: randomUUID(),
    input: {
      name: "available",
      reason: "correction",
      quantities: [
        {
          inventoryItemId: inventoryItem.id,
          locationId: location.id,
          quantity,
          changeFromQuantity: inventoryItem.inventoryLevels.nodes.find((level) => level.location.id === location.id)?.quantities.find((entry) => entry.name === "available")?.quantity ?? 0,
        },
      ],
    },
  });
  assertNoUserErrors(quantityResult.inventorySetQuantities.userErrors);
}

async function publishToWebsite(publishableIds: string | string[]): Promise<void> {
  const publications = await shopifyAdminRequest<{
    publications: { nodes: Array<{ id: string; name: string }> };
  }>(ADMIN_PUBLICATIONS_QUERY);
  const publication = publications.publications.nodes.find(
    (entry) => process.env.SHOPIFY_CONNECTION_MODE === "direct"
      ? entry.id === process.env.SHOPIFY_PUBLICATION_ID
      : entry.name.toLowerCase() === "replit",
  );
  if (!publication) {
    throw new ShopifyInputError(
      process.env.SHOPIFY_CONNECTION_MODE === "direct"
        ? "Set SHOPIFY_PUBLICATION_ID to the publication used by this storefront's Shopify token."
        : "The Replit storefront channel is not available in this Shopify store.",
    );
  }
  for (const publishableId of [...new Set(Array.isArray(publishableIds) ? publishableIds : [publishableIds])]) {
    const result = await shopifyAdminRequest<{
      publishablePublish: { userErrors: ShopifyUserErrors };
    }>(ADMIN_PUBLISH_PRODUCT, {
      publishableId,
      publicationId: publication.id,
    });
    assertNoUserErrors(result.publishablePublish.userErrors);
  }
}

router.use("/shopify/admin", requireMerchantAdmin);

// Bound simultaneous in-memory uploads, including body parsing and decoding.
let activeImageUploads = 0;
const imageUploadSlot: RequestHandler = (req, res, next) => {
  if (activeImageUploads >= 3) {
    res.status(429).json({ error: "Other photos are uploading. Please try again shortly." });
    return;
  }
  activeImageUploads++;
  let released = false;
  const release = () => { if (!released) { released = true; activeImageUploads--; } };
  res.locals.releaseImageUpload = release;
  res.once("finish", release);
  res.once("close", () => { if (!req.complete) release(); });
  next();
};
const parseImage = raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: MAX_IMAGE_BYTES });
router.post("/shopify/admin/images", imageUploadSlot, (req, res, next) => {
  parseImage(req, res, (error) => {
    if (error) {
      res.status(error.type === "entity.too.large" ? 413 : 400).json({
        error: error.type === "entity.too.large" ? "Choose a photo no larger than 10 MB." : "This photo could not be read.",
      });
      return;
    }
    next();
  });
}, async (req, res): Promise<void> => {
  if (!Buffer.isBuffer(req.body)) {
    res.status(400).json({ error: "Choose a JPEG, PNG, or WebP photo." });
    return;
  }
  try {
    const resourceUrl = await stageProductImage(req.body, req.get("content-type")?.split(";")[0].toLowerCase() ?? "");
    res.status(201).json(UploadShopifyAdminImageResponse.parse({ resourceUrl }));
  } catch (error) {
    respondShopifyError(req, res, error, "The photo could not be uploaded to Shopify. Check the store connection and try again.");
  } finally {
    res.locals.releaseImageUpload();
  }
});

router.get("/shopify/admin/products", async (req, res): Promise<void> => {
  try {
    const result = await shopifyAdminRequest<ProductQueryResult>(
      ADMIN_PRODUCTS_QUERY,
    );
    res.json(
      GetShopifyAdminProductsResponse.parse({
        currencyCode: result.shop.currencyCode,
        products: result.products.nodes.map(mapProduct),
      }),
    );
  } catch (error) {
    respondShopifyError(
      req,
      res,
      error,
      "Shopify products could not be loaded. Check the store connection and try again.",
    );
  }
});

router.get("/shopify/admin/collections", async (req, res): Promise<void> => {
  try {
    const collections = await fetchShopifyCollections();
    res.json(
      GetShopifyAdminCollectionsResponse.parse({
        collections: collections
          .filter((collection) => !collection.ruleSet)
          .map((collection) => ({
            id: collection.id,
            title: collection.title,
            handle: collection.handle,
            manual: true,
          })),
      }),
    );
  } catch (error) {
    respondShopifyError(
      req,
      res,
      error,
      "Shopify collections could not be loaded. Refresh and try again.",
    );
  }
});

router.get("/shopify/admin/inventory", async (req, res): Promise<void> => {
  try {
    res.json(await fetchShopifyInventoryWatch());
  } catch (error) {
    respondShopifyError(
      req,
      res,
      error,
      "Shopify inventory could not be loaded. Refresh and try again.",
    );
  }
});

router.get("/shopify/admin/products/:productId", async (req, res): Promise<void> => {
  const productId = String(req.params.productId);
  if (!isShopifyProductId(productId)) {
    res.status(400).json({ error: "The Shopify product ID is invalid." });
    return;
  }
  try {
    const result = await fetchProduct(productId);
    res.json(GetShopifyAdminProductResponse.parse({ currencyCode: result.currencyCode, product: mapProduct(result.product) }));
  } catch (error) {
    respondShopifyError(req, res, error, "Could not load this product's variants. Reload and try again.");
  }
});

router.get("/shopify/admin/products/:productId/media", async (req, res): Promise<void> => {
  const productId = String(req.params.productId);
  if (!isShopifyProductId(productId)) {
    res.status(400).json({ error: "The Shopify product ID is invalid." });
    return;
  }
  try {
    res.json(await fetchProductMedia(productId));
  } catch (error) {
    respondShopifyError(req, res, error, "This product’s gallery could not be loaded. Refresh and try again.");
  }
});

router.post("/shopify/admin/products/:productId/media", async (req, res): Promise<void> => {
  const productId = String(req.params.productId);
  const parsed = UpdateShopifyAdminProductMediaBody.safeParse(req.body);
  if (!isShopifyProductId(productId) || !parsed.success) {
    res.status(400).json({ error: "Choose a valid product and staged photo." });
    return;
  }
  const input = parsed.data;
  try {
    validatePublicImageUrl(input.resourceUrl);
    if (input.replaceMediaId && !/^gid:\/\/shopify\/[A-Za-z0-9]+\/\d+$/.test(input.replaceMediaId)) {
      throw new ShopifyInputError("The selected gallery image is invalid.");
    }
    const product = await fetchProduct(productId);
    if (input.replaceMediaId) {
      const gallery = await fetchProductMedia(productId);
      if (!gallery.media.some((entry) => entry.id === input.replaceMediaId)) {
        throw new ShopifyNotFoundError("This media item does not belong to this product.");
      }
    }
    const createResult = await shopifyAdminRequest<{
      productCreateMedia: { media: Array<{ id: string; status: ShopifyProductMediaNode["status"] }>; mediaUserErrors: ShopifyUserErrors };
    }>(ADMIN_PRODUCT_CREATE_MEDIA, {
      productId,
      media: [{
        originalSource: input.resourceUrl,
        mediaContentType: "IMAGE",
        alt: product.product.title,
      }],
    });
    assertNoUserErrors(createResult.productCreateMedia.mediaUserErrors);
    if (!createResult.productCreateMedia.media.length) {
      throw new ShopifyAdminError("Shopify did not add the replacement image.");
    }
    let replacementStatus: "REPLACED" | "PROCESSING" | "FAILED" | null = null;
    if (input.replaceMediaId) {
      const replacement = createResult.productCreateMedia.media[0];
      if (replacement.status === "READY") {
        const deleteResult = await shopifyAdminRequest<{
          productDeleteMedia: { deletedMediaIds: string[] | null; mediaUserErrors: ShopifyUserErrors };
        }>(ADMIN_PRODUCT_DELETE_MEDIA, {
          productId,
          mediaIds: [input.replaceMediaId],
        });
        assertNoUserErrors(deleteResult.productDeleteMedia.mediaUserErrors);
        if (!deleteResult.productDeleteMedia.deletedMediaIds?.includes(input.replaceMediaId)) {
          throw new ShopifyAdminError("Shopify added the replacement, but did not remove the selected image.");
        }
        replacementStatus = "REPLACED";
      } else if (replacement.status === "FAILED") {
        replacementStatus = "FAILED";
      } else {
        replacementStatus = "PROCESSING";
      }
    }
    const gallery = await fetchProductMedia(productId);
    res.json(UpdateShopifyAdminProductMediaResponse.parse({ ...gallery, replacementStatus }));
  } catch (error) {
    respondShopifyError(req, res, error, "Shopify could not update this gallery. Refresh before trying again.");
  } finally {
    invalidateShopifyCatalog();
  }
});

router.patch("/shopify/admin/products/:productId/media/order", async (req, res): Promise<void> => {
  const productId = String(req.params.productId);
  const parsed = ReorderShopifyAdminProductMediaBody.safeParse(req.body);
  if (!isShopifyProductId(productId) || !parsed.success) {
    res.status(400).json({ error: "Choose a valid order for this product’s gallery." });
    return;
  }
  try {
    const current = await fetchProductMedia(productId);
    const requestedIds = parsed.data.mediaIds;
    const expectedIds = parsed.data.expectedMediaIds;
    const currentIds = current.media.map((entry) => entry.id);
    if (expectedIds.length !== currentIds.length ||
      expectedIds.some((id, index) => currentIds[index] !== id)) {
      throw new ShopifyStockConflictError("The gallery order changed in another session. Refresh the gallery and try again.");
    }
    if (requestedIds.length !== currentIds.length ||
      new Set(requestedIds).size !== requestedIds.length ||
      requestedIds.some((id) => !currentIds.includes(id))) {
      throw new ShopifyInputError("The gallery changed. Refresh it and try again.");
    }
    if (requestedIds.some((id, index) => currentIds[index] !== id)) {
      const result = await shopifyAdminRequest<{
        productReorderMedia: { job: { id: string } | null; mediaUserErrors: ShopifyUserErrors };
      }>(ADMIN_PRODUCT_REORDER_MEDIA, {
        id: productId,
        moves: requestedIds.map((id, newPosition) => ({ id, newPosition })),
      });
      assertNoUserErrors(result.productReorderMedia.mediaUserErrors);
      if (result.productReorderMedia.job?.id) {
        await waitForShopifyJob(result.productReorderMedia.job.id);
      }
    }
    res.json(await fetchProductMedia(productId));
  } catch (error) {
    respondShopifyError(req, res, error, "Shopify could not reorder this gallery. Refresh before trying again.");
  } finally {
    invalidateShopifyCatalog();
  }
});

router.patch("/shopify/admin/products/:productId/media/:mediaId", async (req, res): Promise<void> => {
  const productId = String(req.params.productId);
  const mediaId = String(req.params.mediaId);
  const parsed = UpdateShopifyAdminProductMediaAltBody.safeParse(req.body);
  if (!isShopifyProductId(productId) || !/^gid:\/\/shopify\/[A-Za-z0-9]+\/\d+$/.test(mediaId) ||
      !parsed.success) {
    res.status(400).json({ error: "Choose a valid product image and provide alternative text up to 512 characters." });
    return;
  }
  try {
    const gallery = await fetchProductMedia(productId);
    const selected = gallery.media.find((entry) => entry.id === mediaId);
    if (!selected) throw new ShopifyNotFoundError("This media item does not belong to this product.");
    if (selected.mediaContentType !== "IMAGE") {
      throw new ShopifyInputError("Alternative text can only be changed for product images.");
    }
    const result = await shopifyAdminRequest<{
      productUpdateMedia: { media: Array<{ id: string; alt: string | null }>; mediaUserErrors: ShopifyUserErrors };
    }>(ADMIN_PRODUCT_UPDATE_MEDIA_ALT, {
      productId,
      media: [{ id: mediaId, alt: parsed.data.alt }],
    });
    assertNoUserErrors(result.productUpdateMedia.mediaUserErrors);
    if (!result.productUpdateMedia.media?.some((entry) => entry.id === mediaId)) {
      throw new ShopifyAdminError("Shopify did not confirm the image description update.");
    }
    res.json(await fetchProductMedia(productId));
  } catch (error) {
    respondShopifyError(req, res, error, "Shopify could not save this image description. Refresh and try again.");
  } finally {
    invalidateShopifyCatalog();
  }
});

router.delete("/shopify/admin/products/:productId/media/:mediaId", async (req, res): Promise<void> => {
  const productId = String(req.params.productId);
  const mediaId = String(req.params.mediaId);
  if (!isShopifyProductId(productId) || !/^gid:\/\/shopify\/[A-Za-z0-9]+\/\d+$/.test(mediaId)) {
    res.status(400).json({ error: "The Shopify product or media ID is invalid." });
    return;
  }
  try {
    await assertProductMediaBelongsToProduct(productId, mediaId);
    const result = await shopifyAdminRequest<{
      productDeleteMedia: { deletedMediaIds: string[] | null; mediaUserErrors: ShopifyUserErrors };
    }>(ADMIN_PRODUCT_DELETE_MEDIA, { productId, mediaIds: [mediaId] });
    assertNoUserErrors(result.productDeleteMedia.mediaUserErrors);
    if (!result.productDeleteMedia.deletedMediaIds?.includes(mediaId)) {
      throw new ShopifyAdminError("Shopify did not remove this gallery item.");
    }
    res.json(await fetchProductMedia(productId));
  } catch (error) {
    respondShopifyError(req, res, error, "Shopify could not remove this gallery item. Refresh before trying again.");
  } finally {
    invalidateShopifyCatalog();
  }
});

router.patch("/shopify/admin/products/:productId/variants/:variantId", async (req, res): Promise<void> => {
  const productId = String(req.params.productId);
  const variantId = String(req.params.variantId);
  const parsed = UpdateShopifyAdminVariantBody.safeParse(req.body);
  if (!isShopifyProductId(productId) || !/^gid:\/\/shopify\/ProductVariant\/\d+$/.test(variantId) ||
      !parsed.success || !Object.keys(parsed.data ?? {}).length) {
    res.status(400).json({ error: "Choose a valid variant and a price, option or location quantity to update." });
    return;
  }
  const input = parsed.data;
  try {
    const existing = await fetchProduct(productId);
    const variant = existing.product.variants.nodes.find((entry) => entry.id === variantId);
    if (!variant) throw new ShopifyNotFoundError("This variant does not belong to this product.");
    const stock = input.stock;
    const item = variant.inventoryItem;
    if (input.weightKg !== undefined && !item) {
      throw new ShopifyInputError("This variant has no inventory item to store its shipping weight.");
    }
    if (stock) {
      const level = item?.inventoryLevels.nodes.find((entry) => entry.location.id === stock.locationId);
      if (!item?.tracked || !level?.location.isActive) {
        throw new ShopifyInputError("Enable inventory tracking and stock this variant at an active location in Shopify first, then refresh.");
      }
      if (level.quantities.find((entry) => entry.name === "available")?.quantity !== stock.compareQuantity) {
        throw new ShopifyStockConflictError("Stock changed in Shopify. Refresh quantities and review your change before saving again.");
      }
    }
    if (input.selectedOptions && (
      input.selectedOptions.length !== variant.selectedOptions.length ||
      new Set(input.selectedOptions.map((option) => option.name)).size !== variant.selectedOptions.length ||
      input.selectedOptions.some((option) => !option.value.trim() || option.value.length > 255 ||
        !variant.selectedOptions.some((current) => current.name === option.name))
    )) throw new ShopifyInputError("Keep the existing option names and provide a value for every size/color option.");

    if (input.price !== undefined || input.selectedOptions || stock) {
      const result = await shopifyAdminRequest<{ productVariantsBulkUpdate: { userErrors: ShopifyUserErrors } }>(
        ADMIN_PRODUCT_VARIANT_UPDATE,
        { productId, variants: [{
          id: variant.id,
          ...(input.price !== undefined ? { price: input.price.toFixed(2) } : {}),
          ...(input.selectedOptions ? { optionValues: input.selectedOptions.map((option) => ({ optionName: option.name, name: option.value.trim() })) } : {}),
          // A stock correction must not leave "continue selling when out of stock" enabled.
          ...(stock ? { inventoryPolicy: "DENY" } : {}),
        }] },
      );
      assertNoUserErrors(result.productVariantsBulkUpdate.userErrors);
    }
    if (input.weightKg !== undefined) {
      await setVariantWeight(variant, input.weightKg);
    }
    if (stock && item) {
      const result = await shopifyAdminRequest<{ inventorySetQuantities: { userErrors: Array<{ field?: string[] | null; message: string; code?: string }> } }>(
        INVENTORY_SET_QUANTITY.replace("userErrors { field message }", "userErrors { field message code }"),
        { idempotencyKey: randomUUID(), input: {
          name: "available", reason: "correction",
          quantities: [{ inventoryItemId: item.id, locationId: stock.locationId, quantity: stock.quantity, changeFromQuantity: stock.compareQuantity }],
        } },
      );
      if (result.inventorySetQuantities.userErrors.some((error) => error.code === "CHANGE_FROM_QUANTITY_STALE" || error.code === "COMPARE_QUANTITY_STALE")) {
        throw new ShopifyStockConflictError("Stock changed during the save. Refresh quantities before retrying. Any price/option changes or overselling protection may already be saved.");
      }
      assertNoUserErrors(result.inventorySetQuantities.userErrors);
    }
    const updated = await fetchProduct(productId);
    res.json(UpdateShopifyAdminVariantResponse.parse({ currencyCode: updated.currencyCode, product: mapProduct(updated.product) }));
  } catch (error) {
    respondShopifyError(req, res, error, "Shopify could not complete the update. Some changes may have saved; refresh before retrying.");
  } finally {
    invalidateShopifyCatalog();
  }
});

router.post("/shopify/admin/products/:productId/variants", async (req, res): Promise<void> => {
  const productId = String(req.params.productId);
  const parsed = CreateShopifyAdminVariantBody.safeParse(req.body);
  if (!isShopifyProductId(productId) || !parsed.success) {
    res.status(400).json({ error: "Choose a valid price and a value for every product option." });
    return;
  }
  const input = parsed.data;
  try {
    const existing = await fetchProduct(productId);
    const product = existing.product;
    const options = product.options;
    if (!options.length || options.some((option) => option.name === "Title")) {
      throw new ShopifyInputError("Add a real product option, such as Size or Color, in Shopify before creating variants.");
    }
    if (options.length !== input.selectedOptions.length ||
      options.length > 3 || new Set(input.selectedOptions.map((option) => option.name)).size !== options.length ||
      options.some((option) => !input.selectedOptions.some((selected) => selected.name === option.name))) {
      throw new ShopifyInputError("Use every existing product option exactly once. Add option types in Shopify before creating variants.");
    }
    if (product.variants.nodes.length >= 2048) {
      throw new ShopifyInputError("Shopify's 2,048-variant product limit has been reached.");
    }
    if (input.selectedOptions.some((option) => !option.value.trim() || option.value.length > 255)) {
      throw new ShopifyInputError("Every option value must contain 1–255 characters.");
    }

    const normalized = (value: string) => value.trim().toLocaleLowerCase();
    const selectedByName = new Map(input.selectedOptions.map((option) => [option.name, normalized(option.value)]));
    const duplicate = product.variants.nodes.some((variant) =>
      variant.selectedOptions.length === options.length &&
      variant.selectedOptions.every((option) => selectedByName.get(option.name) === normalized(option.value)),
    );
    if (duplicate) {
      throw new ShopifyInputError("This size/color combination already exists.");
    }

    let addedOptionValue = false;
    for (const selected of input.selectedOptions) {
      const option = options.find((entry) => entry.name === selected.name)!;
      const knownValue = option.optionValues.find((entry) => normalized(entry.name) === normalized(selected.value));
      if (knownValue) continue;
      const result = await shopifyAdminRequest<{
        productOptionUpdate: { userErrors: ShopifyUserErrors };
      }>(ADMIN_PRODUCT_OPTION_UPDATE, {
        productId,
        option: { id: option.id },
        optionValuesToAdd: [{ name: selected.value.trim() }],
        variantStrategy: "LEAVE_AS_IS",
      });
      assertNoUserErrors(result.productOptionUpdate.userErrors);
      addedOptionValue = true;
    }

    // Refresh after Shopify creates any missing option values; variant creation must use Shopify-issued IDs.
    const resolved = addedOptionValue ? await fetchProduct(productId) : existing;
    const variantOptionValues = input.selectedOptions.map((selected) => {
      const option = resolved.product.options.find((entry) => entry.name === selected.name);
      const value = option?.optionValues.find((entry) => normalized(entry.name) === normalized(selected.value));
      if (!option || !value) {
        throw new ShopifyInputError(`Shopify did not return an ID for ${selected.name}: ${selected.value}. Refresh and try again.`);
      }
      return { optionId: option.id, id: value.id };
    });
    const created = await shopifyAdminRequest<{
      productVariantsBulkCreate: { productVariants: Array<{ id: string }> | null; userErrors: ShopifyUserErrors };
    }>(ADMIN_PRODUCT_VARIANT_CREATE, {
      productId,
      variants: [{ price: input.price.toFixed(2), optionValues: variantOptionValues }],
      strategy: "PRESERVE_STANDALONE_VARIANT",
    });
    assertNoUserErrors(created.productVariantsBulkCreate.userErrors);
    if (!created.productVariantsBulkCreate.productVariants?.length) {
      throw new ShopifyAdminError("Shopify did not confirm the new variant.");
    }

    const updated = await fetchProduct(productId);
    const refreshedVariantIds = new Set(updated.product.variants.nodes.map((variant) => variant.id));
    if (created.productVariantsBulkCreate.productVariants.some((variant) => !refreshedVariantIds.has(variant.id))) {
      throw new ShopifyAdminError("Shopify created the variant but did not return it in the refreshed product.");
    }
    const createdVariantIds = new Set(created.productVariantsBulkCreate.productVariants.map((variant) => variant.id));
    for (const variant of updated.product.variants.nodes.filter((entry) => createdVariantIds.has(entry.id))) {
      await setVariantWeight(variant, input.weightKg);
    }
    const refreshed = await fetchProduct(productId);
    res.json(CreateShopifyAdminVariantResponse.parse({
      currencyCode: refreshed.currencyCode,
      product: mapProduct(refreshed.product),
    }));
  } catch (error) {
    respondShopifyError(req, res, error, "Shopify could not create this variant. Some option values may have saved; refresh before retrying.");
  } finally {
    invalidateShopifyCatalog();
  }
});

router.delete("/shopify/admin/products/:productId/variants/:variantId", async (req, res): Promise<void> => {
  const params = DeleteShopifyAdminVariantParams.safeParse(req.params);
  if (!params.success || !isShopifyProductId(params.data.productId) ||
    !/^gid:\/\/shopify\/ProductVariant\/\d+$/.test(params.data.variantId)) {
    res.status(400).json({ error: "Choose a valid Shopify product and variant." });
    return;
  }
  const { productId, variantId } = params.data;
  try {
    const current = await fetchProduct(productId);
    const variant = current.product.variants.nodes.find((entry) => entry.id === variantId);
    if (!variant) throw new ShopifyNotFoundError("This variant does not belong to this product.");
    if (current.product.variants.nodes.length <= 1) {
      throw new ShopifyInputError("A product must keep at least one variant.");
    }
    if (variant.title === "Default Title" || variant.selectedOptions.some((option) =>
      option.name === "Title" && option.value === "Default Title")) {
      throw new ShopifyInputError("Shopify's default variant cannot be deleted.");
    }
    const result = await shopifyAdminRequest<{
      productVariantsBulkDelete: { product: { id: string } | null; userErrors: ShopifyUserErrors };
    }>(ADMIN_PRODUCT_VARIANT_DELETE, { productId, variantsIds: [variant.id] });
    assertNoUserErrors(result.productVariantsBulkDelete.userErrors);
    const updated = await fetchProduct(productId);
    if (updated.product.variants.nodes.some((entry) => entry.id === variantId)) {
      throw new ShopifyAdminError("Shopify did not remove the selected variant.");
    }
    res.json(DeleteShopifyAdminVariantResponse.parse({
      currencyCode: updated.currencyCode,
      product: mapProduct(updated.product),
    }));
  } catch (error) {
    respondShopifyError(req, res, error, "Shopify could not delete this variant. Refresh before retrying.");
  } finally {
    invalidateShopifyCatalog();
  }
});

router.post("/shopify/admin/products", async (req, res): Promise<void> => {
  const parsed = CreateShopifyAdminProductBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const input = parsed.data;
  try {
    validatePublicImageUrl(input.imageUrl);
    const selectedCollectionIds = uniqueCollectionIds(input.collectionIds ?? []);
    const newCollectionTitle = input.newCollectionTitle?.trim() ?? "";
    const availableCollections =
      selectedCollectionIds.length || newCollectionTitle
        ? await fetchShopifyCollections()
        : [];
    validateCollectionSelection(selectedCollectionIds, newCollectionTitle, availableCollections);
    const createResult = await shopifyAdminRequest<{
      productCreate: {
        product: { id: string } | null;
        userErrors: ShopifyUserErrors;
      };
    }>(ADMIN_PRODUCT_CREATE, {
      product: {
        title: input.title.trim(),
        descriptionHtml: escapeProductDescription(input.description),
        ...(input.productType?.trim() ? { productType: input.productType.trim() } : {}),
        tags: input.tags.map((tag) => tag.trim()).filter(Boolean),
        status: "DRAFT",
      },
      media: input.imageUrl
        ? [
            {
              originalSource: input.imageUrl,
              mediaContentType: "IMAGE",
              alt: input.title.trim(),
            },
          ]
        : [],
    });
    assertNoUserErrors(createResult.productCreate.userErrors);
    const productId = createResult.productCreate.product?.id;
    if (!productId) {
      throw new ShopifyAdminError("Shopify did not return the new product.");
    }

    const initial = await fetchProduct(productId);
    const variant = initial.product.variants.nodes[0];
    if (!variant) {
      throw new ShopifyInputError(
        "Shopify created the product without a default variant.",
      );
    }
    await setVariantPrice(productId, variant.id, input.price);
    await setVariantWeight(variant, input.weightKg);
    await setVariantInventory(variant, input.inventoryQuantity);

    await saveProductAttributes(productId, {
      fabric: input.fabric ?? "",
      regionalHandloom: input.regionalHandloom ?? "",
      craftTechnique: input.craftTechnique ?? "",
      region: input.region ?? "",
      colour: input.colour ?? "",
    }, productAttributeMetafields(initial.product));

    const collectionPlan =
      selectedCollectionIds.length || newCollectionTitle
        ? await prepareProductCollections(
            productId,
            [],
            selectedCollectionIds,
            newCollectionTitle,
            availableCollections,
          )
        : undefined;
    const productInput: Record<string, unknown> = { id: productId };
    if (collectionPlan?.join.length) productInput.collectionsToJoin = collectionPlan.join;
    if (collectionPlan?.leave.length) productInput.collectionsToLeave = collectionPlan.leave;
    if (input.publishToWebsite) productInput.status = "ACTIVE";

    if (Object.keys(productInput).length > 1) {
      const updateResult = await shopifyAdminRequest<{
        productUpdate: { userErrors: ShopifyUserErrors };
      }>(ADMIN_PRODUCT_UPDATE, {
        product: productInput,
        media: [],
      });
      assertNoUserErrors(updateResult.productUpdate.userErrors);
    }

    if (input.publishToWebsite) {
      await publishToWebsite([productId, ...(collectionPlan?.publish ?? [])]);
    }

    const created = await fetchProduct(productId);
    res.status(201).json(
      CreateShopifyAdminProductResponse.parse({
        currencyCode: created.currencyCode,
        product: mapProduct(created.product),
      }),
    );
  } catch (error) {
    respondShopifyError(
      req,
      res,
      error,
      "Shopify could not create this product. If it was saved as a draft, refresh the product list before trying again.",
    );
  } finally {
    invalidateShopifyCatalog();
  }
});

router.patch(
  "/shopify/admin/products/:productId",
  async (req, res): Promise<void> => {
    const params = req.params;
    const productId = Array.isArray(params.productId)
      ? params.productId[0]
      : params.productId;
    if (!productId || !isShopifyProductId(productId)) {
      res.status(400).json({ error: "The Shopify product ID is invalid." });
      return;
    }

    if (req.body?.price !== undefined || req.body?.inventoryQuantity !== undefined) {
      res.status(400).json({ error: "Use the variant editor to update prices and location stock. Aggregate stock updates are not supported." });
      return;
    }
    const parsed = UpdateShopifyAdminProductBody.safeParse(req.body);
    if (!parsed.success || !Object.keys(parsed.data ?? {}).length) {
      res.status(400).json({
        error: parsed.success
          ? "Choose at least one product detail to update."
          : parsed.error.message,
      });
      return;
    }

    const input = parsed.data;
    try {
      validatePublicImageUrl(input.imageUrl);
      const existing = await fetchProduct(productId);
      const selectedCollectionIds =
        input.collectionIds === undefined
          ? undefined
          : uniqueCollectionIds(input.collectionIds);
      const newCollectionTitle = input.newCollectionTitle?.trim() ?? "";
      const availableCollections =
        selectedCollectionIds?.length || newCollectionTitle
          ? await fetchShopifyCollections()
          : [];
      const collectionPlan =
        selectedCollectionIds !== undefined || newCollectionTitle
          ? await prepareProductCollections(
              productId,
              existing.product.collections.nodes,
              selectedCollectionIds ?? existing.product.collections.nodes
                .filter((collection) => !collection.ruleSet)
                .map((collection) => collection.id),
              newCollectionTitle,
              availableCollections,
            )
          : undefined;
      const productInput: Record<string, unknown> = { id: productId };
      if (input.title !== undefined) productInput.title = input.title.trim();
      if (input.description !== undefined) {
        productInput.descriptionHtml = escapeProductDescription(
          input.description,
        );
      }
      if (input.productType !== undefined) {
        productInput.productType = input.productType.trim();
      }
      if (input.tags !== undefined) {
        productInput.tags = input.tags.map((tag) => tag.trim()).filter(Boolean);
      }
      if (collectionPlan?.join.length) productInput.collectionsToJoin = collectionPlan.join;
      if (collectionPlan?.leave.length) productInput.collectionsToLeave = collectionPlan.leave;
      if (input.publishToWebsite !== undefined) {
        productInput.status = input.publishToWebsite ? "ACTIVE" : "DRAFT";
      }

      const media = input.imageUrl
        ? [
            {
              originalSource: input.imageUrl,
              mediaContentType: "IMAGE",
              alt: input.title?.trim() || existing.product.title,
            },
          ]
        : [];
      if (Object.keys(productInput).length > 1 || media.length) {
        const updateResult = await shopifyAdminRequest<{
          productUpdate: { userErrors: ShopifyUserErrors };
        }>(ADMIN_PRODUCT_UPDATE, { product: productInput, media });
        assertNoUserErrors(updateResult.productUpdate.userErrors);
      }

      if (
        input.fabric !== undefined ||
        input.regionalHandloom !== undefined ||
        input.craftTechnique !== undefined ||
        input.region !== undefined ||
        input.colour !== undefined
      ) {
        await saveProductAttributes(productId, {
          fabric: input.fabric ?? "",
          regionalHandloom: input.regionalHandloom ?? "",
          craftTechnique: input.craftTechnique ?? "",
          region: input.region ?? "",
          colour: input.colour ?? "",
        }, productAttributeMetafields(existing.product));
      }

      if (input.publishToWebsite === true) {
        await publishToWebsite([
          productId,
          ...(collectionPlan?.publish ??
            existing.product.collections.nodes
              .filter((collection) => !collection.ruleSet)
              .map((collection) => collection.id)),
        ]);
      }

      const updated = await fetchProduct(productId);
      res.json(
        UpdateShopifyAdminProductResponse.parse({
          currencyCode: updated.currencyCode,
          product: mapProduct(updated.product),
        }),
      );
    } catch (error) {
      respondShopifyError(
        req,
        res,
        error,
        "Shopify could not update this product. Check the store connection and try again.",
      );
    } finally {
      invalidateShopifyCatalog();
    }
  },
);

router.delete(
  "/shopify/admin/products/:productId/permanently",
  async (req, res): Promise<void> => {
    const productId = Array.isArray(req.params.productId)
      ? req.params.productId[0]
      : req.params.productId;
    if (!productId || !isShopifyProductId(productId)) {
      res.status(400).json({ error: "The Shopify product ID is invalid." });
      return;
    }

    try {
      const result = await shopifyAdminRequest<{
        productDelete: {
          deletedProductId: string | null;
          userErrors: ShopifyUserErrors;
        };
      }>(ADMIN_PRODUCT_DELETE, {
        input: { id: productId },
        synchronous: true,
      });
      assertNoUserErrors(result.productDelete.userErrors);
      if (result.productDelete.deletedProductId !== productId) {
        throw new ShopifyAdminError("Shopify did not confirm that the product was deleted.");
      }
      res.json(
        PermanentlyDeleteShopifyAdminProductResponse.parse({
          success: true,
          deletedProductId: result.productDelete.deletedProductId,
        }),
      );
    } catch (error) {
      respondShopifyError(
        req,
        res,
        error,
        "Shopify could not permanently delete this product. Check the store connection and try again.",
      );
    } finally {
      invalidateShopifyCatalog();
    }
  },
);

router.delete(
  "/shopify/admin/products/:productId",
  async (req, res): Promise<void> => {
    const productId = Array.isArray(req.params.productId)
      ? req.params.productId[0]
      : req.params.productId;
    if (!productId || !isShopifyProductId(productId)) {
      res.status(400).json({ error: "The Shopify product ID is invalid." });
      return;
    }

    try {
      const result = await shopifyAdminRequest<{
        productUpdate: { userErrors: ShopifyUserErrors };
      }>(ADMIN_PRODUCT_UPDATE, {
        product: { id: productId, status: "ARCHIVED" },
        media: [],
      });
      assertNoUserErrors(result.productUpdate.userErrors);
      res.json(ArchiveShopifyAdminProductResponse.parse({ success: true }));
    } catch (error) {
      respondShopifyError(
        req,
        res,
        error,
        "Shopify could not archive this product. Check the store connection and try again.",
      );
    } finally {
      invalidateShopifyCatalog();
    }
  },
);

router.get("/shopify/admin/discounts", async (req, res): Promise<void> => {
  try {
    const result = await shopifyAdminRequest<{
      discountNodes: {
        nodes: Array<{
          id: string;
          discount: {
            title: string;
            status: "ACTIVE" | "EXPIRED" | "SCHEDULED";
            startsAt: string;
            endsAt: string | null;
            codes: { nodes: Array<{ code: string }> };
            customerGets: {
              value: { percentage?: number | null };
            };
          } | null;
        }>;
      };
    }>(ADMIN_DISCOUNTS_QUERY);

    res.json(
      GetShopifyAdminDiscountsResponse.parse({
        discounts: result.discountNodes.nodes.flatMap((node) => {
          const discount = node.discount;
          const code = discount?.codes.nodes[0]?.code;
          const percentage = discount?.customerGets.value.percentage;
          if (!discount || !code || percentage == null) return [];
          return [
            {
              id: node.id,
              title: discount.title,
              code,
              status: discount.status,
              percentage: percentage * 100,
              startsAt: discount.startsAt,
              endsAt: discount.endsAt,
            },
          ];
        }),
      }),
    );
  } catch (error) {
    respondShopifyError(
      req,
      res,
      error,
      "Shopify discount codes could not be loaded. Check the store connection and try again.",
    );
  }
});

router.post("/shopify/admin/discounts", async (req, res): Promise<void> => {
  const parsed = CreateShopifyAdminDiscountBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const input = parsed.data;
  try {
    const startsAt = input.startsAt ?? new Date().toISOString();
    if (
      input.endsAt &&
      new Date(input.endsAt).getTime() <= new Date(startsAt).getTime()
    ) {
      throw new ShopifyInputError("End time must be later than start time.");
    }

    const result = await shopifyAdminRequest<{
      discountCodeBasicCreate: {
        codeDiscountNode: {
          id: string;
          codeDiscount: {
            title: string;
            status: "ACTIVE" | "EXPIRED" | "SCHEDULED";
            startsAt: string;
            endsAt: string | null;
            codes: { nodes: Array<{ code: string }> };
            customerGets: { value: { percentage?: number | null } };
          } | null;
        } | null;
        userErrors: ShopifyUserErrors;
      };
    }>(ADMIN_DISCOUNT_CREATE, {
      basicCodeDiscount: {
        title: input.title.trim(),
        code: input.code.trim().toUpperCase(),
        startsAt,
        ...(input.endsAt ? { endsAt: input.endsAt } : {}),
        ...(input.usageLimit ? { usageLimit: input.usageLimit } : {}),
        appliesOncePerCustomer: input.appliesOncePerCustomer,
        context: { all: "ALL" },
        customerGets: {
          value: { percentage: input.percentage / 100 },
          items: { all: true },
        },
      },
    });
    assertNoUserErrors(result.discountCodeBasicCreate.userErrors);
    const node = result.discountCodeBasicCreate.codeDiscountNode;
    const discount = node?.codeDiscount;
    const code = discount?.codes.nodes[0]?.code;
    const percentage = discount?.customerGets.value.percentage;
    if (!node || !discount || !code || percentage == null) {
      throw new ShopifyAdminError(
        "Shopify did not return the created discount code.",
      );
    }
    res.status(201).json(
      CreateShopifyAdminDiscountResponse.parse({
        discount: {
          id: node.id,
          title: discount.title,
          code,
          status: discount.status,
          percentage: percentage * 100,
          startsAt: discount.startsAt,
          endsAt: discount.endsAt,
        },
      }),
    );
  } catch (error) {
    respondShopifyError(
      req,
      res,
      error,
      "Shopify could not create this discount code. Check the code and store connection.",
    );
  }
});

router.delete(
  "/shopify/admin/discounts/:discountId",
  async (req, res): Promise<void> => {
    const discountId = Array.isArray(req.params.discountId)
      ? req.params.discountId[0]
      : req.params.discountId;
    if (!discountId || !isShopifyDiscountId(discountId)) {
      res.status(400).json({ error: "The Shopify discount ID is invalid." });
      return;
    }

    try {
      const result = await shopifyAdminRequest<{
        discountCodeDeactivate: { userErrors: ShopifyUserErrors };
      }>(ADMIN_DISCOUNT_DEACTIVATE, { id: discountId });
      assertNoUserErrors(result.discountCodeDeactivate.userErrors);
      res.json(DeactivateShopifyAdminDiscountResponse.parse({ success: true }));
    } catch (error) {
      respondShopifyError(
        req,
        res,
        error,
        "Shopify could not deactivate this discount code. Check the store connection and try again.",
      );
    }
  },
);

export default router;

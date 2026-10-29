import { Router, raw, type IRouter, type Request, type Response, type RequestHandler } from "express";
import { randomUUID } from "node:crypto";
import {
  ArchiveShopifyAdminProductResponse,
  CreateShopifyAdminDiscountBody,
  CreateShopifyAdminDiscountResponse,
  CreateShopifyAdminProductBody,
  CreateShopifyAdminProductResponse,
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
    inventoryLevels: {
      nodes: Array<{ location: { id: string; name: string; isActive: boolean }; quantities: Array<{ name: string; quantity: number }> }>;
      pageInfo: { hasNextPage: boolean; endCursor: string };
    };
  } | null;
};

type AdminProduct = {
  id: string;
  title: string;
  handle: string;
  description: string;
  productType: string;
  status: "ACTIVE" | "DRAFT" | "ARCHIVED";
  tags: string[];
  featuredMedia: { image: { url: string; altText: string | null } | null } | null;
  options: Array<{ id: string; name: string; optionValues: Array<{ id: string; name: string }> }>;
  variants: { nodes: AdminVariant[]; pageInfo: { hasNextPage: boolean; endCursor: string } };
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
        inventoryLevels(first: 1) {
          pageInfo { hasNextPage endCursor }
          nodes { location { id name isActive } quantities(names: ["available"]) { name quantity } }
        }
      }
    }
  }
`;

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
    product(id: $id) { ${ADMIN_PRODUCT_FIELDS} }
  }
`;

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
  mutation MerchantPublishProduct($productId: ID!, $publicationId: ID!) {
    publishablePublish(
      id: $productId
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

function mapProduct(
  product: AdminProduct,
): ReturnType<typeof GetShopifyAdminProductsResponse.parse>["products"][number] {
  return {
    id: product.id,
    title: product.title,
    handle: product.handle,
    description: normalizeProductDescription(product.description),
    productType: product.productType ?? "",
    status: product.status,
    tags: product.tags,
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
      inventoryLevels: variant.inventoryItem?.inventoryLevels.nodes.map((level) => ({
        locationId: level.location.id,
        locationName: level.location.name,
        active: level.location.isActive,
        available: level.quantities.find((entry) => entry.name === "available")!.quantity,
      })) ?? [],
    })),
  };
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

async function publishToWebsite(productId: string): Promise<void> {
  const publications = await shopifyAdminRequest<{
    publications: { nodes: Array<{ id: string; name: string }> };
  }>(ADMIN_PUBLICATIONS_QUERY);
  const publication = publications.publications.nodes.find(
    (entry) => entry.name.toLowerCase() === "replit",
  );
  if (!publication) {
    throw new ShopifyInputError(
      "The Replit storefront channel is not available in this Shopify store.",
    );
  }
  const result = await shopifyAdminRequest<{
    publishablePublish: { userErrors: ShopifyUserErrors };
  }>(ADMIN_PUBLISH_PRODUCT, {
    productId,
    publicationId: publication.id,
  });
  assertNoUserErrors(result.publishablePublish.userErrors);
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
    const currentIds = current.media.map((entry) => entry.id);
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
    res.json(CreateShopifyAdminVariantResponse.parse({
      currencyCode: updated.currencyCode,
      product: mapProduct(updated.product),
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
    const createResult = await shopifyAdminRequest<{
      productCreate: {
        product: { id: string } | null;
        userErrors: ShopifyUserErrors;
      };
    }>(ADMIN_PRODUCT_CREATE, {
      product: {
        title: input.title.trim(),
        descriptionHtml: escapeProductDescription(input.description),
        productType: input.productType.trim(),
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
    await setVariantInventory(variant, input.inventoryQuantity);

    if (input.publishToWebsite) {
      const updateResult = await shopifyAdminRequest<{
        productUpdate: { userErrors: ShopifyUserErrors };
      }>(ADMIN_PRODUCT_UPDATE, {
        product: { id: productId, status: "ACTIVE" },
        media: [],
      });
      assertNoUserErrors(updateResult.productUpdate.userErrors);
      await publishToWebsite(productId);
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
      const updateResult = await shopifyAdminRequest<{
        productUpdate: { userErrors: ShopifyUserErrors };
      }>(ADMIN_PRODUCT_UPDATE, { product: productInput, media });
      assertNoUserErrors(updateResult.productUpdate.userErrors);

      if (input.publishToWebsite === true) {
        await publishToWebsite(productId);
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

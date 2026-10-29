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
  GetShopifyAdminProductsResponse,
  UpdateShopifyAdminProductBody,
  UpdateShopifyAdminProductResponse,
  UploadShopifyAdminImageResponse,
  UpdateShopifyAdminVariantBody,
  UpdateShopifyAdminVariantResponse,
  GetShopifyAdminProductResponse,
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

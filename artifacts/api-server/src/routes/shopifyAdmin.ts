import { Router, raw, type IRouter, type Request, type Response, type RequestHandler } from "express";
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
  inventoryItem: {
    id: string;
    tracked: boolean;
    inventoryLevels: {
      nodes: Array<{ location: { id: string } }>;
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
  variants: { nodes: AdminVariant[] };
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
    nodes {
      id
      title
      price
      inventoryQuantity
      inventoryItem {
        id
        tracked
        inventoryLevels(first: 20) {
          nodes { location { id } }
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
  mutation MerchantInventorySetQuantity($input: InventorySetQuantitiesInput!) {
    inventorySetQuantities(input: $input) {
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
    })),
  };
}

function respondShopifyError(
  req: Request,
  res: Response,
  error: unknown,
  fallback: string,
) {
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
    input: {
      name: "available",
      reason: "correction",
      quantities: [
        {
          inventoryItemId: inventoryItem.id,
          locationId: location.id,
          quantity,
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
      if (
        (input.price !== undefined ||
          input.inventoryQuantity !== undefined) &&
        existing.product.variants.nodes.length !== 1
      ) {
        throw new ShopifyInputError(
          "Price and stock changes in this dashboard are for single-variant products. Edit this product's variants in Shopify.",
        );
      }
      if (
        input.inventoryQuantity !== undefined &&
        (existing.product.variants.nodes[0]?.inventoryItem
          ?.inventoryLevels.nodes.length ?? 0) > 1
      ) {
        throw new ShopifyInputError(
          "This product has stock at multiple locations. Update its stock in Shopify to keep each location accurate.",
        );
      }
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

      if (
        input.price !== undefined ||
        input.inventoryQuantity !== undefined
      ) {
        const variant = existing.product.variants.nodes[0];
        if (input.price !== undefined) {
          await setVariantPrice(productId, variant.id, input.price);
        }
        if (input.inventoryQuantity !== undefined) {
          await setVariantInventory(variant, input.inventoryQuantity);
        }
      }

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

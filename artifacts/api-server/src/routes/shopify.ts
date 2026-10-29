import { Router, type IRouter } from "express";
import {
  AddShopifyCartLineBody,
  GetShopifyCartQueryParams,
  UpdateShopifyCartLinesBody,
} from "@workspace/api-zod";
import { shopifyStorefrontRequest } from "../lib/shopifyStorefrontClient";
import { logger } from "../lib/logger";

type ShopifyImage = {
  url: string;
  altText: string | null;
};

type ShopifyVariant = {
  id: string;
  title: string;
  availableForSale: boolean;
  price: { amount: string; currencyCode: string };
  selectedOptions: Array<{ name: string; value: string }>;
};

type ShopifyProduct = {
  id: string;
  handle: string;
  title: string;
  description: string;
  productType: string;
  tags: string[];
  images: { nodes: ShopifyImage[] };
  variants: { nodes: ShopifyVariant[] };
};

type ShopifyProductsPage = {
  products: {
    nodes: ShopifyProduct[];
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  };
};

type ShopifyMoney = {
  amount: string;
  currencyCode: string;
};

type ShopifyCartMerchandise = {
  id: string;
  title: string;
  availableForSale: boolean;
  price: ShopifyMoney;
  selectedOptions: Array<{ name: string; value: string }>;
  product: {
    title: string;
    handle: string;
    description: string;
    tags: string[];
    featuredImage: ShopifyImage | null;
  };
};

type ShopifyCartNode = {
  id: string;
  checkoutUrl: string;
  totalQuantity: number;
  cost: { subtotalAmount: ShopifyMoney };
  lines: {
    nodes: Array<{
      id: string;
      quantity: number;
      merchandise: ShopifyCartMerchandise | null;
    }>;
  };
};

type ShopifyCartMutationResult = {
  cart: ShopifyCartNode | null;
  userErrors: Array<{ message: string }>;
};

type ShopifyVariantForCart = {
  id: string;
  availableForSale: boolean;
  product: { title: string; description: string; tags: string[] } | null;
};

type ShopifyCartApiResponse = {
  id: string;
  checkoutUrl: string | null;
  totalQuantity: number;
  subtotalAmount: string;
  currencyCode: string;
  lines: Array<{
    id: string;
    merchandiseId: string;
    productHandle: string;
    productTitle: string;
    variantTitle: string;
    quantity: number;
    unitPrice: string;
    currencyCode: string;
    availableForSale: boolean;
    isDemo: boolean;
    image: ShopifyImage | null;
  }>;
};

const SAREE_PRODUCTS_QUERY = `#graphql
  query SareeProducts($after: String) @inContext(country: IN) {
    products(first: 50, after: $after) {
      nodes {
        id
        handle
        title
        description
        productType
        tags
        images(first: 6) {
          nodes { url altText }
        }
        variants(first: 20) {
          nodes {
            id
            title
            availableForSale
            price { amount currencyCode }
            selectedOptions { name value }
          }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

const CART_FIELDS = `#graphql
  id
  checkoutUrl
  totalQuantity
  cost { subtotalAmount { amount currencyCode } }
  lines(first: 50) {
    nodes {
      id
      quantity
      merchandise {
        ... on ProductVariant {
          id
          title
          availableForSale
          price { amount currencyCode }
          selectedOptions { name value }
          product {
            title
            handle
            description
            tags
            featuredImage { url altText }
          }
        }
      }
    }
  }
`;

const SHOPIFY_CART_QUERY = `#graphql
  query ShopifyCart($cartId: ID!) @inContext(country: IN) {
    cart(id: $cartId) {
      ${CART_FIELDS}
    }
  }
`;

const SHOPIFY_CART_CREATE = `#graphql
  mutation CreateShopifyCart($variantId: ID!, $quantity: Int!) {
    cartCreate(input: {
      buyerIdentity: { countryCode: IN }
      lines: [{ merchandiseId: $variantId, quantity: $quantity }]
    }) {
      cart {
        ${CART_FIELDS}
      }
      userErrors { message }
    }
  }
`;

const SHOPIFY_CART_ADD_LINES = `#graphql
  mutation AddShopifyCartLines($cartId: ID!, $variantId: ID!, $quantity: Int!) {
    cartLinesAdd(
      cartId: $cartId
      lines: [{ merchandiseId: $variantId, quantity: $quantity }]
    ) {
      cart {
        ${CART_FIELDS}
      }
      userErrors { message }
    }
  }
`;

const SHOPIFY_CART_UPDATE_LINES = `#graphql
  mutation UpdateShopifyCartLines($cartId: ID!, $lines: [CartLineUpdateInput!]!) {
    cartLinesUpdate(cartId: $cartId, lines: $lines) {
      cart {
        ${CART_FIELDS}
      }
      userErrors { message }
    }
  }
`;

const SHOPIFY_VARIANT_FOR_CART = `#graphql
  query ShopifyVariantForCart($id: ID!) @inContext(country: IN) {
    node(id: $id) {
      ... on ProductVariant {
        id
        availableForSale
        product { title description tags }
      }
    }
  }
`;

const CATALOG_CACHE_TTL_MS = 60_000;
let cachedCatalog:
  | {
      products: ShopifyProduct[];
      totalProducts: number;
      truncated: boolean;
      expiresAt: number;
    }
  | undefined;

const isSaree = (product: ShopifyProduct) => {
  const searchable = [
    product.title,
    product.productType,
    ...product.tags,
  ].join(" ");
  return /\b(saree|sarees|sari|saris)\b/i.test(searchable);
};

const isDemoListing = (product: {
  title: string;
  description: string;
  tags: string[];
}) =>
  /\b(demo|sample|template)\b/i.test(
    [product.title, product.description, ...product.tags].join(" "),
  ) || /\[[^\]]+\]/.test(`${product.title} ${product.description}`);

function mapShopifyCart(cart: ShopifyCartNode): ShopifyCartApiResponse {
  const lines = cart.lines.nodes.map((line) => {
    const merchandise = line.merchandise;
    const product = merchandise?.product;
    const demo = !product || isDemoListing(product);
    return {
      id: line.id,
      merchandiseId: merchandise?.id ?? "",
      productHandle: product?.handle ?? "",
      productTitle: product?.title ?? "Unavailable product",
      variantTitle: merchandise?.title ?? "Unavailable option",
      quantity: line.quantity,
      unitPrice: merchandise?.price.amount ?? "0",
      currencyCode: merchandise?.price.currencyCode ?? cart.cost.subtotalAmount.currencyCode,
      availableForSale: merchandise?.availableForSale ?? false,
      isDemo: demo,
      image: product?.featuredImage ?? null,
    };
  });
  const checkoutAllowed = lines.length > 0 &&
    lines.every((line) => line.availableForSale && !line.isDemo);

  return {
    id: cart.id,
    checkoutUrl: checkoutAllowed ? cart.checkoutUrl : null,
    totalQuantity: cart.totalQuantity,
    subtotalAmount: cart.cost.subtotalAmount.amount,
    currencyCode: cart.cost.subtotalAmount.currencyCode,
    lines,
  };
}

async function getShopifyCart(cartId: string) {
  const result = await shopifyStorefrontRequest<{ cart: ShopifyCartNode | null }>(
    SHOPIFY_CART_QUERY,
    { cartId },
  );
  return result.cart;
}

async function validatePurchasableVariant(variantId: string) {
  const result = await shopifyStorefrontRequest<{
    node: ShopifyVariantForCart | null;
  }>(SHOPIFY_VARIANT_FOR_CART, { id: variantId });
  const variant = result.node;
  if (!variant || !("product" in variant) || !variant.product) {
    return { error: "That Shopify product option could not be found." };
  }
  if (isDemoListing(variant.product)) {
    return {
      error: "This listing is marked as demo content. Replace its Shopify title, description, tags, and photos before selling it.",
    };
  }
  if (!variant.availableForSale) {
    return { error: "This product option is currently unavailable." };
  }
  return { variant };
}

async function getSareeCatalog() {
  if (cachedCatalog && Date.now() < cachedCatalog.expiresAt) {
    return cachedCatalog;
  }

  const allProducts: ShopifyProduct[] = [];
  let after: string | null = null;
  let hasNextPage = true;
  const maxPages = 10;

  for (let page = 0; page < maxPages && hasNextPage; page += 1) {
    const result: ShopifyProductsPage = await shopifyStorefrontRequest<ShopifyProductsPage>(
      SAREE_PRODUCTS_QUERY,
      { after },
    );
    allProducts.push(...result.products.nodes);
    hasNextPage = result.products.pageInfo.hasNextPage;
    after = result.products.pageInfo.endCursor;
  }

  const catalog = {
    products: allProducts.filter(isSaree),
    totalProducts: allProducts.length,
    truncated: hasNextPage,
    expiresAt: Date.now() + CATALOG_CACHE_TTL_MS,
  };
  cachedCatalog = catalog;
  return catalog;
}

const router: IRouter = Router();

router.get("/shopify/products", async (_req, res) => {
  try {
    const catalog = await getSareeCatalog();
    res.setHeader("Cache-Control", "public, max-age=30, stale-while-revalidate=30");
    res.json({
      products: catalog.products.map((product) => ({
        id: product.id,
        handle: product.handle,
        title: product.title,
        description: product.description,
        productType: product.productType,
        tags: product.tags,
        images: product.images.nodes,
        variants: product.variants.nodes.map((variant) => ({
          id: variant.id,
          title: variant.title,
          availableForSale: variant.availableForSale,
          price: variant.price.amount,
          currencyCode: variant.price.currencyCode,
          selectedOptions: variant.selectedOptions,
        })),
      })),
      totalPublishedProducts: catalog.totalProducts,
      truncated: catalog.truncated,
    });
  } catch (error) {
    logger.error({ err: error }, "Shopify saree catalog could not be loaded");
    res.status(502).json({ error: "Shopify products are temporarily unavailable." });
  }
});

router.get("/shopify/cart", async (req, res): Promise<void> => {
  const params = GetShopifyCartQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: "A valid Shopify cart identifier is required." });
    return;
  }
  try {
    const cart = await getShopifyCart(params.data.cartId);
    if (!cart) {
      res.status(404).json({ error: "This Shopify cart has expired or could not be found." });
      return;
    }
    res.setHeader("Cache-Control", "no-store");
    res.json(mapShopifyCart(cart));
  } catch (error) {
    logger.error({ err: error }, "Shopify cart could not be loaded");
    res.status(502).json({ error: "Your Shopify bag could not be loaded. Please try again." });
  }
});

router.post("/shopify/cart", async (req, res): Promise<void> => {
  const body = AddShopifyCartLineBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Choose a valid product option and quantity." });
    return;
  }
  if (!/^gid:\/\/shopify\/ProductVariant\/\d+$/.test(body.data.merchandiseId)) {
    res.status(400).json({ error: "The Shopify product option is invalid." });
    return;
  }
  try {
    const purchasable = await validatePurchasableVariant(body.data.merchandiseId);
    if ("error" in purchasable) {
      res.status(400).json({ error: purchasable.error });
      return;
    }

    const result = body.data.cartId
      ? await shopifyStorefrontRequest<{ cartLinesAdd: ShopifyCartMutationResult }>(
          SHOPIFY_CART_ADD_LINES,
          {
            cartId: body.data.cartId,
            variantId: body.data.merchandiseId,
            quantity: body.data.quantity,
          },
        ).then((data) => data.cartLinesAdd)
      : await shopifyStorefrontRequest<{ cartCreate: ShopifyCartMutationResult }>(
          SHOPIFY_CART_CREATE,
          {
            variantId: body.data.merchandiseId,
            quantity: body.data.quantity,
          },
        ).then((data) => data.cartCreate);

    if (result.userErrors.length) {
      res.status(400).json({ error: result.userErrors[0].message });
      return;
    }
    if (!result.cart) {
      res.status(502).json({ error: "Shopify did not return an updated bag." });
      return;
    }
    res.setHeader("Cache-Control", "no-store");
    res.json(mapShopifyCart(result.cart));
  } catch (error) {
    logger.error({ err: error }, "Shopify cart line could not be added");
    res.status(502).json({ error: "This product could not be added to your Shopify bag. Please try again." });
  }
});

router.patch("/shopify/cart", async (req, res): Promise<void> => {
  const body = UpdateShopifyCartLinesBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Choose a valid Shopify bag and quantity." });
    return;
  }
  try {
    const result = await shopifyStorefrontRequest<{
      cartLinesUpdate: ShopifyCartMutationResult;
    }>(SHOPIFY_CART_UPDATE_LINES, {
      cartId: body.data.cartId,
      lines: body.data.lines,
    });
    if (result.cartLinesUpdate.userErrors.length) {
      res.status(400).json({ error: result.cartLinesUpdate.userErrors[0].message });
      return;
    }
    if (!result.cartLinesUpdate.cart) {
      res.status(404).json({ error: "This Shopify cart has expired or could not be found." });
      return;
    }
    res.setHeader("Cache-Control", "no-store");
    res.json(mapShopifyCart(result.cartLinesUpdate.cart));
  } catch (error) {
    logger.error({ err: error }, "Shopify cart quantities could not be updated");
    res.status(502).json({ error: "Your Shopify bag could not be updated. Please try again." });
  }
});

export default router;

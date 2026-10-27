import { Router, type IRouter } from "express";
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

const SAREE_PRODUCTS_QUERY = `#graphql
  query SareeProducts($after: String) {
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

export default router;

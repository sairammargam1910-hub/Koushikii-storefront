import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getGetShopifyProductsQueryKey,
  getShopifyProducts,
  type ShopifyProduct,
} from "@workspace/api-client-react";
import { base, Empty, Shell } from "./_shared";
import type { CatalogFilters } from "./_shared/catalog-filter";
import { normalizeRegion, regions } from "./_shared/catalog-filter";
import "./ShopifyCatalog.css";

export function useShopifyCatalog() {
  return useQuery({
    queryKey: getGetShopifyProductsQueryKey(),
    queryFn: ({ signal }) => getShopifyProducts({ signal }),
    staleTime: 60_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
}

export function getShopifyTagValue(product: ShopifyProduct, key: string) {
  const prefix = `${key.toLowerCase()}:`;
  const tag = product.tags.find((value) => value.toLowerCase().startsWith(prefix));
  return tag?.slice(prefix.length).trim() ?? "";
}

function normalizedTag(value: string) {
  return value.trim().toLowerCase().replace(/[\s_]+/g, "-");
}

function hasTag(product: ShopifyProduct, ...values: string[]) {
  const tags = product.tags.map(normalizedTag);
  return values.some((value) => tags.includes(normalizedTag(value)));
}

export function isDemoProduct(product: ShopifyProduct) {
  return /\b(demo|sample|template)\b/i.test(
    [product.title, product.description, ...product.tags].join(" "),
  ) || /\[[^\]]+\]/.test(`${product.title} ${product.description}`);
}

export function isNewArrival(product: ShopifyProduct) {
  return (
    hasTag(product, "new", "new-arrival", "just-arrived", "collection:new-arrival") ||
    normalizedTag(getShopifyTagValue(product, "collection")) === "new-arrival"
  );
}

export function isPremiumProduct(product: ShopifyProduct) {
  return (
    hasTag(product, "premium", "collection:premium") ||
    normalizedTag(getShopifyTagValue(product, "collection")) === "premium"
  );
}

export function filterShopifyProducts(
  products: ShopifyProduct[],
  filters: CatalogFilters,
) {
  const query = filters.query.trim().toLowerCase();
  const wantedWeave = filters.weave.toLowerCase();
  const wantedRegion = normalizeRegion(filters.region);

  return products
    .filter((product) => {
      const fabric = getShopifyTagValue(product, "fabric").toLowerCase();
      const weave = getShopifyTagValue(product, "weave").toLowerCase();
      const region = getShopifyTagValue(product, "region");
      const searchable = [
        product.title,
        product.description,
        product.productType,
        ...product.tags,
      ].join(" ").toLowerCase();

      if (query && !searchable.includes(query)) return false;
      if (filters.fabric !== "All fabrics" && fabric !== filters.fabric.toLowerCase()) return false;
      if (filters.weave !== "All weaves" && weave !== wantedWeave) return false;
      if (filters.region && (!regions[wantedRegion] || normalizeRegion(region) !== wantedRegion)) return false;
      if (filters.category === "Dupattas") return false;
      if (filters.edit === "premium" && !isPremiumProduct(product)) return false;
      if (filters.edit === "new" && !isNewArrival(product)) return false;
      return true;
    })
    .sort((a, b) => {
      if (filters.sort === "Price: low to high") return lowestPrice(a) - lowestPrice(b);
      if (filters.sort === "Price: high to low") return lowestPrice(b) - lowestPrice(a);
      return 0;
    });
}

function lowestPrice(product: ShopifyProduct) {
  const amounts = product.variants
    .map((variant) => Number(variant.price))
    .filter((price) => Number.isFinite(price) && price > 0);
  return amounts.length ? Math.min(...amounts) : Number.MAX_SAFE_INTEGER;
}

export function formatShopifyMoney(amount: string, currencyCode: string) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) return "";
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: currencyCode || "INR",
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${amount} ${currencyCode}`.trim();
  }
}

function productPrice(product: ShopifyProduct) {
  const variant = product.variants.find((item) => Number(item.price) > 0);
  return variant ? formatShopifyMoney(variant.price, variant.currencyCode) : "";
}

export function ShopifyProductCard({ product }: { product: ShopifyProduct }) {
  const image = product.images[0];
  const price = productPrice(product);
  const demo = isDemoProduct(product);
  const href = `${base}Product?shopify=${encodeURIComponent(product.handle)}`;

  return (
    <article
      className={`product-card shopify-product-card${demo ? " is-demo" : ""}`}
      data-testid={`card-shopify-${product.handle}`}
    >
      <a href={href} className="product-img shopify-product-img">
        {image ? (
          <img src={image.url} alt={image.altText || product.title} loading="lazy" />
        ) : (
          <span className="shopify-image-placeholder" role="img" aria-label="Product photo not added in Shopify">
            <span className="textile s1" />
            <span>Add product photos in Shopify</span>
          </span>
        )}
        <span className={`pill shopify-product-badge${demo ? " is-demo" : ""}`}>
          {demo ? "Demo only" : "Shopify"}
        </span>
      </a>
      <a href={href} className="shopify-product-title">
        <h3>{product.title}</h3>
      </a>
      <p>{product.productType || "Saree"}</p>
      <span className="price">
        {demo ? "Demo price · " : ""}
        {price || "Price to be confirmed"}
      </span>
      {demo && <small className="shopify-card-note">Not for sale · Replace demo details first</small>}
    </article>
  );
}

export function ShopifyProductGrid({ products }: { products: ShopifyProduct[] }) {
  return (
    <div className="products">
      {products.map((product) => (
        <ShopifyProductCard key={product.id} product={product} />
      ))}
    </div>
  );
}

export function ShopifyProductRoute({ handle }: { handle: string }) {
  const catalog = useShopifyCatalog();

  if (catalog.isLoading && !catalog.data) {
    return (
      <Shell>
        <main className="wrap content"><p role="status">Loading product from Shopify…</p></main>
      </Shell>
    );
  }

  if (catalog.isError && !catalog.data) {
    return (
      <Shell>
        <main className="wrap content">
          <Empty title="This Shopify product could not load." copy="Please try again shortly or return to the collection." />
        </main>
      </Shell>
    );
  }

  const product = catalog.data?.products.find((item) => item.handle === handle);
  if (!product) {
    return (
      <Shell>
        <main className="wrap content">
          <Empty title="This Shopify product is not published to this website." copy="Publish it to the Replit sales channel in Shopify to show it here." />
        </main>
      </Shell>
    );
  }

  return <ShopifyProductDetail key={product.handle} product={product} />;
}

function ShopifyProductDetail({ product }: { product: ShopifyProduct }) {
  const [imageIndex, setImageIndex] = useState(0);
  const [variantId, setVariantId] = useState(product.variants[0]?.id ?? "");
  const image = product.images[imageIndex];
  const variant = product.variants.find((item) => item.id === variantId) ?? product.variants[0];
  const price = variant ? formatShopifyMoney(variant.price, variant.currencyCode) : "";
  const demo = isDemoProduct(product);

  return (
    <Shell>
      <main className="wrap">
        <nav className="product-breadcrumb" aria-label="Breadcrumb">
          <a href={base}>Home</a><span>/</span><a href={`${base}Collections`}>Collections</a>
          <span>/</span><span aria-current="page">{product.title}</span>
        </nav>
        <div className="splitdetail shopify-product-detail" style={{ paddingTop: 0 }}>
          <section aria-label="Shopify product photos">
            <div className="gallery-main shopify-gallery-main">
              {image ? (
                <img src={image.url} alt={image.altText || product.title} />
              ) : (
                <div className="shopify-detail-placeholder">
                  <span className="textile s1" />
                  <span>Add product photos in Shopify to replace this placeholder.</span>
                </div>
              )}
              {demo && <span className="shopify-demo-badge">Demo listing · not for sale</span>}
            </div>
            {product.images.length > 1 && (
              <div className="thumbs shopify-thumbs" aria-label="Product photos">
                {product.images.map((item, index) => (
                  <button
                    key={`${item.url}-${index}`}
                    type="button"
                    aria-label={`Show product photo ${index + 1}`}
                    aria-pressed={imageIndex === index}
                    onClick={() => setImageIndex(index)}
                  >
                    <img src={item.url} alt={item.altText || `${product.title}, photo ${index + 1}`} />
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="detail">
            <span className="eyebrow">{product.productType || "Saree"} · Shopify listing</span>
            <h1>{product.title}</h1>
            <p>{product.description || "Product details will appear here after you add them in Shopify."}</p>
            {product.variants.length > 1 && (
              <label className="shopify-variant-select">
                Choose an option
                <select value={variant?.id ?? ""} onChange={(event) => setVariantId(event.target.value)}>
                  {product.variants.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.selectedOptions.length
                        ? item.selectedOptions.map((option) => `${option.name}: ${option.value}`).join(" · ")
                        : item.title}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <span className="price shopify-detail-price">
              {demo ? "Demo price · " : ""}
              {price || "Price to be confirmed"}
            </span>
            <div className={`product-sample shopify-product-notice${demo ? " is-demo" : ""}`}>
              {demo ? (
                <>
                  <strong>Demo only — not for sale</strong>
                  <br />
                  Replace placeholder text, photos, and price with verified product information before publishing for customers.
                </>
              ) : (
                <>
                  <strong>Live product details from Shopify</strong>
                  <br />
                  This preview does not process Shopify orders or payments yet.
                </>
              )}
            </div>
          </section>
        </div>
      </main>
    </Shell>
  );
}

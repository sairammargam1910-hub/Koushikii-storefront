import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getShopifyProducts, type ShopifyProduct } from "@workspace/api-client-react";
import { base, Shell, WhatsAppOrderLink } from "./_shared";
import "./ShopifyCatalog.css";

export function useShopifyCatalog() {
  return useQuery({
    queryKey: ["shopify", "published-sarees"],
    queryFn: getShopifyProducts,
    staleTime: 15_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
}

function priceLabel(product: ShopifyProduct, variantIndex = 0) {
  const variant = product.variants[variantIndex] ?? product.variants[0];
  if (!variant || variant.price === "0" || variant.price === "0.00") return "Price to be confirmed";

  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: variant.currencyCode,
    }).format(Number(variant.price));
  } catch {
    return `${variant.price} ${variant.currencyCode}`;
  }
}

function isDemoProduct(product: ShopifyProduct) {
  const content = `${product.title} ${product.description}`;
  return /\b(demo|sample|template)\b|\[[^\]]+\]/i.test(content)
    || product.tags.some((tag) => /\b(demo|sample|template)\b/i.test(tag));
}

function ShopifyProductCard({ product }: { product: ShopifyProduct }) {
  const image = product.images[0];
  const demo = isDemoProduct(product);
  const href = `${base}Product?shopify=${encodeURIComponent(product.handle)}`;

  return (
    <article className="product-card shopify-product-card" data-testid={`shopify-product-${product.handle}`}>
      <a className="product-img shopify-product-image" href={href} aria-label={`View ${product.title}`}>
        {image ? (
          <img src={image.url} alt={image.altText || product.title} loading="lazy" />
        ) : (
          <span className="shopify-image-fallback">Product image not added</span>
        )}
        <span className="shopify-live-badge">{demo ? "Demo listing" : "Live on Shopify"}</span>
      </a>
      <div className="shopify-product-card-copy">
        <span className="eyebrow">{product.productType || "Saree"}</span>
        <a href={href}><h3>{product.title}</h3></a>
        <div className="shopify-product-card-bottom">
          <span className="price">{demo ? `Demo price · ${priceLabel(product)}` : priceLabel(product)}</span>
          <span className="shopify-view-link">View details →</span>
        </div>
      </div>
    </article>
  );
}

export function ShopifyCatalogSection({
  title,
  copy,
  showEmpty = false,
}: {
  title: string;
  copy: string;
  showEmpty?: boolean;
}) {
  const catalog = useShopifyCatalog();
  const products = catalog.data?.products ?? [];

  if (!showEmpty && !catalog.isLoading && !catalog.isError && products.length === 0) return null;

  return (
    <section className="section shopify-live-section" aria-label="Published Shopify products">
      <div className="wrap">
        <div className="section-head">
          <div>
            <span className="eyebrow">Connected Shopify catalogue</span>
            <h2>{title}</h2>
            <p>{copy}</p>
          </div>
        </div>

        {catalog.isLoading ? (
          <p className="shopify-catalog-state" role="status">Loading published sarees…</p>
        ) : catalog.isError ? (
          <div className="shopify-catalog-state" role="alert">
            <p>Shopify products could not be loaded right now.</p>
            <button className="btn small outline" type="button" onClick={() => void catalog.refetch()}>Try again</button>
          </div>
        ) : products.length ? (
          <div className="products shopify-products">
            {products.map((product) => <ShopifyProductCard key={product.id} product={product} />)}
          </div>
        ) : (
          <p className="shopify-catalog-state">No sarees are published to Shopify yet. Draft products won’t appear here.</p>
        )}
      </div>
    </section>
  );
}

export function ShopifyProductDetail({ product }: { product: ShopifyProduct }) {
  const [activeImage, setActiveImage] = useState(0);
  const [variantId, setVariantId] = useState(product.variants[0]?.id ?? "");
  const image = product.images[activeImage] ?? product.images[0];
  const variant = product.variants.find((item) => item.id === variantId) ?? product.variants[0];
  const demo = isDemoProduct(product);

  useEffect(() => {
    setActiveImage(0);
    setVariantId(product.variants[0]?.id ?? "");
  }, [product.handle, product.variants]);

  const message = [
    "Namaste, I’d like to ask about this product from Chenetha by Koushikii:",
    product.title,
    variant && variant.title !== "Default Title" ? `Option: ${variant.title}` : "",
    "Please confirm the current details and availability.",
  ].filter(Boolean).join("\n");

  return (
    <Shell>
      <main className="wrap shopify-product-page">
        <nav className="product-breadcrumb" aria-label="Breadcrumb">
          <a href={base}>Home</a><span>/</span><a href={`${base}Collections`}>Collections</a><span>/</span>
          <span aria-current="page">{product.title}</span>
        </nav>

        <div className="splitdetail shopify-product-detail">
          <section aria-label="Product photographs">
            <div className="shopify-gallery-main">
              {image ? (
                <img src={image.url} alt={image.altText || product.title} />
              ) : (
                <span className="shopify-image-fallback">Product photographs haven’t been added yet.</span>
              )}
              <span className="shopify-live-badge">{demo ? "Demo listing" : "Live on Shopify"}</span>
            </div>
            {product.images.length > 1 && (
              <div className="shopify-gallery-thumbs" aria-label="Product photographs">
                {product.images.map((item, index) => (
                  <button
                    key={`${item.url}-${index}`}
                    type="button"
                    aria-label={`Show product photo ${index + 1}`}
                    aria-pressed={activeImage === index}
                    onClick={() => setActiveImage(index)}
                  >
                    <img src={item.url} alt="" loading="lazy" />
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="detail shopify-product-copy">
            <span className="eyebrow">{product.productType || "Saree"} · Shopify listing</span>
            <h1>{product.title}</h1>
            <p className="shopify-description">
              {product.description || "Product details haven’t been added in Shopify yet."}
            </p>
            {demo && (
              <div className="shopify-demo-warning" role="note">
                This Shopify product still contains demo or placeholder details. Replace them with verified product information before selling.
              </div>
            )}

            {product.variants.length > 1 && (
              <label className="field shopify-variant-select">
                Choose an option
                <select value={variantId} onChange={(event) => setVariantId(event.target.value)}>
                  {product.variants.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title}{item.availableForSale ? "" : " · Currently unavailable"}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <div className="shopify-detail-price">
              <span className="price">{demo ? "Demo price · " : ""}{priceLabel(product, product.variants.findIndex((item) => item.id === variant?.id))}</span>
              {variant && <span className={demo ? "shopify-availability unavailable" : variant.availableForSale ? "shopify-availability" : "shopify-availability unavailable"}>
                {demo ? "Verify before sale" : variant.availableForSale ? "Available on Shopify" : "Availability to be confirmed"}
              </span>}
            </div>

            <WhatsAppOrderLink className="btn shopify-enquiry-button" message={message}>
              Ask about this saree
            </WhatsAppOrderLink>
            <p className="muted shopify-checkout-note">
              This app doesn’t place Shopify orders yet. Use this enquiry to confirm product details and availability.
            </p>
          </section>
        </div>
      </main>
    </Shell>
  );
}

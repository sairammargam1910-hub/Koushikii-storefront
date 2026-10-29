import { useState } from "react";
import { Heart } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addShopifyCartLine,
  getGetShopifyCartQueryKey,
  getGetShopifyProductsQueryKey,
  getShopifyCart,
  getShopifyProducts,
  type ShopifyCartAddInput,
  type ShopifyCartResponse,
  type ShopifyProduct,
  updateShopifyCartLines,
} from "@workspace/api-client-react";
import { base, cottonWeaves, Empty, Qty, Shell, useStore } from "./_shared";
import { useShopperPreferences } from "./ShopperPreferences";
import type { CatalogFilters } from "./_shared/catalog-filter";
import { normalizeRegion, normalizeWeave, regions } from "./_shared/catalog-filter";
import {
  readShopifyCartMeta,
  saveShopifyCartMeta,
} from "./shopifyCartState";
import "./ShopifyCatalog.css";

export function useShopifyCatalog(enabled = true) {
  return useQuery({
    queryKey: getGetShopifyProductsQueryKey(),
    queryFn: ({ signal }) => getShopifyProducts({ signal }),
    staleTime: 60_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    enabled,
  });
}

export function useShopifyCart(cartId?: string) {
  return useQuery({
    queryKey: cartId
      ? getGetShopifyCartQueryKey({ cartId })
      : ["/api/shopify/cart", "empty"],
    queryFn: ({ signal }) => {
      if (!cartId) throw new Error("No Shopify cart is selected.");
      return getShopifyCart({ cartId }, { signal });
    },
    enabled: Boolean(cartId),
    staleTime: 0,
    refetchOnMount: "always",
  });
}

export function updateShopifyCartCache(
  queryClient: ReturnType<typeof useQueryClient>,
  cart: ShopifyCartResponse,
) {
  saveShopifyCartMeta({ id: cart.id, totalQuantity: cart.totalQuantity });
  queryClient.setQueryData(getGetShopifyCartQueryKey({ cartId: cart.id }), cart);
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
  const wantedWeave = normalizeWeave(filters.weave).toLowerCase();
  const wantedRegion = normalizeRegion(filters.region);

  return products
    .filter((product) => {
      const fabric = normalizedTag(getShopifyTagValue(product, "fabric"));
      const weave = normalizeWeave(getShopifyTagValue(product, "weave")).toLowerCase();
      const region = getShopifyTagValue(product, "region");
      const searchable = [
        product.title,
        product.description,
        product.productType,
        fabric,
        weave,
        ...product.tags,
      ].join(" ").toLowerCase();

      if (query && !searchable.includes(query)) return false;
      if (filters.fabric !== "All fabrics" && fabric !== normalizedTag(filters.fabric)) return false;
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

export function isShopifyVariantPurchasable(variant: ShopifyProduct["variants"][number] | undefined) {
  return Boolean(
    variant &&
    variant.availableForSale &&
    variant.id.startsWith("gid://shopify/ProductVariant/") &&
    Number.isFinite(Number(variant.price)) &&
    Number(variant.price) > 0,
  );
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
  const wishlist = useStore("kq-wish");
  const { toggleWishlist, loading, error } = useShopperPreferences();
  const [wishlistError, setWishlistError] = useState(false);
  const saved = wishlist.some((item) => item.id === product.id);

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
      <button
        className="heart"
        type="button"
        disabled={loading || Boolean(error)}
        data-testid={`button-wishlist-shopify-${product.handle}`}
        aria-label={saved ? "Remove from wishlist" : "Add to wishlist"}
        aria-pressed={saved}
        onClick={() => {
          setWishlistError(false);
          void toggleWishlist(product.id).catch(() => setWishlistError(true));
        }}
      >
        <Heart size={16} fill={saved ? "var(--red)" : "none"} />
      </button>
      <a href={href} className="shopify-product-title">
        <h3>{product.title}</h3>
      </a>
      <p>{product.productType || "Saree"}</p>
      <span className="price">
        {demo ? "Demo price · " : ""}
        {price || "Price to be confirmed"}
      </span>
      {demo && <small className="shopify-card-note">Not for sale · Replace demo details first</small>}
      {wishlistError && <small role="alert">Wishlist could not be saved. Please try again.</small>}
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
          <p style={{ textAlign: "center" }}>
            <button className="btn outline" type="button" onClick={() => catalog.refetch()}>Try again</button>
          </p>
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
  const [quantity, setQuantity] = useState(1);
  const [cartMessage, setCartMessage] = useState("");
  const [cartError, setCartError] = useState("");
  const queryClient = useQueryClient();
  const image = product.images[imageIndex];
  const variant = product.variants.find((item) => item.id === variantId) ?? product.variants[0];
  const price = variant ? formatShopifyMoney(variant.price, variant.currencyCode) : "";
  const demo = isDemoProduct(product);
  const addToCart = useMutation({
    mutationFn: ({ merchandiseId, quantity: lineQuantity }: { merchandiseId: string; quantity: number }) => {
      const input: ShopifyCartAddInput = {
        cartId: readShopifyCartMeta()?.id,
        merchandiseId,
        quantity: lineQuantity,
      };
      return addShopifyCartLine(input);
    },
    onSuccess: (cart) => {
      updateShopifyCartCache(queryClient, cart);
      setCartError("");
      setCartMessage("Added to your Shopify bag.");
    },
    onError: (error) => {
      const data = error && typeof error === "object" && "data" in error
        ? (error as { data?: { error?: string } }).data
        : undefined;
      setCartError(data?.error || "This product could not be added. Please try again.");
      setCartMessage("");
    },
  });
  const purchasable = !demo && isShopifyVariantPurchasable(variant);
  const canPurchase = purchasable;
  const variantLabel = (item: ShopifyProduct["variants"][number]) =>
    item.selectedOptions.length
      ? item.selectedOptions.map((option) => `${option.name}: ${option.value}`).join(" · ")
      : item.title;

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
            {product.variants.length > 0 && (
              <label className="shopify-variant-select">
                {product.variants.length > 1 ? "Choose an option" : "Selected option"}
                <select value={variant?.id ?? ""} onChange={(event) => setVariantId(event.target.value)}>
                  {product.variants.map((item) => (
                    <option key={item.id} value={item.id} disabled={!isShopifyVariantPurchasable(item)}>
                      {variantLabel(item)}{!item.availableForSale ? " · Unavailable" : ""}
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
                  This Shopify listing contains demo wording. Replace the description, photos, and price with verified product details before adding it to a cart.
                </>
              ) : (
                <>
                  <strong>{purchasable ? "Live product details from Shopify" : "This option is not available to purchase"}</strong>
                  <br />
                  {purchasable
                    ? "Your selected Shopify variant and current price will be checked again before checkout."
                    : "Choose an available option. Availability and price come from the current Shopify catalog."}
                  <br />
                  Shipping and payment are completed securely on Shopify.
                </>
              )}
            </div>
            <div className="shopify-buy-controls">
              <label className="shopify-quantity-label">
                Quantity
                <Qty value={quantity} onChange={setQuantity} />
              </label>
              <button
                className="btn"
                type="button"
                data-testid="button-add-shopify-to-cart"
                disabled={!canPurchase || addToCart.isPending}
                onClick={() => {
                  if (variant && canPurchase) {
                    setCartMessage("");
                    setCartError("");
                    addToCart.mutate({ merchandiseId: variant.id, quantity });
                  }
                }}
              >
                {demo
                  ? "Demo listing · not for sale"
                  : !variant?.availableForSale
                    ? "Currently unavailable"
                    : addToCart.isPending
                      ? "Adding to bag…"
                      : `Add to bag${price ? ` · ${formatShopifyMoney(String(Number(variant?.price || 0) * quantity), variant?.currencyCode || "INR")}` : ""}`}
              </button>
              {cartMessage && (
                <p className="shopify-cart-feedback" role="status">
                  {cartMessage} <a href={`${base}Cart`}>View bag →</a>
                </p>
              )}
              {cartError && <p className="shopify-cart-feedback is-error" role="alert">{cartError}</p>}
              {!variant?.availableForSale && !demo && (
                <p className="muted">This option is currently out of stock in Shopify.</p>
              )}
            </div>
          </section>
        </div>
      </main>
    </Shell>
  );
}

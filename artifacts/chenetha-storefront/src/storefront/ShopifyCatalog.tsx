import { useState } from "react";
import { useLocation } from "wouter";
import { Heart } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  addShopifyCartLine,
  getGetShopifyCartQueryKey,
  getShopifyCart,
  type ShopifyCartAddInput,
  type ShopifyCartResponse,
  type ShopifyProduct,
  updateShopifyCartLines,
} from "@workspace/api-client-react";
import { base, Empty, Qty, Shell, useStore } from "./_shared";
import { useShopperPreferences } from "./ShopperPreferences";
import { customerFacingMessage } from "./customerFacingMessage";
import type { CatalogFilters } from "./_shared/catalog-filter";
import { normalizeRegion } from "./_shared/catalog-filter";
import { getAvailableShopifyCollections, getShopifyAttribute, getShopifyAttributeValues, getShopifyTagValue } from "./shopifyCatalogData";
import { useShopifyCatalog } from "./shopifyCatalogQuery";
export { getAvailableShopifyCollections, getShopifyAttribute, getShopifyTagValue } from "./shopifyCatalogData";
export { useShopifyCatalog } from "./shopifyCatalogQuery";
import {
  readShopifyCartMeta,
  saveShopifyCartMeta,
} from "./shopifyCartState";
import "./ShopifyCatalog.css";

export { useShopifyCart } from "./shopifyCartState";

export function updateShopifyCartCache(
  queryClient: ReturnType<typeof useQueryClient>,
  cart: ShopifyCartResponse,
) {
  saveShopifyCartMeta({ id: cart.id, totalQuantity: cart.totalQuantity });
  queryClient.setQueryData(getGetShopifyCartQueryKey({ cartId: cart.id }), cart);
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
    hasTag(product, "premium", "premium-product", "premium-products", "collection:premium") ||
    normalizedTag(getShopifyTagValue(product, "collection")) === "premium" ||
    (product.collections ?? []).some((collection) =>
      collection.handle.trim().toLowerCase() === "premium-collection" ||
      collection.title.trim().toLowerCase() === "premium collection",
    )
  );
}

export function getPremiumCollections(products: ShopifyProduct[]) {
  const collections = new Map<string, {
    title: string;
    premiumProducts: ShopifyProduct[];
  }>();

  function addProduct(title: string, product: ShopifyProduct) {
    const cleanedTitle = title.trim();
    const normalizedTitle = normalizedTag(cleanedTitle);
    if (!normalizedTitle || normalizedTitle === "premium-collection") return;
    const existing = collections.get(normalizedTitle);
    if (existing) {
      if (!existing.premiumProducts.some((item) => item.id === product.id)) {
        existing.premiumProducts.push(product);
      }
    } else {
      collections.set(normalizedTitle, { title: cleanedTitle, premiumProducts: [product] });
    }
  }

  for (const product of products) {
    if (!isPremiumProduct(product)) continue;
    for (const collection of product.collections ?? []) {
      if (
        !collection.handle ||
        collection.handle === "frontpage" ||
        collection.handle.trim().toLowerCase() === "premium-collection" ||
        collection.title.trim().toLowerCase() === "premium collection"
      ) continue;
      addProduct(collection.title, product);
    }
    for (const tradition of getShopifyAttributeValues(product, "regionalHandloom")) {
      addProduct(tradition, product);
    }
  }

  return [...collections.values()].sort((a, b) => a.title.localeCompare(b.title));
}

export function isInPremiumCategory(product: ShopifyProduct, category: string) {
  const normalizedCategory = normalizedTag(category);
  if (!normalizedCategory) return true;
  return (
    (product.collections ?? []).some((collection) =>
      normalizedTag(collection.title) === normalizedCategory ||
      normalizedTag(collection.handle) === normalizedCategory,
    ) ||
    getShopifyAttributeValues(product, "regionalHandloom")
      .some((tradition) => normalizedTag(tradition) === normalizedCategory)
  );
}

export function filterShopifyProducts(
  products: ShopifyProduct[],
  filters: CatalogFilters,
) {
  const query = filters.query.trim().toLowerCase();
  const selectedFabrics = filters.fabrics;
  const selectedRegional = filters.regionalHandlooms.map((value) => value.trim().toLowerCase());
  const selectedWeaves = filters.weaves.map((value) => value.trim().toLowerCase());
  const selectedProductTypes = filters.productTypes.map((value) => value.trim().toLowerCase());
  const selectedRegions = filters.regions.map(normalizeRegion);
  const selectedColours = filters.colours.map((value) => value.trim().toLowerCase());
  const minPrice = filters.minPrice ? Number(filters.minPrice) : null;
  const maxPrice = filters.maxPrice ? Number(filters.maxPrice) : null;

  return products
    .filter((product) => {
      const fabrics = getShopifyAttributeValues(product, "fabric");
      const regionalHandlooms = getShopifyAttributeValues(product, "regionalHandloom");
      const weaves = getShopifyAttributeValues(product, "weave");
      const regions = getShopifyAttributeValues(product, "region");
      const colours = getShopifyAttributeValues(product, "colour");
      const variantPrices = product.variants
        .map((variant) => Number(variant.price))
        .filter((price) => Number.isFinite(price) && price >= 0);
      const price = variantPrices.length ? Math.min(...variantPrices) : null;
      const searchable = [
        product.title,
        product.description,
        product.productType,
        ...fabrics,
        ...regionalHandlooms,
        ...weaves,
        ...regions,
        ...colours,
        ...(product.collections ?? []).map((collection) => collection.title),
        ...product.tags,
      ].join(" ").toLowerCase();

      if (query && !searchable.includes(query)) return false;
      if (selectedFabrics.length && !selectedFabrics.some((selected) =>
        fabrics.some((value) => normalizedTag(value) === normalizedTag(selected)),
      )) return false;
      if (selectedRegional.length && !regionalHandlooms.some((value) => selectedRegional.includes(value.toLowerCase()))) return false;
      if (selectedWeaves.length && !weaves.some((value) => selectedWeaves.includes(value.toLowerCase()))) return false;
      if (selectedProductTypes.length && !selectedProductTypes.includes(product.productType.trim().toLowerCase())) return false;
      if (selectedRegions.length && !regions.some((value) => selectedRegions.includes(normalizeRegion(value)))) return false;
      if (selectedColours.length && !colours.some((value) => selectedColours.includes(value.trim().toLowerCase()))) return false;
      if (minPrice !== null && (!Number.isFinite(minPrice) || price === null || price < minPrice)) return false;
      if (maxPrice !== null && (!Number.isFinite(maxPrice) || price === null || price > maxPrice)) return false;
      if (filters.collection && !(product.collections ?? []).some((collection) => collection.handle === filters.collection)) return false;
      return true;
    })
    .sort((a, b) => {
      if (filters.sort === "Price: Low to High") return lowestPrice(a) - lowestPrice(b);
      if (filters.sort === "Price: High to Low") return lowestPrice(b) - lowestPrice(a);
      if (filters.sort === "Newest") return Date.parse(b.createdAt ?? "") - Date.parse(a.createdAt ?? "");
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

export function isDefaultShopifyVariantTitle(title: string | null | undefined) {
  return !title || /^(?:default(?:\s+title)?)$/i.test(title.trim());
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
  const available = product.variants.some(isShopifyVariantPurchasable);
  const href = `${base}Product?product=${encodeURIComponent(product.handle)}`;
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
          <span className="shopify-image-placeholder" role="img" aria-label="Product photo not available">
            <span className="textile s1" />
            <span>Product photo not available</span>
          </span>
        )}
        <span className={`pill shopify-product-badge${demo ? " is-demo" : ""}`}>
          {demo ? "Demo only" : available ? "Available" : "Currently unavailable"}
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
      {demo && <small className="shopify-card-note">Not for sale · Sample details</small>}
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
        <main className="wrap content"><p role="status">Loading product details…</p></main>
      </Shell>
    );
  }

  if (catalog.isError && !catalog.data) {
    return (
      <Shell>
        <main className="wrap content">
          <Empty title="Product details could not be loaded." copy="Please try again shortly or return to the collection." />
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
          <Empty title="This product is not available here." copy="It may have been removed or is not currently listed. Please return to the collection." />
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
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const image = product.images[imageIndex];
  const variant = product.variants.find((item) => item.id === variantId) ?? product.variants[0];
  const price = variant ? formatShopifyMoney(variant.price, variant.currencyCode) : "";
  const demo = isDemoProduct(product);
  const hasVariantChoice = product.variants.length > 1 ||
    (product.variants.length === 1 && !isDefaultShopifyVariantTitle(product.variants[0].title));
  const addToCart = useMutation({
    mutationFn: ({ merchandiseId, quantity: lineQuantity }: { merchandiseId: string; quantity: number; intent?: "add" | "buy_now" }) => {
      const input: ShopifyCartAddInput = {
        cartId: readShopifyCartMeta()?.id,
        merchandiseId,
        quantity: lineQuantity,
      };
      return addShopifyCartLine(input);
    },
    onSuccess: (cart, variables) => {
      updateShopifyCartCache(queryClient, cart);
      setCartError("");
      setCartMessage("Added to your bag.");
      if (variables.intent === "buy_now") setLocation("/Checkout");
    },
    onError: (error) => {
      const data = error && typeof error === "object" && "data" in error
        ? (error as { data?: { error?: string } }).data
        : undefined;
      setCartError(customerFacingMessage(data?.error, "This product could not be added. Please try again."));
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
          <section aria-label="Product photos">
            <div className="gallery-main shopify-gallery-main">
              {image ? (
                <img
                  src={image.url}
                  alt={image.altText || product.title}
                />
              ) : (
                <div className="shopify-detail-placeholder">
                  <span className="textile s1" />
                  <span>Product photos are not available yet.</span>
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
            <span className="eyebrow">{product.productType || "Saree"}</span>
            <h1>{product.title}</h1>
            <p>{product.description || "More details about this piece will be added soon."}</p>
            {product.variants.length > 0 && hasVariantChoice && (
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
                  This sample listing contains illustrative details and cannot be purchased.
                </>
              ) : (
                <>
                  <strong>{purchasable ? "Current product details" : "This option is not available to purchase"}</strong>
                  <br />
                  {purchasable
                    ? "Your selected option and current price will be checked again before checkout."
                    : "Choose an available option. Availability and price are checked again at checkout."}
                  <br />
                  Delivery charges are quoted at checkout. Payment is completed securely on a hosted payment page.
                </>
              )}
            </div>
            <div className="shopify-buy-controls">
              <label className="shopify-quantity-label">
                Quantity
                <Qty value={quantity} onChange={setQuantity} />
              </label>
              <div className="shopify-buy-actions">
                <button
                  className="btn"
                  type="button"
                  data-testid="button-add-shopify-to-cart"
                  disabled={!canPurchase || addToCart.isPending}
                  onClick={() => {
                    if (variant && canPurchase) {
                      setCartMessage("");
                      setCartError("");
                      addToCart.mutate({ merchandiseId: variant.id, quantity, intent: "add" });
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
                <button
                  className="btn shopify-buy-now"
                  type="button"
                  data-testid="button-buy-shopify-now"
                  disabled={!canPurchase || addToCart.isPending}
                  onClick={() => {
                    if (variant && canPurchase) {
                      setCartMessage("");
                      setCartError("");
                      addToCart.mutate({ merchandiseId: variant.id, quantity, intent: "buy_now" });
                    }
                  }}
                >
                  {addToCart.isPending ? "Preparing checkout…" : "Buy now"}
                </button>
              </div>
              {cartMessage && (
                <p className="shopify-cart-feedback" role="status">
                  {cartMessage} <a href={`${base}Cart`}>View bag →</a>
                </p>
              )}
              {cartError && <p className="shopify-cart-feedback is-error" role="alert">{customerFacingMessage(cartError, "This product could not be added. Please try again.")}</p>}
              {!variant?.availableForSale && !demo && (
                <p className="muted">This option is currently out of stock.</p>
              )}
            </div>
          </section>
        </div>
      </main>
    </Shell>
  );
}

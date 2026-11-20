import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { ChevronLeft, ChevronRight, Heart, ZoomIn, X } from "lucide-react";
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
import { getAvailableShopifyCollections, getShopifyAttribute, getShopifyAttributeValues, getShopifyTagValue, isCustomerNavigationValue, matchesShopifyNavigationSelection } from "./shopifyCatalogData";
import {
  getShopifyProductRecommendations,
  getShopifyProductSummary,
  isSareeProductType,
} from "./shopifyProductRecommendations";
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
    if (!normalizedTitle || normalizedTitle === "premium-collection" || !isCustomerNavigationValue(cleanedTitle)) return;
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
      if (!matchesShopifyNavigationSelection(product, {
        fabrics: selectedFabrics,
        regionalHandlooms: selectedRegional,
        weaves: selectedWeaves,
      })) return false;
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
  const outOfStock = !demo &&
    product.variants.length > 0 &&
    product.variants.every((variant) => !variant.availableForSale);
  const href = `${base}Product/${encodeURIComponent(product.handle)}`;
  const wishlist = useStore("kq-wish");
  const { toggleWishlist, loading, error } = useShopperPreferences();
  const [wishlistError, setWishlistError] = useState(false);
  const saved = wishlist.some((item) => item.id === product.id);

  return (
    <article
      className={`product-card shopify-product-card${demo ? " is-demo" : ""}`}
      data-testid={`card-shopify-${product.handle}`}
    >
      <Link href={href} className="shopify-card-link" aria-label={`View ${product.title}`}>
        <div className="product-img shopify-product-img">
          {image ? (
            <img src={image.url} alt={image.altText || product.title} loading="lazy" />
          ) : (
            <span className="shopify-image-placeholder" role="img" aria-label="Product photo not available">
              <span className="textile s1" />
              <span>Product photo not available</span>
            </span>
          )}
          {outOfStock && (
            <span className="shopify-oos-overlay" role="status">
              <span>Out of stock</span>
            </span>
          )}
          {(!outOfStock || demo) && (
            <span className={`pill shopify-product-badge${demo ? " is-demo" : ""}`}>
              {demo ? "Demo only" : available ? "Available" : "Currently unavailable"}
            </span>
          )}
        </div>
        <div className="shopify-product-title"><h3>{product.title}</h3></div>
        <p>{product.productType || "Saree"}</p>
        <span className="price">
          {demo ? "Demo price · " : ""}
          {price || "Price to be confirmed"}
        </span>
        {demo && <small className="shopify-card-note">Not for sale · Sample details</small>}
      </Link>
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

  return (
    <ShopifyProductDetail
      key={product.handle}
      product={product}
      catalogProducts={catalog.data?.products ?? []}
    />
  );
}

function ShopifyProductDetail({ product, catalogProducts }: {
  product: ShopifyProduct;
  catalogProducts: ShopifyProduct[];
}) {
  const [imageIndex, setImageIndex] = useState(0);
  const [variantId, setVariantId] = useState(
    product.variants.find(isShopifyVariantPurchasable)?.id ?? product.variants[0]?.id ?? "",
  );
  const [quantity, setQuantity] = useState(1);
  const [cartMessage, setCartMessage] = useState("");
  const [cartError, setCartError] = useState("");
  const [zoomOpen, setZoomOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const zoomTriggerRef = useRef<HTMLButtonElement>(null);
  const zoomCloseRef = useRef<HTMLButtonElement>(null);
  const zoomDialogRef = useRef<HTMLElement>(null);
  const wishlist = useStore("kq-wish");
  const { toggleWishlist, loading: wishlistLoading, error: wishlistErrorFromHook } = useShopperPreferences();
  const [wishlistError, setWishlistError] = useState(false);
  const saved = wishlist.some((item) => item.id === product.id);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const image = product.images[imageIndex];
  const variant = product.variants.find((item) => item.id === variantId) ?? product.variants[0];
  const price = variant ? formatShopifyMoney(variant.price, variant.currencyCode) : "";
  const recommendations = useMemo(
    () => getShopifyProductRecommendations(product, catalogProducts),
    [product, catalogProducts],
  );
  const productSummary = getShopifyProductSummary(product.description) ||
    "More details about this piece will be added soon.";
  const blouseAvailability = product.attributes?.blouseAvailability;
  const blouseAvailabilityText = blouseAvailability === "included"
    ? "Blouse Piece Included"
    : blouseAvailability === "not_included"
      ? "Blouse Piece Not Included"
      : "";
  const clean = (value?: string | null) => value?.trim() ?? "";
  const productDetailRows = [
    ["Material", clean(product.attributes?.fabric)],
    ["Fabric composition", clean(product.productDetails?.fabricComposition)],
    ["Weave / craft technique", clean(product.attributes?.craftTechnique)],
    ["Regional handloom / tradition", clean(product.attributes?.regionalHandloom)],
    ["Region of origin", clean(product.attributes?.region)],
    ["Blouse availability", isSareeProductType(product.productType) ? blouseAvailabilityText : ""],
    ["Saree length", clean(product.productDetails?.sareeLength)],
    ["Blouse-piece length", clean(product.productDetails?.blousePieceLength)],
    ["Border details", clean(product.productDetails?.borderDetails)],
    ["Design / pattern", clean(product.productDetails?.designPattern)],
    ["Colour", clean(product.attributes?.colour)],
    ["Wash and care", clean(product.productDetails?.washCareInstructions)],
    ["Additional information", clean(product.productDetails?.additionalInformation)],
  ].filter(([, value]) => value);
  const attributeRows = [
    ["Fabric", clean(product.attributes?.fabric)],
    ["Weave / print", clean(product.attributes?.craftTechnique)],
    ["Regional tradition", clean(product.attributes?.regionalHandloom)],
    ["Region", clean(product.attributes?.region)],
    ["Colour", clean(product.attributes?.colour)],
  ].filter(([, value]) => value);
  const collection = product.collections?.find((item) => item.handle && item.handle !== "frontpage");
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
      if (variables.intent === "buy_now") setLocation("/Cart");
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
  const moveImage = (direction: number) => {
    if (product.images.length > 1) {
      setImageIndex((current) => (current + direction + product.images.length) % product.images.length);
    }
  };
  useEffect(() => {
    if (!zoomOpen) return;
    zoomCloseRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setZoomOpen(false);
      if (event.key === "ArrowLeft") moveImage(-1);
      if (event.key === "ArrowRight") moveImage(1);
      if (event.key === "Tab" && zoomDialogRef.current) {
        const focusable = [...zoomDialogRef.current.querySelectorAll<HTMLElement>("button:not([disabled])")];
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      zoomTriggerRef.current?.focus();
    };
  }, [zoomOpen, product.images.length]);
  const handleWishlist = async () => {
    setWishlistError(false);
    try {
      await toggleWishlist(product.id);
    } catch {
      setWishlistError(true);
    }
  };

  return (
    <Shell>
      <main className="wrap">
        <nav className="product-breadcrumb" aria-label="Breadcrumb">
          <a href={base}>Home</a><span>/</span><a href={`${base}Collections`}>{collection?.title || "Collections"}</a>
          <span>/</span><span aria-current="page">{product.title}</span>
        </nav>
        <div className="splitdetail shopify-product-detail" style={{ paddingTop: 0 }}>
          <section aria-label="Product photos" className="shopify-gallery">
            {product.images.length > 1 && (
              <div className="thumbs shopify-thumbs" aria-label="Choose product photo">
                {product.images.map((item, index) => (
                  <button key={`${item.url}-${index}`} type="button"
                    aria-label={`Show product photo ${index + 1} of ${product.images.length}`}
                    aria-pressed={imageIndex === index} onClick={() => setImageIndex(index)}>
                    <img src={item.url} alt="" />
                  </button>
                ))}
              </div>
            )}
            <div className="gallery-main shopify-gallery-main"
              onTouchStart={(event) => { touchStartX.current = event.touches[0]?.clientX ?? null; }}
              onTouchEnd={(event) => {
                if (touchStartX.current === null) return;
                const delta = event.changedTouches[0]?.clientX - touchStartX.current;
                if (Math.abs(delta) > 40) moveImage(delta < 0 ? 1 : -1);
                touchStartX.current = null;
              }}>
              {image ? (
                <button ref={zoomTriggerRef} type="button" className="shopify-zoom-trigger" onClick={() => setZoomOpen(true)}
                  aria-label={`Enlarge product photo ${imageIndex + 1} of ${product.images.length}`}>
                  <img src={image.url} alt={image.altText || product.title} />
                  <span className="shopify-zoom-hint"><ZoomIn size={15}/> View detail</span>
                </button>
              ) : (
                <div className="shopify-detail-placeholder">
                  <span className="textile s1" />
                  <span>Product photos are not available yet.</span>
                </div>
              )}
              {demo && <span className="shopify-demo-badge">Demo listing · not for sale</span>}
              {product.images.length > 1 && <>
                <button type="button" className="shopify-gallery-arrow is-prev" onClick={() => moveImage(-1)} aria-label="Previous product photo"><ChevronLeft size={20}/></button>
                <button type="button" className="shopify-gallery-arrow is-next" onClick={() => moveImage(1)} aria-label="Next product photo"><ChevronRight size={20}/></button>
                <span className="shopify-gallery-count" aria-live="polite">{imageIndex + 1} / {product.images.length}</span>
              </>}
            </div>
          </section>

          <section className="detail">
            <span className="eyebrow">{collection?.title || product.productType || "Handloom"}</span>
            <h1>{product.title}</h1>
            <div className="shopify-product-summary" data-testid="text-product-summary">
              <h2>About the product</h2>
              <p>{productSummary}</p>
            </div>
            {attributeRows.length > 0 && <dl className="shopify-attribute-strip" aria-label="Textile attributes">
              {attributeRows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
            </dl>}
            <span className="price shopify-detail-price">
              {demo ? "Demo price · " : ""}
              {price || "Price to be confirmed"}
            </span>
            <p className="shopify-availability" data-testid="text-product-availability">
              <span className={`shopify-availability-dot${canPurchase ? " is-available" : ""}`} aria-hidden="true"/>
              {demo ? "Demo listing · not for sale" : canPurchase ? "Available to add to your bag" : "Currently unavailable"}
            </p>
            {isSareeProductType(product.productType) && blouseAvailabilityText && (
              <div className="shopify-blouse-availability" data-testid="text-blouse-availability">
                <span className="eyebrow">Blouse piece</span>
                <strong>{blouseAvailabilityText}</strong>
              </div>
            )}
            {productDetailRows.length > 0 && <section className={`shopify-details-block${detailOpen ? " is-open" : ""}`} data-testid="section-product-details">
              <button className="shopify-details-toggle" type="button" aria-expanded={detailOpen}
                aria-controls="shopify-details-content" onClick={() => setDetailOpen((open) => !open)}>
                <span><small>THE TEXTILE</small><strong>Piece details</strong></span>
                <span aria-hidden="true">{detailOpen ? "−" : "+"}</span>
              </button>
              <div id="shopify-details-content" className="shopify-details-content">
                <dl>
                  {productDetailRows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
                </dl>
              </div>
            </section>}
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
                  className={`btn shopify-wishlist-button${saved ? " is-saved" : ""}`}
                  type="button"
                  data-testid="button-wishlist-shopify-detail"
                  disabled={wishlistLoading || Boolean(wishlistErrorFromHook)}
                  aria-label={saved ? "Remove from wishlist" : "Add to wishlist"}
                  aria-pressed={saved}
                  onClick={() => void handleWishlist()}
                >
                  <Heart size={17} fill={saved ? "currentColor" : "none"}/>
                  {saved ? "Saved to wishlist" : "Add to wishlist"}
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
                  {addToCart.isPending ? "Adding to your bag…" : "Buy now"}
                </button>
              </div>
              {cartMessage && (
                <p className="shopify-cart-feedback" role="status">
                  {cartMessage} <a href={`${base}Cart`}>View bag →</a>
                </p>
              )}
              {cartError && <p className="shopify-cart-feedback is-error" role="alert">{customerFacingMessage(cartError, "This product could not be added. Please try again.")}</p>}
              {wishlistError && <p className="shopify-cart-feedback is-error" role="alert">Wishlist could not be saved. Please try again.</p>}
              {!variant?.availableForSale && !demo && (
                <p className="muted">This option is currently out of stock.</p>
              )}
            </div>
            {!demo && (
              <p className="shopify-checkout-note" data-testid="text-checkout-note">
                Price and availability are confirmed before payment; delivery is quoted at checkout.
              </p>
            )}
          </section>
        </div>
        {recommendations.length > 0 && (
          <section
            className="shopify-related-section"
            aria-labelledby="shopify-related-title"
            data-testid="section-related-products"
          >
            <header className="shopify-related-heading">
              <span className="eyebrow">Thoughtfully chosen</span>
              <h2 id="shopify-related-title">You May Also Like</h2>
            </header>
            <ShopifyProductGrid products={recommendations} />
          </section>
        )}
      </main>
      {zoomOpen && image && <div className="shopify-zoom-backdrop" role="presentation" onMouseDown={(event) => {
        if (event.target === event.currentTarget) setZoomOpen(false);
      }}>
        <section ref={zoomDialogRef} className="shopify-zoom-dialog" role="dialog" aria-modal="true" aria-label="Product photo enlarged">
          <button ref={zoomCloseRef} type="button" className="shopify-zoom-close" onClick={() => setZoomOpen(false)} aria-label="Close enlarged photo"><X size={21}/></button>
          {product.images.length > 1 && <>
            <button type="button" className="shopify-gallery-arrow is-prev" onClick={() => moveImage(-1)} aria-label="Previous product photo"><ChevronLeft size={22}/></button>
            <button type="button" className="shopify-gallery-arrow is-next" onClick={() => moveImage(1)} aria-label="Next product photo"><ChevronRight size={22}/></button>
          </>}
          <img src={image.url} alt={image.altText || product.title}/>
          <p aria-live="polite">{image.altText || product.title}{product.images.length > 1 ? ` · ${imageIndex + 1} of ${product.images.length}` : ""}</p>
        </section>
      </div>}
    </Shell>
  );
}

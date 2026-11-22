import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";
import { Link, useLocation } from "wouter";
import { ArrowRight, BadgeCheck, ChevronLeft, ChevronRight, Heart, LockKeyhole, Plus, RotateCcw, ZoomIn, ZoomOut, X } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  addShopifyCartLine,
  getGetShopifyCartQueryKey,
  getShopifyCart,
  type ShopifyCartAddInput,
  type ShopifyCartResponse,
  type ShopifyProduct,
  useGetStorefrontSettings,
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
  useShopifyCart,
  useShopifyCartMeta,
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

function getShopifyImageSrc(source: string, width: number) {
  try {
    const imageUrl = new URL(source);
    if (imageUrl.protocol !== "https:" || imageUrl.hostname !== "cdn.shopify.com") return source;
    imageUrl.searchParams.set("width", String(width));
    return imageUrl.toString();
  } catch {
    return source;
  }
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
  const returnSettings = useGetStorefrontSettings();
  const cartMeta = useShopifyCartMeta();
  const currentCart = useShopifyCart(cartMeta?.id);
  const [imageIndex, setImageIndex] = useState(0);
  const [variantId, setVariantId] = useState(
    product.variants.find(isShopifyVariantPurchasable)?.id ?? product.variants[0]?.id ?? "",
  );
  const [quantity, setQuantity] = useState(1);
  const [cartMessage, setCartMessage] = useState("");
  const [cartError, setCartError] = useState("");
  const [zoomOpen, setZoomOpen] = useState(false);
  const [zoomScale, setZoomScale] = useState(1);
  const [zoomOffset, setZoomOffset] = useState({ x: 0, y: 0 });
  const [zoomImageFitSize, setZoomImageFitSize] = useState<{ width: number; height: number } | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const zoomScaleRef = useRef(zoomScale);
  zoomScaleRef.current = zoomScale;
  const touchStartX = useRef<number | null>(null);
  const zoomTriggerRef = useRef<HTMLButtonElement>(null);
  const zoomReturnFocusRef = useRef<HTMLButtonElement | null>(null);
  const zoomCloseRef = useRef<HTMLButtonElement>(null);
  const zoomDialogRef = useRef<HTMLElement>(null);
  const zoomImageViewportRef = useRef<HTMLDivElement>(null);
  const zoomImageRef = useRef<HTMLImageElement>(null);
  const zoomTouchStartRef = useRef<{ pointerId: number; x: number; y: number; startedAt: number } | null>(null);
  const zoomLastTapRef = useRef<{ x: number; y: number; at: number } | null>(null);
  const zoomTouchDoubleTapAtRef = useRef(Number.NEGATIVE_INFINITY);
  const zoomDragRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null);
  const zoomPointersRef = useRef(new Map<number, { x: number; y: number }>());
  const zoomPinchRef = useRef<{
    startDistance: number;
    startScale: number;
    startOffset: { x: number; y: number };
    startCenter: { x: number; y: number };
  } | null>(null);
  const detailsTriggerRef = useRef<HTMLButtonElement>(null);
  const detailsCloseRef = useRef<HTMLButtonElement>(null);
  const detailsDialogRef = useRef<HTMLElement>(null);
  const wishlist = useStore("kq-wish");
  const { toggleWishlist, loading: wishlistLoading, error: wishlistErrorFromHook } = useShopperPreferences();
  const [wishlistError, setWishlistError] = useState(false);
  const saved = wishlist.some((item) => item.id === product.id);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const image = product.images[imageIndex];
  const variant = product.variants.find((item) => item.id === variantId) ?? product.variants[0];
  const currentVariantCartQuantity = currentCart.data?.lines?.find((line) => line.merchandiseId === variant?.id)?.quantity ?? 0;
  const isCheckingCurrentCart = Boolean(cartMeta?.id && currentCart.isLoading);
  const quantityAvailableToAdd = variant?.quantityAvailable != null
    ? Math.max(0, variant.quantityAvailable - currentVariantCartQuantity)
    : undefined;
  const quantityControlMax = quantityAvailableToAdd == null ? undefined : Math.max(1, quantityAvailableToAdd);
  const canAddRequestedQuantity = quantityAvailableToAdd == null ||
    (quantityAvailableToAdd > 0 && quantity <= quantityAvailableToAdd);
  const productStockLabel = variant?.quantityAvailable == null
    ? null
    : variant.quantityAvailable > 0
      ? `${variant.quantityAvailable} ${variant.quantityAvailable === 1 ? "piece" : "pieces"} in stock.`
      : "Out of stock.";
  const bagStockLabel = currentVariantCartQuantity > 0
    ? `${currentVariantCartQuantity} ${currentVariantCartQuantity === 1 ? "piece" : "pieces"} already in your bag; ${
        quantityAvailableToAdd != null && quantityAvailableToAdd > 0
          ? `${quantityAvailableToAdd} more can be added.`
          : "no additional quantity can be added."
      }`
    : "";
  const productStockNote = productStockLabel
    ? `${productStockLabel}${bagStockLabel ? ` ${bagStockLabel}` : ""}`
    : null;
  const price = variant ? formatShopifyMoney(variant.price, variant.currencyCode) : "";
  const recommendations = useMemo(
    () => getShopifyProductRecommendations(product, catalogProducts),
    [product, catalogProducts],
  );
  const productSummary = getShopifyProductSummary(product.description) ||
    "More details about this piece will be added soon.";
  const colourValues = getShopifyAttributeValues(product, "colour");
  const blouseAvailability = product.attributes?.blouseAvailability;
  const blouseAvailabilityText = blouseAvailability === "included"
    ? "Blouse Piece Included"
    : blouseAvailability === "not_included"
      ? "Blouse Piece Not Included"
      : "";
  const returnDays = returnSettings.data?.returnWindowDays;
  const returnLabel = returnDays == null
    ? "Return terms"
    : returnDays === 0
      ? "No returns"
      : returnDays === 1
        ? "1-day return"
        : `${returnDays}-day returns`;
  const clean = (value?: string | null) => value?.trim() ?? "";
  const sareeLength = clean(product.productDetails?.sareeLength);
  const blousePieceLength = clean(product.productDetails?.blousePieceLength);
  const combinedLength = [
    sareeLength,
    blousePieceLength ? `blouse piece: ${blousePieceLength}` : "",
  ].filter(Boolean).join(" · ");
  const productDetailRows = [
    ["Material", clean(product.attributes?.fabric)],
    ["Blouse", isSareeProductType(product.productType) ? blouseAvailabilityText : ""],
    ["Length of saree", combinedLength],
    ["Wash & Care", clean(product.productDetails?.washCareInstructions)],
    ["Note", clean(product.productDetails?.additionalInformation)],
  ].filter(([, value]) => value);
  const attributeRows = [
    ["Fabric", clean(product.attributes?.fabric)],
    ["Weave / print", clean(product.attributes?.craftTechnique)],
    ["Regional tradition", clean(product.attributes?.regionalHandloom)],
    ["Region", clean(product.attributes?.region)],
    ["Colour", colourValues.join(", ")],
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
      zoomScaleRef.current = 1;
      setZoomScale(1);
      setZoomOffset({ x: 0, y: 0 });
      setZoomImageFitSize(null);
      zoomTouchStartRef.current = null;
      zoomLastTapRef.current = null;
    }
  };
  const openZoomViewer = (trigger: HTMLButtonElement, nextImageIndex = imageIndex) => {
    zoomReturnFocusRef.current = trigger;
    setImageIndex(nextImageIndex);
    zoomScaleRef.current = 1;
    setZoomScale(1);
    setZoomOffset({ x: 0, y: 0 });
    setZoomImageFitSize(null);
    zoomTouchStartRef.current = null;
    zoomLastTapRef.current = null;
    setZoomOpen(true);
  };
  const clampZoomOffset = (offset: { x: number; y: number }, scale: number) => {
    const viewport = zoomImageViewportRef.current;
    const photo = zoomImageRef.current;
    if (!viewport || !photo?.naturalWidth || !photo.naturalHeight) return offset;
    const fittedScale = Math.min(
      viewport.clientWidth / photo.naturalWidth,
      viewport.clientHeight / photo.naturalHeight,
    );
    const fittedWidth = photo.naturalWidth * fittedScale;
    const fittedHeight = photo.naturalHeight * fittedScale;
    const maxX = Math.max(0, (fittedWidth * scale - viewport.clientWidth) / 2);
    const maxY = Math.max(0, (fittedHeight * scale - viewport.clientHeight) / 2);
    return {
      x: Math.max(-maxX, Math.min(maxX, offset.x)),
      y: Math.max(-maxY, Math.min(maxY, offset.y)),
    };
  };
  const setZoom = (nextScale: number) => {
    const next = Math.max(1, Math.min(4, Math.round(nextScale * 100) / 100));
    zoomScaleRef.current = next;
    setZoomScale(next);
    setZoomOffset((current) => next === 1 ? { x: 0, y: 0 } : clampZoomOffset(current, next));
  };
  const setZoomAt = (nextScale: number, clientX: number, clientY: number) => {
    const viewport = zoomImageViewportRef.current;
    const previousScale = zoomScaleRef.current;
    const next = Math.max(1, Math.min(4, Math.round(nextScale * 100) / 100));
    if (!viewport || next === previousScale) return;
    const rect = viewport.getBoundingClientRect();
    const ratio = next / previousScale;
    const anchorX = clientX - rect.left - rect.width / 2;
    const anchorY = clientY - rect.top - rect.height / 2;
    const nextOffset = {
      x: anchorX + (zoomOffset.x - anchorX) * ratio,
      y: anchorY + (zoomOffset.y - anchorY) * ratio,
    };
    zoomScaleRef.current = next;
    setZoomScale(next);
    setZoomOffset(clampZoomOffset(nextOffset, next));
  };
  const fitZoomImageToViewport = () => {
    const viewport = zoomImageViewportRef.current;
    const photo = zoomImageRef.current;
    if (!viewport || !photo?.naturalWidth || !photo.naturalHeight) return;
    const scale = Math.min(
      viewport.clientWidth / photo.naturalWidth,
      viewport.clientHeight / photo.naturalHeight,
    );
    setZoomImageFitSize({
      width: Math.max(1, photo.naturalWidth * scale),
      height: Math.max(1, photo.naturalHeight * scale),
    });
  };
  const handleZoomWheel = (event: ReactWheelEvent<HTMLElement>) => {
    event.preventDefault();
    setZoomAt(zoomScaleRef.current + (event.deltaY < 0 ? 0.2 : -0.2), event.clientX, event.clientY);
  };
  const handleZoomPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch") {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      if (zoomPointersRef.current.size === 0) {
        zoomTouchStartRef.current = {
          pointerId: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          startedAt: performance.now(),
        };
      } else {
        zoomTouchStartRef.current = null;
        zoomLastTapRef.current = null;
      }
      zoomPointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (zoomPointersRef.current.size === 2) {
        const [first, second] = [...zoomPointersRef.current.values()];
        zoomPinchRef.current = {
          startDistance: Math.hypot(second.x - first.x, second.y - first.y),
          startScale: zoomScaleRef.current,
          startOffset: zoomOffset,
          startCenter: { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 },
        };
        zoomDragRef.current = null;
      } else if (zoomScaleRef.current > 1) {
        zoomDragRef.current = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          originX: zoomOffset.x,
          originY: zoomOffset.y,
        };
      }
      return;
    }
    if (zoomScaleRef.current <= 1 || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    zoomDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: zoomOffset.x,
      originY: zoomOffset.y,
    };
  };
  const handleZoomPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch" && zoomPointersRef.current.has(event.pointerId)) {
      zoomPointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      const pinch = zoomPinchRef.current;
      if (pinch && zoomPointersRef.current.size >= 2) {
        const [first, second] = [...zoomPointersRef.current.values()];
        const distance = Math.max(1, Math.hypot(second.x - first.x, second.y - first.y));
        const nextScale = Math.max(1, Math.min(4, pinch.startScale * distance / Math.max(1, pinch.startDistance)));
        const rect = zoomImageViewportRef.current?.getBoundingClientRect();
        if (!rect) return;
        const centerX = (first.x + second.x) / 2 - rect.left - rect.width / 2;
        const centerY = (first.y + second.y) / 2 - rect.top - rect.height / 2;
        const startX = pinch.startCenter.x - rect.left - rect.width / 2;
        const startY = pinch.startCenter.y - rect.top - rect.height / 2;
        const nextOffset = {
          x: centerX - ((startX - pinch.startOffset.x) / pinch.startScale) * nextScale,
          y: centerY - ((startY - pinch.startOffset.y) / pinch.startScale) * nextScale,
        };
        zoomScaleRef.current = nextScale;
        setZoomScale(nextScale);
        setZoomOffset(clampZoomOffset(nextOffset, nextScale));
        return;
      }
    }
    const drag = zoomDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setZoomOffset(clampZoomOffset({
      x: drag.originX + event.clientX - drag.startX,
      y: drag.originY + event.clientY - drag.startY,
    }, zoomScaleRef.current));
  };
  const stopZoomPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch") {
      const activePointers = zoomPointersRef.current.size;
      const wasPinching = activePointers > 1 || Boolean(zoomPinchRef.current);
      const touchStart = zoomTouchStartRef.current?.pointerId === event.pointerId
        ? zoomTouchStartRef.current
        : null;
      if (event.type === "pointerup" && touchStart && !wasPinching && activePointers === 1) {
        const deltaX = event.clientX - touchStart.x;
        const deltaY = event.clientY - touchStart.y;
        const movedHorizontally = Math.abs(deltaX) >= 40 && Math.abs(deltaX) > Math.abs(deltaY);
        if (zoomScaleRef.current <= 1 && movedHorizontally) {
          moveImage(deltaX < 0 ? 1 : -1);
          zoomLastTapRef.current = null;
        } else if (
          Math.hypot(deltaX, deltaY) <= 12 &&
          performance.now() - touchStart.startedAt <= 400
        ) {
          const now = performance.now();
          const previousTap = zoomLastTapRef.current;
          if (
            previousTap &&
            now - previousTap.at <= 350 &&
            Math.hypot(event.clientX - previousTap.x, event.clientY - previousTap.y) <= 32
          ) {
            zoomLastTapRef.current = null;
            zoomTouchDoubleTapAtRef.current = now;
            setZoomAt(zoomScaleRef.current > 1 ? 1 : 2, event.clientX, event.clientY);
          } else {
            zoomLastTapRef.current = { x: event.clientX, y: event.clientY, at: now };
          }
        } else {
          zoomLastTapRef.current = null;
        }
      } else if (wasPinching || event.type === "pointercancel") {
        zoomLastTapRef.current = null;
      }
      if (zoomTouchStartRef.current?.pointerId === event.pointerId) {
        zoomTouchStartRef.current = null;
      }
      zoomPointersRef.current.delete(event.pointerId);
      if (zoomPointersRef.current.size < 2) zoomPinchRef.current = null;
      const remaining = zoomPointersRef.current.entries().next().value as [number, { x: number; y: number }] | undefined;
      if (remaining && zoomScaleRef.current > 1) {
        zoomDragRef.current = {
          pointerId: remaining[0],
          startX: remaining[1].x,
          startY: remaining[1].y,
          originX: zoomOffset.x,
          originY: zoomOffset.y,
        };
      } else {
        zoomDragRef.current = null;
      }
    }
    if (zoomDragRef.current?.pointerId === event.pointerId) zoomDragRef.current = null;
  };
  useEffect(() => {
    if (!zoomOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    zoomCloseRef.current?.focus();
    const viewport = zoomImageViewportRef.current;
    const resizeObserver = viewport ? new ResizeObserver(fitZoomImageToViewport) : null;
    if (viewport && resizeObserver) resizeObserver.observe(viewport);
    fitZoomImageToViewport();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setZoomOpen(false);
      const isZoomSlider = event.target instanceof HTMLInputElement && event.target.type === "range";
      if (!isZoomSlider && event.key === "ArrowLeft") moveImage(-1);
      if (!isZoomSlider && event.key === "ArrowRight") moveImage(1);
      if (event.key === "+" || event.key === "=") setZoom(zoomScaleRef.current + 0.25);
      if (event.key === "-") setZoom(zoomScaleRef.current - 0.25);
      if (event.key === "0") setZoom(1);
      if (event.key === "Tab" && zoomDialogRef.current) {
        const focusable = [...zoomDialogRef.current.querySelectorAll<HTMLElement>(
          "button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])",
        )];
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
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      resizeObserver?.disconnect();
      zoomPointersRef.current.clear();
      zoomPinchRef.current = null;
      zoomDragRef.current = null;
      zoomTouchStartRef.current = null;
      zoomLastTapRef.current = null;
      (zoomReturnFocusRef.current ?? zoomTriggerRef.current)?.focus();
    };
  }, [zoomOpen, product.images.length]);
  useEffect(() => {
    if (!detailOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    detailsCloseRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDetailOpen(false);
        return;
      }
      if (event.key !== "Tab" || !detailsDialogRef.current) return;
      const focusable = [...detailsDialogRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), a[href]")];
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
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      detailsTriggerRef.current?.focus();
    };
  }, [detailOpen]);
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
          <section aria-label="Product photos" className={`shopify-gallery${product.images.length <= 1 ? " is-single-image" : ""}`}>
            {product.images.length > 1 && (
              <div className="thumbs shopify-thumbs" aria-label="Choose product photo">
                {product.images.map((item, index) => (
                  <button key={`${item.url}-${index}`} type="button"
                    aria-label={`Show product photo ${index + 1} of ${product.images.length}`}
                    aria-pressed={imageIndex === index} onClick={(event) => openZoomViewer(event.currentTarget, index)}>
                    <img src={getShopifyImageSrc(item.url, 180)} alt="" loading="lazy" decoding="async" />
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
                <button ref={zoomTriggerRef} type="button" className="shopify-zoom-trigger" onClick={(event) => openZoomViewer(event.currentTarget)}
                  aria-label={`Enlarge product photo ${imageIndex + 1} of ${product.images.length}`}>
                  <img className="shopify-zoom-image" src={getShopifyImageSrc(image.url, 1200)} alt={image.altText || product.title} fetchPriority="high" decoding="async" />
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
              {attributeRows.map(([label, value]) => <div key={label}>
                <dt>{label}</dt>
                {label === "Colour"
                  ? <dd><ul className="shopify-colour-values">{colourValues.map((colour) => <li key={colour}>{colour}</li>)}</ul></dd>
                  : <dd>{value}</dd>}
              </div>)}
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
            <button
              ref={detailsTriggerRef}
              className="shopify-details-trigger"
              type="button"
              aria-haspopup="dialog"
              aria-expanded={detailOpen}
              aria-controls="shopify-product-details-drawer"
              data-testid="button-open-product-details"
              onClick={() => setDetailOpen(true)}
            >
              <span>View product details</span><ArrowRight size={16} aria-hidden="true"/>
            </button>
            {isSareeProductType(product.productType) && (
              <p className="shopify-stitching-contact" data-testid="text-blouse-stitching-contact">
                <a href="https://wa.me/917382714119">for blouse stitching reach us at 7382714119</a>
              </p>
            )}
            {product.variants.length > 0 && hasVariantChoice && (
              <label className="shopify-variant-select">
                {product.variants.length > 1 ? "Choose an option" : "Selected option"}
                <select value={variant?.id ?? ""} onChange={(event) => {
                  setVariantId(event.target.value);
                  setQuantity(1);
                }}>
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
                <Qty value={quantity} max={quantityControlMax} disabled={!canPurchase || isCheckingCurrentCart} onChange={setQuantity} />
                {isCheckingCurrentCart
                  ? <span className="shopify-stock-note" role="status">
                      {productStockLabel ? `${productStockLabel} Checking your current bag…` : "Checking your current bag…"}
                    </span>
                  : productStockNote && (
                    <span className="shopify-stock-note" data-testid="text-available-quantity">
                      {productStockNote}
                    </span>
                  )}
              </label>
              <div className="shopify-buy-actions">
                <button
                  className="btn"
                  type="button"
                  data-testid="button-add-shopify-to-cart"
                  disabled={!canPurchase || addToCart.isPending || isCheckingCurrentCart || !canAddRequestedQuantity}
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
                        : !canAddRequestedQuantity
                          ? "Available quantity is in your bag"
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
                  disabled={!canPurchase || addToCart.isPending || isCheckingCurrentCart || !canAddRequestedQuantity}
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
            <section className="shopify-trust-banner" aria-label="Store promises" data-testid="banner-product-trust">
              <div className="shopify-trust-item" data-testid="text-trust-return-window">
                <RotateCcw size={27} aria-hidden="true"/>
                <strong>{returnLabel}</strong>
              </div>
              <div className="shopify-trust-item">
                <BadgeCheck size={27} aria-hidden="true"/>
                <strong>Quality checked</strong>
              </div>
              <div className="shopify-trust-item">
                <LockKeyhole size={27} aria-hidden="true"/>
                <strong>Secure payments</strong>
              </div>
            </section>
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
      {detailOpen && <div className="shopify-details-backdrop" role="presentation" onMouseDown={(event) => {
        if (event.target === event.currentTarget) setDetailOpen(false);
      }}>
        <aside
          ref={detailsDialogRef}
          id="shopify-product-details-drawer"
          className="shopify-details-drawer"
          role="dialog"
          aria-modal="true"
          aria-labelledby="shopify-product-details-title"
          data-testid="dialog-product-details"
        >
          <button
            ref={detailsCloseRef}
            type="button"
            className="shopify-details-close"
            aria-label="Close product details"
            onClick={() => setDetailOpen(false)}
          >
            <X size={20}/>
          </button>
          <div className="shopify-details-drawer-header">
            <h2 id="shopify-product-details-title">{product.title}</h2>
            {variant?.sku?.trim() && <p className="shopify-details-sku">SKU · {variant.sku.trim()}</p>}
          </div>
          <p className="eyebrow shopify-details-section-label">PRODUCT DETAILS</p>
          {collection && <section className="shopify-details-collection" aria-label="Product collection">
            <span>This product is from the collection</span>
            <strong>{collection.title}</strong>
            {collection.description?.trim() && <p>{getShopifyProductSummary(collection.description)}</p>}
            <a href={`${base}Collections?collection=${encodeURIComponent(collection.handle)}`}>
              View the collection <ArrowRight size={14} aria-hidden="true"/>
            </a>
          </section>}
          {productDetailRows.length > 0
            ? <ul className="shopify-details-list">
                {productDetailRows.map(([label, value]) => (
                  <li key={label}><strong>{label}:</strong> {value}</li>
                ))}
              </ul>
            : <p className="shopify-details-empty">Product-specific specifications have not been added yet.</p>}
        </aside>
      </div>}
      {zoomOpen && image && <div className="shopify-zoom-backdrop" role="presentation" onMouseDown={(event) => {
        if (event.target === event.currentTarget) setZoomOpen(false);
      }}>
        <section ref={zoomDialogRef} className="shopify-zoom-dialog" role="dialog" aria-modal="true" aria-label="Product photo enlarged">
          <button ref={zoomCloseRef} type="button" className="shopify-zoom-close" onClick={() => setZoomOpen(false)} aria-label="Close enlarged photo"><X size={21}/></button>
          {product.images.length > 1 && <>
            <button type="button" className="shopify-gallery-arrow is-prev" onClick={() => moveImage(-1)} aria-label="Previous product photo"><ChevronLeft size={22}/></button>
            <button type="button" className="shopify-gallery-arrow is-next" onClick={() => moveImage(1)} aria-label="Next product photo"><ChevronRight size={22}/></button>
            <span className="shopify-zoom-counter" data-testid="product-image-zoom-count" aria-live="polite">{imageIndex + 1} / {product.images.length}</span>
          </>}
          <div
            ref={zoomImageViewportRef}
            className={`shopify-zoom-viewport${zoomScale > 1 ? " is-zoomed" : ""}`}
            onWheel={handleZoomWheel}
            onPointerDown={handleZoomPointerDown}
            onPointerMove={handleZoomPointerMove}
            onPointerUp={stopZoomPointer}
            onPointerCancel={stopZoomPointer}
            onDoubleClick={(event) => {
              if (performance.now() - zoomTouchDoubleTapAtRef.current < 500) return;
              setZoomAt(zoomScaleRef.current > 1 ? 1 : 2, event.clientX, event.clientY);
            }}
          >
            <img
              ref={zoomImageRef}
              key={image.url}
              src={image.url}
              alt={image.altText || product.title}
              draggable={false}
              loading="eager"
              fetchPriority="high"
              decoding="async"
              onLoad={fitZoomImageToViewport}
              style={{
                width: zoomImageFitSize?.width ?? 0,
                height: zoomImageFitSize?.height ?? 0,
                transform: `translate3d(${zoomOffset.x}px, ${zoomOffset.y}px, 0) scale(${zoomScale})`,
              }}
            />
          </div>
          <div className="shopify-zoom-controls" role="group" aria-label="Image zoom controls">
            <div className="shopify-zoom-buttons">
              <button type="button" onClick={() => setZoom(zoomScale - 0.25)} disabled={zoomScale <= 1} aria-label="Zoom out"><ZoomOut size={19}/></button>
              <output data-testid="product-image-zoom-level" aria-live="polite">{Math.round(zoomScale * 100)}%</output>
              <button type="button" onClick={() => setZoom(zoomScale + 0.25)} disabled={zoomScale >= 4} aria-label="Zoom in"><Plus size={19}/></button>
              <button type="button" onClick={() => setZoom(1)} disabled={zoomScale === 1} aria-label="Reset zoom"><RotateCcw size={17}/></button>
            </div>
            <input
              className="shopify-zoom-slider"
              data-testid="product-image-zoom-slider"
              type="range"
              min="1"
              max="4"
              step="0.05"
              value={zoomScale}
              aria-label="Zoom level"
              aria-valuetext={`${Math.round(zoomScale * 100)}%`}
              onChange={(event) => setZoom(Number(event.currentTarget.value))}
            />
          </div>
          <p aria-live="polite">{image.altText || product.title}{product.images.length > 1 ? ` · ${imageIndex + 1} of ${product.images.length}` : ""} · Use the controls, pinch or scroll; double-click to zoom and drag to pan.</p>
        </section>
      </div>}
    </Shell>
  );
}

import { useEffect, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { getGetShopifyCartQueryKey, getShopifyCart } from "@workspace/api-client-react";

const STORAGE_KEY = "kq-shopify-cart";
const STORAGE_EVENT = "kq-storage";

export type ShopifyCartMeta = {
  id: string;
  totalQuantity: number;
};

export function readShopifyCartMeta(): ShopifyCartMeta | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (
      value &&
      typeof value === "object" &&
      "id" in value &&
      typeof value.id === "string" &&
      "totalQuantity" in value &&
      typeof value.totalQuantity === "number"
    ) {
      return { id: value.id, totalQuantity: value.totalQuantity };
    }
  } catch {
    // A malformed local cart should not prevent browsing.
  }
  return null;
}

export function saveShopifyCartMeta(cart: ShopifyCartMeta) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
  } catch {
    // Shopify remains the source of truth; a full browser storage area can be recovered by re-adding items.
  }
  window.dispatchEvent(new Event(STORAGE_EVENT));
}

export function clearShopifyCartMeta() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore browser storage failures.
  }
  window.dispatchEvent(new Event(STORAGE_EVENT));
}

export function useShopifyCartMeta() {
  return useSyncExternalStore(subscribe, cartSnapshot, () => null);
}

let cachedRaw: string | null | undefined;
let cachedMeta: ShopifyCartMeta | null = null;
function cartSnapshot() {
  let raw: string | null = null;
  try { raw = localStorage.getItem(STORAGE_KEY); } catch { /* Storage can be disabled. */ }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedMeta = readShopifyCartMeta();
  }
  return cachedMeta;
}

function subscribe(sync: () => void) {
    window.addEventListener("storage", sync);
    window.addEventListener(STORAGE_EVENT, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(STORAGE_EVENT, sync);
    };
}

export function useShopifyCart(cartId?: string) {
  const query = useQuery({
    queryKey: cartId ? getGetShopifyCartQueryKey({ cartId }) : ["/api/shopify/cart", "empty"],
    queryFn: ({ signal }) => {
      if (!cartId) throw new Error("No Shopify cart is selected.");
      return getShopifyCart({ cartId }, { signal });
    },
    enabled: Boolean(cartId),
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
  useEffect(() => {
    if (!query.data) return;
    const current = readShopifyCartMeta();
    // Do not restore an old response after a clear or a switch to another cart.
    if (current?.id === query.data.id && current.totalQuantity !== query.data.totalQuantity) {
      saveShopifyCartMeta({ id: query.data.id, totalQuantity: query.data.totalQuantity });
    }
  }, [query.data]);
  return query;
}

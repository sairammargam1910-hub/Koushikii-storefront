import { useEffect, useState } from "react";

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
  const [cart, setCart] = useState<ShopifyCartMeta | null>(readShopifyCartMeta);
  useEffect(() => {
    const sync = () => setCart(readShopifyCartMeta());
    window.addEventListener("storage", sync);
    window.addEventListener(STORAGE_EVENT, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(STORAGE_EVENT, sync);
    };
  }, []);
  return cart;
}

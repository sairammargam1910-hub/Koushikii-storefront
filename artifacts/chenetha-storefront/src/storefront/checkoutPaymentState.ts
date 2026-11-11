import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetShopifyCheckoutPaymentStatusQueryKey,
  getGetShopifyCartQueryKey,
  useGetShopifyCheckoutPaymentStatus,
  type ShopifyCheckoutPaymentStatusResponse,
} from "@workspace/api-client-react";
import { readShopifyCartMeta } from "./shopifyCartState";

const recoveryKey = (userId: string) => `kq-active-checkout:${userId}`;
export function readActiveCheckout(userId?: string): string {
  if (!userId) return "";
  try { return sessionStorage.getItem(recoveryKey(userId)) || ""; } catch { return ""; }
}
export function saveActiveCheckout(userId: string, orderId: string) {
  try { sessionStorage.setItem(recoveryKey(userId), orderId); } catch { /* URL is the fallback. */ }
  const url = new URL(window.location.href);
  url.searchParams.set("payment_order_id", orderId);
  window.history.replaceState(window.history.state, "", url);
}
export function clearActiveCheckout(userId?: string) {
  if (userId) {
    try { sessionStorage.removeItem(recoveryKey(userId)); } catch { /* Nothing private is stored elsewhere. */ }
  }
}
export function orderIsRecorded(status?: ShopifyCheckoutPaymentStatusResponse): boolean {
  return status?.paymentStatus === "PAID" && Boolean(status.shopifyOrderName) &&
    ["shopify_synced", "shipment_booking_pending", "completed"].includes(status.status);
}
export function useVerifiedPaymentStatus(orderId: string) {
  const queryClient = useQueryClient();
  const [startedAt, setStartedAt] = useState(Date.now);
  useEffect(() => { setStartedAt(Date.now()); }, [orderId]);
  const query = useGetShopifyCheckoutPaymentStatus({ orderId }, {
    query: {
      enabled: Boolean(orderId),
      queryKey: getGetShopifyCheckoutPaymentStatusQueryKey({ orderId }),
      refetchOnMount: "always",
      refetchOnWindowFocus: true,
      refetchInterval: (state) => {
        const value = state.state.data;
        if (orderIsRecorded(value) ||
            value?.paymentStatus === "FAILED" || value?.paymentStatus === "REFUNDED" ||
            ["refund_pending", "refunded", "reconciliation_required"].includes(value?.status ?? "") ||
            Date.now() - startedAt >= 20 * 60 * 1000) return false;
        return 3000;
      },
    },
  });
  const recorded = orderIsRecorded(query.data);
  useEffect(() => {
    if (!recorded) return;
    const meta = readShopifyCartMeta();
    if (meta) void queryClient.invalidateQueries({ queryKey: getGetShopifyCartQueryKey({ cartId: meta.id }) });
  }, [recorded, queryClient]);
  return {
    ...query,
    pollingExpired: Date.now() - startedAt >= 20 * 60 * 1000 && query.data?.paymentStatus === "PENDING",
    retry: () => { setStartedAt(Date.now()); void query.refetch(); },
  };
}

import { useEffect } from "react";
import { useUser } from "@clerk/react";
import { useLocation } from "wouter";
import { Shell, PageHero, base } from "./_shared";
import { PaymentReturnState } from "./ShopifyBuyerCheckout";
import { clearActiveCheckout, orderIsRecorded, readActiveCheckout, useVerifiedPaymentStatus } from "./checkoutPaymentState";

export function Confirmation() {
  const { user } = useUser();
  const [location, setLocation] = useLocation();
  const orderId = new URLSearchParams(window.location.search).get("cashfree_order_id")?.trim() ||
    readActiveCheckout(user?.id);
  const status = useVerifiedPaymentStatus(orderId);
  useEffect(() => {
    if (orderId && location.toLowerCase().endsWith("/checkout")) {
      setLocation(`${base}Confirmation?cashfree_order_id=${encodeURIComponent(orderId)}`, { replace: true });
    }
  }, [location, orderId, setLocation]);
  useEffect(() => {
    if (orderIsRecorded(status.data) || status.data?.paymentStatus === "FAILED") clearActiveCheckout(user?.id);
  }, [status.data, user?.id]);
  return <Shell>
    <PageHero eyebrow="Payment status" title="Your order updates." subtitle="Payment is confirmed securely by the server, never by a browser redirect." />
    <main className="wrap content">
      {orderId ? <PaymentReturnState
        orderId={orderId}
        status={status.data}
        isLoading={status.isLoading}
        isError={status.isError}
        paymentWindowOpen={false}
        paymentWindowNotice=""
        pollingExpired={status.pollingExpired}
        onRetry={status.retry}
      /> : <div className="panel">
        <h2>No active payment reference.</h2>
        <p>View your orders to check an earlier purchase, or return to your bag to start checkout.</p>
        <a className="btn" href={base + "Orders"}>View your orders</a>
        <a className="btn outline" href={base + "Cart"}>Return to your bag</a>
      </div>}
    </main>
  </Shell>;
}

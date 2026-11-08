import { useEffect, useState } from "react";
import { useAuth } from "@clerk/react";
import { useLocation } from "wouter";
import { ArrowRight, ChevronLeft, ChevronRight, PackageCheck, RefreshCw } from "lucide-react";
import {
  getGetShopifyOrdersQueryKey,
  useGetShopifyOrders,
} from "@workspace/api-client-react";
import { Shell, PageHero, base } from "./_shared";
import "./_orders.css";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric" }).format(new Date(value));
}

function formatMoney(amount: string, currency: string) {
  try {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(amount));
  } catch {
    return `${currency} ${amount}`;
  }
}

function statusLabel(value: string | null | undefined) {
  if (!value) return "Preparing";
  return value.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function OrderSkeleton() {
  return <div className="orders-skeleton" aria-label="Loading your orders" data-testid="skeleton-orders">
    <div className="order-skeleton-card"><i/><i/><i/></div>
    <div className="order-skeleton-card"><i/><i/><i/></div>
  </div>;
}

export function Orders() {
  const { isLoaded, isSignedIn } = useAuth();
  const [location, setLocation] = useLocation();
  const [pageCursors, setPageCursors] = useState<Array<string | undefined>>([undefined]);
  const cursor = pageCursors[pageCursors.length - 1];
  const signInHref = `${base}sign-in?redirect_url=${encodeURIComponent(location)}`;
  const params = cursor ? { after: cursor } : undefined;
  const ordersQuery = useGetShopifyOrders(params, {
    query: { enabled: Boolean(isLoaded && isSignedIn), queryKey: getGetShopifyOrdersQueryKey(params) },
  });
  const response = ordersQuery.data;
  const orders = response?.orders ?? [];

  useEffect(() => {
    if (isLoaded && !isSignedIn) setLocation(signInHref);
  }, [isLoaded, isSignedIn, setLocation, signInHref]);

  return <Shell>
    <PageHero eyebrow="A little care, all the way home" title="Your orders, in one place." subtitle="Payment confirmation and delivery progress, gathered here with care."/>
    <main className="wrap content orders-page">
      {!isLoaded ? <OrderSkeleton/> : !isSignedIn ? (
        <section className="orders-welcome" data-testid="orders-sign-in-redirect">
          <span className="orders-seal"><PackageCheck size={22}/></span>
          <span className="eyebrow">Your order book</span>
          <h2>Sign in to see what’s on its way.</h2>
          <p>Your order history is kept private and matched to a verified email on your account.</p>
          <a className="btn" data-testid="link-orders-sign-in" href={signInHref}>Sign in to continue <ArrowRight size={15}/></a>
        </section>
      ) : ordersQuery.isLoading ? <OrderSkeleton/> : ordersQuery.isError ? (
        <section className="orders-message" role="alert" data-testid="error-orders">
          <span className="eyebrow">A small pause</span><h2>We couldn’t bring your orders in just now.</h2>
          <p>Your account is safe. Please try again in a moment.</p>
          <button className="orders-button" type="button" onClick={() => void ordersQuery.refetch()} data-testid="button-retry-orders"><RefreshCw size={15}/> Try again</button>
        </section>
      ) : orders.length === 0 ? (
        <section className="orders-empty" data-testid="empty-order-history">
          <div className="orders-empty-art" aria-hidden="true"><span/><span/><span/></div>
          <div><span className="eyebrow">A fresh beginning</span><h2>No orders to show just yet.</h2>
            <p>When you place an order using an email verified on this account, its payment and delivery updates will find their way here.</p>
            <a className="orders-text-link" href={base+"Collections"}>Explore the handlooms <ArrowRight size={14}/></a>
          </div>
        </section>
      ) : (
        <>
          <div className="orders-heading">
            <div><span className="eyebrow">Your Chenetha order book</span><h2>Made with care. On its way to you.</h2></div>
            <button className="orders-refresh" type="button" onClick={() => void ordersQuery.refetch()} disabled={ordersQuery.isFetching} data-testid="button-refresh-orders">
              <RefreshCw size={15} className={ordersQuery.isFetching ? "is-spinning" : ""}/><span>{ordersQuery.isFetching ? "Checking…" : "Refresh"}</span>
            </button>
          </div>
          <div className="order-list" data-testid="list-orders">
            {orders.map((order) => {
              const item = order.lineItems[0];
              return <article className="order-card" key={order.orderRef} data-testid={`card-order-${order.orderRef}`}>
                <div className="order-card-top">
                  <div className="order-card-date"><span>ORDER PLACED</span><strong data-testid={`text-order-date-${order.orderRef}`}>{formatDate(order.createdAt)}</strong></div>
                  <div className="order-card-number"><span>ORDER</span><strong data-testid={`text-order-name-${order.orderRef}`}>{order.name}</strong></div>
                  <div className="order-card-total"><span>TOTAL</span><strong data-testid={`text-order-total-${order.orderRef}`}>{formatMoney(order.totalAmount, order.currencyCode)}</strong></div>
                </div>
                <div className="order-card-body">
                  {item?.image?.url ? <img src={item.image.url} alt={item.image.altText || item.title} className="order-thumb" data-testid={`img-order-${order.orderRef}`}/> : <div className="order-thumb order-thumb-fallback" aria-hidden="true"><span>CK</span></div>}
                  <div className="order-item-summary">
                    <h3 data-testid={`text-order-item-${order.orderRef}`}>{item?.title ?? "Handloom piece"}{order.lineItems.length > 1 && <span className="order-more-items"> + {order.lineItems.length - 1} more</span>}</h3>
                    {item?.variantTitle && item.variantTitle !== "Default Title" && <p>{item.variantTitle}</p>}
                    <p>{order.lineItems.reduce((sum, line) => sum + line.quantity, 0)} {order.lineItems.reduce((sum, line) => sum + line.quantity, 0) === 1 ? "piece" : "pieces"}</p>
                  </div>
                  <div className="order-statuses">
                    <span className={`order-status ${order.financialStatus.toLowerCase() === "paid" ? "is-confirmed" : ""}`} data-testid={`status-payment-${order.orderRef}`}><i/>{statusLabel(order.financialStatus)}</span>
                    <span className="order-status" data-testid={`status-fulfillment-${order.orderRef}`}><i/>{statusLabel(order.fulfillmentStatus)}</span>
                  </div>
                  <a className="order-view-link" href={`${base}Orders/${encodeURIComponent(order.orderRef)}`} data-testid={`link-order-details-${order.orderRef}`}>View order <ArrowRight size={15}/></a>
                </div>
              </article>;
            })}
          </div>
          <div className="orders-pagination">
            <button type="button" disabled={pageCursors.length <= 1 || ordersQuery.isFetching} onClick={() => setPageCursors((current) => current.slice(0, -1))} data-testid="button-previous-orders"><ChevronLeft size={15}/> Newer orders</button>
            <span data-testid="text-orders-page">Page {pageCursors.length} · {orders.length} {orders.length === 1 ? "order" : "orders"}</span>
            <button type="button" disabled={!response?.nextCursor || ordersQuery.isFetching} onClick={() => {
              if (response?.nextCursor) setPageCursors((current) => [...current, response.nextCursor!]);
            }} data-testid="button-next-orders">Older orders <ChevronRight size={15}/></button>
          </div>
        </>
      )}
      <aside className="orders-reassurance" data-testid="note-orders-privacy"><span className="orders-reassurance-mark" aria-hidden="true"/><p>Orders appear here when the checkout email matches a verified email on your Chenetha account.</p><a href={base+"CustomerCare"}>Need a hand? <ArrowRight size={13}/></a></aside>
    </main>
  </Shell>;
}

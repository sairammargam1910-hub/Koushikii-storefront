import { useEffect } from "react";
import { useAuth } from "@clerk/react";
import { ArrowLeft, ArrowUpRight, Clock3, ExternalLink, PackageCheck, RefreshCw, ShieldCheck, Truck } from "lucide-react";
import { useLocation, useParams } from "wouter";
import {
  getGetShopifyOrderDetailsQueryKey,
  getGetShopifyOrderTrackingQueryKey,
  useGetShopifyOrderDetails,
  useGetShopifyOrderTracking,
} from "@workspace/api-client-react";
import { Shell, PageHero, base } from "./_shared";
import { ShipmentTrackingProgress } from "./ShipmentTrackingProgress";
import "./_orders.css";

function formatDate(value: string | null | undefined, includeTime = false) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric", month: "long", year: "numeric",
    ...(includeTime ? { hour: "numeric", minute: "2-digit" } : {}),
  }).format(date);
}

function formatMoney(amount: string, currency: string) {
  try {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(amount));
  } catch {
    return `${currency} ${amount}`;
  }
}

function readable(value: string | null | undefined) {
  if (!value) return "Preparing";
  return value.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function shipmentIsActive(status: string | null | undefined, shipmentStatus?: string | null) {
  if (shipmentStatus) {
    return ["booked", "pickup_scheduled", "picked_up", "in_transit", "out_for_delivery"]
      .includes(shipmentStatus);
  }
  const normalized = (status ?? "").toLowerCase();
  return Boolean(normalized) && !/(delivered|cancelled|canceled|returned|failed|expired|exception|rto)/.test(normalized);
}

function DetailSkeleton() {
  return <div className="orders-skeleton detail-skeleton" data-testid="skeleton-order-detail" aria-label="Loading order details">
    <div className="order-skeleton-card"><i/><i/><i/><i/></div><div className="order-skeleton-card"><i/><i/></div>
  </div>;
}

export function OrderDetail() {
  const params = useParams<{ orderRef: string }>();
  const orderRef = params.orderRef ? decodeURIComponent(params.orderRef) : "";
  const { isLoaded, isSignedIn } = useAuth();
  const [location, setLocation] = useLocation();
  const signInHref = `${base}sign-in?redirect_url=${encodeURIComponent(location)}`;
  const detailsQuery = useGetShopifyOrderDetails(orderRef, {
    query: { enabled: Boolean(orderRef && isLoaded && isSignedIn), queryKey: getGetShopifyOrderDetailsQueryKey(orderRef) },
  });
  const trackingQuery = useGetShopifyOrderTracking(orderRef, {
    query: {
      enabled: Boolean(orderRef && isLoaded && isSignedIn),
      queryKey: getGetShopifyOrderTrackingQueryKey(orderRef),
      refetchInterval: (query) => {
        const shipments = query.state.data?.shipments ?? [];
        return shipments.some((shipment) => shipmentIsActive(shipment.status, shipment.shipmentStatus)) ? 45_000 : false;
      },
    },
  });
  const order = detailsQuery.data?.order;
  const shipments = trackingQuery.data?.shipments ?? [];

  useEffect(() => {
    if (isLoaded && !isSignedIn) setLocation(signInHref);
  }, [isLoaded, isSignedIn, setLocation, signInHref]);

  const retry = () => {
    void detailsQuery.refetch();
    void trackingQuery.refetch();
  };

  return <Shell>
    <PageHero eyebrow="A note on your order" title="Every detail, with care." subtitle="A clear view of your payment, your handloom and the journey home."/>
    <main className="wrap content order-detail-page">
      <a className="order-back-link" href={base+"Orders"} data-testid="link-back-to-orders"><ArrowLeft size={15}/> All orders</a>
      {!isLoaded ? <DetailSkeleton/> : !isSignedIn ? <section className="orders-message" data-testid="order-sign-in-redirect"><span className="eyebrow">Your order book</span><h2>Please sign in to view this order.</h2><a className="btn" href={signInHref} data-testid="link-order-sign-in">Sign in securely <ArrowUpRight size={15}/></a></section>
      : detailsQuery.isLoading ? <DetailSkeleton/>
      : detailsQuery.isError || !order ? <section className="orders-message" role="alert" data-testid="error-order-detail">
        <span className="eyebrow">Order details</span><h2>We couldn’t find this order.</h2>
        <p>It may not belong to the verified emails on your account, or the order details may be taking a moment to arrive.</p>
        <button className="orders-button" type="button" onClick={retry} data-testid="button-retry-order-detail"><RefreshCw size={15}/> Try again</button>
        <a className="orders-text-link" href={base+"Orders"}>Return to your orders <ArrowLeft size={14}/></a>
      </section> : <>
        <header className="detail-title-row">
          <div><span className="eyebrow">Order {order.name}</span><h2 data-testid="text-detail-order-name">Your handloom is in good hands.</h2><p>Placed {formatDate(order.createdAt)}</p></div>
          <button type="button" className="orders-refresh" onClick={retry} disabled={detailsQuery.isFetching || trackingQuery.isFetching} data-testid="button-refresh-order">
            <RefreshCw size={15} className={detailsQuery.isFetching || trackingQuery.isFetching ? "is-spinning" : ""}/><span>Refresh updates</span>
          </button>
        </header>
        <div className="detail-layout">
          <div className="detail-main-column">
            <section className="detail-panel payment-panel" aria-labelledby="payment-title">
              <div className="detail-panel-heading">
                <span className="detail-icon"><ShieldCheck size={19}/></span><div><span className="eyebrow">Payment</span><h3 id="payment-title">Your payment confirmation</h3></div>
                <span className={`payment-pill ${order.financialStatus.toLowerCase() === "paid" ? "is-paid" : ""}`} data-testid="status-detail-payment">{readable(order.financialStatus)}</span>
              </div>
              <p>{order.financialStatus.toLowerCase() === "paid" ? "Payment confirmed. Thank you — your order is being cared for." : `Current payment status: ${readable(order.financialStatus)}.`}</p>
            </section>
            <section className="detail-panel shipment-panel" aria-labelledby="shipment-title">
              <div className="detail-panel-heading">
                <span className="detail-icon"><Truck size={19}/></span><div><span className="eyebrow">The journey</span><h3 id="shipment-title">Delivery progress</h3></div>
                {trackingQuery.isFetching && <span className="tracking-live"><i/> Checking</span>}
              </div>
              {trackingQuery.isError ? <div className="tracking-unavailable" role="status" data-testid="error-tracking">
                <p>We can’t reach the courier updates just now. Your order details are still here.</p>
                <button type="button" className="orders-inline-button" onClick={() => void trackingQuery.refetch()} data-testid="button-retry-tracking">Try tracking again</button>
              </div> : trackingQuery.isLoading ? <div className="tracking-placeholder" data-testid="loading-tracking"><i/><i/><i/></div> : shipments.length ? shipments.map((shipment, index) => (
                <ShipmentTrackingProgress
                  key={`${shipment.awbCode ?? shipment.status}-${index}`}
                  shipment={shipment}
                  index={index}
                  paymentConfirmed={order.financialStatus.toLowerCase() === "paid"}
                />
              )) : <div className="tracking-pending" data-testid="empty-tracking"><Clock3 size={16}/><p>Tracking will appear here once your parcel has been handed to the courier.</p></div>}
              {order.financialStatus.toLowerCase() === "paid" && trackingQuery.data?.shipments.some((shipment) => shipmentIsActive(shipment.status, shipment.shipmentStatus)) && <p className="tracking-refresh-note" data-testid="text-tracking-auto-refresh">Updates are checked automatically while your parcel is moving.</p>}
            </section>
            <section className="detail-panel items-panel" aria-labelledby="items-title">
              <div className="detail-panel-heading"><span className="detail-icon"><PackageCheck size={19}/></span><div><span className="eyebrow">Made for you</span><h3 id="items-title">In this order</h3></div></div>
              <div className="detail-item-list">{order.lineItems.map((item) => <article className="detail-item" key={item.id} data-testid={`row-order-item-${item.id}`}>
                {item.image?.url ? <img src={item.image.url} alt={item.image.altText || item.title} data-testid={`img-order-item-${item.id}`}/> : <div className="detail-item-fallback" aria-hidden="true">CK</div>}
                <div className="detail-item-copy"><strong>{item.title}</strong>{item.variantTitle && item.variantTitle !== "Default Title" && <span>{item.variantTitle}</span>}<small>Qty {item.quantity}{item.sku ? ` · ${item.sku}` : ""}</small></div>
                <strong className="detail-item-price" data-testid={`text-line-total-${item.id}`}>{formatMoney(item.totalPrice, item.currencyCode)}</strong>
              </article>)}</div>
              <div className="order-total-row"><span>Order total</span><strong data-testid="text-detail-total">{formatMoney(order.totalAmount, order.currencyCode)}</strong></div>
            </section>
          </div>
          <aside className="detail-side-column">
            <section className="detail-panel order-summary-panel">
              <span className="eyebrow">Order summary</span><h3 data-testid="text-summary-order-name">{order.name}</h3>
              <dl><div><dt>Placed</dt><dd>{formatDate(order.createdAt)}</dd></div>{order.processedAt && <div><dt>Confirmed</dt><dd>{formatDate(order.processedAt)}</dd></div>}
                <div><dt>Payment</dt><dd data-testid="text-summary-payment">{readable(order.financialStatus)}</dd></div>
                <div><dt>Fulfilment</dt><dd data-testid="text-summary-fulfillment">{order.financialStatus.toUpperCase() === "PAID" ? readable(order.fulfillmentStatus) : "Not shipped"}</dd></div>
                <div className="summary-total"><dt>Total paid</dt><dd>{formatMoney(order.totalAmount, order.currencyCode)}</dd></div>
              </dl>
            </section>
            {order.fulfillments.length > 0 && <section className="detail-panel fulfillment-panel" data-testid="list-fulfillments">
              <span className="eyebrow">Dispatch details</span>
              {order.fulfillments.map((fulfillment, index) => <div className="fulfillment-detail" key={`${fulfillment.trackingNumber ?? fulfillment.status}-${index}`} data-testid={`fulfillment-${index}`}>
                <strong>{readable(fulfillment.status)}</strong>
                {fulfillment.trackingCompany && <span>Delivery partner</span>}
                {fulfillment.trackingNumber && <span className="fulfillment-number">{fulfillment.trackingNumber}</span>}
                {fulfillment.estimatedDeliveryAt && <span>Expected {formatDate(fulfillment.estimatedDeliveryAt)}</span>}
                {fulfillment.trackingUrl && <a href={fulfillment.trackingUrl} target="_blank" rel="noopener noreferrer">Track this parcel <ExternalLink size={13}/></a>}
              </div>)}
            </section>}
            <div className="detail-help-note"><span className="detail-icon"><ShieldCheck size={17}/></span><p>Your order is matched to the verified email on your account. We’ll keep delivery updates together here.</p></div>
          </aside>
        </div>
      </>}
      <div className="detail-footer-links"><a href={base+"Orders"}><ArrowLeft size={14}/> Back to all orders</a><a href={base+"CustomerCare"}>Need help with this order? <ArrowUpRight size={14}/></a></div>
    </main>
  </Shell>;
}

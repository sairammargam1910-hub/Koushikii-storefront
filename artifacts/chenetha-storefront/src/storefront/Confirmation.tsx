import { ArrowRight, ExternalLink } from "lucide-react";
import { Shell, PageHero, base } from "./_shared";

export function Confirmation() {
  return <Shell>
    <PageHero eyebrow="Shopify checkout handoff" title="Your checkout continues with Shopify." subtitle="This page is not an order confirmation."/>
    <main className="wrap content">
      <div className="panel" data-testid="status-shopify-order-unconfirmed">
        <span className="eyebrow">No order status is available here</span>
        <h2 style={{ margin: "14px 0" }}>Shopify confirms orders and payments.</h2>
        <p className="muted">This storefront does not receive Shopify order notifications. If you just completed checkout, use Shopify’s confirmation and account updates for the authoritative order status. If you have not completed checkout, return to your saved bag to continue.</p>
        <div className="actions">
          <a className="btn" href={base + "Cart"}>Return to your bag <ArrowRight size={14}/></a>
          <a className="btn outline" href={base + "Collections"}>Continue browsing</a>
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 22 }}><ExternalLink size={13}/> Checkout and any order details are hosted by Shopify.</p>
      </div>
    </main>
  </Shell>;
}

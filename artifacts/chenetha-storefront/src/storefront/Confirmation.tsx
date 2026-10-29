import { ArrowRight, ExternalLink } from "lucide-react";
import { Shell, PageHero, base } from "./_shared";
import { ShopifyOrderUpdatesLink } from "./ShopifyOrderUpdatesLink";

export function Confirmation() {
  return <Shell>
    <PageHero eyebrow="Shopify checkout handoff" title="Your checkout continues with Shopify." subtitle="This page is not an order confirmation."/>
    <main className="wrap content">
      <div className="panel" data-testid="panel-shopify-order-status">
        <span className="eyebrow">Order updates from Shopify</span>
        <h2 style={{ margin: "14px 0" }}>Check Shopify for confirmed order updates.</h2>
        <p className="muted">This page does not confirm that checkout or payment finished. Shopify’s account page shows order status and delivery updates after Shopify records them.</p>
        <ShopifyOrderUpdatesLink />
        <p className="muted" style={{ marginTop: 16 }}>If no update appears yet, check the email you entered at Shopify checkout, including its spam folder. A return to this page alone does not confirm an order.</p>
        <div className="actions">
          <a className="btn" href={base + "Cart"}>Return to your bag <ArrowRight size={14}/></a>
          <a className="btn outline" href={base + "Collections"}>Continue browsing</a>
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 22 }}><ExternalLink size={13}/> Checkout and order details are hosted by Shopify.</p>
      </div>
    </main>
  </Shell>;
}

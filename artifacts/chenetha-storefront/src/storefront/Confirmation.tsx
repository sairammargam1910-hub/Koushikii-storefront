import { ArrowRight, ExternalLink } from "lucide-react";
import { Shell, PageHero, base } from "./_shared";
import { ShopifyOrderUpdatesLink } from "./ShopifyOrderUpdatesLink";

export function Confirmation() {
  return <Shell>
    <PageHero eyebrow="Payment status" title="Check your payment status." subtitle="A return to this page alone does not confirm payment."/>
    <main className="wrap content">
      <div className="panel" data-testid="panel-payment-status">
        <span className="eyebrow">Order updates from Shopify</span>
        <h2 style={{ margin: "14px 0" }}>Cashfree verifies payment; Shopify records the order.</h2>
        <p className="muted">Only a server-verified Cashfree payment can create a paid Shopify order. Check the checkout status page while payment is being verified.</p>
        <ShopifyOrderUpdatesLink />
        <p className="muted" style={{ marginTop: 16 }}>If an order is not listed yet, check the email used at checkout. Do not pay again while a payment is still being verified.</p>
        <div className="actions">
          <a className="btn" href={base + "Checkout"}>Check checkout status <ArrowRight size={14}/></a>
          <a className="btn outline" href={base + "Collections"}>Continue browsing</a>
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 22 }}><ExternalLink size={13}/> Payment is hosted by Cashfree; confirmed order records are kept in Shopify.</p>
      </div>
    </main>
  </Shell>;
}

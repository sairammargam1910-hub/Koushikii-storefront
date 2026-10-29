import { ArrowRight } from "lucide-react";
import { Shell, PageHero, base } from "./_shared";
import { ShopifyOrderUpdatesLink } from "./ShopifyOrderUpdatesLink";

export function Orders() {
  return <Shell><PageHero eyebrow="Order information" title="Your order is managed by Shopify." subtitle="Purchases made through this website are completed on Shopify’s secure checkout."/>
    <main className="wrap content">
      <div className="empty" data-testid="empty-order-history">
        <span className="eyebrow">Order updates from Shopify</span>
        <h2 style={{fontSize:42,margin:"14px 0"}}>See confirmed orders and delivery updates.</h2>
        <p>Shopify’s customer account is the source for order status and delivery updates. Sign in there to see the latest information Shopify has recorded.</p>
        <ShopifyOrderUpdatesLink />
        <p className="muted" style={{marginTop:16}}>If no update appears yet, check the email you entered at checkout, including its spam folder.</p>
      </div>
      <section className="guide-note" style={{marginTop:30}}>
        <span className="eyebrow">Purchase notes</span>
        <h3 style={{marginTop:12}}>Confirm the details directly.</h3>
        <p>Only active, available Shopify products can be purchased. Shopify shows the final price, shipping, taxes, payment options, and order confirmation during checkout.</p>
        <a className="link" href={base+"CustomerCare"}>Read customer care notes <ArrowRight size={14}/></a>
      </section>
    </main>
  </Shell>;
}

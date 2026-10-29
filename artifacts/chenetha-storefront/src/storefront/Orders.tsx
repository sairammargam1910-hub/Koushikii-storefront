import { ArrowRight, MessageCircle } from "lucide-react";
import { Shell, PageHero, base } from "./_shared";

export function Orders() {
  return <Shell><PageHero eyebrow="Order information" title="Your order is managed by Shopify." subtitle="Purchases made through this website are completed on Shopify’s secure checkout."/>
    <main className="wrap content">
      <div className="empty" data-testid="empty-order-history">
        <span className="eyebrow">Order history is not shown here</span>
        <h2 style={{fontSize:42,margin:"14px 0"}}>Check the update Shopify sent you.</h2>
        <p>Shopify sends your order confirmation and delivery updates after checkout. This storefront does not display Shopify customer order history yet.</p>
        <a className="btn" href={base+"CustomerCare"}><MessageCircle size={15}/> Read customer care notes <ArrowRight size={14}/></a>
      </div>
      <section className="guide-note" style={{marginTop:30}}>
        <span className="eyebrow">Purchase notes</span>
        <h3 style={{marginTop:12}}>Confirm the details directly.</h3>
        <p>Only active, available Shopify products can be purchased. Shopify shows the final price, shipping, taxes, payment options, and order confirmation during checkout.</p>
        <a className="link" href={base+"CustomerCare"}>Read customer care notes →</a>
      </section>
    </main>
  </Shell>;
}

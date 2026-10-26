import { ArrowRight, MessageCircle } from "lucide-react";
import { Shell, PageHero, base } from "./_shared";

export function Orders() {
  return <Shell><PageHero eyebrow="Order information" title="A clear conversation comes first." subtitle="This storefront does not create or track orders. Contact the brand directly about any purchase arranged with them."/>
    <main className="wrap content">
      <div className="empty" data-testid="empty-order-history">
        <span className="eyebrow">No order history here</span>
        <h2 style={{fontSize:42,margin:"14px 0"}}>There are no online orders to show.</h2>
        <p>No order, payment, shipment or tracking record is created by this catalogue.</p>
        <a className="btn" href={base+"Contact"}><MessageCircle size={15}/> Ask the brand <ArrowRight size={14}/></a>
      </div>
      <section className="guide-note" style={{marginTop:30}}>
        <span className="eyebrow">Purchase notes</span>
        <h3 style={{marginTop:12}}>Confirm the details directly.</h3>
        <p>Catalogue items and displayed prices are samples. Availability, final pricing, delivery terms and any applicable return terms must be confirmed by the brand before proceeding.</p>
        <a className="link" href={base+"CustomerCare"}>Read customer care notes →</a>
      </section>
    </main>
  </Shell>;
}

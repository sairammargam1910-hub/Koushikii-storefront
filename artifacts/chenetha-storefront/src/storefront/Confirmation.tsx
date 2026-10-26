import { ArrowRight, MessageCircle } from "lucide-react";
import { Shell, PageHero, base } from "./_shared";

export function Confirmation() {
  return <Shell><PageHero eyebrow="WhatsApp handoff" title="Your enquiry draft is yours to send." subtitle="This page does not confirm an order, payment or delivery."/>
    <main className="wrap content">
      <div className="panel" data-testid="status-enquiry-not-confirmed">
        <span className="eyebrow">No transaction has taken place</span>
        <h2 style={{margin:"14px 0"}}>Nothing has been placed or paid for.</h2>
        <p className="muted">If you opened WhatsApp from the review page, the prepared message is still only a draft until you review and send it there. Your saved bag remains available in this browser.</p>
        <div className="actions"><a className="btn" href={base+"Cart"}>Return to your bag <ArrowRight size={14}/></a><a className="btn outline" href={base+"Contact"}><MessageCircle size={15}/> Contact the brand</a></div>
      </div>
    </main>
  </Shell>;
}

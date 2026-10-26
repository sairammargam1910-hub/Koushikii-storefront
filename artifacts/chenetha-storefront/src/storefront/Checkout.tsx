import { useMemo, useState } from "react";
import { ArrowRight, MessageCircle } from "lucide-react";
import { Shell, PageHero, useStore, products, format, moneySub, base } from "./_shared";

const businessNumber = "916309741049";

export function Checkout() {
  const cart = useStore("kq-cart");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const selected = useMemo(() => products.flatMap(product => {
    const item = cart.find(entry => entry.id === product.id);
    return item ? [{ product, qty: item.qty }] : [];
  }), [cart]);
  const total = moneySub(cart);

  const prepareEnquiry = () => {
    if (!selected.length) {
      setError("Your bag is empty. Add a catalogue piece before preparing an enquiry.");
      return;
    }
    const lines = selected.map(({ product, qty }) => `• ${product.name} — ${qty} × ${format(product.price)} = ${format(product.price * qty)}`);
    const text = [
      "Namaste, I would like to enquire about these Chenetha by Koushikii catalogue pieces:",
      ...lines,
      `Sample catalogue subtotal: ${format(total)}`,
      note.trim() ? `Enquiry note: ${note.trim()}` : "",
      "",
      "I understand these are sample catalogue prices. Please confirm the actual piece, availability and final pricing before proceeding. This message is an enquiry only."
    ].filter(Boolean).join("\n");
    window.open(`https://wa.me/${businessNumber}?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  };

  return <Shell>
    <PageHero eyebrow="Your selection · WhatsApp enquiry" title="Review the pieces you found." subtitle="Check your selected catalogue items, then prepare an enquiry for the brand."/>
    <main className="wrap content">
      <div className="notice" role="note" data-testid="notice-catalogue-prices">
        Catalogue prices are samples, not final offers. The brand must confirm each piece’s availability and final pricing. No payment, order, or shipment is created here.
      </div>
      <div className="two-col" style={{marginTop:28}}>
        <section className="panel">
          <span className="eyebrow">Selected pieces</span>
          {selected.length ? selected.map(({product,qty})=><div className="row" key={product.id} data-testid={`row-enquiry-item-${product.id}`} style={{padding:"16px 0",borderBottom:"1px solid var(--line)"}}>
            <div><a className="link" href={`${base}Product?id=${encodeURIComponent(product.id)}`}>{product.name}</a><p className="muted" style={{margin:"7px 0 0"}}>{qty} × {format(product.price)} sample price</p></div>
            <strong>{format(product.price * qty)}</strong>
          </div>) : <div className="empty" data-testid="empty-enquiry-cart"><h2>Your bag is empty.</h2><p>Choose a catalogue piece to prepare an enquiry.</p><a className="btn" href={base+"Collections"}>Browse the collection <ArrowRight size={14}/></a></div>}
          <div className="row" style={{marginTop:20}}><span>Sample catalogue subtotal</span><strong data-testid="text-enquiry-subtotal">{format(total)}</strong></div>
          <p className="muted" style={{fontSize:12}}>Shipping, tax and final totals are not calculated.</p>
          <label className="field" style={{marginTop:20}}>Optional note for the brand
            <textarea data-testid="input-enquiry-note" value={note} maxLength={500} onChange={event=>setNote(event.target.value)} placeholder="Ask about a piece, colour, fabric, or availability."/>
          </label>
          {error&&<p className="notice" role="alert" data-testid="error-empty-enquiry">{error}</p>}
          <button className="btn" type="button" data-testid="button-open-whatsapp-enquiry" onClick={prepareEnquiry} disabled={!selected.length} style={{marginTop:18}}>
            <MessageCircle size={16}/> Prepare WhatsApp enquiry
          </button>
          <p className="muted" style={{fontSize:11}}>WhatsApp opens with a draft for you to review and send. Opening it does not place an order or clear your bag.</p>
        </section>
        <aside className="panel">
          <span className="eyebrow">What happens next</span>
          <h3 style={{margin:"14px 0"}}>A conversation, not a checkout.</h3>
          <p className="muted">The WhatsApp message will include only the items selected here and your optional note. The brand can confirm current availability and final pricing directly.</p>
          <a className="link" href={base+"Cart"}>Return to your bag →</a>
          <p style={{fontSize:12,marginTop:25}}>No payment provider, customer account, delivery service or commerce backend is connected.</p>
        </aside>
      </div>
    </main>
  </Shell>;
}

import { ArrowRight, Instagram, MessageCircle } from "lucide-react";
import type { FormEvent } from "react";
import { Shell, PageHero, base } from "./_shared";

export function Contact() {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const message = [
      "Namaste, I have an enquiry for Chenetha by Koushikii.",
      `Name: ${String(data.get("name") || "").trim()}`,
      data.get("email") ? `Email: ${String(data.get("email")).trim()}` : "",
      `Topic: ${String(data.get("topic") || "").trim()}`,
      data.get("reference") ? `Reference: ${String(data.get("reference")).trim()}` : "",
      `Message: ${String(data.get("message") || "").trim()}`
    ].filter(Boolean).join("\n");
    window.open(`https://wa.me/916309741049?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
  };
  return <Shell><PageHero eyebrow="A note to Chenetha" title="Begin with a question." subtitle="About a border, a fabric, a piece you are considering. A useful conversation starts with the small details."/>
    <main className="wrap content"><div className="two-col"><section>
      <div className="guide-warning" style={{marginTop:0,marginBottom:24}}><strong>WhatsApp enquiry.</strong> Submitting opens WhatsApp with a prepared draft to the client-supplied business number. Review the draft and choose whether to send it.</div>
      <form className="form panel" onSubmit={submit} data-testid="form-contact-enquiry">
        <div className="cols"><div className="field"><label htmlFor="contact-name">Your name</label><input id="contact-name" name="name" required autoComplete="name" data-testid="input-contact-name"/></div><div className="field"><label htmlFor="contact-email">Email (optional)</label><input id="contact-email" name="email" type="email" autoComplete="email" data-testid="input-contact-email"/></div></div>
        <div className="field"><label htmlFor="contact-topic">What can we help with?</label><select id="contact-topic" name="topic" data-testid="select-contact-topic"><option>Choosing a textile</option><option>Availability or pricing</option><option>Care question</option><option>Something else</option></select></div>
        <div className="field"><label htmlFor="contact-order">Reference, if relevant</label><input id="contact-order" name="reference" placeholder="Optional reference"/></div>
        <div className="field"><label htmlFor="contact-message">Your message</label><textarea id="contact-message" name="message" required minLength={12} placeholder="Tell us which piece or weave you have in mind…" data-testid="input-contact-message"/></div>
        <button className="btn" data-testid="button-contact-whatsapp"><MessageCircle size={15}/> Open WhatsApp enquiry</button><small className="muted">Your details stay in this form until you leave; they are not sent to this website.</small>
      </form>
    </section><aside><div style={{marginTop:26}}><span className="eyebrow">While you are here</span><h2 style={{margin:"12px 0 20px"}}>A few answers<br/>already gathered.</h2><p className="muted">For choosing a cloth, caring for one you own, or understanding catalogue pricing, start with these notes.</p><nav className="support-links" aria-label="Help before sending an enquiry">{[["CustomerCare","Customer care & purchase notes"],["SareeCare","Care notes by fabric"],["Collections","Discover regional collections"],["Orders","Order information"]].map(([path,title])=><a key={path} href={base+path}>{title}<ArrowRight size={14}/></a>)}</nav><div className="guide-note"><span className="eyebrow">Instagram</span><h3>Follow the thread.</h3><p>See new drapes, textile details and updates from Chenetha by Koushikii.</p><a className="btn outline small" href="https://www.instagram.com/chenetha_by_koushikii/" target="_blank" rel="noopener noreferrer"><Instagram size={15}/> @chenetha_by_koushikii <ArrowRight size={14}/></a></div></div></aside></div></main>
  </Shell>;
}

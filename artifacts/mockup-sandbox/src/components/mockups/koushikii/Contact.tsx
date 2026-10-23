import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { Shell, PageHero, base } from "./_shared";

export function Contact() {
 const [sent,setSent]=useState(false);
 return <Shell><PageHero eyebrow="A note to Chenetha" title="Begin with a question." subtitle="About a border, a fabric, a piece you are considering. A useful conversation starts with the small details."/>
  <main className="wrap content"><div className="two-col"><section>
   <div className="guide-warning" style={{marginTop:0,marginBottom:24}}><strong>Enquiry preview only.</strong> No message is sent. Verified contact details and response hours will be added before the store opens.</div>
   <form className="form panel" onSubmit={e=>{e.preventDefault();setSent(true)}} onChange={()=>setSent(false)}>
    <div className="cols"><div className="field"><label htmlFor="contact-name">Your name</label><input id="contact-name" required autoComplete="name"/></div><div className="field"><label htmlFor="contact-email">Email</label><input id="contact-email" required type="email" autoComplete="email"/></div></div>
    <div className="field"><label htmlFor="contact-topic">What can we help with?</label><select id="contact-topic"><option>Choosing a textile</option><option>Order or delivery</option><option>Care question</option><option>Something else</option></select></div>
    <div className="field"><label htmlFor="contact-order">Order number, if relevant</label><input id="contact-order" placeholder="Demo order reference (optional)"/></div>
    <div className="field"><label htmlFor="contact-message">Your message</label><textarea id="contact-message" required minLength={12} placeholder="Tell us which piece or weave you have in mind…"/></div>
    {sent&&<div className="notice" role="status">Your enquiry has been validated for this preview. Nothing was sent or saved to a service.</div>}
    <button className="btn">Preview enquiry <ArrowRight size={14}/></button><small className="muted">Please use sample details. This prototype is not monitored for support.</small>
   </form>
  </section><aside><span className="eyebrow">While you are here</span><h2 style={{margin:"12px 0 20px"}}>A few answers<br/>already gathered.</h2><p className="muted">For choosing a cloth, caring for one you own, or understanding the sample order flow, start with these notes.</p><nav className="support-links" aria-label="Help before sending an enquiry">{[["CustomerCare","Customer care & FAQs"],["SareeCare","Care notes by fabric"],["WeaveGuide","Regional weave guide"],["TrackOrder","Sample order tracking"],["Policies","Draft policies"]].map(([path,title])=><a key={path} href={base+path}>{title}<ArrowRight size={14}/></a>)}</nav><div className="guide-note"><span className="eyebrow">A useful enquiry</span><h3>The details help.</h3><p>Include the name of the piece, what you want to know about its fibre or border, and an order reference if the question is about a purchase. Never include card details or passwords.</p></div></aside></div></main>
 </Shell>;
}

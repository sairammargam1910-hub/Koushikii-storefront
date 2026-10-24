import { useState } from "react";
import type { FormEvent } from "react";
import { Shell,PageHero,useStore,products,format,moneySub,base,saveItems,WhatsAppOrderBanner,buildWhatsAppOrderMessage } from "./_shared";

export function Checkout(){
 const cart=useStore("kq-cart");
 const [payment,setPayment]=useState("success"),[error,setError]=useState("");
 const total=moneySub(cart);
 const submit=(e:FormEvent)=>{
  e.preventDefault();
  if(!cart.length){setError("Your bag is empty. Add a textile before checkout.");return}
  if(payment==="failure"){setError("Demo payment was not completed. No payment was taken. Retry or choose the successful preview outcome.");return}
  const order={number:"DEMO-"+Date.now().toString(36).toUpperCase(),status:"Recorded · demo only",date:new Date().toLocaleDateString("en-IN"),total,items:cart};
  try {
   const stored=JSON.parse(localStorage.getItem("kq-orders")||"[]");
   const history=Array.isArray(stored)?stored:[];
   localStorage.setItem("kq-last-order",JSON.stringify(order));
   localStorage.setItem("kq-orders",JSON.stringify([order,...history]));
   saveItems("kq-cart",[]);
   window.location.href=base+"Confirmation";
  }catch{setError("This browser could not save the demo order. Your bag has not been cleared. Please retry with browser storage available.")}
 };
 return <Shell><PageHero eyebrow="A few details · Demo checkout" title="One step closer to the cloth." subtitle="Try a guest checkout with fictional details. No real purchase, payment or delivery is created."/>
 <main className="wrap content"><div className="stepbar"><span>01 · Contact</span><span>02 · Delivery</span><span>03 · Payment handoff</span></div>{cart.length>0&&<div style={{marginBottom:30}}><WhatsAppOrderBanner compact eyebrow="Another way to order" title="Prefer a conversation first?" copy="Ask the team about the items in your bag without sharing address or payment details here." message={buildWhatsAppOrderMessage(cart)} buttonLabel="Continue on WhatsApp"/></div>}<div className="two-col">
 <form className="form" onSubmit={submit}>
  <section><span className="eyebrow">01 / Contact</span><div className="field" style={{marginTop:15}}><label htmlFor="checkout-email">Sample email address</label><input id="checkout-email" required type="email" placeholder="demo@example.com"/></div><p className="muted" style={{fontSize:11}}>Use fictional details. Contact and address inputs are not submitted or saved with the demo order.</p></section>
  <section><span className="eyebrow">02 / Delivery address</span><div className="cols" style={{marginTop:15}}><div className="field"><label htmlFor="checkout-first">First name</label><input id="checkout-first" required/></div><div className="field"><label htmlFor="checkout-last">Last name</label><input id="checkout-last" required/></div></div><div className="field"><label htmlFor="checkout-address">Sample address</label><input id="checkout-address" required placeholder="Fictional house, street, area"/></div><div className="cols"><div className="field"><label htmlFor="checkout-city">City</label><input id="checkout-city" required/></div><div className="field"><label htmlFor="checkout-pin">PIN code</label><input id="checkout-pin" required pattern="[1-9][0-9]{5}" inputMode="numeric" maxLength={6}/></div></div><div className="cols"><div className="field"><label htmlFor="checkout-state">State</label><input id="checkout-state" required/></div><div className="field"><label htmlFor="checkout-phone">Sample phone (optional)</label><input id="checkout-phone" type="tel"/></div></div></section>
  <section><span className="eyebrow">03 / Delivery & purchase notes</span><div className="notice" style={{marginTop:15}}>Shipping availability, methods, charges, taxes and dispatch timing are not established in this preview. The displayed amount is the sample product subtotal, not a final payable price.</div><p><a className="link" href={base+"CustomerCare"}>Read purchase & support notes →</a></p></section>
  <section><span className="eyebrow">Payment handoff · prototype only</span><div className="notice" style={{margin:"14px 0"}}>No payment service is connected. Do not enter real payment details.</div><div className="field"><label htmlFor="checkout-outcome">Preview outcome</label><select id="checkout-outcome" value={payment} onChange={e=>{setPayment(e.target.value);setError("")}}><option value="success">Simulate successful handoff</option><option value="failure">Simulate declined / failed handoff</option></select></div><p className="muted" style={{fontSize:12}}>The demo records sample items in this browser only. It does not send an order to the brand.</p></section>
  {error&&<div className="notice" role="alert">{error}</div>}<button className="btn" type="submit">Create demo order · {format(total)}</button>
 </form>
 <aside className="panel" style={{height:"max-content"}}><span className="eyebrow">Your sample order</span>{cart.length?products.filter(p=>cart.some(x=>x.id===p.id)).map(p=><div key={p.id} className="row" style={{padding:"14px 0",borderBottom:"1px solid var(--line)"}}><span>{p.name} × {cart.find(x=>x.id===p.id)?.qty}</span><b>{format(p.price*(cart.find(x=>x.id===p.id)?.qty||1))}</b></div>):<div><p>Your demo bag is empty.</p><a className="link" href={base+"Collections"}>Find a textile →</a></div>}<div className="row" style={{marginTop:20}}><span>Sample subtotal</span><b>{format(total)}</b></div><p className="muted" style={{fontSize:11}}>No shipping or tax calculation is connected. Nothing is payable in this preview.</p><a className="link" href={base+"Cart"}>Back to your bag →</a></aside>
 </div></main></Shell>;
}

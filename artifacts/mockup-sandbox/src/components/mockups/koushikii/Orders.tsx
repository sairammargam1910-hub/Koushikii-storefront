import { useState } from "react";
import { Shell,PageHero,base,format,products } from "./_shared";

type DemoOrder={number:string;status:string;date:string;total:number;items:{id:string;qty:number}[]};
const example:DemoOrder={number:"DEMO-240816",status:"In transit · sample",date:"16 Aug 2024",total:12800,items:[{id:"nila",qty:1}]};
function readOrders():DemoOrder[]{try{const data=JSON.parse(localStorage.getItem("kq-orders")||"[]");return Array.isArray(data)&&data.length?data:[example]}catch{return [example]}}
export function Orders(){
 const [orders]=useState(readOrders),[request,setRequest]=useState<DemoOrder|null>(null),[message,setMessage]=useState("");
 return <Shell><PageHero eyebrow="The paper trail · Demo history" title="Orders & small details." subtitle="Review sample purchases, explore tracking and prepare a support enquiry."/>
 <main className="wrap content"><div className="notice" style={{marginBottom:24}}>Illustrative transactions only. These records are not real purchases; no carrier, payment or returns service is connected.</div>
 {message&&<div className="notice" role="status" style={{marginBottom:24}}>{message}</div>}
 {orders.map((o,i)=><article className="panel" key={o.number+"-"+i} style={{marginBottom:24}}><div className="row"><div><span className="eyebrow">Demo order {o.number}</span><p className="muted">{o.date} · <span className="pill">{o.status}</span></p></div><b>{format(o.total)}</b></div>
  <div style={{borderTop:"1px solid var(--line)",paddingTop:12}}>{o.items.map(item=><p key={item.id}>{item.qty} × <a className="link" href={base+"Product?id="+encodeURIComponent(item.id)}>{products.find(p=>p.id===item.id)?.name||"Sample textile"}</a></p>)}</div>
  <details><summary>Tracking details · Demo only</summary><p><strong>{o.status}</strong> is a sample status, not a live delivery update.</p><ol className="support-process"><li>Demo order recorded in this browser.</li><li>Packing and carrier handover are not connected.</li><li>No tracking reference or delivery estimate has been issued.</li></ol><p>For a real shipment, check the reference provided by the merchant. If it is missing or has not updated, contact confirmed support with your order number; do not assume an arrival date from this preview.</p><a className="link" href={base+"CustomerCare"}>Delivery & tracking guidance →</a></details>
  <div className="actions" style={{marginTop:22}}><button className="btn small" onClick={()=>{setRequest(o);setMessage("")}}>Preview return enquiry</button><a className="btn small outline" href={base+"Contact"}>Contact preview</a></div>
 </article>)}
 {request&&<section className="panel" style={{maxWidth:700,marginTop:32}}><h3>Return enquiry · {request.number}</h3><p className="muted">This is a local demonstration, not a return authorisation or a request sent to the merchant. Eligibility and refund terms are not established in this preview.</p><form className="form" onSubmit={e=>{e.preventDefault();setMessage("Demo enquiry completed. Nothing was sent, and no return or refund has been authorised.");setRequest(null)}}>
  <div className="field"><label htmlFor="return-piece">Which piece?</label><select id="return-piece">{request.items.map(item=><option key={item.id}>{products.find(p=>p.id===item.id)?.name||"Sample textile"}</option>)}</select></div>
  <div className="field"><label htmlFor="return-reason">Tell us a little more</label><textarea id="return-reason" required placeholder="Use a fictional reason for this demo"/></div><div className="actions"><button className="btn small">Complete demo enquiry</button><button type="button" className="btn small outline" onClick={()=>setRequest(null)}>Cancel</button></div>
 </form></section>}
 <section className="guide-note" style={{marginTop:32}}><span className="eyebrow">Before sending anything back</span><h3 style={{marginTop:12}}>Keep the cloth, and the details, safe.</h3><p>For a live order, retain the packaging and item labels. Keep photographs of an incorrect or damaged delivery and confirm the seller’s instructions before washing, altering or returning a piece.</p><a className="link" href={base+"CustomerCare"}>Purchase & support notes →</a></section>
 </main></Shell>;
}

import { useState } from "react";
import { Pencil, Plus, ArrowRight } from "lucide-react";
import { Shell,PageHero,base } from "./_shared";

type Details={name:string;email:string;phone:string};
type Address={id:string;label:string;recipient:string;street:string;city:string;state:string;pin:string};
const initial:Details={name:"",email:"",phone:""};
const blankAddress:Address={id:"",label:"Home",recipient:"",street:"",city:"",state:"",pin:""};
function read<T,>(key:string,fallback:T):T{try{return JSON.parse(localStorage.getItem(key)||"null")||fallback}catch{return fallback}}

export function Profile(){
 const [details,setDetails]=useState<Details>(()=>read("kq-profile-details",initial));
 const [draft,setDraft]=useState(details),[editing,setEditing]=useState(false),[feedback,setFeedback]=useState("");
 const [addresses,setAddresses]=useState<Address[]>(()=>read("kq-profile-addresses",[]));
 const [address,setAddress]=useState<Address|null>(null),[deleting,setDeleting]=useState<string|null>(null);
 const persistAddresses=(next:Address[])=>{localStorage.setItem("kq-profile-addresses",JSON.stringify(next));setAddresses(next)};
 return <Shell><PageHero eyebrow="Saved preferences · This browser" title="Welcome home, to your weaves." subtitle="Optional contact details and addresses are saved only in this browser. There is no account or authentication service."/>
 <main className="wrap content">
  {feedback&&<div className="notice profile-feedback" role="status">{feedback}</div>}
   <div className="profile-layout"><aside className="profile-card"><div className="profile-monogram" aria-hidden="true">{details.name.trim()?details.name.trim().split(/\s+/).slice(0,2).map(part=>part[0]).join("").toUpperCase():"CK"}</div><span className="eyebrow">Saved locally</span><h2>{details.name||"Your details"}</h2><p style={{fontSize:12,overflowWrap:"anywhere"}}>{details.email||"No email saved"}</p><nav className="profile-nav" aria-label="Your saved preferences"><a href="#personal-details">Personal details</a><a href="#saved-addresses">Saved addresses</a><a href={base+"Orders"}>Order information →</a><a href={base+"Wishlist"}>Your wishlist →</a><a href={base+"CustomerCare"}>Customer care →</a></nav><a className="btn gold" href={base+"Account"}>Account information</a><p style={{fontSize:10}}>Local details do not create an account or affect checkout.</p></aside>
  <div><section className="panel profile-section" id="personal-details"><div className="section-head"><div><span className="eyebrow">01 / The small details</span><h2 style={{marginTop:10}}>Personal details</h2></div>{!editing&&<button className="btn small outline" onClick={()=>{setDraft(details);setEditing(true);setFeedback("")}}><Pencil size={13}/>Edit details</button>}</div>
    {editing?<form className="form" onSubmit={e=>{e.preventDefault();localStorage.setItem("kq-profile-details",JSON.stringify(draft));setDetails(draft);setEditing(false);setFeedback("Saved on this device only.")}}>
     <div className="field"><label htmlFor="profile-name">Name (optional)</label><input id="profile-name" maxLength={80} value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})}/></div>
     <div className="cols"><div className="field"><label htmlFor="profile-email">Email (optional)</label><input id="profile-email" type="email" value={draft.email} onChange={e=>setDraft({...draft,email:e.target.value})}/></div><div className="field"><label htmlFor="profile-phone">Phone (optional)</label><input id="profile-phone" type="tel" value={draft.phone} onChange={e=>setDraft({...draft,phone:e.target.value})}/></div></div>
     <div className="actions"><button className="btn small">Save on this device</button><button type="button" className="btn small outline" onClick={()=>setEditing(false)}>Cancel</button></div>
    </form>:<dl><dt className="eyebrow">Name</dt><dd style={{margin:"8px 0 24px"}}>{details.name||"Not saved"}</dd><dt className="eyebrow">Email</dt><dd style={{margin:"8px 0 24px",overflowWrap:"anywhere"}}>{details.email||"Not saved"}</dd><dt className="eyebrow">Phone</dt><dd style={{margin:"8px 0"}}>{details.phone||"Not saved"}</dd></dl>}
    <p className="muted" style={{fontSize:11}}>Stored locally only. This does not update a customer record.</p>
  </section>
  <section className="panel profile-section" id="saved-addresses"><div className="section-head"><div><span className="eyebrow">02 / A place to return to</span><h2 style={{marginTop:10}}>Saved addresses</h2></div><button className="btn small outline" onClick={()=>{setAddress({...blankAddress});setFeedback("");setDeleting(null)}}><Plus size={14}/>Add address</button></div>
    {addresses.length?<div className="address-list">{addresses.map(a=><article className="guide-note" key={a.id}><span className="eyebrow">{a.label}</span><h3 style={{fontSize:24,marginTop:12}}>{a.recipient}</h3><p>{a.street}{"\n"}{a.city}, {a.state}{"\n"}{a.pin}</p><div className="actions"><button className="btn small outline" onClick={()=>{setAddress({...a});setDeleting(null)}}>Edit</button><button className="btn small outline" onClick={()=>setDeleting(a.id)}>Delete</button></div>{deleting===a.id&&<div className="notice" style={{marginTop:15}}><p>Remove this saved address? This cannot be undone.</p><div className="actions"><button className="btn small" onClick={()=>{persistAddresses(addresses.filter(x=>x.id!==a.id));setDeleting(null);if(address?.id===a.id)setAddress(null);setFeedback("Saved address removed from this device.")}}>Confirm delete</button><button className="btn small outline" onClick={()=>setDeleting(null)}>Keep address</button></div></div>}</article>)}</div>:<div className="guide-note"><h3>No addresses, yet.</h3><p className="muted">You may save an address on this device for your own reference. It is not sent to the brand and does not affect availability or delivery.</p></div>}
    {address&&<form className="form" style={{marginTop:26,borderTop:"1px solid var(--line)",paddingTop:24}} onSubmit={e=>{e.preventDefault();const saved={...address,id:address.id||crypto.randomUUID()};persistAddresses(address.id?addresses.map(a=>a.id===address.id?saved:a):[...addresses,saved]);setAddress(null);setFeedback("Address saved on this device only.")}}>
     <h3>{address.id?"Edit":"Add"} a saved address</h3><p className="muted" style={{fontSize:11}}>Saved in this browser only. It is not submitted to the brand or used for delivery.</p>
    {([["label","Address label"],["recipient","Recipient"],["street","House, street & area"],["city","City"],["state","State"],["pin","PIN code"]] as const).map(([key,label])=><div className="field" key={key}><label htmlFor={"address-"+key}>{label}</label><input id={"address-"+key} required maxLength={key==="pin"?6:160} pattern={key==="pin"?"[1-9][0-9]{5}":undefined} inputMode={key==="pin"?"numeric":undefined} value={address[key]} onChange={e=>setAddress({...address,[key]:e.target.value})}/></div>)}
    <div className="actions"><button className="btn small">Save address</button><button type="button" className="btn small outline" onClick={()=>setAddress(null)}>Cancel</button></div>
   </form>}
  </section>
  <section className="guide-note"><span className="eyebrow">A little help, close by</span><h3 style={{marginTop:12}}>From choosing to keeping.</h3><p>Find guidance on choosing a textile, confirming purchase details and looking after a favourite saree.</p><a className="link" href={base+"CustomerCare"}>Visit customer care <ArrowRight size={13}/></a></section>
  </div></div>
 </main></Shell>;
}

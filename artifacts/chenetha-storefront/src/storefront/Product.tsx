import { useEffect, useRef, useState } from "react";
import { Heart, Check, ArrowRight } from "lucide-react";
import { useLocation } from "wouter";
import { Shell, products, format, addItem, ProductGrid, base, useStore, Qty, Empty } from "./_shared";
import { ShopifyProductRoute } from "./ShopifyCatalog";
import { useShopperPreferences } from "./ShopperPreferences";

export function Product() {
 const [location] = useLocation();
 const search = location.includes("?") ? location.slice(location.indexOf("?") + 1) : window.location.search.slice(1);
 const params = new URLSearchParams(search);
 const productHandle = params.get("product") || params.get("shopify");
 return productHandle
    ? <ShopifyProductRoute key={productHandle} handle={productHandle}/>
  : <SampleProductRoute id={params.get("id") || "nila"}/>;
}

function SampleProductRoute({id}:{id:string}) {
 const p = products.find(x=>x.id===id);
 const [qty,setQty] = useState(1), [view,setView] = useState(0), [toast,setToast] = useState(""), [pin,setPin] = useState(""), [pinMsg,setPinMsg] = useState("");
 const wish = useStore("kq-wish");
 const {toggleWishlist} = useShopperPreferences();
 const timeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
 useEffect(()=>()=>clearTimeout(timeout.current),[]);
 const notice = (text:string) => {clearTimeout(timeout.current);setToast(text);timeout.current=setTimeout(()=>setToast(""),2600)};
 if (!p) return <Shell><main className="wrap content"><Empty title="This thread is missing." copy="We could not find that sample textile. Return to the collection to choose another piece."/></main></Shell>;
 const swatch = "s"+(products.indexOf(p)%6+1);
 const saved = wish.some(x=>x.id===p.id);
 return <Shell>
  <main className="wrap">
   <nav className="product-breadcrumb" aria-label="Breadcrumb"><a href={base+"Home"}>Home</a><span>/</span><a href={base+"Collections"}>Collections</a><span>/</span><span aria-current="page">{p.name}</span></nav>
   <div className="splitdetail" style={{paddingTop:0}}>
    <section aria-label="Illustrative textile views"><div className={"gallery-main sample-gallery view-"+view}><span className={"textile "+swatch} role="img" aria-label={p.name+" — "+["body pattern","enlarged pattern","weave texture"][view]+", illustrative swatch only"}/><span className="swatch-label">Illustrative pattern · Not product photography</span></div>
     <div className="thumbs">{["Body pattern","Pattern detail","Texture study"].map((label,i)=><button key={label} aria-label={label} aria-pressed={view===i} onClick={()=>setView(i)}><span className={"textile "+swatch} style={{height:80,minHeight:80}}/><span className="thumb-label">{label}</span></button>)}</div>
     <p className="muted" style={{fontSize:11}}>All views show the same sample pattern at different scales. Confirmed product photographs and specifications are still to be supplied.</p>
    </section>
      <section className="detail"><span className="eyebrow">{p.weave} · {p.fabric}</span><h1>{p.name}</h1><p>{p.type}. A sample selection from the Chenetha catalogue. Explore the illustrative pattern, save it for later, add it to your browser-saved bag, or contact the brand to enquire.</p><span className="price">{format(p.price)}</span><p className="muted" style={{fontSize:12}}>Sample catalogue price · Final pricing and availability must be confirmed by the brand.</p>
     <div className="product-sample"><strong>Before choosing a real piece</strong><br/>Fibre composition, dimensions, blouse-piece details, maker information and availability must be confirmed before this item is offered for sale.</div>
      <div className="form" style={{marginTop:22}}><label>Quantity</label><div className="row"><Qty value={qty} onChange={setQty}/><button className="btn" data-testid={`button-add-to-bag-${p.id}`} style={{flex:1}} onClick={()=>{for(let i=0;i<qty;i++)addItem(p.id);notice("Added to your bag")}}>Add to bag · {format(qty*p.price)}</button><button className="iconbtn" aria-label={saved?"Remove from wishlist":"Save to wishlist"} aria-pressed={saved} onClick={()=>{void toggleWishlist(p.id).then(()=>notice(saved?"Removed from your wishlist":"Saved to your wishlist")).catch(()=>notice("Your wishlist could not be saved. Please try again."))}}><Heart fill={saved?"var(--red)":"none"}/></button></div></div>
     <form className="field" style={{marginBottom:24}} onSubmit={e=>{e.preventDefault();setPinMsg(/^[1-9]\d{5}$/.test(pin)?"This PIN is formatted correctly. Delivery availability has not been checked.":"Please enter a valid 6-digit Indian PIN code.")}}><label htmlFor="product-pin">Check PIN format</label><div style={{display:"flex"}}><input id="product-pin" value={pin} onChange={e=>{setPin(e.target.value);setPinMsg("")}} inputMode="numeric" maxLength={6} placeholder="Enter PIN code"/><button className="btn small">Check</button></div><small className="muted" role="status">{pinMsg||"Format check only · Does not check serviceability or delivery."}</small></form>
     <details open><summary>Understanding this textile</summary><p>{p.weave} is a catalogue category, not proof of origin or production method. Slight variation alone does not establish handloom production. <a className="link" href={base+"Collections?category="+(p.type.includes("saree")?"Sarees":"Dupattas")+"&weave="+encodeURIComponent(p.weave)}>Explore this textile category</a></p></details>
     <details><summary>Care & keeping</summary><p>Air after wearing and store only when fully dry. Cleaning depends on the yarn, dye, border and embellishment: always follow the specific care label. <a className="link" href={base+"SareeCare"}>Care notes by fabric</a></p></details>
     <details><summary>Shipping & returns</summary><p>Dispatch windows, serviceable locations, charges and return eligibility are not established in this preview. Confirm the merchant’s published terms before any real purchase.</p><p><a className="link" href={base+"CustomerCare"}>Customer care & purchase notes <ArrowRight size={12}/></a></p></details>
    </section>
   </div>
  </main>
  <section className="section" style={{background:"#efe5d1"}}><div className="wrap"><div className="section-head"><div><span className="eyebrow">Continue discovering</span><h2>Another thread to follow.</h2></div></div><ProductGrid items={products.filter(x=>x.id!==p.id).slice(0,4)}/></div></section>
  {toast&&<div className="toast" role="status"><Check size={15}/> {toast}</div>}
 </Shell>;
}

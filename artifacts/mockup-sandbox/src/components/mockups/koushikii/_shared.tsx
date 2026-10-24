import React, { useEffect, useState } from "react";
import { Search, Heart, ShoppingBag, Menu, X, ArrowRight, Plus, Minus, ChevronRight, Check, ChevronDown, UserRound } from "lucide-react";
import "./_group.css";
import "./_logo.css";
import "./_heritage.css";
import "./_refinements.css";
import { LogoSilhouette } from "./_LogoSilhouette";
import { useDemoSession } from "./_shared/demo-session";
import "./_profile.css";

export const base="/__mockup/preview/koushikii/";
export const products=[
 {id:"nila",region:"tg",name:"Nila Ikat",type:"Cotton-silk saree",weave:"Ikat",fabric:"Cotton-Silk",price:12800,image:"/__mockup/images/koushikii-hero.jpg",tag:"New arrival"},
 {id:"gulmohar",region:"wb",name:"Gulmohar Jamdani",type:"Handwoven cotton saree",weave:"Jamdani",fabric:"Cotton",price:9600,image:"/__mockup/images/koushikii-textiles.jpg",tag:"Pattern study"},
 {id:"surya",region:"tn",name:"Surya Kanchipuram",type:"Pure silk saree",weave:"Kanchipuram",fabric:"Silk",price:26400,image:"/__mockup/images/koushikii-weave.jpg",tag:"Heirloom edit"},
 {id:"noor",region:"jk",name:"Noor Pashmina",type:"Handwoven dupatta",weave:"Pashmina",fabric:"Other blends",price:7400,image:"/__mockup/images/koushikii-textiles.jpg",tag:"Fine fibres"},
 {id:"mira",region:"tg",name:"Mira Narayanpet",type:"Cotton saree",weave:"Narayanpet",fabric:"Cotton",price:8400,image:"/__mockup/images/koushikii-hero.jpg",tag:"Everyday"},
 {id:"indigo",region:"ap",name:"Indigo Mangalagiri",type:"Cotton saree",weave:"Mangalagiri",fabric:"Cotton",price:6900,image:"/__mockup/images/koushikii-weave.jpg",tag:"Loom classic"},
 {id:"ambar",region:"up",name:"Ambar Banarasi",type:"Silk saree",weave:"Banarasi",fabric:"Silk",price:31800,image:"/__mockup/images/koushikii-textiles.jpg",tag:"Heirloom edit"},
 {id:"rekha",region:"mn",name:"Rekha Moirang Phee",type:"Woven dupatta",weave:"Moirang Phee",fabric:"Cotton",price:5200,image:"/__mockup/images/koushikii-hero.jpg",tag:"Just arrived"},
];
export type Item={id:string;qty:number};
export function getItems(key:string):Item[]{try{return JSON.parse(localStorage.getItem(key)||"[]")}catch{return []}}
export function saveItems(key:string,items:Item[]){localStorage.setItem(key,JSON.stringify(items));window.dispatchEvent(new Event("kq-storage"))}
export function format(n:number){return `₹${n.toLocaleString("en-IN")}`}
const WHATSAPP_BUSINESS_NUMBER="916309741049";
export function whatsappOrderUrl(message:string){return `https://wa.me/${WHATSAPP_BUSINESS_NUMBER}?text=${encodeURIComponent(message)}`}
function WhatsAppMark(){return <svg className="whatsapp-mark" viewBox="0 0 32 32" aria-hidden="true"><path d="M16 3.2a12.5 12.5 0 0 0-10.7 19L3.5 28.5l6.5-1.7A12.5 12.5 0 1 0 16 3.2Z" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinejoin="round"/><path d="M12.1 9.7c-.4-.9-.8-.9-1.2-.9h-1c-.4 0-.9.2-1.3.7s-1.7 1.7-1.7 4.1 1.8 4.7 2 5c.2.4 3.5 5.6 8.6 7.6 4.2 1.7 5.1 1.3 6 1.2.9-.1 2.9-1.2 3.3-2.4.4-1.2.4-2.2.3-2.4-.1-.2-.4-.4-.9-.6l-3.1-1.5c-.4-.2-.8-.3-1.1.3-.4.6-1.3 1.6-1.6 2-.3.4-.6.4-1.1.1-.5-.2-2.1-.8-4-2.5-1.5-1.3-2.5-2.9-2.8-3.4-.3-.5 0-.8.2-1 .2-.2.5-.6.7-.9.2-.3.3-.5.5-.8.2-.3.1-.6 0-.9l-1.3-3.2Z" fill="currentColor" transform="translate(2 -2) scale(.82)"/></svg>}
export function WhatsAppOrderLink({message,children,className="whatsapp-order-button"}:{message:string;children:React.ReactNode;className?:string}){
 return <a className={className} href={whatsappOrderUrl(message)} target="_blank" rel="noopener noreferrer" aria-label="Order on WhatsApp" title="Order on WhatsApp"><WhatsAppMark/><span>{children}</span></a>;
}
export function WhatsAppOverlay(){
 return <WhatsAppOrderLink className="whatsapp-overlay-button" message="Namaste, I’d like to ask about a handloom piece from Chenetha by Koushikii. Please share the current product details and availability.">Order on WhatsApp</WhatsAppOrderLink>;
}
export function addItem(id:string){const list=getItems("kq-cart");const found=list.find(x=>x.id===id);if(found)found.qty++;else list.push({id,qty:1});saveItems("kq-cart",list)}
export function toggleWish(id:string){const list=getItems("kq-wish");saveItems("kq-wish",list.some(x=>x.id===id)?list.filter(x=>x.id!==id):[...list,{id,qty:1}])}
export function useStore(key:string){const [items,set]=useState<Item[]>(()=>getItems(key));useEffect(()=>{const sync=()=>set(getItems(key));window.addEventListener("storage",sync);window.addEventListener("kq-storage",sync);return()=>{window.removeEventListener("storage",sync);window.removeEventListener("kq-storage",sync)}},[key]);return items}
export const cottonWeaves = ["Mangalagiri Cotton","Narayanpet","Venkatagiri","Gadwal","Kasaragod","Paithani","Kala Cotton","Patola","Ikat","Moirang Phee","Kanchi Cottons","Chettinad Cottons","Banaras Cottons","Kota Cottons"];
export function TempleBorder(){return <div className="temple-border" aria-hidden="true"/>}
export function Header(){
 const signedIn=useDemoSession();
 const [menu,setMenu]=useState(false),[search,setSearch]=useState(false);
 const cart=useStore("kq-cart"),wish=useStore("kq-wish");
 return <><div className="topline">The living art of handloom · Rooted in the South, woven across India</div>
 <header className="header"><div className="wrap headrow">
  <button className="iconbtn mobile-menu" onClick={()=>setMenu(!menu)} aria-expanded={menu} aria-controls="kq-main-menu" aria-label="Toggle main menu">{menu?<X size={20}/>:<Menu size={20}/>}</button>
  <a className="brand" href={base+"Home"}><img src="/__mockup/images/koushikii/wordmark-red.png" alt="Chenetha by Koushikii"/></a>
  <nav id="kq-main-menu" aria-label="Main menu" className={`nav ${menu?"open":""}`}>
   <details className="collection-nav"><summary>Collections <ChevronDown size={13}/></summary>
      <div className="mega-menu"><div><strong>Regional handlooms</strong><div className="cotton-links">{cottonWeaves.map(w=><a key={w} href={base+"Collections?category=Sarees&weave="+encodeURIComponent(w.replace(/ Cottons?$/,""))}>{w}</a>)}</div><a href={base+"Collections?category=Sarees"} className="link" style={{marginTop:18}}>Discover regional sarees →</a></div>
    <div><strong>Shop by Fabric</strong>{["Cotton","Silk","Cotton-Silk","Other blends"].map(f=><a key={f} href={base+"Collections?fabric="+encodeURIComponent(f)}>{f}</a>)}
     <div className="menu-weaves"><strong>Shop by Weave</strong>{["Ikat","Jamdani","Kanchipuram","Banarasi","Pashmina"].map(w=><a key={w} href={base+"Collections?category="+(w==="Pashmina"?"Dupattas":"Sarees")+"&weave="+w}>{w}</a>)}<a href={base+"Collections"}>View all collections →</a></div></div></div>
   </details>
    <a href={base+"OurStory"}>About Us</a><a href={base+"Contact"}>Contact Us</a>
  </nav>
  <div className="head-actions"><button className="text-action" aria-label="Search" aria-expanded={search} onClick={()=>setSearch(!search)}><Search size={16}/>Search</button>
   <a href={base+(signedIn?"Profile":"Account")} className="text-action" aria-label={signedIn?"Demo profile":"Log in"}><UserRound size={16}/>{signedIn?"My profile":"Log in"}</a>
  <a href={base+"Wishlist"} className="iconbtn optional" aria-label="Wishlist"><Heart size={17}/>{wish.length>0&&<span className="count">{wish.length}</span>}</a>
  <a href={base+"Cart"} className="iconbtn" aria-label="Shopping bag"><ShoppingBag size={18}/>{cart.length>0&&<span className="count">{cart.reduce((a,b)=>a+b.qty,0)}</span>}</a></div>
 </div>{search&&<div className="wrap searchline active"><form style={{display:"flex",width:"100%"}} action={base+"Collections"}><input name="q" aria-label="Search textiles" placeholder="Search Ikat, cotton, Kanchipuram…" autoFocus/><button className="btn small">Search</button></form></div>}</header></>
}
export function Footer(){
 const [subscribed,setSubscribed]=useState(false);
 return <footer className="footer"><TempleBorder/><div className="wrap">
 <div className="newsletter"><div><h3>Letters from the loom</h3><p>New weaves, care notes and the stories behind the cloth.</p></div>
 <div>{subscribed?<p role="status">Thank you. Your sign-up is recorded for this demo only.</p>:<form onSubmit={e=>{e.preventDefault();setSubscribed(true)}}><input required type="email" aria-label="Newsletter email address" placeholder="Your email address"/><button className="btn gold">Subscribe <ArrowRight size={14}/></button></form>}<p style={{fontSize:10}}>Preview only · No email is sent or shared.</p></div></div>
 <div className="footgrid"><div><a className="footbrand" href={base+"Home"}><LogoSilhouette/></a><p>Sarees and dupattas. The warmth of a hand, the memory of a loom.</p><a href={base+"OurStory"}>Follow the thread <ArrowRight size={13}/></a></div>
 <div><h4>Shop</h4><p><a href={base+"Collections"}>Collections</a><br/><a href={base+"Collections?edit=new"}>New Arrivals</a><br/><a href={base+"Collections?edit=premium"}>Premium Collection</a><br/><a href={base+"OurStory"}>About Us</a></p></div>
   <div><h4>Cloth & care</h4><p><a href={base+"Collections"}>Discover our weaves</a><br/><a href={base+"SareeCare"}>Saree care</a><br/><a href={base+"CustomerCare"}>Customer care & purchase notes</a><br/><a href={base+"Orders"}>Orders & tracking</a><br/><a href={base+"Contact"}>Contact Us</a></p></div>
  <div><h4>Your account</h4><p><a href={base+"Account"}>Log in</a><br/><a href={base+"Profile"}>Demo profile</a><br/><a href={base+"Orders"}>Orders & returns</a><br/><a href={base+"Wishlist"}>Your wishlist</a></p></div></div>
 <div className="copyright">© Chenetha by Koushikii · Design preview · Sample catalog, illustrative artwork and demo checkout.</div></div></footer>
}
export function Shell({children}:{children:React.ReactNode}){return <div className="kq"><Header/>{children}<Footer/><WhatsAppOverlay/></div>}
export function PageHero({eyebrow,title,subtitle}:{eyebrow:string;title:string;subtitle?:string}){return <div className="pagehero"><div className="wrap"><span className="eyebrow">{eyebrow}</span><h1>{title}</h1>{subtitle&&<p>{subtitle}</p>}</div></div>}
export function ProductCard({product:p}:{product:typeof products[number]}){const wish=useStore("kq-wish");const active=wish.some(x=>x.id===p.id);return <article className="product-card"><a href={base+"Product?id="+p.id} className="product-img"><span className={`textile s${products.indexOf(p)%6+1}`} role="img" aria-label={p.name+" — illustrative textile swatch"}/><span className="pill" style={{position:"absolute",left:12,top:12}}>{p.tag}</span></a><button className="heart" aria-label={active?"Remove from wishlist":"Add to wishlist"} aria-pressed={active} onClick={()=>toggleWish(p.id)}><Heart size={16} fill={active?"#8f2429":"none"}/></button><a href={base+"Product?id="+p.id}><h3>{p.name}</h3></a><p>{p.type} · {p.weave}</p><span className="price">{format(p.price)}</span></article>}
export function ProductGrid({items=products}:{items?:typeof products}){return <div className="products">{items.map(p=><ProductCard key={p.id} product={p}/>)}</div>}
export function Toast({text}:{text:string}){return <div className="toast"><Check size={15} style={{display:"inline",marginRight:8}}/>{text}</div>}
export function Qty({value,onChange}:{value:number;onChange:(n:number)=>void}){return <div className="qty"><button aria-label="Decrease quantity" onClick={()=>onChange(Math.max(1,value-1))}><Minus size={14}/></button><span>{value}</span><button aria-label="Increase quantity" onClick={()=>onChange(value+1)}><Plus size={14}/></button></div>}
export function Empty({title,copy,cta="Browse the collection",href=base+"Collections"}:{title:string;copy:string;cta?:string;href?:string}){return <div className="empty"><span className="eyebrow">A fresh beginning</span><h2 style={{fontSize:42,margin:"14px 0"}}>{title}</h2><p>{copy}</p><a className="btn" href={href}>{cta}<ArrowRight size={15}/></a></div>}
export function moneySub(items:Item[]){return items.reduce((sum,x)=>sum+(products.find(p=>p.id===x.id)?.price||0)*x.qty,0)}
export function PageLink({to,children}:{to:string;children:React.ReactNode}){return <a className="link" href={base+to}>{children} <ChevronRight size={12}/></a>}

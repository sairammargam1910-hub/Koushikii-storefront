import React, { useEffect, useState } from "react";
import { Search, Heart, ShoppingBag, Menu, X, ArrowRight, Plus, Minus, Instagram, ChevronRight, Check, ChevronDown, UserRound } from "lucide-react";
import "./_group.css";
import "./_logo.css";
import "./_heritage.css";

export const base="/__mockup/preview/koushikii/";
export const products=[
 {id:"nila",name:"Nila Ikat",type:"Cotton-silk saree",weave:"Ikat",fabric:"Cotton-Silk",price:12800,image:"/__mockup/images/koushikii-hero.jpg",tag:"New arrival"},
 {id:"gulmohar",name:"Gulmohar Jamdani",type:"Handwoven cotton saree",weave:"Jamdani",fabric:"Cotton",price:9600,image:"/__mockup/images/koushikii-textiles.jpg",tag:"Small batch"},
 {id:"surya",name:"Surya Kanchipuram",type:"Pure silk saree",weave:"Kanchipuram",fabric:"Silk",price:26400,image:"/__mockup/images/koushikii-weave.jpg",tag:"Heirloom"},
 {id:"noor",name:"Noor Pashmina",type:"Handwoven dupatta",weave:"Pashmina",fabric:"Other blends",price:7400,image:"/__mockup/images/koushikii-textiles.jpg",tag:"Hand-finished"},
 {id:"mira",name:"Mira Narayanpet",type:"Cotton saree",weave:"Narayanpet",fabric:"Cotton",price:8400,image:"/__mockup/images/koushikii-hero.jpg",tag:"Everyday"},
 {id:"indigo",name:"Indigo Mangalagiri",type:"Cotton saree",weave:"Mangalagiri",fabric:"Cotton",price:6900,image:"/__mockup/images/koushikii-weave.jpg",tag:"Loom classic"},
 {id:"ambar",name:"Ambar Banarasi",type:"Silk saree",weave:"Banarasi",fabric:"Silk",price:31800,image:"/__mockup/images/koushikii-textiles.jpg",tag:"Heirloom"},
 {id:"rekha",name:"Rekha Moirang Phee",type:"Woven dupatta",weave:"Moirang Phee",fabric:"Cotton",price:5200,image:"/__mockup/images/koushikii-hero.jpg",tag:"Just arrived"},
];
export type Item={id:string;qty:number};
export function getItems(key:string):Item[]{try{return JSON.parse(localStorage.getItem(key)||"[]")}catch{return []}}
export function saveItems(key:string,items:Item[]){localStorage.setItem(key,JSON.stringify(items));window.dispatchEvent(new Event("kq-storage"))}
export function format(n:number){return `₹${n.toLocaleString("en-IN")}`}
export function addItem(id:string){const list=getItems("kq-cart");const found=list.find(x=>x.id===id);if(found)found.qty++;else list.push({id,qty:1});saveItems("kq-cart",list)}
export function toggleWish(id:string){const list=getItems("kq-wish");saveItems("kq-wish",list.some(x=>x.id===id)?list.filter(x=>x.id!==id):[...list,{id,qty:1}])}
export function useStore(key:string){const [items,set]=useState<Item[]>(()=>getItems(key));useEffect(()=>{const sync=()=>set(getItems(key));window.addEventListener("storage",sync);window.addEventListener("kq-storage",sync);return()=>{window.removeEventListener("storage",sync);window.removeEventListener("kq-storage",sync)}},[key]);return items}
export const cottonWeaves = ["Mangalagiri Cotton","Narayanpet","Venkatagiri","Gadwal","Kosargad","Paithani","Kala Cotton","Patola","Ikat","Moirang Phee","Kanchi Cottons","Chettinad Cottons","Banaras Cottons","Kota Cottons"];
export function TempleBorder(){return <div className="temple-border" aria-hidden="true"/>}
export function Header(){
 const [menu,setMenu]=useState(false),[search,setSearch]=useState(false);
 const cart=useStore("kq-cart"),wish=useStore("kq-wish");
 return <><div className="topline">The living art of handloom · Rooted in the South, woven across India</div>
 <header className="header"><div className="wrap headrow">
  <button className="iconbtn mobile-menu" onClick={()=>setMenu(!menu)} aria-expanded={menu} aria-controls="kq-main-menu" aria-label="Toggle main menu">{menu?<X size={20}/>:<Menu size={20}/>}</button>
  <a className="brand" href={base+"Home"}><img src="/__mockup/images/koushikii/wordmark-red.png" alt="Chenetha by Koushikii"/></a>
  <nav id="kq-main-menu" aria-label="Main menu" className={`nav ${menu?"open":""}`}>
   <details className="collection-nav"><summary>Collections <ChevronDown size={13}/></summary>
    <div className="mega-menu"><div><strong>Cotton handlooms</strong><div className="cotton-links">{cottonWeaves.map(w=><a key={w} href={base+"Collections?weave="+encodeURIComponent(w.replace(" Cotton",""))}>{w}</a>)}</div></div>
    <div><strong>Shop by Fabric</strong>{["Cotton","Silk","Cotton-Silk","Other blends"].map(f=><a key={f} href={base+"Collections?fabric="+encodeURIComponent(f)}>{f}</a>)}
    <div className="menu-weaves"><strong>Shop by Weave</strong>{["Ikat","Jamdani","Kanchipuram","Banarasi","Pashmina"].map(w=><a key={w} href={base+"Collections?weave="+w}>{w}</a>)}<a href={base+"Collections"}>View all collections →</a></div></div></div>
   </details>
   <a href={base+"OurStory"}>About Us</a><a href={base+"Journal"}>Blog</a><a href={base+"Contact"}>Contact Us</a>
  </nav>
  <div className="head-actions"><button className="text-action" aria-label="Search" aria-expanded={search} onClick={()=>setSearch(!search)}><Search size={16}/>Search</button>
  <a href={base+"Account"} className="text-action" aria-label="Log in"><UserRound size={16}/>Log in</a>
  <a href={base+"Wishlist"} className="iconbtn optional" aria-label="Wishlist"><Heart size={17}/>{wish.length>0&&<span className="count">{wish.length}</span>}</a>
  <a href={base+"Cart"} className="iconbtn" aria-label="Shopping bag"><ShoppingBag size={18}/>{cart.length>0&&<span className="count">{cart.reduce((a,b)=>a+b.qty,0)}</span>}</a></div>
 </div>{search&&<div className="wrap searchline active"><form style={{display:"flex",width:"100%"}} action={base+"Collections"}><input name="q" aria-label="Search textiles" placeholder="Search Ikat, cotton, Kanchipuram…" autoFocus/><button className="btn small">Search</button></form></div>}</header></>
}
export function Footer(){
 const [subscribed,setSubscribed]=useState(false);
 return <footer className="footer"><TempleBorder/><div className="wrap">
 <div className="newsletter"><div><h3>Letters from the loom</h3><p>New weaves, care notes and the stories behind the cloth.</p></div>
 <div>{subscribed?<p role="status">Thank you. Your sign-up is recorded for this demo only.</p>:<form onSubmit={e=>{e.preventDefault();setSubscribed(true)}}><input required type="email" aria-label="Newsletter email address" placeholder="Your email address"/><button className="btn gold">Subscribe <ArrowRight size={14}/></button></form>}<p style={{fontSize:10}}>Preview only · No email is sent or shared.</p></div></div>
 <div className="footgrid"><div><div className="footbrand"><img src="/__mockup/images/koushikii/wordmark-white.png" alt="Chenetha by Koushikii"/></div><p>Sarees and dupattas. The warmth of a hand, the memory of a loom.</p><a href={base+"Journal"}>Follow the thread <Instagram size={13}/></a></div>
 <div><h4>Shop</h4><p><a href={base+"Collections"}>Collections</a><br/><a href={base+"Collections?edit=new"}>New Arrivals</a><br/><a href={base+"Collections?edit=premium"}>Premium Collection</a><br/><a href={base+"OurStory"}>About Us</a></p></div>
 <div><h4>Here to help</h4><p><a href={base+"Help"}>FAQs & care guide</a><br/><a href={base+"TrackOrder"}>Track an order</a><br/><a href={base+"Contact"}>Contact Us</a><br/><a href={base+"Journal"}>Blog</a></p></div>
 <div><h4>Your account</h4><p><a href={base+"Policies"}>Draft policies</a><br/><a href={base+"Account"}>Log in</a><br/><a href={base+"Orders"}>Orders & returns</a><br/><a href={base+"Wishlist"}>Your wishlist</a></p></div></div>
 <div className="copyright">© Chenetha by Koushikii · Design preview · Sample catalog, illustrative artwork and demo checkout.</div></div></footer>
}
export function Shell({children}:{children:React.ReactNode}){return <div className="kq"><Header/>{children}<Footer/></div>}
export function PageHero({eyebrow,title,subtitle}:{eyebrow:string;title:string;subtitle?:string}){return <div className="pagehero"><div className="wrap"><span className="eyebrow">{eyebrow}</span><h1>{title}</h1>{subtitle&&<p>{subtitle}</p>}</div></div>}
export function ProductCard({product:p}:{product:typeof products[number]}){const wish=useStore("kq-wish");const active=wish.some(x=>x.id===p.id);return <article className="product-card"><a href={base+"Product?id="+p.id} className="product-img"><span className={`textile s${products.indexOf(p)%6+1}`} role="img" aria-label={p.name+" — illustrative textile swatch"}/><span className="pill" style={{position:"absolute",left:12,top:12}}>{p.tag}</span></a><button className="heart" aria-label={active?"Remove from wishlist":"Add to wishlist"} aria-pressed={active} onClick={()=>toggleWish(p.id)}><Heart size={16} fill={active?"#8f2429":"none"}/></button><a href={base+"Product?id="+p.id}><h3>{p.name}</h3></a><p>{p.type} · {p.weave}</p><span className="price">{format(p.price)}</span></article>}
export function ProductGrid({items=products}:{items?:typeof products}){return <div className="products">{items.map(p=><ProductCard key={p.id} product={p}/>)}</div>}
export function Toast({text}:{text:string}){return <div className="toast"><Check size={15} style={{display:"inline",marginRight:8}}/>{text}</div>}
export function Qty({value,onChange}:{value:number;onChange:(n:number)=>void}){return <div className="qty"><button aria-label="Decrease quantity" onClick={()=>onChange(Math.max(1,value-1))}><Minus size={14}/></button><span>{value}</span><button aria-label="Increase quantity" onClick={()=>onChange(value+1)}><Plus size={14}/></button></div>}
export function Empty({title,copy,cta="Browse the collection",href=base+"Collections"}:{title:string;copy:string;cta?:string;href?:string}){return <div className="empty"><span className="eyebrow">A fresh beginning</span><h2 style={{fontSize:42,margin:"14px 0"}}>{title}</h2><p>{copy}</p><a className="btn" href={href}>{cta}<ArrowRight size={15}/></a></div>}
export function moneySub(items:Item[]){return items.reduce((sum,x)=>sum+(products.find(p=>p.id===x.id)?.price||0)*x.qty,0)}
export function PageLink({to,children}:{to:string;children:React.ReactNode}){return <a className="link" href={base+to}>{children} <ChevronRight size={12}/></a>}

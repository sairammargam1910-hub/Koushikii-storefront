import React, { useEffect, useRef, useState } from "react";
import { Search, Heart, ShoppingBag, Menu, X, ArrowRight, Plus, Minus, ChevronRight, Check, ChevronDown, UserRound, Languages, Instagram, Mail } from "lucide-react";
import "./_group.css";
import "./_logo.css";
import "./_heritage.css";
import "./_refinements.css";
import { LogoSilhouette } from "./_LogoSilhouette";
import { languageNames, localizeTree, readStoreLanguage, type StoreLanguage } from "./_locale";
import "./_profile.css";
import "./_storefront-pattern.css";
import "./_mobile.css";
import { useLocation } from "wouter";
import { useShopifyCartMeta } from "./shopifyCartState";
import { Show } from "@clerk/react";
import { useShopperPreferences } from "./ShopperPreferences";

export const base="/";
export const products=[
 {id:"nila",region:"tg",name:"Nila Ikat",type:"Cotton-silk saree",weave:"Ikat",fabric:"Cotton-Silk",price:12800,image:"/images/koushikii-hero.jpg",tag:"New arrival"},
 {id:"gulmohar",region:"wb",name:"Gulmohar Jamdani",type:"Handwoven cotton saree",weave:"Jamdani",fabric:"Cotton",price:9600,image:"/images/koushikii-textiles.jpg",tag:"Pattern study"},
 {id:"surya",region:"tn",name:"Surya Kanchipuram",type:"Pure silk saree",weave:"Kanchipuram",fabric:"Silk",price:26400,image:"/images/koushikii-weave.jpg",tag:"Heirloom edit"},
 {id:"noor",region:"jk",name:"Noor Pashmina",type:"Handwoven dupatta",weave:"Pashmina",fabric:"Other blends",price:7400,image:"/images/koushikii-textiles.jpg",tag:"Fine fibres"},
 {id:"mira",region:"tg",name:"Mira Narayanpet",type:"Cotton saree",weave:"Narayanpet",fabric:"Cotton",price:8400,image:"/images/koushikii-hero.jpg",tag:"Everyday"},
 {id:"indigo",region:"ap",name:"Indigo Mangalagiri",type:"Cotton saree",weave:"Mangalagiri",fabric:"Cotton",price:6900,image:"/images/koushikii-weave.jpg",tag:"Loom classic"},
 {id:"ambar",region:"up",name:"Ambar Banarasi",type:"Silk saree",weave:"Banarasi",fabric:"Silk",price:31800,image:"/images/koushikii-textiles.jpg",tag:"Heirloom edit"},
 {id:"rekha",region:"mn",name:"Rekha Moirang Phee",type:"Woven dupatta",weave:"Moirang Phee",fabric:"Cotton",price:5200,image:"/images/koushikii-hero.jpg",tag:"Just arrived"},
];
export type Item={id:string;qty:number};
export function getItems(key:string):Item[]{try{return JSON.parse(localStorage.getItem(key)||"[]")}catch{return []}}
export function saveItems(key:string,items:Item[]){localStorage.setItem(key,JSON.stringify(items));window.dispatchEvent(new Event("kq-storage"))}
export const SHOPIFY_CART_PREFIX="shopify:";
export function shopifyCartItemId(variantId:string){return `${SHOPIFY_CART_PREFIX}${variantId}`}
export function isShopifyCartItem(item:Item){return item.id.startsWith(SHOPIFY_CART_PREFIX)}
export function addShopifyVariant(variantId:string,quantity=1){
 const id=shopifyCartItemId(variantId),list=getItems("kq-cart"),found=list.find(item=>item.id===id);
 if(found)found.qty=Math.min(250,found.qty+quantity);else list.push({id,qty:Math.min(250,quantity)});
 saveItems("kq-cart",list);
}
export function format(n:number){return `₹${n.toLocaleString("en-IN")}`}
const WHATSAPP_BUSINESS_NUMBER="917981614119";
export function whatsappOrderUrl(message:string){return `https://wa.me/${WHATSAPP_BUSINESS_NUMBER}?text=${encodeURIComponent(message)}`}
function WhatsAppMark(){return <svg className="whatsapp-mark" viewBox="0 0 32 32" aria-hidden="true"><path d="M16 3.2a12.5 12.5 0 0 0-10.7 19L3.5 28.5l6.5-1.7A12.5 12.5 0 1 0 16 3.2Z" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinejoin="round"/><path d="M12.1 9.7c-.4-.9-.8-.9-1.2-.9h-1c-.4 0-.9.2-1.3.7s-1.7 1.7-1.7 4.1 1.8 4.7 2 5c.2.4 3.5 5.6 8.6 7.6 4.2 1.7 5.1 1.3 6 1.2.9-.1 2.9-1.2 3.3-2.4.4-1.2.4-2.2.3-2.4-.1-.2-.4-.4-.9-.6l-3.1-1.5c-.4-.2-.8-.3-1.1.3-.4.6-1.3 1.6-1.6 2-.3.4-.6.4-1.1.1-.5-.2-2.1-.8-4-2.5-1.5-1.3-2.5-2.9-2.8-3.4-.3-.5 0-.8.2-1 .2-.2.5-.6.7-.9.2-.3.3-.5.5-.8.2-.3.1-.6 0-.9l-1.3-3.2Z" fill="currentColor" transform="translate(2 -2) scale(.82)"/></svg>}
export function WhatsAppOrderLink({message,children,className="whatsapp-order-button"}:{message:string;children:React.ReactNode;className?:string}){
 return <a className={className} href={whatsappOrderUrl(message)} target="_blank" rel="noopener noreferrer" aria-label="Order on WhatsApp" title="Order on WhatsApp"><WhatsAppMark/><span>{children}</span></a>;
}
function WhatsAppHeaderIcon({language}:{language:StoreLanguage}){
 const messages:Record<StoreLanguage,string>={
  en:"Namaste, I’d like to ask about a handloom piece from Chenetha by Koushikii. Please share the current product details and availability.",
  te:"నమస్కారం, Chenetha by Koushikii చేనేత వస్త్రం గురించి తెలుసుకోవాలనుకుంటున్నాను. దయచేసి ప్రస్తుత ఉత్పత్తి వివరాలు, లభ్యత తెలియజేయండి.",
  hi:"नमस्ते, मुझे Chenetha by Koushikii के हथकरघा वस्त्र की जानकारी चाहिए। कृपया मौजूदा उत्पाद का विवरण और उपलब्धता बताएं।",
 };
 return <a className="iconbtn header-whatsapp" href={whatsappOrderUrl(messages[language])} target="_blank" rel="noopener noreferrer" aria-label="Order on WhatsApp" title="Order on WhatsApp"><WhatsAppMark/></a>;
}
export function addItem(id:string){const list=getItems("kq-cart");const found=list.find(x=>x.id===id);if(found)found.qty++;else list.push({id,qty:1});saveItems("kq-cart",list)}
export function useStore(key:string){const shopper=useShopperPreferences();const [items,set]=useState<Item[]>(()=>getItems(key));useEffect(()=>{const sync=()=>set(getItems(key));window.addEventListener("storage",sync);window.addEventListener("kq-storage",sync);return()=>{window.removeEventListener("storage",sync);window.removeEventListener("kq-storage",sync)}},[key]);return key==="kq-wish"?shopper.wishlist:items}
export const cottonWeaves = ["Mangalagiri Cotton","Narayanpet","Venkatagiri","Gadwal","Kasaragod","Paithani","Kala Cotton","Patola","Ikat","Moirang Phee","Kanchi Cottons","Chettinad Cottons","Banaras Cottons","Kota Cottons"];
export function TempleBorder(){return <div className="temple-border" aria-hidden="true"/>}
function LanguageSelect({language,onChange}:{language:StoreLanguage;onChange:(language:StoreLanguage)=>void}){
 return <label className="language-switcher">
  <Languages size={15} aria-hidden="true"/>
   <select data-testid="select-language" aria-label="Choose website language" value={language} onChange={event=>onChange(event.target.value as StoreLanguage)}>
   <option value="en">{languageNames.en}</option>
   <option value="te">{languageNames.te}</option>
   <option value="hi">{languageNames.hi}</option>
  </select>
 </label>
}
export function Header({language,onLanguageChange}:{language:StoreLanguage;onLanguageChange:(language:StoreLanguage)=>void}){
 const [menu,setMenu]=useState(false),[search,setSearch]=useState(false);
  const [,setLocation]=useLocation();
 const cart=useStore("kq-cart"),wish=useStore("kq-wish");
  const shopifyCart=useShopifyCartMeta();
  const cartCount=cart.reduce((sum,item)=>sum+item.qty,0)+(shopifyCart?.totalQuantity||0);
 return <><div className="topline">The living art of handloom · Rooted in the South, woven across India</div>
 <header className="header"><div className="wrap headrow">
   <button className="iconbtn mobile-menu" data-testid="button-mobile-menu" onClick={()=>setMenu(!menu)} aria-expanded={menu} aria-controls="kq-main-menu" aria-label="Toggle main menu">{menu?<X size={20}/>:<Menu size={20}/>}</button>
   <a className="brand" href="/" onClick={()=>setMenu(false)}><img src="/images/koushikii/wordmark-red.png" alt="Chenetha by Koushikii"/></a>
  <nav id="kq-main-menu" aria-label="Main menu" className={`nav ${menu?"open":""}`}>
     <details className="collection-nav"><summary>Collections <ChevronDown size={13}/></summary>
      <div className="mega-menu"><div><strong>Regional handlooms</strong><div className="cotton-links">{cottonWeaves.map(w=><a key={w} href={base+"Collections?category=Sarees&weave="+encodeURIComponent(w.replace(/ Cottons?$/,""))}>{w}</a>)}</div><a href={base+"Collections?category=Sarees"} className="link" style={{marginTop:18}}>Discover regional sarees →</a></div>
    <div><strong>Shop by Fabric</strong>{["Cotton","Silk","Cotton-Silk","Other blends"].map(f=><a key={f} href={base+"Collections?fabric="+encodeURIComponent(f)}>{f}</a>)}
     <div className="menu-weaves"><strong>Shop by Weave</strong>{["Ikat","Jamdani","Kanchipuram","Banarasi","Pashmina"].map(w=><a key={w} href={base+"Collections?category="+(w==="Pashmina"?"Dupattas":"Sarees")+"&weave="+w}>{w}</a>)}<a href={base+"Collections"}>View all collections →</a></div></div></div>
   </details>
    <a href={base+"OurStory"}>About Us</a><a href={base+"Videos"}>Videos</a><a href={base+"Contact"}>Contact Us</a>
  </nav>
   <div className="head-actions"><LanguageSelect language={language} onChange={onLanguageChange}/><button className="text-action" data-testid="button-toggle-search" aria-label="Search" aria-expanded={search} onClick={()=>setSearch(!search)}><Search size={16}/>Search</button>
     <Show when="signed-in"><a href={base+"Account"} className="text-action" aria-label="My account" data-testid="link-customer-account"><UserRound size={16}/>My account</a></Show>
     <Show when="signed-out"><a href={base+"Account"} className="text-action" aria-label="Sign in to your account" data-testid="link-customer-sign-in"><UserRound size={16}/>Sign in</a></Show>
   <WhatsAppHeaderIcon language={language}/>
   <a href={base+"Wishlist"} className="iconbtn optional" data-testid="link-wishlist" aria-label={`Wishlist${wish.length?`, ${wish.length} saved pieces`:""}`}><Heart size={17}/>{wish.length>0&&<span className="count">{wish.length}</span>}</a>
    <a href={base+"Cart"} className="iconbtn" data-testid="link-cart" aria-label={`Shopping bag${cartCount?`, ${cartCount} items`:""}`}><ShoppingBag size={18}/>{cartCount>0&&<span className="count" data-testid="header-cart-count">{cartCount}</span>}</a></div>
  </div>{search&&<div className="wrap searchline active"><form style={{display:"flex",width:"100%"}} onSubmit={event=>{event.preventDefault();const query=String(new FormData(event.currentTarget).get("q")||"").trim();setLocation(base+"Collections"+(query?"?q="+encodeURIComponent(query):""));setSearch(false)}}><input data-testid="input-header-search" name="q" aria-label="Search textiles" placeholder="Search Ikat, cotton, Kanchipuram…" autoFocus/><button className="btn small" data-testid="button-submit-search">Search</button></form></div>}</header></>
}
export function Footer(){
 return <footer className="footer"><TempleBorder/><div className="wrap"><div className="home-footer-reimagined">
  <div className="home-footer-grid">
   <div className="home-footer-brand">
    <a className="home-footer-logo" href={base+"Home"} aria-label="Chenetha by Koushikii home"><LogoSilhouette/></a>
    <p>Sarees and dupattas. The warmth of a hand, the memory of a loom.</p>
    <a className="home-footer-contact" href={base+"Contact"}>Questions about a weave? We’re here to help <ArrowRight size={14}/></a>
    <span className="home-footer-origin">Rooted in the South · Woven across India</span>
   </div>
   <nav className="home-footer-links" aria-label="Our company">
    <h4>Our Company</h4>
    <a href={base+"OurStory"}>Our Story</a><a href={base+"Contact"}>Contact Us</a>
    <a href={base+"CustomerCare"}>Customer Care</a><a href={base+"SareeCare"}>Saree Care</a>
   </nav>
   <nav className="home-footer-links" aria-label="Quick links">
    <h4>Quick Links</h4>
    <a href={base+"Collections"}>Collections</a><a href={base+"Collections?edit=new"}>New Arrivals</a>
    <a href={base+"Collections?edit=premium"}>Premium Collection</a><a href={base+"Videos"}>Videos</a>
    <a href={base+"Orders"}>Orders & tracking</a>
   </nav>
   <section className="home-footer-newsletter" aria-labelledby="home-footer-news-title">
    <span className="home-footer-kicker">A note from our loom</span>
    <h3 id="home-footer-news-title">Letters from the loom</h3>
    <p>New weaves, care notes and stories behind the cloth.</p>
    <nav className="home-footer-social" aria-label="Social and contact links">
     <a href="https://www.instagram.com/chenetha_by_koushikii/" target="_blank" rel="noopener noreferrer" aria-label="Follow Chenetha by Koushikii on Instagram" title="Instagram"><Instagram size={20} aria-hidden="true"/></a>
     <a href={whatsappOrderUrl("Namaste, I would like to ask about a handloom piece from Chenetha by Koushikii.")} target="_blank" rel="noopener noreferrer" aria-label="Chat with Chenetha by Koushikii on WhatsApp" title="WhatsApp"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 3.2a12.5 12.5 0 0 0-10.7 19L3.5 28.5l6.5-1.7A12.5 12.5 0 1 0 16 3.2Z" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinejoin="round"/><path d="M12.1 9.7c-.4-.9-.8-.9-1.2-.9h-1c-.4 0-.9.2-1.3.7s-1.7 1.7-1.7 4.1 1.8 4.7 2 5c.2.4 3.5 5.6 8.6 7.6 4.2 1.7 5.1 1.3 6 1.2.9-.1 2.9-1.2 3.3-2.4.4-1.2.4-2.2.3-2.4-.1-.2-.4-.4-.9-.6l-3.1-1.5c-.4-.2-.8-.3-1.1.3-.4.6-1.3 1.6-1.6 2-.3.4-.6.4-1.1.1-.5-.2-2.1-.8-4-2.5-1.5-1.3-2.5-2.9-2.8-3.4-.3-.5 0-.8.2-1 .2-.2.5-.6.7-.9.2-.3.3-.5.5-.8.2-.3.1-.6 0-.9l-1.3-3.2Z" fill="currentColor" transform="translate(2 -2) scale(.82)"/></svg></a>
     <a href={base+"Contact"} aria-label="Email Chenetha by Koushikii through the contact page" title="Email"><Mail size={20} aria-hidden="true"/></a>
    </nav>
    <p className="home-footer-status">Newsletter sign-up is not available yet. Please use Contact Us for an enquiry.</p>
    <small>No newsletter provider is connected.</small>
   </section>
  </div>
   <div className="home-footer-bottom"><span>© Chenetha by Koushikii · Shopify product listings with clearly marked sample placeholders.</span><a href={base+"Checkout"}>Payment & delivery details at checkout <ArrowRight size={12}/></a></div>
 </div></div></footer>
}
export function Shell({children}:{children:React.ReactNode}){
 const [language,setLanguage]=useState<StoreLanguage>(readStoreLanguage);
  const [,setLocation]=useLocation();
 const rootRef=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  try{localStorage.setItem("kq-language",language)}catch{}
  document.documentElement.lang=language==="te"?"te-IN":language==="hi"?"hi-IN":"en";
  const root=rootRef.current;
  if(!root)return;
  const apply=()=>localizeTree(root,language);
  apply();
  const observer=new MutationObserver(apply);
  observer.observe(root,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:["aria-label","placeholder","title","alt"]});
  return()=>observer.disconnect();
 },[language]);
  const navigateInternal=(event:React.MouseEvent<HTMLDivElement>)=>{
   if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
   if(!(event.target instanceof Element))return;
   const anchor=event.target.closest("a[href]");
   if(!(anchor instanceof HTMLAnchorElement)||anchor.target==="_blank"||anchor.hasAttribute("download"))return;
   if(anchor.getAttribute("href")?.startsWith("#"))return;
   const destination=new URL(anchor.href,window.location.href);
   if(destination.origin!==window.location.origin)return;
   if(destination.pathname===window.location.pathname&&destination.search===window.location.search&&destination.hash)return;
   event.preventDefault();
   setLocation(destination.pathname+destination.search+destination.hash);
  };
  return <div ref={rootRef} className="kq" data-lang={language} onClick={navigateInternal}><Header language={language} onLanguageChange={setLanguage}/>{children}<Footer/></div>
}
export function PageHero({eyebrow,title,subtitle}:{eyebrow:string;title:string;subtitle?:string}){return <div className="pagehero"><div className="wrap"><span className="eyebrow">{eyebrow}</span><h1>{title}</h1>{subtitle&&<p>{subtitle}</p>}</div></div>}
export function ProductCard({product:p}:{product:typeof products[number]}){const wish=useStore("kq-wish");const {toggleWishlist,loading,error}=useShopperPreferences();const [wishError,setWishError]=useState(false);const active=wish.some(x=>x.id===p.id);return <article className="product-card" data-testid={`card-product-${p.id}`}><a href={base+"Product?id="+p.id} className="product-img"><span className={`textile s${products.indexOf(p)%6+1}`} role="img" aria-label={p.name+" — illustrative textile swatch"}/><span className="pill" style={{position:"absolute",left:12,top:12}}>{p.tag}</span></a><button className="heart" disabled={loading||Boolean(error)} data-testid={`button-wishlist-${p.id}`} aria-label={active?"Remove from wishlist":"Add to wishlist"} aria-pressed={active} onClick={()=>{setWishError(false);void toggleWishlist(p.id).catch(()=>setWishError(true))}}><Heart size={16} fill={active?"var(--red)":"none"}/></button>{wishError&&<p role="alert" className="muted">Wishlist could not be saved. Please try again.</p>}<a href={base+"Product?id="+p.id}><h3>{p.name}</h3></a><p>{p.type} · {p.weave}</p><span className="price" data-testid={`text-price-${p.id}`}>{format(p.price)}</span></article>}
export function ProductGrid({items=products}:{items?:typeof products}){return <div className="products">{items.map(p=><ProductCard key={p.id} product={p}/>)}</div>}
export function Toast({text}:{text:string}){return <div className="toast"><Check size={15} style={{display:"inline",marginRight:8}}/>{text}</div>}
export function Qty({value,onChange}:{value:number;onChange:(n:number)=>void}){return <div className="qty" aria-label={`Quantity ${value}`}><button type="button" data-testid="button-decrease-quantity" aria-label="Decrease quantity" onClick={()=>onChange(Math.max(1,value-1))}><Minus size={14}/></button><span data-testid="text-quantity">{value}</span><button type="button" data-testid="button-increase-quantity" aria-label="Increase quantity" onClick={()=>onChange(value+1)}><Plus size={14}/></button></div>}
export function Empty({title,copy,cta="Browse the collection",href=base+"Collections"}:{title:string;copy:string;cta?:string;href?:string}){return <div className="empty"><span className="eyebrow">A fresh beginning</span><h2 style={{fontSize:42,margin:"14px 0"}}>{title}</h2><p>{copy}</p><a className="btn" href={href}>{cta}<ArrowRight size={15}/></a></div>}
export function moneySub(items:Item[]){return items.reduce((sum,x)=>sum+(products.find(p=>p.id===x.id)?.price||0)*x.qty,0)}
export function PageLink({to,children}:{to:string;children:React.ReactNode}){return <a className="link" href={base+to}>{children} <ChevronRight size={12}/></a>}

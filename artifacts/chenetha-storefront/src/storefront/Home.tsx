import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Pause, Play, RotateCcw } from "lucide-react";
import { Shell, base } from "./_shared";
import { getAvailableShopifyCollections, getShopifyAttribute, ShopifyProductCard, useShopifyCatalog } from "./ShopifyCatalog";
import { FABRIC_CATEGORIES, getShopifyAttributeValues, REGIONAL_HANDLOOMS, WEAVE_PRINTS } from "./shopifyCatalogData";
import { stateNames, statePaths, stateWeaves } from "./_reference";
import { useGetSiteContent, getGetSiteContentQueryKey, type SiteContentItem } from "@workspace/api-client-react";
import type { ShopifyProduct } from "@workspace/api-client-react";
import { normalizeRegion } from "./_shared/catalog-filter";
import "./HomeMakingJourney.css";
import "./Home.css";

function Textile({pattern,label}:{pattern:string;label:string}){
 return <span className={"textile "+pattern} role="img" aria-label={label+" — illustrative textile pattern"}/>;
}
function homeCollectionKey(title:string){
 return title.trim().toLowerCase().replace(/[^a-z0-9]+/g,"");
}
const homeHeroSlides = [
  {image:"/images/chenetha-home-hero-courtyard.png", alt:"Rose and vermilion Kanjeevaram silk saree in a sunlit South Indian courtyard", eyebrow:"THE LIVING ART OF HANDLOOM", title:<>Chronicles<br/>of weaves.</>, copy:"Discover the quiet beauty of South Indian handlooms.", cta:"Shop the collection", href:base+"Collections"},
  {image:"/images/chenetha-home-hero-weaving.png", alt:"Midnight-indigo handloom with a fine gold border in a weaving atelier", eyebrow:"A THREAD WORTH FOLLOWING", title:<>Woven by hand.<br/>Kept for years.</>, copy:"Find a weave with colour, character and a story of its own.", cta:"Explore the weaves", href:base+"Collections"},
  {image:"/images/chenetha-home-hero-garden.png", alt:"Bottle-green silk saree with an antique-gold border in a heritage garden", eyebrow:"COLOUR FROM THE LOOM", title:<>A little gold.<br/>A lot of soul.</>, copy:"Meet considered handlooms for days both special and everyday.", cta:"Discover the collection", href:base+"Collections"}
];
function StaticHomeHeroCarousel(){
 const [active,setActive]=useState(0);
 const [playing,setPlaying]=useState(true);
 const touchStart=useRef<{x:number;y:number}|null>(null);
 const swipeClickGuard=useRef(0);
 useEffect(()=>{
  if(!playing)return;
  const timer=window.setInterval(()=>setActive(index=>(index+1)%homeHeroSlides.length),6000);
  return()=>window.clearInterval(timer);
 },[playing]);
 const go=(direction:number)=>setActive(index=>(index+direction+homeHeroSlides.length)%homeHeroSlides.length);
 const finishSwipe=(end:{x:number;y:number})=>{
  const start=touchStart.current;
  touchStart.current=null;
  if(!start)return;
  const deltaX=end.x-start.x;
  const deltaY=end.y-start.y;
  if(Math.abs(deltaX)<45||Math.abs(deltaX)<=Math.abs(deltaY))return;
  swipeClickGuard.current=Date.now()+450;
  go(deltaX<0?1:-1);
 };
  return <section
   className="heritage-hero home-hero-carousel"
   aria-label="Featured handloom collection"
   onClickCapture={event=>{if(Date.now()<swipeClickGuard.current){event.preventDefault();event.stopPropagation();swipeClickGuard.current=0}}}
  >
   <div
    className="home-hero-images"
    onPointerDown={event=>{if(event.isPrimary&&event.pointerType!=="touch")touchStart.current={x:event.clientX,y:event.clientY}}}
    onPointerUp={event=>{if(event.pointerType!=="touch")finishSwipe({x:event.clientX,y:event.clientY})}}
    onPointerCancel={event=>{if(event.pointerType!=="touch")touchStart.current=null}}
    onTouchStart={event=>{if(event.touches.length!==1){touchStart.current=null;return}const touch=event.touches[0];touchStart.current={x:touch.clientX,y:touch.clientY}}}
    onTouchEnd={event=>{const touch=event.changedTouches[0];if(touch)finishSwipe({x:touch.clientX,y:touch.clientY})}}
    onTouchCancel={()=>{touchStart.current=null}}
   >
   {homeHeroSlides.map((slide,index)=><img key={slide.image} className={`home-hero-image${active===index?" is-active":""}`} src={slide.image} alt="" aria-hidden="true" fetchPriority={index===0?"high":"auto"}/>)}
   <div className="home-hero-shade" aria-hidden="true"/>
   <div className="home-hero-content wrap">
    <div className="home-hero-copy" key={active} role="group" aria-roledescription="slide" aria-label={`${active+1} of ${homeHeroSlides.length}: ${homeHeroSlides[active].eyebrow}`}>
     <span className="eyebrow">{homeHeroSlides[active].eyebrow}</span>
     <h1>{homeHeroSlides[active].title}</h1>
     <p>{homeHeroSlides[active].copy}</p>
     <a className="home-hero-cta" href={homeHeroSlides[active].href}>{homeHeroSlides[active].cta}<ArrowRight size={15}/></a>
    </div>
    <div className="home-hero-controls" role="group" aria-label="Featured collection slides">
     {homeHeroSlides.map((slide,index)=><button key={slide.image} type="button" className={`home-hero-dot${active===index?" is-active":""}`} aria-label={`Show slide ${index+1}: ${slide.eyebrow}`} aria-pressed={active===index} onClick={()=>setActive(index)}/>)}
    </div>
   </div>
  </div>
 </section>
}
export function PublishedHero({ slides }: { slides: SiteContentItem[] }) {
 const [active,setActive]=useState(0);
 useEffect(()=>{if(slides.length<2)return;const timer=window.setInterval(()=>setActive(index=>(index+1)%slides.length),6000);return()=>window.clearInterval(timer)},[slides.length]);
 const activeIndex=active%slides.length;
 const slide=slides[activeIndex];
 const touchStart=useRef<{x:number;y:number}|null>(null);
 const swipeClickGuard=useRef(0);
 const go=(direction:number)=>setActive(index=>(index+direction+slides.length)%slides.length);
 const finishSwipe=(end:{x:number;y:number})=>{
  const start=touchStart.current;
  touchStart.current=null;
  if(!start)return;
  const deltaX=end.x-start.x;
  const deltaY=end.y-start.y;
  if(Math.abs(deltaX)<45||Math.abs(deltaX)<=Math.abs(deltaY))return;
  swipeClickGuard.current=Date.now()+450;
  go(deltaX<0?1:-1);
 };
 return <section className="heritage-hero home-hero-carousel" aria-label="Featured handloom collection" onClickCapture={event=>{if(Date.now()<swipeClickGuard.current){event.preventDefault();event.stopPropagation();swipeClickGuard.current=0}}}>
  <div className="home-hero-images"
   onPointerDown={event=>{if(event.isPrimary&&event.pointerType!=="touch")touchStart.current={x:event.clientX,y:event.clientY}}}
   onPointerUp={event=>{if(event.pointerType!=="touch")finishSwipe({x:event.clientX,y:event.clientY})}}
   onPointerCancel={event=>{if(event.pointerType!=="touch")touchStart.current=null}}
   onTouchStart={event=>{if(event.touches.length!==1){touchStart.current=null;return}const touch=event.touches[0];touchStart.current={x:touch.clientX,y:touch.clientY}}}
   onTouchEnd={event=>{const touch=event.changedTouches[0];if(touch)finishSwipe({x:touch.clientX,y:touch.clientY})}}
   onTouchCancel={()=>{touchStart.current=null}}
  ><img className="home-hero-image is-active" src={slide.imageUrl || ""} alt={slide.altText || slide.title}/><div className="home-hero-shade" aria-hidden="true"/>
   <div className="home-hero-content wrap"><div className="home-hero-copy" key={slide.id} role="group" aria-roledescription="slide" aria-label={`${active+1} of ${slides.length}`}>
    {slide.eyebrow && <span className="eyebrow">{slide.eyebrow}</span>}<h1>{slide.title}</h1>{slide.body && <p>{slide.body}</p>}
    {slide.ctaLabel && slide.ctaUrl && <a className="home-hero-cta" href={slide.ctaUrl}>{slide.ctaLabel}<ArrowRight size={15}/></a>}
   </div>
   {slides.length>1 && <div className="home-hero-controls" role="group" aria-label="Featured collection slides">{slides.map((item,index)=><button key={item.id} type="button" className={`home-hero-dot${activeIndex===index?" is-active":""}`} aria-label={`Show slide ${index+1}`} aria-pressed={activeIndex===index} onClick={()=>setActive(index)}/>)}</div>}
   </div>
  </div>
 </section>;
}
function HomeHeroCarousel(){
 const content=useGetSiteContent({query:{queryKey:getGetSiteContentQueryKey(),staleTime:60_000}});
 const slides=(content.data?.items||[]).filter(item=>item.kind==="hero_slide"&&item.published&&item.imageUrl).sort((a,b)=>a.sortOrder-b.sortOrder);
 return slides.length?<PublishedHero slides={slides}/>:<StaticHomeHeroCarousel/>;
}
const makingStages = [
  {id:"yarn",step:"01",note:"Preparation",title:"Prepare the yarn",copy:"Yarn is wound onto bobbins in preparation for the loom. The tools and sequence vary between fibres and weaving communities.",image:"/images/koushikii-home-yarn.svg",video:"/images/koushikii-home-yarn.mp4",alt:"A short video of yarn preparation for handloom weaving."},
  {id:"dye",step:"02",note:"Colour",title:"Bring in the colour",copy:"Yarn may be coloured before it is woven. Dye methods and timing differ by material, design and regional practice.",image:"/images/koushikii-home-dye.svg",video:"/images/koushikii-home-dye.mp4",alt:"A short video showing the colouring stage of handloom preparation."},
  {id:"loom",step:"03",note:"Weaving",title:"Weave the cloth",copy:"Warp and weft meet at the handloom. Each pass of the shuttle brings the fabric a little closer to its finished form.",image:"/images/koushikii-home-loom.svg",video:"/images/koushikii-home-loom.mp4",alt:"A short video of a handloom in use."},
];
function MakingJourney(){
 const [stage,setStage]=useState(0);
 const [playing,setPlaying]=useState(false);
 const [reducedMotion,setReducedMotion]=useState(false);
 const [replay,setReplay]=useState(0);
  const videoRef=useRef<HTMLVideoElement>(null);
 const current=makingStages[stage];

 useEffect(()=>{
  const media=window.matchMedia("(prefers-reduced-motion: reduce)");
  const update=()=>{setReducedMotion(media.matches);setPlaying(!media.matches);};
  update();
  media.addEventListener("change",update);
  return ()=>media.removeEventListener("change",update);
 },[]);

 useEffect(()=>{
  if(!playing)return;
   const timer=window.setInterval(()=>setStage(value=>(value+1)%makingStages.length),12000);
  return ()=>window.clearInterval(timer);
 },[playing]);

  useEffect(()=>{
   const video=videoRef.current;
   if(!video)return;
   if(playing){
    void video.play().catch(()=>setPlaying(false));
   }else{
    video.pause();
    video.currentTime=0;
   }
  },[playing,stage,replay]);

 const chooseStage=(index:number)=>{setStage((index+makingStages.length)%makingStages.length);setPlaying(false);};
 return <div className={`home-making-journey${playing?" is-playing":""}`} data-replay={replay}>
  <div className="home-making-scene">
     {playing?
      <video key={`${current.id}-${replay}`} ref={videoRef} className="home-making-art" src={current.video} poster={current.image} aria-label={current.alt} autoPlay muted playsInline preload="auto" onError={()=>setPlaying(false)}/>:
      <img key={`${current.id}-${replay}`} className="home-making-art" src={current.image} alt={current.alt} loading="eager"/>}
   <div className="home-making-caption"><span className="home-making-caption-mark" aria-hidden="true">✳</span><span>{current.note} · Handloom craft, in three moments</span></div>
   <div className="home-making-scene-index" aria-hidden="true">{current.step}<i>/</i>03</div>
   <div className="home-making-progress" key={`progress-${stage}-${replay}`}><span/></div>
  </div>
  <nav className="home-making-stages" aria-label="Stages in the handloom-making process">
   {makingStages.map((item,index)=><button key={item.id} type="button" className={stage===index?"active":""} aria-current={stage===index?"step":undefined} onClick={()=>chooseStage(index)}>
    <span className="home-making-step">{item.step}</span><span className="home-making-stage-copy"><span className="home-making-note">{item.note}</span><span className="home-making-title">{item.title}</span></span><ArrowRight className="home-making-stage-arrow" size={16} aria-hidden="true"/>
   </button>)}
  </nav>
  <div className="home-making-detail">
   <div className="home-making-detail-title"><span className="home-making-detail-kicker">Stage {current.step} · {current.note}</span><h3>{current.title}</h3></div>
   <p>{current.copy}</p>
  </div>
  <div className="home-making-controls">
   <div className="home-making-control-group">
    <button type="button" onClick={()=>chooseStage(stage-1)} aria-label="Previous craft stage"><ArrowLeft size={16}/></button>
    <button type="button" onClick={()=>chooseStage(stage+1)} aria-label="Next craft stage"><ArrowRight size={16}/></button>
    <button type="button" className="home-making-play" aria-pressed={playing} onClick={()=>setPlaying(value=>!value)}>{playing?<Pause size={14}/>:<Play size={14}/>} {playing?"Pause story":"Play story"}</button>
    <button type="button" onClick={()=>{setStage(0);setReplay(value=>value+1);setPlaying(true);}}><RotateCcw size={14}/> Replay</button>
   </div>
   <p className="home-making-disclaimer">{reducedMotion?"Auto-play is paused to respect your motion preference. Use Play story to start. ":""}Original illustrative artwork, not documentary footage or a record of one specific maker’s process. Methods vary across regions and makers.</p>
  </div>
 </div>;
}
function ProductCarousel({title,copy,collection,products}:{title:string;copy:string;collection?:ShopifyProduct["collections"][number];products:ShopifyProduct[]}){
  if(!collection)return null;
  const collectionProducts=products.filter(product=>product.collections.some(item=>item.handle===collection.handle));
  if(!collectionProducts.length)return null;
  return <section className="section home-product-section"><div className="wrap">
   <div className="section-head"><div><h2>{collection.title||title}</h2><p>{copy}</p></div><a className="link" href={base+"Collections?collection="+encodeURIComponent(collection.handle)}>View collection →</a></div>
   <div className="products" role="region" aria-label={collection.title||title}>{collectionProducts.slice(0,4).map(product=><ShopifyProductCard key={product.id} product={product}/>)}</div>
  </div></section>;
}
function PremiumFeature({collection,products}:{collection?:ShopifyProduct["collections"][number];products:ShopifyProduct[]}){
  if(!collection)return null;
  const premiumProducts=products.filter(product=>product.collections.some(item=>item.handle===collection.handle));
  if(!premiumProducts.length)return null;
  return <section className="section"><div className="wrap"><div className="premium"><div><span className="eyebrow">Featured collection</span><h2>{collection.title}</h2><p>Explore the pieces in this Shopify collection, with product details kept up to date.</p><a className="btn gold" href={base+"Collections?collection="+encodeURIComponent(collection.handle)}>Explore collection <ArrowRight size={14}/></a></div>
   <div className="shopify-premium-products">{premiumProducts.slice(0,2).map(product=><ShopifyProductCard key={product.id} product={product}/>)}</div>
  </div></div></section>
}
function IndiaWeaves({products}:{products:ShopifyProduct[]}){
 const [selected,setSelected]=useState("tn");
 const info=stateWeaves[selected];
  const selectedRegion=stateNames[selected]||"";
  const hasRegionProducts=products.some(product=>normalizeRegion(getShopifyAttribute(product,"region"))===normalizeRegion(selectedRegion));
 return <section className="section"><div className="wrap">
  <div className="section-head"><div><span className="eyebrow">Many places. Many ways of weaving.</span><h2>Weaves of India</h2><p>Begin in the South. Follow the threads across the country.</p></div></div>
  <div className="map-layout"><div>
   {Object.keys(statePaths).length?<svg className="india-map" viewBox="0 0 612 696" role="group" aria-label="Explore the client's original India state map">
    {Object.entries(statePaths).map(([code,d])=><path key={code} d={d} fill={selected===code?"#b22222":stateWeaves[code]?"#d4a23b":"#e2d5b8"} stroke="#886c49" strokeWidth=".8" tabIndex={0} role="button" aria-label={stateNames[code]} aria-pressed={selected===code} onMouseEnter={()=>setSelected(code)} onFocus={()=>setSelected(code)} onClick={()=>setSelected(code)} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();setSelected(code)}}}/>)}
   </svg>:<div className="empty"><h3>Explore by state</h3><p>Choose a state from the list to discover its textiles.</p></div>}
   <p className="muted" style={{fontSize:11}}>Select, focus or tap a state. Gold marks regions with weave notes.<br/>Client-supplied illustrative map; not a political boundary reference.</p>
  </div><div className="map-info">
   <label htmlFor="weave-state" className="eyebrow">Choose a region</label>
   <select id="weave-state" className="state-select" value={selected} onChange={e=>setSelected(e.target.value)}>{Object.entries(stateNames).map(([code,name])=><option key={code} value={code}>{name}</option>)}</select>
   <h3>{stateNames[selected]||"Tamil Nadu"}</h3>
    {info?<ul>{info[1].map(([name,description])=><li key={name}><strong>{name}</strong><br/><span style={{fontSize:12,color:"#eddbc0"}}>{description}</span></li>)}</ul>:<p>Explore regional textile traditions and maker stories.</p>}
       {hasRegionProducts&&<a className="btn gold" href={base+"Collections?region="+encodeURIComponent(selectedRegion)}>{`Shop ${selectedRegion} pieces`} <ArrowRight size={14}/></a>}
      <p style={{fontSize:10}}>Regional notes are illustrative and do not certify product origin.</p>
  </div></div>
 </div></section>
}
export function DynamicHomeTiles({items,placement}:{items:(SiteContentItem & {placement:"fabric_tile"|"weave_tile"|null})[];placement:"fabric_tile"|"weave_tile"}){
  const fallback=base+"Collections";
  return <div className={placement==="fabric_tile"?"fabric-grid":"weave-grid"}>{items.map(item=><a key={item.id} className={placement==="fabric_tile"?"fabric-card":""} href={item.ctaUrl||fallback}>
   <img className="dynamic-home-tile-image" src={item.imageUrl||""} alt={item.altText||item.title} loading="lazy"/>
   <h3>{item.title}</h3>{item.body&&<p>{item.body}</p>}{item.ctaLabel&&<span className="link">{item.ctaLabel} →</span>}
  </a>)}</div>;
}
export function Reviews({items}:{items:SiteContentItem[]}){
  const customerVoices=items;
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  if(!customerVoices.length)return null;
  const scrollToPhoto = (index:number) => {
    const track = trackRef.current;
    const card = track?.children[index] as HTMLElement | undefined;
    if (!track || !card) return;
    const left = card.getBoundingClientRect().left - track.getBoundingClientRect().left + track.scrollLeft;
    const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
    track.scrollTo({left, behavior});
    setActive(index);
  };
  const move = (direction:number) => scrollToPhoto((active + direction + customerVoices.length) % customerVoices.length);
  const updateActive = () => {
    const track = trackRef.current;
    if (!track) return;
    const left = track.getBoundingClientRect().left;
    const cards = Array.from(track.children) as HTMLElement[];
    let nearest = 0;
    let distance = Number.POSITIVE_INFINITY;
    cards.forEach((card,index) => {
      const currentDistance = Math.abs(card.getBoundingClientRect().left - left);
      if (currentDistance < distance) {
        nearest = index;
        distance = currentDistance;
      }
    });
    setActive(nearest);
  };

  return <section className="section customer-voices"><div className="wrap">
   <div className="customer-voices-heading"><h2>Customer voices</h2><p>The everyday life of a textile matters, too.</p></div>
   <div className="customer-reel">
    <button type="button" className="customer-reel-arrow is-prev" aria-label="Previous customer photo" onClick={()=>move(-1)}><ArrowLeft size={17}/></button>
    <div className="customer-review-track" ref={trackRef} role="region" aria-label="Customer photographs" tabIndex={0} onScroll={updateActive}>
     {customerVoices.map((customer,index)=><article className="customer-review-card" key={customer.id}>
       {customer.imageUrl&&<img src={customer.imageUrl} alt={customer.altText||customer.title} loading="lazy"/>}
       <span className="customer-photo-label">Customer voice</span>
      <span className="customer-photo-index" aria-hidden="true">{String(index+1).padStart(2,"0")}</span>
      <div className="customer-review-content">
        {customer.eyebrow&&<span className="review-pending">{customer.eyebrow}</span>}
        <h3>{customer.title}</h3>
        <p>{customer.body}</p>
      </div>
     </article>)}
    </div>
    <button type="button" className="customer-reel-arrow is-next" aria-label="Next customer photo" onClick={()=>move(1)}><ArrowRight size={17}/></button>
   </div>
   <div className="customer-reel-pagination" role="group" aria-label="Customer photo navigation">
    {customerVoices.map((customer,index)=><button key={customer.id} type="button" aria-label={`Show customer voice ${index+1}`} aria-pressed={active===index} onClick={()=>scrollToPhoto(index)}><span/></button>)}
    <span className="customer-reel-status" role="status" aria-live="polite">{String(active+1).padStart(2,"0")} / {String(customerVoices.length).padStart(2,"0")}</span>
   </div>
  </div></section>
 }
export function Home(){
 const siteContent=useGetSiteContent({query:{queryKey:getGetSiteContentQueryKey(),staleTime:60_000}});
  const storefrontCatalog=useShopifyCatalog();
  const availableCollections=getAvailableShopifyCollections(storefrontCatalog.data?.products||[]);
  const premiumCollection=availableCollections.find(item=>item.title.trim().toLowerCase()==="premium collection");
  const newArrivalsCollection=availableCollections.find(item=>item.title.trim().toLowerCase()==="new arrivals");
  const storefrontProducts=storefrontCatalog.data?.products||[];
  const published=siteContent.data?.items||[];
  const homeTiles=published.filter(item=>item.kind==="home_image"&&item.published&&item.imageUrl) as (SiteContentItem & {placement:"fabric_tile"|"weave_tile"|null})[];
  const fabricCards=FABRIC_CATEGORIES.map(name=>{
   const normalized=name.toLowerCase();
   const pattern=name==="Cotton"?"cotton":name==="Silk"?"silk":name==="Cotton-Silk"?"cotton-silk":"blends";
    const tile=homeTiles.find(item=>item.placement==="fabric_tile"&&item.title.trim().toLowerCase()===normalized);
    return {name,pattern,tile};
  });
  const regionalHandlooms=Array.from(new Set([
    ...REGIONAL_HANDLOOMS,
    ...storefrontProducts.flatMap(product=>getShopifyAttributeValues(product,"regionalHandloom")),
  ])).sort((a,b)=>a.localeCompare(b));
  const collectionTitles=new Set(availableCollections.map(collection=>homeCollectionKey(collection.title)));
  const homeCollectionLinks=[
    ...availableCollections.map(collection=>({key:`collection:${collection.handle}`,title:collection.title,kind:"collection" as const,handle:collection.handle})),
    ...regionalHandlooms
      .filter(name=>!collectionTitles.has(homeCollectionKey(name)))
      .map(name=>({key:`regional:${name}`,title:name,kind:"regional" as const})),
  ];
  const weavePrints=Array.from(new Set([
    ...WEAVE_PRINTS,
    ...storefrontProducts.flatMap(product=>getShopifyAttributeValues(product,"weave")),
  ])).sort((a,b)=>a.localeCompare(b));
  const collectionTile=(title:string)=>{
    const normalized=title.trim().toLowerCase();
    return homeTiles.find(item=>
      item.title.trim().toLowerCase()===normalized||
      (normalized==="the crafts edit"&&item.title.trim().toLowerCase()==="other blends"),
    );
  };
 const voices=published.filter(item=>item.kind==="customer_voice"&&item.published&&item.approved&&Boolean(item.body?.trim())).sort((a,b)=>a.sortOrder-b.sortOrder);
 return <Shell>
  <HomeHeroCarousel/>

   <section className="section home-fabric-section" id="fabric"><div className="wrap"><div className="section-head"><div><h2>Shop by Fabric</h2><p>Find the cloth that feels like you.</p></div></div>
      {fabricCards.length?<div className="fabric-grid">
       {fabricCards.map(item=><a className="fabric-card" key={item.name} href={base+"Collections?fabric="+encodeURIComponent(item.name)}>
         {item.tile?.imageUrl?<img className="dynamic-home-tile-image" src={item.tile.imageUrl} alt={item.tile.altText||item.name} loading="lazy"/>:<Textile pattern={item.pattern} label={item.name}/>}
        <h3>{item.name}</h3><p>{item.name==="Others"?"Explore linen and other materials beyond the main fabric categories.":`Explore published pieces in the ${item.name.toLowerCase()} fabric group.`}</p><span className="link">Shop {item.name} →</span>
       </a>)}
       </div>:<p role="status" className="shopify-catalog-status">{storefrontCatalog.isLoading?"Loading available fabrics…":storefrontCatalog.isError?"The Shopify catalog could not be loaded. Try the collection page again shortly.":"Fabric categories appear when published products have a fabric value."}</p>}
  </div></section>
   <section className="section home-technique-section" id="weave-print"><div className="wrap">
    <div className="section-head"><div><h2>Weave / Print</h2><p>Find a technique across the regions and materials where it appears.</p></div></div>
    <div className="taxonomy-link-grid technique-link-grid" aria-label="Weave / Print">
     {weavePrints.map((name,index)=><a key={name} href={base+"Collections?weave="+encodeURIComponent(name)}><Textile pattern={"s"+((index+2)%6+1)} label={name}/><span>{name}</span><small>Explore pieces →</small></a>)}
    </div>
   </div></section>
     <PremiumFeature collection={premiumCollection} products={storefrontProducts}/>
     <ProductCarousel title="New Arrivals" copy="Discover the newest pieces in the collection." collection={newArrivalsCollection} products={storefrontProducts}/>
   <section className="section" id="making-process" style={{scrollMarginTop:110}}><div className="wrap"><div className="section-head"><div><span className="eyebrow">From yarn to cloth</span><h2>The making lifecycle</h2><p>Follow three illustrative stages, from preparing yarn to the handloom. The sequence and methods vary across fibres, regions and makers.</p></div></div><MakingJourney/></div></section>
   <IndiaWeaves products={storefrontProducts}/>
   <Reviews items={voices}/>
   <section className="section home-weave-section" id="shop-by-collection"><div className="wrap"><div className="section-head"><div><h2>Shop by Collection</h2><p>Browse Shopify collections and regional handlooms in one place.</p></div>{homeCollectionLinks.length>0&&<a href={base+"Collections"} className="link">All collections →</a>}</div>
       {homeCollectionLinks.length?<div className="weave-grid">{homeCollectionLinks.map((item,index)=>{
         const tile=item.kind==="collection"?collectionTile(item.title):undefined;
         const href=item.kind==="collection"
           ?base+"Collections?collection="+encodeURIComponent(item.handle)
           :base+"Collections?regionalHandloom="+encodeURIComponent(item.title);
         return <a key={item.key} href={href}>
          {tile?.imageUrl?<img className="dynamic-home-tile-image" src={tile.imageUrl} alt={tile.altText||item.title} loading="lazy"/>:<Textile pattern={"s"+(index%6+1)} label={item.title}/>}
          <h3>{item.title}</h3><span className="eyebrow" style={{fontSize:9}}>{item.kind==="regional"?"Regional handloom · ":""}Explore →</span>
         </a>;
       })}</div>:<p role="status" className="shopify-catalog-status">{storefrontCatalog.isLoading?"Loading published collections…":storefrontCatalog.isError?"The Shopify catalog could not be loaded. Try the collection page again shortly.":"Published collections and regional handlooms appear here when products are assigned."}</p>}
   </div></section>
      <section className="section" style={{paddingTop:12}}><div className="wrap home-guide-link"><a href={base+"Collections"}><span className="eyebrow">A companion for choosing</span><h3>Find your thread.</h3><p>Explore the current Shopify products and narrow the collection by fabric, regional tradition, technique, origin or colour.</p><span className="link">Discover the collection →</span></a><a href={base+"SareeCare"}><span className="eyebrow">A companion for keeping</span><h3>Care for the cloth.</h3><p>Give an everyday cotton and a treasured silk the different kinds of attention they need.</p><span className="link">Read the care notes →</span></a></div></section>
 </Shell>
}

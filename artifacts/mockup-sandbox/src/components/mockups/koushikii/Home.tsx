import { useRef, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Shell, products, ProductGrid, base, TempleBorder } from "./_shared";
import { HomeMakingJourney } from "./HomeMakingJourney";
import { stateNames, statePaths, stateWeaves } from "./_reference";
import "./Home.css";

const fabrics = [
 {name:"Cotton",className:"cotton",copy:"Breathable, everyday handlooms",query:"Cotton"},
 {name:"Silk",className:"silk",copy:"Rich weaves for celebrations",query:"Silk"},
 {name:"Cotton-Silk",className:"cotton-silk",copy:"A light drape with a silk sheen",query:"Cotton-Silk"},
 {name:"Other Blends",className:"blends",copy:"Discover the character of blended yarns",query:"Other blends"},
];
function Textile({pattern,label}:{pattern:string;label:string}){
 return <span className={"textile "+pattern} role="img" aria-label={label+" — illustrative textile pattern"}/>;
}
function ProductCarousel({title,copy,offset=0}:{title:string;copy:string;offset?:number}){
 const [slide,setSlide]=useState(0);
 const order=[...products.slice(offset),...products.slice(0,offset)];
 return <section className="section"><div className="wrap">
  <div className="section-head"><div><h2>{title}</h2><p>{copy}</p></div><div className="carousel-controls">
   <button aria-label={"Previous "+title} onClick={()=>setSlide((slide+1)%2)}><ArrowLeft size={15}/></button><span>{slide+1} / 2</span><button aria-label={"Next "+title} onClick={()=>setSlide((slide+1)%2)}><ArrowRight size={15}/></button>
  </div></div>
  <div role="region" aria-roledescription="carousel" aria-label={title}><ProductGrid items={order.slice(slide*4,slide*4+4)}/></div>
  <p className="muted" style={{fontSize:10,marginBottom:0}}>Sample catalog · Pattern swatches illustrate the proposed collection.</p>
 </div></section>
}
function IndiaWeaves(){
 const [selected,setSelected]=useState("tn");
 const info=stateWeaves[selected];
 return <section className="section"><div className="wrap">
  <div className="section-head"><div><span className="eyebrow">Many places. Many ways of weaving.</span><h2>Weaves of India</h2><p>Begin in the South. Follow the threads across the country.</p></div></div>
  <div className="map-layout"><div>
   {Object.keys(statePaths).length?<svg className="india-map" viewBox="0 0 612 696" role="group" aria-label="Explore the client's original India state map">
    {Object.entries(statePaths).map(([code,d])=><path key={code} d={d} fill={selected===code?"#922c32":stateWeaves[code]?"#d4a23b":"#e2d5b8"} stroke="#886c49" strokeWidth=".8" tabIndex={0} role="button" aria-label={stateNames[code]} aria-pressed={selected===code} onMouseEnter={()=>setSelected(code)} onFocus={()=>setSelected(code)} onClick={()=>setSelected(code)} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();setSelected(code)}}}/>)}
   </svg>:<div className="empty"><h3>Explore by state</h3><p>Choose a state from the list to discover its textiles.</p></div>}
   <p className="muted" style={{fontSize:11}}>Select, focus or tap a state. Gold marks regions with weave notes.<br/>Client-supplied illustrative map; not a political boundary reference.</p>
  </div><div className="map-info">
   <label htmlFor="weave-state" className="eyebrow">Choose a region</label>
   <select id="weave-state" className="state-select" value={selected} onChange={e=>setSelected(e.target.value)}>{Object.entries(stateNames).map(([code,name])=><option key={code} value={code}>{name}</option>)}</select>
   <h3>{stateNames[selected]||"Tamil Nadu"}</h3>
    {info?<ul>{info[1].map(([name,description])=><li key={name}><strong>{name}</strong><br/><span style={{fontSize:12,color:"#eddbc0"}}>{description}</span></li>)}</ul>:<p>Explore the regional selection. Not every region has a sample piece in this preview.</p>}
      <a className="btn gold" href={base+"Collections?region="+selected+"&category=Sarees"}>{`Shop ${stateNames[selected]} sarees`} <ArrowRight size={14}/></a>
     <p style={{fontSize:10}}>Illustrative collection assignments, not certification of origin.</p>
  </div></div>
 </div></section>
}
const customerVoices = [
  { name: "Dr. Sahiti Reddy", image: "/__mockup/images/customer-dr-sahiti-reddy.jpg" },
  { name: "Mounika", image: "/__mockup/images/customer-mounika.jpg" },
  { name: "Poornima garu", image: "/__mockup/images/customer-poornima-garu.jpg" },
  { name: "Priya", image: "/__mockup/images/customer-priya.jpg" },
  { name: "Sudha garu", image: "/__mockup/images/customer-sudha-garu.jpg" },
  { name: "Vasantha garu", image: "/__mockup/images/customer-vasantha-garu.jpg" },
];

function Reviews(){
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
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
     {customerVoices.map((customer,index)=><article className="customer-review-card" key={customer.name}>
      <img src={customer.image} alt={`${customer.name} — Customer photo`} loading="eager"/>
      <span className="customer-photo-label">Customer photo</span>
      <span className="customer-photo-index" aria-hidden="true">{String(index+1).padStart(2,"0")}</span>
      <div className="customer-review-content">
       <span className="review-pending">Review text pending</span>
       <h3>{customer.name}</h3>
       <p>Customer-approved review text will appear here.</p>
      </div>
     </article>)}
    </div>
    <button type="button" className="customer-reel-arrow is-next" aria-label="Next customer photo" onClick={()=>move(1)}><ArrowRight size={17}/></button>
   </div>
   <div className="customer-reel-pagination" role="group" aria-label="Customer photo navigation">
    {customerVoices.map((customer,index)=><button key={customer.name} type="button" aria-label={customer.name} aria-pressed={active===index} onClick={()=>scrollToPhoto(index)}><span/></button>)}
    <span className="customer-reel-status" role="status" aria-live="polite">{String(active+1).padStart(2,"0")} / {String(customerVoices.length).padStart(2,"0")}</span>
   </div>
  </div></section>
 }
export function Home(){
 return <Shell>
  <section className="heritage-hero"><div className="wrap"><div>
   <span className="eyebrow">Chenetha · The living art of handloom</span>
   <h1>Woven by hand.<br/>Worn for generations.</h1>
   <p>Sarees and dupattas with a human touch. From the temple borders of Kanchipuram to the many weaving traditions of India, a thread worth following.</p>
   <div className="actions"><a className="btn gold" href={base+"Collections"}>Shop Collections <ArrowRight size={14}/></a><a className="btn pale" href="#making-process">See the making process</a></div>
  </div><div className="hero-swatches"><Textile pattern="s1" label="Temple red and gold striped handloom"/><Textile pattern="s2" label="Indigo dotted weave"/></div></div><TempleBorder/></section>

  <section className="section" id="fabric"><div className="wrap"><div className="section-head"><div><h2>Shop by Fabric</h2><p>Find the cloth that feels like you.</p></div></div>
   <div className="fabric-grid">{fabrics.map(f=><a className="fabric-card" key={f.name} href={base+"Collections?fabric="+encodeURIComponent(f.query)}><Textile pattern={f.className} label={f.name}/><h3>{f.name}</h3><p>{f.copy}</p><span className="link">Shop {f.name} →</span></a>)}</div>
  </div></section>
   <ProductCarousel title="The Collection Edit" copy="Colours, borders and textures to begin with · Sample selection"/>
   <section className="section"><div className="wrap"><div className="premium"><div><span className="eyebrow">Premium Collection</span><h2>For the days<br/>you will remember.</h2><p>Celebratory silks, intricate borders and cloth to keep close. Discover the premium edit.</p><a className="btn gold" href={base+"Collections?edit=premium"}>Explore Premium <ArrowRight size={14}/></a></div><div className="mini-swatches">{["s3","s1","s1"].map((s,i)=><a key={i} href={base+"Product?id="+["surya","ambar","nila"][i]}><Textile pattern={s} label={["Kanchipuram silk","Banarasi silk","Ikat cotton-silk"][i]}/><span style={{display:"block",marginTop:9,fontSize:11}}>{["Kanchipuram","Banarasi","Ikat"][i]}</span></a>)}</div></div></div></section>
  <ProductCarousel title="New Arrivals" copy="A fresh chapter from the loom · Sample selection" offset={4}/>
   <section className="section" id="making-process" style={{scrollMarginTop:110}}><div className="wrap"><div className="section-head"><div><span className="eyebrow">From yarn to cloth</span><h2>The making lifecycle</h2><p>Follow three illustrative stages, from preparing yarn to the handloom. The sequence and methods vary across fibres, regions and makers.</p></div></div><HomeMakingJourney/></div></section>
  <IndiaWeaves/>
  <Reviews/>
  <section className="section"><div className="wrap"><div className="section-head"><div><h2>Shop by Weave</h2><p>Different regions. Distinct hands. A shared love of cloth.</p></div><a href={base+"Collections"} className="link">All weaves →</a></div>
    <div className="weave-grid">{["Ikat","Jamdani","Kanchipuram","Banarasi","Pashmina","Narayanpet"].map((w,i)=><a key={w} href={base+"Collections?category="+(w==="Pashmina"?"Dupattas":"Sarees")+"&weave="+w}><Textile pattern={"s"+(i+1)} label={w}/><h3>{w}</h3><span className="eyebrow" style={{fontSize:9}}>Explore →</span></a>)}</div>
  </div></section>
    <section className="section" style={{paddingTop:12}}><div className="wrap home-guide-link"><a href={base+"Collections?category=Sarees"}><span className="eyebrow">A companion for choosing</span><h3>Find your thread.</h3><p>Begin with Kanchipuram, Mangalagiri and Narayanpet. Compare fabrics and borders, then narrow the collection by region or weave.</p><span className="link">Discover saree collections →</span></a><a href={base+"SareeCare"}><span className="eyebrow">A companion for keeping</span><h3>Care for the cloth.</h3><p>Give an everyday cotton and a treasured silk the different kinds of attention they need.</p><span className="link">Read the saree care notes →</span></a></div></section>
 </Shell>
}

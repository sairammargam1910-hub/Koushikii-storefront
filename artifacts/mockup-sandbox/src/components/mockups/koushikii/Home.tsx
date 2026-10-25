import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight, Instagram, Mail, Pause, Play, RotateCcw } from "lucide-react";
import { Shell, products, ProductGrid, base, TempleBorder, whatsappOrderUrl } from "./_shared";
import { stateNames, statePaths, stateWeaves } from "./_reference";
import { LogoSilhouette } from "./_LogoSilhouette";
import "./HomeMakingJourney.css";
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
function WhatsAppFooterMark(){
 return <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 3.2a12.5 12.5 0 0 0-10.7 19L3.5 28.5l6.5-1.7A12.5 12.5 0 1 0 16 3.2Z" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinejoin="round"/><path d="M12.1 9.7c-.4-.9-.8-.9-1.2-.9h-1c-.4 0-.9.2-1.3.7s-1.7 1.7-1.7 4.1 1.8 4.7 2 5c.2.4 3.5 5.6 8.6 7.6 4.2 1.7 5.1 1.3 6 1.2.9-.1 2.9-1.2 3.3-2.4.4-1.2.4-2.2.3-2.4-.1-.2-.4-.4-.9-.6l-3.1-1.5c-.4-.2-.8-.3-1.1.3-.4.6-1.3 1.6-1.6 2-.3.4-.6.4-1.1.1-.5-.2-2.1-.8-4-2.5-1.5-1.3-2.5-2.9-2.8-3.4-.3-.5 0-.8.2-1 .2-.2.5-.6.7-.9.2-.3.3-.5.5-.8.2-.3.1-.6 0-.9l-1.3-3.2Z" fill="currentColor" transform="translate(2 -2) scale(.82)"/></svg>;
}
function HomeFooterLayout(){
 const [target,setTarget]=useState<HTMLElement|null>(null);
 const [subscribed,setSubscribed]=useState(false);
 useEffect(()=>{setTarget(document.querySelector<HTMLElement>(".kq .footer > .wrap"))},[]);
 if(!target)return null;
 return createPortal(<div className="home-footer-reimagined">
  <div className="home-footer-grid">
   <div className="home-footer-brand">
    <a className="home-footer-logo" href={base+"Home"} aria-label="Chenetha by Koushikii home"><LogoSilhouette/></a>
    <p>Sarees and dupattas. The warmth of a hand, the memory of a loom.</p>
    <a className="home-footer-contact" href={base+"Contact"}>Questions about a weave? We’re here to help <ArrowRight size={14}/></a>
    <span className="home-footer-origin">Rooted in the South · Woven across India</span>
   </div>
   <nav className="home-footer-links" aria-label="Our company">
    <h4>Our Company</h4>
    <a href={base+"OurStory"}>Our Story</a>
    <a href={base+"Contact"}>Contact Us</a>
    <a href={base+"CustomerCare"}>Customer Care</a>
    <a href={base+"SareeCare"}>Saree Care</a>
   </nav>
   <nav className="home-footer-links" aria-label="Quick links">
    <h4>Quick Links</h4>
    <a href={base+"Collections"}>Collections</a>
    <a href={base+"Collections?edit=new"}>New Arrivals</a>
    <a href={base+"Collections?edit=premium"}>Premium Collection</a>
    <a href={base+"Videos"}>Videos</a>
    <a href={base+"Orders"}>Orders & tracking</a>
   </nav>
   <section className="home-footer-newsletter" aria-labelledby="home-footer-news-title">
    <span className="home-footer-kicker">A note from our loom</span>
    <h3 id="home-footer-news-title">Letters from the loom</h3>
    <p>New weaves, care notes and stories behind the cloth.</p>
    <nav className="home-footer-social" aria-label="Social and contact links">
     <a href="https://www.instagram.com/chenetha_by_koushikii/" target="_blank" rel="noopener noreferrer" aria-label="Follow Chenetha by Koushikii on Instagram" title="Instagram"><Instagram size={20} aria-hidden="true"/></a>
     <a href={whatsappOrderUrl("Namaste, I would like to ask about a handloom piece from Chenetha by Koushikii.")} target="_blank" rel="noopener noreferrer" aria-label="Chat with Chenetha by Koushikii on WhatsApp" title="WhatsApp"><WhatsAppFooterMark/></a>
     <a href={base+"Contact"} aria-label="Email Chenetha by Koushikii through the contact page" title="Email"><Mail size={20} aria-hidden="true"/></a>
    </nav>
    {subscribed?<p className="home-footer-status" role="status">Thank you. Your sign-up is recorded for this demo only.</p>:<form className="home-footer-form" onSubmit={event=>{event.preventDefault();setSubscribed(true)}}>
     <input required type="email" aria-label="Newsletter email address" placeholder="Your email address"/>
     <button type="submit" className="btn gold">Sign up <ArrowRight size={14}/></button>
    </form>}
    <small>Preview only · No email is sent or shared.</small>
   </section>
  </div>
  <div className="home-footer-bottom">
   <span>© Chenetha by Koushikii · Design preview · Sample catalog and demo checkout.</span>
   <a href={base+"Checkout"}>Payment & delivery details at checkout <ArrowRight size={12}/></a>
  </div>
 </div>,target);
}
const makingStages = [
  {id:"yarn",step:"01",note:"Preparation",title:"Prepare the yarn",copy:"Yarn is wound onto bobbins in preparation for the loom. The tools and sequence vary between fibres and weaving communities.",image:"/__mockup/images/koushikii-home-yarn.svg",video:"/__mockup/images/koushikii-home-yarn.mp4",alt:"A short video of yarn preparation for handloom weaving."},
  {id:"dye",step:"02",note:"Colour",title:"Bring in the colour",copy:"Yarn may be coloured before it is woven. Dye methods and timing differ by material, design and regional practice.",image:"/__mockup/images/koushikii-home-dye.svg",video:"/__mockup/images/koushikii-home-dye.mp4",alt:"A short video showing the colouring stage of handloom preparation."},
  {id:"loom",step:"03",note:"Weaving",title:"Weave the cloth",copy:"Warp and weft meet at the handloom. Each pass of the shuttle brings the fabric a little closer to its finished form.",image:"/__mockup/images/koushikii-home-loom.svg",video:"/__mockup/images/koushikii-home-loom.mp4",alt:"A short video of a handloom in use."},
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
    {Object.entries(statePaths).map(([code,d])=><path key={code} d={d} fill={selected===code?"#b22222":stateWeaves[code]?"#d4a23b":"#e2d5b8"} stroke="#886c49" strokeWidth=".8" tabIndex={0} role="button" aria-label={stateNames[code]} aria-pressed={selected===code} onMouseEnter={()=>setSelected(code)} onFocus={()=>setSelected(code)} onClick={()=>setSelected(code)} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();setSelected(code)}}}/>)}
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

const aboutTranslations = {
  en: {
    eyebrow: "The thought behind Chenetha",
    title: "A saree holds more than a pattern.",
    lead: "Rooted in South Indian handloom culture, woven across India.",
    first: "Look closely at the border, the body, the pallu: colour, texture and drape give each textile its own character. Small details change how a piece feels and moves.",
    second: "We want to make these traditions easier to discover, describe each textile with care and make room for makers' stories when they are shared with permission.",
    values: [
      ["01", "Look closer", "Explore weave, border, fabric and drape before choosing."],
      ["02", "Name with care", "Regional names begin a conversation; they are not proof of origin."],
      ["03", "Choose for life", "Find a cloth that suits how you live, then care for it thoughtfully."],
    ],
    imageAlt: "Hands arranging a patterned cloth across a wooden handloom.",
    caption: "A closer look at cloth taking shape at the loom.",
  },
  te: {
    eyebrow: "Chenetha వెనుక ఉన్న ఆలోచన",
    title: "ఒక చీరలో నమూనా కన్నా ఎక్కువ ఉంది.",
    lead: "దక్షిణ భారత చేనేత సంస్కృతిలో పాతుకుపోయి, భారతదేశమంతా అల్లబడినది.",
    first: "అంచు, వస్త్రపు భాగం, పైటను దగ్గరగా చూడండి: రంగు, ఆకృతి, కట్టుకునే తీరు ప్రతి వస్త్రానికి ప్రత్యేకతను ఇస్తాయి. చిన్న వివరాలే వస్త్రం ఎలా అనిపిస్తుందో, ఎలా కదులుతుందో మార్చుతాయి.",
    second: "ఈ సంప్రదాయాలను సులభంగా తెలుసుకునేలా చేయడం, ప్రతి వస్త్రాన్ని శ్రద్ధగా వివరించడం, అనుమతితో పంచుకున్నప్పుడే నేతగారి కథలకు చోటివ్వడం మా ఉద్దేశం.",
    values: [
      ["01", "దగ్గరగా చూడండి", "ఎంచుకునే ముందు నేత, అంచు, వస్త్రం, కట్టుకునే తీరును గమనించండి."],
      ["02", "పేరును శ్రద్ధగా వాడండి", "ప్రాంతీయ పేర్లు సంభాషణకు ఆరంభం మాత్రమే; అవి ఉత్పత్తి స్థలానికి రుజువు కావు."],
      ["03", "జీవనశైలికి సరిపడేలా ఎంచుకోండి", "మీకు సరిపోయే వస్త్రాన్ని ఎంచుకుని, జాగ్రత్తగా సంరక్షించండి."],
    ],
    imageAlt: "చెక్క మగ్గంపై నమూనా వస్త్రాన్ని సరిచేస్తున్న చేతులు.",
    caption: "మగ్గంపై రూపం దాలుస్తున్న వస్త్రాన్ని దగ్గరగా చూడండి.",
  },
  hi: {
    eyebrow: "Chenetha के पीछे की सोच",
    title: "साड़ी में सिर्फ़ एक नमूना नहीं होता।",
    lead: "दक्षिण भारतीय हथकरघा संस्कृति से जुड़ी, पूरे भारत में बुनी।",
    first: "किनारे, मुख्य हिस्से और पल्लू को ध्यान से देखें: रंग, बनावट और पहनने का ढंग हर वस्त्र को अपना चरित्र देते हैं। छोटी-छोटी बातें बदल देती हैं कि कपड़ा कैसा लगता और कैसे बहता है।",
    second: "हम इन परंपराओं को खोजना आसान बनाना, हर वस्त्र का विवरण सोच-समझकर देना और कारीगरों की कहानियों को जगह देना चाहते हैं—जब वे अनुमति से साझा की जाएँ।",
    values: [
      ["01", "ध्यान से देखें", "चुनने से पहले बुनाई, किनारा, कपड़ा और पहनने का ढंग समझें।"],
      ["02", "नाम सोच-समझकर दें", "क्षेत्रीय नाम बातचीत की शुरुआत हैं; वे उत्पत्ति का प्रमाण नहीं।"],
      ["03", "अपने जीवन के लिए चुनें", "अपने अनुकूल कपड़ा चुनें और उसकी सोच-समझकर देखभाल करें।"],
    ],
    imageAlt: "लकड़ी के हथकरघे पर नमूनेदार कपड़ा ठीक करते हाथ।",
    caption: "करघे पर आकार लेते कपड़े को करीब से देखें।",
  },
} as const;

type HomeLanguage = keyof typeof aboutTranslations;

function useHomeLanguage(): HomeLanguage {
  const [language, setLanguage] = useState<HomeLanguage>(() => {
    try {
      const saved = localStorage.getItem("kq-language");
      return saved === "te" || saved === "hi" ? saved : "en";
    } catch {
      return "en";
    }
  });

  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".kq");
    if (!root) return;
    const syncLanguage = () => {
      const next = root.dataset.lang;
      if (next === "en" || next === "te" || next === "hi") setLanguage(next);
    };
    syncLanguage();
    const observer = new MutationObserver(syncLanguage);
    observer.observe(root, { attributes: true, attributeFilter: ["data-lang"] });
    return () => observer.disconnect();
  }, []);

  return language;
}

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
  const about = aboutTranslations[useHomeLanguage()];
  useEffect(()=>{
   if(window.location.hash==="#about-us"){
    window.requestAnimationFrame(()=>document.getElementById("about-us")?.scrollIntoView({block:"start",behavior:"auto"}));
   }
  },[]);
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
   <section className="section" id="making-process" style={{scrollMarginTop:110}}><div className="wrap"><div className="section-head"><div><span className="eyebrow">From yarn to cloth</span><h2>The making lifecycle</h2><p>Follow three illustrative stages, from preparing yarn to the handloom. The sequence and methods vary across fibres, regions and makers.</p></div></div><MakingJourney/></div></section>
  <IndiaWeaves/>
   <section className="section home-about" id="about-us" style={{scrollMarginTop:110}}>
    <div className="wrap home-about-card">
     <div className="home-about-copy">
       <span className="eyebrow">{about.eyebrow}</span>
       <h2>{about.title}</h2>
       <p className="home-about-lead">{about.lead}</p>
       <p>{about.first}</p>
       <p>{about.second}</p>
      <div className="home-about-values">
        {about.values.map(([number, title, copy])=><div key={number}><span>{number}</span><strong>{title}</strong><small>{copy}</small></div>)}
      </div>
      <a className="btn gold" href={base+"OurStory"}>Continue to our story <ArrowRight size={14}/></a>
     </div>
     <figure className="home-about-visual">
        <img
          className="home-about-image"
          src="/__mockup/images/koushikii-weave.jpg"
          alt={about.imageAlt}
          loading="lazy"
        />
       <figcaption>{about.caption}</figcaption>
     </figure>
    </div>
   </section>
  <Reviews/>
  <section className="section"><div className="wrap"><div className="section-head"><div><h2>Shop by Weave</h2><p>Different regions. Distinct hands. A shared love of cloth.</p></div><a href={base+"Collections"} className="link">All weaves →</a></div>
    <div className="weave-grid">{["Ikat","Jamdani","Kanchipuram","Banarasi","Pashmina","Narayanpet"].map((w,i)=><a key={w} href={base+"Collections?category="+(w==="Pashmina"?"Dupattas":"Sarees")+"&weave="+w}><Textile pattern={"s"+(i+1)} label={w}/><h3>{w}</h3><span className="eyebrow" style={{fontSize:9}}>Explore →</span></a>)}</div>
  </div></section>
     <section className="section" style={{paddingTop:12}}><div className="wrap home-guide-link"><a href={base+"Collections?category=Sarees"}><span className="eyebrow">A companion for choosing</span><h3>Find your thread.</h3><p>Begin with Kanchipuram, Mangalagiri and Narayanpet. Compare fabrics and borders, then narrow the collection by region or weave.</p><span className="link">Discover saree collections →</span></a><a href={base+"SareeCare"}><span className="eyebrow">A companion for keeping</span><h3>Care for the cloth.</h3><p>Give an everyday cotton and a treasured silk the different kinds of attention they need.</p><span className="link">Read the saree care notes →</span></a></div></section>
     <HomeFooterLayout/>
 </Shell>
}

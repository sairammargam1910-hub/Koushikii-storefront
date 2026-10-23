import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Pause, Play, RotateCcw } from "lucide-react";
import { Shell, PageHero, base } from "./_shared";
import { CraftScene } from "./CraftAnimation";

const profiles = [
 {role:"weaving" as const,title:"At the handloom",copy:"The lift of a pedal. The pass of a shuttle. Warp and weft meet, one deliberate row at a time.",note:"Weaving · Illustrative South Indian workshop"},
 {role:"winding" as const,title:"Before the first thread",copy:"Yarn is wound onto a bobbin, ready for the shuttle. The patient preparation matters as much as the finished cloth.",note:"Winding · Illustrative craft role"},
 {role:"dyeing" as const,title:"Colour, slowly gathered",copy:"Yarn meets the dye bath before it reaches the loom. Colours, methods and materials differ between weaving communities.",note:"Dyeing · Illustrative craft role"},
];
function WeaverGallery(){
 const [slide,setSlide]=useState(0),[playing,setPlaying]=useState(true),[reduced,setReduced]=useState(true),[replay,setReplay]=useState(0);
 useEffect(()=>{
  const media=window.matchMedia("(prefers-reduced-motion: reduce)");
  const update=()=>{setReduced(media.matches);setPlaying(!media.matches)};update();media.addEventListener("change",update);
  return()=>media.removeEventListener("change",update);
 },[]);
 useEffect(()=>{if(!playing||reduced)return;const timer=window.setInterval(()=>setSlide(s=>(s+1)%profiles.length),16000);return()=>window.clearInterval(timer)},[playing,reduced]);
 const p=profiles[slide];
 return <section className="section"><div className="wrap">
  <div className="section-head"><div><span className="eyebrow">The people behind the process</span><h2>A workshop in motion</h2><p>An animated gallery of local craft roles — not a directory of actual makers.</p></div></div>
  <div className="maker-gallery"><div className="craft-frame"><CraftScene key={p.role+replay} role={p.role} paused={!playing}/></div><div>
   <span className="draft-label">Illustrative profile · Not an actual employee</span><h3>{p.title}</h3><p className="muted">{p.copy}</p><p className="eyebrow" style={{fontSize:10}}>{p.note}</p>
   <div className="carousel-controls" style={{marginTop:25,flexWrap:"wrap"}}><button onClick={()=>{setSlide((slide+2)%3);setPlaying(false)}} aria-label="Previous craft role"><ArrowLeft size={15}/></button><span>{slide+1} / 3</span><button onClick={()=>{setSlide((slide+1)%3);setPlaying(false)}} aria-label="Next craft role"><ArrowRight size={15}/></button><button disabled={reduced} aria-pressed={playing&&!reduced} onClick={()=>setPlaying(!playing)}>{playing&&!reduced?<Pause size={14}/>:<Play size={14}/>} {playing&&!reduced?"Pause":"Play"}</button><button onClick={()=>{setReplay(r=>r+1);setPlaying(!reduced)}}><RotateCcw size={14}/>{reduced?"Reset still":"Replay"}</button></div>
   <p className="muted" style={{fontSize:11}}>Original illustrated scenes describing craft processes; no maker identity or partnership is represented.</p>
  </div></div>
 </div></section>
}
export function OurStory(){
 return <Shell>
  <PageHero eyebrow="About Us · Chenetha by Koushikii" title="Every thread has a hand behind it" subtitle="Rooted in South Indian handloom culture, with an open heart for the weaving traditions of India."/>
  <section className="section"><div className="wrap story-origin"><div><h2>A thread worth following</h2><div className="story-illustration"><CraftScene role="winding" paused/></div><p className="muted" style={{fontSize:11}}>An illustrated study of yarn preparation.</p></div>
   <div><span className="eyebrow">The idea behind Chenetha</span><h3 style={{margin:"22px 0 14px"}}>Cloth is more than its colour.</h3>
    <p className="muted">Chenetha by Koushikii is rooted in a love of South Indian textile culture: the rhythm of checks, the architecture of a temple border and the way a saree becomes part of everyday life. The intent is to make room for looking closely, choosing thoughtfully and wearing well.</p>
    <p className="muted">A regional name can open a conversation, but it cannot tell the whole story of a piece. Fibre, technique, weight and finish each matter. Understanding their differences helps us value the knowledge within the cloth without reducing a tradition to a single pattern.</p>
    <div className="milestones">{[
     ["01","Look closely","Notice the relationship between the body, border and pallu. Let texture be as important as colour."],
     ["02","Ask about the cloth","Understand composition and construction. A familiar regional name is a starting point, not proof of origin."],
     ["03","Choose for your life","Think about when you will wear it, how it drapes and the care it needs."],
     ["04","Keep it in use","Air, fold and store with attention. Care makes space for many more days of wearing."]
    ].map(([n,title,copy])=><div className="milestone" key={n}><b>{n}</b><div><h3 style={{fontSize:25,marginBottom:5}}>{title}</h3><p>{copy}</p></div></div>)}</div>
   </div>
  </div></section>
  <section className="section"><div className="wrap"><div className="section-head"><div><h2>What we value in handloom</h2><p>A philosophy of attention, not a claim of certification.</p></div></div>
   <div className="promise-grid">{[
    ["Skilled work","A handloom textile holds many kinds of knowledge: preparing yarn, planning colour, setting the warp and working at the loom. Each deserves recognition."],
    ["Living traditions","Regional pattern languages continue through learning, practice and adaptation. Tradition is not a frozen design; it is knowledge kept in use."],
    ["Honest descriptions","Origin, fibre and production method are separate questions. Specific, reliable information matters more than a romantic label."],
    ["Longer wear","Care, repair and thoughtful storage can help a textile remain part of a wardrobe. Begin with the instructions for the individual piece."]
   ].map(([title,copy],i)=><article key={title}><span className="promise-number">0{i+1}</span><h3>{title}</h3><p>{copy}</p></article>)}</div>
   <p className="muted" style={{fontSize:11}}>Brand philosophy · This preview does not claim verified maker partnerships, certification or environmental outcomes.</p>
  </div></section>
  <WeaverGallery/>
  <section className="section"><div className="wrap"><div className="story-end"><span className="eyebrow" style={{color:"#e3bf71"}}>Keep the thread moving</span><h2 style={{marginTop:13}}>Wear a story woven by hand</h2><p>Start with a textile. Stay for the places and knowledge behind it.</p><div className="actions"><a className="btn gold" href={base+"Collections"}>Shop Collections <ArrowRight size={14}/></a><a className="btn pale" href={base+"SareeCare"}>Care for your cloth</a></div></div></div></section>
 </Shell>
}

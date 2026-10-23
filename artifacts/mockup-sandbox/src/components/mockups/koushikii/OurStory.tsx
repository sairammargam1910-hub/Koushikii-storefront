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
   <p className="muted" style={{fontSize:11}}>Original illustrated scenes. Verified names, portraits and maker stories will be added with permission.</p>
  </div></div>
 </div></section>
}
export function OurStory(){
 return <Shell>
  <PageHero eyebrow="About Us · Chenetha by Koushikii" title="Every thread has a hand behind it" subtitle="Rooted in South Indian handloom culture, with an open heart for the weaving traditions of India."/>
  <section className="section"><div className="wrap story-origin"><div><h2>How We Started</h2><div className="story-illustration"><CraftScene role="winding" paused/></div><p className="muted" style={{fontSize:11}}>An illustrated beginning — founder portrait and verified story to follow.</p></div>
   <div><span className="draft-label">Origin narrative · Draft awaiting founder input</span><h3 style={{margin:"22px 0 14px"}}>A beginning worth telling in its own words.</h3>
    <p className="muted">This space is reserved for the real story of Chenetha by Koushikii: who began it, the first meeting with a weaving community, and the moment that made this work feel necessary.</p>
    <p className="muted">The founder’s name, dates and personal journey have not yet been supplied. Rather than invent a history, we have left a thoughtful outline for the client to complete.</p>
    <div className="milestones">{[
     ["01","The first thread","To confirm: the founder, place and first spark behind Chenetha."],
     ["02","The first connection","To confirm: the first weaving community and how the relationship began."],
     ["03","The first collection","To confirm: the launch date and textiles that shaped the early collection."],
     ["04","The work today","To confirm: current maker relationships and the next chapter."]
    ].map(([n,title,copy])=><div className="milestone" key={n}><b>{n} <span style={{fontSize:11}}>DRAFT</span></b><div><h3 style={{fontSize:25,marginBottom:5}}>{title}</h3><p>{copy}</p></div></div>)}</div>
   </div>
  </div></section>
  <section className="section"><div className="wrap"><div className="section-head"><div><h2>Our Promise to Weavers</h2><p>The principles we want every collection to stand for.</p></div></div>
   <div className="promise-grid">{[
    ["Fair, direct pay","Build direct relationships and agree fair payment with makers. Commercial practices will be documented as partnerships are confirmed."],
    ["Keeping looms alive","Support the transmission of skills and the regional pattern languages carried from one generation to the next."],
    ["Known makers","Recognise the people behind a textile. Share maker names and stories only when verified and with their consent."],
    ["Gentle on the earth","Choose materials thoughtfully and make room for care, repair and longer wear — without unverified sustainability claims."]
   ].map(([title,copy],i)=><article key={title}><span className="promise-number">0{i+1}</span><h3>{title}</h3><p>{copy}</p></article>)}</div>
   <p className="muted" style={{fontSize:11}}>Proposed brand commitments — operational details and partnership evidence await client confirmation.</p>
  </div></section>
  <WeaverGallery/>
  <section className="section"><div className="wrap"><div className="story-end"><span className="eyebrow" style={{color:"#e3bf71"}}>Keep the thread moving</span><h2 style={{marginTop:13}}>Wear a story woven by hand</h2><p>Start with a textile. Stay for the people, places and knowledge behind it.</p><div className="actions"><a className="btn gold" href={base+"Collections"}>Shop Collections <ArrowRight size={14}/></a><a className="btn pale" href={base+"Journal"}>Read our Blog</a></div></div></div></section>
 </Shell>
}

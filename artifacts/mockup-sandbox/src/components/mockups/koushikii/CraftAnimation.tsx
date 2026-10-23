import { useEffect, useId, useState } from "react";
import { Pause, Play, RotateCcw } from "lucide-react";

type CraftRole = "weaving" | "winding" | "dyeing";
export function CraftScene({role="weaving",paused=false}:{role?:CraftRole;paused?:boolean}){
 const id=useId().replace(/:/g,"");
 return <div className={`craft-scene ${paused?"paused":""}`}><span className="scene-caption">A day at the loom · Illustrated craft study</span>
 <svg viewBox="0 0 900 510" role="img" aria-label={`Illustrated adult South Indian artisan ${role} in a traditional handloom workshop`}>
 <defs>
  <linearGradient id={id+"wall"} x2="0" y2="1"><stop stopColor="#f1e2c5"/><stop offset="1" stopColor="#d8bf95"/></linearGradient>
  <pattern id={id+"cloth"} width="26" height="18" patternUnits="userSpaceOnUse"><rect width="26" height="18" fill="#922c32"/><path d="M0 4h26M0 7h26M7 0v18" stroke="#d5ab53" strokeWidth="2"/></pattern>
  <pattern id={id+"warp"} width="8" height="8" patternUnits="userSpaceOnUse"><path d="M3 0v8" stroke="#f7e9c5" strokeWidth="2"/><path d="M5 0v8" stroke="#ad8a55" strokeWidth=".5"/></pattern>
 </defs>
 <rect width="900" height="510" fill={`url(#${id}wall)`}/>
 <path d="M0 0h900v55H0z" fill="#744637"/><path d="M0 51h900" stroke="#bb864e" strokeWidth="6"/>
 <path d="M80 55v365M835 55v365" stroke="#a87b50" strokeWidth="15"/>
 <path d="M123 110q75-100 150 0v165H123Z" fill="#546f60" stroke="#bd9664" strokeWidth="12"/>
 <path d="M135 208q60-50 126-18v73H135Z" fill="#768664"/><path d="M197 71v202M126 160h144" stroke="#d1b281" strokeWidth="7"/>
 <path d="M295 55L0 366V420L370 55Z" fill="#f8edca" opacity=".32"/>
 <rect y="420" width="900" height="90" fill="#bd8c67"/><path d="M0 446h900M0 478h900" stroke="#a87556" opacity=".35"/>
 <g fill="none" stroke="#efdfc0" strokeWidth="2" opacity=".7"><path d="M63 460l20-20 20 20-20 20Z M53 460h60M83 430v60"/><circle cx="83" cy="460" r="13"/><path d="M780 463l22-22 22 22-22 22Z"/><circle cx="802" cy="463" r="15"/></g>
 <g><path d="M700 92h80v75h-80Z" fill="#a06a45"/><path d="M708 100h64v58h-64Z" fill="#e8d3a3"/><path d="M740 108l20 22-20 22-20-22Z" fill="none" stroke="#922c32" strokeWidth="3"/><circle cx="740" cy="130" r="5" fill="#ba8b39"/></g>
 <path d="M610 317h165v12H610zM627 329v92M759 329v92" fill="#76513a" stroke="#76513a" strokeWidth="7"/>
 <g stroke="#d5a755" strokeWidth="2"><path d="M650 270v45h32v-45Z" fill="#922c32"/><path d="M696 260v55h32v-55Z" fill="#365b4c"/><path d="M742 280v35h22v-35Z" fill="#d5a755"/></g>
 {/* Adult artisan: tied hair, bindi, cotton sari and substantial seated proportions. */}
 <path d="M388 292q-22 48-7 96l83 38 57-21-58-65Z" fill="#365b4c" stroke="#294638" strokeWidth="3"/>
 <path className="loom-pedal" d="M417 378l21 65h66l-2 13-85-4-39-65" fill="#b87a56" stroke="#8f543e" strokeWidth="3"/>
 <path d="M412 215q-35 7-41 45l-4 71 96 34 14-83-29-60Z" fill="#b54b40" stroke="#7e3e32" strokeWidth="3"/>
 <path d="M408 220l55 126-19 21-66-133" fill="#d5ad59"/><path d="M415 229l41 112" stroke="#f0d386" strokeWidth="3"/>
 <path d="M413 198v30q12 14 26-1v-34" fill="#b97c57" stroke="#8d533d" strokeWidth="2"/>
 <ellipse cx="423" cy="174" rx="34" ry="43" fill="#c99066" stroke="#8d533d" strokeWidth="2"/>
 <path d="M388 176q-8-57 35-57 46 2 38 60l-11-24q-26 9-43-4Z" fill="#382e2a"/>
 <circle cx="389" cy="160" r="18" fill="#382e2a"/><path d="M381 154q-12 13 2 21" fill="none" stroke="#eee2bb" strokeWidth="5"/>
 <path d="M404 174l9-2M433 172l9 2" stroke="#3e302c" strokeWidth="3" strokeLinecap="round"/><path d="M423 176l-3 14h6M417 200q8 5 15-2" fill="none" stroke="#8d4b3b" strokeWidth="2"/>
 <circle cx="423" cy="163" r="3" fill="#922c32"/><circle cx="395" cy="188" r="5" fill="none" stroke="#d4a23b" strokeWidth="3"/>
 <g className="weaver-arm"><path d="M450 250q22 21 31 40l65 10-2 15-80-7q-22-14-35-38" fill="#c99066" stroke="#8d533d" strokeWidth="3"/><path d="M540 301l20-2 12 8-28 9" fill="#c99066" stroke="#8d533d" strokeWidth="2"/></g>
 {role==="weaving"?<g>
  <path d="M288 189v265M600 189v265M280 193h330M270 336h350M280 421h330" stroke="#684631" strokeWidth="15" fill="none"/>
  <path d="M291 213h310M294 222h304" stroke="#b0804a" strokeWidth="8"/>
  <path d="M307 226L280 355H616L584 226Z" fill={`url(#${id}warp)`}/>
  <g className="warp-moving"><path d="M317 226l-20 123M333 226l-17 123M349 226l-13 123M365 226l-10 123M381 226l-6 123M397 226l-3 123M413 226v123M429 226l3 123M445 226l6 123M461 226l9 123M477 226l12 123M493 226l15 123M509 226l18 123M525 226l21 123M541 226l24 123M557 226l27 123" stroke="#dfb14d" strokeWidth="2"/></g>
  <g className="beater"><path d="M289 291h314v18H289Z" fill="#7c5135" stroke="#c6985b" strokeWidth="3"/>{Array.from({length:36},(_,i)=><path key={i} d={`M${297+i*8} 292v17`} stroke="#ead2a4" strokeWidth="1"/>)}</g>
  <path d="M280 352h336v98H280Z" fill={`url(#${id}cloth)`}/><path className="thread-progress" d="M280 380h336M280 386h336" stroke="#e7c875" strokeWidth="3"/>
  <g className="shuttle"><path d="M307 323l32-9 33 9-33 9Z" fill="#d8a449" stroke="#78472e" strokeWidth="2"/><path d="M330 323h20" stroke="#f2e4c0" strokeWidth="4"/></g>
  <path d="M275 451h346" stroke="#684631" strokeWidth="17"/><path d="M288 456l-11 29M602 456l14 29" stroke="#684631" strokeWidth="12"/>
  <path d="M305 196l12-53M579 195l-12-52" stroke="#684631" strokeWidth="7"/><path d="M315 144h255" stroke="#684631" strokeWidth="10"/>
 </g>:role==="winding"?<g>
  <path d="M150 343l-35 102M163 345l52 100M94 444h138" stroke="#775035" strokeWidth="9"/>
  <g className="wheel"><circle cx="160" cy="345" r="83" fill="none" stroke="#7c5135" strokeWidth="8"/><circle cx="160" cy="345" r="66" fill="none" stroke="#c69957" strokeWidth="3"/>{Array.from({length:12},(_,i)=><path key={i} d="M160 345v-81" stroke="#8f613f" strokeWidth="3" transform={`rotate(${i*30} 160 345)`}/>)}<circle cx="160" cy="345" r="12" fill="#d3aa61"/></g>
  <path d="M240 344l291-37" stroke="#f0dfb6" strokeWidth="2"/><path d="M520 322h73v93h-73Z" fill={`url(#${id}cloth)`}/><path d="M514 319h85M514 419h85" stroke="#775035" strokeWidth="8"/>
 </g>:<g>
  <path d="M220 353q-25 91 31 108h77q55-17 29-108Z" fill="#98503c" stroke="#733f30" strokeWidth="5"/><ellipse cx="289" cy="352" rx="70" ry="20" fill="#593947"/><path d="M281 289v67h48v-68" fill="#922c32" stroke="#e0bd70" strokeWidth="3"/><path d="M280 290l200 13" stroke="#a57847" strokeWidth="8"/>
  <g className="steam" fill="none" stroke="#f6e9cc" strokeWidth="4"><path d="M255 325q-20-20 0-40t0-40M285 322q-20-20 0-40t0-40M319 327q-20-20 0-40t0-40"/></g>
  <path d="M584 144h185M605 144v120h44V144M676 144v120h44V144" fill="#365b4c" stroke="#a17a48" strokeWidth="5"/>
 </g>}
 <g><path d="M34 389h43l-8 49H41Z" fill="#935438"/><path d="M56 390v-70M56 366q-34-18-24-37 29 6 24 37M56 352q34-16 25-35-29 6-25 35" fill="#526d4b" stroke="#526d4b" strokeWidth="3"/></g>
 <path d="M0 502h900" stroke="#922c32" strokeWidth="16"/><path d="M0 493h900" stroke="#d4a23b" strokeWidth="3"/>
 </svg></div>
}

export function CraftAnimation(){
 const [playing,setPlaying]=useState(true),[replay,setReplay]=useState(0);
 useEffect(()=>{const media=window.matchMedia("(prefers-reduced-motion: reduce)");const update=()=>setPlaying(!media.matches);update();media.addEventListener("change",update);return()=>media.removeEventListener("change",update)},[]);
 return <div className="craft-frame">
  <CraftScene key={replay} paused={!playing}/>
  <div className="scene-controls"><div><button onClick={()=>setPlaying(!playing)} aria-pressed={playing}>{playing?<Pause size={14}/>:<Play size={14}/>} {playing?"Pause":"Play"} animation</button><button onClick={()=>{setReplay(replay+1);setPlaying(true)}}><RotateCcw size={14}/>Replay</button></div><p>Animated craft preview · Original illustration, not client footage</p></div>
  <div className="craft-steps"><div><b>01 · Prepare</b>Wind the yarn onto a bobbin.</div><div><b>02 · Lift</b>Separate the warp threads.</div><div><b>03 · Pass</b>The shuttle carries the weft.</div><div><b>04 · Beat</b>Each row settles into cloth.</div></div>
 </div>
}

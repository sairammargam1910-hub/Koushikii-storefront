import { useEffect, useId, useRef, useState } from "react";

type CraftRole = "weaving" | "winding" | "dyeing";
type Point = [number, number];
const captions: Record<CraftRole, string> = {
 weaving: "At the loom · Lift, pass, settle, beat",
 winding: "Yarn preparation · Hand-cranked bobbin winder",
 dyeing: "At the dye bath · Lowering a hank of yarn",
};
const clamp = (n: number) => Math.min(1, Math.max(0, n));
const ease = (n: number) => { const v = clamp(n); return v * v * (3 - 2 * v); };

function useReducedMotion() {
 const [reduced, setReduced] = useState(true);
 useEffect(() => {
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  const sync = () => setReduced(media.matches);
  sync();
  media.addEventListener("change", sync);
  return () => media.removeEventListener("change", sync);
 }, []);
 return reduced;
}

// One elapsed clock drives every joint, tool and thread. Pausing preserves the
// exact phase; a keyed remount is the only operation that resets the clock.
function useCraftClock(stopped: boolean) {
 const elapsed = useRef(0);
 const [cycle, setCycle] = useState(0);
 useEffect(() => {
  if (stopped) return;
  let frame = 0, previous: number | undefined, painted = 0;
  const tick = (now: number) => {
   if (previous !== undefined) elapsed.current += Math.min(now - previous, 80);
   previous = now;
   if (now - painted >= 1000 / 30) {
    setCycle((elapsed.current % 8000) / 8000);
    painted = now;
   }
   frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(frame);
 }, [stopped]);
 return cycle;
}

function Segment({from,to,color,width=2}:{from:Point;to:Point;color:string;width?:number}) {
 const dx=to[0]-from[0],dy=to[1]-from[1];
 const angle=Math.atan2(dy,dx)*180/Math.PI;
 const length=Math.hypot(dx,dy);
 // Fixed geometry; only its transform changes. Joint endpoints are calculated
 // from the same points as the tools, so a wrist cannot drift off its grip.
 return <g transform={`translate(${from}) rotate(${angle}) scale(${length/100} 1)`}><path d="M0 0H100" stroke={color} strokeWidth={width} fill="none"/></g>;
}

function Arm({ shoulder, elbow, hand }: { shoulder: Point; elbow: Point; hand: Point }) {
 return <g strokeLinecap="round" strokeLinejoin="round">
  <Segment from={shoulder} to={elbow} color="#8d533d" width={20}/>
  <Segment from={elbow} to={hand} color="#8d533d" width={20}/>
  <Segment from={shoulder} to={elbow} color="#c99066" width={15}/>
  <Segment from={elbow} to={hand} color="#c99066" width={15}/>
  <g transform={`translate(${elbow})`}><circle r="7" fill="#c99066"/></g>
  <g transform={`translate(${hand})`}><path d="M-10-3l2 8" stroke="#d3ad59" strokeWidth="4"/><ellipse rx="10" ry="7" fill="#c99066" stroke="#8d533d" strokeWidth="2"/></g>
 </g>;
}

function Artisan({ standing = false }: { standing?: boolean }) {
 return <g>
  {!standing && <path d="M233 355h108M245 358v87M328 358v87" stroke="#684631" strokeWidth="9"/>}
  <path d={standing ? "M250 307l-12 128h97l-28-129Z" : "M247 310q-18 30-2 55l79 29 25-30-43-42Z"} fill="#365b4c" stroke="#294638" strokeWidth="3"/>
  {standing && <path d="M244 435h33m26 0h34" stroke="#a76d4e" strokeWidth="13" strokeLinecap="round"/>}
  <path d="M260 218q-33 5-36 41l3 66 88 16 4-76-27-45Z" fill="#b22222" stroke="#7e3e32" strokeWidth="3"/>
  <path d="M249 225l61 101-19 15-62-105" fill="#d5ad59"/>
  <path d="M249 231l48 91" stroke="#efd08a" strokeWidth="3"/>
  <path d="M260 199v27q14 12 27-1v-26" fill="#b97c57" stroke="#8d533d" strokeWidth="2"/>
  <ellipse cx="272" cy="178" rx="32" ry="41" fill="#c99066" stroke="#8d533d" strokeWidth="2"/>
  <path d="M240 178q-7-55 33-55 41 0 33 50l-10-21q-24 8-42-4Z" fill="#382e2a"/>
  <circle cx="239" cy="160" r="17" fill="#382e2a"/>
  <path d="M232 151q-13 15 1 23" fill="none" stroke="#eee2bb" strokeWidth="5"/>
  <path d="M256 177l8-2m18 0 8 2" stroke="#3e302c" strokeWidth="2.5" strokeLinecap="round"/>
  <path d="M277 179l2 13h-6m-4 9q9 4 15-2" fill="none" stroke="#8d4b3b" strokeWidth="2"/>
  <circle cx="276" cy="163" r="2.6" fill="#b22222"/>
  <circle cx="247" cy="188" r="5" fill="none" stroke="#d4a23b" strokeWidth="3"/>
 </g>;
}

export function CraftScene({ role = "weaving", paused = false }: { role?: CraftRole; paused?: boolean }) {
 const id = useId().replace(/:/g, "");
 const reduced = useReducedMotion();
 const t = useCraftClock(paused || reduced);
 const half = (t * 2) % 1;
 // Two picks in one eight-second cycle. Open before passing, close before
 // beating. The following pick travels back through the opposite shed.
 const lift = 15 * ease(half / .16) * (1 - ease((half - .66) / .10));
 const travel = ease((half - .18) / .46);
 const shuttleX = t < .5 ? 425 + travel * 362 : 787 - travel * 362;
 const beat = 24 * ease((half - .78) / .10) * (1 - ease((half - .90) / .10));
 const crank = t * Math.PI * 16;
 const windingHand: Point = [430 + 24 * Math.cos(crank), 318 + 24 * Math.sin(crank)];
 const dip = 15 * (1 - Math.cos(t * Math.PI * 4)) / 2;
 const rightHand: Point = role === "weaving" ? [416, 310 + beat] : role === "winding" ? windingHand : [420, 274 + dip];
 return <div className={`craft-scene ${paused ? "paused" : ""}`}>
  <span className="scene-caption">{captions[role]} · Illustrated study</span>
  <svg viewBox="0 0 900 510" role="img" aria-labelledby={id + "title " + id + "desc"}>
   <title id={id + "title"}>{captions[role]}</title>
   <desc id={id + "desc"}>{role === "weaving" ? "A seated adult artisan beside a schematic loom. Anchored warp threads separate, a shuttle crosses between the layers, the shed closes, then the reed beats the weft. The artisan's hand stays on the beater." : role === "winding" ? "A seated adult artisan turns a wheel with a connected hand on its crank. A belt drives the bobbin; yarn runs from a separate hank through a fixed guide to the bobbin, away from the artisan's body." : "A standing adult artisan holds a wooden rod supporting a looped hank of yarn. The hand, rod and hank lower together into a dye bath; the front of the vessel conceals the submerged yarn."} Original explanatory illustration, not documentary footage or a complete technical demonstration.</desc>
   <defs>
    <linearGradient id={id + "wall"} x2="0" y2="1"><stop stopColor="#f1e2c5"/><stop offset="1" stopColor="#d8bf95"/></linearGradient>
    <pattern id={id + "cloth"} width="26" height="18" patternUnits="userSpaceOnUse"><rect width="26" height="18" fill="#b22222"/><path d="M0 4h26M0 7h26M7 0v18" stroke="#d5ab53" strokeWidth="2"/></pattern>
   </defs>
   <rect width="900" height="510" fill={`url(#${id}wall)`}/>
   <path d="M0 0h900v55H0z" fill="#744637"/><path d="M0 51h900" stroke="#bb864e" strokeWidth="6"/>
   <path d="M80 55v365M835 55v365" stroke="#a87b50" strokeWidth="15"/>
   <path d="M115 113q64-93 128 0v157H115Z" fill="#546f60" stroke="#bd9664" strokeWidth="12"/>
   <path d="M123 217q57-48 112-20v65H123Z" fill="#768664"/>
   <path d="M179 72v197M119 164h120" stroke="#d1b281" strokeWidth="7"/>
   <path d="M282 55L0 363v57L354 55Z" fill="#f8edca" opacity=".25"/>
   <rect y="444" width="900" height="66" fill="#bd8c67"/>
   <path d="M0 473h900" stroke="#a87556" opacity=".35"/>
   <g fill="none" stroke="#efdfc0" strokeWidth="2" opacity=".8">
    <path d="M73 472l20-20 20 20-20 20Z M63 472h60M93 442v60"/><circle cx="93" cy="472" r="13"/>
    <path d="M770 472l22-22 22 22-22 22Z"/><circle cx="792" cy="472" r="15"/>
   </g>
   <g><path d="M694 88h80v74h-80Z" fill="#a06a45"/><path d="M702 96h64v58h-64Z" fill="#e8d3a3"/><path d="M734 104l20 22-20 22-20-22Z" fill="none" stroke="#b22222" strokeWidth="3"/><circle cx="734" cy="126" r="5" fill="#ba8b39"/></g>
   <Artisan standing={role === "dyeing"}/>
   {role === "weaving" ? <g>
    <path d="M420 196v255M788 196v255M412 206h384M420 449h368" stroke="#684631" strokeWidth="14" fill="none"/>
    <path d="M435 216h338" stroke="#ba8a50" strokeWidth="12"/>
    <path d="M450 226H760V357H450Z" fill="#a8885c" opacity=".28"/>
    {/* Lower warp is behind the shuttle. Only the heddle midpoint moves;
        both beam and cloth-fell endpoints remain fixed. */}
    {Array.from({ length: 19 }, (_, i) => {
     const x = (t < .5 ? 452 : 460) + i * 16;
     const midpoint:Point=[x,294+lift];
     return <g key={i}><Segment from={[x,224]} to={midpoint} color="#b48e56"/><Segment from={midpoint} to={[x,354]} color="#b48e56"/></g>;
    })}
    <path d="M398 316h52M762 316h52" stroke="#684631" strokeWidth="7"/>
    <path d="M398 299v17M814 299v17" stroke="#684631" strokeWidth="5"/>
    <g transform={`translate(${shuttleX} 304)`}>
     <path d="M-24 0Q0-15 24 0Q0 15-24 0Z" fill="#d8a449" stroke="#78472e" strokeWidth="2"/>
     <path d="M-8 0H8" stroke="#f2e4c0" strokeWidth="5"/>
    </g>
    {Array.from({ length: 19 }, (_, i) => {
     const x = (t < .5 ? 460 : 452) + i * 16;
     const midpoint:Point=[x,294-lift];
     return <g key={i}><Segment from={[x,224]} to={midpoint} color="#f7e9c5"/><Segment from={midpoint} to={[x,354]} color="#f7e9c5"/></g>;
    })}
    <path d="M450 355h310v87H450Z" fill={`url(#${id}cloth)`}/>
    <g transform={`translate(0 ${beat})`}>
     <path d="M410 310h370" stroke="#684631" strokeWidth="10" strokeLinecap="round"/>
     <path d="M441 305h328v17H441Z" fill="#7c5135" stroke="#c6985b" strokeWidth="2"/>
     {Array.from({ length: 39 }, (_, i) => <path key={i} d={`M${450 + i * 8} 306v15`} stroke="#ead2a4" strokeWidth="1"/>)}
    </g>
    <path d="M440 359h333M440 443h333" stroke="#684631" strokeWidth="13"/>
    <path d="M419 449l-10 29M789 449l10 29" stroke="#684631" strokeWidth="11"/>
    <path d="M450 218v-47h309v47" fill="none" stroke="#684631" strokeWidth="7"/>
    <path d="M466 174v75M744 174v75" stroke="#8a6640" strokeWidth="2"/>
    <g strokeLinecap="round"><Segment from={[295,351]} to={[337,384]} color="#8f543e" width={19}/><Segment from={[337,384]} to={[365,434+lift/4]} color="#8f543e" width={19}/><Segment from={[295,351]} to={[337,384]} color="#c99066" width={13}/><Segment from={[337,384]} to={[365,434+lift/4]} color="#c99066" width={13}/></g>
    <g transform={`translate(0 ${lift/4})`}><path d="M365 434h32" stroke="#c99066" strokeWidth="13" strokeLinecap="round"/><path d="M358 444h67" stroke="#684631" strokeWidth="8"/></g>
    <Segment from={[425,444+lift/4]} to={[475,449]} color="#9b754b" width={4}/>
   </g> : role === "winding" ? <g>
    <path d="M415 335l-30 111M444 335l31 111M374 447h115M585 332v115M646 332v115M575 332h81" stroke="#775035" strokeWidth="9"/>
    <path d="M438 233L614 284M438 403L614 316" stroke="#6f5439" strokeWidth="3"/>
    <g transform={`rotate(${t * 2880} 430 318)`}>
     <circle cx="430" cy="318" r="85" fill="#d9bd8f" stroke="#7c5135" strokeWidth="8"/>
     <circle cx="430" cy="318" r="68" fill="none" stroke="#c69957" strokeWidth="3"/>
     {Array.from({ length: 12 }, (_, i) => <path key={i} d="M430 318v-81" stroke="#8f613f" strokeWidth="3" transform={`rotate(${i * 30} 430 318)`}/>)}
     <circle cx="430" cy="318" r="10" fill="#d3aa61"/>
     <path d="M430 318h24" stroke="#684631" strokeWidth="7"/><circle cx="454" cy="318" r="6" fill="#684631"/>
    </g>
    <path d="M586 300h59" stroke="#684631" strokeWidth="6"/>
    <path d="M596 286v28M634 286v28" stroke="#775035" strokeWidth="6"/>
    <rect x="599" y="289" width="32" height="22" rx="5" fill="#b22222"/>
    {Array.from({ length: 8 }, (_, i) => <path key={i} d={`M${601 + i * 4} 289v22`} stroke="#d6ab61" strokeWidth="1"/>)}
    <g transform="translate(638 300) scale(.45 1)"><g transform={`rotate(${t*16320})`}><circle r="14" fill="#d3aa61" stroke="#775035" strokeWidth="3"/><path d="M0 0V-11" stroke="#775035" strokeWidth="3"/></g></g>
    <path d="M705 182v75M686 257h38M705 257v187M684 444h42" stroke="#775035" strokeWidth="6"/>
    <ellipse cx="705" cy="212" rx="25" ry="45" fill="none" stroke="#b22222" strokeWidth="9"/>
    <ellipse cx="705" cy="212" rx="17" ry="42" fill="none" stroke="#b22222" strokeWidth="4"/>
    <path d="M703 255L650 268L615 289" stroke="#b22222" strokeWidth="2" fill="none"/>
    <path d="M650 274v52" stroke="#775035" strokeWidth="4"/><circle cx="650" cy="268" r="5" stroke="#775035" strokeWidth="3" fill="#e8d3a3"/>
    <path d="M286 354l45 40 14 47h25" fill="none" stroke="#c99066" strokeWidth="14" strokeLinecap="round"/>
   </g> : <g>
    <path d="M494 350q-18 84 31 96h125q49-12 31-96Z" fill="#98503c" stroke="#733f30" strokeWidth="5"/>
    <ellipse cx="587" cy="350" rx="94" ry="24" fill="#593947" stroke="#733f30" strokeWidth="5"/>
    <g transform={`translate(0 ${dip})`}>
     <path d="M413 272l182 29" stroke="#a57847" strokeWidth="9" strokeLinecap="round"/>
      <path d="M553 295q-14 3-13 20v60q20 30 43 0v-58q0-16-14-19" fill="none" stroke="#b22222" strokeWidth="14"/>
     <path d="M552 301v72q8 17 16 0v-71" fill="none" stroke="#cf8c63" strokeWidth="2"/>
    </g>
    {/* Vessel front occludes the submerged hank rather than drawing through it. */}
    <path d="M494 356q93 30 187 0-1 77-31 90H525q-28-8-31-90Z" fill="#98503c" stroke="#733f30" strokeWidth="5"/>
    <path d="M513 366q75 21 148 0" fill="none" stroke="#d5a06e" strokeWidth="3"/>
    <path d="M734 205v237M700 205h70M713 216v98h44v-98" fill="#365b4c" stroke="#a17a48" strokeWidth="6"/>
   </g>}
   <Arm shoulder={[237, 250]} elbow={[224, 302]} hand={[279, 326]}/>
   <Arm shoulder={[305, 249]} elbow={role === "weaving" ? [343, 290 + beat * .45] : role === "winding" ? [354, 290 + Math.sin(crank) * 10] : [351, 296 + dip * .4]} hand={rightHand}/>
   <path d="M32 396h43l-8 49H39Z" fill="#935438"/>
   <path d="M53 397v-70M53 373q-34-18-24-37 29 6 24 37M53 359q34-16 25-35-29 6-25 35" fill="#526d4b" stroke="#526d4b" strokeWidth="3"/>
   <path d="M0 502h900" stroke="#b22222" strokeWidth="16"/><path d="M0 493h900" stroke="#d4a23b" strokeWidth="3"/>
  </svg>
 </div>;
}


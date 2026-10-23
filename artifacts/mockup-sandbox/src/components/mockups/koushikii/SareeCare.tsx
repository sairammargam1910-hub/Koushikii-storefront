import { useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Shell, PageHero, base } from "./_shared";

const care = [
 {name:"Cotton",swatch:"cotton",title:"For the cottons you live in.",intro:"An everyday cotton can soften with wear. Its dye, finish and border still deserve individual attention.",rules:[
  ["Before washing","Read the piece’s own label. New, dark or contrasting colours may release dye; keep them separate. A fine cotton with zari or delicate motifs may need professional care."],
  ["If hand washing is allowed","Use cool water and a small amount of mild, pH-neutral detergent. Wash gently and briefly; do not soak, scrub or twist. Avoid bleach and colour-fixing home remedies."],
  ["Dry in the shade","Support the wet cloth, press out water gently in a clean towel and dry away from direct sunlight. Do not leave a contrasting border folded against the body while wet."],
  ["Press with attention","Use the temperature on the label. Press on the reverse, with a clean protective cloth over borders and motifs. Avoid pulling at a loose yarn or trimming it yourself."],
 ],caution:"Do not assume every cotton is washable. The most delicate yarn, dye, embellishment or border determines the care."},
 {name:"Silk",swatch:"silk",title:"A little more care for silk.",intro:"Silk, zari and contrast borders can respond differently to water and heat. Keep the label with the saree.",rules:[
  ["After wearing","Air in a shaded, clean space until completely dry. Allow perspiration to evaporate before putting it away; never store a damp saree."],
  ["When it needs cleaning","Unless the label specifically permits another method, ask a textile-experienced professional about dry cleaning. Point out zari, stains, delicate motifs and contrast colours."],
  ["Pressing the surface","Use the label’s silk setting and a clean pressing cloth, working on the reverse. Keep heat low and avoid spraying water or steam directly onto silk or metallic thread."],
  ["Between occasions","Fold loosely in clean, undyed cotton or appropriate acid-free tissue. Store in a dry, shaded cupboard; change the fold lines occasionally and avoid hanging a heavy silk for long periods."],
 ],caution:"Do not rub a spill or try lemon, salt, vinegar or perfume as a treatment. Blot gently with a clean dry cloth and seek professional advice."},
 {name:"Cotton-silk",swatch:"cotton-silk",title:"Let the silk set the pace.",intro:"A blend is not a single recipe. Fibre proportions, zari, dye and construction all influence how the cloth should be cared for.",rules:[
  ["Start with composition","Check the fibre details and care label rather than treating a cotton-silk blend as ordinary cotton. If the composition or instructions are missing, ask before washing."],
  ["Clean conservatively","Do not soak or machine wash unless the specific label allows it. For a delicate or contrasting blend, discuss suitable cleaning with a professional."],
  ["Avoid friction","Remove jewellery that could catch before folding. Never wring or brush the surface; handle woven motifs and loose yarns gently."],
  ["Store without strain","Air after wearing and fold in a breathable cover. Use a low, label-approved pressing temperature on the reverse with a protective cloth."],
 ],caution:"The fibre name alone cannot establish a safe wash method. A border or embellishment may require more cautious care than the body."},
 {name:"Wool & fine blends",swatch:"s6",title:"Soft fibres, gentle habits.",intro:"For woollen dupattas, fine wool and other delicate blends, avoid treating a catalogue name as a full fibre specification.",rules:[
  ["Know what you have","Follow the supplied composition and label. Pashmina refers to a fine cashmere fibre, not a weave or a care guarantee. Our sample catalogue is not a fibre certification."],
  ["Rest between wears","Air flat in the shade. Avoid stretching the edges or leaving a heavy piece on a hanger. Gentle handling helps reduce friction and surface pilling."],
  ["Cleaning and drying","Use a specialist if the label requires it or you are unsure. Only hand wash if expressly permitted, without temperature changes or agitation; dry flat and supported."],
  ["Put away clean and dry","Use a breathable cover in a dry cupboard. Inspect stored textiles regularly. Keep moth-control products and fragrances from direct contact with the cloth."],
 ],caution:"Do not pull at pills or use a household razor on a fine textile. Ask a specialist about suitable surface care."},
];

export function SareeCare() {
 const [selected, setSelected] = useState(0);
 const tabs = useRef<(HTMLButtonElement | null)[]>([]);
 return <Shell>
  <PageHero eyebrow="The keeping of cloth · Saree care" title="Wear it. Air it. Keep it well." subtitle="Practical habits for sarees and dupattas, from the everyday cotton to the silk brought out for a special day."/>
  <main className="wrap content">
   <section className="guide-intro"><div><span className="eyebrow">Care begins with knowing the cloth</span><h2>One cupboard.<br/>Many kinds of care.</h2><p className="muted">A Kanchipuram silk and a Chettinad cotton do not ask for the same treatment. Neither does every piece within a tradition. Start with the fibre, the colour, the border — and, above all, the instructions supplied with your saree.</p></div><aside className="guide-note"><span className="eyebrow">The label comes first</span><h3>A guide, not a prescription.</h3><p>These are general care notes, not product-specific instructions. Follow your piece’s care label. If it is missing, ask the seller or a textile specialist before cleaning.</p><a href={base+"Contact"} className="link">Ask about a piece <ArrowRight size={12}/></a></aside></section>
   <div className="care-tabs" role="tablist" aria-label="Care by fabric">{care.map((tab,i)=><button key={tab.name} ref={el=>{tabs.current[i]=el}} id={"care-tab-"+i} role="tab" aria-selected={selected===i} aria-controls={"care-panel-"+i} tabIndex={selected===i?0:-1} onClick={()=>setSelected(i)} onKeyDown={e=>{
    let next=i;
    if(e.key==="ArrowRight")next=(i+1)%care.length;
    else if(e.key==="ArrowLeft")next=(i+care.length-1)%care.length;
    else if(e.key==="Home")next=0;
    else if(e.key==="End")next=care.length-1;
    else return;
    e.preventDefault();setSelected(next);tabs.current[next]?.focus();
   }}>{tab.name}</button>)}</div>
   {care.map((item,index)=><section key={item.name} hidden={selected!==index} className="care-panel" role="tabpanel" id={"care-panel-"+index} aria-labelledby={"care-tab-"+index} tabIndex={0}>
    <div className="care-panel-heading"><span className={"textile care-swatch "+item.swatch} aria-hidden="true"/><div><h2>{item.title}</h2><p className="muted">{item.intro}</p></div></div>
    <div className="care-rules">{item.rules.map(([title,copy],i)=><article className="care-rule" key={title}><span className="eyebrow">0{i+1} / {item.name}</span><h3 style={{marginTop:8}}>{title}</h3><p>{copy}</p></article>)}</div>
    <div className="guide-warning"><strong>A note of caution.</strong> {item.caution}</div>
   </section>)}
   <section><span className="eyebrow">From wearing to putting away</span><h2>A small after-wear ritual.</h2><ol className="care-routine">
    <li><h3>Give it air</h3><p>Unfold after wearing. Let the cloth rest in the shade, away from kitchen fumes, damp and direct sunlight.</p></li>
    <li><h3>Look before you fold</h3><p>Check the hem and pallu for marks or snagged threads. Blot a fresh spill without rubbing; do not wait to ask for advice on a stain.</p></li>
    <li><h3>Ease the folds</h3><p>Fold gently along the length without forcing a sharp crease through a heavy border. Change fold positions from time to time.</p></li>
    <li><h3>Make a little room</h3><p>Use a clean, breathable cover. Avoid overcrowding, plastic sealed around damp cloth, and jewellery or pins stored inside the folds.</p></li>
   </ol></section>
   <section className="related-guide"><div><span className="eyebrow">Know the weave, too</span><h3>Read the border. Follow the thread.</h3><p>Understand the difference between a fibre, a technique and a regional textile tradition.</p></div><a className="btn gold" href={base+"WeaveGuide"}>Explore the weave guide <ArrowRight size={14}/></a></section>
  </main>
 </Shell>;
}

import { useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Shell, PageHero, base } from "./_shared";

const care = [
 {name:"Cotton",swatch:"cotton",title:"For the cottons you live in.",intro:"Everyday cotton softens with wear, but its dye, finish and border still need care.",rules:[
  ["Before washing","Check your saree’s care label first. Dark or contrasting colours may bleed, so wash them separately. A fine cotton with zari or delicate motifs may need dry cleaning."],
  ["If hand-washing is allowed","Use cool water and a small amount of mild detergent. Wash gently and briefly; do not soak, scrub or twist. Avoid bleach and home remedies like salt or vinegar."],
  ["Dry in the shade","Dry in the shade, away from direct sunlight. Do not leave a contrasting border folded against the main fabric while wet."],
  ["Iron with care","Iron on the reverse with a clean cloth over borders and motifs. Don’t pull or trim loose threads. Ask us instead."],
 ],caution:"Not every cotton saree is washable. If it has zari, embroidery or a contrasting border, care for it more gently."},
 {name:"Silk",swatch:"silk",title:"A little more care for silk.",intro:"Silk, zari and contrasting borders can react to water and heat. Always keep the care label with your saree.",rules:[
  ["After wearing","Air it in a clean, shady place until it is completely dry. Never put away a damp saree."],
  ["When it needs cleaning","Dry clean only, unless the label says otherwise. Tell your dry cleaner about any zari, stains or contrasting colours."],
  ["Ironing","Iron on the reverse on low heat, with a clean cotton cloth on top. Do not spray water or steam directly onto silk or zari."],
  ["Storing","Fold loosely and wrap in a soft cotton cloth or muslin. Store in a dry, shady cupboard. Refold it every few months, and don’t keep heavy silks on a hanger for long."],
 ],caution:"If you spill something, don’t rub it or use home remedies like lemon, salt or vinegar. Gently blot with a clean, dry cloth and take it to a dry cleaner."},
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
    <section className="guide-intro"><div><span className="eyebrow">Care begins with knowing the fabric</span><h2>One wardrobe.<br/>Many kinds of care.</h2><p className="muted">A Kanchipuram silk and a Chettinad cotton don’t need the same care. Even pieces from the same tradition can differ. Check the fibre, colour and border, and above all, follow the care label on your saree.</p></div><aside className="guide-note"><span className="eyebrow">The label comes first</span><h3>A guide, not a rulebook.</h3><p>These are general care tips, not instructions for a specific product. Always follow your saree’s care label. If it’s missing, ask us before cleaning.</p><a href={base+"Contact"} className="link guide-contact-link">Ask us about your saree <ArrowRight size={12} aria-hidden="true"/></a></aside></section>
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
   <section className="related-guide"><div><span className="eyebrow">Find your next thread</span><h3>Read the border. Explore the cloth.</h3><p>Browse the sample collection by fibre, regional tradition or the way you wear it. Always check the care instructions for the individual piece.</p></div><a className="btn gold" href={base+"Collections"}>Explore the collections <ArrowRight size={14}/></a></section>
  </main>
 </Shell>;
}

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
 {name:"Cotton-silk",swatch:"cotton-silk",title:"Care for cotton-silk as you would silk.",intro:"Cotton-silk may look like cotton, but it needs the same gentle care as silk. Always keep the care label with your saree.",rules:[
  ["After wearing","Air it in a clean, shady place until it is completely dry. Never put away a damp saree."],
  ["When it needs cleaning","Dry clean only, unless the label says otherwise. Do not soak or machine wash. Tell your dry cleaner about any zari, stains or contrasting colours."],
  ["Ironing","Iron on the reverse on low heat, with a clean cotton cloth on top. Do not spray water or steam directly onto the saree or zari."],
  ["Storing","Fold loosely and store in a dry, shady cupboard."],
 ],caution:"If you spill something, don’t rub it or use home remedies like lemon, salt or vinegar. Gently blot with a clean, dry cloth and take it to a dry cleaner."},
 {name:"Wool & other blends",swatch:"s6",title:"Soft fibres, gentle care.",intro:"Wool and blended fabrics are delicate. Always check the care label first.",rules:[
  ["After wearing","Air it flat in the shade. Don’t leave heavy pieces on a hanger."],
  ["When it needs cleaning","Dry clean only, unless the label says otherwise. Do not soak, rub or wring."],
  ["Drying","Dry in the shade, away from direct sunlight."],
  ["Storing","Store clean and fully dry. Keep moth repellents away from the fabric."],
 ],caution:"Small fuzz balls are normal with wool. Don’t pull them or use a razor."},
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

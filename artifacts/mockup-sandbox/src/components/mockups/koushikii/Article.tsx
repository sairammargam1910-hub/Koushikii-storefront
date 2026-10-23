import { ArrowLeft, ArrowRight } from "lucide-react";
import { Shell, PageHero, base } from "./_shared";

const articles = [
 {title:"The quiet geometry of Ikat",eyebrow:"Technique notes · Yarn-resist patterning",swatch:"s3",lead:"In an ikat textile, the pattern has already begun before the loom is dressed. Sections of yarn are bound to resist dye; weaving brings those prepared colours into relationship.",sections:[
  ["A pattern before there is cloth","The maker plans which lengths of yarn will take colour and which will resist it. Tying, dyeing and, for some patterns, repeating those stages creates a sequence along the yarn. Once the ties are removed, those sequences must be arranged for weaving."],
  ["One direction, or two","Warp ikat patterns the lengthwise yarns. Weft ikat patterns the yarn carried across them. Double ikat patterns both sets, demanding careful alignment in two directions. These terms describe a process, not a single regional style."],
  ["Many places, distinct languages","Pochampally in Telangana, the bandha traditions of Odisha and Patan’s double-ikat Patola in Gujarat offer different ways of working with resist-dyed yarn. They should not be reduced to one shared set of motifs, fibres or colours."],
  ["What the edge can tell you","A softly feathered edge can arise where the dyed sections meet, but it is not an authenticity test. Printed imitations can suggest the same visual effect. Ask how the textile was made, which yarn system carries the pattern and what is known about its origin."],
 ],note:"The pattern beside this article is an editorial illustration, not a photograph of an authenticated ikat textile.",link:"WeaveGuide",cta:"A regional weave companion"},
 {title:"A Jamdani motif, one pick at a time",eyebrow:"Technique notes · Supplementary weft",swatch:"s2",lead:"A Jamdani motif is made as the cloth is woven. Decorative yarn is introduced into selected areas of the ground, building a shape through successive passes rather than printing it onto a finished surface.",sections:[
  ["The ground and the motif","The ground cloth has its own warp and weft. Additional weft yarn forms the decorative motif, worked where the design calls for it. That distinction helps explain the relationship between an airy ground and a motif that seems to sit within it."],
  ["A tradition with a geography","Jamdani is closely associated with the Bengal region, including Bangladesh and West Bengal. Related supplementary-weft practices exist elsewhere, and the term is used in different contexts. A product’s place of weaving and technique should be described specifically."],
  ["Not every surface tells the whole story","Motif density, fibre and ground structure all affect how a textile feels and falls. A close view of the front and reverse is useful, but a photograph alone cannot establish provenance or production method."],
  ["Choosing with a little more attention","Ask what fibres make up the ground and motifs, where the piece was woven, and whether the seller can explain the construction. When wearing it, give woven motifs room around jewellery and fastenings that could snag."],
 ],note:"This is an introductory technique note, not a report from a Chenetha workshop or an attribution to a named maker.",link:"WeaveGuide",cta:"Read more about regional cloth"},
 {title:"What a textile asks of us",eyebrow:"Wardrobe notes · Wearing and keeping",swatch:"s6",lead:"A saree can belong to a wedding morning, a day at work or a visit home. What makes it personal is not only its age or price, but the life it is allowed to have.",sections:[
  ["Beyond the special-occasion shelf","Not every handloom needs to be treated as an untouchable heirloom. Some cottons belong in everyday rotation; a treasured silk may come out less often. Choose around the days you actually live, and the care you can reasonably give."],
  ["Keep the knowledge with the cloth","When you bring a piece home, keep its fibre information, cleaning instructions and any reliable maker or origin details together. If it is gifted or passed on, those small records can be as useful as the wrapping."],
  ["A repair is not a lesser life","A loosened edge or damaged fall may be repairable. Ask a tailor or textile specialist before cutting a thread, applying an adhesive or trying a home remedy. A careful intervention can preserve more than an improvised quick fix."],
  ["Passing it on without a script","An inherited saree does not need an invented grand history. Record what is actually known: who wore it, where it was bought, how it was kept. Leave space for the next person to wear it differently."],
 ],note:"Cleaning depends on the specific textile. Our fabric-by-fabric care guide is a starting point; the supplied label takes precedence.",link:"SareeCare",cta:"Find care notes for your fabric"},
];

export function Article() {
 const raw = Number(new URLSearchParams(window.location.search).get("id") || 0);
 const index = Number.isInteger(raw) && raw >= 0 && raw < articles.length ? raw : 0;
 const article = articles[index];
 return <Shell>
  <PageHero eyebrow={article.eyebrow} title={article.title} subtitle="Chenetha Journal · An introduction to the cloth, not a substitute for a maker’s own account."/>
  <div className="wrap"><span className={"textile article-motif "+article.swatch} role="img" aria-label="Editorial textile-pattern illustration, not product photography"/></div>
  <article className="article-body content">
   <a href={base+"Journal"} className="link"><ArrowLeft size={12}/> Back to the journal</a>
   <p className="article-lead">{article.lead}</p>
   {article.sections.map(([heading,copy])=><section key={heading}><h2>{heading}</h2><p>{copy}</p></section>)}
   <aside className="guide-note"><span className="eyebrow">An editorial note</span><p>{article.note}</p><a className="link" href={base+article.link}>{article.cta} <ArrowRight size={12}/></a></aside>
   <a href={base+"Article?id="+((index+1)%articles.length)} className="link">Next: {articles[(index+1)%articles.length].title} <ArrowRight size={12}/></a>
  </article>
 </Shell>;
}

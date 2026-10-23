import { ArrowRight } from "lucide-react";
import { Shell, PageHero, base } from "./_shared";

const stories = [
 {title:"The quiet geometry of Ikat",copy:"Before the loom, there is the yarn. How resist-dyed threads become a pattern, and why ikat is a process rather than a single look.",meta:"01 / Technique · Ikat",swatch:"s3"},
 {title:"A Jamdani motif, one pick at a time",copy:"The relationship between a woven ground and the extra weft that gives a motif its form.",meta:"02 / Technique · Jamdani",swatch:"s2"},
 {title:"What a textile asks of us",copy:"On wearing, keeping, repairing and passing on cloth — without inventing a history for it.",meta:"03 / Wardrobe · Keeping cloth",swatch:"s6"},
];

export function Journal() {
 return <Shell>
  <PageHero eyebrow="The Chenetha journal" title="Read the cloth a little closer." subtitle="Introductions to process, regional vocabulary and the everyday life of sarees. Maker stories will be added when verified and shared with permission."/>
  <main className="wrap content">
   <section className="journal-stories" aria-label="Journal articles">{stories.map((story,i)=><article className="journal-story" key={story.title}>
    <a href={base+"Article?id="+i} aria-label={"Read "+story.title}><span className={"textile "+story.swatch} role="img" aria-label="Illustrative editorial pattern"/></a>
    <span className="eyebrow">{story.meta}</span><a href={base+"Article?id="+i}><h3>{story.title}</h3></a><p>{story.copy}</p><a className="link" href={base+"Article?id="+i}>Read the story <ArrowRight size={12}/></a>
   </article>)}</section>
   <section className="related-guide" style={{marginTop:46}}><div><span className="eyebrow">Keep a companion close</span><h3>A few words to begin with.</h3><p>Warp, weft, zari, pallu. Learn the vocabulary and the questions worth asking before choosing a piece.</p></div><a className="btn gold" href={base+"WeaveGuide"}>Open the weave guide <ArrowRight size={14}/></a></section>
  </main>
 </Shell>;
}

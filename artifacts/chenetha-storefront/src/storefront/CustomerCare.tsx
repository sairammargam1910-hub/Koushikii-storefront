import { ArrowRight } from "lucide-react";
import { Shell, PageHero, base } from "./_shared";

type FaqAnswer = string | { intro: string; bullets: string[]; closing: string };
type FaqItem = [question: string, answer: FaqAnswer];

const buildFaqs = (): { group: string; questions: FaqItem[] }[] => [
 {group:"Choosing a saree",questions:[
  ["How can I check the colour and quality before buying?","All our photos show the actual saree, not a sample. Colours may still look slightly different depending on your screen and lighting. To see the fabric, texture and drape more closely, watch the saree on our video page, or request a live video call before you buy."],
  ["Does every saree include a blouse piece?","Not always. Each product page shows whether a blouse piece is included, along with the saree’s length and width."],
   ["DO YOU OFFER BLOUSE STITCHING?","Yes, we can customise your blouse to your requirements. Message us on WhatsApp at 7981614119 to get started."],
  ["ARE SMALL IRREGULARITIES IN A HANDWOVEN SAREE NORMAL?","Yes. Handwoven sarees are made by people, not machines. Small variations such as an extra thread, slight unevenness, or texture that looks different when you hold the saree up to the light are signs of the weaver’s hand. They are part of what makes each piece one of a kind.\n\nThese are different from defects such as holes, cuts or tears. If your saree arrives with any of these, please contact us."],
 ]},
 {group:"Orders & delivery",questions:[
   ["WHERE DO YOU DELIVER, AND HOW MUCH DOES IT COST?","We deliver across India and internationally. Shipping charges depend on the courier service and your location: within the same city, elsewhere in India, or abroad.\n\nOnce your order ships, we’ll send a tracking link to your registered email or WhatsApp number. To make sure you receive updates, please create an account with your full details.\n\nFor smooth, hassle-free delivery, always enter your complete address and the correct PIN code."],
   ["HOW DO I TRACK MY ORDER?","Create an account first. It’s the easiest way to keep track of your orders.\n\nOnce you’ve signed in, go to Your Orders to see order and delivery updates. Use the same email address at checkout as the one on your account. Otherwise your order won’t show up.\n\nYou’ll also get a tracking link by email or WhatsApp once your order ships."],
 ]},
  {group:"Returns & Support",questions:[
     ["CAN I RETURN OR EXCHANGE A SAREE?","We do not accept returns or exchanges at the moment. Every saree is quality-checked before packing. Please review the product details, including the fabric, length, blouse piece and colour, before placing your order. If you’d like to confirm any details before buying, message us on WhatsApp at 7981614119."],
    ["WILL THE COLOUR LOOK EXACTLY LIKE THE PHOTO?","The saree’s colour may look slightly different from the photos due to lighting and screen settings. Slight colour variations from these factors are expected. If you’re unsure about the colour, you can watch our saree videos on Instagram or request a video call before buying."],
   ["WHAT IF MY SAREE ARRIVES DAMAGED?",{
     intro:"We thoroughly quality-check every saree before shipping. If your saree arrives damaged or you notice a defect, please submit your claim on WhatsApp at 7981614119 within 4 days of delivery.",
     bullets:[
      "Record a continuous unboxing video from the moment you begin opening the sealed parcel until you’ve fully inspected the saree.",
      "Send the full, unedited video to our WhatsApp number within 4 days of delivery. We require the video to review your claim.",
      "Keep the saree in its original condition and folds, free of stitch marks and dust."
     ],
     closing:"We’ll review the video and check the saree’s original condition and folds before getting in touch about any applicable remedy."
    }],
    ["HOW DO I CONTACT KOUSHIKII?","Message us on WhatsApp at 7981614119 or use the Contact page. We’re happy to help with questions about a saree, an order or a delivery."],
 ]},
];

export function CustomerCare() {
  const faqs = buildFaqs();
 return <Shell>
  <PageHero eyebrow="Customer care" title="Everything you need to know." subtitle="Answers on fabrics, orders, shipping and returns. Looking for washing and storage tips? See our Care Guide."/>
  <main className="wrap content">
    <div className="care-support-layout"><section>{faqs.map(group=><section key={group.group}><h2>{group.group}</h2>{group.questions.map(([question,answer])=><details key={question}><summary>{question}</summary>{typeof answer==="string"?answer.split("\n\n").map((paragraph,index)=><p key={index}>{paragraph}</p>):<><p>{answer.intro}</p><ul>{answer.bullets.map((bullet,index)=><li key={index}>{bullet}</li>)}</ul><p>{answer.closing}</p></>}</details>)}</section>)}</section>
     <aside><div className="guide-note"><span className="eyebrow">Find the right place</span><h3>A little direction.</h3><nav className="support-links" aria-label="Customer support resources">{[["Orders","Order information"],["SareeCare","Saree care by fabric"],["Collections","Explore fabrics & weaves"],["Contact","Contact the brand"]].map(([path,label])=><a key={path} href={base+path}>{label}<ArrowRight size={14}/></a>)}</nav></div>
     <div className="guide-note" style={{marginTop:24}}><span className="eyebrow">Purchase terms</span><h3>Ask before proceeding.</h3><ol className="support-process"><li>Confirm availability and final pricing for the exact product.</li><li>Confirm delivery terms, timing and any applicable charges.</li><li>Ask the brand about cancellation, returns or exchange policies.</li><li>Follow only instructions confirmed directly by the brand.</li></ol></div></aside>
   </div>
   <section className="related-guide" style={{marginTop:48}}><div><span className="eyebrow">Already have a favourite?</span><h3>Give it the care it asks for.</h3><p>Fabric-by-fabric notes for cleaning, airing, folding and storing your sarees and dupattas.</p></div><a href={base+"SareeCare"} className="btn gold">Open saree care <ArrowRight size={14}/></a></section>
  </main>
 </Shell>;
}

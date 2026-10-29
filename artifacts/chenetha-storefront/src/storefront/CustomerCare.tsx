import { ArrowRight } from "lucide-react";
import { Shell, PageHero, base } from "./_shared";

const faqs = [
 {group:"Choosing a textile",questions:[
  ["How can I understand the colour and texture?","Screens and lighting affect colour. In a live store, ask for a daylight view, reverse-side detail and a clear description of weight and texture before choosing. The current catalogue uses illustrative swatches, not product photography."],
  ["Does every saree include a blouse piece?","Do not assume so. Check the full length, width and blouse-piece details for the specific product. Length options in this preview are illustrative and are not a confirmed tailoring service."],
  ["Does a variation prove a piece is handwoven?","No. Small variations can arise in handmade cloth, but are not proof of handloom production, fibre purity or origin. Those claims need reliable product information and, where relevant, supporting evidence."],
 ]},
 {group:"Orders & delivery",questions:[
   ["How do I ask about a catalogue piece?","Use the WhatsApp enquiry review from your bag. The message is only a draft until you choose to send it. The brand must confirm the piece’s availability and final pricing directly."],
  ["Where do you deliver, and how much does it cost?","Delivery locations, dispatch windows and shipping charges are not set in this preview. A PIN-code check validates format only. Before making a real purchase, confirm the merchant’s delivery availability, charges and timing."],
    ["How do I track an order?","For a Shopify purchase, sign in to your Shopify customer account to see order and delivery updates. If no update appears yet, check the email you used at checkout, including its spam folder. This storefront does not confirm an order."],
 ]},
 {group:"Returns & support",questions:[
  ["Can I return or exchange a saree?","This preview does not establish return or exchange eligibility, deadlines, exclusions, cancellation terms or refund timing. Before a real purchase, read the merchant’s published terms for the specific product. Do not send a textile anywhere on the basis of this preview."],
   ["What should I confirm before proceeding?","Confirm the exact product, availability, final price, any taxes and shipping charges, delivery details, cancellation terms and return or exchange conditions directly with the brand. The displayed catalogue prices are samples."],
  ["What should I do if a delivery is damaged or incorrect?","For a live purchase, keep the packaging and take clear photographs of the outer parcel, label and item. Contact the seller with the order number and description before washing, altering or returning the piece. Confirmed support details will be added before launch."],
    ["How do I contact the brand?","The Contact page prepares a message for the supplied Chenetha by Koushikii WhatsApp number. Review and send it in WhatsApp; this website does not claim to receive or process the message."],
 ]},
];

export function CustomerCare() {
 return <Shell>
  <PageHero eyebrow="Customer care" title="A clear answer, before you choose." subtitle="Questions about cloth, orders and what happens next. Care instructions now have their own dedicated guide."/>
  <main className="wrap content">
    <div className="guide-warning" style={{marginTop:0,marginBottom:36}}><strong>Catalogue information.</strong> Displayed prices and textile swatches are samples. Availability, final pricing, delivery terms and purchase policies must be confirmed by the brand before proceeding.</div>
   <div className="care-support-layout"><section>{faqs.map(group=><section key={group.group}><h2>{group.group}</h2>{group.questions.map(([question,answer])=><details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</section>)}</section>
     <aside><div className="guide-note"><span className="eyebrow">Find the right place</span><h3>A little direction.</h3><nav className="support-links" aria-label="Customer support resources">{[["Orders","Order information"],["SareeCare","Saree care by fabric"],["Collections","Explore fabrics & weaves"],["Contact","Contact the brand"]].map(([path,label])=><a key={path} href={base+path}>{label}<ArrowRight size={14}/></a>)}</nav></div>
     <div className="guide-note" style={{marginTop:24}}><span className="eyebrow">Purchase terms</span><h3>Ask before proceeding.</h3><ol className="support-process"><li>Confirm availability and final pricing for the exact product.</li><li>Confirm delivery terms, timing and any applicable charges.</li><li>Ask the brand about cancellation, returns or exchange policies.</li><li>Follow only instructions confirmed directly by the brand.</li></ol></div></aside>
   </div>
   <section className="related-guide" style={{marginTop:48}}><div><span className="eyebrow">Already have a favourite?</span><h3>Give it the care it asks for.</h3><p>Fabric-by-fabric notes for cleaning, airing, folding and storing your sarees and dupattas.</p></div><a href={base+"SareeCare"} className="btn gold">Open saree care <ArrowRight size={14}/></a></section>
  </main>
 </Shell>;
}

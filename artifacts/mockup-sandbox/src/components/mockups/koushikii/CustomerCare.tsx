import { ArrowRight } from "lucide-react";
import { Shell, PageHero, base } from "./_shared";

const faqs = [
 {group:"Choosing a textile",questions:[
  ["How can I understand the colour and texture?","Screens and lighting affect colour. In a live store, ask for a daylight view, reverse-side detail and a clear description of weight and texture before choosing. The current catalogue uses illustrative swatches, not product photography."],
  ["Does every saree include a blouse piece?","Do not assume so. Check the full length, width and blouse-piece details for the specific product. Length options in this preview are illustrative and are not a confirmed tailoring service."],
  ["Does a variation prove a piece is handwoven?","No. Small variations can arise in handmade cloth, but are not proof of handloom production, fibre purity or origin. Those claims need reliable product information and, where relevant, supporting evidence."],
 ]},
 {group:"Orders & delivery",questions:[
  ["Can I buy without creating an account?","The prototype includes a guest checkout. It records a demonstration order in this browser only. No payment is processed, no order is sent to the brand and no shipment is created."],
  ["Where do you deliver, and how much does it cost?","Serviceable locations, dispatch windows and shipping charges await merchant approval. PIN-code results and delivery times shown in this preview are examples, not live delivery promises."],
  ["How do I track an order?","Use Track an order for the sample tracking flow, or Orders for this browser’s demo order history. The tracker shows an illustrative timeline; it does not validate a real purchase or connect to a carrier."],
 ]},
 {group:"Returns & support",questions:[
  ["Can I return or exchange a saree?","Eligibility, deadlines, exclusions and refund timing have not been approved. Read the draft policies for the outstanding details. Do not send a textile anywhere on the basis of this preview."],
  ["What should I do if a delivery is damaged or incorrect?","For a live purchase, keep the packaging and take clear photographs of the outer parcel, label and item. Contact the seller with the order number and description before washing, altering or returning the piece. Confirmed support details will be added before launch."],
  ["How do I contact the brand?","The Contact page demonstrates an enquiry form. It validates in the browser only and sends no message. The brand’s verified support address and hours are still to be supplied."],
 ]},
];

export function CustomerCare() {
 return <Shell>
  <PageHero eyebrow="Customer care" title="A clear answer, before you choose." subtitle="Questions about cloth, orders and what happens next. Care instructions now have their own dedicated guide."/>
  <main className="wrap content">
   <div className="guide-warning" style={{marginTop:0,marginBottom:36}}><strong>You are viewing a design preview.</strong> The store is not taking live orders. Payment, shipping, enquiries and return requests are demonstrations; policies remain draft.</div>
   <div className="care-support-layout"><section>{faqs.map(group=><section key={group.group}><h2>{group.group}</h2>{group.questions.map(([question,answer])=><details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</section>)}</section>
    <aside><div className="guide-note"><span className="eyebrow">Find the right place</span><h3>A little direction.</h3><nav className="support-links" aria-label="Customer support resources">{[["TrackOrder","Track an order"],["Orders","Demo order history"],["SareeCare","Saree care by fabric"],["WeaveGuide","Understand a weave"],["Policies","Draft shipping & returns"],["Contact","Contact preview"]].map(([path,label])=><a key={path} href={base+path}>{label}<ArrowRight size={14}/></a>)}</nav></div>
    <div className="guide-note" style={{marginTop:24}}><span className="eyebrow">A return, step by step</span><h3>Ask before sending.</h3><ol className="support-process"><li>Check the merchant’s approved policy when it is published. This draft does not establish eligibility.</li><li>Have your order number, item details and photographs ready.</li><li>Contact confirmed support and wait for instructions. The demo request in Orders is not a live submission.</li><li>Only use a return address and method supplied by the merchant; keep proof of dispatch.</li></ol></div></aside>
   </div>
   <section className="related-guide" style={{marginTop:48}}><div><span className="eyebrow">Already have a favourite?</span><h3>Give it the care it asks for.</h3><p>Fabric-by-fabric notes for cleaning, airing, folding and storing your sarees and dupattas.</p></div><a href={base+"SareeCare"} className="btn gold">Open saree care <ArrowRight size={14}/></a></section>
  </main>
 </Shell>;
}

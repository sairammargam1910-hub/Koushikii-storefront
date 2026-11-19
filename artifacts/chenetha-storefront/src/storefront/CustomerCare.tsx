import { ArrowRight } from "lucide-react";
import { Shell, PageHero, base } from "./_shared";

const faqs = [
 {group:"Choosing a saree",questions:[
  ["How can I check the colour and quality before buying?","All our photos show the actual saree, not a sample. Colours may still look slightly different depending on your screen and lighting. To see the fabric, texture and drape more closely, watch the saree on our video page, or request a live video call before you buy."],
  ["Does every saree include a blouse piece?","Not always. Each product page shows whether a blouse piece is included, along with the saree’s length and width."],
  ["ARE SMALL IRREGULARITIES IN A HANDWOVEN SAREE NORMAL?","Yes. Handwoven sarees are made by people, not machines. Small variations such as an extra thread, slight unevenness, or texture that looks different when you hold the saree up to the light are signs of the weaver’s hand. They are part of what makes each piece one of a kind.\n\nThese are different from defects such as holes, cuts or tears. If your saree arrives with any of these, please contact us."],
 ]},
 {group:"Orders & delivery",questions:[
   ["How do I ask about a catalogue piece?","Use the WhatsApp enquiry review from your bag. The message is only a draft until you choose to send it. The brand must confirm the piece’s availability and final pricing directly."],
  ["Where do you deliver, and how much does it cost?","Delivery locations, dispatch windows and shipping charges are not set in this preview. A PIN-code check validates format only. Before making a real purchase, confirm the merchant’s delivery availability, charges and timing."],
   ["How do I track an order?","Sign in to your Chenetha account and open Your orders to see order and delivery updates. Orders appear when the email used at checkout matches a verified email on your account. If an update has not appeared yet, try refreshing the order page."],
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
  <PageHero eyebrow="Customer care" title="Everything you need to know." subtitle="Answers on fabrics, orders, shipping and returns. Looking for washing and storage tips? See our Care Guide."/>
  <main className="wrap content">
   <div className="care-support-layout"><section>{faqs.map(group=><section key={group.group}><h2>{group.group}</h2>{group.questions.map(([question,answer])=><details key={question}><summary>{question}</summary>{answer.split("\n\n").map((paragraph,index)=><p key={index}>{paragraph}</p>)}</details>)}</section>)}</section>
     <aside><div className="guide-note"><span className="eyebrow">Find the right place</span><h3>A little direction.</h3><nav className="support-links" aria-label="Customer support resources">{[["Orders","Order information"],["SareeCare","Saree care by fabric"],["Collections","Explore fabrics & weaves"],["Contact","Contact the brand"]].map(([path,label])=><a key={path} href={base+path}>{label}<ArrowRight size={14}/></a>)}</nav></div>
     <div className="guide-note" style={{marginTop:24}}><span className="eyebrow">Purchase terms</span><h3>Ask before proceeding.</h3><ol className="support-process"><li>Confirm availability and final pricing for the exact product.</li><li>Confirm delivery terms, timing and any applicable charges.</li><li>Ask the brand about cancellation, returns or exchange policies.</li><li>Follow only instructions confirmed directly by the brand.</li></ol></div></aside>
   </div>
   <section className="related-guide" style={{marginTop:48}}><div><span className="eyebrow">Already have a favourite?</span><h3>Give it the care it asks for.</h3><p>Fabric-by-fabric notes for cleaning, airing, folding and storing your sarees and dupattas.</p></div><a href={base+"SareeCare"} className="btn gold">Open saree care <ArrowRight size={14}/></a></section>
  </main>
 </Shell>;
}

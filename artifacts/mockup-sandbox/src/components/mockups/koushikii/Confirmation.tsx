import { ArrowRight, Check, CircleHelp, PackageCheck, ShoppingBag } from "lucide-react";
import { Shell, PageHero, base, products, format } from "./_shared";

type DemoOrder = {
  number: string;
  status?: string;
  date?: string;
  total: number;
  items: { id: string; qty: number }[];
};

const exampleItems = [{ id: "nila", qty: 1 }];

export function Confirmation() {
  let order: DemoOrder | null = null;
  try {
    order = JSON.parse(localStorage.getItem("kq-last-order") || "null");
  } catch {
    order = null;
  }

  const items = order?.items?.length ? order.items : exampleItems;
  const total = order?.total ?? 12800;
  const orderNumber = order?.number ?? "DEMO-240816";

  return (
    <Shell>
      <PageHero
        eyebrow="A note from the loom"
        title={order ? "Your demo order is recorded." : "A confirmation to explore."}
        subtitle="A considered order experience for the handloom pieces you choose. This storefront preview does not take payment or arrange delivery."
      />
      <main className="wrap content confirmation-page">
        <section className="confirmation-welcome" aria-labelledby="confirmation-title">
          <div className="confirmation-seal" aria-hidden="true">
            <span><Check size={28} strokeWidth={2.2} /></span>
          </div>
          <div>
            <span className="eyebrow">{order ? "Demo order recorded locally" : "Illustrative order summary"}</span>
            <h2 id="confirmation-title">{order ? "Thank you for choosing handloom." : "Your order, beautifully acknowledged."}</h2>
            <p>
              {order
                ? "Your sample order is saved in this browser. The details below show how a completed order could be presented."
                : "No demo order has been created in this browser. The details below are an example of the confirmation experience."}
            </p>
          </div>
          <div className="confirmation-reference">
            <span>Order reference</span>
            <strong>{orderNumber}</strong>
            <small>{order?.date ? `Placed ${order.date} · demo` : "Sample reference · demo only"}</small>
          </div>
        </section>

        <div className="confirmation-layout">
          <section className="confirmation-items panel" aria-labelledby="confirmation-items-title">
            <div className="confirmation-section-heading">
              <div>
                <span className="eyebrow">Chosen with care</span>
                <h3 id="confirmation-items-title">The pieces in your order</h3>
              </div>
              <span className="confirmation-count">{items.reduce((sum, item) => sum + item.qty, 0)} piece{items.reduce((sum, item) => sum + item.qty, 0) === 1 ? "" : "s"}</span>
            </div>

            <div className="confirmation-product-list">
              {items.map((item, index) => {
                const product = products.find((entry) => entry.id === item.id);
                const lineTotal = (product?.price ?? 0) * item.qty;
                return (
                  <article className="confirmation-product" key={`${item.id}-${index}`}>
                    <div className={`textile s${(index % 6) + 1}`} aria-hidden="true" />
                    <div className="confirmation-product-copy">
                      <span className="eyebrow">{product?.weave ?? "Handloom selection"}</span>
                      <h4>{product?.name ?? "Sample textile"}</h4>
                      <p>{product?.type ?? "Illustrative product"} · Qty {item.qty}</p>
                    </div>
                    <strong>{format(lineTotal)}</strong>
                  </article>
                );
              })}
            </div>

            <div className="confirmation-total">
              <span>Sample item subtotal</span>
              <strong>{format(total)}</strong>
            </div>
            <p className="confirmation-tax-note">Shipping and taxes are not calculated in this preview. No amount is payable.</p>
          </section>

          <aside className="confirmation-side">
            <section className="confirmation-status panel" aria-labelledby="confirmation-status-title">
              <div className="confirmation-section-heading">
                <div>
                  <span className="eyebrow">Order journey</span>
                  <h3 id="confirmation-status-title">What happens next</h3>
                </div>
                <PackageCheck size={23} aria-hidden="true" />
              </div>
              <ol className="confirmation-timeline">
                <li className="complete">
                  <span className="confirmation-timeline-mark"><Check size={13} /></span>
                  <div><strong>Order recorded</strong><small>Shown here as a local demo state</small></div>
                </li>
                <li>
                  <span className="confirmation-timeline-mark">02</span>
                  <div><strong>Preparation & dispatch</strong><small>Would be confirmed by the store</small></div>
                </li>
                <li>
                  <span className="confirmation-timeline-mark">03</span>
                  <div><strong>Delivery updates</strong><small>Shared when a carrier is connected</small></div>
                </li>
              </ol>
              <p className="confirmation-demo-note">Illustrative steps only. No order was sent to a store, payment provider or delivery service.</p>
            </section>

            <section className="confirmation-help">
              <CircleHelp size={19} aria-hidden="true" />
              <div>
                <h3>Need a little help?</h3>
                <p>Find answers about ordering, delivery details and caring for your saree.</p>
                <a className="link" href={base + "CustomerCare"}>Visit customer care <ArrowRight size={13} /></a>
              </div>
            </section>
          </aside>
        </div>

        <div className="confirmation-actions">
          <a className="btn" href={base + "Orders"}><PackageCheck size={15} /> View demo orders</a>
          <a className="btn outline" href={base + "Collections"}><ShoppingBag size={15} /> Continue exploring</a>
        </div>
        <p className="confirmation-disclaimer">This is a design preview. No payment was taken, no real order was placed, and no shipment or return was created.</p>
      </main>
    </Shell>
  );
}

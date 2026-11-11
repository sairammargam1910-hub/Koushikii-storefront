import { useMemo, useState } from "react";
import { ArrowRight, MessageCircle } from "lucide-react";
import {
  Shell,
  PageHero,
  useStore,
  products,
  format,
  moneySub,
  base,
  whatsappOrderUrl,
} from "./_shared";
import { useShopifyCart } from "./ShopifyCatalog";
import { useShopifyCartMeta } from "./shopifyCartState";
import { ShopifyBuyerCheckout } from "./ShopifyBuyerCheckout";
import { useUser } from "@clerk/react";
import { Confirmation } from "./Confirmation";
import { readActiveCheckout } from "./checkoutPaymentState";
import { customerFacingMessage } from "./customerFacingMessage";

export function Checkout() {
  const { user } = useUser();
  const meta = useShopifyCartMeta();
  const shopifyCart = useShopifyCart(meta?.id);
  const sampleCart = useStore("kq-cart");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const selected = useMemo(
    () =>
      products.flatMap((product) => {
        const item = sampleCart.find((entry) => entry.id === product.id);
        return item ? [{ product, qty: item.qty }] : [];
      }),
    [sampleCart],
  );
  const total = moneySub(sampleCart);
  // Payment recovery must not depend on an existing/non-empty Shopify cart.
  const activeOrder = new URLSearchParams(window.location.search).get("payment_order_id") ||
    new URLSearchParams(window.location.search).get("cashfree_order_id") ||
    readActiveCheckout(user?.id);

  const prepareEnquiry = () => {
    if (!selected.length) {
      setError("Your sample selection is empty.");
      return;
    }
    const lines = selected.map(
      ({ product, qty }) =>
        `• ${product.name} — ${qty} × ${format(product.price)} = ${format(product.price * qty)}`,
    );
    const text = [
      "Namaste, I would like to enquire about these Chenetha by Koushikii sample catalogue pieces:",
      ...lines,
      `Illustrative sample subtotal: ${format(total)}`,
      note.trim() ? `Enquiry note: ${note.trim()}` : "",
      "",
      "I understand these are sample catalogue prices. Please confirm the actual product, availability and final pricing. This is an enquiry only.",
    ]
      .filter(Boolean)
      .join("\n");
    window.open(whatsappOrderUrl(text), "_blank", "noopener,noreferrer");
  };

  if (activeOrder) return <Confirmation />;

  if (meta) {
    return (
      <Shell>
        <PageHero
          eyebrow="Your order"
          title="Delivery details."
          subtitle="Enter your contact and delivery information here, then pay securely online."
        />
        <main className="wrap content">
          {shopifyCart.isLoading && !shopifyCart.data ? (
            <div className="shopify-catalog-status" role="status">Loading your order…</div>
          ) : shopifyCart.isError || !shopifyCart.data ? (
            <div className="panel" role="alert">
              <span className="eyebrow">Bag unavailable</span>
              <p className="muted" data-testid="error-shopify-checkout-load">
                {customerFacingMessage(getCartErrorMessage(shopifyCart.error), "We could not refresh this bag just now. Try again here, or return to your bag.")}
              </p>
              <button
                className="btn outline"
                type="button"
                data-testid="button-retry-shopify-cart-refresh"
                onClick={() => shopifyCart.refetch()}
                disabled={shopifyCart.isFetching}
                style={{ marginRight: 10 }}
              >
                Try again
              </button>
              <a className="btn" href={base + "Cart"}>Return to bag <ArrowRight size={14} /></a>
            </div>
          ) : (
            <ShopifyBuyerCheckout cart={shopifyCart.data} />
          )}
        </main>
      </Shell>
    );
  }

  return (
    <Shell>
      <PageHero
        eyebrow="Sample selection · enquiry only"
        title="Review the pieces you found."
        subtitle="Sample catalogue items are not sold online. For a real order, enter delivery details here before secure online payment."
      />
      <main className="wrap content">
        <div className="notice" role="note" data-testid="notice-catalogue-prices">
          Catalogue prices are illustrative samples, not offers. No payment, order, or shipment is created from this sample selection.
        </div>
        <div className="two-col" style={{ marginTop: 28 }}>
          <section className="panel">
            <span className="eyebrow">Sample pieces</span>
            {selected.length ? (
              selected.map(({ product, qty }) => (
                <div
                  className="row"
                  key={product.id}
                  data-testid={`row-enquiry-item-${product.id}`}
                  style={{ padding: "16px 0", borderBottom: "1px solid var(--line)" }}
                >
                  <div>
                    <a className="link" href={`${base}Product?id=${encodeURIComponent(product.id)}`}>{product.name}</a>
                    <p className="muted" style={{ margin: "7px 0 0" }}>{qty} × {format(product.price)} sample price</p>
                  </div>
                  <strong>{format(product.price * qty)}</strong>
                </div>
              ))
            ) : (
              <div className="empty" data-testid="empty-enquiry-cart">
                <h2>Your sample selection is empty.</h2>
                <p>Available products appear in your bag after you add them from a product page.</p>
                <a className="btn" href={base + "Collections"}>Browse the collection <ArrowRight size={14} /></a>
              </div>
            )}
            <div className="row" style={{ marginTop: 20 }}>
              <span>Illustrative sample subtotal</span>
              <strong data-testid="text-enquiry-subtotal">{format(total)}</strong>
            </div>
            <p className="muted" style={{ fontSize: 12 }}>Sample items cannot be submitted to a real checkout.</p>
            <label className="field" style={{ marginTop: 20 }}>
              Optional enquiry note
              <textarea
                data-testid="input-enquiry-note"
                value={note}
                maxLength={500}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Ask about a piece, colour, fabric, or availability."
              />
            </label>
            {error && <p className="notice" role="alert" data-testid="error-empty-enquiry">{error}</p>}
            <button
              className="btn"
              type="button"
              data-testid="button-open-whatsapp-enquiry"
              onClick={prepareEnquiry}
              disabled={!selected.length}
              style={{ marginTop: 18 }}
            >
              <MessageCircle size={16} /> Prepare WhatsApp enquiry
            </button>
            <p className="muted" style={{ fontSize: 11 }}>WhatsApp opens a draft for you to review and send. It does not place an order.</p>
          </section>
          <aside className="panel">
            <span className="eyebrow">For a real order</span>
            <h3 style={{ margin: "14px 0" }}>Pay securely online.</h3>
            <p className="muted">Choose an available product from the collection. Enter delivery details here, review the current delivery charge, then complete payment securely online.</p>
            <a className="link" href={base + "Cart"}>Return to your bag →</a>
          </aside>
        </div>
      </main>
    </Shell>
  );
}

function getCartErrorMessage(error: unknown): string | null {
  if (!error || typeof error !== "object" || !("data" in error)) return null;
  const data = error.data;
  if (!data || typeof data !== "object" || !("error" in data)) return null;
  return typeof data.error === "string" && data.error.trim() ? data.error.trim() : null;
}

import { useMemo, useState } from "react";
import { ArrowRight, MessageCircle, ShieldCheck } from "lucide-react";
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
import { formatShopifyMoney, useShopifyCart } from "./ShopifyCatalog";
import { useShopifyCartMeta } from "./shopifyCartState";

export function Checkout() {
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

  if (meta) {
    return (
      <Shell>
        <PageHero
          eyebrow="Shopify checkout"
          title="Review your order."
          subtitle="Shipping details, payment, and final totals are handled securely by Shopify."
        />
        <main className="wrap content">
          {shopifyCart.isLoading && !shopifyCart.data ? (
            <div className="shopify-catalog-status" role="status">Loading your Shopify order…</div>
          ) : shopifyCart.isError || !shopifyCart.data ? (
            <div className="panel" role="alert">
              <span className="eyebrow">Shopify checkout unavailable</span>
              <p className="muted" data-testid="error-shopify-checkout-load">
                {getCartErrorMessage(shopifyCart.error) || "We could not refresh this bag. Try again here, or return to your bag."}
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
            <ShopifyCheckoutReview cart={shopifyCart.data} />
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
        subtitle="Sample catalogue items are not sold online. Use Shopify checkout for a verified product published by the brand."
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
                <p>Shopify products appear in your bag after you add them from a product page.</p>
                <a className="btn" href={base + "Collections"}>Browse the collection <ArrowRight size={14} /></a>
              </div>
            )}
            <div className="row" style={{ marginTop: 20 }}>
              <span>Illustrative sample subtotal</span>
              <strong data-testid="text-enquiry-subtotal">{format(total)}</strong>
            </div>
            <p className="muted" style={{ fontSize: 12 }}>Sample items cannot be submitted to Shopify checkout.</p>
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
            <h3 style={{ margin: "14px 0" }}>Shopify handles checkout.</h3>
            <p className="muted">Add an available, non-demo product published to the Replit sales channel. Enter your address and payment details only on Shopify’s secure checkout page.</p>
            <a className="link" href={base + "Cart"}>Return to your bag →</a>
          </aside>
        </div>
      </main>
    </Shell>
  );
}

function ShopifyCheckoutReview({
  cart,
}: {
  cart: NonNullable<ReturnType<typeof useShopifyCart>["data"]>;
}) {
  let checkoutHref: string | undefined;
  try {
    const url = cart.checkoutUrl ? new URL(cart.checkoutUrl) : undefined;
    if (url?.protocol === "https:") checkoutHref = url.toString();
  } catch {
    checkoutHref = undefined;
  }
  const canCheckout = Boolean(checkoutHref) &&
    cart.lines.length > 0 &&
    cart.totalQuantity > 0 &&
    cart.lines.every((line) => line.quantity > 0 && line.availableForSale && !line.isDemo);

  return (
    <div className="two-col">
      <section className="panel">
        <span className="eyebrow">Products from Shopify</span>
        {cart.lines.map((line) => (
          <div className="row" key={line.id} style={{ padding: "16px 0", borderBottom: "1px solid var(--line)" }}>
            <div>
              <strong>{line.productTitle}</strong>
              <p className="muted" style={{ margin: "6px 0 0" }}>{line.variantTitle} · {line.quantity} × {formatShopifyMoney(line.unitPrice, line.currencyCode)}</p>
              {line.isDemo && <span className="pill shopify-demo-badge-inline">Demo only</span>}
            </div>
            <strong>{formatShopifyMoney(String(Number(line.unitPrice) * line.quantity), line.currencyCode)}</strong>
          </div>
        ))}
        <div className="row" style={{ marginTop: 20 }}>
          <span>Subtotal before discounts</span>
          <strong data-testid="text-shopify-checkout-subtotal">{formatShopifyMoney(cart.subtotalAmount, cart.currencyCode)}</strong>
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <strong>Estimated total</strong>
          <strong data-testid="text-shopify-checkout-total">{formatShopifyMoney(cart.totalAmount, cart.currencyCode)}</strong>
        </div>
        {cart.discountCodes.map((discount) => (
          <p
            className={discount.applicable ? "muted" : "notice"}
            role={discount.applicable ? "status" : "alert"}
            key={discount.code}
          >
            {discount.applicable
              ? `Discount code ${discount.code} is applied to this bag.`
              : `Discount code ${discount.code} does not apply to this bag.`}
          </p>
        ))}
        <p className="muted" style={{ fontSize: 12 }}>Shipping and applicable taxes are calculated by Shopify at checkout.</p>
        {canCheckout ? (
          <a className="btn" style={{ marginTop: 18 }} href={checkoutHref} target="_blank" rel="noopener noreferrer" data-testid="button-continue-shopify-checkout">
            <ShieldCheck size={16} /> Continue to secure Shopify checkout <ArrowRight size={14} />
          </a>
        ) : (
          <p className="notice" role="alert" data-testid="notice-shopify-cart-not-purchasable">
            This bag contains a demo or unavailable listing. Remove it or update the product in Shopify before checking out.
          </p>
        )}
      </section>
      <aside className="panel">
        <span className="eyebrow">Secure checkout</span>
        <h3 style={{ margin: "14px 0" }}>Your details stay with Shopify.</h3>
        <p className="muted">After you continue, Shopify asks for your shipping address and payment method, calculates delivery and tax, and confirms the order.</p>
        <p className="muted" style={{ fontSize: 12 }}>Saved profile details are only sent when you choose the saved-details option from your bag. Shopify securely handles payment and lets you review the delivery address.</p>
        <a className="link" href={base + "Cart"}>Return to your bag →</a>
      </aside>
    </div>
  );
}

function getCartErrorMessage(error: unknown): string | null {
  if (!error || typeof error !== "object" || !("data" in error)) return null;
  const data = error.data;
  if (!data || typeof data !== "object" || !("error" in data)) return null;
  return typeof data.error === "string" && data.error.trim() ? data.error.trim() : null;
}

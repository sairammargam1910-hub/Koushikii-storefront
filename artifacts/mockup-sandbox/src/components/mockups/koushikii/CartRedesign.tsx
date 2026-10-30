import { useState } from "react";
import {
  ArrowRight,
  Check,
  CircleAlert,
  LockKeyhole,
  Minus,
  Plus,
  RefreshCw,
  ShieldCheck,
  ShoppingBag,
  Trash2,
} from "lucide-react";
import { Shell, base } from "./_shared";
import "./CartRedesign.css";

type PreviewState = "cart" | "loading" | "error" | "empty" | "unavailable";

const unitPrice = 12800;

export function CartRedesign() {
  const [previewState, setPreviewState] = useState<PreviewState>("cart");
  const [quantity, setQuantity] = useState(1);
  const [discountCode, setDiscountCode] = useState("");
  const [discountMessage, setDiscountMessage] = useState("");
  const [useSavedAddress, setUseSavedAddress] = useState(true);
  const [checkoutNotice, setCheckoutNotice] = useState("");
  const subtotal = unitPrice * quantity;

  function changePreviewState(next: PreviewState) {
    setPreviewState(next);
    setCheckoutNotice("");
  }

  function renderCartState() {
    if (previewState === "loading") {
      return (
        <section className="preview-state-card" role="status" aria-label="Refreshing bag preview">
          <span className="eyebrow">Refreshing bag</span>
          <h2>Gathering your pieces.</h2>
          <p>A quiet loading-state preview for the moment a Shopify bag is being refreshed.</p>
          <div className="cart-skeleton" aria-hidden="true">
            <div className="skeleton-row">
              <div className="skeleton-block skeleton-image" />
              <div className="skeleton-copy">
                <span className="skeleton-block" />
                <span className="skeleton-block" />
                <span className="skeleton-block" />
              </div>
            </div>
            <div className="skeleton-row">
              <div className="skeleton-block skeleton-image" />
              <div className="skeleton-copy">
                <span className="skeleton-block" />
                <span className="skeleton-block" />
                <span className="skeleton-block" />
              </div>
            </div>
          </div>
        </section>
      );
    }

    if (previewState === "error") {
      return (
        <section className="preview-state-card" role="alert">
          <span className="state-symbol"><CircleAlert size={21} /></span>
          <span className="eyebrow">Bag unavailable</span>
          <h2>Your saved bag could not be refreshed.</h2>
          <p>This error state keeps the recovery path clear without implying a live Shopify request in this presentation preview.</p>
          <div className="notice">Your bag contents have not been changed in this mockup.</div>
          <button className="btn outline state-action" type="button" onClick={() => changePreviewState("cart")}>
            <RefreshCw size={14} /> Return to cart preview
          </button>
        </section>
      );
    }

    if (previewState === "empty") {
      return (
        <section className="preview-state-card">
          <span className="state-symbol"><ShoppingBag size={21} /></span>
          <span className="eyebrow">A fresh beginning</span>
          <h2>Your bag is taking a quiet moment.</h2>
          <p>Explore handloom sarees and return when a piece feels like yours.</p>
          <a className="btn state-action" href={base + "Collections"}>Browse sarees <ArrowRight size={14} /></a>
        </section>
      );
    }

    if (previewState === "unavailable") {
      return (
        <section className="preview-state-card" role="alert">
          <span className="state-symbol"><CircleAlert size={21} /></span>
          <span className="eyebrow">Listing needs attention</span>
          <h2>This saree is not available for checkout.</h2>
          <p>The item remains visible so its details can be reviewed. Checkout is held until every listing is available.</p>
          <div className="notice">Availability is illustrative here; no product inventory is being checked.</div>
          <button className="btn outline state-action" type="button" onClick={() => changePreviewState("cart")}>
            Return to available preview
          </button>
        </section>
      );
    }

    return (
      <div className="cart-layout">
        <section aria-labelledby="cart-lines-title">
          <div className="cart-list-head">
            <span className="eyebrow" id="cart-lines-title">Shopify products · {quantity} piece{quantity > 1 ? "s" : ""}</span>
            <a className="link" href={base + "Collections"}>Continue exploring</a>
          </div>

          <article className="cart-product">
            <a className="cart-product-image" href={base + "Product?shopify=nila-ikat"} aria-label="View Nila Ikat saree">
              <img src="/__mockup/images/koushikii-textiles.jpg" alt="Detail of a handwoven South Indian textile with a traditional motif" />
              <span className="cart-image-caption">Handloom · Telangana</span>
            </a>
            <div className="cart-product-copy">
              <span className="eyebrow">Ikat · Cotton-silk</span>
              <h2>Nila Ikat</h2>
              <p>A deep indigo field with a considered, handwoven rhythm.</p>
              <span className="variant-label">Saree · 5.5 m with 0.8 m blouse piece</span>
              <div className="cart-qty" aria-label={`Quantity ${quantity}`}>
                <button type="button" aria-label="Decrease quantity" onClick={() => setQuantity((current) => Math.max(1, current - 1))}>
                  <Minus size={14} />
                </button>
                <output aria-live="polite">{quantity}</output>
                <button type="button" aria-label="Increase quantity" onClick={() => setQuantity((current) => Math.min(10, current + 1))}>
                  <Plus size={14} />
                </button>
              </div>
            </div>
            <div className="cart-product-price">
              <strong>₹{subtotal.toLocaleString("en-IN")}</strong>
              <button type="button" className="cart-remove" onClick={() => changePreviewState("empty")}>
                <Trash2 size={13} /> Remove
              </button>
            </div>
          </article>

          <div className="cart-note">
            <Check size={16} aria-hidden="true" />
            <p>Each piece is woven in small batches. Colour may vary gently from screen to cloth.</p>
          </div>
        </section>

        <aside className="cart-summary" aria-labelledby="cart-summary-title">
          <div className="summary-heading">
            <div>
              <span className="eyebrow">Your order</span>
              <h2 id="cart-summary-title">A thoughtful choice.</h2>
            </div>
            <span className="summary-mark" aria-hidden="true"><ShoppingBag size={18} /></span>
          </div>

          <div className="summary-lines">
            <div className="row"><span>Subtotal</span><b>₹{subtotal.toLocaleString("en-IN")}</b></div>
            <div className="row"><span>Discount</span><span>—</span></div>
            <div className="row"><span>Delivery & taxes</span><span>Calculated at checkout</span></div>
            <div className="row summary-total"><strong>Estimated total</strong><strong>₹{subtotal.toLocaleString("en-IN")}</strong></div>
          </div>

          <form className="cart-discount" aria-label="Discount code preview" onSubmit={(event) => {
            event.preventDefault();
            setDiscountMessage(
              discountCode.trim()
                ? "Code entered. Eligibility and any savings would be confirmed by Shopify; no discount is included in this preview."
                : "Enter a code to continue.",
            );
          }}>
            <label htmlFor="cart-redesign-discount">Have a discount code?</label>
            <div className="discount-entry">
              <input
                id="cart-redesign-discount"
                value={discountCode}
                onChange={(event) => {
                  setDiscountCode(event.currentTarget.value);
                  setDiscountMessage("");
                }}
                autoComplete="off"
                placeholder="Enter code"
              />
              <button className="btn small outline" type="submit">Apply</button>
            </div>
            {discountMessage && <p className="discount-message" role="status">{discountMessage}</p>}
          </form>

          <section className="saved-address" aria-labelledby="saved-address-heading">
            <label id="saved-address-heading">Checkout details</label>
            <label className="address-choice">
              <input type="checkbox" checked={useSavedAddress} onChange={(event) => setUseSavedAddress(event.currentTarget.checked)} />
              <span>
                <span>
                  Use saved address
                  <small className="address-preview-label">Preview details</small>
                </span>
                {useSavedAddress ? (
                  <small>Ananya Rao · Jubilee Hills, Hyderabad, Telangana 500033</small>
                ) : (
                  <small>Enter delivery details securely at Shopify checkout.</small>
                )}
              </span>
            </label>
            <p className="address-footnote">
              {useSavedAddress
                ? "Address shown is illustrative. Review delivery details with Shopify before payment."
                : "Your address is not shown in this preview. Shopify checkout handles delivery details."}
            </p>
          </section>

          <button
            className="btn cart-checkout"
            type="button"
            onClick={() => setCheckoutNotice("Presentation preview only: Shopify checkout is not connected here.")}
          >
            Continue to secure Shopify checkout <ArrowRight size={15} />
          </button>
          <p className="secure-caption"><LockKeyhole size={12} /> Payment details stay with Shopify <span aria-hidden="true">·</span> <ShieldCheck size={12} /> Secure checkout</p>
          {checkoutNotice && <p className="checkout-note" role="status">{checkoutNotice}</p>}
          <p className="address-footnote" style={{ marginTop: 12 }}>Delivery charges and taxes are not estimated here. Shopify confirms the final payable amount at checkout.</p>
        </aside>
      </div>
    );
  }

  return (
    <Shell>
      <div className="cart-redesign">
        <header className="cart-hero" aria-label="Cart preview introduction">
          <div className="wrap">
            <span className="eyebrow">Your bag · Chenetha by Koushikii</span>
            <h1>Your bag, beautifully considered.</h1>
            <p>Review this handloom piece before continuing to Shopify. One heirloom-minded weave, ready for its next chapter.</p>
          </div>
        </header>
        <main className="wrap content cart-main">
          <div className="preview-toolbar">
            <p><strong>Design preview</strong> · Sample Shopify cart content; actions are illustrative only.</p>
            <nav className="preview-switcher" aria-label="Preview cart states">
              {([
                ["cart", "Cart"],
                ["loading", "Loading"],
                ["error", "Error"],
                ["empty", "Empty"],
                ["unavailable", "Unavailable"],
              ] as const).map(([state, label]) => (
                <button
                  key={state}
                  type="button"
                  aria-pressed={previewState === state}
                  onClick={() => changePreviewState(state)}
                >
                  {label}
                </button>
              ))}
            </nav>
          </div>
          {renderCartState()}
        </main>
      </div>
    </Shell>
  );
}

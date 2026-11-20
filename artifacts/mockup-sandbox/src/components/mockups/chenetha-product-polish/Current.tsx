import { useState } from "react";
import { ArrowRight, BadgeCheck, Heart, LockKeyhole, RotateCcw, X } from "lucide-react";
import "./_group.css";
import "./ShopifyCatalog.css";
import { cottonSareeSnapshot } from "./productFixture";

function QuantityControl({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <div className="qty" aria-label="Quantity">
      <button type="button" aria-label="Decrease quantity" disabled={value <= 1} onClick={() => onChange(Math.max(1, value - 1))}>−</button>
      <span aria-live="polite">{value}</span>
      <button type="button" aria-label="Increase quantity" disabled={value >= cottonSareeSnapshot.quantityAvailable} onClick={() => onChange(Math.min(cottonSareeSnapshot.quantityAvailable, value + 1))}>+</button>
    </div>
  );
}

export function Current() {
  const [quantity, setQuantity] = useState(1);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [saved, setSaved] = useState(false);

  return (
    <div className="kq chenetha-product-polish chenetha-product-polish-current min-h-screen">
      <main className="wrap">
        <nav className="product-breadcrumb" aria-label="Breadcrumb">
          <a href="#">Home</a><span>/</span><a href="#">Collections</a><span>/</span>
          <span aria-current="page">{cottonSareeSnapshot.title}</span>
        </nav>
        <div className="splitdetail shopify-product-detail" style={{ paddingTop: 0 }}>
          <section aria-label="Product photos" className="shopify-gallery">
            <div className="gallery-main shopify-gallery-main">
              <button type="button" className="shopify-zoom-trigger" aria-label="Enlarge product photo">
                <img src={cottonSareeSnapshot.imageUrl} alt={cottonSareeSnapshot.title} />
                <span className="shopify-zoom-hint">View detail</span>
              </button>
            </div>
          </section>

          <section className="detail">
            <span className="eyebrow">{cottonSareeSnapshot.productType}</span>
            <h1>{cottonSareeSnapshot.title}</h1>
            <div className="shopify-product-summary">
              <h2>About the product</h2>
              <p>{cottonSareeSnapshot.description}</p>
            </div>
            <span className="price shopify-detail-price">{cottonSareeSnapshot.price}</span>
            <p className="shopify-availability">
              <span className="shopify-availability-dot is-available" aria-hidden="true" />
              Available to add to your bag
            </p>
            <button className="shopify-details-trigger" type="button" aria-haspopup="dialog" aria-expanded={detailsOpen} onClick={() => setDetailsOpen(true)}>
              <span>View product details</span><ArrowRight size={16} aria-hidden="true" />
            </button>
            <div className="shopify-buy-controls">
              <label className="shopify-quantity-label">
                Quantity
                <QuantityControl value={quantity} onChange={setQuantity} />
                <span className="shopify-stock-note">{cottonSareeSnapshot.quantityAvailable} pieces are available to add.</span>
              </label>
              <div className="shopify-buy-actions">
                <button className="btn" type="button">
                  Add to bag · ₹{(900 * quantity).toFixed(2)}
                </button>
                <button className={`btn shopify-wishlist-button${saved ? " is-saved" : ""}`} type="button" aria-pressed={saved} onClick={() => setSaved((value) => !value)}>
                  <Heart size={17} fill={saved ? "currentColor" : "none"} />
                  {saved ? "Saved to wishlist" : "Add to wishlist"}
                </button>
                <button className="btn shopify-buy-now" type="button">Buy now</button>
              </div>
            </div>
            <p className="shopify-checkout-note">
              Price and availability are confirmed before payment; delivery is quoted at checkout.
            </p>
            <section className="shopify-trust-banner" aria-label="Store promises">
              <div className="shopify-trust-item"><RotateCcw aria-hidden="true" /><strong>{cottonSareeSnapshot.returnLabel}</strong></div>
              <div className="shopify-trust-item"><BadgeCheck aria-hidden="true" /><strong>Quality checked</strong></div>
              <div className="shopify-trust-item"><LockKeyhole aria-hidden="true" /><strong>Secure payments</strong></div>
            </section>
          </section>
        </div>
      </main>

      {detailsOpen && (
        <div className="shopify-details-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setDetailsOpen(false);
        }}>
          <aside className="shopify-details-drawer" role="dialog" aria-modal="true" aria-label="Product details">
            <button className="shopify-details-close" type="button" aria-label="Close product details" onClick={() => setDetailsOpen(false)}><X size={20} /></button>
            <div className="shopify-details-drawer-header"><h2>{cottonSareeSnapshot.title}</h2></div>
            <p className="eyebrow shopify-details-section-label">PRODUCT DETAILS</p>
            <p className="shopify-details-empty">Product-specific specifications have not been added yet.</p>
          </aside>
        </div>
      )}
    </div>
  );
}

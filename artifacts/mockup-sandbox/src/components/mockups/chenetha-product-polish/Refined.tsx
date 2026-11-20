import { useEffect, useState } from "react";
import {
  ArrowDownRight,
  ArrowLeft,
  ArrowRight,
  Check,
  Heart,
  LockKeyhole,
  Maximize2,
  Minus,
  Plus,
  RotateCcw,
  X,
} from "lucide-react";
import "./_group.css";
import "./Refined.css";
import { cottonSareeSnapshot } from "./productFixture";

export function Refined() {
  const [quantity, setQuantity] = useState(1);
  const [saved, setSaved] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    if (!detailsOpen && !photoOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDetailsOpen(false);
        setPhotoOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [detailsOpen, photoOpen]);

  const total = (900 * quantity).toFixed(2);

  return (
    <div className="chenetha-refined">
      <header className="cr-topbar">
        <a className="cr-wordmark" href="#" aria-label="Chenetha by Koushikii home">
          <span>chenetha</span>
          <small>BY KOUSHIKII</small>
        </a>
      </header>

      <main className="cr-page">
        <nav className="cr-breadcrumb" aria-label="Breadcrumb">
          <a href="#">Home</a><span aria-hidden="true">/</span>
          <span aria-current="page">{cottonSareeSnapshot.title}</span>
        </nav>

        <div className="cr-product-layout">
          <section className="cr-gallery" aria-label="Product photos">
            <div className="cr-image-frame">
              <button
                className="cr-photo-button"
                type="button"
                onClick={() => setPhotoOpen(true)}
                aria-label={`View larger photo of ${cottonSareeSnapshot.title}`}
              >
                <img src={cottonSareeSnapshot.imageUrl} alt={cottonSareeSnapshot.title} />
              </button>
              <span className="cr-image-index">01 <i>/</i> 01</span>
              <button className="cr-expand" type="button" onClick={() => setPhotoOpen(true)} aria-label="Enlarge product photo">
                <Maximize2 size={16} />
              </button>
            </div>
            <div className="cr-image-caption">
              <span>PRODUCT PHOTO</span>
            </div>
          </section>

          <section className="cr-buy-panel" id="purchase" aria-labelledby="cr-product-title">
            <span className="cr-overline">{cottonSareeSnapshot.productType}</span>
            <h1 id="cr-product-title">{cottonSareeSnapshot.title}</h1>
            <p className="cr-description">{cottonSareeSnapshot.description}</p>

            <div className="cr-price-row">
              <strong>{cottonSareeSnapshot.price}</strong>
              <span>INR</span>
            </div>

            <div className="cr-availability">
              <span className="cr-stock-dot" aria-hidden="true" />
              <span><strong>{cottonSareeSnapshot.quantityAvailable} available</strong><small>Ready to add to your bag</small></span>
            </div>

            <div className="cr-order-controls">
              <div className="cr-quantity-wrap">
                <span className="cr-label">QUANTITY</span>
                <div className="cr-quantity" aria-label="Quantity">
                  <button type="button" aria-label="Decrease quantity" disabled={quantity <= 1} onClick={() => setQuantity((value) => Math.max(1, value - 1))}>
                    <Minus size={14} />
                  </button>
                  <output aria-live="polite" aria-label={`Quantity ${quantity}`}>{quantity}</output>
                  <button type="button" aria-label="Increase quantity" disabled={quantity >= cottonSareeSnapshot.quantityAvailable} onClick={() => setQuantity((value) => Math.min(cottonSareeSnapshot.quantityAvailable, value + 1))}>
                    <Plus size={14} />
                  </button>
                </div>
              </div>
              <span className="cr-quantity-limit">Up to {cottonSareeSnapshot.quantityAvailable}</span>
            </div>

            <div className="cr-actions">
              <button className="cr-add-button" type="button" onClick={() => setFeedback(`${quantity} ${quantity === 1 ? "piece" : "pieces"} added to your bag · ₹${total}`)}>
                Add to bag <span>₹{total}</span><ArrowRight size={17} />
              </button>
              <button className={`cr-wishlist${saved ? " is-saved" : ""}`} type="button" aria-pressed={saved} onClick={() => setSaved((value) => !value)}>
                <Heart size={17} fill={saved ? "currentColor" : "none"} />
                {saved ? "Saved to wishlist" : "Save to wishlist"}
              </button>
              <button className="cr-buy-now" type="button" onClick={() => setFeedback("Your selection is ready for checkout.")}>
                Buy now <ArrowDownRight size={16} />
              </button>
            </div>

            <p className="cr-checkout-note"><LockKeyhole size={13} /> Price and availability confirmed before payment. Delivery quoted at checkout.</p>
            {feedback && <p className="cr-feedback" role="status"><Check size={15} />{feedback}<button type="button" aria-label="Dismiss message" onClick={() => setFeedback("")}><X size={14} /></button></p>}

            <button className="cr-details-link" type="button" aria-haspopup="dialog" aria-expanded={detailsOpen} onClick={() => setDetailsOpen(true)}>
              <span><small>LOOK CLOSER</small>Product details</span><ArrowRight size={17} />
            </button>

            <section className="cr-promises" aria-label="Store promises">
              <div><RotateCcw size={17} /><span>{cottonSareeSnapshot.returnLabel}</span></div>
              <div><Check size={17} /><span>Quality checked</span></div>
              <div><LockKeyhole size={16} /><span>Secure payments</span></div>
            </section>
          </section>
        </div>
        <footer className="cr-footer"><span>CHENETHA BY KOUSHIKII</span></footer>
      </main>

      {detailsOpen && (
        <div className="cr-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDetailsOpen(false); }}>
          <aside className="cr-drawer" role="dialog" aria-modal="true" aria-labelledby="cr-details-title">
            <button className="cr-close" type="button" aria-label="Close product details" onClick={() => setDetailsOpen(false)}><X size={19} /></button>
            <button className="cr-back" type="button" onClick={() => setDetailsOpen(false)}><ArrowLeft size={15} /> BACK TO THE PIECE</button>
            <p className="cr-drawer-kicker">PRODUCT DETAILS</p>
            <h2 id="cr-details-title">{cottonSareeSnapshot.title}</h2>
            <p className="cr-drawer-description">{cottonSareeSnapshot.description}</p>
            <div className="cr-detail-note"><p>Product-specific specifications have not been added yet.</p></div>
          </aside>
        </div>
      )}

      {photoOpen && (
        <div className="cr-photo-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPhotoOpen(false); }}>
          <div className="cr-photo-dialog" role="dialog" aria-modal="true" aria-label={`Photo of ${cottonSareeSnapshot.title}`}>
            <button className="cr-photo-close" type="button" aria-label="Close enlarged photo" onClick={() => setPhotoOpen(false)}><X size={20} /></button>
            <img src={cottonSareeSnapshot.imageUrl} alt={cottonSareeSnapshot.title} />
            <span>{cottonSareeSnapshot.title} · 01 / 01</span>
          </div>
        </div>
      )}
    </div>
  );
}

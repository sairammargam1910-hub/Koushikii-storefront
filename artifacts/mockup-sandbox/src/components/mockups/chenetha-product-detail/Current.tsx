import { useState } from "react";
import "./_group.css";

const productImage =
  "https://cdn.shopify.com/s/files/1/0855/3968/4581/files/d643e9b4-38df-4241-b390-18338cb2aa4c.jpg?v=1794495768";

export function Current() {
  const [quantity, setQuantity] = useState(1);

  return (
    <div className="chenetha-product-current">
      <div className="current-topline">Sustainable · Ethical · Timeless</div>
      <header className="current-header">
        <a href="#" className="current-brand">Chenetha by Koushikii</a>
        <nav className="current-nav" aria-label="Main navigation">
          <a href="#">Collections</a>
          <a href="#">Our Story</a>
          <a href="#">Videos</a>
          <a href="#">Contact Us</a>
        </nav>
        <div className="current-actions"><span>Search</span><span>Sign in</span><span>♡</span><span>Bag</span></div>
      </header>
      <div className="current-promo">A little thank-you · 10% off · Code TES10 · Apply in your bag to check eligibility.</div>
      <main className="current-product-wrap">
        <nav className="current-breadcrumb" aria-label="Breadcrumb">
          <a href="#">Home</a><span>/</span><a href="#">Collections</a><span>/</span><span>saree2</span>
        </nav>
        <div className="current-product-layout">
          <section className="current-gallery" aria-label="Product photos">
            <img className="current-main-image" src={productImage} alt="saree2" />
          </section>
          <section className="current-info">
            <span className="current-eyebrow">Saree</span>
            <h1>saree2</h1>
            <span className="current-price">₹900.00</span>
            <h2>About the product</h2>
            <p>fjkljkhjghhjhg</p>
            <div className="current-blouse">
              <span className="current-eyebrow">Blouse piece</span>
              <strong>Blouse availability not specified.</strong>
            </div>
            <div className="current-buy-row">
              <label className="current-quantity">
                Quantity
                <input
                  aria-label="Quantity"
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={(event) => setQuantity(Number(event.target.value))}
                />
              </label>
              <div className="current-buttons">
                <button type="button">Add to bag · ₹{(900 * quantity).toFixed(2)}</button>
                <button type="button">Buy now</button>
              </div>
            </div>
            <p className="current-checkout-note">
              Price and availability are confirmed before payment; delivery is quoted at checkout.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}

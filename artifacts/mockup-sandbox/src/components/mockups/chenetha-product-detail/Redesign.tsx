import { useState } from "react";
import { ChevronLeft, ChevronRight, Heart, Menu, Search, ShoppingBag, ZoomIn } from "lucide-react";
import "./_group.css";
import "./Redesign.css";

const piece = {
  category: "South Indian handloom",
  title: "Kanchipuram silk with a temple border",
  description: "A lustrous silk weave, finished with a traditional contrast border and a woven blouse piece.",
  attributes: { fabric: "Pure mulberry silk", weave: "Kanchipuram", region: "Tamil Nadu", colour: "Deep vermilion" },
  productDetails: {
    fabricComposition: "Pure mulberry silk with zari detailing",
    sareeLength: "5.5 metres",
    blousePieceLength: "0.8 metres, attached",
    borderDetails: "Contrast temple border with gold-tone zari",
    designPattern: "Small floral buttas across the body",
    washCareInstructions: "Dry clean only. Store in a muslin cloth, away from moisture.",
    additionalInformation: "",
  },
  images: [
    "/__mockup/images/chenetha-product-saree.jpg",
    "/__mockup/images/chenetha-product-detail.jpg",
    "/__mockup/images/chenetha-product-drape.jpg",
  ],
};

const related = [
  { title: "Kanchipuram silk, peacock blue", fabric: "Silk", price: "₹18,450", image: piece.images[0] },
  { title: "Soft silk with woven checks", fabric: "Silk", price: "₹14,200", image: piece.images[0] },
  { title: "Cotton-silk temple border", fabric: "Cotton silk", price: "₹9,850", image: piece.images[0] },
];

export function Redesign() {
  const [photo, setPhoto] = useState(0);
  const [qty, setQty] = useState(1);
  const [saved, setSaved] = useState(false);
  const [added, setAdded] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [zoom, setZoom] = useState(false);
  const detailRows = Object.entries(piece.productDetails).filter(([, value]) => value.trim());
  const nextPhoto = (step: number) => setPhoto((value) => (value + step + piece.images.length) % piece.images.length);
  return <div className="chenetha-redesign">
    <div className="rd-topline">Chenetha by Koushikii <span>·</span> Rooted in South Indian handloom</div>
    <header className="rd-header">
      <button aria-label="Open menu"><Menu size={18}/></button>
      <a className="rd-wordmark" href="#">Chenetha <small>by Koushikii</small></a>
      <nav aria-label="Main navigation"><a href="#">Sarees</a><a href="#">The craft</a><a href="#">Our story</a></nav>
      <div className="rd-actions"><button aria-label="Search"><Search size={17}/></button><button aria-label="Wishlist"><Heart size={17}/></button><button aria-label="Shopping bag, 0 items"><ShoppingBag size={17}/></button></div>
    </header>
    <main className="rd-main">
      <div className="rd-breadcrumb"><a href="#">Home</a><span>/</span><a href="#">Sarees</a><span>/</span><span>{piece.title}</span></div>
      <div className="rd-product">
        <section className="rd-gallery" aria-label="Product photographs">
          <div className="rd-thumbs">
            {piece.images.map((src, index) => <button key={index} type="button" aria-label={`Show product photo ${index + 1}`} aria-pressed={photo === index} onClick={() => setPhoto(index)}><img src={src} alt=""/></button>)}
          </div>
          <div className="rd-image">
            <img src={piece.images[photo]} alt={`${piece.title}, photo ${photo + 1}`}/>
            <button className="rd-zoom" onClick={() => setZoom(true)} aria-label="Enlarge product photo"><ZoomIn size={16}/> View weave</button>
            <button className="rd-arrow left" onClick={() => nextPhoto(-1)} aria-label="Previous photo"><ChevronLeft size={20}/></button>
            <button className="rd-arrow right" onClick={() => nextPhoto(1)} aria-label="Next photo"><ChevronRight size={20}/></button>
            <span className="rd-counter">{photo + 1} <i>/</i> {piece.images.length}</span>
          </div>
          <div className="rd-mobile-dots" aria-label="Photo pagination">{piece.images.map((_, index) => <button key={index} aria-label={`Photo ${index + 1}`} aria-current={photo === index} onClick={() => setPhoto(index)}/>)}</div>
          <p className="rd-image-caption">Woven in Tamil Nadu <span>·</span> Every piece carries its own character</p>
        </section>
        <section className="rd-copy">
          <div className="rd-kicker"><span className="rd-rule"/> {piece.category}</div>
          <h1>{piece.title}</h1>
          <p className="rd-description">{piece.description}</p>
          <dl className="rd-attributes">{Object.entries(piece.attributes).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
          <div className="rd-price">₹16,800 <small>INR</small></div>
          <div className="rd-stock"><span/> Available to add to your bag</div>
          <div className="rd-variant"><label htmlFor="rd-option">Finish</label><select id="rd-option"><option>Standard drape · One piece</option><option disabled>Custom finish · Unavailable</option></select></div>
          <div className="rd-controls">
            <div className="rd-quantity"><span>Quantity</span><div><button onClick={() => setQty(Math.max(1, qty - 1))} aria-label="Decrease quantity">−</button><span>{qty}</span><button onClick={() => setQty(qty + 1)} aria-label="Increase quantity">+</button></div></div>
            <button className="rd-add" onClick={() => setAdded(true)}>{added ? "Added to your bag" : "Add to bag"} <span>₹{(16800 * qty).toLocaleString("en-IN")}</span></button>
          </div>
          <button className={`rd-wishlist${saved ? " saved" : ""}`} onClick={() => setSaved(!saved)} aria-pressed={saved}><Heart size={16} fill={saved ? "currentColor" : "none"}/>{saved ? "Saved to wishlist" : "Save to wishlist"}</button>
          <p className="rd-note">Price and availability are confirmed before payment. Delivery is quoted at checkout.</p>
          <section className={`rd-details${detailsOpen ? " expanded" : ""}`}>
            <button onClick={() => setDetailsOpen(!detailsOpen)} aria-expanded={detailsOpen}><span><small>THE MAKING &amp; KEEPING</small><strong>Details of this piece</strong></span><b>{detailsOpen ? "−" : "+"}</b></button>
            <div className="rd-detail-rows">{detailRows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</div>
          </section>
        </section>
      </div>
      <section className="rd-related">
        <div className="rd-related-heading"><span className="rd-kicker"><span className="rd-rule"/> Continue the thread</span><h2>More from the loom</h2><p>Chosen for a shared silk story and South Indian craft.</p></div>
        <div className="rd-related-row">{related.map((item) => <a className="rd-card" href="#" key={item.title}><img src={item.image} alt=""/><small>{item.fabric}</small><strong>{item.title}</strong><span>{item.price}</span></a>)}</div>
      </section>
    </main>
    {zoom && <div className="rd-lightbox" role="dialog" aria-modal="true" aria-label="Enlarged product photograph" onClick={() => setZoom(false)}><button aria-label="Close enlarged photo">Close</button><img src={piece.images[photo]} alt={`${piece.title}, enlarged view`}/></div>}
  </div>;
}

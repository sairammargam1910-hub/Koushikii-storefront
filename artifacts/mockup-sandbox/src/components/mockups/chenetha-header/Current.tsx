import { useState } from "react";
import {
  ChevronDown,
  Heart,
  Languages,
  Menu,
  Search,
  ShoppingBag,
  UserRound,
  X,
} from "lucide-react";
import "./_group.css";
import { cottonWeaves } from "../koushikii/_shared";

const logo = "/__mockup/images/koushikii/wordmark-red.png";
const base = "/__mockup/preview/koushikii/";

function WhatsAppMark() {
  return (
    <svg className="whatsapp-mark" viewBox="0 0 32 32" aria-hidden="true">
      <path d="M16 3.2a12.5 12.5 0 0 0-10.7 19L3.5 28.5l6.5-1.7A12.5 12.5 0 1 0 16 3.2Z" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinejoin="round" />
      <path d="M12.1 9.7c-.4-.9-.8-.9-1.2-.9h-1c-.4 0-.9.2-1.3.7s-1.7 1.7-1.7 4.1 1.8 4.7 2 5c.2.4 3.5 5.6 8.6 7.6 4.2 1.7 5.1 1.3 6 1.2.9-.1 2.9-1.2 3.3-2.4.4-1.2.4-2.2.3-2.4-.1-.2-.4-.4-.9-.6l-3.1-1.5c-.4-.2-.8-.3-1.1.3-.4.6-1.3 1.6-1.6 2-.3.4-.6.4-1.1.1-.5-.2-2.1-.8-4-2.5-1.5-1.3-2.5-2.9-2.8-3.4-.3-.5 0-.8.2-1 .2-.2.5-.6.7-.9.2-.3.3-.5.5-.8.2-.3.1-.6 0-.9l-1.3-3.2Z" fill="currentColor" transform="translate(2 -2) scale(.82)" />
    </svg>
  );
}

export function Current() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <div className="kq">
      <div className="topline">The living art of handloom · Rooted in the South, woven across India</div>
      <header className="header">
        <div className="wrap headrow">
          <button
            className="iconbtn mobile-menu"
            type="button"
            aria-expanded={menuOpen}
            aria-controls="kq-main-menu"
            aria-label="Toggle main menu"
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X size={19} /> : <Menu size={19} />}
          </button>
          <a className="brand" href={base} aria-label="Chenetha by Koushikii home">
            <img src={logo} alt="Chenetha by Koushikii" />
          </a>
          <nav id="kq-main-menu" aria-label="Main menu" className={`nav ${menuOpen ? "open" : ""}`}>
            <details className="collection-nav">
              <summary>Collections <ChevronDown size={13} /></summary>
              <div className="mega-menu">
                <div>
                  <strong>Fabric</strong>
                  <div className="cotton-links">
                    {cottonWeaves.map((weave) => (
                      <a key={weave} href={`${base}Collections?category=Sarees&weave=${encodeURIComponent(weave)}`}>
                        {weave}
                      </a>
                    ))}
                  </div>
                  <a className="link" href={`${base}Collections?category=Sarees`} style={{ marginTop: 15 }}>
                    Discover sarees →
                  </a>
                </div>
                <div>
                  <strong>Browse by material</strong>
                  {["Cotton", "Silk", "Cotton-Silk", "Other blends"].map((fabric) => (
                    <a key={fabric} href={`${base}Collections?fabric=${encodeURIComponent(fabric)}`}>{fabric}</a>
                  ))}
                  <div className="menu-weaves">
                    <strong>Shop by Weave</strong>
                    {["Ikat", "Jamdani", "Kanchipuram", "Banarasi", "Pashmina"].map((weave) => (
                      <a key={weave} href={`${base}Collections?weave=${encodeURIComponent(weave)}`}>{weave}</a>
                    ))}
                  </div>
                </div>
              </div>
            </details>
            <a href={`${base}OurStory`}>Our Story</a>
            <a href={`${base}Videos`}>Videos</a>
            <a href={`${base}Contact`}>Contact Us</a>
          </nav>
          <div className="head-actions">
            <label className="language-switcher">
              <Languages size={14} aria-hidden="true" />
              <select aria-label="Choose website language" defaultValue="en">
                <option value="en">English</option>
                <option value="te">తెలుగు</option>
                <option value="hi">हिन्दी</option>
              </select>
            </label>
            <button className="text-action" type="button" aria-label="Search" aria-expanded={searchOpen} onClick={() => setSearchOpen((open) => !open)}>
              <Search size={16} />Search
            </button>
            <a className="text-action" href={`${base}Account`} aria-label="Sign in to your account">
              <UserRound size={16} />Sign in
            </a>
            <a className="iconbtn header-whatsapp" href="#" aria-label="Contact Chenetha on WhatsApp" title="Contact Chenetha on WhatsApp">
              <WhatsAppMark />
            </a>
            <a className="iconbtn optional" href={`${base}Wishlist`} aria-label="Wishlist"><Heart size={17} /></a>
            <a className="iconbtn" href={`${base}Cart`} aria-label="Shopping bag"><ShoppingBag size={18} /></a>
          </div>
        </div>
        {searchOpen && (
          <div className="wrap searchline active">
            <form onSubmit={(event) => event.preventDefault()}>
              <input aria-label="Search textiles" placeholder="Search Ikat, cotton, Kanchipuram…" />
              <button className="btn" type="submit">Search</button>
            </form>
          </div>
        )}
      </header>
      <section className="home-preview" aria-label="Homepage introduction">
        <div>
          <span>Chenetha by Koushikii</span>
          <h1>Woven by hand.</h1>
        </div>
      </section>
    </div>
  );
}

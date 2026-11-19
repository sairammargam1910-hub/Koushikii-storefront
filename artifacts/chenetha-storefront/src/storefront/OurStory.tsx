import { ArrowRight } from "lucide-react";
import { Shell, PageHero, base } from "./_shared";
import "./OurStory.css";

const values = [
  [
    "Pure fibre",
    "Natural yarns only, with no synthetic blends. Pure fibre breathes, lasts, and feels the way a saree should.",
  ],
  [
    "Respect for the weaver",
    "Many of our pieces are woven by artisans we work with directly. Their skill deserves recognition and a fair share.",
  ],
  [
    "Honest details",
    "Every piece is clearly labelled with its fibre, weave and origin. If we can’t verify something, we won’t claim it.",
  ],
  [
    "Fair prices",
    "Authentic, pure-fibre sarees shouldn’t come with a crazy price tag. Sheer passion, not profit margins, sets our prices.",
  ],
];

export function OurStory() {
  return (
    <Shell>
      <PageHero
        eyebrow="Our Story · Chenetha by Koushikii"
        title="A story in every thread"
        subtitle="Rooted in Indian handloom traditions, Chenetha by Koushikii invites you to discover each weave and the hands behind it."
      />

      <section className="section">
        <div className="wrap story-origin story-origin-improved">
          <div className="story-origin-media">
            <h2>A moment at the loom</h2>
            <figure className="story-illustration story-media">
              <video
                className="story-video"
                controls
                playsInline
                preload="metadata"
                poster="/images/koushikii-home-weaver-poster.jpg"
                aria-label="A short video of a weaver working at a handloom."
              >
                <source
                  src="/media/chenetha-weaver-story.mp4"
                  type="video/mp4"
                />
                Your browser does not support embedded video.
              </video>
              <figcaption>
                Client-supplied footage · One weaving moment; methods vary across makers and regions.
              </figcaption>
            </figure>
          </div>

          <div className="story-origin-copy story-origin-copy-improved">
            <span className="eyebrow">The thought behind Chenetha</span>
            <h3>Look beyond the finished drape.</h3>
            <p>
              Every weave has a story; ours began with family. What started as a heartfelt family
              conversation grew into a labour of love dedicated to celebrating India’s rich textile
              heritage.
            </p>
            <p>
              Somewhere between busy careers and a not-so-secret saree obsession, four cousins found
              a dream worth wearing.
            </p>
            <p>
              <strong>Pure thread is our whole personality.</strong>{" "}
              We believe true beauty lies in the purity of the thread. That’s why every saree at
              Koushikii is made from natural fibres.
            </p>
            <p><strong>Not mass-produced. Master-woven.</strong></p>
            <p>
              When you choose Koushikii Handlooms, you’re not just wearing a saree. You’re draping
              living history, supporting artisans, and making a sustainable choice.
            </p>
            <p>
              Let’s be honest: authentic handloom without a crazy price tag is hard to find. We work
              directly with artisans and run on sheer passion, not profit margins. So you get the
              real thing at a fair price.
            </p>
            <p>
              <strong>Pure threads. Stunning designs. Honest prices.</strong>
              <br />
              <strong>Welcome to Koushikii.</strong>
            </p>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <div className="section-head">
            <div>
              <h2>What every Koushikii saree carries</h2>
              <p>Four promises we stand by, from the fibre to the final fold.</p>
            </div>
          </div>
          <div className="promise-grid">
            {values.map(([title, copy], index) => (
              <article key={title}>
                <span className="promise-number">0{index + 1}</span>
                <h3>{title}</h3>
                <p>{copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <div className="story-end">
            <span className="eyebrow" style={{ color: "#e3bf71" }}>
              PURE FIBRE. FAIR PRICES.
            </span>
            <h2>Find a saree worth keeping</h2>
            <p>Shop natural-fibre sarees and learn to care for them.</p>
            <div className="actions">
              <a className="btn gold" href={base + "Collections"}>
                Shop sarees <ArrowRight size={14} />
              </a>
              <a className="btn pale" href={base + "SareeCare"}>
                Care guide
              </a>
            </div>
          </div>
        </div>
      </section>
    </Shell>
  );
}

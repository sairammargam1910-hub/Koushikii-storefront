import { ArrowRight } from "lucide-react";
import { Shell, PageHero, base } from "./_shared";
import "./OurStory.css";

const values = [
  [
    "Respect for skill",
    "The knowledge in preparing yarn, planning colour, setting the warp and weaving deserves recognition.",
  ],
  [
    "Regional knowledge",
    "Each textile tradition has its own language. We share it with context, without flattening the differences between places.",
  ],
  [
    "Honest details",
    "We distinguish what is known about fibre, construction and origin, and avoid claims that cannot be supported.",
  ],
  [
    "Longer wear",
    "Thoughtful storage and care can help a saree remain part of a wardrobe. Follow the guidance for the piece you own.",
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
        <div className="wrap story-origin">
          <div>
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

          <div className="story-origin-copy">
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
              <h2>What we hope each textile carries</h2>
              <p>A point of view rooted in respect, clarity and everyday use.</p>
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
          <p className="story-disclaimer">
            Design preview · No verified maker partnerships, certifications or origin claims are implied.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <div className="story-end">
            <span className="eyebrow" style={{ color: "#e3bf71" }}>
              Keep the thread moving
            </span>
            <h2>Find a piece worth keeping</h2>
            <p>Explore the collection, then learn how to care for the cloth you choose.</p>
            <div className="actions">
              <a className="btn gold" href={base + "Collections"}>
                Shop Collections <ArrowRight size={14} />
              </a>
              <a className="btn pale" href={base + "SareeCare"}>
                Care for your cloth
              </a>
            </div>
          </div>
        </div>
      </section>
    </Shell>
  );
}

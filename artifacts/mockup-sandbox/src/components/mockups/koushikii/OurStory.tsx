import { ArrowRight } from "lucide-react";
import { Shell, PageHero, base } from "./_shared";
import "./OurStory.css";

const principles = [
  [
    "01",
    "Listen to craft",
    "Regional traditions hold living knowledge. Share makers' stories with permission, context and credit.",
  ],
  [
    "02",
    "Describe with care",
    "Fibre, construction, technique and place are different details. Clear product information helps customers choose with understanding.",
  ],
  [
    "03",
    "Wear and care",
    "Choose a drape for your life, then follow the care guidance for that particular cloth.",
  ],
];

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
        eyebrow="About Us · Chenetha by Koushikii"
        title="A story held in every thread"
        subtitle="Rooted in South Indian handloom traditions, Chenetha by Koushikii invites you to explore each textile with curiosity, respect and care."
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
                poster="/__mockup/images/koushikii-home-weaver-poster.jpg"
                aria-label="A short video of a weaver working at a handloom."
              >
                <source
                  src="/__mockup/@fs/home/runner/workspace/attached_assets/AQMDsYmNaRf7YC1n3HA5-zstbtfaytEVF_IQKKEGFXqa-0rWRkuSCZqG_vOOTi_1792914848505.mp4"
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
              This client-supplied clip follows one weaver at a handloom, working with a bright
              patterned textile. It offers a glimpse of one practice—not a template for every region,
              material or maker.
            </p>
            <p>
              Respect for weavers starts with honest storytelling. We aim to make regional craft
              easier to discover, share product details clearly, and let makers' words be heard when
              their stories are shared with permission. A familiar weave name is a starting point,
              not proof of origin.
            </p>
            <div className="milestones">
              {principles.map(([number, title, copy]) => (
                <div className="milestone" key={number}>
                  <b>{number}</b>
                  <div>
                    <h3>{title}</h3>
                    <p>{copy}</p>
                  </div>
                </div>
              ))}
            </div>
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

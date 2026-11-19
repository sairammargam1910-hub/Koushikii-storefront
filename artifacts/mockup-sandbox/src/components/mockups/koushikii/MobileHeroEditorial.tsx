import { ArrowRight } from "lucide-react";
import "./_group.css";
import "./CurrentHero.css";
import "./MobileHeroEditorial.css";

export function MobileHeroEditorial() {
  return (
    <div className="kq current-hero-preview mobile-editorial-hero">
      <section className="heritage-hero home-hero-carousel" aria-label="Featured handloom collection">
        <div className="home-hero-images has-portrait-image">
          <img
            className="home-hero-image is-active"
            src="/__mockup/images/chenetha-heirlooms-hero-reference.jpg"
            alt="A woman in a navy handwoven saree seated in a South Indian stone courtyard"
            style={{ objectPosition: "50% 30%" }}
          />
          <div className="home-hero-shade" aria-hidden="true" />
          <div className="home-hero-content wrap">
            <div className="home-hero-copy" role="group" aria-roledescription="slide" aria-label="Featured collection">
              <span className="eyebrow">EYEBROW BABU TESTING</span>
              <h1>testing title</h1>
              <p>fghjbhgvkhjbc ghbnjhnjkgh vhh</p>
              <a className="home-hero-cta" href="#collection">
                Explore the collection
                <ArrowRight size={15} />
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

import { ArrowRight } from "lucide-react";
import "./_group.css";
import "./ReferenceHero.css";

export function ReferenceHero() {
  return (
    <div className="kq reference-hero-preview">
      <section className="reference-hero" aria-label="Featured handloom collection">
        <div className="reference-hero__copy">
          <h1>Heirlooms</h1>
          <p className="reference-hero__description">
            Borrowed from Mom&apos;s closet, stolen from her youth
          </p>
          <a className="reference-hero__cta" href="#collection">
            Explore the collection
            <ArrowRight size={15} aria-hidden="true" />
          </a>
        </div>
        <figure className="reference-hero__portrait">
          <img
            src="/__mockup/images/chenetha-heirlooms-hero-reference.jpg"
            alt="A woman in a navy handwoven saree seated in a South Indian stone courtyard"
            style={{ objectPosition: "20% 63%" }}
          />
        </figure>
      </section>
    </div>
  );
}

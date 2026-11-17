import { useEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import "./_group.css";
import "./CurrentHero.css";

type HeroSlide = {
  id: string;
  title: string;
  eyebrow: string | null;
  body: string | null;
  imageUrl: string;
  altText: string | null;
  focalPointX: number | null;
  focalPointY: number | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
};

const slides: HeroSlide[] = [{
  id: "live-heirlooms",
  title: "Heirlooms",
  eyebrow: null,
  body: "Borrowed from Mom's closet, stolen from her youth",
  imageUrl: "/__mockup/images/chenetha-heirlooms-hero-reference.jpg",
  altText: "A woman in a navy handwoven saree seated in a South Indian stone courtyard",
  focalPointX: 20,
  focalPointY: 63,
  ctaLabel: "Explore the collection",
  ctaUrl: "#collection",
}];

export function CurrentHero() {
  const [active, setActive] = useState(0);
  const [portraitImageUrl, setPortraitImageUrl] = useState("");
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const swipeClickGuard = useRef(0);

  useEffect(() => {
    if (slides.length < 2) return;
    const timer = window.setInterval(() => setActive(index => (index + 1) % slides.length), 6000);
    return () => window.clearInterval(timer);
  }, []);

  const activeIndex = active % slides.length;
  const slide = slides[activeIndex];
  const imageUrl = slide.imageUrl;
  const hasPortraitImage = portraitImageUrl === imageUrl;
  const go = (direction: number) => setActive(index => (index + direction + slides.length) % slides.length);
  const finishSwipe = (end: { x: number; y: number }) => {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start) return;
    const deltaX = end.x - start.x;
    const deltaY = end.y - start.y;
    if (Math.abs(deltaX) < 45 || Math.abs(deltaX) <= Math.abs(deltaY)) return;
    swipeClickGuard.current = Date.now() + 450;
    go(deltaX < 0 ? 1 : -1);
  };

  return (
    <div className="kq current-hero-preview">
      <section
        className="heritage-hero home-hero-carousel"
        aria-label="Featured handloom collection"
        onClickCapture={event => {
          if (Date.now() < swipeClickGuard.current) {
            event.preventDefault();
            event.stopPropagation();
            swipeClickGuard.current = 0;
          }
        }}
      >
        <div
          className={`home-hero-images${hasPortraitImage ? " has-portrait-image" : ""}`}
          onPointerDown={event => {
            if (event.isPrimary && event.pointerType !== "touch") touchStart.current = { x: event.clientX, y: event.clientY };
          }}
          onPointerUp={event => {
            if (event.pointerType !== "touch") finishSwipe({ x: event.clientX, y: event.clientY });
          }}
          onPointerCancel={event => {
            if (event.pointerType !== "touch") touchStart.current = null;
          }}
          onTouchStart={event => {
            if (event.touches.length !== 1) {
              touchStart.current = null;
              return;
            }
            const touch = event.touches[0];
            touchStart.current = { x: touch.clientX, y: touch.clientY };
          }}
          onTouchEnd={event => {
            const touch = event.changedTouches[0];
            if (touch) finishSwipe({ x: touch.clientX, y: touch.clientY });
          }}
          onTouchCancel={() => {
            touchStart.current = null;
          }}
        >
          <img
            className="home-hero-image is-active"
            src={imageUrl}
            alt={slide.altText || slide.title}
            style={
              slide.focalPointX !== null && slide.focalPointY !== null
                ? { objectPosition: `${slide.focalPointX}% ${slide.focalPointY}%` }
                : undefined
            }
            onLoad={event => {
              const image = event.currentTarget;
              setPortraitImageUrl(image.naturalHeight > image.naturalWidth * 1.04 ? imageUrl : "");
            }}
            onError={() => setPortraitImageUrl("")}
          />
          <div className="home-hero-shade" aria-hidden="true" />
          <div className="home-hero-content wrap">
            <div className="home-hero-copy" key={slide.id} role="group" aria-roledescription="slide" aria-label="1 of 1">
              {slide.eyebrow && <span className="eyebrow">{slide.eyebrow}</span>}
              <h1>{slide.title}</h1>
              {slide.body && <p>{slide.body}</p>}
              {slide.ctaLabel && slide.ctaUrl && (
                <a className="home-hero-cta" href={slide.ctaUrl}>
                  {slide.ctaLabel}
                  <ArrowRight size={15} />
                </a>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

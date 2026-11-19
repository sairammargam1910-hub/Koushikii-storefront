import "./_group.css";
import "./_heritage.css";
import "./OurStory.css";
import "./StorySectionImproved.css";

export function StorySectionImproved() {
  return (
    <div className="kq">
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
    </div>
  );
}

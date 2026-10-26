import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Pause, Play, RotateCcw } from "lucide-react";
import "./HomeMakingJourney.css";

const stages = [
  {
    id: "yarn",
    step: "01",
    note: "Preparation",
    title: "Prepare the yarn",
    copy: "Yarn is wound onto bobbins in preparation for the loom. The tools and sequence vary between fibres and weaving communities.",
    image: "/images/koushikii-home-yarn.svg",
    alt: "Illustration of a craftswoman winding yarn by hand beside a spinning wheel.",
  },
  {
    id: "dye",
    step: "02",
    note: "Colour",
    title: "Bring in the colour",
    copy: "Yarn may be coloured before it is woven. Dye methods and timing differ by material, design and regional practice.",
    image: "/images/koushikii-home-dye.svg",
    alt: "Illustration of a craftswoman lowering a hank of yarn into a dye vessel.",
  },
  {
    id: "loom",
    step: "03",
    note: "Weaving",
    title: "Weave the cloth",
    copy: "Warp and weft meet at the handloom. Each pass of the shuttle brings the fabric a little closer to its finished form.",
    image: "/images/koushikii-home-loom.svg",
    alt: "Illustration of a craftswoman working at a traditional handloom.",
  },
];

export function HomeMakingJourney() {
  const [stage, setStage] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(true);
  const [replay, setReplay] = useState(0);
  const current = stages[stage];

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      setReducedMotion(media.matches);
      setPlaying((wasPlaying) => (media.matches ? false : wasPlaying));
    };
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => setStage((value) => (value + 1) % stages.length), 4800);
    return () => window.clearInterval(timer);
  }, [playing]);

  const chooseStage = (index: number) => {
    setStage((index + stages.length) % stages.length);
    setPlaying(false);
  };

  return (
    <div className={`home-making-journey${playing ? " is-playing" : ""}`}>
      <div className="home-making-scene">
        <img
          key={`${current.id}-${replay}`}
          className="home-making-art"
          src={current.image}
          alt={current.alt}
          loading="eager"
        />
        <div className="home-making-caption">
          <span className="home-making-caption-mark" aria-hidden="true">✳</span>
          <span>{current.note} · Handloom craft, in three moments</span>
        </div>
        <div className="home-making-scene-index" aria-hidden="true">{current.step}<i>/</i>03</div>
        <div className="home-making-progress" key={`progress-${stage}-${replay}`}>
          <span />
        </div>
      </div>

      <nav className="home-making-stages" aria-label="Stages in the handloom-making process">
        {stages.map((item, index) => (
          <button
            key={item.id}
            type="button"
            className={stage === index ? "active" : ""}
            aria-current={stage === index ? "step" : undefined}
            onClick={() => chooseStage(index)}
          >
            <span className="home-making-step">{item.step}</span>
            <span className="home-making-stage-copy">
              <span className="home-making-note">{item.note}</span>
              <span className="home-making-title">{item.title}</span>
            </span>
            <ArrowRight className="home-making-stage-arrow" size={16} aria-hidden="true" />
          </button>
        ))}
      </nav>

      <div className="home-making-detail">
        <div className="home-making-detail-title">
          <span className="home-making-detail-kicker">Stage {current.step} · {current.note}</span>
          <h3>{current.title}</h3>
        </div>
        <p>{current.copy}</p>
      </div>

      <div className="home-making-controls">
        <div className="home-making-control-group">
          <button type="button" onClick={() => chooseStage(stage - 1)} aria-label="Previous craft stage">
            <ArrowLeft size={16} />
          </button>
          <button type="button" onClick={() => chooseStage(stage + 1)} aria-label="Next craft stage">
            <ArrowRight size={16} />
          </button>
          <button
            type="button"
            className="home-making-play"
            aria-pressed={playing}
            onClick={() => setPlaying((value) => !value)}
          >
            {playing ? <Pause size={14} /> : <Play size={14} />}
            {playing ? "Pause story" : "Play story"}
          </button>
          <button
            type="button"
            onClick={() => {
              setStage(0);
              setReplay((value) => value + 1);
              setPlaying(!reducedMotion);
            }}
          >
            <RotateCcw size={14} /> Replay
          </button>
        </div>
        <p className="home-making-disclaimer">
          Original illustrative artwork, not documentary footage or a record of one specific maker’s process.
          Methods vary across regions and makers.
        </p>
      </div>
    </div>
  );
}

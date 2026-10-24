import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Pause, Play, RotateCcw } from "lucide-react";
import { CraftScene } from "./CraftAnimation";

const stages = [
  {
    role: "winding" as const,
    title: "Prepare the yarn",
    copy: "Yarn is wound onto bobbins in preparation for the loom. The tools and sequence vary between fibres and weaving communities.",
    note: "Preparation",
  },
  {
    role: "dyeing" as const,
    title: "Bring in the colour",
    copy: "Yarn may be coloured before weaving. Dye methods and timing differ by material, design and regional practice.",
    note: "Colour",
  },
  {
    role: "weaving" as const,
    title: "Weave the cloth",
    copy: "Warp and weft meet at the handloom. A pedal lifts the threads while the shuttle carries the weft across.",
    note: "Weaving",
  },
];

export function WeavingJourney() {
  const [stage, setStage] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(true);
  const [replay, setReplay] = useState(0);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      setReducedMotion(media.matches);
      setPlaying(!media.matches);
    };
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!playing || reducedMotion) return;
    const timer = window.setInterval(() => setStage((current) => (current + 1) % stages.length), 16000);
    return () => window.clearInterval(timer);
  }, [playing, reducedMotion]);

  const current = stages[stage];
  const selectStage = (index: number) => {
    setStage((index + stages.length) % stages.length);
    setPlaying(false);
  };

  return (
    <div className="making-journey">
      <div className="craft-frame journey-scene">
        <CraftScene key={current.role + replay} role={current.role} paused={!playing} />
      </div>
      <div className="journey-copy">
        <nav className="journey-stages" aria-label="Stages in the handloom-making process">
          {stages.map((item, index) => (
            <button
              key={item.role}
              type="button"
              className={stage === index ? "active" : ""}
              aria-current={stage === index ? "step" : undefined}
              onClick={() => selectStage(index)}
            >
              <span className="journey-stage-number">{String(index + 1).padStart(2, "0")}</span>
              <span className="journey-stage-detail">
                <span className="journey-stage-name">{item.note}</span>
                <span className="journey-stage-title">{item.title}</span>
              </span>
              <span className="journey-stage-arrow" aria-hidden="true">→</span>
            </button>
          ))}
        </nav>
        <div className="journey-current">
          <div>
            <span className="draft-label">Stage {String(stage + 1).padStart(2, "0")} · {current.note}</span>
            <h3>{current.title}</h3>
          </div>
          <p className="muted">{current.copy}</p>
        </div>
        <div className="journey-controls">
          <button type="button" onClick={() => selectStage(stage - 1)} aria-label="Previous craft stage"><ArrowLeft size={15} /></button>
          <button type="button" onClick={() => selectStage(stage + 1)} aria-label="Next craft stage"><ArrowRight size={15} /></button>
          <button type="button" disabled={reducedMotion} aria-pressed={playing && !reducedMotion} onClick={() => setPlaying(!playing)}>
            {playing && !reducedMotion ? <Pause size={14} /> : <Play size={14} />}
            {playing && !reducedMotion ? "Pause" : "Play"}
          </button>
          <button type="button" onClick={() => { setReplay((value) => value + 1); setPlaying(!reducedMotion); }}>
            <RotateCcw size={14} />{reducedMotion ? "Reset still" : "Replay"}
          </button>
        </div>
        <p className="muted journey-footnote">An original illustration of craft roles, not client footage or a record of one specific maker’s process. Methods vary across regions and makers.</p>
      </div>
    </div>
  );
}

import assert from "node:assert/strict";
import test from "node:test";
import { translatePhrase } from "../src/storefront/_locale.ts";

const storyCopy = [
  "Our Story · Chenetha by Koushikii",
  "A story in every thread",
  "Rooted in Indian handloom traditions, Chenetha by Koushikii invites you to discover each weave and the hands behind it.",
  "A moment at the loom",
  "A short video of a weaver working at a handloom.",
  "Your browser does not support embedded video.",
  "Client-supplied footage · One weaving moment; methods vary across makers and regions.",
  "The thought behind Chenetha",
  "Look beyond the finished drape.",
  "Every weave has a story; ours began with family. What started as a heartfelt family conversation grew into a labour of love dedicated to celebrating India’s rich textile heritage.",
  "Somewhere between busy careers and a not-so-secret saree obsession, four cousins found a dream worth wearing.",
  "Pure thread is our whole personality.",
  "We believe true beauty lies in the purity of the thread. That’s why every saree at Koushikii is made from natural fibres.",
  "Not mass-produced. Master-woven.",
  "When you choose Koushikii Handlooms, you’re not just wearing a saree. You’re draping living history, supporting artisans, and making a sustainable choice.",
  "Let’s be honest: authentic handloom without a crazy price tag is hard to find. We work directly with artisans and run on sheer passion, not profit margins. So you get the real thing at a fair price.",
  "Pure threads. Stunning designs. Honest prices.",
  "Welcome to Koushikii.",
  "What every Koushikii saree carries",
  "Four promises we stand by, from the fibre to the final fold.",
  "Pure fibre",
  "Natural yarns only, with no synthetic blends. Pure fibre breathes, lasts, and feels the way a saree should.",
  "Respect for the weaver",
  "Many of our pieces are woven by artisans we work with directly. Their skill deserves recognition and a fair share.",
  "Honest details",
  "Every piece is clearly labelled with its fibre, weave and origin. If we can’t verify something, we won’t claim it.",
  "Fair prices",
  "Authentic, pure-fibre sarees shouldn’t come with a crazy price tag. Sheer passion, not profit margins, sets our prices.",
  "PURE FIBRE. FAIR PRICES.",
  "Find a saree worth keeping",
  "Shop natural-fibre sarees and learn to care for them.",
  "Shop sarees",
  "Care guide",
];

test("Our Story copy has Telugu and Hindi translations and restores English", () => {
  for (const source of storyCopy) {
    assert.equal(translatePhrase("en", source), source, `English changed: ${source}`);
    assert.notEqual(translatePhrase("te", source), source, `Telugu missing: ${source}`);
    assert.notEqual(translatePhrase("hi", source), source, `Hindi missing: ${source}`);
  }
});

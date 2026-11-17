/* Loom weaver motion
   Adds a natural weaving cycle to the existing loom SVG. It does NOT change any artwork:
   it only moves the parts you already drew (weaver, arms, beater, shuttle, heddles, treadles).
   Usage: paste inside the same page, AFTER the <svg> (needs the SVG inline, not an <img>). */
(() => {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const Wv = document.querySelector('[data-motion="weaver"]');
  if (!Wv) return;
  const root = Wv.ownerSVGElement;
  const $ = (s, r = root) => r.querySelector(s);
  const missing = [];
  const need = (n, el) => { if (!el) missing.push(n); return el; };
  const wrap = (els) => { const g = document.createElementNS(NS, 'g'); els[0].before(g); els.forEach((e) => g.append(e)); return g; };
  const set = (el, v) => { if (el) el.setAttribute('transform', v); };
  const f = (n) => (+n).toFixed(2);
  const rad = Math.PI / 180;
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, k) => a + (b - a) * k;
  const seg = (u, a, b) => { const x = clamp((u - a) / (b - a)); return x * x * (3 - 2 * x); };
  const cube = (x) => x * x * x;

  Wv.querySelectorAll('animateTransform').forEach((a) => a.remove()); // old 1.4px sway, replaced below

  /* ---------- find the parts (all selectors live here; fix one line if a part is renamed) ---------- */
  const front = need('weaver front layer', $('path[d="M26,152 L-96,162 L-94,236"]'))?.parentNode;
  const braid = need('braid', $('ellipse[cx="40.0"][cy="-26.0"]'))?.parentNode;
  const pallu = need('pallu', $('path[d^="M30,14 Q76,52"]'))?.parentNode;
  const farLeg = need('far leg', $('g[transform="translate(16,-6)"]'));
  let nearLeg, upper, headAll, pupL, pupR, lidL, lidR;
  if (front) {
    const kids = [...front.children];
    const i = kids.findIndex((k) => (k.getAttribute('d') || '').startsWith('M-52,98'));
    if (i > 0) {
      nearLeg = wrap(kids.slice(0, i));
      upper = wrap(kids.slice(i));
      const hair = $('ellipse[cx="6"][cy="-68"]', upper);
      if (hair) {
        const ch = [...upper.children];
        headAll = wrap(ch.slice(ch.indexOf(hair)));
        const grab = (list) => { const e = list.map((s) => $(s, headAll)); return e.every(Boolean) ? wrap(e) : null; };
        pupL = grab(['circle[cx="-37"][cy="-61"][r="7.2"]', 'circle[cx="-37"][cy="-61"][r="4"]', 'circle[cx="-39.5"][cy="-64"]', 'circle[cx="-34"][cy="-58"]']);
        pupR = grab(['circle[cx="2"][cy="-61"][r="6.2"]', 'circle[cx="2"][cy="-61"][r="3.4"]', 'circle[cx="0"][cy="-63.5"]']);
        lidL = $('ellipse[cx="-34"][cy="-62"][ry="0"]', headAll);
        lidR = $('ellipse[cx="5"][cy="-62"][ry="0"]', headAll);
      } else missing.push('hair');
    } else missing.push('torso split');
  }

  const beater = need('beater', $('g[transform="translate(763.7,235.0)"]'))?.firstElementChild;
  const cloth = need('hanging cloths', $('g[transform="translate(1086,262)"]'))?.firstElementChild;
  const tass = ['586.5,268.1', '651.2,275.2', '716.3,282.3', '760.0,287.1'].map((c) => $(`g[transform="translate(${c})"]`)?.firstElementChild).filter(Boolean);
  const shut = need('shuttle', $('g[transform^="translate(748.9,503.9)"]'))?.parentNode;
  const sh1 = need('heddle 1', $('polygon[points^="603.0,471.3"]'))?.parentNode;
  const sh2 = need('heddle 2', $('polygon[points^="639.9,475.7"]'))?.parentNode;
  const tr1 = need('treadle 1', $('polygon[points^="428.7,573.2"]'))?.parentNode;
  const tr2 = need('treadle 2', $('polygon[points^="451.8,533.8"]'))?.parentNode;
  const ray = $('polygon[points^="380,122"]')?.parentNode;
  const palms = [$('path[d^="M240.0,338.0"]'), $('path[d^="M350.0,336.0"]')].map((p) => p?.parentNode);

  /* ---------- arms: 2-bone rig, hands stay glued to the beater handle ---------- */
  const dist = (p, q) => Math.hypot(q[0] - p[0], q[1] - p[1]);
  const ang = (p, q) => Math.atan2(q[1] - p[1], q[0] - p[0]) / rad;
  function makeArm(D, S, E, H) {
    const poly = $(`path[d="${D}"]`);
    if (!poly) { missing.push('arm ' + D); return null; }
    const kids = [...poly.parentNode.children];
    const polys = kids.filter((k) => k.getAttribute('d') === D);
    const sleeve = 'M' + S[0] + ',' + S[1] + ' L';
    const isUp = (k) => (k.getAttribute('d') || '').startsWith(sleeve) || k.getAttribute('x1') === '881.4';
    const up = kids.filter((k) => !polys.includes(k) && isUp(k));
    const fo = kids.filter((k) => !polys.includes(k) && !isUp(k));
    const cr = (H[0] - S[0]) * (E[1] - S[1]) - (H[1] - S[1]) * (E[0] - S[0]);
    return { polys, ug: up.length ? wrap(up) : null, fg: fo.length ? wrap(fo) : null, S, E, H, L1: dist(S, E), L2: dist(E, H), s0: Math.sign(cr) || 1, a0: ang(S, E), b0: ang(E, H) };
  }
  const armF = makeArm('M902.3,435.2 L824.8,491.8 L767.0,415.1', [902.3, 435.2], [824.8, 491.8], [767.0, 415.1]);
  const armN = makeArm('M897.4,438.4 L828.8,505.5 L751.0,449.3', [897.4, 438.4], [828.8, 505.5], [751.0, 449.3]);
  function solve(A, S2, H2) {
    if (!A) return;
    const dx = H2[0] - S2[0], dy = H2[1] - S2[1], raw = Math.hypot(dx, dy) || 1;
    const d = clamp(raw, Math.abs(A.L1 - A.L2) + 1, A.L1 + A.L2 - 0.5), ux = dx / raw, uy = dy / raw;
    const H3 = [S2[0] + ux * d, S2[1] + uy * d];
    const a = (A.L1 * A.L1 - A.L2 * A.L2 + d * d) / (2 * d), h = Math.sqrt(Math.max(A.L1 * A.L1 - a * a, 0));
    const E2 = [S2[0] + ux * a + A.s0 * h * -uy, S2[1] + uy * a + A.s0 * h * ux];
    const D = `M${f(S2[0])},${f(S2[1])} L${f(E2[0])},${f(E2[1])} L${f(H3[0])},${f(H3[1])}`;
    A.polys.forEach((p) => p.setAttribute('d', D));
    set(A.fg, `translate(${f(E2[0])} ${f(E2[1])}) rotate(${f(ang(E2, H3) - A.b0)}) translate(${-A.E[0]} ${-A.E[1]})`);
    set(A.ug, `translate(${f(S2[0])} ${f(S2[1])}) rotate(${f(ang(S2, E2) - A.a0)}) translate(${-A.S[0]} ${-A.S[1]})`);
  }

  /* ---------- the weaving cycle: one pick every T seconds ----------
     0.00-0.16 foot presses treadle, shed changes | 0.14-0.28 shuttle flies across (alternates side each pick)
     0.40-0.54 pulls beater to her             | 0.54-0.62 pushes it forward, beat lands at 0.62, then recoil */
  const T = 3.2, HIP = [903.8, 527.7], PIV = [763.7, 235.0], HD = [0.4247, -0.9053], SD = [0.4156, -0.9096];
  const cyc = (t) => { const n = Math.floor(t / T); return { p: n & 1, u: (t - n * T) / T }; };
  const lean = (t) => {
    const { u } = cyc(t), ts = (u - 0.62) * T;
    let a = -1.0 * Math.sin(Math.PI * seg(u, 0.10, 0.34));
    if (u >= 0.40 && u < 0.54) a += 1.2 * seg(u, 0.40, 0.54);
    else if (u >= 0.54 && u < 0.62) a += lerp(1.2, -2.4, cube(seg(u, 0.54, 0.62)));
    else if (u >= 0.62) a += -2.4 * Math.exp(-4.5 * ts) * Math.cos(5.5 * ts);
    return a;
  };
  const beat = (t) => {
    const { u } = cyc(t), ts = (u - 0.62) * T;
    if (u < 0.40) return 0;
    if (u < 0.54) return -2.6 * seg(u, 0.40, 0.54);
    if (u < 0.62) return lerp(-2.6, 2.2, cube(seg(u, 0.54, 0.62)));
    return 2.2 * Math.exp(-6 * ts) * Math.cos(8 * ts);
  };
  // braid / pallu swing: a damped pendulum driven by the torso's angular acceleration
  let sw = 0, sv = 0, lt = 0;
  const swing = (t) => {
    if (t < lt || t - lt > 0.25) { sw = 0; sv = 0; lt = t; return; }
    for (const h = 1 / 240; lt < t; lt += h) {
      const acc = (lean(lt + 0.01) - 2 * lean(lt) + lean(lt - 0.01)) / 1e-4;
      const W0 = 2 * Math.PI * 1.1;
      sv += (0.6 * acc - W0 * W0 * sw - 2 * 0.22 * W0 * sv) * h;
      sw = clamp(sw + sv * h, -9, 9);
    }
  };
  const BLINK = [2.4, 5.9, 9.3, 9.75, 13.2];

  function render(t) {
    const { p, u } = cyc(t), ts = (u - 0.62) * T;
    const ns = p ? -1 : 1, shed = lerp(-ns, ns, seg(u, 0, 0.16)), pr = (shed + 1) / 2;
    const thr = 1 - Math.pow(1 - clamp((u - 0.14) / 0.14), 3), s = p ? 1 - thr : thr;
    const a = lean(t), b = beat(t), dy = Math.sin((t * 2 * Math.PI) / 3.6) * 0.7;
    swing(t);

    // torso, head, braid
    set(upper, `translate(0 ${f(dy / 0.8)}) rotate(${f(a)} 10 140)`);
    const nod = u < 0.54 ? 0 : u < 0.62 ? -1.6 * cube(seg(u, 0.54, 0.62)) : -1.6 * Math.exp(-6 * ts) * Math.cos(8 * ts);
    set(headAll, `rotate(${f(-1.4 * Math.sin(Math.PI * seg(u, 0.10, 0.34)) + nod + 0.35 * Math.sin(t * 1.5))} 4 -10)`);
    set(braid, `translate(0 ${f(dy / 0.8)}) rotate(${f(a)} 10 140) rotate(${f(sw)} 38 -30)`);
    set(pallu, `translate(0 ${f(dy / 0.8)}) rotate(${f(a)} 10 140) rotate(${f(sw * 0.5)} 34 18)`);

    // eyes: follow the shuttle, glance at the cloth on the beat, blink
    const gs = [lerp(-1.6, -0.3, s), lerp(1.8, 0.3, s)], wc = seg(u, 0.30, 0.42) * (1 - seg(u, 0.90, 1.0));
    const gx = lerp(gs[0], -1.0, wc), gy = lerp(gs[1], 0.9, wc);
    set(pupL, `translate(${f(gx)} ${f(gy)})`); set(pupR, `translate(${f(gx)} ${f(gy)})`);
    let bl = 0; const bt = t % 16.5;
    BLINK.forEach((s0) => { const x = (bt - s0) / 0.2; if (x > 0 && x < 1) bl = Math.max(bl, Math.sin(Math.PI * x)); });
    if (lidL) lidL.setAttribute('ry', f(11 * bl)); if (lidR) lidR.setAttribute('ry', f(10 * bl));

    // legs, treadles, heddles
    set(nearLeg, `rotate(${f(-3.2 * pr)} 26 152)`);
    set(farLeg, `translate(16 -6) rotate(${f(-3.2 * (1 - pr))} 20 150)`);
    set(tr1, `rotate(${f(lerp(-0.3, 1.0, pr))} 430 563)`); set(tr2, `rotate(${f(lerp(1.0, -0.3, pr))} 453 527)`);
    set(sh1, `translate(0 ${f(-8 * shed)})`); set(sh2, `translate(0 ${f(8 * shed)})`);

    // shuttle, beater, arms
    set(shut, `translate(${f(s * 95 * SD[0])} ${f(s * 95 * SD[1])})`);
    set(beater, `rotate(${f(b)})`);
    const co = Math.cos(a * rad), si = Math.sin(a * rad);
    const shoulder = (S) => { const x = S[0] - HIP[0], y = S[1] - HIP[1]; return [HIP[0] + x * co - y * si, HIP[1] + x * si + y * co + dy]; };
    const cb = Math.cos(b * rad), sb = Math.sin(b * rad);
    const hand = (H, off) => { const x = H[0] + HD[0] * off - PIV[0], y = H[1] + HD[1] * off - PIV[1]; return [PIV[0] + x * cb - y * sb, PIV[1] + x * sb + y * cb]; };
    const pick = Math.sin(Math.PI * clamp((u - 0.11) / 0.16));
    if (armN) solve(armN, shoulder(armN.S), hand(armN.H, 0));
    if (armF) solve(armF, shoulder(armF.S), hand(armF.H, -7 * pick));

    // scene life tied to the beat + gentle ambient
    tass.forEach((g, i) => set(g, `rotate(${f(1.4 * Math.sin((t * 2 * Math.PI) / 3.1 + i * 1.3) + (u >= 0.62 ? 5.5 * Math.exp(-3.5 * ts) * Math.cos(12 * ts + i * 0.5) : 0))})`));
    set(cloth, `skewX(${f(1.2 * Math.sin((t * 2 * Math.PI) / 6.3))})`);
    set(palms[0], `rotate(${f(1.8 * Math.sin((t * 2 * Math.PI) / 4.7))} 240 338)`);
    set(palms[1], `rotate(${f(1.4 * Math.sin((t * 2 * Math.PI) / 5.6 + 1))} 350 336)`);
    if (ray) ray.setAttribute('opacity', f(0.8 + 0.2 * Math.sin((t * 2 * Math.PI) / 7)));
  }

  if (missing.length) console.warn('loom motion: parts not found ->', missing.join(', '));
  window.loomMotion = { render, period: T };
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { render(0); return; }
  let t0 = null;
  const loop = (ms) => { if (t0 === null) t0 = ms; render((ms - t0) / 1000); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
})();
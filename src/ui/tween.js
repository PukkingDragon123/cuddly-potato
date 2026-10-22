// DOM tween + spring helpers (Web Animations API, composited properties only).
//
//   spring(el, 'scale', [1.05, 0.9], [1, 1], { stiffness: 520, damping: 14 })
//   tween(el, 'translate', [0, 0], [0, -6], { duration: 0.18, ease: EASE.outBack })
//   springFrom(el, 'scale', [1, 1], { ...SPRING.bouncy })   // from the live (mid-animation) value
//   pop(el) / nudge(el) / wobble(el) / popIn(el)              // ready-made juice
//
// Values are numbers or arrays of numbers; the property decides the CSS unit:
// scale (unitless, 1 or 2 values), translate (px, or pass strings), rotate (deg),
// opacity. Use the individual transform properties (scale / translate / rotate)
// so tweens compose with whatever `transform` the element already has.
// A new tween on the same element + property replaces the running one and,
// for springs, starts from the current on-screen value (no snapping).

const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Easing presets (CSS timing functions). */
export const EASE = {
  out: 'cubic-bezier(.2, .8, .3, 1)',
  in: 'cubic-bezier(.5, 0, .9, .4)',
  inOut: 'cubic-bezier(.6, 0, .3, 1)',
  outBack: 'cubic-bezier(.3, 1.6, .5, 1)',
  outBackSoft: 'cubic-bezier(.3, 1.3, .5, 1)',
  snap: 'cubic-bezier(.1, .9, .2, 1)',
};

/** Spring presets: stiffness (k), damping (c), mass (m). */
export const SPRING = {
  bouncy: { stiffness: 560, damping: 13 },
  jelly: { stiffness: 420, damping: 10 },
  snappy: { stiffness: 900, damping: 34 },
  soft: { stiffness: 220, damping: 18 },
  wobbly: { stiffness: 300, damping: 7 },
};

/**
 * Damped spring progress curve sampled at 60 Hz: returns { pts: [progress...], duration (s) }.
 * Progress starts at 0 and settles at 1 (overshoots when under-damped). v0 = initial velocity in
 * progress units per second (e.g. a press that is still moving).
 */
const CURVES = new Map();
export function springCurve({ stiffness = 560, damping = 13, mass = 1, velocity = 0 } = {}) {
  const key = `${stiffness}|${damping}|${mass}|${velocity}`;
  let c = CURVES.get(key);
  if (c) return c;
  const dt = 1 / 120;
  let x = 0, v = velocity, t = 0, calm = 0;
  const pts = [0];
  // semi-implicit Euler on x'' = (-k (x - 1) - c x') / m
  while (t < 3) {
    for (let s = 0; s < 2; s++) {
      const a = (-stiffness * (x - 1) - damping * v) / mass;
      v += a * dt;
      x += v * dt;
      t += dt;
    }
    pts.push(x);
    calm = Math.abs(x - 1) < 0.004 && Math.abs(v) < 0.05 ? calm + 1 : 0;
    if (calm > 3) break;
  }
  pts[pts.length - 1] = 1;
  c = { pts, duration: (pts.length - 1) / 60 };
  CURVES.set(key, c);
  return c;
}

// ---------------------------------------------------------------- value formatting
const UNIT = { translate: 'px', rotate: 'deg', scale: '', opacity: '' };
const arr = (v) => (Array.isArray(v) ? v : [v]);
function fmtVal(prop, v) {
  const u = UNIT[prop] ?? '';
  const a = arr(v).map((n) => (typeof n === 'number' ? +n.toFixed(4) + u : n));
  if (prop === 'translate' && a.length === 1) a.push('0px');
  return a.join(' ');
}
function lerp(a, b, t) {
  const A = arr(a), B = arr(b), n = Math.max(A.length, B.length);
  const out = [];
  for (let i = 0; i < n; i++) {
    const x = A[i] ?? A[A.length - 1], y = B[i] ?? B[B.length - 1];
    out.push(typeof x === 'number' && typeof y === 'number' ? x + (y - x) * t : t < 0.5 ? x : y);
  }
  return out;
}
/** The live (possibly mid-animation) value of a property as numbers, or null. */
export function liveValue(el, prop) {
  const s = getComputedStyle(el)[prop];
  if (!s || s === 'none') return prop === 'scale' ? [1, 1] : prop === 'translate' ? [0, 0] : prop === 'rotate' ? [0] : null;
  const n = s.split(/\s+/).map(parseFloat).filter((x) => !Number.isNaN(x));
  if (prop === 'scale' && n.length === 1) n.push(n[0]);
  if (prop === 'translate' && n.length === 1) n.push(0);
  return n.length ? n : null;
}

function take(el, prop) {
  const m = (el._tw ??= {});
  const old = m[prop];
  if (old) { try { old.cancel(); } catch (e) { /* gone */ } }
  return m;
}
function run(el, prop, frames, duration, easing, o) {
  const m = take(el, prop);
  const a = el.animate(frames, { duration: duration * 1000, easing, delay: (o.delay ?? 0) * 1000, fill: o.hold ? (o.delay ? 'both' : 'forwards') : o.delay ? 'backwards' : 'none', composite: 'replace' });
  m[prop] = a;
  a.onfinish = () => { if (m[prop] === a && !o.hold) m[prop] = null; o.onDone?.(); };
  return a;
}

/** Spring a property from `from` to `to`. o: SPRING preset fields + { delay, hold (keep end value), onDone }. */
export function spring(el, prop, from, to, o = {}) {
  if (!el?.animate) return null;
  if (reduced()) return run(el, prop, [{ [prop]: fmtVal(prop, to) }, { [prop]: fmtVal(prop, to) }], 0.001, 'linear', o);
  const c = springCurve(o);
  const frames = c.pts.map((p) => ({ [prop]: fmtVal(prop, lerp(from, to, p)) }));
  return run(el, prop, frames, c.duration, 'linear', o);
}
/** Spring from the live on-screen value (interrupt-safe). */
export function springFrom(el, prop, to, o = {}) {
  if (!el?.isConnected) return null;
  const from = liveValue(el, prop) ?? to;
  return spring(el, prop, from, to, o);
}
/** Plain eased tween. o: { duration (s), ease (CSS timing), delay, hold, onDone }. */
export function tween(el, prop, from, to, o = {}) {
  if (!el?.animate) return null;
  const d = reduced() ? 0.001 : o.duration ?? 0.2;
  return run(el, prop, [{ [prop]: fmtVal(prop, from) }, { [prop]: fmtVal(prop, to) }], d, o.ease ?? EASE.out, o);
}
/** Keyframe sequence tween: values = [v0, v1, ...] spread evenly (or o.offsets); o.eases = per-segment easings. */
export function seq(el, prop, values, o = {}) {
  if (!el?.animate) return null;
  const n = values.length;
  const frames = values.map((v, i) => {
    const f = { [prop]: fmtVal(prop, v), offset: o.offsets?.[i] ?? i / (n - 1) };
    if (o.eases?.[i]) f.easing = o.eases[i]; // easing of the segment that starts at this frame
    return f;
  });
  return run(el, prop, frames, reduced() ? 0.001 : o.duration ?? 0.4, o.eases ? 'linear' : o.ease ?? 'ease-out', o);
}
/** Cancel every tween on an element (or one property). */
export function stopTweens(el, prop) {
  const m = el?._tw;
  if (!m) return;
  for (const k of prop ? [prop] : Object.keys(m)) { try { m[k]?.cancel(); } catch (e) { /* gone */ } m[k] = null; }
}

// ---------------------------------------------------------------- ready-made juice
/** Jelly pop: squash then spring back with overshoot (good for "something changed"). */
export function pop(el, amt = 1) {
  return spring(el, 'scale', [1 + 0.18 * amt, 1 - 0.16 * amt], [1, 1], SPRING.jelly);
}
/** Little hop: up (decelerating), down (accelerating), a small bounce. */
export function hop(el, px = 10, dur = 0.6) {
  const up = 'cubic-bezier(.2,.7,.4,1)', down = 'cubic-bezier(.6,0,.8,.4)';
  return seq(el, 'translate', [[0, 0], [0, -px], [0, 0], [0, -px * 0.22], [0, 0]], { duration: dur, offsets: [0, 0.36, 0.7, 0.85, 1], eases: [up, down, up, down] });
}
/** Springy nudge (starts displaced, springs home). */
export function nudge(el, px = 6) {
  return spring(el, 'translate', [0, -px], [0, 0], SPRING.bouncy);
}
/** Rotational wobble that decays (deny / attention). */
export function wobble(el, deg = 10) {
  return spring(el, 'rotate', deg, 0, SPRING.wobbly);
}
/** Spring in from nothing (appearing elements). */
export function popIn(el, o = {}) {
  el.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: 120, delay: (o.delay ?? 0) * 1000, fill: 'backwards' });
  return spring(el, 'scale', [0.2, 0.2], [1, 1], { ...SPRING.bouncy, ...o });
}

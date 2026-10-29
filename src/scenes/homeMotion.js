// Home lobby motion kit: spring tweens on the Web Animations API.
//
// Everything animates `transform` / `opacity` only (composited, so it stays
// smooth while the 3D island renders) and press / hover / entrance motion is
// layered with `composite: 'add'`, so it stacks on top of whatever the element
// already does in CSS (floating consoles, bobbing ready vials, the raised
// active tab...) instead of fighting it.
//
//   pressable(el, o)   press squash, release overshoot, hover lift
//   enter(els, o)      staggered spring entrance (slide / pop in)
//   springTo(el, a, b) one-off spring between two {x, y, sx, sy, r} poses
//   slideSwap(el, dir) content swap nudge (arena banner browsing)

const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
let _add = null;
/** Does this browser composite added transforms (Chrome 112+, Safari 16+, Firefox 104+)? */
export function canAdd() {
  if (_add !== null) return _add;
  try {
    const a = document.createElement('div').animate([{ transform: 'scale(1)' }, { transform: 'scale(1)' }], { duration: 1, composite: 'add' });
    _add = a.effect?.composite === 'add';
    a.cancel();
  } catch (e) {
    _add = false;
  }
  return _add;
}

const ID = { x: 0, y: 0, sx: 1, sy: 1, r: 0 };
const KEYS = ['x', 'y', 'sx', 'sy', 'r'];
const tf = (p) => `translate(${p.x.toFixed(2)}px, ${p.y.toFixed(2)}px) scale(${p.sx.toFixed(4)}, ${p.sy.toFixed(4)})`;

/**
 * Damped spring from `from` to `to` (both poses). Returns { frames, dur } with
 * frames sampled evenly over the settle time. stiffness / damping per unit mass.
 */
export function springPath(from, to, { stiffness = 520, damping = 18, v0 = null, maxDur = 1.4 } = {}) {
  const dt = 1 / 240;
  const cur = { ...from }, vel = {};
  for (const k of KEYS) vel[k] = v0?.[k] ?? 0;
  const raw = [{ ...cur }];
  let settle = 0;
  for (let i = 0; i < maxDur / dt; i++) {
    let moving = false;
    for (const k of KEYS) {
      const f = -stiffness * (cur[k] - to[k]) - damping * vel[k];
      vel[k] += f * dt;
      cur[k] += vel[k] * dt;
      const scale = k === 'x' || k === 'y' || k === 'r' ? 0.05 : 0.0004;
      if (Math.abs(cur[k] - to[k]) > scale || Math.abs(vel[k]) > scale * 8) moving = true;
    }
    raw.push({ ...cur });
    if (!moving) { settle++; if (settle > 6) break; } else settle = 0;
  }
  raw.push({ ...to });
  const dur = (raw.length - 1) * dt;
  // ~60 keyframes per second of motion keeps the curve exact without bloating the effect
  const n = Math.max(2, Math.min(64, Math.round(dur * 60)));
  const frames = [];
  for (let i = 0; i <= n; i++) frames.push(raw[Math.round((i / n) * (raw.length - 1))]);
  return { frames, dur };
}

/** Pose an element is currently showing from its running spring (for seamless interruptions). */
function livePose(el) {
  const m = el._mo;
  if (!m?.anim || !m.frames) return { ...(m?.pose ?? ID) };
  const ct = m.anim.effect.getComputedTiming();
  const p = ct.progress ?? 1;
  const f = m.frames;
  const i = Math.min(f.length - 1, p * (f.length - 1));
  const a = f[Math.floor(i)], b = f[Math.ceil(i)], k = i - Math.floor(i);
  const out = {};
  for (const key of KEYS) out[key] = a[key] + (b[key] - a[key]) * k;
  return out;
}

/** Run a transform animation that adds on top of the element's own transform. */
function play(el, frames, dur, easing = 'linear', delay = 0, fill = 'forwards') {
  const m = (el._mo ??= {});
  const prev = m.anim;
  const anim = el.animate(frames.map((p) => ({ transform: tf(p) })), { duration: Math.max(1, dur * 1000), easing, delay: delay * 1000, fill, composite: 'add' });
  m.anim = anim;
  m.frames = frames;
  m.pose = frames[frames.length - 1];
  if (prev) prev.cancel();
  anim.onfinish = () => {
    // identity poses don't need to stick around
    if (m.anim === anim && isId(m.pose)) { anim.cancel(); m.anim = null; m.frames = null; }
  };
  return anim;
}
const isId = (p) => KEYS.every((k) => Math.abs(p[k] - ID[k]) < 1e-4);

/** Spring an element from its live pose (or `from`) to `to`. */
export function springTo(el, to, o = {}) {
  if (!el || !canAdd()) return null;
  const from = o.from ? { ...ID, ...o.from } : livePose(el);
  const target = { ...ID, ...to };
  if (reduced()) return play(el, [target, target], 0.001);
  const { frames, dur } = springPath(from, target, o);
  return play(el, frames, dur, 'linear', o.delay ?? 0, o.fill ?? (o.delay ? 'both' : 'forwards'));
}

/** Quick eased move (no overshoot) — for the press-down squash. */
function easeTo(el, to, dur = 0.09) {
  const from = livePose(el);
  const target = { ...ID, ...to };
  return play(el, [from, target], dur, 'cubic-bezier(.2,.9,.3,1)');
}

const PRESSABLE = new WeakSet();
/**
 * Press squash, release overshoot and hover lift for a tappable element.
 * o: { press: pose (default squashes wide + short), hover: pose, release: spring opts }
 */
export function pressable(el, o = {}) {
  if (!el || PRESSABLE.has(el) || !canAdd()) return el;
  PRESSABLE.add(el);
  const press = { ...ID, sx: 1.06, sy: 0.88, y: 2, ...(o.press ?? {}) };
  const hover = { ...ID, sx: 1.04, sy: 1.04, y: -3, ...(o.hover ?? {}) };
  const rel = { stiffness: 620, damping: 15, ...(o.release ?? {}) };
  let down = false, over = false;
  const rest = () => (over ? hover : ID);
  el.addEventListener('pointerdown', (e) => {
    if (e.button > 0 || el.classList.contains('disabled')) return;
    down = true;
    easeTo(el, press, 0.08);
  });
  const up = () => {
    if (!down) return;
    down = false;
    // pop back past rest with a little vertical kick
    springTo(el, rest(), { ...rel, v0: { sy: 5.5, sx: -3.5, y: -60 } });
  };
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('pointerleave', (e) => {
    if (down) up();
    if (e.pointerType === 'mouse' && over) { over = false; springTo(el, ID, { stiffness: 380, damping: 20 }); }
  });
  el.addEventListener('pointerenter', (e) => {
    if (e.pointerType !== 'mouse' || down) return;
    over = true;
    springTo(el, hover, { stiffness: 420, damping: 17 });
  });
  return el;
}

/**
 * Staggered spring entrance. els: elements (nulls / hidden ones skipped).
 * o: { from: pose, delay (s), step (s), fade (bool), spring opts }
 */
export function enter(els, o = {}) {
  if (!canAdd() || reduced()) return;
  const from = { ...ID, ...(o.from ?? { y: 40, sx: 0.8, sy: 0.8 }) };
  let i = 0;
  for (const el of els) {
    if (!el || !el.isConnected || el.offsetParent === null) continue;
    const delay = (o.delay ?? 0) + i * (o.step ?? 0.05);
    i++;
    const { frames, dur } = springPath(from, ID, { stiffness: o.stiffness ?? 300, damping: o.damping ?? 17 });
    play(el, frames, dur, 'linear', delay, 'both');
    if (o.fade !== false) el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: Math.min(260, dur * 600), delay: delay * 1000, fill: 'backwards', easing: 'ease-out' });
  }
}

/** Arena banner browse: the content kicks in from the side it came from. */
export function slideSwap(el, dir) {
  if (!el || !canAdd() || reduced()) return;
  springTo(el, ID, { from: { x: dir * 46, sx: 0.9, sy: 1.08, r: dir * 2 }, stiffness: 420, damping: 16 });
  el.animate([{ opacity: 0.2 }, { opacity: 1 }], { duration: 180, easing: 'ease-out' });
}

/** A single elastic pop (new vial in a slot, badge change...). */
export function pop(el, amount = 0.3) {
  if (!el || !canAdd() || reduced()) return;
  springTo(el, ID, { from: { sx: 1 - amount, sy: 1 - amount }, stiffness: 520, damping: 13 });
}

/** Slide a nav indicator to a button (spring + squash-stretch while it travels). */
export function slideIndicator(ind, btn, instant = false) {
  if (!ind || !btn) return;
  const x = btn.offsetLeft, w = btn.offsetWidth;
  ind.style.width = w + 'px';
  ind.style.top = btn.offsetTop + 'px';
  ind.style.height = btn.offsetHeight + 'px';
  const prevX = ind._x;
  ind._x = x;
  ind.style.left = x + 'px';
  if (instant || prevX === undefined || !canAdd() || reduced()) return;
  const dx = prevX - x;
  if (Math.abs(dx) < 1) return;
  // starts where it was, stretched along the travel, and springs into place
  springTo(ind, ID, { from: { x: dx, sx: 1.18, sy: 0.86 }, stiffness: 340, damping: 19 });
}

/**
 * Tab screens: a carousel. dir = +1 / -1 slides sideways (the old screen and the
 * new one move as one strip), 0 rises up from the dock (leaving the lobby).
 */
const pctFrames = (from, to, o) => springPath({ ...ID, x: from }, { ...ID, x: to }, o);
export function tabIn(el, dir) {
  if (!el || reduced()) return;
  if (dir) {
    const { frames, dur } = pctFrames(dir * 100, 0, { stiffness: 260, damping: 26 });
    el.animate(frames.map((p) => ({ transform: `translateX(${p.x.toFixed(2)}%)` })), { duration: dur * 1000 });
  } else {
    const { frames, dur } = pctFrames(28, 0, { stiffness: 300, damping: 24 });
    el.animate(frames.map((p, i) => ({ transform: `translateY(${p.x.toFixed(2)}%)`, opacity: Math.min(1, 0.15 + (i / frames.length) * 3) })), { duration: dur * 1000 });
  }
}
/** Resolves once the old screen is out of the way. */
export function tabOut(el, dir) {
  if (!el || reduced()) return Promise.resolve();
  let a;
  if (dir) {
    const { frames, dur } = pctFrames(0, -dir * 100, { stiffness: 260, damping: 26 });
    a = el.animate(frames.map((p) => ({ transform: `translateX(${p.x.toFixed(2)}%)`, filter: `brightness(${(1 - Math.abs(p.x) / 260).toFixed(3)})` })), { duration: dur * 1000, fill: 'forwards' });
  } else {
    a = el.animate([{ transform: 'none', opacity: 1 }, { transform: 'translateY(34%)', opacity: 0 }], { duration: 260, easing: 'cubic-bezier(.5,0,.9,.4)', fill: 'forwards' });
  }
  return new Promise((res) => { a.onfinish = res; a.oncancel = res; setTimeout(res, 1600); });
}

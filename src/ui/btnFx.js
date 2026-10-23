// Button feel: every `.btn` in the DOM (button() or hand-built) gets spring-driven
// press / release tweens through one set of delegated pointer listeners.
//   press    - squashes down onto its lip (skin swaps to the pressed frame, the face
//              sinks), icon tucks in, a stepped pixel starburst pops at the finger
//   release  - springs back with an overshoot stretch (jelly), white tap flash,
//              icon bounces + wobbles
//   cancel   - (scrolled away / dragged off) a soft spring back, no flash
//   hover    - desktop only: lifts a pixel and brightens (CSS, ui.css)
//   enable   - setDisabled(btn, false) pops the button + shines it (afford)
// Uses the individual `scale` / `rotate` properties so it composes with any
// `transform` animation a button already has (pulse, breathe...).
import { spring, springFrom, SPRING, seq } from './tween.js';

const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const isOff = (b) => b.disabled || b.classList.contains('disabled');
const SQUASH = [1.065, 0.885];

let held = null; // { b, id, t }

function fxLayer(b) {
  let fx = b.querySelector(':scope > .btn-fx');
  if (!fx) {
    fx = document.createElement('span');
    fx.className = 'btn-fx';
    fx.setAttribute('aria-hidden', 'true');
    b.insertBefore(fx, b.firstChild); // first child: the label (positioned, later in DOM) paints over it
  }
  return fx;
}
const icons = (b) => b.querySelectorAll(':scope > span .pi, :scope > .pi, :scope > span > span .pi');

function ripple(b, x, y) {
  if (reduced()) return;
  const fx = fxLayer(b);
  const r = fx.getBoundingClientRect();
  if (!r.width) return;
  const i = document.createElement('i');
  i.className = 'btn-ripple';
  const size = Math.min(r.width, r.height) * 1.5; // pixel starburst, not a round ripple
  i.style.width = i.style.height = size + 'px';
  i.style.left = (x - r.left) + 'px';
  i.style.top = (y - r.top) + 'px';
  fx.appendChild(i);
  i.animate([{ transform: 'translate(-50%,-50%) scale(0.3) rotate(0deg)', opacity: 1 }, { transform: 'translate(-50%,-50%) scale(1.15) rotate(22.5deg)', opacity: 0 }], { duration: 420, easing: 'steps(7, end)' }).onfinish = () => i.remove();
}
function flash(b) {
  if (reduced()) return;
  const f = document.createElement('i');
  f.className = 'btn-flash';
  fxLayer(b).appendChild(f);
  f.animate([{ opacity: 0.75 }, { opacity: 0 }], { duration: 260, easing: 'cubic-bezier(.2,.7,.3,1)' }).onfinish = () => f.remove();
}

export function pressBtn(b, x, y) {
  b._pressT = performance.now();
  if (isOff(b)) {
    spring(b, 'scale', [1, 1], [0.97, 0.95], { ...SPRING.snappy, hold: true });
    return;
  }
  b.classList.add('pressed');
  spring(b, 'scale', [1, 1], SQUASH, { stiffness: 1400, damping: 46, hold: true });
  for (const ic of icons(b)) spring(ic, 'scale', [1, 1], [0.84, 0.84], { stiffness: 1200, damping: 40, hold: true });
  if (x !== undefined) ripple(b, x, y);
}
export function releaseBtn(b, cancelled = false) {
  b.classList.remove('pressed');
  if (!b.isConnected) return;
  if (cancelled || isOff(b)) {
    springFrom(b, 'scale', [1, 1], SPRING.soft);
    for (const ic of icons(b)) springFrom(ic, 'scale', [1, 1], SPRING.soft);
    return;
  }
  b._relT = performance.now();
  // jelly release: shoots past rest into a stretch, then settles
  springFrom(b, 'scale', [1, 1], { stiffness: 620, damping: 11, velocity: 7 });
  flash(b);
  icons(b).forEach((ic, k) => {
    springFrom(ic, 'scale', [1, 1], { stiffness: 520, damping: 9, velocity: 14 });
    spring(ic, 'rotate', k % 2 ? 14 : -14, 0, { stiffness: 380, damping: 8, delay: 0.02 });
  });
}
/** Full tap (keyboard / programmatic clicks that never got a pointer press). */
export function tapBtn(b) {
  if (!b?.isConnected) return;
  pressBtn(b);
  setTimeout(() => releaseBtn(b), 70);
}
/** Disabled -> enabled: pop + shine so the player notices it's available now. */
export function affordBtn(b) {
  if (!b?.isConnected || reduced()) return;
  spring(b, 'scale', [0.82, 0.82], [1, 1], { stiffness: 520, damping: 10 });
  b.classList.remove('btn-afford');
  void b.offsetWidth;
  b.classList.add('btn-afford');
  setTimeout(() => b.classList.remove('btn-afford'), 900);
}
/** Deny: decaying wobble (complements the shake-x class). */
export function denyBtn(b) {
  if (!b?.isConnected) return;
  seq(b, 'rotate', [0, -5, 4, -2.5, 1.2, 0], { duration: 0.42 });
}

if (typeof window !== 'undefined' && !window.__btnFx) {
  window.__btnFx = true;
  document.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    const b = e.target.closest?.('.btn');
    if (!b) return;
    if (held && held.b !== b) releaseBtn(held.b, true);
    held = { b, id: e.pointerId };
    pressBtn(b, e.clientX, e.clientY);
  }, true);
  const end = (cancel) => (e) => {
    if (!held || (e.pointerId !== undefined && e.pointerId !== held.id)) return;
    const b = held.b;
    held = null;
    // a release outside the button is a cancel (no click will fire)
    let out = cancel;
    if (!out && e.clientX !== undefined) {
      const r = b.getBoundingClientRect(), m = 6;
      out = e.clientX < r.left - m || e.clientX > r.right + m || e.clientY < r.top - m || e.clientY > r.bottom + m;
    }
    releaseBtn(b, out);
  };
  window.addEventListener('pointerup', end(false), true);
  window.addEventListener('pointercancel', end(true), true);
  window.addEventListener('blur', () => { if (held) { releaseBtn(held.b, true); held = null; } });
}

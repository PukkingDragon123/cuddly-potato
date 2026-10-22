// Phone-motion + drag gestures for the vial opening (src/scenes/vialOpen.js).
//
//   requestMotion()  asks for DeviceMotion / DeviceOrientation access (iOS 13+
//                    needs a user gesture: call it from a click / touchend)
//   ShakeInput       strong phone shakes (DeviceMotionEvent) + a fallback of
//                    swiping / dragging back and forth quickly (touch or mouse)
//                    + Space / arrow keys; calls onShake(strength 0..1, source)
//   TiltInput        sideways phone tilt in degrees (DeviceOrientationEvent),
//                    corrected for the screen orientation
import { engine } from '../core/engine.js';

const hasWindow = typeof window !== 'undefined';
export const isTouchDevice = () => hasWindow && (('ontouchstart' in window) || navigator.maxTouchPoints > 0);

let motionState = null; // null = not asked, 'granted' | 'denied' | 'unsupported'
/** Ask for motion + orientation access (only iOS actually prompts). Must run inside a user gesture. */
export async function requestMotion() {
  if (motionState) return motionState;
  if (!hasWindow || typeof DeviceMotionEvent === 'undefined') return (motionState = 'unsupported');
  const ask = async (C) => {
    if (typeof C?.requestPermission !== 'function') return 'granted';
    try {
      return (await C.requestPermission()) === 'granted' ? 'granted' : 'denied';
    } catch (e) {
      return 'denied';
    }
  };
  const [m] = await Promise.all([ask(DeviceMotionEvent), typeof DeviceOrientationEvent !== 'undefined' ? ask(DeviceOrientationEvent) : 'unsupported']);
  motionState = m;
  return m;
}
export const motionAccess = () => motionState;
/** Does this device need an explicit permission prompt for motion (iOS)? */
export const motionNeedsPermission = () => hasWindow && typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function';

/**
 * Shake detection. opts: { el (pointer target), onShake(strength, source), onDrag(dxNorm), onJiggle(k) }
 * Pointer fallback: every quick swing (a fast drag of at least ~7% of the screen in one direction,
 * ending in a reversal or a release) counts as one shake.
 */
export class ShakeInput {
  constructor(opts) {
    this.o = opts;
    this.on = false;
    this.last = 0;
    this.motionSeen = false;
    this.g = null; // gravity estimate for accelerationIncludingGravity
    this.ptr = null;
    this._motion = (e) => this.onMotion(e);
    this._down = (e) => this.onDown(e);
    this._move = (e) => this.onMove(e);
    this._up = (e) => this.onUp(e);
    this._key = (e) => this.onKey(e);
  }
  start() {
    if (this.on) return;
    this.on = true;
    window.addEventListener('devicemotion', this._motion);
    const el = this.o.el;
    el.addEventListener('pointerdown', this._down);
    window.addEventListener('pointermove', this._move, true);
    window.addEventListener('pointerup', this._up, true);
    window.addEventListener('pointercancel', this._up, true);
    window.addEventListener('keydown', this._key);
  }
  stop() {
    if (!this.on) return;
    this.on = false;
    window.removeEventListener('devicemotion', this._motion);
    this.o.el.removeEventListener('pointerdown', this._down);
    window.removeEventListener('pointermove', this._move, true);
    window.removeEventListener('pointerup', this._up, true);
    window.removeEventListener('pointercancel', this._up, true);
    window.removeEventListener('keydown', this._key);
    if (this.ptr) { this.ptr = null; this.o.onDrag?.(0); }
  }
  fire(strength, source) {
    const now = performance.now();
    if (now - this.last < (source === 'motion' ? 330 : 190)) return;
    this.last = now;
    this.o.onShake?.(Math.max(0.35, Math.min(1, strength)), source);
  }
  onMotion(e) {
    let m = null;
    const a = e.acceleration;
    if (a && a.x != null) m = Math.hypot(a.x, a.y ?? 0, a.z ?? 0);
    else {
      const g = e.accelerationIncludingGravity;
      if (!g || g.x == null) return;
      if (!this.g) this.g = { x: g.x, y: g.y, z: g.z };
      const G = this.g;
      G.x += (g.x - G.x) * 0.15; G.y += (g.y - G.y) * 0.15; G.z += (g.z - G.z) * 0.15;
      m = Math.hypot(g.x - G.x, g.y - G.y, g.z - G.z);
    }
    if (m == null || !Number.isFinite(m)) return;
    this.motionSeen = true;
    if (m > 13) this.fire(0.45 + (m - 13) / 22, 'motion');
    else if (m > 4) this.o.onJiggle?.(Math.min(1, m / 13));
  }
  onDown(e) {
    if (e.button != null && e.button > 0) return;
    const now = performance.now();
    const s = Math.min(engine.width, engine.height);
    this.ptr = { id: e.pointerId, x0: e.clientX, ext: e.clientX, extT: now, peak: e.clientX, peakT: now, dir: 0, unit: s };
  }
  onMove(e) {
    const p = this.ptr;
    if (!p || e.pointerId !== p.id) return;
    const now = performance.now();
    const x = e.clientX;
    this.o.onDrag?.(Math.max(-1, Math.min(1, (x - p.x0) / (p.unit * 0.3))));
    if (!p.dir) {
      if (Math.abs(x - p.ext) > 3) { p.dir = Math.sign(x - p.ext); p.peak = x; p.peakT = now; }
      return;
    }
    if (Math.sign(x - p.peak) === p.dir || x === p.peak) { p.peak = x; p.peakT = now; return; }
    if (Math.abs(x - p.peak) < p.unit * 0.02) return;
    // reversal: the swing ext -> peak just ended
    this.swing(p);
    p.ext = p.peak;
    p.extT = p.peakT;
    p.dir = -p.dir;
    p.peak = x;
    p.peakT = now;
  }
  /** Score the swing ext -> peak: big + fast = a shake, smaller = a jiggle. */
  swing(p) {
    const dist = Math.abs(p.peak - p.ext) / p.unit;
    const dur = Math.max(0.03, (p.peakT - p.extT) / 1000);
    const speed = dist / dur; // screen-mins per second
    if (dist >= 0.07 && speed >= 0.5) this.fire(0.4 + Math.min(0.6, speed / 4), 'swipe');
    else if (dist > 0.02) this.o.onJiggle?.(Math.min(1, dist * 6));
  }
  onUp(e) {
    const p = this.ptr;
    if (!p || e.pointerId !== p.id) return;
    if (p.dir) this.swing(p);
    this.ptr = null;
    this.o.onDrag?.(0);
  }
  onKey(e) {
    if (e.repeat) return;
    if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      this.fire(0.8, 'key');
    }
  }
}

/** Sideways phone tilt (degrees, + = top of the screen tipped right). `available` once real readings arrive. */
export class TiltInput {
  constructor() {
    this.deg = 0;
    this.available = false;
    this._o = (e) => this.onOrient(e);
  }
  start() { window.addEventListener('deviceorientation', this._o); }
  stop() { window.removeEventListener('deviceorientation', this._o); }
  onOrient(e) {
    if (e.gamma == null && e.beta == null) return;
    const ang = (screen.orientation?.angle ?? window.orientation ?? 0) | 0;
    let d;
    if (ang === 90) d = -(e.beta ?? 0);
    else if (ang === -90 || ang === 270) d = e.beta ?? 0;
    else d = e.gamma ?? 0;
    if (!Number.isFinite(d)) return;
    this.available = true;
    this.deg = d;
  }
}

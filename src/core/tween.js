// Real-time tween / timer manager. Everything here runs on unscaled time
// so UI and cutscenes stay smooth even during hit-stop or slow-mo.
import { Ease } from './util.js';

const active = [];

class Job {
  constructor(dur, fn, opts = {}) {
    this.dur = Math.max(0.0001, dur);
    this.fn = fn;
    this.t = -(opts.delay || 0);
    this.ease = typeof opts.ease === 'function' ? opts.ease : Ease[opts.ease || 'linear'];
    this.group = opts.group || 'default';
    this.onComplete = opts.onComplete;
    this.done = false;
    this.promise = new Promise((res) => (this._resolve = res));
  }
  step(dt) {
    this.t += dt;
    if (this.t < 0) return;
    const k = Math.min(1, this.t / this.dur);
    this.fn && this.fn(this.ease(k), k);
    if (k >= 1) this.finish();
  }
  finish() {
    if (this.done) return;
    this.done = true;
    this.onComplete && this.onComplete();
    this._resolve();
  }
  cancel() {
    this.done = true;
    this._resolve();
  }
}

/** Calls fn(easedT, rawT) every frame for `dur` seconds. */
export function animate(dur, fn, opts) {
  const j = new Job(dur, fn, opts);
  active.push(j);
  return j;
}

/** Tween numeric properties of target (supports nested via THREE vectors: pass target.position). */
export function tween(target, to, dur, opts = {}) {
  const from = {};
  for (const k in to) from[k] = target[k];
  return animate(
    dur,
    (e) => {
      for (const k in to) target[k] = from[k] + (to[k] - from[k]) * e;
      opts.onUpdate && opts.onUpdate(e);
    },
    opts,
  );
}

export function wait(sec, group) {
  return animate(sec, null, { group }).promise;
}

export function after(sec, fn, group) {
  const j = animate(sec, null, { group, onComplete: fn });
  return j;
}

export function clearGroup(group) {
  for (const j of active) if (j.group === group) j.cancel();
}

export function updateTweens(dt) {
  for (let i = 0; i < active.length; i++) {
    const j = active[i];
    if (!j.done) j.step(dt);
  }
  // compact
  let w = 0;
  for (let i = 0; i < active.length; i++) if (!active[i].done) active[w++] = active[i];
  active.length = w;
}

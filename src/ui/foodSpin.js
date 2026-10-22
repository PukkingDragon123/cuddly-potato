// Spinning 3D food for the FOOD SEASON pass: each food (models/props/feast.js) is
// rendered once as a turntable sprite strip (N frames, the plate rendered
// separately so the food turns ON its plate under fixed studio lights), then
// played back with a stepped CSS animation - real 3D look, zero per-frame GPU.
//
//   const el = foodSpin('burger', { plate: 'plate' | 'premium' | 'gold', gold: false, size: 144 });
//   spinBurst(el)      // tap: spins up fast + hops, then winds back down
//
// Strips are generated lazily, a few frames per animation frame, visible ones first.
import * as THREE from 'three';
import { engine } from '../core/engine.js';
import { makeFeast, makePlate, FEAST_SCALE } from '../models/props/feast.js';
import { spring, hop, SPRING } from './tween.js';

const N = 24; // frames per turn
const PITCH = 0.36;
const BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
const strips = new Map(); // key -> { url, plate, done, waiters: [] , job }
const queue = [];
let pumping = false;
// dev hook (tests drive the queue directly; headless GL makes rAF crawl)
if (import.meta.env?.DEV && typeof window !== "undefined") window.__fsp = { queue, pump: () => pump() };

/** Invisible box that fixes the camera framing for every frame of a strip (Box3 ignores visibility). */
function marker(r, top) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(r * 2, top, r * 2), new THREE.MeshBasicMaterial());
  m.position.y = top / 2;
  m.visible = false;
  return m;
}

function makeJob(key, kind, o) {
  const size = o.size ?? 144;
  const plate = makePlate(o.plate ?? 'plate');
  const food = makeFeast(kind, { gold: !!o.gold });
  // one fixed frame for every dish (plates all render the same size); tall food is scaled to fit it
  const pb = new THREE.Box3().setFromObject(plate);
  const r = pb.isEmpty() ? 0.36 : Math.max(pb.max.x, pb.max.z) * 1.04;
  const top = (pb.isEmpty() ? 0 : plate.userData.top) + (o.plate === 'gold' ? 0.62 : pb.isEmpty() ? 0.72 : 0.6);
  const fb0 = new THREE.Box3().setFromObject(food);
  let fr = 0;
  for (const x of [fb0.min.x, fb0.max.x]) for (const z of [fb0.min.z, fb0.max.z]) fr = Math.max(fr, Math.hypot(x, z));
  const room = top - plate.userData.top;
  const sc = Math.min(FEAST_SCALE[kind] ?? 1, room / Math.max(0.01, fb0.max.y), (r * 1.08) / Math.max(0.01, fr));
  food.scale.setScalar(sc);
  food.position.y = plate.userData.top;
  const canvas = document.createElement('canvas');
  canvas.width = size * N;
  canvas.height = size;
  const none = o.plate === 'none';
  if (none) strips.get(key).plate = BLANK;
  return { key, size, plate, food, r, top, canvas, f: none ? 0 : -1, els: [], entry: strips.get(key) };
}

function renderFrame(job) {
  const holder = new THREE.Group();
  holder.add(marker(job.r, job.top));
  // yaw 0: the framing box stays axis-aligned (no 45-degree growth); the food turns inside it
  const opts = { size: job.size, yaw: 0, pitch: PITCH, zoom: 0.84 };
  if (job.f < 0) {
    holder.add(job.plate);
    job.entry.plate = engine.renderThumb(holder, opts);
    holder.remove(job.plate);
  } else {
    const spin = new THREE.Group();
    spin.add(job.food);
    spin.rotation.y = (job.f / N) * Math.PI * 2;
    holder.add(spin);
    engine.renderThumb(holder, opts);
    const src = engine.thumbRenderer?.domElement;
    if (src) job.canvas.getContext('2d').drawImage(src, job.f * job.size, 0, job.size, job.size);
    spin.remove(job.food);
  }
  job.f++;
  for (const el of job.entry.els) if (job.f === 0) applyPlate(el, job.entry);
}

function finish(job) {
  const e = job.entry;
  const done = (url) => {
    e.url = url;
    e.done = true;
    for (const el of e.els) applyStrip(el, e);
    e.els.length = 0;
  };
  if (job.canvas.toBlob) job.canvas.toBlob((b) => done(b ? URL.createObjectURL(b) : job.canvas.toDataURL()), 'image/png');
  else done(job.canvas.toDataURL());
}

function visible(job) {
  const vh = innerHeight, vw = innerWidth;
  return job.entry.els.some((el) => {
    if (!el.isConnected) return false;
    const r = el.getBoundingClientRect();
    return r.bottom > -60 && r.top < vh + 60 && r.right > 0 && r.left < vw && r.width > 0;
  });
}
function pump() {
  const t0 = performance.now();
  while (queue.length && performance.now() - t0 < 9) {
    // visible strips first, then any on the page, then the rest (a dozen strips at most, all cached)
    let i = queue.findIndex(visible);
    if (i < 0) i = queue.findIndex((j) => j.entry.els.some((el) => el.isConnected));
    if (i < 0) i = 0;
    const job = queue[i];
    try { renderFrame(job); } catch (err) { console.warn('food spin', job.key, err); job.f = N; }
    if (job.f >= N) { queue.splice(i, 1); finish(job); }
  }
  if (queue.length) requestAnimationFrame(pump);
  else pumping = false;
}

function applyPlate(el, e) {
  if (e.plate) el.querySelector('.fsp-plate').src = e.plate;
}
function applyStrip(el, e) {
  applyPlate(el, e);
  const im = el.querySelector('.fsp-strip');
  im.src = e.url;
  el.classList.add('ready');
}

/** A spinning food on its plate (sized by CSS: width of .fsp; square). */
export function foodSpin(kind, o = {}) {
  const key = `${kind}|${o.plate ?? 'plate'}|${o.gold ? 1 : 0}|${o.size ?? 144}`;
  const el = document.createElement('div');
  el.className = `fsp k-${kind}${o.gold ? ' gold' : ''} ${o.cls ?? ''}`;
  el.style.setProperty('--n', N);
  el.innerHTML = `<i class="fsp-shadow"></i><img class="fsp-plate" alt="" draggable="false" src="${BLANK}"><div class="fsp-food"><img class="fsp-strip" alt="" draggable="false" src="${BLANK}"></div>`;
  // desync neighbours so a column of plates doesn't spin in lockstep
  el.querySelector('.fsp-strip').style.animationDelay = `-${(Math.random() * 3).toFixed(2)}s`;
  let e = strips.get(key);
  if (e?.done) { applyStrip(el, e); return el; }
  if (!e) {
    e = { url: null, plate: null, done: false, els: [] };
    strips.set(key, e);
    queue.push(makeJob(key, kind, o));
  }
  if (e.plate) applyPlate(el, e);
  e.els.push(el);
  if (!pumping) { pumping = true; requestAnimationFrame(pump); }
  return el;
}

/** Tap juice: fast spin that winds down, a hop with a squash landing. */
export function spinBurst(el, o = {}) {
  const strip = el?.querySelector('.fsp-strip');
  const food = el?.querySelector('.fsp-food');
  if (!strip || !food) return;
  const a = strip.getAnimations?.()[0];
  if (a) {
    const t0 = performance.now(), dur = o.dur ?? 1400, peak = o.speed ?? 9;
    cancelAnimationFrame(el._spinRaf);
    const step = (now) => {
      const k = Math.min(1, (now - t0) / dur);
      const rate = 1 + (peak - 1) * Math.pow(1 - k, 2.2);
      try { a.updatePlaybackRate ? a.updatePlaybackRate(rate) : (a.playbackRate = rate); } catch (err) { /* finished */ }
      if (k < 1) el._spinRaf = requestAnimationFrame(step);
    };
    el._spinRaf = requestAnimationFrame(step);
  }
  hop(food, o.hop ?? 26, 0.7);
  spring(food, 'scale', [1.25, 0.78], [1, 1], SPRING.jelly);
  const pl = el.querySelector('.fsp-plate');
  if (pl) spring(pl, 'scale', [1.12, 0.86], [1, 1], { stiffness: 500, damping: 12, delay: 0.05 });
}

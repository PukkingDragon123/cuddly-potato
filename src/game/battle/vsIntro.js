// Battle VS intro (~2.5 s, tap to skip): a cinematic split-screen slam.
//
//  * two team panels (you: blue, rival: red) cut along a diagonal seam race in
//    from opposite sides and SLAM together (flash, screen shake, bass hit)
//  * both Commanders are the real 3D chibis, rendered live by the shared
//    Stage3D renderer, each clipped to its own panel (one clipping-plane pass
//    per character) so they ride in with their panel, then strike a pose
//  * "VS" slams in on the seam with crackling procedural lightning, light
//    sweeps cross the panels, names + trophies + Lab level slide in, the arena
//    name sits in the letterbox bar
//  * then the panels split apart to reveal the battlefield
//
// vsIntro(parent, cfg, { hold, arena }) -> Promise (resolves when the intro is gone)
import './vsIntro.css';
import * as THREE from 'three';
import { h, icon } from '../../ui/ui.js';
import { audio } from '../../core/audio.js';
import { engine } from '../../core/engine.js';
import { Chibi } from '../../core/chibi.js';
import { CHARACTERS } from '../../data/characters.js';
import { Stage3D } from '../../ui/stage3d.js';

const TEAM = ['#2b8cf2', '#f23a4a'];
const easeIn = (k) => k * k * k;
const easeOut = (k) => 1 - Math.pow(1 - k, 3);
const clamp01 = (k) => (k < 0 ? 0 : k > 1 ? 1 : k);
const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Little procedural SFX built from the audio engine's tone / noise voices. */
function sfx(fn) {
  if (!audio.ctx || audio.muted) return;
  try { fn(audio); } catch (e) { /* audio is optional */ }
}
const SND = {
  riser: () => sfx((a) => {
    a.tone({ type: 'sawtooth', f0: 70, f1: 320, dur: 0.32, vol: 0.05, lp: 1400, curve: 'lin' });
    a.noise({ dur: 0.32, vol: 0.09, type: 'bandpass', f0: 400, f1: 3200, q: 1.2, attack: 0.25 });
  }),
  slam: () => sfx((a) => {
    a.thump(120, 32, 0.5, 0.55);
    a.noise({ dur: 0.5, vol: 0.3, type: 'lowpass', f0: 2600, f1: 120, attack: 0.002 });
    a.tone({ type: 'square', f0: 98, f1: 49, dur: 0.35, vol: 0.06, lp: 700 });
  }),
  crack: () => sfx((a) => {
    for (let i = 0; i < 5; i++) a.noise({ dur: 0.05, vol: 0.12, type: 'highpass', f0: 3000 + i * 600, attack: 0.001, delay: i * 0.028 });
    a.tone({ type: 'sawtooth', f0: 1800, f1: 140, dur: 0.22, vol: 0.06, lp: 5000 });
  }),
  sting: () => sfx((a) => {
    a.tone({ type: 'sawtooth', f0: 196, dur: 0.5, vol: 0.05, lp: 2200, hold: 0.15 });
    a.tone({ type: 'sawtooth', f0: 293.7, dur: 0.5, vol: 0.04, lp: 2200, hold: 0.15, detune: 7 });
    a.tone({ type: 'triangle', f0: 392, dur: 0.4, vol: 0.05 });
  }),
};

// The diagonal seam between the panels (normalised screen coords, y down).
function layout(portrait) {
  return portrait
    ? {
      seam: [[0, 0.545], [1, 0.455]],
      dir: [[-1.15, 0.12], [1.15, -0.12]], // panel slide-in directions (you come from the left, the rival from the right)
      feet: [[0.31, 0.97], [0.69, 0.61]],
      frac: [0.42, 0.42],
      yaw: [0.42, -0.42],
    }
    : {
      seam: [[0.545, 0], [0.455, 1]],
      dir: [[-1.1, 0], [1.1, 0]],
      feet: [[0.3, 1.06], [0.7, 1.06]],
      frac: [0.78, 0.78],
      yaw: [0.5, -0.5],
    };
}

function cmdDef(s) {
  const c = s?.commander;
  if (!c) return null;
  const base = CHARACTERS[c.char ?? c.id];
  return base ? { ...base, ...(c.override ?? {}) } : null;
}

// ---------------------------------------------------------------------------
// Lightning (SVG polylines regenerated every few frames)

function boltPath(x0, y0, x1, y1, jag, segs) {
  const pts = [[x0, y0]];
  const dx = x1 - x0, dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  for (let i = 1; i < segs; i++) {
    const k = i / segs;
    const off = (Math.random() - 0.5) * 2 * jag * Math.sin(k * Math.PI);
    pts.push([x0 + dx * k + nx * off, y0 + dy * k + ny * off]);
  }
  pts.push([x1, y1]);
  return pts.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
}

// ---------------------------------------------------------------------------

export async function vsIntro(parent, cfg, opts = {}) {
  const W = window.innerWidth, H = window.innerHeight;
  const portrait = H > W;
  const L = layout(portrait);
  const sides = [cfg.sides[0] ?? {}, cfg.sides[1] ?? {}];
  const arena = opts.arena;
  const hold = Math.max(900, opts.hold ?? 2000);
  const T_SLAM = 0.3, T_OUT = T_SLAM + hold / 1000 - 0.1, T_END = T_OUT + 0.38;
  const calm = reduced();

  // ---- DOM
  const info = (s, i) => {
    const pills = [];
    if (s.trophies !== undefined && s.trophies !== null) pills.push(h('span', { class: 'vsx-pill tr sk-well' }, icon('trophy'), h('b', {}, String(s.trophies))));
    if (s.labLevel) pills.push(h('span', { class: 'vsx-pill lv sk-well' }, icon('lab'), h('b', {}, `LV ${s.labLevel}`)));
    return h('div', { class: `vsx-info s${i}` },
      h('div', { class: `vsx-tag ${i ? 'sk-chip-red' : 'sk-chip-blue'}` }, i ? (s.clan || 'CHALLENGER') : 'YOU'),
      h('div', { class: 'vsx-nm', style: { '--nk': String(Math.min(1, 9 / Math.max(9, (s.name ?? '').length))) } }, s.name ?? (i ? 'Rival' : 'You')),
      pills.length ? h('div', { class: 'vsx-pills' }, pills) : null);
  };
  const panel = (i) => h('div', { class: `vsx-panel s${i}`, style: { '--tc': TEAM[i] } },
    h('i', { class: 'vsx-fill' }), h('i', { class: 'px-rays w vsx-rays' }), h('i', { class: 'vsx-lines' }), h('i', { class: 'vsx-sweep' }), h('i', { class: 'vsx-edge' }));
  const panels = [panel(0), panel(1)];
  const stageHost = h('div', { class: 'vsx-stage' });
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('class', 'vsx-bolts');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  const bolts = [];
  for (let k = 0; k < 7; k++) {
    const g = document.createElementNS(svgNS, 'g');
    const glow = document.createElementNS(svgNS, 'polyline');
    glow.setAttribute('class', 'gl');
    const core = document.createElementNS(svgNS, 'polyline');
    core.setAttribute('class', 'co');
    g.append(glow, core);
    svg.appendChild(g);
    bolts.push({ g, glow, core });
  }
  const vs = h('div', { class: 'vsx-vs' }, h('span', { class: 'v' }, 'V'), h('span', { class: 's' }, 'S'));
  const infos = [info(sides[0], 0), info(sides[1], 1)];
  const arenaEl = arena ? h('div', { class: 'vsx-arena' }, h('small', {}, opts.boss ? 'BOSS BATTLE' : 'ARENA'), h('span', {}, arena.name)) : null;
  const root = h('div', { class: `vsx ${portrait ? 'portrait' : 'landscape'}` },
    h('i', { class: 'vsx-bg' }),
    panels[1], panels[0], stageHost, svg,
    h('i', { class: 'vsx-seam' }),
    infos[1], infos[0], vs,
    h('i', { class: 'vsx-bar t' }, arenaEl), h('i', { class: 'vsx-bar b' }, h('span', { class: 'vsx-skip' }, 'TAP TO SKIP')),
    h('i', { class: 'vsx-flash' }));
  // seam geometry for the CSS (clip-paths, the glowing seam line, the VS position)
  const [[ax, ay], [bx, by]] = L.seam;
  root.style.setProperty('--sa', `${ax * 100}% ${ay * 100}%`);
  const angle = Math.atan2((by - ay) * H, (bx - ax) * W);
  root.style.setProperty('--ang', angle + 'rad');
  parent.appendChild(root);

  // ---- 3D: both Commanders, each clipped to its own panel
  const stage = new Stage3D({ fov: 26, maxPixels: 1.6e6, rimA: 0x5ab4ff, rimB: 0xff5a6a, rimI: 3.2, key: 2.7 });
  stage.camera.position.set(0, 1.2, 12);
  stage.camera.lookAt(0, 1.2, 0);
  const chars = [0, 1].map((i) => {
    const def = cmdDef(sides[i]);
    if (!def) return null;
    try {
      const ch = new Chibi(def, { fidget: false });
      ch.play('idle');
      if (i === 0) ch.expr('determined', 'grin'); else ch.expr('angry', 'smirk');
      stage.add(ch.root);
      return ch;
    } catch (e) { return null; }
  });
  // sweeping key light
  const sweep = new THREE.PointLight(0xffffff, 0, 9, 1.4);
  stage.add(sweep);
  const planes = [new THREE.Plane(), new THREE.Plane()];
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _p = new THREE.Vector3();
  let offs = [1, 1];
  const visH = () => 2 * stage.camera.position.z * Math.tan(THREE.MathUtils.degToRad(stage.camera.fov / 2));
  const place = () => {
    const cam = stage.camera;
    cam.updateMatrixWorld();
    for (let i = 0; i < 2; i++) {
      const o = offs[i];
      const [dx, dy] = L.dir[i];
      // clip plane through the camera and this panel's (shifted) seam edge
      stage.screenToWorld(ax + dx * o, ay + dy * o, 0, _a);
      stage.screenToWorld(bx + dx * o, by + dy * o, 0, _b);
      _c.copy(cam.position);
      planes[i].setFromCoplanarPoints(_c, _a, _b);
      // keep the side's own region positive
      const inside = i === 0 ? (portrait ? [0.5, 0.95] : [0.05, 0.5]) : (portrait ? [0.5, 0.05] : [0.95, 0.5]);
      stage.screenToWorld(inside[0] + dx * o, inside[1] + dy * o, 0, _p);
      if (planes[i].distanceToPoint(_p) < 0) planes[i].negate();
      const ch = chars[i];
      if (!ch) continue;
      const [fx, fy] = L.feet[i];
      stage.screenToWorld(fx + dx * o, fy + dy * o, 0, _p);
      ch.root.position.copy(_p);
      ch.root.scale.setScalar((L.frac[i] * visH()) / ch.height);
      ch.root.rotation.y = L.yaw[i];
    }
  };
  stage.renderFn = (R, scene, cam) => {
    R.autoClear = false;
    R.clear();
    for (let i = 0; i < 2; i++) {
      if (!chars[i]) continue;
      for (let j = 0; j < 2; j++) if (chars[j]) chars[j].root.visible = i === j;
      R.clippingPlanes = [planes[i]];
      R.render(scene, cam);
    }
    for (const c of chars) if (c) c.root.visible = true;
  };
  stage.onResize = () => place();

  // ---- timeline
  let t = 0, skipped = false, slammed = false, posed = false, vsIn = false, outStarted = false, boltT = 0;
  let resolveDone;
  const done = new Promise((r) => (resolveDone = r));
  const setPanel = (i, o) => {
    const [dx, dy] = L.dir[i];
    panels[i].style.transform = `translate(${(dx * o * 100).toFixed(2)}%, ${(dy * o * 100).toFixed(2)}%)`;
  };
  const drawBolts = (power) => {
    const cx = (ax + bx) / 2 * W, cy = (ay + by) / 2 * H;
    const ux = Math.cos(angle), uy = Math.sin(angle);
    bolts.forEach((b, k) => {
      if (power <= 0 || (k > 2 && Math.random() < 0.4)) { b.g.style.opacity = '0'; return; }
      b.g.style.opacity = String(Math.min(1, power));
      let x0 = cx, y0 = cy, x1, y1;
      if (k < 2) { // along the seam, both ways
        const s = k ? 1 : -1;
        const reach = (portrait ? W : H) * (0.55 + Math.random() * 0.15);
        x1 = cx + ux * s * reach; y1 = cy + uy * s * reach;
      } else { // short arcs crackling off the VS
        const a = Math.random() * Math.PI * 2;
        const r = Math.min(W, H) * (0.12 + Math.random() * 0.12);
        x0 = cx + Math.cos(a) * r * 0.25; y0 = cy + Math.sin(a) * r * 0.25;
        x1 = cx + Math.cos(a) * r; y1 = cy + Math.sin(a) * r;
      }
      const d = boltPath(x0, y0, x1, y1, k < 2 ? 22 : 10, k < 2 ? 14 : 6);
      b.glow.setAttribute('points', d);
      b.core.setAttribute('points', d);
    });
  };
  const slam = () => {
    slammed = true;
    root.classList.add('slam');
    SND.slam();
    audio.play('hitHeavy', { pitch: 0.7 });
    engine.shake(0.45);
    for (const c of chars) c?.boing(-0.4);
  };
  const showVs = () => {
    vsIn = true;
    root.classList.add('vs-in');
    SND.crack();
    audio.play('zap', { pitch: 0.8 });
    setTimeout(() => !skipped && SND.sting(), 120);
  };
  const pose = () => {
    posed = true;
    const you = chars[0], riv = chars[1];
    if (you) { you.react(opts.youPose ?? 'fistPump', { dur: 2 }); you.mood('determined'); }
    if (riv) { riv.react(opts.rivalPose ?? ['taunt', 'crossArms', 'flex', 'angry'][Math.floor(Math.random() * 4)], { dur: 2 }); }
    audio.play('stamp', { pitch: 0.9 });
  };
  const startOut = () => {
    if (outStarted) return;
    outStarted = true;
    t = Math.max(t, T_OUT);
    root.classList.add('out');
    audio.play('whoosh', { pitch: 1.25 });
  };
  const finish = () => {
    if (!root.isConnected) return;
    stage.dispose();
    root.remove();
    resolveDone();
  };

  stage.onUpdate((dt) => {
    t += dt;
    // dev: window.__vsFreeze = seconds pins the timeline (screenshots on slow machines)
    if (import.meta.env.DEV && typeof window.__vsFreeze === 'number') t = window.__vsFreeze;
    // panel offsets: race in, slam, settle, hold (slow drift), split apart
    let o;
    if (t < T_SLAM) o = 1 - easeIn(clamp01(t / T_SLAM));
    else if (t < T_OUT) {
      const k = t - T_SLAM;
      o = -0.035 * Math.exp(-k * 9) * Math.cos(k * 26) - 0.012 * clamp01(k / 1.6);
    } else o = -0.012 + easeIn(clamp01((t - T_OUT) / (T_END - T_OUT))) * 1.25;
    offs = [o, o];
    setPanel(0, o);
    setPanel(1, o);
    if (!slammed && t >= T_SLAM) slam();
    if (!vsIn && t >= T_SLAM + 0.05) showVs();
    if (!posed && t >= T_SLAM + 0.45) pose();
    if (!outStarted && t >= T_OUT) startOut();
    // slow push-in during the hold
    const push = clamp01((t - T_SLAM) / (T_OUT - T_SLAM));
    stage.camera.position.z = 12 - easeOut(push) * 0.9;
    stage.camera.position.x = Math.sin(t * 0.9) * 0.05;
    // light sweep across the models
    const sw = ((t - T_SLAM) % 1.3) / 1.3;
    sweep.intensity = t > T_SLAM ? 30 * Math.sin(sw * Math.PI) : 0;
    sweep.position.set((sw - 0.5) * 14, 3, 3);
    for (const c of chars) c?.update(Math.min(dt, 1 / 30));
    place();
    // lightning flicker: strong at the VS slam, then crackles now and then
    boltT -= dt;
    if (boltT <= 0) {
      boltT = 0.06;
      const since = t - (T_SLAM + 0.05);
      const pw = calm || since < 0 || outStarted ? 0 : since < 0.45 ? 1 : Math.random() < 0.22 ? 0.85 : 0;
      drawBolts(pw);
    }
    if (t >= T_END) finish();
  });
  stage.mount(stageHost);
  setPanel(0, 1);
  setPanel(1, 1);
  place();
  stage.start();
  SND.riser();
  audio.play('whoosh', { pitch: 0.75 });

  // tap to skip (straight to the split)
  root.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    if (skipped) return;
    skipped = true;
    if (!slammed) { t = T_SLAM; slam(); }
    startOut();
  });
  // safety net: never block the battle if frames stall
  const safety = () => { if (import.meta.env.DEV && typeof window.__vsFreeze === 'number') setTimeout(safety, 1000); else finish(); };
  setTimeout(safety, (T_END + 2.5) * 1000);
  return done;
}

// Battle ENTRANCE tile art: a rendered 3D still of the entrance itself. Your Commander (in their
// current outfit) mid-pose at the end of the real cinematic (entranceCine.js + entranceSets.js):
// the set piece's own props, sprites and FX, on a little themed stage (a floor that fades into a
// backdrop glowing in the entrance's colour, a coloured rim light), framed for a wide tile.
//
// The cinematic runs headless and silent on a private scene, stepped over a few frames up to the
// pose, then the scene is drawn once with the thumbnail renderer (engine.drawScene: its own
// WebGL context, shaders compiled async) and PNG-encoded off the main thread. One still at a
// time (a queue), only for tiles near the viewport (thumbs.js lazyImg), cached per entrance +
// Commander look + size. Used by the shop, the pass and reward popups (common.js rewardArt).
import * as THREE from 'three';
import './entranceThumb.css';
import { h } from './ui.js';
import { engine } from '../core/engine.js';
import { audio } from '../core/audio.js';
import { entranceDef } from '../data/entrances.js';
import { CHARACTERS } from '../data/characters.js';
import { lazyImg } from './thumbs.js';
import { state } from '../game/state.js';

const TW = 384, TH = 200; // render size (2x a phone tile, cropped to fit by CSS)
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/**
 * Per-entrance framing tweaks: centre offsets / window size in Commander heights, camera angles,
 * and `t` (seconds into the set piece) for the ones whose best moment is mid-action, not the pose.
 */
const FRAME = {
  boxSneak: { t: 2.62, w: 3.8, hh: 2.6, dy: 0.45 },
  labExplosion: { t: 1.85, w: 3.8, hh: 2.1, dy: 0.1 },
  glitchTeleport: { t: 1.5, w: 3.6, hh: 2.1, dy: 0.1 },
  rocketDrop: { t: 1.95, w: 4.4, hh: 2.4, dy: 0.2 },
  redCarpet: { w: 4.2, hh: 2.2, yaw: 0.22 },
  wallBurst: { t: 1.22, w: 4.2, hh: 2.3, dy: 0.15, yaw: 0.26 },
  heliDrop: { t: 1.75, w: 7.5, hh: 4.4, dy: 2.7, pitch: -0.08, yaw: 0.22 },
  jetpack: { t: 2.05, w: 3.8, hh: 2.3, dy: 0.45 },
  limo: { w: 5, hh: 2.6, du: 0.5, dy: 0.15, yaw: 0.2 },
  moneyRain: { w: 4, hh: 2.2, dy: 0.1 },
  hypeParade: { w: 4.6, hh: 2.5, dy: 0.2, yaw: 0.24 },
};

let loadP = null;
const load = () => (loadP ??= Promise.all([
  import('../game/battle/entranceCine.js'),
  import('../game/battle/entranceSets.js'),
  import('../core/chibi.js'),
  import('../game/battle/loadout.js'),
]).then(([cine, sets, chibi, lo]) => ({ ...cine, ...sets, ...chibi, ...lo })));

// ---------------------------------------------------------------------------- the little set

const hexRgb = (c) => new THREE.Color(c);
function gradTex(e) {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 128;
  const g = c.getContext('2d');
  const ec = hexRgb(e.color);
  const top = new THREE.Color(0x0b0d2a), mid = new THREE.Color(0x1d1650).lerp(ec, 0.18), low = new THREE.Color(0x221a58).lerp(ec, 0.55);
  const gr = g.createLinearGradient(0, 0, 0, 128);
  gr.addColorStop(0, top.getStyle());
  gr.addColorStop(0.55, mid.getStyle());
  gr.addColorStop(1, low.getStyle());
  g.fillStyle = gr;
  g.fillRect(0, 0, 4, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
/** Stage floor: a chequer that fades out into the backdrop's horizon colour. */
function floorTex(e) {
  const N = 256, c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d');
  const ec = hexRgb(e.color);
  const a = new THREE.Color(0x232a52).lerp(ec, 0.12), b = new THREE.Color(0x1a1f3c).lerp(ec, 0.08);
  const T = 16;
  for (let y = 0; y < N; y += T) for (let x = 0; x < N; x += T) { g.fillStyle = ((x + y) / T) & 1 ? a.getStyle() : b.getStyle(); g.fillRect(x, y, T, T); }
  // a pool of the entrance's light in the middle, darkness round the edge
  const rg = g.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2);
  rg.addColorStop(0, `rgba(${(ec.r * 255) | 0},${(ec.g * 255) | 0},${(ec.b * 255) | 0},0.32)`);
  rg.addColorStop(0.35, 'rgba(0,0,0,0)');
  g.fillStyle = rg;
  g.fillRect(0, 0, N, N);
  const low = new THREE.Color(0x221a58).lerp(ec, 0.55);
  const fade = g.createRadialGradient(N / 2, N / 2, N * 0.18, N / 2, N / 2, N / 2);
  fade.addColorStop(0, `rgba(${(low.r * 255) | 0},${(low.g * 255) | 0},${(low.b * 255) | 0},0)`);
  fade.addColorStop(1, `rgba(${(low.r * 255) | 0},${(low.g * 255) | 0},${(low.b * 255) | 0},1)`);
  g.fillStyle = fade;
  g.fillRect(0, 0, N, N);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.anisotropy = 4;
  return t;
}
function blobTex() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  rg.addColorStop(0, 'rgba(0,0,0,0.6)');
  rg.addColorStop(0.6, 'rgba(0,0,0,0.3)');
  rg.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = rg;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function buildSet(e, M) {
  const scene = new THREE.Scene();
  const own = []; // textures / materials / geometries to free
  const bg = gradTex(e);
  scene.background = bg;
  own.push(bg);
  // the same light rig shape as the thumbnail studio (1 hemisphere + 3 directional, no shadows),
  // so the toy materials reuse its compiled shaders
  const ec = hexRgb(e.color);
  scene.add(new THREE.HemisphereLight(0xe8f0ff, new THREE.Color(0x3a3060).lerp(ec, 0.3), 1.35));
  const key = new THREE.DirectionalLight(0xfff2e0, 2.5);
  key.position.set(M.x - 3, 7, M.z + 7);
  const rim = new THREE.DirectionalLight(ec.clone().lerp(new THREE.Color(0xffffff), 0.25), 2.6);
  rim.position.set(M.x + 4, 4, M.z - 6);
  const fill = new THREE.DirectionalLight(0xc8dcff, 0.7);
  fill.position.set(M.x + 6, 2, M.z + 5);
  for (const l of [key, rim, fill]) { l.target.position.copy(M); scene.add(l, l.target); }
  const ft = floorTex(e);
  const fm = new THREE.MeshStandardMaterial({ map: ft, roughness: 0.85, metalness: 0 });
  const fg = new THREE.PlaneGeometry(22, 22);
  const floor = new THREE.Mesh(fg, fm);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(M.x, 0, M.z);
  scene.add(floor);
  const bt = blobTex();
  const bm = new THREE.MeshBasicMaterial({ map: bt, transparent: true, depthWrite: false });
  const bgeo = new THREE.PlaneGeometry(1, 1);
  const blob = new THREE.Mesh(bgeo, bm);
  blob.rotation.x = -Math.PI / 2;
  blob.renderOrder = 1;
  scene.add(blob);
  own.push(ft, fm, fg, bt, bm, bgeo);
  return { scene, blob, own };
}

// ---------------------------------------------------------------------------- one still

const cmdKey = (c) => `${c?.char ?? 'recruit'}${c?.override ? JSON.stringify(c.override) : ''}`;

/** Muted while the cinematic runs headless (its events, poses and voice all call audio). */
function silently(fn) {
  const p = audio.play, v = audio.voice;
  audio.play = () => null;
  audio.voice = () => false;
  try { return fn(); } finally { audio.play = p; audio.voice = v; }
}

async function renderStill(id, w, hh) {
  const L = await load();
  const e = entranceDef(id);
  const cmd = L.playerSide().commander;
  await nextFrame();
  try { L.prepSet(e.id); } catch (err) { /* built on the fly */ }
  await nextFrame();
  const camera = new THREE.PerspectiveCamera(30, w / hh, 0.1, 120);
  const B = { x: -5.2, front: -3.5, z1: 1.8, height: 3, seat: V(-5.2, 1.6, 0), seatYaw: 0.55 };
  const M0 = V(B.front + 2.15, 0, 1.45); // the entrance's mark (entranceCine.js M)
  const S = buildSet(e, M0);
  const def = { ...CHARACTERS[cmd?.char ?? 'recruit'], ...(cmd?.override ?? {}) };
  const ch = new L.Chibi(def, { scale: 0.9, fidget: false });
  ch.root.scale.setScalar(0.68); // the battle Commander scale the sets are built around
  S.scene.add(ch.root);
  const host = h('div');
  const stage = {
    scene: S.scene, camera,
    overlay: () => host,
    box: () => ({ left: 0, top: 0, width: w, height: hh }),
    cmd: () => ch,
    base: () => ({ ...B, seat: B.seat.clone() }),
    shake: () => {},
    toScreen: () => ({ x: 0, y: 0, visible: false }),
  };
  const fr = FRAME[e.id] ?? {};
  const still = ({ M, H, shot }) => shot(V(M.x + (fr.du ?? 0) * H, H * (0.56 + (fr.dy ?? 0)), M.z), H * (fr.w ?? 3.4), H * (fr.hh ?? 1.85), { yaw: fr.yaw ?? 0.32, pitch: fr.pitch ?? 0.1, minY: 0.15 });
  const wrap = L.makeWrap(host);
  let ctl = null;
  try {
    ctl = silently(() => L.playEntrance(stage, 0, e.id, { info: { commander: cmd }, wrap, preview: true, still }));
    // run it up to the middle of the first signature pose (turned to camera, props and FX live)
    const target = fr.t ?? ctl.T + 0.6;
    const DT = 1 / 30;
    for (let guard = 0; guard < 600 && !ctl.finished && ctl.t < target;) {
      const t0 = performance.now();
      silently(() => {
        while (guard++ < 600 && !ctl.finished && ctl.t < target && performance.now() - t0 < 6) {
          ch.update(DT / 2);
          ch.update(DT / 2);
          ctl.update(DT);
        }
      });
      if (ctl.t < target && !ctl.finished) await nextFrame();
    }
    if (ctl.finished) throw new Error('entrance still: the cinematic ended early');
    ch.face?.redraw?.();
    const p = ch.root.position;
    S.blob.position.set(p.x, 0.012, p.z);
    S.blob.scale.setScalar(Math.max(0.5, ch.height * ch.root.scale.y * 0.75));
    S.scene.updateMatrixWorld(true);
    const c = await engine.drawScene(S.scene, camera, { w, h: hh });
    return await new Promise((res) => {
      if (typeof c.toBlob !== 'function') return res(c.toDataURL('image/png'));
      c.toBlob((b) => res(b ? URL.createObjectURL(b) : c.toDataURL('image/png')), 'image/png');
    });
  } finally {
    if (ctl && !ctl.finished) silently(() => ctl.skip()); // its props and sprites leave the scene
    ch.root.parent?.remove(ch.root);
    ch.root.traverse((o) => { if (o.geometry && !o.userData.keepGeo) o.geometry.dispose(); });
    ch.face?.texture?.dispose?.();
    for (const o of S.own) o.dispose();
    wrap.remove();
  }
}

// one still at a time (each is a few frames of work); every key renders once per session
let chain = Promise.resolve();
const urls = new Map();
export function entranceStill(id, w = TW, hh = TH) {
  return load().then((L) => {
    const k = `${id}|${cmdKey(L.playerSide().commander)}|${w}x${hh}`;
    if (!urls.has(k)) {
      const job = chain.then(() => renderStill(id, w, hh)).catch((err) => { console.warn('entrance still', id, err); urls.delete(k); return null; });
      chain = job;
      urls.set(k, job);
    }
    return urls.get(k);
  });
}

/** The equipped Commander's look, for the tile's cache key (a new outfit renders new stills). */
function curLook() {
  const cm = state.p?.commanders;
  const cs = cm?.owned?.[cm.equipped];
  return `${cm?.equipped ?? 'recruit'}:${cs?.skin ?? ''}:${cs?.level ?? 1}`;
}

/**
 * Entrance tile art: a framed <img> of the 3D still, rendered when it scrolls near the viewport.
 * cls: extra classes on the frame.
 */
export function entranceArt(id, cls = '') {
  const e = entranceDef(id);
  const img = lazyImg(`ent3|${e.id}|${curLook()}`, () => entranceStill(e.id), 'ent-still', { visible: true });
  return h('div', { class: `ent-art ent-${e.id} ${cls}`, style: { '--ec': e.color } }, img);
}

// Base destroyed: the FINAL BLOW + EXPLOSION cinematic (battle view, real-time choreography).
//
//   watchFinalBlow(view)  every frame (view.update). When the next hit on a base is going to be
//                         its last one (a shot in flight or a swing winding up that carries enough
//                         damage), the battle drops into slow motion (x0.12..0.35) and a low
//                         close-up camera tracks the shot into the base. A hit that turns out not
//                         to be lethal eases back to normal speed.
//   labCollapse(view, s)  on 'towerDown' (view.labDestroyed):
//       0.00 s  IMPACT: freeze-frame on the hit with a slow push-in, a flash, the FINAL BLOW tag
//       0.55 s  the base cracks: glowing voxel seams spread from the hit, the alarm wails, the
//               Commander on the roof panics; time is back to normal
//       1.45 s  BOOM: the base blows apart into big voxel chunks (its own geometry cut up),
//               pixel fireballs / sparks / smoke, a dust wave rolls out along the ground, the
//               Commander is launched off the roof (slide whistle), slow motion again
//       2.4  s  real time; debris bounces and settles, the Commander lands dizzy in the
//               rubble, smoke keeps rising
//       3.9  s  done: resolves (view.fallDone holds the promise; the wrap stays up for the
//               victory / defeat cinematic in endCine.js)
//   Tap to skip. view.replay.frames collects small snapshots of the whole thing for the
//   BEAST NEWS replay (result.js). Debris is capped (<= 30 pieces) and freed with the view.
// Dev: window.__fxSlow = 4 plays the choreography 4x slower.
import * as THREE from 'three';
import { engine } from '../../core/engine.js';
import { particles } from '../../core/particles.js';
import { audio } from '../../core/audio.js';
import { Mats } from '../../core/voxel.js';
import { voiceOf } from '../../data/characters.js';
import { cardDef } from '../../data/cards.js';
import { SWARMS } from '../../data/swarms.js';
import { $overlay, h } from '../../ui/ui.js';
import { hpx } from './hitPix.js';
import { pixSystem } from './pixfx.js';
import { battleStage, makeWrap } from './entranceCine.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp01 = (k) => (k < 0 ? 0 : k > 1 ? 1 : k);
const lerp = (a, b, k) => a + (b - a) * k;
const outC = (k) => 1 - Math.pow(1 - k, 3);
const inOut = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const slowK = () => (typeof window !== 'undefined' && window.__fxSlow) || 1;
const TEAM = [0x2b9cff, 0xff3d55];

// timeline (real seconds after the impact)
const T_CRACK = 0.55, T_BOOM = 1.45, T_REAL = 2.4, T_END = 3.9;
const MAX_FRAMES = 16;

// ---------------------------------------------------------------------------
// camera framing (same model as the entrance cinematics): a w x hh window around `c`

const _f = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3();
function frame(cam, c, w, hh, o = {}) {
  const tan = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
  const d = Math.max(hh / (2 * tan), w / (2 * tan * cam.aspect)) * (o.zoom ?? 1);
  const yaw = o.yaw ?? 0, pitch = o.pitch ?? 0.05;
  const pos = V(c.x + Math.sin(yaw) * Math.cos(pitch) * d, c.y + Math.sin(pitch) * d, c.z + Math.cos(yaw) * Math.cos(pitch) * d);
  pos.y = Math.max(o.minY ?? 0.3, pos.y);
  const look = c.clone();
  const sx = o.sx ?? 0.5, sy = o.sy ?? 0.5;
  if (sx !== 0.5 || sy !== 0.5) {
    _f.subVectors(look, pos).normalize();
    _r.crossVectors(_f, THREE.Object3D.DEFAULT_UP).normalize();
    _u.crossVectors(_r, _f);
    const halfH = d * tan, halfW = halfH * cam.aspect;
    look.addScaledVector(_r, -(2 * sx - 1) * halfW).addScaledVector(_u, (2 * sy - 1) * halfH);
  }
  return { pos, look };
}

/** The sun's shadow box follows the camera's focus while a cinematic owns the camera. */
export function sunAt(view, x) {
  const s = view.sun, d = view.lightDir;
  if (!s || !d) return;
  s.position.set(x + d[0], d[1], d[2]);
  s.target.position.set(x, 0, 0);
  s.target.updateMatrixWorld();
}

// ---------------------------------------------------------------------------
// replay snapshots: small 16:9 crops of the main canvas for the news report

/** Grab the next rendered frame (drawn after the engine's own rAF callback, so the buffer is still valid). */
export function captureFrame(view, w = 256) {
  const rp = (view.replay ??= { frames: [] });
  if (rp.frames.length >= MAX_FRAMES || rp.busy) return;
  rp.busy = true;
  requestAnimationFrame(() => {
    rp.busy = false;
    const src = engine.renderer?.domElement;
    if (!src || view.disposed || !src.width) return;
    try {
      const hgt = Math.round(w * 9 / 16);
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = hgt;
      const g = cv.getContext('2d');
      const sw = src.width, sh = src.height;
      let cw = sw, ch = Math.round(sw * 9 / 16);
      if (ch > sh) { ch = sh; cw = Math.round(sh * 16 / 9); }
      // portrait: a 16:9 crop of the middle band (the cinematic frames the action there)
      g.drawImage(src, Math.round((sw - cw) / 2), Math.round((sh - ch) * 0.48), cw, ch, 0, 0, w, hgt);
      rp.frames.push(cv);
    } catch (e) { /* the replay is optional */ }
  });
}

// ---------------------------------------------------------------------------
// final blow detection (pre-roll)

/** Damage a unit's next hit should do (unitDamage without its side effects; conservative). */
function estDmg(sim, u) {
  const sb = sim.sides[u.side]?.buffs ?? {};
  return (u.st?.dmg ?? 0) * (u.dmgMult ?? 1) * (sb.dance > 0 ? 1.5 : 1) * (sb.surge > 0 ? 1.4 : 1) * (u.ambush || 1);
}

/** The hit that will bring the base of `side` down (if it lands within `look` s of sim time). */
function lethalHit(sim, side, look = 0.45) {
  const b = sim.sides[side]?.lab;
  if (!b || !b.alive) return null;
  if (sim.cfg?.baseFloor && side === 0) return null; // tutorial: your base can't fall
  const hp = b.hp + (b.shield ?? 0);
  const hits = [];
  for (const p of sim.projectiles ?? []) {
    if (p.done || p.tower || p.side === side || p.target !== b || !p.src) continue;
    hits.push({ t: p.flight - p.t, dmg: estDmg(sim, p.src), proj: p, unit: p.src });
  }
  for (const u of sim.units ?? []) {
    if (u.dead || u.side === side || !(u.atkPhase > 0) || u.atkTarget !== b || u.st?.projectile) continue;
    hits.push({ t: u.atkPhase, dmg: estDmg(sim, u), unit: u });
  }
  if (!hits.length) return null;
  hits.sort((a, c) => a.t - c.t);
  let acc = 0;
  for (const it of hits) {
    acc += it.dmg;
    if (acc >= hp * 1.05) return it.t <= look ? it : null;
  }
  return null;
}

/** Per frame from view.update: start the slow-motion pre-roll when a base is about to fall. */
export function watchFinalBlow(view) {
  if (view.endFx || view.disposed || !view.loaded) return;
  const sim = view.sim;
  if (!sim || sim.over || sim.paused || sim.cinematic || !sim.projectiles || (view.cine && !view.cine.done)) return;
  const sc = engine.current;
  if (sc?.view !== view || sc.mode === 'friend' || sc.mode === 'online' || sc.ended) return;
  for (const side of [1, 0]) {
    const hit = lethalHit(sim, side);
    if (hit) { startEnd(view, side, hit); return; }
  }
}

// ---------------------------------------------------------------------------
// the explosion's big voxel chunks: the base's own geometry cut into pieces

// debris meshes are pooled across battles (geometry is per explosion: its own cut-up pieces)
const MESH_POOL = [];
const MAX_DEBRIS = 30;
function pooledMesh(geo, mat) {
  const m = MESH_POOL.pop() ?? new THREE.Mesh();
  m.geometry = geo;
  m.material = mat;
  m.position.set(0, 0, 0); m.quaternion.identity(); m.scale.set(1, 1, 1);
  m.castShadow = true;
  m.visible = true;
  return m;
}
function releaseMesh(m) {
  m.geometry = null;
  m.material = null;
  if (MESH_POOL.length < MAX_DEBRIS) MESH_POOL.push(m);
}

let chunkMats = null;
function chunkMaterials() {
  if (!chunkMats) {
    // double-sided: a chunk is a slice of a surface shell, its open side shows the far wall
    const solid = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    const glow = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, side: THREE.DoubleSide });
    glow.color.setScalar(2.6);
    solid.userData.shared = glow.userData.shared = true;
    chunkMats = [solid, glow];
  }
  return chunkMats;
}

const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _m3 = new THREE.Matrix3();
/** Cut a voxel mesh (quads: 6 indices per face) into Voronoi cells around `seeds` (world space). */
function splitMesh(mesh, seeds) {
  const g = mesh.geometry;
  const pos = g?.attributes?.position, nor = g?.attributes?.normal, col = g?.attributes?.color, idx = g?.index;
  if (!pos || !nor || !col || !idx) return [];
  mesh.updateMatrixWorld(true);
  const M = mesh.matrixWorld;
  _m3.getNormalMatrix(M);
  const nv = pos.count;
  const wp = new Float32Array(nv * 3);
  for (let i = 0; i < nv; i++) {
    _v.fromBufferAttribute(pos, i).applyMatrix4(M);
    wp[i * 3] = _v.x; wp[i * 3 + 1] = _v.y; wp[i * 3 + 2] = _v.z;
  }
  const K = seeds.length;
  const lists = Array.from({ length: K }, () => ({ s: [], g: [] }));
  const groups = g.groups.length ? g.groups : [{ start: 0, count: idx.count, materialIndex: 0 }];
  for (const gr of groups) {
    const glow = gr.materialIndex === 1;
    const end = gr.start + gr.count;
    for (let f = gr.start; f + 6 <= end; f += 6) {
      let cx = 0, cy = 0, cz = 0;
      for (let k = 0; k < 6; k++) { const vi = idx.getX(f + k) * 3; cx += wp[vi]; cy += wp[vi + 1]; cz += wp[vi + 2]; }
      cx /= 6; cy /= 6; cz /= 6;
      let best = 0, bd = Infinity;
      for (let s = 0; s < K; s++) {
        const q = seeds[s], dx = cx - q.x, dy = (cy - q.y) * 1.2, dz = cz - q.z;
        const d = dx * dx + dy * dy + dz * dz;
        if (d < bd) { bd = d; best = s; }
      }
      (glow ? lists[best].g : lists[best].s).push(f);
    }
  }
  const out = [];
  for (const L of lists) {
    const nf = L.s.length + L.g.length;
    if (nf < 8) continue;
    const P = new Float32Array(nf * 18), N = new Float32Array(nf * 18), C = new Float32Array(nf * 18);
    let o = 0, sx = 0, sy = 0, sz = 0;
    const put = (f) => {
      for (let k = 0; k < 6; k++) {
        const vi = idx.getX(f + k);
        P[o] = wp[vi * 3]; P[o + 1] = wp[vi * 3 + 1]; P[o + 2] = wp[vi * 3 + 2];
        sx += P[o]; sy += P[o + 1]; sz += P[o + 2];
        _n.fromBufferAttribute(nor, vi).applyMatrix3(_m3).normalize();
        N[o] = _n.x; N[o + 1] = _n.y; N[o + 2] = _n.z;
        C[o] = col.getX(vi); C[o + 1] = col.getY(vi); C[o + 2] = col.getZ(vi);
        o += 3;
      }
    };
    for (const f of L.s) put(f);
    for (const f of L.g) put(f);
    const n = nf * 6;
    const c = V(sx / n, sy / n, sz / n);
    for (let i = 0; i < P.length; i += 3) { P[i] -= c.x; P[i + 1] -= c.y; P[i + 2] -= c.z; }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(C, 3));
    geo.addGroup(0, L.s.length * 6, 0);
    if (L.g.length) geo.addGroup(L.s.length * 6, L.g.length * 6, 1);
    geo.computeBoundingSphere();
    out.push({ geo, center: c, r: geo.boundingSphere.radius, faces: nf });
  }
  return out;
}

/**
 * The front-facing surface of a set of voxel meshes, in world space: (ix, iy) cell (vs units) ->
 * the front-most face point there (the glowing cracks walk across it).
 */
function frontMap(meshes, vs) {
  const map = new Map();
  for (const mesh of meshes) {
    const g = mesh.geometry;
    const pos = g?.attributes?.position, nor = g?.attributes?.normal, idx = g?.index;
    if (!pos || !nor || !idx) continue;
    mesh.updateMatrixWorld(true);
    const M = mesh.matrixWorld;
    _m3.getNormalMatrix(M);
    for (let f = 0; f + 6 <= idx.count; f += 6) {
      const a = idx.getX(f);
      _n.fromBufferAttribute(nor, a).applyMatrix3(_m3);
      if (_n.z < 0.9 * _n.length()) continue;
      let cx = 0, cy = 0, cz = 0;
      for (let k = 0; k < 6; k++) { _v.fromBufferAttribute(pos, idx.getX(f + k)).applyMatrix4(M); cx += _v.x; cy += _v.y; cz += _v.z; }
      cx /= 6; cy /= 6; cz /= 6;
      const key = Math.floor(cx / vs) + ',' + Math.floor(cy / vs);
      const prev = map.get(key);
      if (!prev || prev.z < cz) map.set(key, { x: cx, y: cy, z: cz });
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// the controller

function startEnd(view, side, hit = null) {
  const sim = view.sim;
  const sc = engine.current?.view === view ? engine.current : null;
  const stage = battleStage(view);
  const lab = view.labs[side];
  const B = stage.base(side);
  const out = side === 0 ? 1 : -1; // from the base toward the field
  const Hb = Math.max(2, lab.height ?? 3), Wb = Math.max(2.4, lab.width ?? 3.4);
  const x0 = lab.root.position.x;
  const cam = view.camera;
  const E = {
    side, hit, lab, B, out, phase: hit ? 'pre' : 'impact', t: 0, tp: 0, skipped: false, done: false,
    debris: [], emit: [], cracks: [], P: pixSystem(view.scene),
  };
  view.endFx = E;
  view.replay = { frames: [], side };
  let resolveDone;
  E.promise = new Promise((r) => (resolveDone = r));

  // a running MEGA / ULTIMATE cutscene hands over
  if (view.cine && !view.cine.done && !view.cine.endgame) { try { view.cine.finish?.(); } catch (e) { /* gone */ } }

  // overlay: letterbox, top-bar tag, skip hint, flash (shared look with the entrances)
  const wrap = makeWrap($overlay());
  wrap.classList.add('ecw');
  view.endWrap = wrap;
  const kick = wrap.querySelector('.ent-kick span');
  const flashEl = wrap.querySelector('.ent-flash');
  const flash = (col = '#ffffff', a = 0.85) => {
    flashEl.style.setProperty('--fc', col);
    flashEl.style.setProperty('--fa', String(a));
    flashEl.classList.remove('go');
    void flashEl.offsetWidth;
    flashEl.classList.add('go');
  };
  const tag = (txt) => { if (kick) kick.textContent = txt; wrap.classList.toggle('kick', !!txt); };
  let skipAt = 0;
  wrap.addEventListener('pointerdown', (ev) => {
    ev.stopPropagation(); ev.preventDefault();
    if (performance.now() < skipAt) return;
    skipAt = performance.now() + 350;
    if (E.phase === 'pre') return; // the hit lands in a moment
    if (!E.done) skip();
  });

  // the battle's controls step aside
  if (sc) {
    E.prevLock = sc.lockInput;
    sc.lockInput = 'endgame';
    try { sc.select?.(-1); sc.cancelPending?.(); sc.hud?.dragEnd?.(); sc.hud?.setCinematic?.(true); } catch (e) { /* cosmetic */ }
  }
  stage.begin();

  // ---- who threw it
  const unit = hit?.unit ?? lastAttacker(sim, side, B);
  const unitName = unit ? (cardDef(unit.card)?.name ?? SWARMS[unit.type]?.name ?? '') : '';
  const impactP = V(B.front, Math.min(Hb * 0.48, 1.45), 0.35);
  const trackP = () => {
    const pr = hit?.proj ? view.projs.get(hit.proj.id) : null;
    if (pr) return pr.mesh.position;
    const a = unit ? view.actors.get(unit.id) : null;
    if (a) return _v.copy(a.rig.root.position).setY(a.rig.root.position.y + (a.rig.height ?? 1) * 0.55);
    return impactP;
  };
  sunAt(view, B.x + out * 3);

  // ---- camera
  const cur = { pos: cam.position.clone(), look: V() };
  cam.getWorldDirection(_f);
  cur.look.copy(cam.position).addScaledVector(_f, 12);
  let blend = null, shotKey = '';
  const place = (s, key, dt, dur = 0) => {
    if (key !== shotKey) { shotKey = key; blend = dur > 0 ? { from: cur.pos.clone(), look: cur.look.clone(), t: 0, dur } : null; }
    if (blend) {
      blend.t += dt;
      const k = inOut(clamp01(blend.t / blend.dur));
      cur.pos.lerpVectors(blend.from, s.pos, k);
      cur.look.lerpVectors(blend.look, s.look, k);
      if (k >= 1) blend = null;
    } else { cur.pos.copy(s.pos); cur.look.copy(s.look); }
    cam.position.copy(cur.pos);
    cam.lookAt(cur.look);
  };
  let preShot = null;
  const port = () => cam.aspect < 1;
  // a wider lens while the cinematic runs (stronger perspective for the low close-ups)
  const fov0 = view.camFov0 ??= cam.fov;
  const lens = () => { const f = port() ? 44 : 32; if (Math.abs(cam.fov - f) > 0.01) { cam.fov = f; cam.updateProjectionMatrix(); } };
  // low, from behind the attacker's shoulder: the shot flies on into the base; pushes in as it closes
  // (the reverse angle from the base's corner: the shot comes at the lens past the wall)
  const shotPre = (k) => {
    const a = trackP();
    const span = Math.abs(a.x - impactP.x);
    if (port()) {
      const c = V(lerp(impactP.x, a.x, 0.4), Math.max(Hb * 0.36, lerp(a.y, impactP.y, 0.5)), 0.3);
      return (preShot = frame(cam, c, 2.5, Math.max(2.4, Hb * 0.95), { yaw: -out * 0.72, pitch: -0.1, minY: 0.3, zoom: 1 - k * 0.1 }));
    }
    const c = V(lerp(impactP.x, a.x, 0.45), Math.max(Hb * 0.36, lerp(a.y, impactP.y, 0.5)), 0.3);
    return (preShot = frame(cam, c, Math.max(4, span + 2.6), Math.max(2.3, Hb * 0.85), { yaw: -out * 0.62, pitch: -0.08, minY: 0.3, zoom: 1 - k * 0.1 }));
  };
  const baseC = V(B.x + out * 0.12 * Wb, Hb * 0.5, 0.5);
  if (view.cmds?.[side]?.root.visible) { const sp = B.seat; baseC.x = lerp(baseC.x, sp.x, 0.4); }
  // the base (and its Commander) low and close; `wide` opens up the sky above for the debris
  const shotBase = (k, wide = 0, at = null) => frame(cam, at ?? baseC.clone().setY(Hb * 0.55), Wb * (port() ? lerp(0.62, 1.05, wide) : lerp(1.6, 2.4, wide)), Hb * lerp(1.3, 2.3, wide), {
    yaw: out * lerp(0.22, 0.32, k), pitch: lerp(-0.1, -0.02, wide), minY: 0.35, zoom: lerp(1.04, 0.95, k), sy: lerp(0.54, port() ? 0.66 : 0.6, wide),
  });

  // ---- glowing crack seams (voxels on the base's front face, grown from the hit)
  const buildCracks = () => {
    const meshes = (lab.meshes ?? []).filter((m) => m.visible && m.parent?.visible !== false && m.geometry?.index);
    if (!meshes.length) return;
    const vs = meshes[0].geometry.userData?.voxelSize ?? 0.08;
    const map = frontMap(meshes, vs);
    if (map.size < 20) return;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const k of map.keys()) { const [x, y] = k.split(',').map(Number); minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    // the hit lands on the field side, about half way up
    const near = (x, y) => { for (let r = 0; r < 12; r++) for (let dx = -r; dx <= r; dx++) for (const dy of [-r, r]) if (map.has((x + dx) + ',' + (y + dy))) return [x + dx, y + dy]; return [x, y]; };
    const fieldX = out > 0 ? maxX - Math.round((maxX - minX) * 0.14) : minX + Math.round((maxX - minX) * 0.14);
    const origins = [near(fieldX, Math.round(lerp(minY, maxY, 0.42))), near(Math.round((minX + maxX) / 2), Math.round(lerp(minY, maxY, 0.62)))];
    const seen = new Set();
    const pts = [];
    const add = (x, y, d) => { const key = x + ',' + y; if (seen.has(key) || !map.has(key)) return; seen.add(key); pts.push({ p: map.get(key), d }); };
    const walk = (x, y, ang, len, d0, depth = 0) => {
      for (let i = 0; i < len; i++) {
        ang += rnd(-0.38, 0.38);
        let moved = false;
        for (let tries = 0; tries < 5 && !moved; tries++) {
          const a = ang + (tries ? rnd(-1.3, 1.3) : 0);
          const nx = x + Math.round(Math.cos(a)), ny = y + Math.round(Math.sin(a));
          if ((nx !== x || ny !== y) && map.has(nx + ',' + ny)) { x = nx; y = ny; moved = true; if (tries) ang = a; }
        }
        if (!moved) return;
        add(x, y, d0 + i);
        // a thicker seam right at the hit
        if (i < 5 && depth === 0) add(x + (Math.abs(Math.sin(ang)) > 0.7 ? 1 : 0), y + (Math.abs(Math.sin(ang)) > 0.7 ? 0 : 1), d0 + i);
        if (depth < 2 && i > 3 && Math.random() < 0.1 && len - i > 6) walk(x, y, ang + (Math.random() < 0.5 ? 0.9 : -0.9), Math.round((len - i) * 0.6), d0 + i, depth + 1);
      }
    };
    origins.forEach(([x, y], oi) => {
      const n = oi ? 3 : 5;
      for (let i = 0; i < n; i++) walk(x, y, (i / n) * Math.PI * 2 + rnd(-0.3, 0.3), Math.round(rnd(16, 34) * (oi ? 0.6 : 1)), oi ? 10 : 0);
    });
    pts.forEach((q, i) => E.cracks.push({ x: q.p.x, y: q.p.y, z: q.p.z + vs * 0.06, at: q.d * 0.02, on: false, size: vs * 1.05, halo: i % 3 === 0 }));
  };

  // ---- debris
  const addDebris = (mesh, pos, vel, r, own) => {
    view.scene.add(mesh);
    E.debris.push({ mesh, vel, av: V(rnd(-7, 7), rnd(-5, 5), rnd(-7, 7)), r: Math.max(0.08, r), own, rest: false, bounces: 0 });
  };
  let chunks = null;
  const prepChunks = () => {
    try {
      const body = lab.meshes?.find((m) => m.visible && m.geometry?.index) ?? null;
      if (!body) return;
      body.geometry.computeBoundingBox();
      const bb = body.geometry.boundingBox.clone().applyMatrix4(body.matrixWorld);
      const n = Math.max(10, Math.min(18, Math.round(Wb * Hb * 1.6)));
      const seeds = [];
      for (let i = 0; i < n; i++) seeds.push(V(rnd(bb.min.x, bb.max.x), rnd(bb.min.y, bb.max.y), rnd(bb.min.z, bb.max.z)));
      // a few smaller pieces where the hit landed
      for (let i = 0; i < 3; i++) seeds.push(V(impactP.x - out * rnd(0.1, 0.6), impactP.y + rnd(-0.4, 0.5), rnd(bb.min.z, bb.max.z)));
      chunks = splitMesh(body, seeds);
      // compile the double-sided materials now (the freeze hides any hitch)
      const pg = new THREE.BufferGeometry();
      pg.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0.01, 0, 0, 0, 0.01, 0], 3));
      pg.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
      pg.setAttribute('color', new THREE.Float32BufferAttribute([1, 1, 1, 1, 1, 1, 1, 1, 1], 3));
      pg.addGroup(0, 3, 0); pg.addGroup(0, 3, 1);
      engine.precompile(new THREE.Mesh(pg, chunkMaterials()), cam, view.scene).finally(() => pg.dispose());
      E.split = body;
    } catch (e) { console.warn('base chunks', e); chunks = null; }
  };

  // ---- the Commander on the roof
  const ch = view.cmds?.[side] ?? null;
  // cinematic licence: the base stands mostly whole again for its last moment (the shot after the
  // freeze is a cut), so the seams and the blast read on a real building, not a heap
  const restore = () => {
    const prev = lab.onChunk;
    lab.onChunk = null;
    try { lab.setDamage(0.4); } catch (e) { /* keep it as it is */ }
    lab.onChunk = prev;
  };
  const launch = { on: false, done: false };
  const v8 = voiceOf(ch?.def);

  // ---- phases
  const toImpact = () => {
    E.phase = 'impact';
    E.t = 0;
    engine.timeScale = 0;
    E.freeze = true;
    flash('#ffffff', 0.9);
    tag(unitName ? `FINAL BLOW  ${unitName.toUpperCase()}` : 'FINAL BLOW');
    hpx.emit('solid', 'pow', { x: impactP.x + out * 0.15, y: impactP.y + 0.1, z: impactP.z + 0.5, life: 0.6, scale: 1.25, color: 0xffb02e, flip: out > 0, fadeOut: 0.85, frame: 1 });
    hpx.sparks(impactP, { count: 16, speed: 7, scale: 1.2, up: 2 });
    audio.play('hitHeavy', { pitch: 0.55, vol: 1 });
    audio.play('thud', { pitch: 0.5, vol: 0.9 });
    audio.play('vsSlam', { pitch: 0.8, vol: 0.6 });
    engine.shake(0.25);
    if (ch) { ch.busy = true; ch.play('shocked', { restart: true }); ch.mood('shock', 2); }
    const win = view.cmds?.[1 - side];
    if (win) { win.busy = true; win.play('sitCheer'); win.mood('excited', 3); }
    captureFrame(view);
  };
  const toCrack = () => {
    E.phase = 'crack';
    E.freeze = false;
    particles.layers.cube.clear(); // the hit's falling bits would clutter the cut
    tag(side === 0 ? 'YOUR BASE IS GOING DOWN' : 'BASE CRITICAL');
    audio.play('alarm', { vol: 0.55, pitch: 0.9 });
    audio.play('crunch', { pitch: 0.45, vol: 0.9 });
    rumble(1.0);
    if (ch) { ch.play('panic', { restart: true, dur: 2 }); ch.mood('panic', 3); }
  };
  const toBoom = () => {
    E.phase = 'boom';
    flash('#fff6d8', 0.95);
    tag(side === 0 ? 'YOUR BASE FELL' : 'BASE DESTROYED');
    wrap.classList.add('ecw-boom');
    const stamp = h('div', { class: `ecw-stamp ${side === 0 ? 'loss' : 'win'}` }, h('span', {}, side === 0 ? 'BASE LOST' : 'BASE DESTROYED'));
    wrap.appendChild(stamp);
    setTimeout(() => stamp.classList.add('out'), 1500);
    setTimeout(() => stamp.remove(), 1900);
    engine.timeScale = 1;
    engine.shake(0.95);
    audio.play('explode', { pitch: 0.55, vol: 1 });
    audio.play('boom', { pitch: 0.5, vol: 1 });
    audio.play('shatter', { pitch: 0.7, vol: 0.7 });
    audio.play('crunch', { pitch: 0.5, vol: 0.8 });
    blowUp();
    if (ch && ch.root.visible) startLaunch();
    captureFrame(view);
  };

  // the base comes apart
  const blowUp = () => {
    const pieces = [];
    const prev = lab.onChunk;
    lab.onChunk = (m) => pieces.push(m);
    lab.setDamage(1);
    lab.onChunk = prev;
    for (const c of E.cracks) c.dead = true;
    const c0 = V(B.x, Hb * 0.42, 0);
    let count = 0;
    // the body: its own chunks
    if (chunks?.length) {
      const [solid, glow] = chunkMaterials();
      for (const k of chunks) {
        if (count >= 22) { k.geo.dispose(); continue; }
        const m = pooledMesh(k.geo, [solid, glow]);
        m.position.copy(k.center);
        m.castShadow = true;
        const dir = _v.subVectors(k.center, c0);
        dir.z = Math.abs(dir.z) * 0.6 + 0.4;
        dir.normalize();
        const sp = rnd(6, 11) * (k.r > 0.6 ? 0.75 : 1);
        const vel = V(dir.x * sp + out * rnd(0.5, 2.5), dir.y * sp * 0.6 + rnd(6, 10.5), dir.z * sp * 0.5 + rnd(0.8, 3));
        addDebris(m, k.center, vel, k.r, true);
        count++;
      }
      chunks = null;
    }
    // roof bits, tanks, antennas: thrown whole
    for (const pm of pieces) {
      if (!pm.geometry || (pm === E.split && count)) continue; // the body went out as its own chunks
      if (count >= MAX_DEBRIS) break;
      pm.updateMatrixWorld(true);
      const m = pooledMesh(pm.geometry, pm.material);
      pm.matrixWorld.decompose(m.position, m.quaternion, m.scale);
      m.castShadow = true;
      if (!pm.geometry.boundingSphere) pm.geometry.computeBoundingSphere();
      const r = (pm.geometry.boundingSphere?.radius ?? 0.3) * m.scale.x;
      if (r > 2.2) continue; // the whole body (when it could not be cut up): the rubble covers it
      const dir = _v.subVectors(m.position, c0).setZ(0.5).normalize();
      const vel = V(dir.x * rnd(3, 6) + out * rnd(0.5, 2), rnd(6, 11), rnd(0.8, 3));
      addDebris(m, m.position, vel, r, false);
      count++;
    }
    // fireballs, sparks, embers
    const top = Hb * 0.9;
    const booms = [[0, 0.45, 1.9], [out * 0.55, 0.8, 1.3], [-out * 0.6, 0.3, 1.3], [0.1, 1.05, 1.5], [out * 0.25, 0.15, 1.2]];
    booms.forEach(([dx, fy, s], i) => E.emit.push({ at: E.t + i * 0.05, once: () => fireball(V(B.x + dx * Wb * 0.5, Math.max(0.4, top * fy), 0.6), s) }));
    hpx.emit('glow', 'star', { x: B.x, y: Hb * 0.5, z: 1.2, life: 0.25, scale: 3, color: 0xffd08a, fadeOut: 0.4 });
    hpx.sparks(V(B.x, Hb * 0.5, 0.8), { count: 34, speed: 11, scale: 1.4, up: 4, life: 1.6 });
    hpx.embers(V(B.x, Hb * 0.4, 0.6), { count: 18, scale: 1.6 });
    hpx.chips(V(B.x, Hb * 0.45, 0.6), { count: 26, speed: 9, up: 1.6, scale: 1.5, colors: [0xd8dce8, TEAM[side], 0x9aa6bc, 0x6e687c], life: 1.8 });
    // the dust wave rolling out along the ground (pixel puffs, no ring)
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * Math.PI * 2 + rnd(-0.08, 0.08), sp = rnd(6, 14);
      hpx.emit('solid', i % 3 ? 'puff2' : 'puff', {
        x: B.x + Math.cos(a) * Wb * 0.42, y: rnd(0.06, 0.22), z: Math.sin(a) * 0.8 + 0.3, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp * 0.5, vy: rnd(0.1, 0.9),
        drag: 3.2, life: rnd(0.7, 1.2), scale: rnd(0.3, 0.75), grow: 1.1, color: i % 4 ? (view.dustColor ?? 0xe8dcc0) : 0xf6f0e2, fadeOut: 0.45, cool: true, flip: Math.random() < 0.5,
      });
    }
    // money bases rain cash (pixel bills)
    if (lab.style === 'mansion' || lab.style === 'goldVault') {
      E.P.burst(V(B.x, Hb * 0.7, 0.6), { tex: 'cash', additive: false, count: 26, speed: 7, lift: 5, grav: 7, drag: 0.8, life: 2.4, size: 0.32, size1: 0.3, color: [0x6fdc7a, 0x52cc5e, 0x3fbf4f], glow: 1, spin: 4 });
    }
    // fire + smoke keep going on the rubble
    const fireAt = [-0.35, 0.05, 0.4].map((f) => V(B.x + f * Wb, 0.35, rnd(0.2, 0.8)));
    E.emit.push({ from: E.t + 0.2, to: E.t + 7, every: 0.13, fn: (k) => { const p = fireAt[(Math.random() * 3) | 0]; hpx.fire(p, { count: k < 0.35 ? 3 : 1, scale: k < 0.35 ? 1.5 : 1, radius: 0.5 }); } });
    E.emit.push({ from: E.t + 0.4, to: E.t + 9, every: 0.3, fn: (k) => hpx.smoke(V(B.x + rnd(-0.45, 0.45) * Wb, rnd(0.4, 0.9), rnd(-0.4, 0.4)), { count: 1, scale: lerp(1.15, 0.8, k), radius: 0.4, rise: lerp(1.7, 1.2, k), life: 1.8, grow: 0.55, colors: k < 0.2 ? [0x7a7488, 0x8a8698] : [0xa8a4b4, 0xbab6c6, 0xc8c4d2] }) });
  };

  // the Commander is launched off the roof and lands in the rubble
  const startLaunch = () => {
    ch.busy = ch.emoting = true;
    const from = ch.root.position.clone();
    const to = V(B.front + out * rnd(1.1, 1.6), 0, 1.7);
    const T = 1.25, g = 16;
    launch.on = true;
    launch.t = 0;
    launch.T = T;
    launch.g = g;
    launch.p = from;
    launch.v = V((to.x - from.x) / T, (0 - from.y + 0.5 * g * T * T) / T, (to.z - from.z) / T);
    launch.spin = out * 9;
    launch.to = to;
    ch.play('panic', { restart: true, dur: 3 });
    ch.mood('panic', 3);
    audio.play('slideWhistle', { pitch: 1.1, vol: 0.8 });
    audio.voice(v8, { text: 'waaaah', span: 0.7, emph: true });
  };
  const updLaunch = (gdt) => {
    if (!launch.on || launch.done || !ch) return;
    launch.t += gdt;
    const t = Math.min(launch.t, launch.T);
    const p = ch.root.position;
    p.set(launch.p.x + launch.v.x * t, launch.p.y + launch.v.y * t - 0.5 * launch.g * t * t, launch.p.z + launch.v.z * t);
    ch.root.rotation.z += launch.spin * gdt;
    ch.root.rotation.y = lerp(ch.root.rotation.y, 0.2 * out, Math.min(1, gdt * 3));
    if (Math.random() < gdt * 14) hpx.trail(p.clone().setY(p.y + 0.4), 'twinkle', 0xfff2a0, { scale: 1.3, life: 0.4 });
    if (launch.t >= launch.T) land();
  };
  const land = () => {
    launch.done = true;
    const p = ch.root.position.copy(launch.to);
    ch.root.rotation.set(0, out * 0.35, 0);
    ch.play('dizzy', { restart: true, dur: 99 });
    ch.mood('dizzy', 99);
    ch.emote?.('star', 2.5);
    ch.boing(-0.4);
    hpx.landPuff(p, { scale: 1.6, color: view.dustColor ?? 0xf2ead8 });
    hpx.dust(p, { count: 4, scale: 1.4 });
    audio.play('thud', { pitch: 0.9 });
    audio.play('boing', { pitch: 0.8, vol: 0.7 });
    view.loserSpot = { side, pos: p.clone() };
  };

  // ---- slow time
  const tsTarget = hit ? Math.max(0.12, Math.min(0.35, (hit.t || 0.2) / 1.3)) : 0.25;
  let preEase = 0;

  const updDebris = (gdt) => {
    let thud = 0;
    for (const d of E.debris) {
      if (d.rest) continue;
      const p = d.mesh.position;
      d.vel.y -= 18 * gdt;
      p.addScaledVector(d.vel, gdt);
      d.mesh.rotation.x += d.av.x * gdt; d.mesh.rotation.y += d.av.y * gdt; d.mesh.rotation.z += d.av.z * gdt;
      const floor = 0.04 + d.r * 0.42;
      if (p.y < floor) {
        p.y = floor;
        if (d.vel.y < -2 && d.bounces < 3) {
          d.vel.y *= -0.3; d.vel.x *= 0.55; d.vel.z *= 0.55; d.av.multiplyScalar(0.45);
          d.bounces++;
          if (d.r > 0.25 && thud++ < 2) { hpx.landPuff(p, { scale: Math.min(1.8, 0.6 + d.r), color: view.dustColor ?? 0xf2ead8 }); audio.play('thud', { pitch: rnd(0.6, 0.9), vol: 0.5, gap: 0.06 }); }
        } else { d.vel.set(0, 0, 0); d.rest = true; }
      }
    }
  };

  const crackOn = (c) => {
    c.on = true;
    const hot = Math.random() < 0.3;
    const life = Math.max(0.2, T_BOOM - E.t + 0.05);
    particles.spawn('glow', { x: c.x, y: c.y, z: c.z, size: c.size, rx: 0, ry: 0, rz: 0, grav: 0, drag: 0, life, color: hot ? 0xffd060 : 0xff6a10, shrinkStart: 0.97 });
    // a dim halo thickens the seam so it reads from the battle camera's distance too
    if (c.halo) particles.spawn('glow', { x: c.x, y: c.y, z: c.z - 0.02, size: c.size * 1.7, rx: 0, ry: 0, rz: 0, grav: 0, drag: 0, life, color: 0x3a1002, shrinkStart: 0.97 });
    if (Math.random() < 0.18) hpx.emit('glow', 'ember', { x: c.x, y: c.y, z: c.z + 0.05, vx: rnd(-1, 1), vy: rnd(0.5, 2.5), vz: rnd(0.5, 1.5), grav: -6, life: rnd(0.3, 0.6), scale: 1.2, color: 0xffb040, fadeOut: 0.5 });
  };

  // ---- per frame: physics + timeline (keeps running after the camera is handed on)
  let emitT = 0, shotT = 0;
  const off = engine.onFrame((dtRaw) => {
    if (view.disposed) { off(); cleanup(); return; }
    const dt = dtRaw / slowK();
    const gdt = dtRaw * engine.timeScale * (engine.hitstopT > 0 ? 0.04 : 1);
    E.P.update(gdt, cam);
    updDebris(gdt);
    updLaunch(gdt);
    if (E.phase === 'pre') {
      E.tp += dt;
      preEase = Math.min(1, preEase + dt / 0.15);
      engine.timeScale = lerp(1, tsTarget, outC(preEase)) / slowK();
      if (ch) ch.speed = Math.max(0.2, engine.timeScale);
      shotT -= dt;
      if (shotT <= 0) { shotT = 0.3; captureFrame(view); }
      // the hit was not the last one after all: back to the battle
      const gone = hit?.proj ? (hit.proj.done && !view.projs.has(hit.proj.id)) : !(hit?.unit?.atkPhase > 0);
      if (sim.over || E.tp > 4 || (gone && (E.goneT = (E.goneT ?? 0) + dt) > 0.25)) abort();
      return;
    }
    if (E.phase === 'aborted') return;
    E.t += dt;
    if (import.meta.env.DEV && typeof window.__fxPin === 'number' && E.t > window.__fxPin) E.t = window.__fxPin;
    const t = E.t;
    if (E.phase === 'impact') {
      if (!E.prepped && t > 0.06) { E.prepped = true; restore(); prepChunks(); buildCracks(); }
      if (t >= T_CRACK) toCrack();
    }
    if (E.phase === 'crack') {
      const k = clamp01((t - T_CRACK) / 0.22);
      engine.timeScale = lerp(0.05, 1, k) / slowK();
      const kc = clamp01((t - T_CRACK) / (T_BOOM - T_CRACK));
      for (const c of E.cracks) if (!c.on && !c.dead && c.at <= (t - T_CRACK) * 1.25) crackOn(c);
      // the base trembles harder and harder
      lab.root.position.x = x0 + Math.sin(t * 61) * 0.035 * kc;
      lab.shakeT = 0;
      if (Math.random() < dt * (2 + kc * 7)) hpx.smoke(V(B.x + rnd(-0.5, 0.5) * Wb, rnd(0.5, Hb * 0.8), 0.6), { count: 1, scale: 0.55, rise: 1.4, life: 0.7, colors: [0x9a96a8, 0xb4b0c0] });
      if (Math.random() < dt * 10) audio.play('crunch', { pitch: rnd(0.4, 0.6), vol: 0.5, gap: 0.08 });
      if (kc > 0.55 && !E.capCrack) { E.capCrack = true; captureFrame(view); }
      if (t >= T_BOOM) { lab.root.position.x = x0; toBoom(); }
    }
    if (E.phase === 'boom' || E.phase === 'settle') {
      // a beat of real time (the blast bursts out), then the debris hangs in slow motion, then real time
      const tb = t - T_BOOM;
      const ts = tb < 0.1 ? 1 : tb < 0.2 ? lerp(1, 0.22, (tb - 0.1) / 0.1) : tb < 0.75 ? 0.22 : lerp(0.22, 1, inOut(clamp01((tb - 0.75) / (T_REAL - T_BOOM - 0.75))));
      engine.timeScale = ts / slowK();
      if (E.phase === 'boom' && t >= T_REAL) E.phase = 'settle';
      for (const at of [0.12, 0.35, 0.7, 1.1, 1.6, 2.2]) if (!E['cap' + at] && t >= T_BOOM + at) { E['cap' + at] = true; captureFrame(view); }
      if (t >= T_END && !E.done) finish();
    }
    // one-shot + rate emitters
    emitT += gdt;
    for (const em of E.emit) {
      if (em.once) { if (!em.fired && t >= em.at) { em.fired = true; em.once(); } continue; }
      if (t < em.from || t > em.to) continue;
      em.acc = (em.acc ?? 0) + gdt;
      while (em.acc >= em.every) { em.acc -= em.every; em.fn(clamp01((t - em.from) / (em.to - em.from))); }
    }
  });

  // ---- camera (the view calls this while we own it)
  const ctl = {
    endgame: true, ownsCamera: true, done: false,
    get freeze() { return !!E.freeze; },
    update(dtRaw) {
      const dt = dtRaw / slowK();
      if (E.phase !== 'aborted') lens();
      if (E.phase === 'pre') { place(shotPre(clamp01(E.tp / 1.4)), 'pre', dt); return; }
      if (E.phase === 'aborted') return;
      const t = E.t;
      if (E.phase === 'impact') {
        // freeze-frame: a slow push in on the last shot
        const s = preShot ?? shotPre(0.6);
        const k = outC(clamp01(t / T_CRACK));
        const look = s.look;
        place({ pos: s.pos.clone().lerp(look, 0.1 * k), look }, 'impact', dt);
        return;
      }
      if (E.phase === 'crack') { place(shotBase(clamp01((t - T_CRACK) / (T_BOOM - T_CRACK))), 'base', dt); return; }
      // boom: pull back to take in the debris and the flying Commander, then drift
      const kw = outC(clamp01((t - T_BOOM) / 0.9));
      // follow the Commander's flight a little, and keep the landing in the frame
      let c = null;
      if (ch && launch.on) {
        const kf = launch.done ? 0.5 : 0.12 + 0.3 * clamp01(launch.t / launch.T);
        E.follow = lerp(E.follow ?? 0, kf, Math.min(1, dt * 2.5));
        _v.copy(ch.root.position);
        _v.y = Math.min(_v.y, Hb * 1.4) * 0.5 + Hb * 0.3;
        c = baseC.clone().setY(Hb * 0.55).lerp(_v, E.follow);
      }
      const s = shotBase(1, kw, c);
      const kd = clamp01((t - T_REAL) / 2);
      s.pos.y += kd * 0.5;
      place(s, 'boom', dt, 0);
    },
    finish() { /* the end cinematic takes the camera; the debris keeps settling */ },
  };
  view.cine = ctl;

  const abort = () => {
    E.phase = 'aborted';
    engine.timeScale = 1;
    cam.fov = fov0;
    cam.updateProjectionMatrix();
    if (ch) ch.speed = 1;
    ctl.done = true;
    ctl.ownsCamera = false;
    if (view.cine === ctl) view.cine = null;
    view.endFx = null;
    stage.end();
    wrap.classList.remove('in');
    wrap.classList.add('out');
    setTimeout(() => wrap.remove(), 500);
    if (sc && !sc.ended) {
      sc.lockInput = E.prevLock ?? null;
      sc.hud?.setCinematic?.(false);
    }
    off();
    cleanup();
    resolveDone();
  };

  // skip: straight to the settled aftermath
  const skip = () => {
    if (E.done || E.phase === 'pre' || E.phase === 'aborted') return;
    E.skipped = true;
    if (E.phase === 'impact') { if (!E.prepped) { E.prepped = true; restore(); prepChunks(); } toCrack(); }
    if (E.phase === 'crack') { lab.root.position.x = x0; toBoom(); }
    // fast-forward the debris and the Commander's flight
    for (let i = 0; i < 80; i++) { updDebris(0.05); updLaunch(0.05); }
    for (const em of E.emit) if (em.once && !em.fired) { em.fired = true; }
    E.t = Math.max(E.t, T_END - 0.05);
    engine.timeScale = 1;
    finish();
  };

  const finish = () => {
    if (E.done) return;
    E.done = true;
    E.phase = 'settle';
    engine.timeScale = 1;
    if (ch) ch.speed = 1;
    if (ch && launch.on && !launch.done) land();
    tag('');
    resolveDone();
  };

  const cleanup = () => {
    for (const d of E.debris) {
      d.mesh.parent?.remove(d.mesh);
      if (d.own) d.mesh.geometry.dispose();
      releaseMesh(d.mesh);
    }
    E.debris.length = 0;
    chunks?.forEach((k) => k.geo.dispose());
    chunks = null;
    E.P.dispose();
  };

  // impact without a pre-roll (a spell, a module, a swing we could not see coming)
  if (!hit) {
    toImpact();
  } else {
    audio.play('slowmo', { vol: 0.9 });
    audio.play('heartbeat', { vol: 0.6 });
    tag(unitName ? `FINAL BLOW  ${unitName.toUpperCase()}` : 'FINAL BLOW');
    captureFrame(view);
  }
  E.toImpact = toImpact;
  E.skip = skip;
  view.fallDone = E.promise;
  if (import.meta.env.DEV) window.__endFx = E;
  return E;
}

/** A pixel fireball: flip-book blast + a hot core + a few flames and sparks (no dark smoke: that comes later, lighter). */
function fireball(p, s = 1) {
  hpx.emit('solid', 'boom', { x: p.x, y: p.y, z: p.z + 0.5, life: 0.5, scale: 1.45 * s, color: 0xff6a1a, fadeOut: 0.8 });
  hpx.emit('glow', 'star', { x: p.x, y: p.y, z: p.z + 0.6, life: 0.1, scale: 1.1 * s, color: 0xffb02e, alpha: 0.7, fadeOut: 0.3 });
  for (let i = 0; i < 2; i++) hpx.emit('solid', 'boom', { x: p.x + rnd(-0.6, 0.6) * s, y: p.y + rnd(-0.2, 0.6) * s, z: p.z + rnd(0.2, 0.7), vy: rnd(0.4, 1.4), life: rnd(0.32, 0.5), scale: rnd(0.6, 1) * s, color: [0xff5a1a, 0xff8a1a, 0xffb42a][i % 3], fadeOut: 0.8 });
  hpx.sparks(p, { count: Math.round(7 * s), speed: 7 * Math.sqrt(s) });
}

/** The enemy closest to the base's face (who most likely landed the hit we could not predict). */
function lastAttacker(sim, side, B) {
  let best = null, bd = 4;
  for (const u of sim.units ?? []) {
    if (u.dead || u.side === side) continue;
    const d = Math.abs(u.x - B.front);
    if (d < bd) { bd = d; best = u; }
  }
  return best;
}

/** A low rumble that swells (procedural; quiet fallback when audio is locked). */
function rumble(dur = 1) {
  if (!audio.ctx || audio.muted) return;
  try {
    audio.noise({ dur, vol: 0.16, type: 'lowpass', f0: 140, f1: 420, attack: dur * 0.8 });
    audio.tone({ type: 'sawtooth', f0: 48, f1: 70, dur, vol: 0.06, lp: 300, hold: dur * 0.6 });
  } catch (e) { /* optional */ }
}

/** view.labDestroyed: the killing blow landed. Resolves when the explosion is over (or skipped). */
export async function labCollapse(view, side) {
  const lab = view.labs[side];
  if (!lab || lab.fallen) return;
  lab.fallen = true;
  view.autoFollow = false;
  let E = view.endFx;
  if (E && E.side === side && E.phase === 'pre') E.toImpact();
  else if (!E || E.phase === 'aborted') E = startEnd(view, side, null);
  await E.promise;
}

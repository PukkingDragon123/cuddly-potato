// Battle Lab building: assembles a style (labStyles.js) into meshes, adds the
// energy core tank (tap target), level lights, damage stages and animation.
import {
  THREE, VoxGrid, VOX, Mats, makeMesh, PAL, mirrorGrid, ring, glassMat, tintMat, glowMat, vnoise, hash3, mulberry32,
  mixHex, clamp,
} from './common.js';
import { LAB_STYLE_BUILDERS } from './labStyles.js';

/** Energy colour per lab level (index 1..8): blue -> pink -> gold. */
export const LEVEL_COLORS = [0x29b6f6, 0x29b6f6, 0x3fd6ff, 0x7a7cff, 0xc455ff, 0xff2e88, 0xff6a5a, 0xffa62a, 0xffd23f];

const OFF_MAT = tintMat(0x56607a);
const OFF_PAIR = [Mats.solid, OFF_MAT];
const PIP_PAIRS = LEVEL_COLORS.map((c) => [Mats.solid, tintMat(c)]);
const CHAR = 0x231a20;
const INNER = 0x3a3346;

// ---------------------------------------------------------------------------
// Grid processing

/** Remove voxels buried deeper than `d` (keeps a skin; cheaper builds/damage). */
function hollow(g, d = 2) {
  const kill = [];
  g.forEach((x, y, z) => {
    for (let i = 1; i <= d; i++) {
      if (!g.has(x + i, y, z) || !g.has(x - i, y, z) || !g.has(x, y + i, z) || !g.has(x, y - i, z) || !g.has(x, y, z + i) || !g.has(x, y, z - i)) return;
    }
    if (!g.has(x + 1, y + 1, z) || !g.has(x - 1, y - 1, z) || !g.has(x, y + 1, z + 1) || !g.has(x, y - 1, z - 1) || !g.has(x + 1, y, z + 1) || !g.has(x - 1, y, z - 1)) return;
    kill.push(x, y, z);
  });
  for (let i = 0; i < kill.length; i += 3) g.del(kill[i], kill[i + 1], kill[i + 2]);
  // darken the inner skin (only visible through damage holes)
  for (let i = 0; i < kill.length; i += 3) {
    const x = kill[i], y = kill[i + 1], z = kill[i + 2];
    for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
      const c = g.get(x + dx, y + dy, z + dz);
      if (c !== undefined && c !== INNER) g.set(x + dx, y + dy, z + dz, INNER);
    }
  }
  return g;
}

/** Progressive battle damage: scorch, cracks, missing chunks. Deterministic per stage. */
function damageGrid(src, stage, seed = 7) {
  const g = src.clone();
  const b = g.bounds();
  const H = b.maxY - b.minY;
  const R = mulberry32(seed);
  const vox = [];
  g.forEach((x, y, z, c, gl) => vox.push([x, y, z, c, gl]));
  const isSurf = (x, y, z) => g.has(x, y, z) && (!g.has(x + 1, y, z) || !g.has(x - 1, y, z) || !g.has(x, y + 1, z) || !g.has(x, y - 1, z) || !g.has(x, y, z + 1) || !g.has(x, y, z - 1));
  // candidate points for bites: exposed edges in the upper 70%
  const cands = [];
  for (const [x, y, z] of vox) {
    if (y < b.minY + H * 0.3) continue;
    let empty = 0;
    if (!src.has(x + 1, y, z)) empty++; if (!src.has(x - 1, y, z)) empty++; if (!src.has(x, y + 1, z)) empty++;
    if (!src.has(x, y, z + 1)) empty++; if (!src.has(x, y, z - 1)) empty++;
    if (empty >= 2) cands.push([x, y, z]);
  }
  const bites = [];
  for (let i = 0; i < 18 && cands.length; i++) bites.push([cands[Math.floor(R() * cands.length)], 1.6 + R() * 2.4]);
  const cracks = [];
  for (let i = 0; i < 14 && cands.length; i++) cracks.push([cands[Math.floor(R() * cands.length)], Math.floor(8 + R() * 14), R() * 1000]);

  // scorch
  const thr = [0, 0.2, 0.31, 0.44][stage];
  for (const [x, y, z, c, gl] of vox) {
    const n = vnoise(x * 0.15 + 3.1, y * 0.15, z * 0.15 + 7.7);
    if (n < thr) {
      const t = clamp((thr - n) / 0.1, 0, 1);
      g.set(x, y, z, mixHex(c, CHAR, 0.3 + 0.5 * t), gl && t < 0.4);
    }
  }
  // cracks (random walks over the surface)
  const nCr = [0, 4, 8, 14][stage];
  const moves = [[1, 0, 0], [-1, 0, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1], [1, -1, 0], [-1, -1, 0], [0, -1, 1], [0, -1, -1], [0, 1, 0]];
  for (let i = 0; i < nCr && i < cracks.length; i++) {
    let [[x, y, z], len, s] = cracks[i];
    const r2 = mulberry32(Math.floor(s));
    for (let k = 0; k < len; k++) {
      if (g.has(x, y, z)) g.set(x, y, z, 0x15101a);
      const opts = moves.filter(([dx, dy, dz]) => isSurf(x + dx, y + dy, z + dz));
      if (!opts.length) break;
      const [dx, dy, dz] = opts[Math.floor(r2() * opts.length)];
      x += dx; y += dy; z += dz;
    }
  }
  // bites
  const nB = [0, 3, 8, 16][stage];
  for (let i = 0; i < nB && i < bites.length; i++) {
    const [[cx, cy, cz], r0] = bites[i];
    const r = r0 * (0.7 + stage * 0.35);
    const rr = r * r, ro = (r + 1.6) * (r + 1.6);
    for (let x = Math.floor(cx - r - 2); x <= cx + r + 2; x++)
      for (let y = Math.floor(cy - r - 2); y <= cy + r + 2; y++)
        for (let z = Math.floor(cz - r - 2); z <= cz + r + 2; z++) {
          const d = (x - cx) ** 2 + (y - cy) ** 2 * 1.2 + (z - cz) ** 2;
          const jag = hash3(x, y, z) * 2.2;
          if (d < rr + jag) g.del(x, y, z);
          else if (d < ro && g.has(x, y, z)) g.set(x, y, z, mixHex(g.get(x, y, z), CHAR, 0.55), false);
        }
  }
  return g;
}

/** Rubble pile left when the lab is destroyed. */
function rubbleGrid(cols, frame, seed = 3) {
  const g = new VoxGrid();
  const R = mulberry32(seed);
  const pick = () => cols[Math.floor(R() * cols.length)];
  for (let x = -21; x <= 19; x++)
    for (let z = -15; z <= 17; z++) {
      const d = ((x + 1) / 20) ** 2 + ((z - 1) / 16) ** 2;
      if (d > 1.05) continue;
      const h = Math.max(0, Math.round((1 - d) * 10 * (0.5 + 0.8 * vnoise(x * 0.22, 1, z * 0.22))));
      for (let y = 0; y <= h; y++) g.set(x, y, z, hash3(x >> 1, y, z >> 1) < 0.1 ? CHAR : cols[Math.floor(hash3(x >> 2, y >> 1, z >> 2) * cols.length)]);
    }
  for (let i = 0; i < 26; i++) {
    const x = Math.floor(-17 + R() * 32), z = Math.floor(-12 + R() * 24);
    let y = 0;
    while (g.has(x, y, z)) y++;
    const w = 1 + Math.floor(R() * 4), h = 1 + Math.floor(R() * 3), d = 1 + Math.floor(R() * 4);
    g.box(x, y - 1, z, x + w, y - 1 + h, z + d, pick());
  }
  // rebar / bent pipes
  for (let i = 0; i < 8; i++) {
    const x = Math.floor(-15 + R() * 28), z = Math.floor(-10 + R() * 20);
    let y = 0;
    while (g.has(x, y, z)) y++;
    g.line(x, y - 1, z, x + Math.round((R() - 0.5) * 8), y + 2 + Math.floor(R() * 6), z + Math.round((R() - 0.5) * 8), PAL.metalD);
  }
  // broken tank base
  g.cylinder(6, 18, 0, 3, 5, frame);
  g.carve((x, y, z) => y >= 2 && (x - 6) ** 2 + (z - 18) ** 2 < 12);
  g.carve((x, y, z) => y === 3 && hash3(x, y, z) < 0.5 && (x - 6) ** 2 + (z - 18) ** 2 < 30);
  for (let i = 0; i < 10; i++) g.set(Math.floor(2 + R() * 9), 0, Math.floor(14 + R() * 9), PAL.glass);
  return g;
}

// ---------------------------------------------------------------------------
// Energy core tank parts (local, base centre = origin)
const TANK_R = 4;
const GLASS_Y0 = 4, GLASS_Y1 = 15, CORE_MID = 9.5;
const RING_YS = [6, 10, 14];
const coreCache = new Map();
function coreGeos(c) {
  const k = `${c.frame}|${c.frameD}|${c.trim}`;
  if (coreCache.has(k)) return coreCache.get(k);
  const R = TANK_R;
  const caps = new VoxGrid();
  caps.cylinder(0, 0, 0, 3, R + 1, c.frameD);
  ring(caps, 0, 0, 2, 2, R + 1, c.trim);
  caps.cylinder(0, 0, 3, 3, R + 1, c.frame);
  for (let x = -2; x <= 2; x++) caps.set(x, 1, R + 1, x % 2 ? PAL.ink : c.trim);
  caps.cylinder(0, 0, 16, 19, R + 1, c.frame);
  ring(caps, 0, 0, 17, 17, R + 1, c.trim);
  caps.cylinder(0, 0, 16, 16, R + 1, c.frameD);
  caps.cylinder(0, 0, 20, 20, R - 1, c.frameD);
  caps.cylinder(0, 0, 21, 22, 1, c.frame);
  // struts (sides + back so they don't hide the core)
  for (const [x, z] of [[-R - 1, 0], [R + 1, 0], [0, -R - 1]]) caps.box(x, 4, z, x, 15, z, c.frameD);
  // bolts
  for (let a = 0; a < 12; a++) {
    const t = (a / 12) * Math.PI * 2;
    caps.set(Math.round(Math.cos(t) * (R + 1.4)), 18, Math.round(Math.sin(t) * (R + 1.4)), c.frameD);
  }
  const opts = { pivot: [0.5, 0, 0.5] };
  const ringG = new VoxGrid();
  ring(ringG, 0, 0, 0, 0, R + 1, 0xffffff, true);
  const orb = new VoxGrid();
  orb.sphere(0, 0, 0, 2.6, 0xd8d8d8, true);
  orb.sphere(0, 0, 0, 1.6, 0xffffff, true);
  for (const [x, y, z] of [[0, 4, 0], [0, -4, 0], [4, 0, 0], [-4, 0, 0], [0, 0, 4], [0, 0, -4]]) orb.set(x, y, z, 0xffffff, true);
  const beam = new VoxGrid();
  beam.box(0, GLASS_Y0, 0, 0, GLASS_Y1, 0, 0xdddddd, true);
  const pip = new VoxGrid();
  pip.box(-1, 0, 0, 0, 1, 0, 0xffffff, true);
  const out = {
    caps: caps.build(opts),
    ring: ringG.build({ pivot: [0.5, 0, 0.5] }),
    orb: orb.build({ pivot: [0.5, 0.5, 0.5] }),
    beam: beam.build(opts),
    pip: pip.build({ pivot: [0, 0, 0] }),
  };
  coreCache.set(k, out);
  return out;
}

// ---------------------------------------------------------------------------
const defCache = new Map();
const FLAME = (() => {
  const g = new VoxGrid();
  g.box(-1, 0, -1, 1, 1, 1, 0xff5a1a, true);
  g.box(-1, 2, 0, 1, 2, 0, 0xff8a2a, true).box(0, 2, -1, 0, 2, 1, 0xff8a2a, true);
  g.set(0, 3, 0, 0xffd23f, true).set(0, 4, 0, 0xfff2a0, true).set(1, 3, 0, 0xffb02a, true);
  return g.build({ scale: 0.09, pivot: [0.5, 0, 0.5] });
})();
const SPARK_GEO = new THREE.BoxGeometry(0.05, 0.05, 0.05);
const BEACON_GEO = new THREE.BoxGeometry(0.14, 0.14, 0.14);
const BUBBLE_GEO = new THREE.BoxGeometry(0.05, 0.05, 0.05);
const BUBBLE_MAT = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75, depthWrite: false });

function labDef(style, flip) {
  const key = style + (flip ? ':f' : '');
  if (defCache.has(key)) return defCache.get(key);
  const build = LAB_STYLE_BUILDERS[style] ?? LAB_STYLE_BUILDERS.default;
  const d = build(flip);
  // gauge frame for the 8 level pips
  const cy = d.core.at[1];
  const gx = d.gauge.x;
  d.body.box(gx, cy + 1, 13, gx + 3, cy + 25, 13, d.gauge.frame);
  d.body.box(gx, cy + 26, 13, gx + 3, cy + 26, 13, d.core.trim);
  const mir = (g) => (flip ? mirrorGrid(g) : g);
  const fx = (v) => (flip ? -v : v) * VOX;
  const W = (p) => [fx(p[0]), p[1] * VOX, p[2] * VOX];
  const P0 = { pivot: [0, 0, 0], maxSamples: 420 };
  const bodyGrid = hollow(mir(d.body));
  const bodyGeos = [bodyGrid.build(P0)];
  const def = {
    style, flip,
    bodyGeo(s) {
      if (!bodyGeos[s]) bodyGeos[s] = hollow(damageGrid(bodyGrid, s, 11 + style.length)).build(P0);
      return bodyGeos[s];
    },
    rubbleGeo() {
      if (!this._rubble) this._rubble = mir(rubbleGrid(d.rubble, d.core.frameD, 5 + style.length)).build({ ...P0, maxSamples: 300 });
      return this._rubble;
    },
    chunks: d.chunks.map((c) => ({ name: c.name, stage: c.stage, geo: mir(c.grid).build({ ...P0, maxSamples: 160 }) })),
    anims: d.anims.map((a) => ({
      ...a, pos: W(a.at), geo: mir(a.grid).build({ pivot: [flip ? -0.5 : 0.5, 0, 0.5], maxSamples: 80 }),
    })),
    beacons: d.beacons.map((b) => ({ ...b, pos: W(b.at) })),
    core: { ...d.core, pos: W(d.core.at), geos: coreGeos(d.core) },
    pips: Array.from({ length: 8 }, (_, i) => W([gx + 2, cy + 2 + i * 3, 13.5])),
    seat: W(d.seat),
    fires: d.fires.map(W),
    sparks: d.sparks.map(W),
  };
  // dims
  const bb = bodyGrid.bounds();
  def.width = (bb.maxX - bb.minX + 1) * VOX;
  let top = (bb.maxY + 1) * VOX;
  for (const c of d.chunks) top = Math.max(top, (c.grid.bounds().maxY + 1) * VOX);
  for (const a of def.anims) top = Math.max(top, a.pos[1] + (a.grid.bounds().maxY + 1) * VOX);
  def.height = top;
  defCache.set(key, def);
  return def;
}

/** Pre-build damage/rubble geometry for a style when the browser is idle. */
function prewarm(def) {
  if (def._warm) return;
  def._warm = true;
  const ric = typeof requestIdleCallback === 'function' ? requestIdleCallback : (f) => setTimeout(f, 400);
  let s = 1;
  const step = () => {
    if (s <= 3) def.bodyGeo(s++);
    else { def.rubbleGeo(); return; }
    ric(step);
  };
  ric(step);
}

/**
 * Battle Lab building.
 * @returns {{root, seat, core, height, width, meshes, setLevel(n), setDamage(f), update(dt), onChunk}}
 * `onChunk(mesh)` (optional, assign it) is called right before a piece breaks off / hides so the
 * battle view can fx.shatter() it.
 */
export function makeLabBuilding({ style = 'default', flip = false } = {}) {
  const D = labDef(style, flip);
  prewarm(D);
  const root = new THREE.Group();
  root.name = `lab:${style}`;
  const meshes = [];
  const body = makeMesh(D.bodyGeo(0));
  body.receiveShadow = true;
  root.add(body);
  meshes.push(body);
  const chunks = D.chunks.map((c) => {
    const m = makeMesh(c.geo);
    m.name = c.name;
    root.add(m);
    meshes.push(m);
    return { mesh: m, obj: m, stage: c.stage };
  });
  const anims = D.anims.map((a) => {
    const grp = new THREE.Group();
    grp.position.set(...a.pos);
    const m = makeMesh(a.geo);
    if (a.type === 'flag') m.position.x = flip ? -VOX : VOX;
    grp.add(m);
    root.add(grp);
    meshes.push(m);
    return { ...a, grp, mesh: m, obj: grp, phase: Math.random() * 6 };
  });
  const beacons = D.beacons.map((b) => {
    const m = new THREE.Mesh(BEACON_GEO, glowMat(b.color));
    m.position.set(...b.pos);
    root.add(m);
    return { ...b, mesh: m, alive: true, phase: Math.random() };
  });

  // --- energy core
  const G = D.core.geos;
  const core = new THREE.Group();
  core.name = 'labCore';
  core.position.set(D.core.pos[0], D.core.pos[1] + CORE_MID * VOX, D.core.pos[2]);
  root.add(core);
  const base = new THREE.Group();
  base.position.y = -CORE_MID * VOX;
  core.add(base);
  const caps = makeMesh(G.caps);
  base.add(caps);
  meshes.push(caps);
  const litMat = tintMat(LEVEL_COLORS[1]);
  const litPair = [Mats.solid, litMat];
  const orbMat = tintMat(0xffffff);
  const orb = makeMesh(G.orb, [Mats.solid, orbMat]);
  orb.castShadow = false;
  orb.position.y = CORE_MID * VOX;
  base.add(orb);
  const beam = makeMesh(G.beam, [Mats.solid, orbMat]);
  beam.castShadow = false;
  base.add(beam);
  const rings = RING_YS.map((y) => {
    const r = makeMesh(G.ring, OFF_PAIR);
    r.castShadow = false;
    r.position.y = y * VOX;
    base.add(r);
    return r;
  });
  const gh = (GLASS_Y1 - GLASS_Y0 + 1) * VOX;
  const liquidMat = new THREE.MeshPhongMaterial({ color: LEVEL_COLORS[1], transparent: true, opacity: 0.32, depthWrite: false, shininess: 60 });
  const liquid = new THREE.Mesh(new THREE.CylinderGeometry((TANK_R - 0.2) * VOX, (TANK_R - 0.2) * VOX, gh * 0.86, 14), liquidMat);
  liquid.position.y = GLASS_Y0 * VOX + gh * 0.43;
  liquid.renderOrder = 2;
  base.add(liquid);
  const glass = new THREE.Mesh(new THREE.CylinderGeometry((TANK_R + 0.55) * VOX, (TANK_R + 0.55) * VOX, gh, 16, 1, true), glassMat(0xd8f4ff, 0.22));
  glass.position.y = GLASS_Y0 * VOX + gh / 2;
  glass.renderOrder = 3;
  base.add(glass);
  const bubbles = [];
  for (let i = 0; i < 8; i++) {
    const b = new THREE.Mesh(BUBBLE_GEO, BUBBLE_MAT);
    b.userData = { sp: 0.3 + Math.random() * 0.5, ph: Math.random() * 6, r: Math.random() * 0.26, a: Math.random() * 6 };
    b.position.y = GLASS_Y0 * VOX + Math.random() * gh * 0.8;
    b.renderOrder = 2;
    base.add(b);
    bubbles.push(b);
  }
  const pips = D.pips.map((p) => {
    const m = makeMesh(G.pip, OFF_PAIR);
    m.castShadow = false;
    m.position.set(p[0] - core.position.x, p[1] - core.position.y, p[2] - core.position.z);
    core.add(m);
    return m;
  });

  // --- seat (commander on the roof, legs over the front edge)
  const seat = new THREE.Object3D();
  seat.name = 'labSeat';
  seat.position.set(...D.seat);
  seat.rotation.y = (flip ? -1 : 1) * (Math.PI / 2 - 0.45);
  root.add(seat);

  // --- damage fx
  const sparkGrp = new THREE.Group();
  sparkGrp.visible = false;
  const sparks = D.sparks.map((p) => {
    const g = new THREE.Group();
    g.position.set(...p);
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Mesh(SPARK_GEO, glowMat(i ? 0xffe680 : 0xffffff));
      g.add(s);
    }
    sparkGrp.add(g);
    return g;
  });
  root.add(sparkGrp);
  const fireGrp = new THREE.Group();
  fireGrp.visible = false;
  const fires = D.fires.map((p, i) => {
    const f = new THREE.Mesh(FLAME, Mats.pair);
    f.position.set(...p);
    f.userData.ph = i * 1.7;
    fireGrp.add(f);
    return f;
  });
  root.add(fireGrp);
  let rubble = null;

  let t = Math.random() * 10;
  const lab = {
    root, seat, core, meshes, style, flip,
    height: D.height, width: D.width,
    level: 1, damage: 0, stage: 0,
    onChunk: null,
    glass, liquid, orb,
    setLevel(n) {
      n = clamp(Math.round(n) || 1, 1, 8);
      this.level = n;
      const col = LEVEL_COLORS[n];
      litMat.color.setHex(col);
      litMat.userData.base = col;
      orbMat.color.setHex(mixHex(col, 0xffffff, 0.12));
      liquidMat.color.setHex(col);
      liquidMat.emissive.setHex(mixHex(col, 0x000000, 0.65));
      pips.forEach((p, i) => (p.material = i < n ? PIP_PAIRS[i + 1] : OFF_PAIR));
      const lit = n <= 2 ? 1 : n <= 5 ? 2 : 3;
      rings.forEach((r, i) => (r.material = i < lit ? litPair : OFF_PAIR));
      orb.userData.s = 0.62 + n * 0.055;
    },
    setDamage(f) {
      f = clamp(f || 0, 0, 1);
      this.damage = f;
      const s = f >= 1 ? 4 : f >= 0.9 ? 3 : f >= 0.66 ? 2 : f >= 0.33 ? 1 : 0;
      if (s === this.stage) return;
      this.stage = s;
      const emit = (m) => { if (this.onChunk && m.visible) this.onChunk(m); };
      if (s === 4) {
        emit(body);
        for (const c of chunks) if (c.obj.visible) emit(c.mesh);
        for (const a of anims) if (a.grp.visible) emit(a.mesh);
        if (core.visible) emit(caps);
        body.visible = false;
        core.visible = false;
        for (const c of chunks) c.obj.visible = false;
        for (const a of anims) a.grp.visible = false;
        for (const b of beacons) b.mesh.visible = b.alive = false;
        sparkGrp.visible = false;
        fireGrp.visible = false;
        if (!rubble) {
          rubble = makeMesh(D.rubbleGeo());
          rubble.receiveShadow = true;
          root.add(rubble);
          meshes.push(rubble);
        }
        rubble.visible = true;
        return;
      }
      if (rubble) rubble.visible = false;
      body.visible = true;
      core.visible = true;
      body.geometry = D.bodyGeo(s);
      for (const c of chunks) {
        const hide = c.stage <= s;
        if (hide) emit(c.mesh);
        c.obj.visible = !hide;
      }
      for (const a of anims) {
        const hide = a.stage <= s;
        if (hide) emit(a.mesh);
        a.grp.visible = !hide;
      }
      for (const b of beacons) b.alive = b.stage > s;
      sparkGrp.visible = s >= 1;
      fireGrp.visible = s >= 2;
    },
    update(dt) {
      t += dt;
      const lv = this.level;
      // core
      orb.rotation.y += dt * (1.2 + lv * 0.3);
      orb.rotation.x = Math.sin(t * 0.7) * 0.4;
      const pulse = 1 + Math.sin(t * (3 + lv * 0.4)) * 0.07;
      orb.scale.setScalar((orb.userData.s ?? 0.77) * pulse);
      orb.position.y = CORE_MID * VOX + Math.sin(t * 1.3) * 0.05;
      beam.scale.set(1 + Math.sin(t * 17) * 0.4, 1, 1 + Math.cos(t * 13) * 0.4);
      const k = 0.78 + 0.22 * Math.sin(t * 4);
      litMat.color.setHex(litMat.userData.base ?? LEVEL_COLORS[1]).multiplyScalar(k);
      if (this.stage >= 3) orb.visible = Math.random() > 0.25;
      else orb.visible = true;
      const top = GLASS_Y1 * VOX - 0.05;
      for (const b of bubbles) {
        const u = b.userData;
        b.position.y += dt * u.sp * (0.6 + lv * 0.12);
        if (b.position.y > top) { b.position.y = GLASS_Y0 * VOX + 0.05; u.r = Math.random() * 0.26; u.a = Math.random() * 6; }
        b.position.x = Math.cos(u.a) * u.r + Math.sin(t * 3 + u.ph) * 0.03;
        b.position.z = Math.sin(u.a) * u.r;
      }
      // anims
      for (const a of anims) {
        if (!a.grp.visible) continue;
        if (a.type === 'spin') a.grp.rotation.y += dt * (a.speed ?? 1);
        else if (a.type === 'flag') {
          a.grp.rotation.y = Math.sin(t * 3 + a.phase) * 0.35 * (flip ? -1 : 1);
          a.mesh.scale.y = 1 + Math.sin(t * 6 + a.phase) * 0.05;
        }
      }
      for (const b of beacons) b.mesh.visible = b.alive && ((t * 1.4 + b.phase) % 1) < 0.55;
      if (sparkGrp.visible) {
        for (const g of sparks) {
          const on = Math.random() < 0.3;
          g.visible = on;
          if (on) for (const s of g.children) s.position.set((Math.random() - 0.5) * 0.3, (Math.random() - 0.3) * 0.3, (Math.random() - 0.2) * 0.2);
        }
      }
      if (fireGrp.visible) {
        for (const f of fires) {
          const ph = f.userData.ph;
          f.scale.set(1 + Math.sin(t * 11 + ph) * 0.15, 0.8 + Math.abs(Math.sin(t * 7 + ph)) * 0.6, 1 + Math.cos(t * 9 + ph) * 0.15);
        }
      }
    },
  };
  lab.setLevel(1);
  return lab;
}

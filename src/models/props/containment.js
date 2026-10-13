// MEGA-TECH containment vessel: the giant branded MrBeast Lab cup the MEGA
// ultimates break out of (the real 9" MEGA-TECH Mutators come in a
// water-activated containment vessel: pour liquid in, the figure breaks out).
//
//   * voxel metal base: rubber foot, hazard-striped band, MEGA-TECH logo plate,
//     floor grate, warning lights and a glowing seat ring
//   * clear glass cylinder (transparent, so the figure inside is visible) with
//     highlight streaks, held by four magenta-striped struts
//   * voxel lid: hazard band, MEGA-TECH bolt plate, a water-inlet cup and a
//     rotating warning beacon
//   * water that fills up (bubbles + a pour stream from the inlet), a crack
//     network that spreads across the glass, and a burst into glass shards
//
// makeContainment(opts) -> {
//   root, height, interior: { floorY, topY, radius },
//   update(dt), setFill(k 0..1), setCrack(k 0..1), setGlow(k 0..1+), setRumble(k 0..1),
//   burst(opts) -> shard meshes, dispose()
// }
// opts: { height = 7 (world units, everything scales with it), accent (bolt /
// glow colour), liquid (water colour), beacon (beacon colour) }
//
// Model space: y = 0 is the ground, the vessel is centred on x/z and its logos
// face +Z. The figure stands at interior.floorY (inside radius interior.radius,
// up to interior.topY).
import * as THREE from 'three';
import { Mats, makeMesh } from '../../core/voxel.js';
import { G, blob, rbox, cyl, stamp, shade, n3 } from '../kit.js';
import { text, textW } from './common.js';

const V = 0.065; // voxel size at the default 7-unit height
const H0 = 7; // design height
const INK = 0x15121f, MAG = 0xff1f9e, YEL = 0xffd23f, WHITE = 0xf4f6fa;
const METAL = 0xb9c3d6, METAL_L = 0xdfe5ef, METAL_D = 0x6f7a92, METAL_DD = 0x3c4356, RUBBER = 0x1b1d26, NAVY = 0x1e2547;

// layout in voxels (V)
const L = {
  baseTop: 9, // glass seats here; the figure stands on this floor
  glassTop: 96, // lid starts here
  glassR: 31, // glass radius
  baseR: 33,
  strutR: 33.2,
  lidH: 10,
};

const INLET = [13.5, 16.5]; // water-inlet cup on the lid (front-right, so the pour stream shows)
const BOLT = ['..MMM', '.MMM.', 'MMM..', 'MMMMM', '..MM.', '.MM..', 'MM...'];
const hazard = (u, y) => ((Math.floor((u + y) / 2) & 1) ? YEL : INK);

// ---------------------------------------------------------------------------
// Voxel parts (built once, cached)

function baseGrid() {
  const g = G();
  const R = L.baseR;
  cyl(g, 'y', -0.5, -0.5, 0, 1, R + 0.6, R + 0.6, RUBBER); // rubber foot
  cyl(g, 'y', -0.5, -0.5, 2, L.baseTop, R, R, (x, y, z) => {
    const a = Math.atan2(z + 0.5, x + 0.5);
    const u = Math.round(a * R);
    if (y === 2) return METAL_DD;
    if (y >= 4 && y <= 6) return hazard(u, y);
    if (y === L.baseTop) return METAL_L;
    return n3(x, y, z) < 0.08 ? METAL_D : METAL;
  });
  // floor grate inside the glass ring
  cyl(g, 'y', -0.5, -0.5, L.baseTop, L.baseTop, L.glassR - 1, L.glassR - 1, (x, y, z) => {
    const d = Math.hypot(x + 0.5, z + 0.5);
    if (Math.round(d) % 6 === 0) return METAL_D;
    return ((x + z + 64) % 4 === 0 || (x - z + 64) % 4 === 0) ? METAL_DD : NAVY;
  });
  // bolt badge in the middle of the floor
  stamp(g, BOLT, { M: { c: MAG } }, { axis: 'y', x: -3, z: -4 });
  // bolt heads around the rim
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    g.set(Math.round(Math.cos(a) * (R - 0.6) - 0.5), L.baseTop + 1, Math.round(Math.sin(a) * (R - 0.6) - 0.5), METAL_D);
  }
  // MEGA-TECH logo plate on the front
  const word = 'MEGA-TECH';
  const w = textW(word);
  const x0 = -Math.ceil(w / 2) - 7, x1 = Math.floor(w / 2) + 6;
  rbox(g, x0, 1, R - 2, x1, L.baseTop + 1, R + 1, 1, INK);
  rbox(g, x0 + 1, 2, R + 2, x1 - 1, L.baseTop, R + 2, 0, NAVY);
  text(g, word, 0, 3, R + 3, '+z', WHITE, { center: true });
  stamp(g, BOLT, { M: { c: MAG, raise: 1 } }, { axis: 'z', x: x0 + 1, y: 9, zmin: R });
  stamp(g, BOLT.map((r) => [...r].reverse().join('')), { M: { c: MAG, raise: 1 } }, { axis: 'z', x: x1 - 5, y: 9, zmin: R });
  // side vents
  for (const s of [-1, 1]) for (let y = 3; y <= 7; y += 2) for (let z = -6; z <= 5; z++) g.set(s < 0 ? -R - 1 : R, y, z, METAL_DD);
  return g;
}

function strutGrid() {
  const g = G();
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    const cx = Math.cos(a) * L.strutR - 0.5, cz = Math.sin(a) * L.strutR - 0.5;
    const ox = Math.cos(a), oz = Math.sin(a);
    for (let y = L.baseTop + 1; y <= L.glassTop - 1; y++) for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const x = Math.round(cx + dx), z = Math.round(cz + dz);
      // the outer face of the strut carries a magenta Mega-Tech stripe
      const outer = (x + 0.5 - cx) * ox + (z + 0.5 - cz) * oz > 0.9;
      const clamp = y <= L.baseTop + 3 || y >= L.glassTop - 3;
      g.set(x, y, z, clamp ? METAL_DD : outer && y % 9 !== 0 ? MAG : METAL_D);
    }
    // clamp collars
    for (const y of [L.baseTop + 2, L.glassTop - 2]) blob(g, cx, y, cz, 2.2, 1, 2.2, METAL);
  }
  return g;
}

function lidGrid() {
  const g = G();
  const R = L.baseR, H = L.lidH;
  cyl(g, 'y', -0.5, -0.5, 0, 1, R, R, METAL_DD); // rim
  cyl(g, 'y', -0.5, -0.5, 2, 4, R, R, (x, y, z) => hazard(Math.round(Math.atan2(z + 0.5, x + 0.5) * R), y));
  cyl(g, 'y', -0.5, -0.5, 5, 6, R - 0.5, R - 0.5, (x, y, z) => (n3(x, y, z) < 0.08 ? METAL_D : METAL));
  blob(g, -0.5, 6, -0.5, R - 2.5, H - 6.5, R - 2.5, (x, y) => (y >= H - 1 ? METAL_L : METAL), { p: 2.6, clip: (x, y) => y < 7 });
  // vent ring
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const x = Math.round(Math.cos(a) * (R - 5) - 0.5), z = Math.round(Math.sin(a) * (R - 5) - 0.5);
    let top = H + 2;
    while (top > 0 && !g.has(x, top, z)) top--;
    g.set(x, top, z, METAL_DD);
  }
  // MEGA-TECH bolt plate on the front of the lid
  rbox(g, -13, 0, R - 1, 12, 8, R + 1, 1, INK);
  stamp(g, BOLT, { M: { c: MAG, raise: 1 } }, { axis: 'z', x: -12, y: 7, zmin: R });
  stamp(g, BOLT.map((r) => [...r].reverse().join('')), { M: { c: MAG, raise: 1 } }, { axis: 'z', x: 7, y: 7, zmin: R });
  text(g, 'MEGA', 0, 2, R + 2, '+z', WHITE, { center: true });
  // water-inlet cup (pour the liquid in here)
  const [cx, cz] = INLET;
  cyl(g, 'y', cx, cz, 5, H + 4, 5.4, 6.4, (x, y) => (y >= H + 3 ? 0x2a8cff : y === H + 1 ? WHITE : 0x1d6fd8), { hollow: 1.2 });
  cyl(g, 'y', cx, cz, H + 1, H + 1, 4, 4, 0x0b1a40);
  // beacon socket
  cyl(g, 'y', -0.5, -0.5, H, H + 2, 3.6, 3.6, METAL_DD);
  return g;
}

let geoCache = null;
function geos() {
  if (geoCache) return geoCache;
  const b = (g, n = 160) => g.build({ scale: V, pivot: [0, 0, 0], jitter: 0.02, maxSamples: n });
  geoCache = { base: b(baseGrid(), 260), struts: b(strutGrid(), 80), lid: b(lidGrid(), 200) };
  return geoCache;
}

// ---------------------------------------------------------------------------
// Crack network (cylindrical coords: a = angle, y = height), revealed by distance

function crackSegments(R, y0, y1, seed = 1) {
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const segs = []; // [a0, y0, a1, y1, reveal, width]
  const front = Math.PI / 2; // +Z
  const impacts = [
    { a: front + 0.18, y: y0 + (y1 - y0) * 0.55, delay: 0 },
    { a: front - 0.42, y: y0 + (y1 - y0) * 0.3, delay: 0.22 },
    { a: front + 0.75, y: y0 + (y1 - y0) * 0.78, delay: 0.38 },
    { a: front - Math.PI + 0.3, y: y0 + (y1 - y0) * 0.5, delay: 0.45 },
  ];
  for (const imp of impacts) {
    const spokes = 7 + Math.floor(rnd() * 3);
    const ends = [];
    for (let i = 0; i < spokes; i++) {
      let dir = (i / spokes) * Math.PI * 2 + rnd() * 0.5;
      let a = imp.a, y = imp.y, d = 0;
      const len = 1.1 + rnd() * 1.9;
      const pts = [];
      while (d < len) {
        const step = 0.12 + rnd() * 0.1;
        dir += (rnd() - 0.5) * 0.7;
        const na = a + (Math.cos(dir) * step) / R, ny = y + Math.sin(dir) * step;
        if (ny < y0 + 0.05 || ny > y1 - 0.05) break;
        d += step;
        segs.push([a, y, na, ny, imp.delay + (d / 3) * (1 - imp.delay), 0.045 * (1 - d / (len + 0.4)) + 0.012]);
        pts.push([na, ny, d]);
        a = na; y = ny;
        // side branches
        if (rnd() < 0.12) {
          let bd = dir + (rnd() < 0.5 ? 1 : -1) * (0.6 + rnd() * 0.5), ba = a, by = y, bl = 0;
          const blen = 0.3 + rnd() * 0.6;
          while (bl < blen) {
            const st = 0.1 + rnd() * 0.08;
            bd += (rnd() - 0.5) * 0.6;
            const na2 = ba + (Math.cos(bd) * st) / R, ny2 = by + Math.sin(bd) * st;
            if (ny2 < y0 + 0.05 || ny2 > y1 - 0.05) break;
            bl += st;
            segs.push([ba, by, na2, ny2, imp.delay + ((d + bl) / 3) * (1 - imp.delay), 0.016]);
            ba = na2; by = ny2;
          }
        }
      }
      ends.push(pts);
    }
    // concentric web rings joining neighbouring spokes
    for (const ring of [0.28, 0.6, 1.0]) {
      for (let i = 0; i < ends.length; i++) {
        const A = ends[i].find((p) => p[2] >= ring), B = ends[(i + 1) % ends.length].find((p) => p[2] >= ring);
        if (!A || !B || rnd() < 0.25) continue;
        const ma = (A[0] + B[0]) / 2 + (rnd() - 0.5) * 0.02, my = (A[1] + B[1]) / 2 + (rnd() - 0.5) * 0.08;
        const rv = imp.delay + (ring / 3) * (1 - imp.delay) + 0.04;
        segs.push([A[0], A[1], ma, my, rv, 0.014], [ma, my, B[0], B[1], rv + 0.02, 0.014]);
      }
    }
  }
  segs.sort((p, q) => p[4] - q[4]);
  return segs;
}

function crackGeometry(segs, R) {
  const pos = [], idx = [];
  const p0 = new THREE.Vector3(), p1 = new THREE.Vector3(), dir = new THREE.Vector3(), nrm = new THREE.Vector3(), side = new THREE.Vector3();
  const at = (a, y, out) => out.set(Math.cos(a) * R, y, Math.sin(a) * R);
  for (const [a0, y0, a1, y1, , w] of segs) {
    at(a0, y0, p0); at(a1, y1, p1);
    dir.subVectors(p1, p0).normalize();
    nrm.set(Math.cos((a0 + a1) / 2), 0, Math.sin((a0 + a1) / 2));
    side.crossVectors(nrm, dir).normalize().multiplyScalar(w / 2);
    const v = pos.length / 3;
    pos.push(p0.x - side.x, p0.y - side.y, p0.z - side.z, p0.x + side.x, p0.y + side.y, p0.z + side.z,
      p1.x + side.x, p1.y + side.y, p1.z + side.z, p1.x - side.x, p1.y - side.y, p1.z - side.z);
    idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  return geo;
}

/** A few irregular flat shard outlines (unit size), shared. */
let shardShapes = null;
function shardGeos() {
  if (shardShapes) return shardShapes;
  let s = 7;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  shardShapes = [];
  for (let i = 0; i < 8; i++) {
    const n = 3 + (i % 3);
    const shape = new THREE.Shape();
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + rnd() * 0.6;
      const r = 0.35 + rnd() * 0.3;
      const x = Math.cos(a) * r * (0.6 + (i % 2) * 0.5), y = Math.sin(a) * r * (1.3 - (i % 2) * 0.4);
      if (k === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
    }
    shape.closePath();
    shardShapes.push(new THREE.ShapeGeometry(shape));
  }
  return shardShapes;
}

// ---------------------------------------------------------------------------

export function makeContainment(opts = {}) {
  return new Containment(opts);
}

class Containment {
  constructor(opts) {
    this.opts = opts;
    const S = (opts.height ?? H0) / H0;
    this.scale = S;
    this.accent = new THREE.Color(opts.accent ?? 0xff3fc0);
    this.liquid = new THREE.Color(opts.liquid ?? 0x52d6ff);
    this.disposables = [];
    this.root = new THREE.Group();
    this.root.name = 'containment';
    this.body = new THREE.Group(); // rumbles
    this.body.scale.setScalar(S);
    this.root.add(this.body);
    const g = geos();
    const glassY0 = L.baseTop * V + V, glassY1 = L.glassTop * V;
    const R = L.glassR * V;
    this.dims = { glassY0, glassY1, R };

    // ---- metal base, struts
    const base = makeMesh(g.base, Mats.toyPair);
    base.receiveShadow = true;
    this.body.add(base);
    this.struts = makeMesh(g.struts, Mats.toyPair);
    this.body.add(this.struts);
    // glowing seat ring + under-glow on the floor
    this.ringMat = this.mat(new THREE.MeshBasicMaterial({ color: this.accent, toneMapped: false, transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide }));
    const ringGeo = this.geo(new THREE.RingGeometry(R - 0.05, R + 0.06, 48));
    const ring = new THREE.Mesh(ringGeo, this.ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = glassY0 + 0.004;
    ring.renderOrder = 3;
    this.body.add(ring);
    // warning lights on the base rim (blink)
    this.lightMats = [this.mat(new THREE.MeshBasicMaterial({ color: 0xffb020, toneMapped: false })), this.mat(new THREE.MeshBasicMaterial({ color: 0xff3a3a, toneMapped: false }))];
    const bulbGeo = this.geo(new THREE.SphereGeometry(0.11, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2));
    this.bulbs = [];
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + (i * Math.PI) / 2 + Math.PI / 4;
      const m = new THREE.Mesh(bulbGeo, this.lightMats[i % 2]);
      m.position.set(Math.cos(a) * (L.baseR - 1.6) * V, (L.baseTop + 1) * V, Math.sin(a) * (L.baseR - 1.6) * V);
      this.body.add(m);
      this.bulbs.push(m);
    }

    // ---- water (fills up), surface, bubbles, pour stream
    const wg = this.geo(new THREE.CylinderGeometry(R - 0.035, R - 0.035, 1, 40, 1, true));
    wg.translate(0, 0.5, 0);
    this.waterMat = this.mat(new THREE.MeshStandardMaterial({
      color: this.liquid, emissive: this.liquid, emissiveIntensity: 0.12, transparent: true, opacity: 0.32, roughness: 0.08, metalness: 0, depthWrite: false, side: THREE.DoubleSide,
    }));
    this.water = new THREE.Mesh(wg, this.waterMat);
    this.water.position.y = glassY0;
    this.water.renderOrder = 2;
    this.body.add(this.water);
    this.surfMat = this.mat(new THREE.MeshStandardMaterial({
      color: this.liquid.clone().lerp(new THREE.Color(0xffffff), 0.45), emissive: this.liquid, emissiveIntensity: 0.15, transparent: true, opacity: 0.5, roughness: 0.05, depthWrite: false, side: THREE.DoubleSide,
    }));
    this.surface = new THREE.Mesh(this.geo(new THREE.CircleGeometry(R - 0.035, 40)), this.surfMat);
    this.surface.rotation.x = -Math.PI / 2;
    this.surface.renderOrder = 2;
    this.body.add(this.surface);
    const bubGeo = this.geo(new THREE.IcosahedronGeometry(0.06, 1));
    this.bubMat = this.mat(new THREE.MeshBasicMaterial({ color: 0xe8fbff, transparent: true, opacity: 0.6, depthWrite: false }));
    this.bubbles = new THREE.InstancedMesh(bubGeo, this.bubMat, 28);
    this.bubbles.renderOrder = 3;
    this.bubbles.frustumCulled = false;
    this.bub = [];
    for (let i = 0; i < 28; i++) this.bub.push({ a: Math.random() * Math.PI * 2, r: Math.sqrt(Math.random()) * (R - 0.2), y: Math.random(), v: 0.6 + Math.random() * 0.9, s: 0.5 + Math.random() * 1.1 });
    this.body.add(this.bubbles);
    // inlet position (matches the lid cup)
    this.inlet = new THREE.Vector3((INLET[0] + 0.5) * V, glassY1, (INLET[1] + 0.5) * V);
    const sg = this.geo(new THREE.CylinderGeometry(0.075, 0.11, 1, 10, 1, true));
    sg.translate(0, -0.5, 0);
    this.streamMat = this.mat(new THREE.MeshStandardMaterial({ color: this.liquid, emissive: this.liquid, emissiveIntensity: 0.2, transparent: true, opacity: 0.55, roughness: 0.05, depthWrite: false }));
    this.stream = new THREE.Mesh(sg, this.streamMat);
    this.stream.position.copy(this.inlet);
    this.stream.renderOrder = 3;
    this.stream.visible = false;
    this.body.add(this.stream);

    // ---- glass: outer + inner wall, rims, highlight streaks
    this.glassGroup = new THREE.Group();
    this.body.add(this.glassGroup);
    const pts = [
      new THREE.Vector2(R - 0.02, glassY0), new THREE.Vector2(R + 0.02, glassY0), new THREE.Vector2(R + 0.02, glassY1), new THREE.Vector2(R - 0.02, glassY1),
    ];
    const glassGeo = this.geo(new THREE.LatheGeometry(pts, 56));
    this.glassMat = this.mat(new THREE.MeshStandardMaterial({ color: 0xe2f4ff, transparent: true, opacity: 0.16, roughness: 0.04, metalness: 0.1, envMapIntensity: 2.2, depthWrite: false }));
    this.glassInMat = this.mat(this.glassMat.clone());
    this.glassInMat.side = THREE.BackSide;
    this.glassInMat.opacity = 0.09;
    const em = Mats.toy.envMap;
    if (em) for (const m of [this.glassMat, this.glassInMat]) m.envMap = em;
    const gOut = new THREE.Mesh(glassGeo, this.glassMat), gIn = new THREE.Mesh(glassGeo, this.glassInMat);
    gOut.renderOrder = 5; gIn.renderOrder = 1;
    this.glassGroup.add(gIn, gOut);
    this.hiMat = this.mat(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide }));
    const gh = glassY1 - glassY0;
    for (const [a, w, h, o] of [[Math.PI / 2 - 0.62, 0.09, 0.82, 0.32], [Math.PI / 2 - 0.45, 0.035, 0.7, 0.25], [Math.PI / 2 + 0.95, 0.06, 0.6, 0.18]]) {
      const hg = this.geo(new THREE.PlaneGeometry(w, gh * h));
      const m = new THREE.Mesh(hg, o === 0.32 ? this.hiMat : this.mat(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: o, depthWrite: false, side: THREE.DoubleSide })));
      m.position.set(Math.cos(a) * (R + 0.03), glassY0 + gh * 0.52, Math.sin(a) * (R + 0.03));
      m.rotation.y = Math.PI / 2 - a;
      m.renderOrder = 6;
      this.glassGroup.add(m);
    }
    // cracks (revealed progressively)
    this.crackSegs = crackSegments(R + 0.025, glassY0, glassY1, opts.seed ?? 3);
    this.crackGeo = this.geo(crackGeometry(this.crackSegs, R + 0.025));
    this.crackMat = this.mat(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.92, depthWrite: false, side: THREE.DoubleSide }));
    this.cracks = new THREE.Mesh(this.crackGeo, this.crackMat);
    this.cracks.renderOrder = 7;
    this.cracks.frustumCulled = false;
    this.glassGroup.add(this.cracks);

    // ---- lid with the beacon
    this.lid = new THREE.Group();
    this.lid.position.y = glassY1;
    const lidMesh = makeMesh(g.lid, Mats.toyPair);
    this.lid.add(lidMesh);
    this.beaconMat = this.mat(new THREE.MeshBasicMaterial({ color: opts.beacon ?? 0xff3fc0, toneMapped: false }));
    const bc = new THREE.Mesh(this.geo(new THREE.CylinderGeometry(0.13, 0.15, 0.24, 14)), this.beaconMat);
    bc.position.y = (L.lidH + 3) * V + 0.12;
    this.lid.add(bc);
    const capM = new THREE.Mesh(this.geo(new THREE.SphereGeometry(0.15, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2)), Mats.toyGloss);
    capM.position.y = bc.position.y + 0.12;
    this.lid.add(capM);
    // rotating reflector blade inside the beacon
    this.reflector = new THREE.Mesh(this.geo(new THREE.BoxGeometry(0.3, 0.2, 0.04)), new THREE.MeshLambertMaterial({ color: 0x2a2d3a }));
    this.disposables.push(this.reflector.material);
    this.reflector.position.y = bc.position.y;
    this.lid.add(this.reflector);
    this.body.add(this.lid);

    // ---- inner light
    this.light = new THREE.PointLight(this.accent, 0, 7 * S, 1.2);
    this.light.position.set(0, 2.2, 0.6);
    this.body.add(this.light);

    this.height = ((L.glassTop + L.lidH + 3) * V + 0.36) * S;
    this.interior = { floorY: glassY0 * S, topY: glassY1 * S, radius: R * S };
    this.t = 0;
    this.fill = 0;
    this.fillVel = 0;
    this.pourT = 0;
    this.crack = 0;
    this.glow = 0;
    this.glowTarget = 0;
    this.rumble = 0;
    this.burst_ = false;
    this.setFill(0);
    this.setCrack(0);
    this.applyGlow();
  }

  mat(m) { this.disposables.push(m); return m; }
  geo(g) { this.disposables.push(g); return g; }

  /** Water level 0..1 (bottom of the glass to the lid). Rising levels show the pour stream. */
  setFill(k) {
    const f = Math.max(0, Math.min(1, k));
    if (f > this.fill + 1e-4) this.pourT = 0.25;
    this.fill = f;
    const { glassY0, glassY1 } = this.dims;
    const h = (glassY1 - glassY0 - 0.02) * f;
    this.water.visible = !this.burst_ && h > 0.01;
    this.water.scale.y = Math.max(0.001, h);
    this.surface.visible = this.water.visible;
    this.surface.position.y = glassY0 + h;
    this.bubbles.visible = this.water.visible;
  }

  /** Crack pattern 0..1 (spreads from the impact points over the glass). */
  setCrack(k) {
    this.crack = Math.max(0, Math.min(1, k));
    let n = 0;
    while (n < this.crackSegs.length && this.crackSegs[n][4] <= this.crack) n++;
    this.cracks.geometry.setDrawRange(0, n * 6);
    this.cracks.visible = n > 0 && !this.burst_;
  }

  /** Energy glow 0..1+ (seat ring, inner light, water glow, beacon). */
  setGlow(k) {
    this.glowTarget = Math.max(0, k);
  }

  /** Continuous trembling 0..1 (the figure pushing against the glass). */
  setRumble(k) {
    this.rumble = Math.max(0, k);
  }

  applyGlow() {
    const k = this.glow;
    this.ringMat.color.copy(this.accent).multiplyScalar(0.7 + Math.min(1.5, k) * 1.3);
    this.light.intensity = Math.min(1.5, k) * 3.2;
    this.waterMat.emissiveIntensity = 0.12 + Math.min(1, k) * 0.35;
    this.waterMat.emissive.copy(this.liquid).lerp(this.accent, Math.min(1, k) * 0.5);
    this.surfMat.emissiveIntensity = 0.15 + Math.min(1, k) * 0.35;
  }

  /**
   * Shatter the glass. Hides the glass, cracks and water and returns shard
   * meshes (children of this.body, in its local space) for the caller's
   * physics: each has userData { kind: 'glass' | 'lid', vel: Vector3 (units/s),
   * spin: Vector3 (rad/s) }. o.lid (default true) also launches the lid.
   */
  burst(o = {}) {
    if (this.burst_) return [];
    this.burst_ = true;
    this.glassGroup.visible = false;
    this.water.visible = this.surface.visible = this.bubbles.visible = this.stream.visible = false;
    const { glassY0, glassY1, R } = this.dims;
    const shapes = shardGeos();
    this.shardMat = this.mat(new THREE.MeshStandardMaterial({ color: 0xe8f8ff, transparent: true, opacity: 0.42, roughness: 0.05, metalness: 0.2, envMapIntensity: 2.5, depthWrite: false, side: THREE.DoubleSide }));
    if (Mats.toy.envMap) this.shardMat.envMap = Mats.toy.envMap;
    this.shardEdgeMat = this.mat(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }));
    const out = [];
    const n = o.count ?? 44;
    const front = Math.PI / 2;
    for (let i = 0; i < n; i++) {
      // bias shards towards the front (the impact side), but cover the whole cup
      const a = front + (Math.random() - 0.5) * (i < n * 0.6 ? 2.2 : Math.PI * 2);
      const y = glassY0 + 0.2 + Math.random() * (glassY1 - glassY0 - 0.4);
      const m = new THREE.Mesh(shapes[i % shapes.length], i % 5 === 0 ? this.shardEdgeMat : this.shardMat);
      const sc = 0.35 + Math.random() * 0.75;
      m.scale.set(sc, sc * (0.8 + Math.random() * 0.6), 1);
      m.position.set(Math.cos(a) * R, y, Math.sin(a) * R);
      m.rotation.set(0, Math.PI / 2 - a, (Math.random() - 0.5) * 1.5);
      m.renderOrder = 6;
      const out_ = 3.5 + Math.random() * 5.5;
      m.userData = {
        kind: 'glass',
        vel: new THREE.Vector3(Math.cos(a) * out_, 1.5 + Math.random() * 4.5 + (y - glassY0) * 0.5, Math.sin(a) * out_),
        spin: new THREE.Vector3((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14),
      };
      this.body.add(m);
      out.push(m);
    }
    if (o.lid !== false) {
      this.lid.userData = { kind: 'lid', vel: new THREE.Vector3((Math.random() - 0.5) * 2, 7.5, 1.2 + Math.random()), spin: new THREE.Vector3(2.4 + Math.random() * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 3) };
      out.push(this.lid);
    }
    this.glowTarget = Math.max(this.glowTarget, 1.2);
    return out;
  }

  update(dt) {
    this.t += dt;
    const t = this.t;
    // glow eases with a little flicker
    this.glow += (this.glowTarget - this.glow) * (1 - Math.exp(-dt * 6));
    const g0 = this.glow;
    this.glow = g0 * (g0 > 0.02 ? 1 + Math.sin(t * 13) * 0.05 + Math.sin(t * 29) * 0.04 : 1);
    this.applyGlow();
    this.glow = g0;
    // rumble
    const r = Math.min(1.5, this.rumble);
    this.body.rotation.z = (Math.sin(t * 47) * 0.012 + Math.sin(t * 23 + 1) * 0.006) * r;
    this.body.rotation.x = Math.sin(t * 39 + 1) * 0.008 * r;
    this.body.position.x = Math.sin(t * 53 + 2) * 0.03 * r;
    // warning lights blink alternately (faster when rumbling / glowing)
    const rate = 2.4 + r * 4 + Math.min(1, this.glow) * 2;
    const on = Math.sin(t * rate * Math.PI) > 0;
    const hot = 1.4 + Math.min(1, this.glow) * 1.2;
    this.lightMats[0].color.setHex(0xffb020).multiplyScalar(on ? hot : 0.35);
    this.lightMats[1].color.setHex(0xff3a3a).multiplyScalar(on ? 0.35 : hot);
    // beacon spins + pulses
    if (!this.burst_ || this.lid.parent === this.body) {
      this.reflector.rotation.y = t * 7;
      this.beaconMat.color.copy(this.opts.beacon !== undefined ? new THREE.Color(this.opts.beacon) : this.accent).multiplyScalar(1.1 + (Math.sin(t * 7) * 0.5 + 0.5) * 1.2);
    }
    // water: surface wobble, bubbles, pour stream
    if (this.water.visible) {
      const { glassY0, glassY1, R } = this.dims;
      const top = this.surface.position.y;
      this.surface.rotation.z = Math.sin(t * 2.3) * 0.02;
      this.surface.rotation.y = Math.sin(t * 1.7) * 0.02;
      const dummy = Containment._dummy || (Containment._dummy = new THREE.Object3D());
      const depth = top - glassY0;
      this.bub.forEach((b, i) => {
        b.y += (dt * b.v * (1 + this.pourT * 4)) / Math.max(0.5, depth);
        if (b.y > 1) { b.y = 0; b.a = Math.random() * Math.PI * 2; b.r = Math.sqrt(Math.random()) * (R - 0.2); }
        const wob = Math.sin(t * 6 + i) * 0.03;
        dummy.position.set(Math.cos(b.a) * b.r + wob, glassY0 + b.y * depth, Math.sin(b.a) * b.r);
        dummy.scale.setScalar(b.s * (b.y < 0.97 ? 1 : 0.01));
        dummy.updateMatrix();
        this.bubbles.setMatrixAt(i, dummy.matrix);
      });
      this.bubbles.instanceMatrix.needsUpdate = true;
      void glassY1;
    }
    this.pourT = Math.max(0, this.pourT - dt);
    const pouring = this.pourT > 0 && !this.burst_ && this.fill < 0.999;
    this.stream.visible = pouring;
    if (pouring) {
      const len = Math.max(0.05, this.inlet.y - this.surface.position.y);
      this.stream.scale.set(1 + Math.sin(t * 40) * 0.12, len, 1 + Math.cos(t * 37) * 0.12);
    }
  }

  dispose() {
    for (const d of this.disposables) d.dispose?.();
    this.disposables.length = 0;
    this.bubbles.dispose?.();
  }
}

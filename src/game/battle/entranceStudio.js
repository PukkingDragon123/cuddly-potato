// The GREEN-SCREEN FILM STUDIO the shop's entrance preview plays in (entrancePreview.js).
//
// A chroma-green cyclorama (floor curving up into the back wall) with tracking-marker crosses,
// a spike-tape mark where the Commander stops, the studio's concrete floor in front with a
// gaffer-tape edge, and the gear around it: fresnel lights on tripods with sandbags, a lighting
// grid with hanging cans, a camera on a dolly track with a blinking tally light, a boom mic,
// a director's chair, a clapperboard, apple boxes, cable runs to a distro box. Movie prop sets
// lean against the edges: a fake rocket, a cardboard castle wall, a fake palm tree, a rolled red
// carpet, a pallet of fake cash and a prop helicopter skid on saw horses.
//
// Cheap: every static piece is crafted voxel art baked ONCE per session (cached geometry), the
// props merged into one mesh and the cyclorama into another (shared toy / glow materials, the
// faces nobody can see dropped). The action space (the lane in front of your base) stays clear.
//
//   const st = await buildStudio({ markX, markZ });  scene.add(st.root);  st.update(dt);  st.dispose();
import * as THREE from 'three';
import { Mats } from '../../core/voxel.js';
import { G, rbox, cyl, blob, capsule, n3, shade } from '../../models/kit.js';

const CYC = 0.25; // cyclorama voxel (m)
const PV = 0.1; // prop voxel (m)
const X0 = -72, X1 = 72; // cyclorama width in CYC voxels (+-18 m)
const ZF = 18; // green floor front edge (4.5 m)
const ZW = -22; // back wall (-5.5 m)
const CZ = -16, CR = 6; // cove: centre z (-4 m), radius (1.5 m)
const WH = 44; // wall height (11 m)
const ZC = 46; // concrete floor front (11.5 m)

const GREEN = 0x34bf55, GREEN_D = 0x2cae4b, GREEN_L = 0x42cc62;
const MARK = 0xc4f5b0, MARK_D = 0x23944a;
const DARK = 0x23262e, DARK2 = 0x30343e, STEEL = 0x5a6272, STEEL_L = 0x8a94a6;
const WOOD = 0xc8935a, WOOD_D = 0x9a6a3a, WOOD_L = 0xe0b078;
const SAND = 0xb89a62, SAND_D = 0x8e7446;
const LAMP = 0xfff2c8;
const DOLLY = [12.4, 0.2]; // the camera dolly (world x, z)

// ---------------------------------------------------------------------------
// The cyclorama

function cycGrid() {
  const g = G();
  const green = (x, y, z) => {
    const k = n3(x >> 1, y >> 1, z >> 1, 3);
    return k < 0.18 ? GREEN_D : k > 0.86 ? GREEN_L : GREEN;
  };
  for (let x = X0; x <= X1; x++) {
    // floor (top at y = 0)
    for (let z = CZ; z <= ZF; z++) g.set(x, -1, z, green(x, 0, z));
    // the cove: a quarter circle from the floor up into the wall
    for (let z = ZW + 1; z < CZ; z++) {
      const dz = CZ - z;
      const top = Math.round(CR - Math.sqrt(Math.max(0, CR * CR - dz * dz)));
      for (let y = -1; y <= top; y++) g.set(x, y, z, green(x, y, z));
    }
    // the wall
    for (let y = -1; y <= WH; y++) g.set(x, y, ZW, green(x, y, ZW));
    // the studio floor in front of the cyc (grey concrete), a white gaffer-tape edge
    for (let z = ZF + 1; z <= ZC; z++) {
      const k = n3(x >> 1, 1, z >> 1, 11);
      g.set(x, -1, z, z === ZF + 1 ? 0xf2f2ea : k < 0.15 ? 0x4a4e58 : k > 0.9 ? 0x666b76 : 0x585c66);
    }
  }
  // the cyc's plywood edges (it is a set, not the world)
  for (let y = -1; y <= WH; y++) { g.set(X0 - 1, y, ZW, WOOD_D); g.set(X1 + 1, y, ZW, WOOD_D); }
  for (let y = WH; y <= WH; y++) for (let x = X0 - 1; x <= X1 + 1; x++) g.set(x, y + 1, ZW, WOOD_D);
  // tracking markers: pale crosses on the wall and the cove (a grid), darker ones on the floor
  const cross = (cx, cy, z, c) => { for (let i = -1; i <= 1; i++) { g.set(cx + i, cy, z, c); g.set(cx, cy + i, z, c); } };
  for (let x = X0 + 6; x <= X1 - 6; x += 10) for (let y = 10; y <= WH - 4; y += 8) cross(x + ((y >> 3) & 1) * 5, y, ZW + 1, MARK);
  for (let x = X0 + 8; x <= X1 - 8; x += 12) for (let z = CZ + 2; z <= ZF - 3; z += 9) {
    const cx = x + ((z / 9) & 1) * 6;
    for (let i = -1; i <= 1; i++) { g.set(cx + i, -1, z + i, MARK_D); g.set(cx + i, -1, z - i, MARK_D); } // painted into the floor
  }
  return g;
}

// ---------------------------------------------------------------------------
// Gear (PV voxels; each grid is built facing +z with its origin on the floor)

function fresnel() {
  const g = G();
  // tripod with sandbags on two feet
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + 0.6;
    const fx = Math.round(Math.cos(a) * 6), fz = Math.round(Math.sin(a) * 6);
    capsule(g, [0, 11, 0], [fx, 0, fz], 0.5, 0.5, (x, y) => (y < 1 ? 0x15151c : DARK2));
    if (k < 2) blob(g, fx, 1, fz, 2, 1, 1.4, (x, y, z) => (y > 1 ? SAND : n3(x, y, z, 2) < 0.3 ? SAND_D : SAND));
  }
  cyl(g, 'y', 0, 0, 10, 22, 0.8, 0.8, (x, y) => (y % 5 === 0 ? STEEL_L : STEEL));
  // yoke + the head (a box housing with a big lens, barn doors, cooling fins)
  rbox(g, -5, 22, 0, 5, 23, 0, 0, DARK2);
  for (const x of [-5, 5]) rbox(g, x, 23, 0, x, 28, 0, 0, DARK2);
  rbox(g, -4, 24, -4, 4, 32, 4, 1, (x, y, z) => (z === -4 && (y & 1) ? STEEL : DARK));
  cyl(g, 'z', 0, 28, 5, 5, 3.4, 3.4, (x, y) => (Math.abs(x) + Math.abs(y - 28) < 2 ? 0xffffff : LAMP), { glow: true });
  cyl(g, 'z', 0, 28, 5, 5, 4.4, 4.4, STEEL_L, { hollow: 1 });
  for (let z = 5; z <= 8; z++) for (let x = -4; x <= 4; x++) g.set(x, 33 + ((z - 5) >> 1), z, 0x1c1e24);
  for (const s of [-1, 1]) for (let z = 5; z <= 7; z++) for (let y = 25; y <= 31; y++) g.set(s * (5 + ((z - 5) >> 1)), y, z, 0x1c1e24);
  return g;
}

/** A section of square truss (along x) with zigzag webbing, length n. */
function truss(g, x0, n, y, z) {
  for (let x = x0; x <= x0 + n; x++) {
    for (const [dy, dz] of [[0, 0], [0, 3], [3, 0], [3, 3]]) g.set(x, y + dy, z + dz, STEEL_L);
    const k = (x - x0) % 6, d = k < 3 ? k : 6 - k;
    g.set(x, y + d, z, STEEL); g.set(x, y + d, z + 3, STEEL); g.set(x, y, z + d, STEEL); g.set(x, y + 3, z + d, STEEL);
  }
}
function grid() {
  const g = G();
  truss(g, -140, 280, 0, -24);
  truss(g, -140, 280, 0, 18);
  // hanging cans pointing down (lit lenses)
  for (const z of [-22, 20]) for (let x = -120; x <= 120; x += 40) {
    const cx = x + (z > 0 ? 20 : 0);
    rbox(g, cx, -2, z - 1, cx, -1, z - 1, 0, DARK2);
    cyl(g, 'y', cx, z - 1, -8, -3, 2.4, 2.4, DARK);
    cyl(g, 'y', cx, z - 1, -9, -9, 1.8, 1.8, LAMP, { glow: true });
  }
  return g;
}

function dollyCam() {
  const g = G();
  // the track: two rails on sleepers, along z
  for (let z = -22; z <= 22; z++) { g.set(-4, 0, z, STEEL_L); g.set(4, 0, z, STEEL_L); if (z % 4 === 0) for (let x = -6; x <= 6; x++) g.set(x, 0, z, WOOD_D); }
  // the dolly: a wooden deck on wheels, a pedestal, the camera with a matte box and a lens
  rbox(g, -5, 2, -6, 5, 3, 6, 0, (x, y, z) => ((x + z) & 1 ? WOOD : WOOD_L));
  for (const [x, z] of [[-4, -5], [4, -5], [-4, 5], [4, 5]]) cyl(g, 'x', 1, z, x - 1, x + 1, 1.2, 1.2, 0x15151c);
  cyl(g, 'y', 0, 0, 4, 13, 1.4, 1.4, DARK2);
  rbox(g, -3, 14, -5, 3, 20, 4, 1, DARK); // body
  rbox(g, -2, 21, -3, 2, 22, 1, 0, DARK2); // handle
  rbox(g, -4, 15, -9, -4, 19, -6, 0, 0x1c1e24); // viewfinder
  cyl(g, 'z', 0, 17, 5, 9, 2.2, 2.2, (x, y, z) => (z === 7 ? STEEL_L : 0x15151c));
  for (let x = -3; x <= 3; x++) for (let y = 14; y <= 20; y++) if (Math.abs(x) === 3 || y === 14 || y === 20) g.set(x, y, 10, 0x15151c); // matte box
  cyl(g, 'z', 0, 17, 9, 9, 1.4, 1.4, 0x6ad8ff, { glow: true });
  // a film magazine on top (two reels)
  for (const z of [-3, 1]) cyl(g, 'x', 23 + 1, z, -1, 1, 2.4, 2.4, (x, y, zz) => (Math.abs(y - 24) + Math.abs(zz - z) < 1 ? STEEL_L : DARK2));
  // operator seat
  rbox(g, -2, 6, -6, 2, 7, -3, 0, 0xc83a3a);
  return g;
}

function boom() {
  const g = G();
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    capsule(g, [0, 8, 0], [Math.round(Math.cos(a) * 5), 0, Math.round(Math.sin(a) * 5)], 0.5, 0.5, DARK2);
  }
  cyl(g, 'y', 0, 0, 8, 18, 0.7, 0.7, STEEL);
  // the boom pole reaching up and over the set (+z), the mic in a fluffy windscreen
  capsule(g, [0, 18, -4], [0, 30, 24], 0.6, 0.5, (x, y, z) => ((y + z) % 7 === 0 ? 0x15151c : STEEL_L));
  blob(g, 0, 28, 28, 2, 2, 4, (x, y, z) => (n3(x, y, z, 7) < 0.35 ? 0x8a8e96 : n3(x, y, z, 8) < 0.5 ? 0xb4b8c0 : 0xa0a4ac));
  // counterweight
  rbox(g, -1, 16, -7, 1, 18, -5, 0, 0x15151c);
  return g;
}

function directorChair() {
  const g = G();
  const leg = (x0, z0, x1, z1) => capsule(g, [x0, 0, z0], [x1, 9, z1], 0.5, 0.5, WOOD);
  for (const s of [-1, 1]) { leg(s * 5, -4, s * 5, 4); leg(s * 5, 4, s * 5, -4); }
  rbox(g, -5, 9, -4, 5, 9, 4, 0, 0x2a3a8a); // canvas seat
  for (const s of [-1, 1]) { rbox(g, s * 5, 9, -4, s * 5, 18, -4, 0, WOOD_D); rbox(g, s * 5, 13, -4, s * 5, 13, 3, 0, WOOD); }
  rbox(g, -5, 14, -4, 5, 18, -4, 0, (x, y) => (y === 16 ? 0xf2f2ea : 0x2a3a8a)); // canvas back (a white band)
  // a megaphone on the seat
  cyl(g, 'x', 11, 0, -2, 3, 1, 2.6, (x) => (x > 2 ? 0xffd23f : 0xf2f2ea));
  return g;
}

function clapper() {
  const g = G();
  // slate leaning back: black board, chalk lines, the striped clap stick open a little
  for (let y = 0; y <= 8; y++) for (let x = -5; x <= 5; x++) {
    const chalk = (y === 3 || y === 6) && Math.abs(x) < 4;
    g.set(x, y, -(y >> 2), chalk ? 0xe8e8e0 : 0x15151c);
  }
  for (let x = -5; x <= 5; x++) for (let y = 9; y <= 10; y++) g.set(x, y + (x + 5 > 6 ? 1 : 0), -2, ((x + y) >> 1) & 1 ? 0xf2f2ea : 0x15151c);
  return g;
}

function appleBoxes() {
  const g = G();
  const ab = (x, y, z, w, hgt, d) => {
    rbox(g, x, y, z, x + w, y + hgt, z + d, 0, (xx, yy, zz) => (yy === y + hgt || xx === x || xx === x + w ? WOOD_D : n3(xx, yy, zz, 4) < 0.2 ? WOOD_D : WOOD));
    // a hand hole on the long face
    g.del(x + (w >> 1), y + (hgt >> 1) + 1, z + d); g.del(x + (w >> 1) + 1, y + (hgt >> 1) + 1, z + d);
  };
  ab(-5, 0, -3, 10, 3, 6); ab(-4, 4, -2, 8, 3, 5); ab(-3, 8, -2, 6, 1, 4); ab(7, 0, -2, 6, 6, 4);
  return g;
}

function distro() {
  const g = G();
  rbox(g, -4, 0, -3, 4, 7, 3, 1, (x, y) => (y === 5 ? 0x15151c : 0xffc21a));
  for (let x = -3; x <= 3; x += 2) g.set(x, 3, 4, 0x15151c);
  g.set(3, 6, 4, 0x3aff6a, true);
  return g;
}

// ---------------------------------------------------------------------------
// Movie prop sets (around the edges, against the cyc)

function fakeRocket() {
  const g = G();
  // a stubby prop rocket on a wooden cradle, plywood brace behind it
  for (let y = 4; y <= 30; y++) {
    const r = y > 24 ? 4.2 * (1 - (y - 24) / 8) : 4.2;
    cyl(g, 'y', 0, 0, y, y, r, r, (x, yy, z) => (yy > 24 ? 0xe8303a : (yy >> 2) % 3 === 0 ? 0xe8303a : z > 2 && yy % 8 === 2 ? 0x6ad8ff : 0xf2f2ea));
  }
  g.set(0, 33, 0, 0xffd23f, true);
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1]]) for (let i = 4; i <= 7; i++) for (let y = 2; y <= 12 - i; y++) g.set(dx * i, y + 2, dz * i, 0xe8303a);
  rbox(g, -6, 0, -3, 6, 2, 3, 0, WOOD);
  for (let y = 0; y <= 26; y++) g.set(0, y, -6, WOOD_D);
  for (let y = 4; y <= 20; y += 8) for (let z = -6; z <= -5; z++) g.set(0, y, z, WOOD_D);
  return g;
}

function castleWall() {
  const g = G();
  // painted cardboard: grey stones on the front, brown card and timber braces on the back
  for (let x = -18; x <= 18; x++) for (let y = 0; y <= 24; y++) {
    if (y > 20 && ((x + 18) % 8) >= 4) continue; // crenellations
    const row = y >> 2, off = (row & 1) * 3;
    const mortar = y % 4 === 3 || (x + 18 + off) % 6 === 5;
    g.set(x, y, 0, mortar ? 0x8a8e98 : n3(x >> 1, row, 0, 5) < 0.3 ? 0xb4b8c2 : 0xa2a6b0);
    g.set(x, y, -1, 0xb08a58);
  }
  // an arched window painted black
  for (let x = -3; x <= 3; x++) for (let y = 8; y <= 15; y++) if (y < 14 || Math.abs(x) < 3 - (y - 14)) g.set(x, y, 0, 0x2a2430);
  for (const x of [-12, 0, 12]) { capsule(g, [x, 18, -2], [x, 0, -10], 0.5, 0.5, WOOD); rbox(g, x - 1, 0, -11, x + 1, 1, -8, 0, SAND); }
  return g;
}

function palm() {
  const g = G();
  // a bucket of sand, a segmented trunk with a lean, plastic fronds
  cyl(g, 'y', 0, 0, 0, 5, 4, 4.6, (x, y) => (y === 5 ? SAND : 0x3a6ad8));
  const top = [6, 34, 2];
  chain(g, [[0, 5, 0], [2, 16, 1], [5, 26, 2], top], [1.8, 1.4], (x, y) => ((y >> 1) % 2 ? 0x8a5a2e : 0xa87040));
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + 0.3;
    const pts = [top, [top[0] + Math.cos(a) * 6, top[1] + 3, top[2] + Math.sin(a) * 6], [top[0] + Math.cos(a) * 12, top[1] - 2, top[2] + Math.sin(a) * 12]];
    chain(g, pts, [1.4, 0.6], (x, y, z) => (n3(x, y, z, 6) < 0.3 ? 0x2a9a3a : 0x3fc04a));
  }
  blob(g, top[0], top[1] - 2, top[2], 1.6, 1.6, 1.6, 0x6a4a22);
  return g;
}
function chain(g, pts, radii, col) {
  for (let i = 0; i < pts.length - 1; i++) {
    const t0 = i / (pts.length - 1), t1 = (i + 1) / (pts.length - 1);
    capsule(g, pts[i], pts[i + 1], radii[0] + (radii[1] - radii[0]) * t0, radii[0] + (radii[1] - radii[0]) * t1, col);
  }
}

function carpetRoll() {
  const g = G();
  cyl(g, 'x', 3, 0, -9, 9, 3, 3, (x, y, z) => (Math.abs(x) === 9 ? (Math.abs(y - 3) + Math.abs(z) < 2 ? 0x7a1020 : 0xb81e30) : (x === -8 || x === 8) ? 0xffd23f : 0xd8283c));
  // a tongue unrolled towards the camera
  for (let z = 3; z <= 10; z++) for (let x = -8; x <= 8; x++) g.set(x, 0, z, Math.abs(x) === 8 ? 0xffd23f : 0xd8283c);
  return g;
}

function cashPallet() {
  const g = G();
  for (let x = -8; x <= 8; x++) for (let z = -6; z <= 6; z++) { if (z % 3 === 0) g.set(x, 1, z, WOOD); if (x % 4 === 0) g.set(x, 0, z, WOOD_D); }
  const stack = (x, y, z) => {
    for (let yy = y; yy < y + 2; yy++) for (let xx = x; xx < x + 5; xx++) for (let zz = z; zz < z + 3; zz++) g.set(xx, yy, zz, xx === x + 2 ? 0xf2f2ea : yy === y + 1 && n3(xx, yy, zz, 9) < 0.3 ? 0x8ae07a : 0x5fbf4a);
  };
  for (let y = 0; y < 4; y++) for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) if (y < 3 || (i + j) % 2) stack(-8 + i * 6, 2 + y * 2, -6 + j * 3);
  return g;
}

function heliSkid() {
  const g = G();
  // saw horses holding a prop helicopter belly: two skid tubes, struts, a cut-off grey hull
  for (const x of [-14, 14]) { capsule(g, [x - 3, 0, -4], [x, 8, 0], 0.5, 0.5, WOOD); capsule(g, [x + 3, 0, -4], [x, 8, 0], 0.5, 0.5, WOOD); capsule(g, [x - 3, 0, 4], [x, 8, 0], 0.5, 0.5, WOOD); capsule(g, [x + 3, 0, 4], [x, 8, 0], 0.5, 0.5, WOOD); rbox(g, x - 4, 8, -5, x + 4, 9, 5, 0, WOOD_L); }
  for (const z of [-5, 5]) {
    cyl(g, 'x', 10, z, -20, 18, 0.9, 0.9, 0x2a2e3a);
    capsule(g, [19, 10, z], [21, 12, z], 0.8, 0.8, 0x2a2e3a); // the curled nose of the skid
    for (const x of [-10, 8]) capsule(g, [x, 10, z], [x, 16, z * 0.6], 0.6, 0.6, 0x2a2e3a);
  }
  rbox(g, -14, 16, -4, 12, 20, 4, 2, (x, y) => (y === 17 ? 0x2b8cf2 : 0xd8dce4));
  return g;
}

// ---------------------------------------------------------------------------
// Merge baked parts (rotated / placed) into one geometry: all solid faces, then all glow faces

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _nm = new THREE.Matrix3();
const _p = new THREE.Vector3(), _n = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _y = new THREE.Vector3(0, 1, 0);
function mergeParts(parts) {
  let nv = 0;
  for (const p of parts) nv += p.geo.attributes.position.count;
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), col = new Float32Array(nv * 3);
  const solid = [], glow = [];
  let base = 0;
  for (const { geo, x = 0, y = 0, z = 0, ry = 0 } of parts) {
    _m.compose(_p.set(x, y, z), _q.setFromAxisAngle(_y, ry), _s);
    _nm.getNormalMatrix(_m);
    const P = geo.attributes.position, N = geo.attributes.normal, C = geo.attributes.color;
    for (let i = 0; i < P.count; i++) {
      const o = (base + i) * 3;
      _n.fromBufferAttribute(P, i).applyMatrix4(_m);
      pos[o] = _n.x; pos[o + 1] = _n.y; pos[o + 2] = _n.z;
      _n.fromBufferAttribute(N, i).applyMatrix3(_nm);
      nor[o] = _n.x; nor[o + 1] = _n.y; nor[o + 2] = _n.z;
      col[o] = C.getX(i); col[o + 1] = C.getY(i); col[o + 2] = C.getZ(i);
    }
    const idx = geo.index.array;
    for (const gr of geo.groups) {
      const tgt = gr.materialIndex === 1 ? glow : solid;
      for (let k = gr.start; k < gr.start + gr.count; k++) tgt.push(idx[k] + base);
    }
    base += P.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setIndex(nv > 65535 ? new THREE.Uint32BufferAttribute(solid.concat(glow), 1) : new THREE.Uint16BufferAttribute(solid.concat(glow), 1));
  out.addGroup(0, solid.length, 0);
  if (glow.length) out.addGroup(solid.length, glow.length, 1);
  out.computeBoundingBox();
  out.computeBoundingSphere();
  return out;
}
/** Drop the faces no camera can see (under the floor, behind the wall) from a built grid. */
function cull(geo) {
  const N = geo.attributes.normal, idx = geo.index.array, keep = [];
  const groups = geo.groups.map((g) => ({ ...g }));
  let out = 0;
  for (const gr of groups) {
    const start = out;
    for (let k = gr.start; k < gr.start + gr.count; k += 6) {
      const v = idx[k];
      if (N.getY(v) < -0.5 || N.getZ(v) < -0.5) continue;
      for (let j = 0; j < 6; j++) keep.push(idx[k + j]);
      out += 6;
    }
    gr.start = start;
    gr.count = out - start;
  }
  geo.setIndex(N.count > 65535 ? new THREE.Uint32BufferAttribute(keep, 1) : new THREE.Uint16BufferAttribute(keep, 1));
  geo.clearGroups();
  for (const gr of groups) if (gr.count) geo.addGroup(gr.start, gr.count, gr.materialIndex);
  return geo;
}

// baked once per session (the shop frees the GPU buffers when it closes; three re-uploads them)
let CYC_GEO = null, GEAR_GEO = null, RIG_GEO = null;
const bake = (g, o = {}) => g.build({ scale: PV, pivot: [0, 0, 0], jitter: 0.02, ...o });
const face = (x, z, tx, tz) => Math.atan2(tx - x, tz - z); // yaw that points a +z-facing part at (tx, tz)

// yield to the browser between pieces once a slice has used ~10 ms (smooth frames, no extra wait on fast devices)
let sliceT = 0;
const tick = () => {
  if (performance.now() - sliceT < 10) return Promise.resolve();
  return new Promise((r) => requestAnimationFrame(() => { sliceT = performance.now(); r(); }));
};
let prepping = null;
/** Bake the studio's geometry ahead of time, a piece per frame (resolves at once when baked). */
export function prepStudio() {
  if (CYC_GEO && GEAR_GEO) return Promise.resolve();
  return (prepping ??= (async () => {
    sliceT = performance.now();
    if (!CYC_GEO) CYC_GEO = cull(cycGrid().build({ scale: CYC, pivot: [0, 0, 0], jitter: 0.015, ao: false }));
    if (GEAR_GEO) return;
    const parts = [];
    const add = async (make, o) => { await tick(); parts.push({ geo: bake(make()), ...o }); return parts[parts.length - 1].geo; };
    // lights on stands: two behind the set (in the close-ups), two at the sides, aimed at the mark
    const fr = await add(fresnel, { x: -3.6, z: -3.0, ry: face(-3.6, -3.0, -1, 3) });
    for (const [x, z] of [[7.4, -2.8], [-11.5, 3.4], [11.6, 3.6]]) parts.push({ geo: fr, x, z, ry: face(x, z, -1, 3) });
    const rig = [{ geo: (await tick(), bake(grid())), y: 10.2 }]; // no shadows from up there
    await add(dollyCam, { x: DOLLY[0], z: DOLLY[1], ry: face(DOLLY[0], DOLLY[1], 0, 1.6) });
    await add(boom, { x: 3.4, z: -3.0, ry: face(3.4, -3.0, 0.4, 1.2) });
    await add(directorChair, { x: 10.2, z: 4.6, ry: face(10.2, 4.6, 0, 1) });
    await add(clapper, { x: 9.0, z: 5.5, ry: face(9.0, 5.5, 0, 9) });
    const ab = await add(appleBoxes, { x: -9.6, z: 4.4, ry: 0.4 });
    parts.push({ geo: ab, x: 1.2, z: -4.0, ry: -0.2 });
    await add(distro, { x: -13.6, z: 2.4, ry: 0.9 });
    // the prop sets, against the cyc
    await add(fakeRocket, { x: 5.6, z: -4.3, ry: -0.35 });
    await add(castleWall, { x: -7.4, z: -4.0, ry: 0.12 });
    await add(palm, { x: 9.8, z: -3.6, ry: -0.6 });
    await add(carpetRoll, { x: -1.6, z: -4.2, ry: 0.1 });
    await add(cashPallet, { x: 13.0, z: -3.6, ry: -0.25 });
    await add(heliSkid, { x: -13.4, z: -3.2, ry: 0.35 });
    // cable runs on the floor (lights -> the distro box), one voxel high
    await add(() => {
      const cab = G();
      const run = (pts) => { for (let i = 0; i < pts.length - 1; i++) capsule(cab, [pts[i][0], 0, pts[i][1]], [pts[i + 1][0], 0, pts[i + 1][1]], 0.3, 0.3, 0x15151c); };
      run([[-115, 34], [-128, 30], [-136, 24]]);
      run([[-36, -30], [-62, -36], [-92, -33], [-122, -8], [-136, 20]]);
      run([[74, -28], [48, -36], [0, -37], [-36, -31]]);
      run([[116, 36], [126, 22], [124, 6]]);
      return cab;
    }, {});
    await tick();
    GEAR_GEO = mergeParts(parts);
    RIG_GEO = mergeParts(rig);
    for (const p of new Set([...parts, ...rig].map((q) => q.geo))) p.dispose();
  })().finally(() => { prepping = null; }));
}

/** The studio: { root, update(dt), dispose() }. markX / markZ: where the Commander stops (spike tape). */
export async function buildStudio({ markX = 0, markZ = 1.45 } = {}) {
  await prepStudio();
  const root = new THREE.Group();
  const cyc = new THREE.Mesh(CYC_GEO, Mats.pair);
  cyc.receiveShadow = true;
  const gear = new THREE.Mesh(GEAR_GEO, Mats.pair);
  gear.castShadow = gear.receiveShadow = true;
  const rig = new THREE.Mesh(RIG_GEO, Mats.pair);
  root.add(cyc, gear, rig);
  // spike tape: a yellow T on the floor where the Commander lands
  const sg = G();
  for (let i = -4; i <= 4; i++) sg.set(i, 0, 3, 0xffd23f);
  for (let i = -1; i <= 3; i++) sg.set(0, 0, i, 0xffd23f);
  const spikeGeo = sg.build({ scale: PV, pivot: [0, 0, 0], jitter: 0, ao: false });
  const spike = new THREE.Mesh(spikeGeo, Mats.pair);
  spike.scale.y = 0.15;
  spike.position.set(markX, 0, markZ - 0.45);
  spike.receiveShadow = true;
  root.add(spike);
  // the camera's tally light: blinks red while "recording"
  const tallyMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a, toneMapped: false });
  const tg = G();
  tg.box(0, 0, 0, 1, 1, 1, 0xffffff);
  const tallyGeo = tg.build({ scale: PV, pivot: 'center', jitter: 0, ao: false });
  const tally = new THREE.Mesh(tallyGeo, tallyMat);
  const yaw = face(DOLLY[0], DOLLY[1], 0, 1.6);
  _p.set(0, 22.5 * PV, 3.5 * PV).applyAxisAngle(_y, yaw);
  tally.position.set(DOLLY[0] + _p.x, _p.y, DOLLY[1] + _p.z);
  tally.rotation.y = yaw;
  root.add(tally);
  let t = 0;
  return {
    root,
    update(dt) {
      t += dt;
      const on = (t % 1.2) < 0.75;
      tallyMat.color.setRGB(on ? 3 : 0.25, on ? 0.35 : 0.04, on ? 0.35 : 0.04);
    },
    dispose() {
      root.parent?.remove(root);
      CYC_GEO?.dispose();
      GEAR_GEO?.dispose();
      RIG_GEO?.dispose();
      spikeGeo.dispose();
      tallyGeo.dispose();
      tallyMat.dispose();
    },
  };
}

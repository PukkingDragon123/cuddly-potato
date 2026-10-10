// Ability / spell props: briefcase, money bag, truck, football, subscribe
// button, soda rocket, beaker and food items.
import {
  THREE, VoxGrid, Mats, makeMesh, PAL, shade, mixHex, hash3, vnoise, ring, text, vmesh, vgeo, glassMat, cashStack, group,
} from './common.js';
import { variantMaterials } from '../../core/voxel.js';

const S05 = 0.05;

// ---------------------------------------------------------------------------
// Briefcase { root, lid, body }  (lid.rotation.x negative = open; see open(t))
export function makeBriefcase() {
  const W = 9, D = 6; // half extents in voxels (0.05) -> 0.9 x 0.6
  const silver = 0xc9d0da, silverD = 0x8e97a6, black = 0x1d1b26, gold = PAL.gold;
  const body = vmesh('briefcase_body', () => {
    const g = new VoxGrid();
    // outer shell
    g.box(-W, 0, -D, W - 1, 4, D - 1, (x, y, z) => ((y === 0 || x === -W || x === W - 1 || z === -D || z === D - 1) && (y + x) % 7 === 0 ? silverD : silver));
    g.box(-W + 1, 1, -D + 1, W - 2, 4, D - 2, null);
    // black edge trim + corner caps
    g.box(-W, 4, -D, W - 1, 4, -D, black).box(-W, 4, D - 1, W - 1, 4, D - 1, black).box(-W, 4, -D, -W, 4, D - 1, black).box(W - 1, 4, -D, W - 1, 4, D - 1, black);
    for (const x of [-W, W - 1]) for (const z of [-D, D - 1]) g.box(x, 0, z, x, 4, z, black);
    // glowing velvet floor + cash
    g.box(-W + 1, 1, -D + 1, W - 2, 1, D - 2, 0x2b8a3e, true);
    for (let x = -W + 1; x <= W - 5; x += 4)
      for (let z = -D + 1; z <= D - 3; z += 3) cashStack(g, x, 2, z, 4, 2 + ((x + z) & 1), 2);
    for (let x = -W + 2; x <= W - 3; x += 5) g.set(x, 4 + ((x & 1)), -D + 2, gold).set(x + 1, 4, D - 3, gold);
    // latches + handle (front, +z)
    for (const x of [-5, 4]) g.box(x, 3, D, x + 1, 4, D, gold);
    g.box(-3, 2, D, 2, 2, D, black).box(-3, 2, D + 1, -3, 4, D + 1, black).box(2, 2, D + 1, 2, 4, D + 1, black).box(-3, 4, D + 2, 2, 4, D + 2, black);
    return g;
  }, { scale: S05, pivot: [0, 0, 0] });
  const lidMesh = vmesh('briefcase_lid', () => {
    const g = new VoxGrid();
    // modelled with hinge at z=0 (back edge), lid extends toward +z (local), thickness y 0..3
    const L = D * 2;
    g.box(-W, 0, 0, W - 1, 3, L - 1, (x, y, z) => (y === 3 && (x + z) % 9 === 0 ? 0xe4e9f0 : silver));
    g.box(-W + 1, 0, 1, W - 2, 2, L - 2, null);
    g.box(-W + 1, 2, 1, W - 2, 2, L - 2, 0x3a1430); // velvet lining (inside)
    g.box(-W + 2, 1, 2, W - 3, 1, 2, 0xffe680, true); // glow strip
    g.box(-W, 0, 0, W - 1, 0, 0, black).box(-W, 0, L - 1, W - 1, 0, L - 1, black).box(-W, 0, 0, -W, 0, L - 1, black).box(W - 1, 0, 0, W - 1, 0, L - 1, black);
    for (const x of [-W, W - 1]) for (const z of [0, L - 1]) g.box(x, 0, z, x, 3, z, black);
    for (const x of [-5, 4]) g.box(x, 0, L, x + 1, 1, L, gold);
    // pink bolt sticker on top
    const bolt = ['..##', '.##.', '####', '.##.', '##..'];
    bolt.forEach((row, r) => [...row].forEach((c, i) => c === '#' && g.set(-2 + i, 4, 3 + r, PAL.pink)));
    return g;
  }, { scale: S05, pivot: [0, 0, 0] });
  // pivot at the hinge: back edge (z = -D) at top of body
  const lid = new THREE.Group();
  lid.position.set(0, 5 * S05, -D * S05);
  lid.add(lidMesh);
  const glow = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.02, 0.5), new THREE.MeshBasicMaterial({ color: 0xc8ffb0, transparent: true, opacity: 0.35, depthWrite: false }));
  glow.position.set(0, 0.24, 0);
  const root = group(body, lid, glow);
  root.name = 'briefcase';
  const bc = {
    root, lid, body, glow, openAngle: -1.95,
    /** t in 0..1 (0 = closed). */
    open(t) { lid.rotation.x = -1.95 * t; glow.visible = t > 0.05; glow.material.opacity = 0.35 * t; },
  };
  bc.open(0);
  return bc;
}

// ---------------------------------------------------------------------------
export function makeMoneyBag() {
  return vmesh('moneyBag', () => {
    const g = new VoxGrid();
    const burlap = (x, y, z) => {
      if ((x + y * 2) % 5 === 0 && y % 3 === 0) return 0xc9a066;
      return vnoise(x * 0.25, y * 0.25, z * 0.25) < 0.42 ? 0xd4ac70 : 0xdfba7e;
    };
    g.ellipsoid(0, 11, 0, 11.5, 11, 10, burlap);
    g.carve((x, y) => y < 1);
    g.ellipsoid(0, 1, 0, 8, 1, 7, burlap);
    // neck + rope + tuft
    g.cylinder(0, 0, 21, 24, 4, burlap);
    ring(g, 0, 0, 22, 23, 5, 0x8a5a2e);
    for (let i = 0; i < 6; i++) g.set(5 + (i >> 2), 21 - i, 4 - (i >> 1), i % 2 ? 0x8a5a2e : 0x6e4224);
    g.cylinder(0, 0, 25, 26, 5, burlap);
    for (let a = 0; a < 12; a++) {
      const t = (a / 12) * Math.PI * 2;
      g.set(Math.round(Math.cos(t) * 5), 27 + (a & 1), Math.round(Math.sin(t) * 5), 0xe8c88e);
    }
    g.cylinder(0, 0, 25, 27, 3, null);
    g.box(-2, 25, -1, 1, 26, 1, PAL.cash).box(-1, 27, 0, 0, 27, 0, PAL.cashL);
    // front patch with big $ and 100K
    const zf = (x, y) => { let z = 12; while (z > 0 && !g.has(x, y, z)) z--; return z; };
    for (let x = -9; x <= 9; x++) for (let y = 3; y <= 20; y++) {
      const d = (x / 9.5) ** 2 + ((y - 11.5) / 9) ** 2;
      if (d > 1) continue;
      g.set(x, y, zf(x, y), d > 0.8 ? 0xb88a52 : 0xf6e6c0);
    }
    const big = ['...##...', '.######.', '##.##...', '##.##...', '.######.', '...##.##', '...##.##', '.######.', '...##...'];
    big.forEach((row, r) => [...row].forEach((c, i) => {
      if (c !== '#') return;
      const x = i - 4, y = 19 - r;
      g.set(x, y, zf(x, y) + 1, 0x2f9a3a);
    }));
    const tmp = new VoxGrid();
    text(tmp, '100K', 0, 5, 0, '+z', 0x1d6a2a, { center: true, gap: 1 });
    tmp.forEach((x, y, z, c) => g.set(x, y, zf(x, y) + 1, c));
    // patch stitches
    g.box(-10, 13, 2, -10, 13, 2, 0xb88a52);
    return g;
  }, { scale: 0.058 });
}

// ---------------------------------------------------------------------------
// Juan's truck { root, body, wheels }
export function makeTruck() {
  const red = 0xff5a2a, redD = 0xc8381a, chrome = 0xdfe6ee, glassC = 0x9fe8ff;
  const body = vmesh('truck_body', () => {
    const g = new VoxGrid();
    // chassis
    g.box(-15, 6, -6, 15, 7, 5, PAL.metalDD);
    // lower body
    g.box(-16, 8, -7, 16, 12, 6, (x, y, z) => (y === 8 ? redD : red));
    // cab
    g.box(-2, 13, -7, 8, 20, 6, red);
    g.box(-1, 14, -8, 7, 18, -8, glassC, true);
    g.box(-1, 14, 7, 7, 18, 7, glassC, true);
    g.box(3, 14, -8, 3, 18, -8, red).box(3, 14, 7, 3, 18, 7, red);
    g.box(9, 13, -6, 9, 19, 5, red);
    g.box(9, 14, -5, 9, 18, 4, glassC, true); // windshield
    g.box(8, 14, -5, 8, 18, 4, null);
    g.box(-1, 21, -6, 7, 21, 5, redD);
    // light bar
    g.box(0, 22, -5, 6, 22, 4, PAL.ink);
    for (let z = -5; z <= 4; z += 2) g.set(6, 22, z, PAL.yellow, true).set(0, 22, z, PAL.yellow, true);
    // hood
    g.box(10, 12, -6, 16, 13, 5, red);
    g.box(17, 8, -7, 17, 12, 6, chrome); // grille frame
    for (let y = 9; y <= 11; y++) for (let z = -5; z <= 4; z += 2) g.set(18, y, z, 0x2a2a34);
    g.box(18, 8, -7, 18, 8, 6, chrome).box(18, 12, -7, 18, 12, 6, chrome);
    g.box(19, 6, -8, 20, 7, 7, chrome); // bumper
    g.box(18, 10, -7, 18, 11, -6, 0xffffc0, true).box(18, 10, 5, 18, 11, 6, 0xffffc0, true); // headlights
    g.box(-17, 6, -8, -17, 7, 7, chrome);
    g.box(-17, 9, -7, -17, 10, -6, 0xff3030, true).box(-17, 9, 5, -17, 10, 6, 0xff3030, true);
    // bed walls + cargo
    g.box(-16, 13, -7, -3, 15, -7, red).box(-16, 13, 6, -3, 15, 6, red).box(-16, 13, -7, -16, 15, 6, red);
    g.box(-16, 15, -7, -3, 15, -7, chrome).box(-16, 15, 6, -3, 15, 6, chrome);
    for (const [x, z, c] of [[-14, -5, PAL.wood], [-9, -4, PAL.yellow], [-14, 1, PAL.blue], [-8, 1, PAL.pink]])
      g.box(x, 13, z, x + 3, 16, z + 3, (xx, yy) => (yy === 16 ? shade(c, 0.2) : c));
    g.box(-13, 17, -4, -10, 17, -2, PAL.cash).box(-12, 18, -4, -11, 18, -2, PAL.cashD);
    // flame decals on both sides
    const flame = ['....###...', '..######..', '.##YY####.', '#YYYYY####', '.##YY####.', '..######..'];
    for (const z of [-8, 7]) {
      flame.forEach((row, r) => [...row].forEach((c, i) => {
        if (c === '.') return;
        g.set(4 + i, 12 - r, z, c === 'Y' ? PAL.yellow : PAL.orange);
      }));
      g.box(-15, 10, z, -4, 10, z, PAL.yellow);
    }
    // exhaust stacks
    for (const z of [-6, 5]) { g.box(-3, 13, z, -3, 24, z, chrome); g.set(-3, 25, z, PAL.ink); }
    // wheel arches
    for (const x of [-10, 11]) for (const z of [-8, 7]) g.box(x - 6, 8, z, x + 6, 9, z, PAL.ink);
    // lift it up: monster-truck suspension
    const out = new VoxGrid().merge(g, 0, 5, 0);
    for (const x of [-10, 11]) {
      out.box(x - 1, 5, -6, x, 6, 5, PAL.metalDD); // axle
      for (const z of [-5, 4]) {
        for (let y = 7; y <= 10; y++) out.set(x - 2 + (y & 1), y, z, PAL.yellow).set(x + 1 - (y & 1), y, z, PAL.yellow);
        out.box(x - 1, 7, z, x, 10, z, 0x3a3f4e);
      }
    }
    out.box(-12, 7, -1, 13, 8, 0, PAL.metalD); // drive shaft
    return out;
  }, { scale: 0.1, pivot: [0, 0, 0] });
  const wheelGeo = vgeo('truck_wheel', () => {
    const g = new VoxGrid();
    const R = 6;
    for (let x = -R; x <= R; x++) for (let y = -R; y <= R; y++) {
      const r = Math.hypot(x, y);
      if (r > R + 0.4) continue;
      for (let z = -2; z <= 1; z++) {
        let c = PAL.ink;
        if (r > R - 0.6 && ((Math.atan2(y, x) * 8 / Math.PI) & 1)) c = 0x2a2a34;
        if (r < 3.5) c = (z === 1 || z === -2) ? (r < 1.5 ? 0xdfe6ee : PAL.yellow) : 0x333340;
        g.set(x, y, z, c);
      }
    }
    for (let a = 0; a < 5; a++) {
      const t = (a / 5) * Math.PI * 2;
      for (const z of [-3, 2]) g.set(Math.round(Math.cos(t) * 2), Math.round(Math.sin(t) * 2), z, 0xdfe6ee);
    }
    return g;
  }, { scale: 0.1, pivot: [0.5, 0.5, 0] });
  const root = new THREE.Group();
  root.name = 'truck';
  const bodyG = new THREE.Group();
  bodyG.add(body);
  root.add(bodyG);
  const wheels = [];
  for (const x of [-1.0, 1.1]) for (const z of [-0.85, 0.85]) {
    const w = new THREE.Group();
    w.position.set(x, 0.6, z);
    const m = makeMesh(wheelGeo);
    if (z < 0) m.rotation.y = Math.PI;
    w.add(m);
    root.add(w);
    wheels.push(w);
  }
  return { root, body: bodyG, wheels };
}

// ---------------------------------------------------------------------------
export function makeFootball() {
  const ball = vmesh('football', () => {
    const g = new VoxGrid();
    const t = (1 + Math.sqrt(5)) / 2;
    const ico = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]]
      .map(([a, b, c]) => { const l = Math.hypot(a, b, c); return [a / l, b / l, c / l]; });
    const R = 6.1;
    for (let x = -7; x <= 7; x++) for (let y = -7; y <= 7; y++) for (let z = -7; z <= 7; z++) {
      const r = Math.hypot(x, y, z);
      if (r > R + 0.3) continue;
      const nx = x / (r || 1), ny = y / (r || 1), nz = z / (r || 1);
      let best = -1;
      for (const v of ico) best = Math.max(best, v[0] * nx + v[1] * ny + v[2] * nz);
      g.set(x, y, z, best > 0.935 ? 0x1a1a22 : (best > 0.9 ? 0xd0d4de : 0xffffff));
    }
    return g;
  }, { scale: 0.027, pivot: 'center' });
  // root sits on y=0; spin root.userData.ball (centred) for rolling/kicks
  ball.position.y = 6.5 * 0.027;
  const root = group(ball);
  root.name = 'football';
  root.userData.ball = ball;
  return root;
}

// ---------------------------------------------------------------------------
export function makeSubscribeButton() {
  const base = vmesh('subBase', () => {
    const g = new VoxGrid();
    g.box(-14, 0, -4, 13, 1, 3, PAL.metalDD);
    g.box(-13, 2, -3, 12, 2, 2, PAL.metalD);
    for (let x = -13; x <= 12; x += 3) g.set(x, 1, 4, PAL.red, true);
    return g;
  }, { scale: 0.1, pivot: [0, 0, 0] });
  const btn = vmesh('subButton', () => {
    const g = new VoxGrid();
    const W = 12, H = 8, Rr = 4;
    for (let x = -W; x <= W - 1; x++) for (let y = -H; y <= H - 1; y++) {
      const cx = Math.max(Math.abs(x + 0.5) - (W - Rr), 0), cy = Math.max(Math.abs(y + 0.5) - (H - Rr), 0);
      if (cx * cx + cy * cy > Rr * Rr) continue;
      const edge = cx * cx + cy * cy > (Rr - 1) * (Rr - 1) || Math.abs(x + 0.5) > W - 1 || Math.abs(y + 0.5) > H - 1;
      for (let z = -2; z <= 2; z++) g.set(x, y, z, z === 2 ? (edge ? 0xff4a4a : 0xff2020) : z === -2 ? 0xb01010 : 0xd81818);
      if (y > 3 && !edge && (x + y) % 5 === 0) g.set(x, y, 2, 0xff6a6a);
    }
    // white play triangle
    for (let x = -3; x <= 4; x++) {
      const h = Math.round((4 - x) * 0.62);
      for (let y = -h; y <= h; y++) g.set(x, y, 3, 0xffffff);
    }
    return g;
  }, { scale: 0.1, pivot: [0, 0, 0] });
  btn.position.set(0, 1.15, 0);
  const press = new THREE.Group();
  press.add(btn);
  const root = group(base, press);
  root.name = 'subscribeButton';
  root.userData.button = press;
  return root;
}

// ---------------------------------------------------------------------------
export function makeSodaRocket() {
  const m = vmesh('sodaRocket', () => {
    const g = new VoxGrid();
    const bottle = 0x3fbf6a, bottleL = 0x9ff5b8, bottleD = 0x2a9a50;
    // foam cloud blasting out of the nozzle
    const foam = (x, y, z) => (hash3(x, y, z) < 0.3 ? 0xdff2ff : y > 3 ? 0xffffff : 0xf0f8ff);
    g.ellipsoid(0, 2.5, 0, 4.5, 2.5, 4.5, foam);
    g.ellipsoid(3, 1.5, 2, 2.5, 1.5, 2.5, foam);
    g.ellipsoid(-3, 1.8, -2, 2.5, 1.8, 2.5, foam);
    g.ellipsoid(-1, 1.2, 3, 2, 1.2, 2, foam);
    g.carve((x, y) => y < 0);
    // inverted bottle: cap at the bottom
    g.cylinder(0, 0, 5, 6, 2, PAL.red);
    g.cylinder(0, 0, 7, 8, 2, bottle);
    g.cylinder(0, 0, 9, 9, 3, bottle);
    g.cylinder(0, 0, 10, 26, 4, (x, y, z) => (x === -2 && z > 2 ? bottleL : (x + z) % 7 === 0 ? bottleD : bottle));
    // label with white swoosh
    g.cylinder(0, 0, 14, 20, 4, (x, y, z) => ((Math.round(x * 0.5 + z * 0.3) === y - 17) ? 0xffffff : y === 14 || y === 20 ? PAL.yellow : PAL.red));
    // nose cone
    for (let y = 27; y <= 33; y++) g.cylinder(0, 0, y, y, Math.max(0.3, 4 - (y - 27) * 0.62), (y - 27) % 3 === 2 ? 0xffffff : PAL.red);
    g.set(0, 34, 0, PAL.yellow, true);
    // 3 fins
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + 0.4;
      const ca = Math.cos(a), sa = Math.sin(a);
      for (let r = 4; r <= 8; r++) for (let y = 8; y <= 16 - (r - 4) * 1.4; y++) {
        const x = Math.round(ca * r), z = Math.round(sa * r);
        g.set(x, y, z, r === 8 || y === 8 ? 0xffffff : PAL.red);
      }
    }
    // shake marks
    for (const [x, y, z] of [[6, 24, 2], [7, 22, 1], [-6, 23, 2], [-7, 21, 1]]) g.set(x, y, z, PAL.yellow, true);
    return g;
  }, { scale: 0.05 });
  const root = group(m);
  root.name = 'sodaRocket';
  return root;
}

// ---------------------------------------------------------------------------
const beakerCache = new Map();
/** Lab flask with coloured liquid (translucent glass + glowing liquid). ~0.4 tall. */
export function makeBeaker(color = PAL.slime) {
  const root = new THREE.Group();
  root.name = 'beaker';
  const k = color;
  if (!beakerCache.has(k)) {
    const liquid = new VoxGrid();
    for (let y = 0; y <= 5; y++) {
      const r = 3.6 - y * 0.35;
      liquid.cylinder(0, 0, y, y, r, (x, yy, z) => (yy === 5 ? shade(color, 0.35) : color), 'y', true);
    }
    liquid.set(1, 6, 0, shade(color, 0.5), true).set(-1, 7, 1, shade(color, 0.5), true);
    const rim = new VoxGrid();
    ring(rim, 0, 0, 0, 0, 2, 0xe8f4ff);
    rim.cylinder(0, 0, 1, 2, 1, 0xc98c55);
    beakerCache.set(k, { liq: liquid.build({ scale: 0.04, pivot: [0.5, 0, 0.5] }), rim: rim.build({ scale: 0.04, pivot: [0.5, 0, 0.5] }) });
  }
  const c = beakerCache.get(k);
  const liq = makeMesh(c.liq);
  liq.position.y = 0.01;
  root.add(liq);
  const glassGeo = beakerCache.get('glass') ?? (() => {
    const pts = [];
    pts.push(new THREE.Vector2(0.001, 0), new THREE.Vector2(0.17, 0), new THREE.Vector2(0.18, 0.02), new THREE.Vector2(0.16, 0.12), new THREE.Vector2(0.07, 0.3), new THREE.Vector2(0.065, 0.42), new THREE.Vector2(0.08, 0.44));
    const geo = new THREE.LatheGeometry(pts, 12);
    beakerCache.set('glass', geo);
    return geo;
  })();
  const glass = new THREE.Mesh(glassGeo, glassMat(0xe8f8ff, 0.32));
  glass.renderOrder = 3;
  root.add(glass);
  const rim = makeMesh(c.rim);
  rim.position.y = 0.42;
  root.add(rim);
  return root;
}

// ---------------------------------------------------------------------------
// Food items (~0.3-0.5 units), voxel size 0.05
const FOOD = {
  burger() {
    const g = new VoxGrid();
    const bun = 0xe8a24a, bunD = 0xc8802a;
    g.ellipsoid(0, 1, 0, 4.5, 1.2, 4.5, bunD);
    g.cylinder(0, 0, 2, 3, 5, 0x6a3a1e); // patty
    g.cylinder(0, 0, 3, 3, 5, (x, y, z) => (hash3(x, y, z) < 0.3 ? 0x4a2412 : 0x6a3a1e));
    g.cylinder(0, 0, 4, 4, 5, PAL.yellow); // cheese
    for (const [x, z] of [[5, 2], [-3, 5], [2, -5], [-5, -2]]) g.set(x, 3, z, PAL.yellow);
    g.cylinder(0, 0, 5, 5, 5, (x, y, z) => (hash3(x, 1, z) < 0.5 ? PAL.green : 0x8ee05a)); // lettuce
    for (let a = 0; a < 12; a++) { const t = (a / 12) * Math.PI * 2; g.set(Math.round(Math.cos(t) * 5.6), 5 - (a & 1), Math.round(Math.sin(t) * 5.6), PAL.green); }
    g.cylinder(0, 0, 6, 6, 4, PAL.red); // tomato
    g.ellipsoid(0, 7, 0, 4.8, 3, 4.8, (x, y, z) => (y > 8 && hash3(x, y, z) < 0.12 ? 0xfff6dc : bun));
    g.carve((x, y) => y < 7 && y > 6.5);
    return g;
  },
  fries() {
    const g = new VoxGrid();
    for (let y = 0; y <= 6; y++) {
      const w = 2 + Math.floor(y / 3);
      g.box(-w - 1, y, -2, w, y, 1, PAL.red);
    }
    g.box(-2, 1, 2, 1, 4, 2, PAL.yellow);
    g.box(-1, 2, 2, 0, 3, 2, PAL.red);
    for (let x = -3; x <= 2; x++) for (let z = -1; z <= 0; z++) {
      const h = 7 + Math.floor(hash3(x, 2, z) * 4);
      g.box(x, 5, z, x, h, z, (xx, y) => (y === h ? 0xe8b030 : 0xffd23f));
    }
    return g;
  },
  pizza() {
    const g = new VoxGrid();
    for (let z = 0; z <= 9; z++) {
      const w = Math.round((9 - z) * 0.55);
      g.box(-w, 0, z - 5, w, 0, z - 5, 0xe8a24a);
      g.box(-w, 1, z - 5, w, 1, z - 5, (x) => (Math.abs(x) === w ? 0xe8a24a : 0xffd84a));
    }
    g.box(-5, 0, -6, 5, 2, -5, 0xc8802a);
    for (const [x, z] of [[-2, -3], [2, -2], [0, 0], [-1, 2]]) g.box(x, 2, z, x + 1, 2, z + 1, 0xd03030);
    g.set(1, 2, -4, 0x5fbf4a).set(-2, 2, 1, 0x5fbf4a);
    g.set(1, 1, 4, 0xffd84a).set(1, 0, 5, 0xffd84a);
    return g;
  },
  donut() {
    const g = new VoxGrid();
    const sp = [PAL.blue, PAL.yellow, 0xffffff, PAL.green, PAL.orange];
    for (let x = -6; x <= 6; x++) for (let y = -6; y <= 6; y++) for (let z = -2; z <= 2; z++) {
      const r = Math.hypot(x, y);
      const d = Math.hypot(r - 4, z * 1.2);
      if (d > 2.3) continue;
      const front = z >= 1;
      let c = 0xe0a050;
      if (front || (z === 0 && hash3(x, y, 1) < 0.5)) c = PAL.pinkL;
      if (z === 2 && hash3(x, y, z) < 0.2) c = sp[Math.floor(hash3(y, x, 3) * sp.length)];
      g.set(x, y + 6, z, c);
    }
    return g;
  },
  soda() {
    const g = new VoxGrid();
    g.cylinder(0, 0, 0, 8, 3, (x, y) => (y === 0 ? 0xb8c0cc : y >= 3 && y <= 5 && ((x + y) % 4 === 0) ? 0xffffff : PAL.red));
    g.cylinder(0, 0, 9, 9, 2, 0xd7dde6);
    g.set(1, 10, 0, 0x8f98aa);
    text(g, 'C', 0, 2, 4, '+z', 0xffffff, { center: true });
    return g;
  },
  chocoBar() {
    const g = new VoxGrid();
    g.box(-3, 0, -6, 2, 1, 5, (x, y, z) => ((z + 6) % 3 === 0 || x === -1 ? PAL.chocoD : y === 1 ? PAL.chocoL : PAL.choco));
    g.box(-4, 0, 0, 3, 2, 5, PAL.pink);
    g.box(-2, 2, 1, 1, 2, 4, 0xffffff);
    g.set(-1, 2, 2, PAL.pink).set(0, 2, 3, PAL.pink);
    for (let x = -4; x <= 3; x++) g.set(x, 1 + (x & 1), -1 + (x & 1) * 0, 0xd8dde8);
    return g;
  },
  apple() {
    const g = new VoxGrid();
    g.ellipsoid(0, 3.5, 0, 3.6, 3.4, 3.6, (x, y, z) => (x > 0 && y > 4 && hash3(x, y, z) < 0.3 ? 0xff6a6a : y < 2 ? 0xb81c24 : PAL.red));
    g.set(0, 7, 0, PAL.woodD).set(0, 8, 0, PAL.woodD);
    g.set(1, 8, 0, PAL.green).set(2, 8, 0, PAL.green).set(2, 9, 0, PAL.green);
    g.del(0, 7, 1);
    return g;
  },
  banana() {
    const g = new VoxGrid();
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      const x = Math.round((t - 0.5) * 11), y = Math.round(Math.pow(Math.abs(t - 0.5) * 2, 2) * 4);
      const r = i === 0 || i === 12 ? 0 : 1;
      g.box(x, y, -r, x, y + r + (r ? 1 : 0), r, i === 0 || i === 12 ? PAL.woodD : (i % 4 === 0 ? 0xffe680 : PAL.yellow));
    }
    return g;
  },
  milk() {
    const g = new VoxGrid();
    g.box(-2, 0, -2, 2, 7, 2, (x, y) => (y >= 2 && y <= 4 ? PAL.blue : 0xffffff));
    for (let i = 0; i < 3; i++) g.box(-2 + i, 8 + i, -2, 2 - i, 8 + i, 2, 0xffffff);
    g.box(-1, 10, -2, 1, 11, 2, 0xffffff);
    g.box(-1, 3, 3, 1, 3, 3, 0xffffff);
    g.set(0, 6, 3, PAL.blue);
    return g;
  },
  watermelon() {
    const g = new VoxGrid();
    for (let x = -6; x <= 6; x++) for (let y = 0; y <= 6; y++) {
      const r = Math.hypot(x, y);
      if (r > 6.4) continue;
      for (let z = -1; z <= 1; z++) {
        let c = r > 5.5 ? PAL.greenD : r > 4.8 ? 0xb8f0a0 : 0xff4a5a;
        if (r < 4.5 && z === 1 && hash3(x, y, z) < 0.12) c = PAL.ink;
        g.set(x, y, z, c);
      }
    }
    return g;
  },
  cake() {
    const g = new VoxGrid();
    g.cylinder(0, 0, 0, 0, 5, 0xffffff);
    g.cylinder(0, 0, 1, 3, 4, 0xffe6c0);
    g.cylinder(0, 0, 4, 4, 4, PAL.pinkL);
    g.cylinder(0, 0, 5, 7, 4, 0xffe6c0);
    g.cylinder(0, 0, 8, 8, 4, PAL.pinkL);
    for (let a = 0; a < 14; a++) { const t = (a / 14) * Math.PI * 2; const d = 1 + (a % 3); for (let i = 0; i < d; i++) g.set(Math.round(Math.cos(t) * 4.5), 8 - i, Math.round(Math.sin(t) * 4.5), PAL.pinkL); }
    for (const [x, z, c] of [[-2, 0, PAL.blue], [1, -1, PAL.yellow], [0, 2, PAL.green]]) { g.box(x, 9, z, x, 11, z, c); g.set(x, 12, z, 0xffd23f, true); }
    g.box(2, 9, 1, 3, 10, 2, PAL.red);
    return g;
  },
  cereal() {
    const g = new VoxGrid();
    g.box(-3, 0, -1, 3, 10, 1, (x, y) => (y >= 9 ? PAL.yellow : PAL.orange));
    g.box(-2, 3, 2, 2, 7, 2, PAL.yellow);
    g.ellipsoid(0, 5, 2, 1.5, 1.5, 0, 0xffffff);
    g.set(-1, 5, 3, PAL.ink).set(1, 5, 3, PAL.ink).set(0, 4, 3, PAL.red);
    for (const [x, c] of [[-2, PAL.red], [0, PAL.pink], [2, PAL.blue]]) g.set(x, 8, 2, c);
    g.box(-2, 1, 2, -1, 1, 2, 0xffffff).box(1, 1, 2, 2, 1, 2, 0xffffff);
    return g;
  },
};
export const FOOD_KINDS = Object.keys(FOOD);
export function makeFood(kind = 'burger') {
  const fn = FOOD[kind] ?? FOOD.burger;
  const m = vmesh('food_' + (FOOD[kind] ? kind : 'burger'), fn, { scale: S05 });
  const root = group(m);
  root.name = 'food:' + kind;
  return root;
}
/** Merge-ready grid of a food item (for shelves/backdrops). */
export function foodGrid(kind) { return (FOOD[kind] ?? FOOD.burger)(); }

/** Golden material pair for statues (uses the engine env map). */
export const goldMats = () => variantMaterials('gold');
export { mixHex };

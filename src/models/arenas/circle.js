// Arena 2: LAST TO LEAVE CIRCLE — "Last To Leave Circle Wins $500,000".
// A sunny field with a GIANT hand-painted red/white circle that the battle lane
// runs straight across. Inside: campers' tents, sleeping bags, coolers, camp
// chairs and snack piles; a podium with a mountain of cash and a $500,000
// sign; film-crew cranes, tripods, a drone and spotlight towers; bleachers of
// cheering fans (pixel-art crowd), porta-potties and a LAST TO LEAVE
// billboard, over golden-afternoon suburbs, a water tower and rolling hills.
import {
  THREE, VoxGrid, FIELD, shade, mixHex, hash3, vnoise, mulberry32, text, textW, glowMat, canvasTex,
  paintGradient, paintClouds, paintRidge, paintTrees, paintSun, px, disc, skyTexture, parallaxWidth,
  treeGrid, signGrid,
  pixbuf, skyGlow, paintSunPx, paintCumulus, paintCloudBank, paintStreaks, paintBirdsPx, paintRange, fitSkyAuto,
  setInstance, liveInstances, swayInst, blinkInst, addPuffs, addSparkles, addClouds, addBirds, voxRange, addFlag,
  leafyTreeGrid, pineTreeGrid, bushGrid, flowerGrid, tuftGrid,
} from './kit.js';

const LH = FIELD.LANE_HALF;
const RING = 15; // radius of the painted circle (centred on the lane centre)

const C = {
  grass: 0x6cbf48, grassD: 0x4f9e3a, grassL: 0x95d760, trampled: 0xb9c27a,
  lane1: 0xa6d46a, lane2: 0x97c75d, chalk: 0xfbf8ee,
  red: 0xe8343c, redD: 0xb3222c, white: 0xfaf6ee, ink: 0x1d1a24,
  gold: 0xffc21a, goldL: 0xffe680, goldD: 0xc8901a,
  cash: 0x6fcf5f, cashD: 0x3f8f45, cashL: 0xb8f0a0,
  metal: 0xb8c0cc, metalD: 0x5d6476, alu: 0xd4dae2, black: 0x22222c,
  blue: 0x29b6f6, pink: 0xff2e88, wood: 0xa0673a, woodD: 0x6e4224,
};
const GEAR = [0xff8a2a, 0x29b6f6, 0x5fdc4a, 0xffd23f, 0xe8343c, 0xb05cff, 0xff4fa3];

// --------------------------------------------------------------------------- helpers

/** Pixel text with commas (the voxel font has none), centred on cx, +z face. */
function moneyText(g, str, cx, y, z, col, o = {}) {
  const s = o.scale ?? 1;
  const parts = str.split(',');
  const W = parts.reduce((a, p) => a + textW(p, s), 0) + (parts.length - 1) * 3 * s;
  let x = cx - Math.floor(W / 2);
  parts.forEach((p, i) => {
    text(g, p, x, y, z, '+z', col, { scale: s, glow: o.glow, depth: o.depth });
    x += textW(p, s);
    if (i < parts.length - 1) {
      x += s;
      for (let a = 0; a < s; a++) for (let b = 0; b < s; b++) for (let d = 0; d < (o.depth ?? 1); d++) {
        g.set(x + a, y + b, z + d, col, o.glow);
        g.set(x + a - (s > 1 ? 1 : 0), y - s + b, z + d, col, o.glow);
      }
      x += 2 * s;
    }
  });
  return W;
}

function anchor(K, name, x, y, z) {
  const o = new THREE.Object3D();
  o.position.set(x, y, z);
  o.name = name;
  K.root.add(o);
  K.hotspots[name] = o;
  return o;
}

// --------------------------------------------------------------------------- voxel props (0.1 scale unless noted)

const tentGrid = (col) => () => {
  const g = new VoxGrid();
  const dark = shade(col, -0.3), light = shade(col, 0.22), pole = shade(col, -0.22), inner = 0x4a3a56;
  const RX = 8.6, RY = 10.2, RZ = 6.8;
  for (let x = -9; x <= 8; x++) for (let y = 0; y <= 10; y++) for (let z = -7; z <= 6; z++) {
    const dx = (x + 0.5) / RX, dy = (y + 0.5) / RY, dz = (z + 0.5) / RZ;
    const d = dx * dx + dy * dy + dz * dz;
    if (d > 1) continue;
    let c = y >= 8 ? light : y <= 0 ? dark : col;
    if ((y === 3 || y === 4) && d > 0.72) c = shade(col, -0.14); // rain-fly band
    g.set(x, y, z, c);
  }
  // two crossing poles hugging the dome surface
  for (const sz of [-1, 1]) for (let i = -40; i <= 40; i++) {
    const t = i / 40, k = Math.SQRT1_2 * t;
    const y = Math.floor(Math.sqrt(Math.max(0, 1 - t * t)) * (RY - 0.2));
    const x = Math.floor(k * RX), z = Math.floor(sz * k * RZ);
    let yy = y;
    while (yy > 0 && !g.has(x, yy, z)) yy--;
    while (g.has(x, yy + 1, z)) yy++;
    if (g.has(x, yy, z)) g.set(x, yy, z, pole);
  }
  // arched doorway on +z with a rolled-up flap
  for (let x = -3; x <= 2; x++) for (let y = 0; y <= 5; y++) {
    const ax = Math.abs(x + 0.5);
    if (y > 4.8 - ax * 0.8) continue;
    for (let z = 3; z <= 7; z++) g.del(x, y, z);
    g.set(x, y, 2, inner);
  }
  for (let x = -3; x <= 2; x++) g.set(x, 5 - Math.round(Math.abs(x + 0.5) * 0.8), 4, light);
  g.box(-1, 0, 3, 0, 0, 4, 0x6a5a8a); // little doormat
  // guy lines + stakes
  for (const sx of [-1, 1]) {
    g.line(sx * 8, 5, 0, sx * 12, 0, 0, 0xd8d0c0);
    g.set(sx * 12, 0, 0, 0x8a8a96).set(sx * 12, 1, 0, 0x8a8a96);
  }
  return g;
};

/** A-frame ridge tent: ridge along z, triangular door face on +z with a canopy flap. */
const aframeGrid = (col) => () => {
  const g = new VoxGrid();
  const lit = shade(col, 0.16), dim = shade(col, -0.18), trim = 0xf4f0e6, inner = 0x4a3a56;
  for (let z = -7; z <= 6; z++) for (let y = 0; y <= 9; y++) {
    const hw = Math.round(7.5 * (1 - y / 10));
    for (let x = -hw - 1; x <= hw; x++) {
      const edge = x === -hw - 1 || x === hw;
      g.set(x, y, z, y === 9 ? trim : z === 6 && edge ? trim : x < 0 ? lit : dim);
    }
  }
  // door (zipped half open) + canopy flap held up by two poles
  for (let y = 0; y <= 5; y++) for (let x = -2; x <= 1; x++) if (Math.abs(x + 0.5) < 3 - y * 0.35) { g.del(x, y, 6); g.set(x, y, 5, inner); }
  for (let z = 7; z <= 10; z++) g.box(-5, 7 - Math.floor((z - 7) / 2), z, 4, 7 - Math.floor((z - 7) / 2), z, z === 10 ? trim : lit);
  for (const x of [-5, 4]) g.box(x, 0, 10, x, 5, 10, 0x8a8a96);
  for (const x of [-9, 8]) g.set(x, 0, -6, 0x8a8a96).set(x, 0, 5, 0x8a8a96);
  return g;
};

const bagGrid = (col) => () => {
  const g = new VoxGrid();
  const d = shade(col, -0.2), inner = 0x3a2a4a, zip = 0xd8dce4;
  for (let x = -8; x <= 8; x++) {
    const t = (x + 8) / 16;
    const hw = Math.round(3.6 - t * 1.3);
    for (let z = -hw; z < hw; z++) {
      const top = Math.abs(z + 0.5) < hw - 1 ? 2 : 1;
      for (let y = 0; y < top; y++) g.set(x, y, z, (x + 8) % 3 === 0 && y === top - 1 ? d : col);
    }
    g.set(x, 2, hw - 2, zip);
  }
  g.box(-8, 1, -2, -7, 1, 1, inner);
  g.box(-11, 0, -3, -9, 1, 2, 0xffffff).box(-11, 2, -2, -9, 2, 1, 0xf0f0f6);
  return g;
};

const coolerGrid = (col) => () => {
  const g = new VoxGrid();
  g.box(-5, 0, -3, 4, 5, 2, col);
  g.box(-5, 0, -3, 4, 0, 2, shade(col, -0.35));
  g.box(-5, 6, -3, 4, 7, 2, C.white);
  g.box(-4, 8, -2, 3, 8, 1, 0xe2e8f0);
  g.box(-5, 6, 3, 4, 6, 3, 0xd0d6de);
  for (const x of [-6, 5]) g.box(x, 4, -1, x, 5, 0, C.black);
  g.box(-2, 2, 3, 1, 4, 3, C.white);
  g.set(-1, 3, 4, C.red).set(0, 3, 4, C.red);
  g.set(3, 1, 3, 0x9aa2b4);
  // a couple of cans on the lid
  g.box(-3, 9, -1, -2, 11, 0, C.red).set(-3, 12, -1, C.metal);
  g.box(1, 9, 0, 2, 10, 0, 0x1d9bf0);
  return g;
};

const chairGrid = (col) => () => {
  const g = new VoxGrid();
  const fr = 0x3a3d48, d = shade(col, -0.2);
  for (const x of [-4, 3]) {
    g.line(x, 0, 2, x, 6, -2, fr);
    g.line(x, 0, -2, x, 6, 2, fr);
    g.line(x, 6, -2, x, 13, -4, fr);
    g.box(x, 8, -2, x, 8, 3, fr);
    g.box(x, 6, 2, x, 8, 2, fr);
  }
  g.box(-3, 5, -2, 2, 5, 2, col);
  g.box(-3, 4, -1, 2, 4, 1, d);
  for (let y = 6; y <= 13; y++) {
    const z = -2 - Math.round((y - 6) * 0.28);
    g.box(-3, y, z, 2, y, z, y % 3 === 0 ? d : col);
  }
  g.box(-5, 8, -1, -5, 8, 2, col).box(4, 8, -1, 4, 8, 2, col);
  g.box(4, 7, 3, 5, 8, 3, fr);
  g.box(4, 9, 3, 4, 11, 3, C.red).set(4, 12, 3, C.metal);
  return g;
};

/** Snack pile: pizza boxes, Feastables bars, chip bags, soda cans, water bottles. */
const snackGrid = (seed) => () => {
  const g = new VoxGrid();
  const bars = [0x1d9bf0, 0xff4fa3, 0xffd23f];
  const bags = [0xff8a2a, 0xe8343c, 0x5fdc4a, 0xb05cff, 0xffd23f];
  // pizza boxes
  g.box(-6, 0, -4, 3, 0, 4, 0xf4ece0).box(-6, 1, -4, 3, 1, 4, 0xe4d6c0);
  g.box(-5, 2, -3, 4, 2, 5, 0xf4ece0);
  g.set(-2, 3, 1, C.red).set(-1, 3, 1, C.red).set(-2, 3, 2, C.red);
  // chip bags leaning
  for (let i = 0; i < 3; i++) {
    const c = bags[(seed + i) % bags.length], x0 = -7 + i * 5, z0 = -5 + (i % 2);
    g.box(x0, 0, z0, x0 + 3, 6, z0 + 1, c);
    g.box(x0, 7, z0, x0 + 3, 7, z0 + 1, shade(c, -0.3));
    g.box(x0 + 1, 2, z0 + 2, x0 + 2, 4, z0 + 2, C.goldL);
    g.set(x0 + 1, 3, z0 + 3, shade(c, 0.4));
  }
  // Feastables bars stacked
  for (let k = 0; k < 4; k++) {
    const c = bars[(seed + k) % 3];
    const x0 = 4 - (k % 2) * 2, y = k;
    g.box(x0, y, 1, x0 + 5, y, 3, c);
    g.box(x0 + 2, y, 4, x0 + 3, y, 4, C.white);
  }
  // cans + bottles
  for (const [x, z, c] of [[-7, 4, C.red], [-5, 6, 0x1d9bf0], [7, -2, C.red], [6, -4, 0x5fdc4a]]) g.box(x, 0, z, x + 1, 2, z + 1, c).set(x, 3, z, C.metal);
  for (const [x, z] of [[9, 1], [9, 3]]) g.box(x, 0, z, x, 4, z, 0x9fe0ff).set(x, 5, z, 0x1d9bf0);
  return g;
};

/** Round stage + giant cash stack (sign and bulbs are separate). */
const podiumGrid = () => {
  const g = new VoxGrid();
  const R0 = 22, R1 = 17;
  for (let x = -R0 - 1; x <= R0; x++) for (let z = -R0 - 1; z <= R0; z++) {
    const d = Math.hypot(x + 0.5, z + 0.5);
    if (d <= R0) for (let y = 0; y < 3; y++) g.set(x, y, z, y === 2 ? (d > R0 - 1.2 ? C.gold : C.white) : (Math.floor(Math.atan2(z, x) * 6) & 1) ? 0xe8343c : 0xc8202a);
    if (d <= R1) for (let y = 3; y < 6; y++) g.set(x, y, z, y === 5 ? (d > R1 - 1.2 ? C.gold : 0xf4f0e6) : C.white);
  }
  // red carpet steps on the front
  for (let x = -5; x <= 4; x++) {
    for (let z = R1; z <= R0 + 3; z++) g.set(x, 3 + (z < R0 - 1 ? 0 : -1) - (z > R0 ? 1 : 0), z, C.red);
  }
  // cash mountain: strapped bundles (6 long, 2 tall) stacked in stepped tiers
  const bundle = (x, y, z, ox) => {
    const u = (((x + ox) % 6) + 6) % 6;
    if (u === 3) return y & 1 ? 0xe8b84a : 0xc8962a;
    if (u === 0) return 0x3f8f45;
    return y & 1 ? 0x8ad878 : hash3(x, y, z) < 0.15 ? 0x6fcf5f : 0x5fbf55;
  };
  for (let y = 6; y < 22; y++) {
    const shrink = y < 14 ? 0 : y < 18 ? 3 : 6;
    const row = Math.floor((y - 6) / 2);
    for (let x = -10 + shrink; x <= 9 - shrink; x++) for (let z = -6 + shrink; z <= 5 - shrink; z++) g.set(x, y, z, bundle(x, y, z, row & 1 ? 3 : 0));
  }
  // loose bundles on top + gold $ medallion on the front
  for (const [x, z, y] of [[-4, -2, 22], [1, 0, 22], [-1, -3, 24]]) g.box(x, y, z, x + 5, y + 1, z + 2, (xx, yy) => ((xx - x) === 3 ? 0xe8b84a : yy & 1 ? 0x8ad878 : 0x5fbf55));
  g.cylinder(-0.5, 7, 11, 11, 4.5, C.goldD, 'z');
  g.cylinder(-0.5, 7, 12, 12, 4, C.gold, 'z');
  text(g, '$', 0, 10, 13, '+z', C.goldL, { center: true });
  return g;
};

const prizeSignGrid = () => {
  const g = new VoxGrid();
  const W = 74, H = 22;
  const x0 = -W / 2;
  // posts
  for (const x of [x0 + 6, x0 + W - 7]) g.box(x, 0, -1, x + 1, 30, 0, C.metalD);
  // board
  g.box(x0, 30, -1, x0 + W - 1, 30 + H, 0, 0xb3122a);
  g.box(x0, 30, 1, x0 + W - 1, 30, 1, C.gold).box(x0, 30 + H, 1, x0 + W - 1, 30 + H, 1, C.gold);
  g.box(x0, 30, 1, x0, 30 + H, 1, C.gold).box(x0 + W - 1, 30, 1, x0 + W - 1, 30 + H, 1, C.gold);
  // dim bulb sockets around the frame
  for (let x = x0 + 2; x < x0 + W - 1; x += 3) { g.set(x, 31, 2, C.goldD); g.set(x, 29 + H, 2, C.goldD); }
  moneyText(g, '$500,000', 0, 36, 1, 0xb08a20, { scale: 2, glow: true, depth: 2 });
  return g;
};

const pottyGrid = () => {
  const g = new VoxGrid();
  const blue = 0x2f86e0, blueD = 0x1f5fb0, roof = 0xeef2f8;
  g.box(-5, 0, -5, 5, 21, 5, (x, y, z) => {
    if (y === 0) return blueD;
    const side = x === -5 || x === 5, back = z === -5;
    if ((side && (z + 6) % 2 === 0) || (back && (x + 6) % 2 === 0)) return blueD;
    return blue;
  });
  g.box(-4, 1, 5, 4, 20, 5, null);
  g.box(-4, 1, 4, 4, 20, 4, 0x15233a);
  g.box(-1, 1, 3, 1, 4, 3, 0xf4f6fa);
  g.box(-6, 22, -6, 6, 22, 6, roof).box(-5, 23, -5, 5, 23, 5, roof).box(-3, 24, -3, 3, 24, 3, 0xdfe6f0);
  g.box(-6, 21, 6, 6, 21, 6, blueD);
  g.box(3, 22, -4, 3, 28, -4, 0x9aa2b4).box(2, 29, -5, 4, 29, -3, 0x9aa2b4);
  return g;
};
const pottyDoorGrid = () => {
  const g = new VoxGrid();
  g.box(0, 0, 0, 8, 19, 0, (x) => (x % 2 ? 0x2f86e0 : 0x2a78cc));
  g.box(1, 16, 1, 7, 17, 1, 0x1f5fb0);
  g.box(6, 9, 1, 6, 11, 1, 0xd8dce4);
  g.set(5, 13, 1, 0x5fdc4a, true).set(6, 13, 1, 0x5fdc4a, true);
  return g;
};

const craneBaseGrid = () => {
  const g = new VoxGrid();
  g.box(-7, 1, -5, 6, 2, 4, 0x3a3d48);
  g.box(-7, 3, -5, 6, 3, 4, (x, y, z) => ((x + z) & 1 ? 0xffd23f : 0x3a3d48));
  for (const [x, z] of [[-7, -6], [6, -6], [-7, 5], [6, 5]]) g.box(x - 1, 0, z, x + 1, 2, z, C.black);
  g.box(-1, 4, -1, 0, 26, 0, (x, y) => (y % 7 === 0 ? 0xffd23f : 0x2b2a36));
  g.box(-2, 27, -2, 1, 28, 1, C.metalD);
  return g;
};
const craneArmGrid = () => {
  const g = new VoxGrid();
  const chord = 0x9aa2b4, lace = 0x6b7386;
  for (let x = -16; x <= 38; x++) {
    for (const z of [-1, 0]) { g.set(x, 1, z, chord); g.set(x, -1, z, chord); }
    if ((x + 16) % 4 === 0) for (const z of [-1, 0]) g.set(x, 0, z, lace);
    if ((x + 16) % 4 === 2) for (const z of [-1, 0]) g.set(x, (x & 4) ? 0 : 0, z, lace);
  }
  g.box(-2, -2, -2, 1, 2, 1, C.metalD);
  // counterweights
  for (let i = 0; i < 4; i++) g.box(-19 + i, -5, -3, -19 + i, 1, 2, i & 1 ? 0xffd23f : 0x1a1a22);
  // remote head + camera hanging under the tip
  g.box(37, -3, -1, 38, -1, 0, C.black);
  g.box(34, -8, -2, 41, -4, 1, 0x1a1a22);
  g.box(42, -7, -1, 44, -5, 0, 0x2e3240);
  g.box(45, -7, -1, 45, -5, 0, 0x6fd8ff, true);
  g.set(36, -3, 0, 0xff2a2a, true);
  g.box(33, -7, -2, 33, -5, -2, 0x29b6f6, true);
  return g;
};

const tripodGrid = () => {
  const g = new VoxGrid();
  const leg = 0x3a3d48;
  g.line(0, 14, 0, -5, 0, -3, leg).line(0, 14, 0, 5, 0, -3, leg).line(0, 14, 0, 0, 0, 5, leg);
  g.box(-1, 14, -1, 0, 15, 0, C.metalD);
  g.box(-3, 16, -3, 2, 20, 4, 0x1a1a22);
  g.box(-2, 17, 5, 1, 19, 7, 0x2e3240);
  g.box(-1, 18, 8, 0, 18, 8, 0x6fd8ff, true);
  g.box(3, 17, 0, 3, 19, 3, 0x29b6f6, true);
  g.set(-2, 21, -2, 0xff2a2a, true);
  g.box(-2, 21, 0, 1, 21, 2, 0x2e3240);
  return g;
};

/** Spotlight truss tower (0.12 scale), lamps face +z. */
const towerGrid = () => {
  const g = new VoxGrid();
  const H = 56, post = 0xa8b0bc, brace = 0x7a8294;
  for (const [x, z] of [[-4, -4], [3, -4], [-4, 3], [3, 3]]) g.box(x, 0, z, x, H, z, post);
  for (let y = 0; y < H; y += 8) {
    g.line(-4, y, 3, 3, y + 8, 3, brace).line(3, y, 3, -4, y + 8, 3, brace);
    g.line(-4, y, -4, -4, y + 8, 3, brace).line(3, y, -4, 3, y + 8, 3, brace);
    g.box(-4, y, -4, 3, y, -4, brace).box(-4, y, 3, 3, y, 3, brace);
  }
  g.box(-6, H, -6, 5, H + 1, 5, C.metalD);
  for (const x of [-6, 5]) g.box(x, H + 2, -6, x, H + 4, 5, post);
  g.box(-6, H + 4, -6, 5, H + 4, -6, post);
  g.box(-9, H + 2, 0, 8, H + 3, 1, C.black);
  for (const x of [-8, -2, 4]) {
    g.box(x, H + 4, -1, x + 3, H + 8, 2, 0x2b2a36);
    g.box(x, H + 4, 3, x + 3, H + 8, 3, 0xe8dcb0, true);
  }
  g.box(-1, H + 9, 0, 0, H + 11, 0, C.metalD);
  g.set(-1, H + 12, 0, C.red, true);
  return g;
};

/** Aluminium bleacher section (0.25 scale), front edge at z=0, rows rising to -z. */
const BL_ROWS = 6;
const bleacherGrid = (L, fans = false) => () => {
  const g = new VoxGrid();
  const alu = 0xd4dae2, foot = 0xb4bcc8, frame = 0x6b7386, skirt = [C.red, C.white, C.blue, C.white];
  for (let r = 0; r < BL_ROWS; r++) {
    const y = 1 + r * 2, z = -r * 3;
    g.box(0, y, z - 2, L - 1, y, z - 1, alu);
    g.box(0, y - 1, z, L - 1, y - 1, z, foot);
    for (let x = 0; x < L; x += 7) g.box(x, 0, z - 2, x, y - 1, z - 2, frame);
  }
  for (const x of [0, L - 1]) {
    g.line(x, 0, 1, x, BL_ROWS * 2, -BL_ROWS * 3 + 1, frame, 0);
    g.box(x, BL_ROWS * 2 + 1, -BL_ROWS * 3 + 1, x, BL_ROWS * 2 + 4, -BL_ROWS * 3 + 1, frame);
  }
  const zb = -BL_ROWS * 3 + 1;
  for (let x = 0; x < L; x += 7) g.box(x, BL_ROWS * 2, zb, x, BL_ROWS * 2 + 4, zb, frame);
  g.box(0, BL_ROWS * 2 + 4, zb, L - 1, BL_ROWS * 2 + 4, zb, alu);
  // bunting skirt along the front
  for (let x = 0; x < L; x++) g.set(x, 0, 1, skirt[Math.floor(x / 2) % 4]);
  if (fans) {
    // chunky voxel fans for the diorama (the battle view uses the pixel crowd)
    for (let r = 0; r < BL_ROWS; r++) for (let x = 1; x < L - 2; x += 3) {
      if (hash3(x, r, 5) < 0.2) continue;
      const y = 2 + r * 2, z = -r * 3 - 2;
      const shirt = SHIRT[Math.floor(hash3(x, r, 1) * SHIRT.length)], skin = SKIN[Math.floor(hash3(x, r, 2) * SKIN.length)];
      g.box(x, y, z, x + 1, y + 1, z + 1, shirt);
      g.box(x, y + 2, z, x + 1, y + 3, z + 1, skin);
      g.box(x, y + 3, z, x + 1, y + 3, z, HAIR[Math.floor(hash3(x, r, 3) * HAIR.length)]);
      if (hash3(x, r, 4) < 0.5) { g.box(x - 1, y + 1, z + 1, x - 1, y + 3, z + 1, shirt); g.box(x + 2, y + 1, z + 1, x + 2, y + 3, z + 1, shirt); }
    }
  }
  return g;
};

// --------------------------------------------------------------------------- pixel crowd (bleachers)

const SKIN = [0xffd8b8, 0xf2c09a, 0xd8a070, 0xb07a50, 0x8a5a3a, 0x6a4028];
const HAIR = [0x2a1a10, 0x5a3a20, 0xc89040, 0x1a1a1a, 0xe8c070, 0x8a3a20, 0xff8ac0, 0x29b6f6];
const SHIRT = [0x29b6f6, 0xff2e88, 0xffd23f, 0xe8343c, 0xffffff, 0x5fdc4a, 0x8a4ad0, 0xff8a2a, 0x1d9bf0, 0x2a2a36, 0x29b6f6, 0xff2e88];
function crowdPeople(seed, w) {
  const R = mulberry32(seed);
  const pick = (a) => a[Math.floor(R() * a.length)];
  const out = [];
  let x = 1;
  while (x < w - 6) {
    out.push({ x, skin: pick(SKIN), hair: pick(HAIR), shirt: pick(SHIRT), phase: R() < 0.5 ? 0 : 1, eager: R() < 0.8, cap: R() < 0.25 ? pick([C.red, 0x1d9bf0, 0x2a2a36, 0xffffff]) : 0, sign: R() < 0.07, finger: R() < 0.06, dy: R() < 0.3 ? 1 : 0 });
    x += 5 + (R() < 0.25 ? 1 : 0) + (R() < 0.05 ? 4 : 0);
  }
  return out;
}
function paintCrowd(ctx, w, h, people, frame) {
  for (const p of people) {
    const up = p.eager && (p.phase + frame) % 2 === 0;
    const top = 6 + p.dy - (up ? 1 : 0);
    const x = p.x;
    // torso
    px(ctx, x, top + 4, 5, h - top - 4, p.shirt);
    px(ctx, x, top + 4, 5, 1, shade(p.shirt, 0.18));
    px(ctx, x + 4, top + 5, 1, h - top - 5, shade(p.shirt, -0.2));
    // head
    px(ctx, x + 1, top, 3, 4, p.skin);
    px(ctx, x + 1, top, 3, 1, p.hair);
    px(ctx, x + 3, top + 1, 1, 1, p.hair);
    px(ctx, x + 1, top + 2, 1, 1, 0x2a1a10);
    px(ctx, x + 3, top + 2, 1, 1, 0x2a1a10);
    if (p.cap) { px(ctx, x + 1, top - 1, 3, 1, p.cap); px(ctx, x, top, 2, 1, p.cap); }
    if (up) {
      px(ctx, x - 1, top - 1, 1, 6, p.shirt);
      px(ctx, x + 5, top - 1, 1, 6, p.shirt);
      px(ctx, x - 1, top - 2, 1, 1, p.skin);
      px(ctx, x + 5, top - 2, 1, 1, p.skin);
      if (p.sign) {
        px(ctx, x - 2, top - 6, 9, 4, 0xffffff);
        px(ctx, x - 1, top - 5, 3, 1, C.red);
        px(ctx, x + 3, top - 4, 3, 1, 0x1d9bf0);
      }
      if (p.finger) { px(ctx, x + 5, top - 5, 2, 3, 0x1d9bf0); px(ctx, x + 6, top - 7, 1, 2, 0x1d9bf0); }
    } else {
      px(ctx, x - 1, top + 5, 1, 3, p.shirt);
      px(ctx, x + 5, top + 5, 1, 3, p.shirt);
      if (p.sign) px(ctx, x - 1, top + 5, 7, 3, 0xffffff);
    }
  }
}

function addCrowd(K, cx, z0, L, seed) {
  // one plane per bleacher row, two animation frames, rows bob out of phase
  const TW = 256, TH = 16, people = crowdPeople(seed, TW);
  const tex = [0, 1].map((f) => canvasTex(`circle_crowd_${seed}_${f}`, TW, TH, (ctx, w, h) => paintCrowd(ctx, w, h, people, f), { repeatX: true }));
  const wUnits = L * 0.25 - 0.5, hUnits = TH / 9;
  const rows = [];
  for (let r = 0; r < BL_ROWS; r++) {
    const maps = tex.map((t) => {
      const c = t.clone();
      c.repeat.set((wUnits * 9) / TW, 1);
      c.offset.set(((seed * 0.37 + r * 0.29) % 1), 0);
      c.needsUpdate = true;
      return c;
    });
    const mat = new THREE.MeshLambertMaterial({ map: maps[0], alphaTest: 0.5 });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(wUnits, hUnits), mat);
    const seatTop = (2 + r * 2) * 0.25;
    m.position.set(cx, seatTop + hUnits / 2 - 0.42, z0 + (-r * 3 - 1.2) * 0.25);
    m.userData = { maps, base: m.position.y, ph: r * 0.7 + seed };
    m.name = 'crowd';
    K.add(m);
    rows.push(m);
  }
  K.onUpdate((dt, t) => {
    for (const m of rows) {
      const k = t * 2.6 + m.userData.ph;
      m.material.map = m.userData.maps[Math.floor(k) & 1];
      m.position.y = m.userData.base + Math.abs(Math.sin(k * Math.PI)) * 0.05;
    }
  });
}

// --------------------------------------------------------------------------- parallax painters

function paintHouses(ctx, w, h, ground, o = {}) {
  const R = mulberry32(o.seed ?? 4);
  const walls = [0xf4e6d0, 0xd8e8f4, 0xf4d8c8, 0xe8f0d8, 0xfff4e0, 0xd8d4e8];
  const roofs = [0x9a4a3a, 0x5a6a8a, 0x7a5a4a, 0x4a6a5a, 0xb86a4a, 0x6a6a7a];
  let x = -6;
  while (x < w) {
    const hw = 16 + Math.floor(R() * 12), wh = 7 + Math.floor(R() * 4), rh = Math.floor(hw * 0.38);
    const wall = walls[Math.floor(R() * walls.length)], roof = roofs[Math.floor(R() * roofs.length)];
    const base = ground - Math.floor(R() * 2);
    const top = base - wh;
    px(ctx, x, top, hw, wh, wall);
    px(ctx, x + hw - 3, top, 3, wh, shade(wall, -0.12));
    // windows (warm, some lit) + door
    for (let wx = x + 3; wx < x + hw - 4; wx += 5) {
      px(ctx, wx, top + 2, 3, 3, R() < 0.45 ? 0xffe0a0 : 0x6a8aa8);
      px(ctx, wx, top + 2, 3, 1, shade(wall, -0.25));
    }
    px(ctx, x + Math.floor(hw / 2) - 1, base - 4, 3, 4, shade(roof, -0.1));
    // gable roof, lit from the left
    for (let i = 0; i <= rh; i++) {
      const rw = hw + 2 - i * 2;
      if (rw <= 0) break;
      px(ctx, x - 1 + i, top - i, Math.ceil(rw / 2), 1, shade(roof, 0.18));
      px(ctx, x - 1 + i + Math.ceil(rw / 2), top - i, Math.floor(rw / 2), 1, roof);
      if (i % 2 === 0) px(ctx, x - 1 + i, top - i, rw, 1, shade(roof, -0.08), 0.35);
    }
    px(ctx, x - 1, top, hw + 2, 1, shade(roof, -0.3));
    if (R() < 0.6) { const cx = x + Math.floor(hw * 0.7); px(ctx, cx, top - rh + 1, 2, 4, 0x8a5a4a); px(ctx, cx, top - rh + 1, 2, 1, 0x5a3a2a); }
    x += hw + 2 + Math.floor(R() * 8);
    // a tree in the gap
    if (R() < 0.7) {
      const tx = x - 3, s = 4 + Math.floor(R() * 3);
      px(ctx, tx, ground - s, 1, s, 0x5a3a20);
      disc(ctx, tx, ground - s - 3, s, 0x4a8a3a);
      disc(ctx, tx - 1, ground - s - 4, Math.max(1, s - 2), 0x6aaa48);
    }
  }
}

function paintWaterTower(ctx, cx, ground, s = 1) {
  const S = (v) => Math.round(v * s);
  const legH = S(26), tw = S(30), th = S(15);
  const top = ground - legH;
  const leg = 0x8a96a8, legD = 0x6a7486;
  for (const dx of [-11, -4, 4, 11]) px(ctx, cx + S(dx), top, 1, legH, Math.abs(dx) > 5 ? leg : legD);
  const L = S(11), step = S(7);
  for (let y = top + 3; y < ground - 2; y += step) {
    for (let k = 0; k < step; k++) { px(ctx, cx - L + Math.round((k * 2 * L) / step), y + k, 1, 1, legD); px(ctx, cx + L - Math.round((k * 2 * L) / step), y + k, 1, 1, legD); }
    px(ctx, cx - L, y, 2 * L + 1, 1, leg);
  }
  // balcony
  px(ctx, cx - tw / 2 - 2, top - 1, tw + 4, 2, 0x5a6476);
  for (let x = cx - tw / 2 - 2; x <= cx + tw / 2 + 1; x += 2) px(ctx, x, top - 3, 1, 2, 0x5a6476);
  // tank (rounded) with lit left side
  for (let y = 0; y < th; y++) {
    const k = y / th;
    const hw = Math.round(tw / 2 - (k > 0.7 ? (k - 0.7) * tw * 0.5 : 0));
    const yy = top - 2 - y;
    px(ctx, cx - hw, yy, hw * 2, 1, 0xdfeaf2);
    px(ctx, cx - hw, yy, 2, 1, 0xffffff);
    px(ctx, cx + hw - 4, yy, 4, 1, 0xb8c8d6);
  }
  // cone cap + finial
  const capH = S(7);
  for (let i = 0; i < capH; i++) {
    const cw = Math.round((tw - 6) * (1 - i / capH));
    px(ctx, cx - Math.round(cw / 2), top - 2 - th - i, cw, 1, i % 2 ? 0xc8d4e0 : 0xb0bccc);
  }
  px(ctx, cx, top - 2 - th - capH - 3, 1, 3, 0x6a7486);
  px(ctx, cx, top - 2 - th - capH - 4, 1, 1, C.red);
  // painted red circle logo
  const ly = top - 2 - Math.round(th * 0.45), rx = S(5), ry = S(4);
  for (let a = 0; a < 48; a++) {
    const t = (a / 48) * Math.PI * 2;
    px(ctx, Math.round(cx + Math.cos(t) * rx), Math.round(ly + Math.sin(t) * ry), 1, 1, C.red);
    px(ctx, Math.round(cx + Math.cos(t) * (rx - 1)), Math.round(ly + Math.sin(t) * (ry - 1)), 1, 1, C.red);
  }
}

function paintPoles(ctx, w, ground, o = {}) {
  const step = o.step ?? 46, ph = o.h ?? 18;
  let prev = null;
  for (let x = (o.x0 ?? 10); x < w + step; x += step) {
    px(ctx, x, ground - ph, 1, ph, 0x6a4a30);
    px(ctx, x - 3, ground - ph + 2, 7, 1, 0x6a4a30);
    if (prev !== null) for (let k = 0; k <= step; k++) {
      const sag = Math.round(Math.sin((k / step) * Math.PI) * 3);
      px(ctx, prev + k, ground - ph + 2 + sag, 1, 1, 0x3a3030);
    }
    prev = x;
  }
}

function paintRVs(ctx, w, ground, seed) {
  const R = mulberry32(seed);
  for (let x = 20 + R() * 40; x < w - 30; x += 70 + R() * 90) {
    const L = 22 + Math.floor(R() * 8), H = 9;
    const stripe = [0x29b6f6, C.red, 0xff8a2a, 0x5fdc4a][Math.floor(R() * 4)];
    px(ctx, x, ground - H - 2, L, H, 0xf4f2ec);
    px(ctx, x, ground - H - 2, L, 1, 0xffffff);
    px(ctx, x, ground - 6, L, 2, stripe);
    for (let k = 3; k < L - 6; k += 5) px(ctx, x + k, ground - H, 3, 2, 0x5a7a9a);
    px(ctx, x + L - 5, ground - H, 4, 4, 0x5a7a9a);
    px(ctx, x + L - 1, ground - 6, 2, 4, 0xe8e4dc);
    for (const wx of [x + 4, x + L - 7]) { disc(ctx, wx, ground - 2, 2, 0x22222a); px(ctx, wx, ground - 2, 1, 1, 0x9aa2b4); }
    // awning + camping chairs
    px(ctx, x + 4, ground - H - 1, 10, 1, stripe);
    px(ctx, x + 6, ground - 3, 2, 3, stripe);
    px(ctx, x + 10, ground - 3, 2, 3, 0xffd23f);
  }
}

// --------------------------------------------------------------------------- postcard props (far farm + suburb)

/** Suburban house: lap siding, porch, shuttered windows with sky reflections, shingled gable roof (0.13 scale). */
const houseGrid = (col, seed) => () => {
  const g = new VoxGrid();
  const roof = [0x5a4a6a, 0x8a3a3a, 0x3a5a7a, 0x4a5a4a][seed % 4], roofD = shade(roof, -0.2), trim = 0xffffff, sh = shade(col, -0.3);
  g.box(-17, 0, -12, 16, 1, 11, 0xb8b0a8);
  g.box(-16, 2, -11, 15, 20, 10, (x, y) => (y % 2 === 0 ? shade(col, -0.08) : col));
  for (const x of [-16, 15]) g.box(x, 2, 10, x, 20, 10, trim);
  for (const wx of [-12, 6]) for (const wy of [6]) {
    g.box(wx - 1, wy - 1, 11, wx + 5, wy + 7, 11, trim);
    g.box(wx, wy, 11, wx + 4, wy + 6, 11, (x, y) => (x === wx + 2 || y === wy + 3 ? trim : y > wy + 4 ? 0xd8f0ff : 0x7ab8e0));
    g.box(wx - 2, wy, 11, wx - 2, wy + 6, 11, sh).box(wx + 6, wy, 11, wx + 6, wy + 6, 11, sh);
    g.box(wx, wy - 2, 12, wx + 4, wy - 1, 12, 0x8a5a3a).box(wx, wy - 1, 12, wx + 4, wy - 1, 12, (x) => [0xff6fb8, 0xffd23f, 0xe8343c][x % 3]);
  }
  g.box(-3, 2, 11, 3, 15, 11, trim);
  g.box(-2, 2, 11, 2, 14, 11, shade(col, -0.45));
  g.set(1, 8, 12, 0xffc21a);
  g.box(-7, 0, 12, 6, 1, 16, 0xa89a8a);
  g.box(-7, 16, 11, 6, 16, 16, roof);
  for (const x of [-7, 6]) g.box(x, 2, 16, x, 15, 16, trim);
  for (let i = 0; i <= 13; i++) g.box(-18, 21 + i, -13 + i, 17, 21 + i, 12 - i, (x, y, z) => ((x + y * 2) % 5 === 0 ? roofD : roof));
  g.box(-18, 21, 12, 17, 21, 13, roofD);
  g.box(-11, 22, -7, -8, 36, -4, 0xb8553a).box(-12, 36, -8, -7, 37, -3, 0x8a3a28);
  g.box(-2, 25, 0, 1, 28, 0, 0x7ab8e0);
  return g;
};

/** Red gambrel barn with white trim, X doors and a hayloft (0.13 scale). */
const barnGrid = () => {
  const g = new VoxGrid();
  const red = 0xc0362c, redD = 0x962a22, white = 0xf4f0e8;
  g.box(-20, 0, -16, 19, 22, 15, (x, y) => (x % 3 === 0 ? redD : red));
  for (let y = 23; y < 40; y++) {
    const inset = y < 31 ? Math.floor((y - 22) * 0.9) : 7 + Math.floor((y - 30) * 1.8);
    if (inset > 19) break;
    g.box(-20 + inset, y, -16, 19 - inset, y, 15, (x) => (x % 3 === 0 ? redD : red));
    g.box(-21 + inset, y, -17, -20 + inset, y, 16, 0x4a4a52).box(19 - inset, y, -17, 20 - inset, y, 16, 0x4a4a52);
  }
  for (const x of [-20, 19]) g.box(x, 0, 16, x, 22, 16, white);
  g.box(-8, 0, 16, 7, 15, 16, white);
  g.box(-7, 0, 16, 6, 14, 16, red);
  g.line(-7, 0, 17, 6, 14, 17, white, 0).line(6, 0, 17, -7, 14, 17, white, 0);
  g.box(-4, 26, 16, 3, 31, 16, white).box(-3, 27, 16, 2, 30, 16, 0x5a3a28);
  return g;
};
const siloGrid = () => {
  const g = new VoxGrid();
  g.cylinder(-0.5, -0.5, 0, 44, 8, (x, y) => (y % 6 === 0 ? 0x9aa2ae : x < -3 ? 0xd8dde4 : 0xc4ccd6));
  for (let y = 45; y < 52; y++) g.cylinder(-0.5, -0.5, y, y, Math.sqrt(Math.max(0, 64 - (y - 44) ** 2 * 1.3)), 0x8a96a8);
  return g;
};
/** Farm windpump lattice tower; the fan spins separately (0.12 scale). */
const windpumpGrid = () => {
  const g = new VoxGrid();
  for (let y = 0; y < 58; y++) {
    const r = Math.round(7 - y * 0.1);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.set(sx * r, y, sz * r, 0x8a8e96);
    if (y % 9 === 0) { g.line(-r, y, -r, r, y, -r, 0x9aa0a8); g.line(-r, y, r, r, y, r, 0x9aa0a8); g.line(-r, y, -r, -r, y, r, 0x9aa0a8); g.line(r, y, -r, r, y, r, 0x9aa0a8); }
  }
  g.box(-2, 56, -2, 1, 60, 3, 0x6a6e78);
  g.box(-1, 58, -14, 0, 59, -3, 0x6a6e78).box(-1, 56, -20, 0, 62, -14, 0xe8343c);
  return g;
};
const windFanGrid = () => {
  const g = new VoxGrid();
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    for (let r = 3; r < 12; r++) g.set(Math.round(Math.cos(a) * r), Math.round(Math.sin(a) * r), 0, r > 9 ? 0xf0f0f0 : 0xb8bec8);
  }
  g.box(-1, -1, -1, 1, 1, 1, 0x4a4e58);
  return g;
};
/** Hot-air balloon with coloured gores and a wicker basket (scale ~0.1). */
const balloonGrid = (cols) => () => {
  const g = new VoxGrid();
  const R = 16;
  for (let x = -R; x <= R; x++) for (let y = -R; y <= R + 4; y++) for (let z = -R; z <= R; z++) {
    const yy = y < 0 ? y * 1.25 : y;
    const r = R * (y < 0 ? 1 + y / (R * 2.2) : 1);
    const d = Math.hypot(x, yy * 0.9, z);
    if (d > R || d < R - 2 || r <= 0) continue;
    const gore = Math.floor(((Math.atan2(z, x) / (Math.PI * 2)) + 1) * 12) % 3;
    let c = cols[gore];
    if (Math.abs(y - 4) < 1) c = 0xffd23f;
    if (y > R - 3) c = shade(cols[0], -0.15);
    g.set(x, y + 30, z, x < -6 && y > 2 ? shade(c, 0.15) : c);
  }
  for (const [x, z] of [[-4, -4], [3, -4], [-4, 3], [3, 3]]) g.line(x * 2, 12, z * 2, x, 4, z, 0x5a4a3a);
  g.box(-4, 0, -4, 3, 4, 3, (x, y) => ((x + y) % 2 ? 0xa07040 : 0x8a5a30));
  g.box(-1, 5, -1, 0, 6, 0, 0xff8a2a, true);
  return g;
};
/** BEAST BURGERS food truck with an awning and menu board (0.1 scale). */
const foodTruckGrid = () => {
  const g = new VoxGrid();
  g.box(-22, 3, -9, 21, 26, 8, (x, y) => (y < 6 ? 0xd8dde4 : y > 23 ? 0xf4f4f8 : 0x29b6f6));
  g.box(22, 3, -9, 30, 18, 8, 0x29b6f6).box(23, 12, -9, 29, 17, 8, 0x8ad0f0);
  g.box(-14, 10, 9, 10, 20, 9, 0x2a2a36);
  g.box(-13, 11, 9, 9, 19, 9, 0x5a4030);
  g.box(-16, 21, 9, 12, 21, 13, (x) => (Math.floor(x / 3) & 1 ? 0xffffff : 0xe8343c));
  g.box(-15, 8, 10, 11, 9, 11, 0xd8dde4);
  g.box(-20, 27, -3, 21, 32, 0, 0xffd23f);
  text(g, 'BEAST BURGERS', 0, 27, 1, '+z', 0xe8343c, { center: true });
  for (const x of [-15, 20]) for (const z of [-10, 8]) g.box(x - 3, 0, z, x + 3, 5, z + 1, 0x22222c);
  g.box(-8, 27, -8, -5, 31, -5, 0x9aa2ae);
  return g;
};

// --------------------------------------------------------------------------- battle

export function buildBattle(K) {
  // ---- sky: golden afternoon, low warm sun on the left
  const sky = skyTexture('circle2', [[0, 0x3a72c8], [0.28, 0x6aa6e4], [0.5, 0xa8d0f0], [0.66, 0xffe0b0], [0.82, 0xffc88a], [1, 0xffb070]], (ctx, w, h) => {
    const P = pixbuf(ctx, w, h);
    skyGlow(P, w * 0.4, h * 0.36, w * 0.55, h * 0.5, 0xffe8b8, 0.65, { bands: 6, pow: 1.3 });
    paintSunPx(P, Math.round(w * 0.4), Math.round(h * 0.3), 10, { color: 0xfff2c0, core: 0xffffff, halo: 0xffe2a0, halo2: 0xfff4d8, haloR: 6, haloA: 0.6 });
    paintStreaks(P, w, { n: 10, y0: h * 0.06, y1: h * 0.3, len: [20, 60], color: 0xfff4e8, shade: 0xf0c8a8, seed: 21, alpha: 0.7 });
    const warm = { light: 0xfffaf0, color: 0xfff0dc, shade: 0xf4c4a0, dark: 0xd8a088 };
    paintCumulus(P, w * 0.12, h * 0.22, 16, 11, { ...warm, sunX: 1 });
    paintCumulus(P, w * 0.62, h * 0.14, 10, 12, { ...warm, sunX: -1 });
    paintCumulus(P, w * 0.86, h * 0.3, 14, 13, { ...warm, sunX: -1 });
    paintCumulus(P, w * 0.28, h * 0.44, 7, 14, { ...warm, sunX: 1 });
    paintCloudBank(P, w, Math.round(h * 0.6), { s: 8, seed: 15, light: 0xfff6ea, color: 0xffe8d0, shade: 0xf6c8a4, dark: 0xe8b090, alpha: 0.85 });
    paintBirdsPx(P, [[w * 0.5, h * 0.24, 1], [w * 0.53, h * 0.21, 1], [w * 0.56, h * 0.25, 0], [w * 0.47, h * 0.2, 0]], 0x5a4a50, 0.7);
    P.flush();
  }, { w: 320, h: 180, bands: 14 });
  fitSkyAuto(K, sky);

  // ---- far layers: hazy pixel hills, voxel farmland hills with a farm, a suburb street, drifting clouds + balloons
  K.parallax('farHills', {
    z: -170, y: -4, w: parallaxWidth(-170), h: 32, tw: 520, th: 72,
    paint: (ctx, w, h) => {
      const P = pixbuf(ctx, w, h);
      paintRange(P, w, h, { base: 0.62, amp: 12, freq: 0.014, seed: 3, round: true, lit: 0xa8c0b8, mid: 0x98b2ac, dark: 0x88a2a2, rim: 0xffe8c0, gullies: false, haze: [0xf8dcb8, 0.55, 0.8] });
      const tops = paintRange(P, w, h, { base: 0.78, amp: 7, freq: 0.022, seed: 8, round: true, lit: 0x9cb878, mid: 0x8aa86c, dark: 0x7a9862, rim: 0xffe8a8, gullies: false, haze: [0xf4dcb0, 0.8, 0.6] });
      const R = mulberry32(5);
      for (let i = 0; i < 90; i++) {
        const x = Math.floor(R() * w), fw = 6 + Math.floor(R() * 14), y = Math.round(tops[x] + 3 + R() * 8);
        P.rect(x, y, fw, 2, [0xd8c070, 0xa8c070, 0x9ab868, 0xe0cc80, 0xb89060][Math.floor(R() * 5)], 0.75);
      }
      for (let i = 0; i < 60; i++) { const x = Math.floor(R() * w), y = Math.round(tops[x] + 1 + R() * 4); P.disc(x, y, 1, 0x6a9a58); }
      P.flush();
    },
  });
  // rolling farmland hills rising behind the town (heights shared with the farm buildings on top)
  const FH = { z: -74, s: 1.2, D: 12 };
  const farmH = (xv, zv) => {
    const back = zv / (FH.D - 1);
    const n = vnoise(xv * 0.045 + 3, 6, 0.5) * 0.7 + vnoise(xv * 0.12, 7, zv * 0.2) * 0.3;
    return Math.max(1, Math.round(1 + (2 + n * 7) * (0.35 + 0.65 * back)));
  };
  const onHill = (x, zv) => farmH(Math.floor(x / FH.s), zv) * FH.s - 0.6;
  voxRange(K, 'farmHills', {
    x0: -150, x1: 150, z: FH.z, depth: FH.D, scale: FH.s, y: -0.6, h: farmH,
    col: (xv, y, zv, h) => {
      const j = hash3(xv, y, zv);
      if (y === h - 1) {
        const f = Math.floor((xv + vnoise(zv * 0.3, 2, 1) * 6) / 7) * 7 + Math.floor(zv / 4) * 13;
        const c = [0xd8c068, 0x9ac458, 0x6aa848, 0xb08a58, 0xc8d070][Math.floor(hash3(f, 3, 9) * 5)];
        return (xv + zv) % 3 === 0 ? shade(c, -0.07) : j < 0.08 ? 0x5a8a3a : c;
      }
      return y === h - 2 ? 0x6a9a48 : j < 0.3 ? 0x8a6a4a : 0x7a5a3a;
    },
  });
  {
    const zv = 8, z = FH.z - zv * FH.s;
    K.mesh('barn', barnGrid, { scale: 0.13 }, -34, onHill(-34, zv), z, 0.25, 1);
    K.mesh('silo', siloGrid, { scale: 0.13 }, -28.6, onHill(-28.6, zv), z - 1.6, 0, 1);
    K.inst('hay', () => {
      const g = new VoxGrid();
      g.cylinder(-0.5, -0.5, 0, 6, 4, (x, y, z) => ((x + y + z) % 3 === 0 ? 0xc8a050 : 0xe0c070), 'z');
      return g;
    }, { scale: 0.13 }, [[-39, onHill(-39, 6), FH.z - 6 * FH.s, 0.3], [-37.4, onHill(-37.4, 6), FH.z - 6 * FH.s + 0.6, 0.9], [-24, onHill(-24, 6), FH.z - 6 * FH.s, 0.1]]);
    const pines = [];
    for (let i = 0; i < 40; i++) { const x = K.rand(-140, 140), zz = Math.floor(K.rand(3, FH.D)); if (Math.abs(x + 31) < 8 || Math.abs(x - 38) < 4) continue; pines.push([x, onHill(x, zz), FH.z - zz * FH.s, K.rand(0, 6), K.rand(0.2, 0.3)]); }
    K.inst('hillPine', () => pineTreeGrid({ leaf: 0x3f8a46, seed: 6, r: 4, layers: 4 }), { scale: 1 }, pines);
  }
  {
    const wx = 38, wz = FH.z - 7 * FH.s, wy = onHill(38, 7);
    K.mesh('windpump', windpumpGrid, { scale: 0.12 }, wx, wy, wz, -0.3, 1);
    const fan = K.mesh('windpumpFan', windFanGrid, { scale: 0.12, pivot: 'center' }, wx + 0.05, wy + 7.0, wz + 0.55, -0.3, 1);
    fan.rotation.order = 'YXZ';
    K.onUpdate((dt) => { fan.rotation.z -= dt * 2.2; });
  }
  {
    // a suburban street behind the bleachers: houses, picket fences, mailboxes, street trees
    const cols = [0x8fd0ff, 0xffd8a8, 0xc8f0c0, 0xffffff, 0xf8c8d8, 0xfff0a8];
    const xs = [-58, -46, -34, -22, 22, 34, 46, 58, -70, 70];
    xs.forEach((x, i) => K.mesh('house' + (i % 6), houseGrid(cols[i % 6], i), { scale: 0.13 }, x, 0, -47 - (i % 2) * 1.5, (i % 2 ? 0.1 : -0.08), 1));
    K.inst('picket', () => {
      const g = new VoxGrid();
      for (let x = 0; x < 60; x++) { if (x % 3 === 0) g.box(x, 0, 0, x, 6, 0, 0xffffff).set(x, 7, 0, 0xf0f0f0); }
      g.box(0, 2, -1, 59, 2, -1, 0xe8e8e8).box(0, 5, -1, 59, 5, -1, 0xe8e8e8);
      return g;
    }, { scale: 0.1, pivot: [30, 0, 0] }, xs.map((x) => [x, 0, -43.6]));
    const st = [];
    for (let x = -76; x <= 76; x += 6) if (Math.abs(x) > 14) st.push([x + K.rand(-1.2, 1.2), 0, -41.5 + K.rand(-0.6, 0.6), K.rand(0, 6), K.rand(0.12, 0.15)]);
    swayInst(K, 'streetTree', () => leafyTreeGrid({ seed: 11, leaf: 0x5aae40, h: 9, r: 6 }), { scale: 1 }, st, { amp: 0.025, speed: 0.9 });
  }
  addClouds(K, { id: 'circleCloud', n: 7, kinds: 3, x0: -130, x1: 130, y0: 11, y1: 16, z0: -95, z1: -130, s0: 0.9, s1: 1.3, scale: 0.8, speed: 0.5, seed: 9, len: 20, height: 8, color: 0xfff2e2, shade: 0xf4c8a8, dark: 0xe0b098, light: 0xfffaf2 });
  {
    // hot-air balloons drifting over the farmland
    const balloons = [
      K.mesh('balloonA', balloonGrid([0xe8343c, 0xffffff, 0x29b6f6]), { scale: 0.11 }, 0, 0, 0),
      K.mesh('balloonB', balloonGrid([0xffd23f, 0xff8a2a, 0xe8343c]), { scale: 0.09 }, 0, 0, 0),
      K.mesh('balloonC', balloonGrid([0x5fdc4a, 0xffffff, 0xff2e88]), { scale: 0.08 }, 0, 0, 0),
    ];
    const path = [[-30, 10.4, -58, 0.45, 0], [20, 12.6, -66, 0.3, 40], [52, 9.2, -62, 0.38, 80]];
    K.onUpdate((dt, t) => {
      balloons.forEach((b, i) => {
        const [x0, y0, z0, v, off] = path[i];
        b.position.set(((x0 + t * v + off + 90) % 180) - 90, y0 + Math.sin(t * 0.35 + i * 2) * 0.6, z0);
        b.rotation.y = Math.sin(t * 0.1 + i) * 0.4;
      });
    });
  }

  // ---- ground: fine near the lane (holds the circle + camp), coarse far away
  const grassCol = (x, z) => {
    const n = vnoise(x * 0.11, 5, z * 0.11), m = hash3(Math.floor(x * 2), 11, Math.floor(z * 2));
    if (m < 0.011) return [0xffe14a, 0xffffff, 0xff8ac0][Math.floor(m * 300) % 3];
    let c = n > 0.66 ? C.grassL : n < 0.3 ? C.grassD : m < 0.2 ? shade(C.grass, -0.06) : C.grass;
    const inside = x * x + z * z < (RING - 1) ** 2;
    if (inside && vnoise(x * 0.3, 9, z * 0.3) > 0.62) c = mixHex(c, C.trampled, 0.5);
    return c;
  };
  K.ground({ id: 'groundNear', x0: -60, x1: 60, z0: -20, z1: 20, scale: 0.5, color: (x, z) => grassCol(x, z) });
  K.ground({ id: 'groundFar', x0: -110, x1: 110, z0: -70, z1: -20, scale: 1, color: (x, z) => (Math.abs(z + 45.4) < 1.1 ? (hash3(Math.floor(x), 1, 2) < 0.5 ? 0x6a6e78 : 0x5e626c) : Math.abs(z + 43.8) < 0.5 ? 0xd8d0c0 : grassCol(x, z)) });
  K.ground({ id: 'groundHorizon', x0: -170, x1: 170, z0: -130, z1: -70, scale: 2, color: (x, z) => (vnoise(x * 0.05, 4, z * 0.05) > 0.5 ? 0x7aae50 : 0x6aa048) });
  K.ground({ id: 'groundFront', x0: -60, x1: 60, z0: 20, z1: 44, scale: 1, color: (x, z) => grassCol(x, z) });

  // the giant painted circle (fine voxels, a hair above the grass)
  K.mesh('ring', () => {
    const g = new VoxGrid();
    const s = 0.25, Rv = Math.ceil((RING + 1.2) / s);
    for (let ix = -Rv; ix <= Rv; ix++) for (let iz = -Rv; iz <= Rv; iz++) {
      const x = (ix + 0.5) * s, z = (iz + 0.5) * s;
      if (Math.abs(z) < 2.5) continue;
      const wob = (vnoise(x * 0.4, 2, z * 0.4) - 0.5) * 0.12;
      const rr = Math.abs(Math.hypot(x, z) - RING) + wob;
      if (rr < 0.55) g.set(ix, -1, iz, hash3(ix, 7, iz) < 0.07 ? C.redD : C.red);
      else if (rr < 0.8) g.set(ix, -1, iz, hash3(ix, 5, iz) < 0.12 ? 0xe4ded0 : C.white);
    }
    return g;
  }, { scale: 0.25, pivot: [0, 0, 0], jitter: 0.03 }, 0, -0.004, 0);

  // ---- the lane: freshly mown stripes, chalk edges, the circle crossing it
  K.lane({
    x0: -24, x1: 24, scale: 0.25, depth: 2, side: 0x6a4a30,
    color: (ix, iz) => {
      const x = (ix + 0.5) * 0.25, z = (iz + 0.5) * 0.25, az = Math.abs(z);
      const rr = Math.abs(Math.hypot(x, z) - RING);
      if (rr < 0.55) return hash3(ix, 3, iz) < 0.07 ? C.redD : C.red;
      if (rr < 0.8) return C.white;
      if (az > 2.25) return 0x6f9e48;
      if (az > 2.0) return hash3(ix, 1, iz) < 0.1 ? 0xe0dccc : C.chalk;
      if (Math.abs(x) < 0.25 && (iz & 2)) return C.chalk;
      const h = hash3(ix, 9, iz);
      if (h < 0.012) return 0xb89a6a;
      const base = (Math.floor((x + 100) / 2) & 1) ? C.lane1 : C.lane2;
      return h < 0.08 ? shade(base, -0.07) : h > 0.96 ? shade(base, 0.06) : base;
    },
  });
  // centre marker: a gold "$" coin painted on the lane
  K.mesh('centerCoin', () => {
    const g = new VoxGrid();
    for (let x = -4; x <= 3; x++) for (let z = -4; z <= 3; z++) {
      const d = Math.hypot(x + 0.5, z + 0.5);
      if (d <= 3.9) g.set(x, 0, z, d > 3 ? C.goldD : C.gold);
    }
    const S = ['.#.', '###', '#..', '###', '..#', '###', '.#.'];
    S.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === '#') g.set(c - 2, 1, r - 4, C.goldL); }));
    return g;
  }, { scale: 0.18, pivot: [0, 0, 0] }, 0.09, -0.17, 1.35);

  // ---- breakables right behind the lane: coolers, camp chairs, snack piles
  const brk = [[-16.6, 'cooler', 0], [-9.4, 'chair', 1], [-3.4, 'products', 0], [3.6, 'cooler', 1], [9.6, 'products', 1], [16.4, 'chair', 0]];
  for (const [x, kind, v] of brk) {
    if (kind === 'cooler') K.breakable('cooler', 'cooler' + v, coolerGrid(v ? 0x1d9bf0 : C.red), { scale: 0.1 }, x, -3.3, K.rand(-0.4, 0.4));
    else if (kind === 'chair') K.breakable('chair', 'chair' + v, chairGrid(v ? 0x29b6f6 : 0x5fdc4a), { scale: 0.1 }, x, -3.2, K.rand(-0.5, 0.5));
    else K.breakable('products', 'snacks' + v, snackGrid(v * 2 + 1), { scale: 0.1 }, x, -3.3, K.rand(-0.3, 0.3));
  }

  // ---- the camp inside the circle
  const tents = [[-8.6, -7.2, 0.35, 0], [-4.6, -9.8, -0.25, 1], [-11.2, -11.6, 0.15, 3], [5.0, -7.6, -0.3, 2], [9.4, -10.4, 0.2, 4], [12.4, -13.4, -0.1, 5]];
  tents.forEach(([x, z, ry, ci], i) => (i % 3 === 1 ? K.mesh('aframe' + ci, aframeGrid(GEAR[ci]), { scale: 0.1, ao: true }, x, 0, z, ry, 1, { shadow: true, receive: false }) : K.mesh('tent' + ci, tentGrid(GEAR[ci]), { scale: 0.1, ao: true }, x, 0, z, ry, 1, { shadow: true, receive: false })));
  const bags = [[-6.6, -5.3, 0.2, 6], [7.4, -5.2, -0.4, 1], [-2.2, -6.6, 1.3, 3], [2.6, -6.0, -1.1, 0], [-11.4, -6.4, 0.6, 2]];
  for (const [x, z, ry, ci] of bags) K.mesh('bag' + ci, bagGrid(GEAR[ci]), { scale: 0.1, ao: true }, x, 0, z, ry);
  K.inst('campChair', chairGrid(0xff8a2a), { scale: 0.1, ao: true }, [[-6.8, 0, -8.6, 0.6], [3.0, 0, -9.0, -0.5], [7.4, 0, -8.4, -0.9]], { shadow: true, receive: false });
  K.inst('campCooler', coolerGrid(0x5fdc4a), { scale: 0.1, ao: true }, [[-3.0, 0, -11.0, 0.3], [11.2, 0, -8.2, -0.2]], { shadow: true, receive: false });
  K.inst('campSnacks', snackGrid(4), { scale: 0.1, ao: true }, [[-1.6, 0, -8.2, 0.4], [6.6, 0, -11.6, -0.6]], { shadow: true, receive: false });
  K.inst('tripod', tripodGrid, { scale: 0.08, ao: true }, [[-13.2, 0, -5.4, Math.PI / 2 - 0.2], [13.6, 0, -6.2, -Math.PI / 2 + 0.25], [-3.6, 0, -15.4, 0.15]], { shadow: true, receive: false });

  // ---- the prize podium: cash mountain + $500,000 sign with chasing bulbs
  K.mesh('podium', podiumGrid, { scale: 0.1 }, 0, 0, -12.6, 0, 1, { shadow: true });
  K.mesh('prizeSign', prizeSignGrid, { scale: 0.1 }, 0, 0, -14.6, 0, 1, { shadow: true });
  {
    const bulbGeo = new THREE.BoxGeometry(0.11, 0.11, 0.06);
    const sets = [[], []];
    let k = 0;
    for (let x = -35; x < 37; x += 3, k++) for (const y of [31, 29 + 22]) sets[k & 1].push([x * 0.1 + 0.05, y * 0.1 + 0.05, -14.6 + 0.25]);
    const meshes = sets.map((pts, i) => {
      const im = new THREE.InstancedMesh(bulbGeo, new THREE.MeshBasicMaterial({ color: i ? 0xfff2a0 : 0xffd23f, toneMapped: false }), pts.length);
      const m4 = new THREE.Matrix4();
      pts.forEach((p, j) => im.setMatrixAt(j, m4.makeTranslation(p[0], p[1], p[2])));
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      return K.add(im);
    });
    K.onUpdate((dt, t) => { const on = Math.floor(t * 4) & 1; meshes[0].visible = !!on; meshes[1].visible = !on; });
  }
  // bills fluttering around the cash mountain
  {
    const billTex = canvasTex('circle_bill', 8, 4, (ctx) => { px(ctx, 0, 0, 8, 4, 0x3f8f45); px(ctx, 1, 1, 6, 2, 0x8fe08a); px(ctx, 3, 1, 2, 2, 0x2a6a30); });
    const billMat = new THREE.MeshLambertMaterial({ map: billTex, side: THREE.DoubleSide });
    const billGeo = new THREE.PlaneGeometry(0.34, 0.17);
    const bills = [];
    for (let i = 0; i < 16; i++) {
      const b = new THREE.Mesh(billGeo, billMat);
      b.userData = { x: K.rand(-3.6, 3.6), z: K.rand(-14, -10.8), o: K.rand(0, 10), sp: K.rand(0.25, 0.45), r: K.rand(1, 3) };
      K.add(b);
      bills.push(b);
    }
    K.onUpdate((dt, t) => {
      for (const b of bills) {
        const u = b.userData, k = ((t * u.sp * 0.25 + u.o) % 1);
        b.position.set(u.x + Math.sin(t * 1.3 + u.o) * 0.6, 5.2 - k * 5.1, u.z + Math.cos(t * 0.9 + u.o) * 0.3);
        b.rotation.set(Math.sin(t * u.r + u.o) * 1.2, t * u.r * 0.6 + u.o, Math.cos(t * u.r * 1.3) * 0.8);
      }
    });
  }

  // ---- film crew: camera crane (swinging jib), drone, spotlight towers, video village
  {
    const bx = 10.4, bz = -8.6;
    K.mesh('craneBase', craneBaseGrid, { scale: 0.1, ao: true }, bx, 0, bz, 0, 1, { shadow: true });
    const pivot = new THREE.Group();
    pivot.position.set(bx, 2.85, bz);
    K.add(pivot);
    const arm = K.mesh('craneArm', craneArmGrid, { scale: 0.1, pivot: [0, 0, 0], ao: true }, 0, 0, 0, 0, 1, { parent: pivot, shadow: true });
    K.onUpdate((dt, t) => {
      pivot.rotation.y = Math.PI + Math.sin(t * 0.32) * 0.55 - 0.15;
      arm.rotation.z = Math.sin(t * 0.47 + 1) * 0.16 - 0.04;
    });
  }
  {
    const drone = new THREE.Group();
    K.mesh('droneBody', () => {
      const g = new VoxGrid();
      g.box(-2, 0, -2, 1, 1, 1, 0x2b2a36).box(-1, 2, -1, 0, 2, 0, C.metalD);
      for (const [x, z] of [[-5, -5], [4, -5], [-5, 4], [4, 4]]) { g.line(x < 0 ? -2 : 1, 1, z < 0 ? -2 : 1, x, 1, z, 0x3a3d48); g.set(x, 2, z, C.metalD); }
      g.box(-1, -2, 0, 0, -1, 1, 0x1a1a22).set(0, -2, 2, 0x6fd8ff, true);
      g.set(-5, 0, 4, 0xff3030, true).set(4, 0, 4, 0x30ff60, true);
      return g;
    }, { scale: 0.07, pivot: [0, 0, 0], ao: true }, 0, 0, 0, 0, 1, { parent: drone });
    const rotorGeo = new THREE.BoxGeometry(0.42, 0.012, 0.05);
    const rotorMat = new THREE.MeshBasicMaterial({ color: 0x2a2a30, transparent: true, opacity: 0.6 });
    const rotors = [[-4.5, -4.5], [4.5, -4.5], [-4.5, 4.5], [4.5, 4.5]].map(([x, z]) => {
      const r = new THREE.Mesh(rotorGeo, rotorMat);
      r.position.set(x * 0.07, 0.21, z * 0.07);
      drone.add(r);
      return r;
    });
    K.add(drone);
    K.onUpdate((dt, t) => {
      const a = t * 0.21;
      drone.position.set(Math.sin(a) * 7.5, 5.2 + Math.sin(t * 1.7) * 0.15, -9.5 + Math.sin(a * 2) * 2.2);
      drone.rotation.y = Math.cos(a) * 0.9;
      drone.rotation.z = -Math.cos(a) * 0.12;
      for (let i = 0; i < 4; i++) rotors[i].rotation.y = t * 40 * (i & 1 ? 1 : -1);
    });
  }
  {
    const beamGeo = new THREE.ConeGeometry(1.7, 13, 18, 1, true);
    beamGeo.translate(0, -6.5, 0);
    const beamMat = new THREE.MeshBasicMaterial({ color: 0xfff0c0, transparent: true, opacity: 0.09, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    for (const [x, z, ph] of [[-19.5, -20.5, 0], [19.5, -21, 2.1]]) {
      K.mesh('tower', towerGrid, { scale: 0.12, ao: true }, x, 0, z, 0, 1, { shadow: true });
      const head = new THREE.Group();
      head.position.set(x, 7.4, z + 0.45);
      const beam = new THREE.Mesh(beamGeo, beamMat);
      beam.rotation.x = -0.95;
      head.add(beam);
      K.add(head);
      K.onUpdate((dt, t) => { head.rotation.y = -Math.sign(x) * (0.45 + Math.sin(t * 0.4 + ph) * 0.35); });
    }
  }
  // video village: a white canopy with glowing monitors
  K.mesh('videoVillage', () => {
    const g = new VoxGrid();
    for (const [x, z] of [[-12, -8], [11, -8], [-12, 7], [11, 7]]) g.box(x, 0, z, x, 20, z, 0xc8ccd4);
    g.box(-13, 21, -9, 12, 21, 8, 0xffffff);
    g.box(-11, 22, -7, 10, 22, 6, 0xf4f4f8);
    g.box(-13, 19, 8, 12, 20, 8, (x) => (Math.floor((x + 13) / 3) & 1 ? C.red : C.white));
    g.box(-9, 6, -3, 8, 6, 2, 0x8a5a3a);
    for (const [x, z] of [[-9, -3], [8, -3], [-9, 2], [8, 2]]) g.box(x, 0, z, x, 5, z, C.black);
    for (const x of [-7, -1, 5]) {
      g.box(x, 7, -2, x + 4, 11, -2, C.black);
      g.box(x + 1, 8, -1, x + 3, 10, -1, [0x6fd8ff, 0xff8ac0, 0xb8ff8a][(x + 7) / 6], true);
    }
    g.box(-12, 0, 4, -9, 5, 6, 0x2b2a36).box(-12, 6, 4, -9, 6, 6, 0x1d9bf0); // director's chair
    return g;
  }, { scale: 0.1, ao: true }, -8.4, 0, -16.6, 0.2, 1, { shadow: true });

  // ---- porta-potties (the doors swing open now and then)
  {
    const xs = [-11.2, -12.45, -13.7], z = -14.4;
    K.inst('potty', pottyGrid, { scale: 0.1, ao: true }, xs.map((x) => [x, 0, z, 0]), { shadow: true });
    const doors = xs.map((x) => K.mesh('pottyDoor', pottyDoorGrid, { scale: 0.1, pivot: [0, 0, 0], ao: true }, x - 0.45, 0.1, z + 0.5, 0, 1, { shadow: true }));
    K.onUpdate((dt, t) => {
      doors.forEach((d, i) => {
        const k = (t * 0.11 + i * 0.37) % 1;
        const open = k < 0.12 ? Math.sin((k / 0.12) * Math.PI) : 0;
        d.rotation.y = -open * 1.6;
      });
    });
  }

  // ---- bleachers packed with cheering fans
  const BLL = 56;
  for (const [cx, z, seed] of [[-16.2, -23.2, 3], [0, -24.6, 7], [16.2, -23.2, 11]]) {
    K.mesh('bleachers', bleacherGrid(BLL), { scale: 0.25, pivot: [BLL / 2, 0, 0] }, cx, 0, z, 0, 1, { shadow: true });
    addCrowd(K, cx, z, BLL, seed);
  }
  // pennant bunting strung over each bleacher section
  K.inst('bunting', () => {
    const g = new VoxGrid();
    const cols = [C.red, C.white, 0x1d9bf0, 0xffd23f];
    const L = 120;
    for (let x = 0; x <= L; x++) {
      const t = x / L, y = Math.round(40 - Math.sin(t * Math.PI) * 6);
      g.set(x, y, 0, 0x3a3030);
      const k = x % 6;
      if (k < 4) for (let d = 1; d <= (k === 0 || k === 3 ? 1 : 3); d++) g.set(x, y - d, 0, cols[Math.floor(x / 6) % 4]);
    }
    for (const x of [0, L]) g.box(x, 0, 0, x, 40, 0, C.metalD);
    return g;
  }, { scale: 0.115, pivot: [60, 0, 0] }, [[-16.2, 0, -27.5], [0, 0, -28.9], [16.2, 0, -27.5]]);

  // ---- the LAST TO LEAVE billboard, a fence and trees far behind
  K.mesh('billboard', () => signGrid('LAST TO LEAVE', { textScale: 3, pad: 3, legH: 40, bg: C.red, frame: 0xffd23f, color: 0xffffff, leg: 0x6b7386 }), { scale: 0.13 }, -11, 0, -38, 0.12);
  {
    const W = textW('LAST TO LEAVE', 3) + 6, bulbs = [];
    for (let x = -W / 2 + 1; x < W / 2 - 1; x += 3) for (const y of [40.5, 40 + 21 - 0.5]) bulbs.push([-11 + x * 0.13 * Math.cos(0.12) + 0.32 * Math.sin(0.12), y * 0.13, -38 + 0.32 * Math.cos(0.12) - x * 0.13 * Math.sin(0.12)]);
    for (let y = 43; y < 59; y += 3) for (const x of [-W / 2 + 0.5, W / 2 - 1.5]) bulbs.push([-11 + x * 0.13 * Math.cos(0.12) + 0.32 * Math.sin(0.12), y * 0.13, -38 + 0.32 * Math.cos(0.12) - x * 0.13 * Math.sin(0.12)]);
    blinkInst(K, 'marquee', () => new VoxGrid().set(0, 0, 0, 0xfff0a0, true), { scale: 0.13, pivot: 'center' }, bulbs, { groups: 2, rate: 3, mode: 'chase' });
  }
  K.inst('fence', () => {
    const g = new VoxGrid();
    for (let x = 0; x < 30; x++) {
      if (x % 10 === 0) g.box(x, 0, 0, x, 8, 0, C.woodD);
      g.set(x, 3, 0, C.wood).set(x, 6, 0, C.wood);
    }
    return g;
  }, { scale: 0.12 }, Array.from({ length: 34 }, (_, i) => [-60 + i * 3.6, 0, -31.5]));
  const trees = [];
  for (let i = 0; i < 34; i++) {
    const x = K.rand(-66, 66), z = K.rand(-62, -33);
    if (Math.abs(x) < 15 && z > -42) continue;
    trees.push([x, 0, z, K.rand(0, 6), K.rand(0.18, 0.27)]);
  }
  K.inst('treeRound', () => treeGrid('round', { seed: 5, leaf: 0x62b444 }), { scale: 1 }, trees.filter((_, i) => i % 3 !== 0));
  K.inst('treePine', () => treeGrid('pine', { leaf: 0x3f9a46 }), { scale: 1 }, trees.filter((_, i) => i % 3 === 0));
  // camper vans parked at the edges
  K.inst('camperVan', () => {
    const g = new VoxGrid();
    g.box(-14, 2, -6, 13, 14, 5, (x, y) => (y === 6 || y === 7 ? 0x29b6f6 : y > 12 ? 0xffffff : 0xf4f2ec));
    g.box(10, 8, -6, 13, 12, 5, 0x5a7a9a);
    for (let x = -11; x < 6; x += 5) g.box(x, 9, 6, x + 2, 11, 6, 0x5a7a9a);
    g.box(-8, 2, 6, -5, 10, 6, 0xd8d4cc);
    for (const x of [-9, 8]) for (const z of [-6, 5]) g.box(x - 2, 0, z, x + 1, 3, z, C.black);
    g.box(-12, 15, -4, -6, 16, 3, 0xd0d6de);
    return g;
  }, { scale: 0.12, ao: true }, [[-26, 0, -12, 0.3], [27, 0, -13, -0.4], [-33, 0, -24, 0.1], [34, 0, -26, -0.2]], { shadow: true });

  // ---- foreground (low!): striped marker stakes, grass tufts, dropped bills
  const stakes = [];
  for (let x = -22; x <= 22; x += 4) stakes.push([x + 1, 0, LH + 0.5, 0, 1]);
  K.inst('stake', () => {
    const g = new VoxGrid();
    for (let y = 0; y < 4; y++) g.box(0, y, 0, 1, y, 1, y & 1 ? C.white : C.red);
    g.box(0, 4, 0, 1, 4, 1, C.gold);
    return g;
  }, { scale: 0.09, ao: true }, stakes, { shadow: true });
  const tufts = [];
  for (let i = 0; i < 80; i++) tufts.push([K.rand(-40, 40), 0, K.rand(LH + 1.1, 13), K.rand(0, 6), K.rand(0.6, 1.2)]);
  K.inst('tuft', () => {
    const g = new VoxGrid();
    for (const [x, h] of [[0, 3], [1, 2], [-1, 2], [2, 1]]) for (let y = 0; y < h; y++) g.set(x, y, 0, y === h - 1 ? C.grassL : C.grassD);
    return g;
  }, { scale: 0.08 }, tufts);
  const litter = [];
  for (let i = 0; i < 14; i++) litter.push([K.rand(-20, 20), 0.005, K.rand(LH + 1, 9), K.rand(0, 6), 1]);
  K.inst('droppedBill', () => new VoxGrid().box(0, 0, 0, 3, 0, 1, (x) => (x === 1 || x === 2 ? 0x8fe08a : C.cashD)), { scale: 0.09, pivot: [0, 0, 0] }, litter);

  // ---- postcard extras: string lights over the bleacher fronts, a food truck, flags, birds, butterflies
  {
    const wire = [], bulbs = [];
    for (const [x0, x1, z] of [[-26, -6.5, -20.6], [6.5, 26, -20.6]]) {
      const n = Math.round((x1 - x0) / 0.5);
      for (let i = 0; i <= n; i++) {
        const u = i / n, x = x0 + (x1 - x0) * u, y = 4.3 - Math.sin(u * Math.PI) * 0.9;
        wire.push([x, y, z]);
        if (i % 2 === 0) bulbs.push([x, y - 0.12, z]);
      }
    }
    K.inst('lightWire', () => new VoxGrid().set(0, 0, 0, 0x3a3038), { scale: 0.05, pivot: 'center' }, wire.map((p) => [p[0], p[1], p[2], 0, [10, 1, 1]]));
    blinkInst(K, 'stringBulb', () => new VoxGrid().set(0, 0, 0, 0xffe8a0, true).set(0, 1, 0, 0x3a3038), { scale: 0.07, pivot: 'center' }, bulbs, { groups: 3, rate: 0.35, mode: 'twinkle', duty: -0.6 });
    K.inst('lightPole', () => new VoxGrid().box(0, 0, 0, 0, 46, 0, C.woodD).box(-1, 0, -1, 1, 1, 1, C.woodD), { scale: 0.1 }, [[-26, 0, -20.6], [-6.5, 0, -20.6], [6.5, 0, -20.6], [26, 0, -20.6]]);
  }
  {
    const tx = -27, tz = -15.5;
    K.mesh('foodTruck', foodTruckGrid, { scale: 0.1, ao: true }, tx, 0, tz, 0.35, 1, { shadow: true });
    addPuffs(K, { id: 'grillSmoke', sources: [[tx - 0.6, 3.2, tz - 0.4]], n: 7, life: 3.2, rise: 3, drift: [1.2, -0.3], size: [0.4, 1.4], scale: 0.1, color: 0xe8e4e0, light: 0xffffff, shade: 0xc8c0bc, opacity: 0.8, seed: 4 });
  }
  addFlag(K, { id: 'cflagA', x: -15.6, y: 6.6, z: -28.6, w: 14, h: 8, vox: 0.1, pattern: (u, v) => (v > 3 && u < 6 ? (u + v) % 2 ? 0xffffff : 0x1d4fa0 : v % 2 ? 0xe8343c : 0xffffff), poleH: 6.6 });
  addFlag(K, { id: 'cflagB', x: 16.4, y: 6.6, z: -28.6, w: 14, h: 8, vox: 0.1, pattern: (u, v) => (v < 3 ? 0x29b6f6 : v < 5 ? 0xffffff : 0xff2e88), poleH: 6.6, phase: 2 });
  addBirds(K, { id: 'circleFlock', n: 6, mode: 'flock', x0: -70, x1: 70, y: 11, z: -45, speed: 2.6, dir: -1, color: 0x3a3440, wingTip: 0x221e28, belly: 0x4a4450, beak: 0x3a3440, head: 0x3a3440, vox: 0.07, flap: 10, soar: 0.2, seed: 7 });
  addSparkles(K, { id: 'circleButterfly', n: 8, area: [-20, 20, 0.25, 0.5, LH + 1.2, 6.5], color: 0xffffff, color2: 0xffb030, cross: true, scale: 0.05, rate: 0.5, wander: 0.8, sharp: 0.6, seed: 3 });
  const cfl = [[], []];
  for (let i = 0; i < 40; i++) cfl[i % 2].push([K.rand(-36, 36), 0, K.rand(LH + 1.1, 11), K.rand(0, 6), K.rand(0.06, 0.08)]);
  [0xffe14a, 0xffffff].forEach((c, i) => swayInst(K, 'cflower' + i, () => flowerGrid(c, { center: i ? 0xffd23f : 0xff8a2a }), { scale: 1 }, cfl[i], { amp: 0.1, speed: 1.8 }));

  return {
    sky,
    fog: { color: 0xf6dcb8, near: 62, far: 175 },
    lights: { sky: 0xdceaff, ground: 0x8a7a50, hemi: 1.25, sun: 2.2, sunColor: 0xffe4bc, dir: [-9, 14, 9], rim: 1.0, rimColor: 0xffc890 },
    dust: 0xd8c8a0,
  };
}

// --------------------------------------------------------------------------- Beast Island zone diorama

export function buildZone(K) {
  // round grassy plinth with dirt sides and the painted circle on top
  K.mesh('zoneBase', () => {
    const g = new VoxGrid();
    const R = 27.5;
    for (let x = -28; x <= 27; x++) for (let z = -28; z <= 27; z++) {
      const d = Math.hypot(x + 0.5, z + 0.5);
      if (d > R) continue;
      const rr = Math.abs(d - 19.5);
      const top = rr < 1.1 ? (hash3(x, 2, z) < 0.08 ? C.redD : C.red) : rr < 1.7 ? C.white : d < 18 && vnoise(x * 0.3, 9, z * 0.3) > 0.64 ? mixHex(C.grass, C.trampled, 0.5) : vnoise(x * 0.25, 3, z * 0.25) > 0.62 ? C.grassL : hash3(x, 1, z) < 0.25 ? C.grassD : C.grass;
      g.set(x, 0, z, top);
      g.set(x, -1, z, d > R - 1 ? 0x7a5a3a : 0x8a6a4a);
      if (d < R - 0.8) g.set(x, -2, z, 0x6a4a30);
      if (d < R - 2) g.set(x, -3, z, 0x5a3a24);
      if (d < R - 3.5) g.set(x, -4, z, 0x4a3020);
    }
    return g;
  }, { scale: 0.25, pivot: [0, 1, 0] }, 0, 0, 0);
  // the prize: podium + cash mountain + $500,000 sign with chasing bulbs
  K.mesh('podium', podiumGrid, { scale: 0.12 }, 0.4, 0, -1.0, 0, 1, { shadow: true });
  K.mesh('prizeSign', prizeSignGrid, { scale: 0.08 }, 0.4, 0, -3.5, 0, 1, { shadow: true });
  // campers' gear
  K.mesh('tent0', tentGrid(GEAR[0]), { scale: 0.16, ao: true }, -4.1, 0, 0.5, 0.7, 1, { shadow: true, receive: false });
  K.mesh('aframe1', aframeGrid(GEAR[1]), { scale: 0.15, ao: true }, -3.3, 0, -2.9, 0.35, 1, { shadow: true, receive: false });
  K.mesh('tent2', tentGrid(GEAR[2]), { scale: 0.15, ao: true }, 4.3, 0, 0.9, -0.8, 1, { shadow: true, receive: false });
  K.mesh('bag6', bagGrid(GEAR[6]), { scale: 0.13, ao: true }, -2.7, 0, 2.8, 0.4, 1, { receive: false });
  K.mesh('cooler0', coolerGrid(C.red), { scale: 0.13, ao: true }, 2.5, 0, 0.9, 0.3, 1, { shadow: true, receive: false });
  K.mesh('chairZ', chairGrid(0x29b6f6), { scale: 0.13, ao: true }, -0.5, 0, 1.8, 0.3, 1, { shadow: true, receive: false });
  K.mesh('snacksZ', snackGrid(2), { scale: 0.13, ao: true }, -2.0, 0, -0.6, -0.3, 1, { shadow: true, receive: false });
  // bleachers full of fans behind the circle
  K.mesh('zoneBleachers', bleacherGrid(30, true), { scale: 0.2, pivot: [15, 0, 0] }, -1.6, 0, -4.4, 0.12, 1, { shadow: true });
  // porta-potty (door swings), camera crane and a mini LAST TO LEAVE billboard
  K.mesh('pottyZ', pottyGrid, { scale: 0.1, ao: true }, 5.0, 0, -2.4, -0.7, 1, { shadow: true });
  const door = new THREE.Group();
  door.position.set(5.0, 0, -2.4);
  door.rotation.y = -0.7;
  K.add(door);
  const dm = K.mesh('pottyDoorZ', pottyDoorGrid, { scale: 0.1, pivot: [0, 0, 0], ao: true }, -0.45, 0.1, 0.5, 0, 1, { parent: door });
  K.onUpdate((dt, t) => { const k = (t * 0.15) % 1; dm.rotation.y = -(k < 0.15 ? Math.sin((k / 0.15) * Math.PI) : 0) * 1.5; });
  K.inst('tripodZ', tripodGrid, { scale: 0.08, ao: true }, [[3.7, 0, 3.1, -0.7], [-1.7, 0, -2.4, 0.5]], { shadow: true, receive: false });
  K.mesh('towerZ', towerGrid, { scale: 0.07, ao: true }, -5.0, 0, -2.6, 0.6, 1, { shadow: true });
  K.mesh('zoneBillboard', () => signGrid('LAST TO LEAVE', { textScale: 1, pad: 2, legH: 16, bg: C.red, frame: 0xffd23f, color: 0xffffff }), { scale: 0.13 }, 3.6, 0, -5.4, -0.35);
  // trees around the rim
  K.inst('zoneTree', () => treeGrid('round', { seed: 3, leaf: 0x62b444 }), { scale: 1 }, [[-5.7, 0, -2.0, 0.3, 0.17], [6.0, 0, -0.2, 1, 0.14], [-5.4, 0, 3.4, 2, 0.14]], { shadow: true });
  K.inst('zoneStake', () => {
    const g = new VoxGrid();
    for (let y = 0; y < 4; y++) g.box(0, y, 0, 1, y, 1, y & 1 ? C.white : C.red);
    return g;
  }, { scale: 0.1, ao: true }, Array.from({ length: 14 }, (_, i) => { const a = (i / 14) * Math.PI * 2 + 0.2; return [Math.cos(a) * 6.1, 0, Math.sin(a) * 6.1, a]; }).filter(([x, , z]) => !(z > 3 && x > -3.5 && x < 2.5)));
  // Nolan's lost phone, dropped in the grass by the tents (tappable secret)
  K.mesh('nolanPhone', () => {
    const g = new VoxGrid();
    g.box(0, 0, 0, 3, 0, 6, C.black);
    g.box(1, 1, 1, 2, 1, 5, 0x6fd8ff, true);
    g.set(1, 1, 3, 0xffffff, true);
    g.box(0, 0, 7, 3, 0, 7, 0xff2e88);
    return g;
  }, { scale: 0.07, ao: true }, -4.5, 0.01, 2.4, 0.7);
  anchor(K, 'nolanPhone', -4.4, 0.1, 2.65);
  anchor(K, 'npc', 1.6, 0, 4.2);
  anchor(K, 'boss', -2.0, 0, 4.6);
  return { focus: [0, 1.2, 0], radius: 7 };
}

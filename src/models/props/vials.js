// Vials = the game's chests, built as high-res voxel toys modelled on the real
// MrBeast Lab Swarms packaging (see src/data/vials.js):
//   testTube - clear tube with a ridged screw cap, a hazard-striped label with
//              the Lab bolt badge, a dissolvable paper bag inside (add water,
//              shake, the cap pops) standing in a branded "LAB" puck
//   labPack  - a lab-kit box: window with tubes in a rack, hinged lid with a
//              carry handle and two snap latches
//   megaLab  - the big lab play-set: wide box, 5-tube window, glowing side
//              tanks, MEGA plate, reactor dome + handle on the lid
//   cashCase - the collector briefcase lying flat: gold shell, corner guards,
//              handle, two latches, emblem on the lid, stacks of cash inside
// Every model is built once per vial type (geometry cache) and re-used.
//
// makeVial(type, opts) -> VialModel (see the class below for the full API).
import * as THREE from 'three';
import { Mats, makeMesh, variantMaterials } from '../../core/voxel.js';
import { G, blob, rbox, cyl, capsule, stamp, shade, mixHex, n3, BOLT_SMALL } from '../kit.js';
import { animate } from '../../core/tween.js';
import { VIALS, vialId } from '../../data/vials.js';

const V = 0.05;
const INK = 0x15121f, WHITE = 0xf6f8ff, BLUE = 0x1d7cf2, BLUE_D = 0x1050b4, BLUE_L = 0x8fd4ff, PINK = 0xff1f9e;
const YEL = 0xffd23f, METAL = 0xd2d9e8, METAL_D = 0x7a849c, FOAM_IN = 0x1c2150, WALL_IN = 0x0e1336;

const lum = (c) => (((c >> 16) & 255) * 0.3 + ((c >> 8) & 255) * 0.59 + (c & 255) * 0.11) / 255;
const onColor = (bg) => (lum(bg) > 0.62 ? INK : WHITE);
/** Diagonal hazard stripes on a vertical surface (u = position along the surface). */
const hazard = (u, y) => ((Math.floor((u + y) / 2) & 1) ? YEL : INK);

// ---------------------------------------------------------------------------
// Pixel art

const FONT = {
  A: ['.X.', 'X.X', 'XXX', 'X.X', 'X.X'],
  B: ['XX.', 'X.X', 'XX.', 'X.X', 'XX.'],
  E: ['XXX', 'X..', 'XX.', 'X..', 'XXX'],
  G: ['.XX', 'X..', 'X.X', 'X.X', '.XX'],
  L: ['X..', 'X..', 'X..', 'X..', 'XXX'],
  M: ['X...X', 'XX.XX', 'X.X.X', 'X...X', 'X...X'],
};
function textArt(str, ch = 'T') {
  const rows = ['', '', '', '', ''];
  [...str].forEach((c, i) => {
    const g = FONT[c];
    for (let r = 0; r < 5; r++) rows[r] += (i ? '.' : '') + g[r].replace(/X/g, ch);
  });
  return rows;
}

/** The Lab badge: blue disc, white rim, magenta lightning bolt (11x11). */
const BADGE = [
  '...WWWWW...',
  '..WBBBBBW..',
  '.WBBBBMMBW.',
  'WBBBBMMBBBW',
  'WBBBMMBBBBW',
  'WBBMMMMMBBW',
  'WBBBBMMBBBW',
  'WBBBMMBBBBW',
  '.WBBMBBBBW.',
  '..WBBBBBW..',
  '...WWWWW...',
];

/** The Lab badge art, exported for other Lab props (pedestals, signs). */
export const LAB_BADGE = BADGE;

/** Round emblem with a symbol inside (13x13) for the briefcase lid. */
function emblemArt(symbol) {
  const N = 13, c = 6;
  const rows = [];
  for (let v = 0; v < N; v++) {
    let r = '';
    for (let u = 0; u < N; u++) {
      const d = Math.hypot(u - c, v - c);
      r += d > 6.4 ? '.' : d > 5.3 ? 'R' : 'F';
    }
    rows.push(r);
  }
  const put = (art, ox, oy) => art.forEach((line, j) => [...line].forEach((ch, i) => {
    if (ch === '.') return;
    const row = rows[oy + j];
    rows[oy + j] = row.slice(0, ox + i) + ch + row.slice(ox + i + 1);
  }));
  if (symbol === 'crown') {
    put(['S...S...S', 'SS.SSS.SS', 'SSSSSSSSS', 'SJSSJSSJS', 'SSSSSSSSS'], 2, 4);
  } else {
    put(['..S..', '.SSSS', 'S.S..', '.SSS.', '..S.S', 'SSSS.', '..S..'], 4, 3);
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Shared materials

let glassMat = null, glassInnerMat = null, hiMat = null, windowMat = null;
function envMap() {
  return Mats.toy.envMap ?? null;
}
function glassMats() {
  if (!glassMat) {
    glassMat = new THREE.MeshStandardMaterial({
      color: 0xe6f6ff, transparent: true, opacity: 0.2, roughness: 0.05, metalness: 0.1, envMapIntensity: 2.2, depthWrite: false,
    });
    glassInnerMat = glassMat.clone();
    glassInnerMat.side = THREE.BackSide;
    glassInnerMat.opacity = 0.12;
    hiMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false });
    windowMat = new THREE.MeshStandardMaterial({
      color: 0xd8f0ff, transparent: true, opacity: 0.16, roughness: 0.03, metalness: 0.2, envMapIntensity: 2.5, depthWrite: false,
    });
  }
  const em = envMap();
  for (const m of [glassMat, glassInnerMat, windowMat]) if (em && m.envMap !== em) { m.envMap = em; m.needsUpdate = true; }
  return { glass: glassMat, inner: glassInnerMat, hi: hiMat, window: windowMat };
}
function glowMaterial(color) {
  return new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide,
  });
}

/** Iridescent hyperchrome colour for a surface angle. */
const HYPER = [0xffc4ee, 0xbff6ff, 0xfff2b8, 0xd8c8ff];
const hyper = (a, y) => mixHex(0xe4eaf4, HYPER[(Math.floor((a / Math.PI) * 3 + y * 0.35) % 4 + 4) % 4], 0.45);

// ---------------------------------------------------------------------------
// Test tube

// world-space layout of the tube (y up, y = 0 on the table)
const TUBE = { puckTop: 0.35, glassR: 0.335, glassTop: 1.52, capY: 1.44, liqBottom: 0.34, liqTop: 1.44, liqR: 0.3 };

function tubeGrids(def) {
  const cap = def.cap, label = def.label, chrome = !!def.chrome;
  // ---- puck stand with the LAB logo
  const puck = G();
  cyl(puck, 'y', -0.5, -0.5, 0, 6, 9.4, 9.4, (x, y, z) => {
    if (y === 0) return INK;
    if (y === 6) return chrome ? hyper(Math.atan2(z + 0.5, x + 0.5), 0) : shade(cap, 0.05);
    if (y === 1) return BLUE_D;
    return n3(x, y, z) < 0.05 ? shade(BLUE, -0.06) : BLUE;
  });
  cyl(puck, 'y', -0.5, -0.5, 6, 6, 7, 7, 0x0b1030);
  stamp(puck, textArt('LAB'), { T: WHITE }, { axis: 'z', x: -6, y: 5 });
  stamp(puck, ['M.', 'MM', '.M'], { M: PINK }, { axis: 'z', x: -10, y: 4 });
  stamp(puck, ['.M', 'MM', 'M.'], { M: PINK }, { axis: 'z', x: 7, y: 4 });

  // ---- screw cap with grip ridges and a raised bolt on top
  const capG = G();
  for (let y = 0; y <= 7; y++) {
    const rBase = y >= 7 ? 7.0 : y >= 6 ? 7.9 : 8.1;
    for (let x = -10; x <= 9; x++) for (let z = -10; z <= 9; z++) {
      const dx = x + 0.5, dz = z + 0.5, d = Math.hypot(dx, dz);
      const a = Math.atan2(dz, dx);
      const ridge = y >= 1 && y <= 5 && (Math.floor((a / (Math.PI * 2)) * 30 + 100) & 1);
      if (d > rBase + (ridge ? 0.65 : 0) + 0.35) continue;
      let c = chrome ? hyper(a, y) : ridge ? shade(cap, 0.14) : cap;
      if (y === 0) c = shade(chrome ? 0xb8c2d6 : cap, -0.28);
      else if (y === 7) c = chrome ? hyper(a, 3) : shade(cap, 0.08);
      capG.set(x, y, z, c);
    }
  }
  stamp(capG, BOLT_SMALL, { M: { c: chrome ? PINK : onColor(cap) === INK ? PINK : WHITE, raise: 1 } }, { axis: 'y', x: -3, z: -4 });

  // ---- wrap label: hazard bands + Lab badge (rows 8..20 => 0.4 .. 1.05)
  const lab = G();
  const L0 = 8, L1 = 20;
  cyl(lab, 'y', -0.5, -0.5, L0, L1, 7.35, 7.35, (x, y, z) => {
    const a = Math.atan2(x + 0.5, z + 0.5);
    if (y <= L0 + 1 || y >= L1 - 1) return hazard(Math.round(a * 7.35), y);
    if (Math.abs(a) > 2.2) return shade(label, (y & 1) ? -0.06 : -0.12); // seam at the back
    return label;
  }, { hollow: 1.3 });
  stamp(lab, BADGE.slice(1, 10).map((r) => r), { W: WHITE, B: BLUE, M: PINK }, { axis: 'z', x: -6, y: L1 - 2 });
  // side stripes in the cap colour (the "Swarms" graphic)
  lab.paint((x, y, z, c) => {
    if (y <= L0 + 1 || y >= L1 - 1 || c !== label) return undefined;
    const a = Math.atan2(x + 0.5, z + 0.5);
    const s = Math.floor(a * 7.35 - y * 0.6);
    return Math.abs(a) > 1.0 && Math.abs(a) < 2.2 && (s % 4 === 0) ? (chrome ? 0x6a7590 : cap) : undefined;
  });

  // ---- dissolvable paper bag (inside, sits on the puck)
  const bag = G();
  blob(bag, -0.5, 9, -0.5, 4.4, 9, 3.6, (x, y, z) => (n3(x, y, z, 3) < 0.1 ? BLUE_L : (y % 5 === 0 ? 0xdcd8cc : 0xf4f0e6)), { p: 2.6 });
  for (let x = -5; x <= 4; x++) bag.set(x, 19 + (x & 1), -1, 0xe8e2d4).set(x, 19, 0, 0xe8e2d4);
  stamp(bag, ['.MM', 'MM.', '.MM', 'MM.'], { M: PINK }, { axis: 'z', x: -2, y: 14 });

  // ---- foam cap (scaled in y) + overflow dome
  const foam = G();
  cyl(foam, 'y', -0.5, -0.5, 0, 4, 6.2, 6.2, (x, y, z) => (n3(x, y, z) < 0.25 ? 0xeaf6ff : 0xffffff));
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2, r = i % 2 ? 3.4 : 1;
    blob(foam, Math.cos(a) * r - 0.5, 5, Math.sin(a) * r - 0.5, 2.4, 2, 2.4, 0xffffff);
  }
  foam.carve((x, y, z) => Math.hypot(x + 0.5, z + 0.5) > 6.4);
  const over = G();
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2, r = i ? 5 : 0;
    blob(over, Math.cos(a) * r - 0.5, 3 + (i ? 0 : 3), Math.sin(a) * r - 0.5, 4.2, 3.6, 4.2, (x, y, z) => (n3(x, y, z, 5) < 0.2 ? 0xe4f4ff : 0xffffff));
  }
  over.carve((x, y) => y < 0);

  // ---- mystery silhouettes swirling in the liquid
  const sil = G();
  blob(sil, -0.5, 3, -0.5, 2.6, 2.4, 2.2, 0x1a1238);
  sil.box(-3, 5, -1, -2, 6, 0, 0x1a1238).box(1, 5, -1, 2, 6, 0, 0x1a1238);
  sil.set(-2, 3, 2, 0xff2e88, true).set(1, 3, 2, 0xff2e88, true);
  return { puck, cap: capG, label: lab, bag, foam, over, sil };
}

// ---------------------------------------------------------------------------
// Box products (labPack / megaLab / cashCase)

/** A small snap latch (built around the origin, pivot at the bottom). */
function latchGrid(col = METAL, tall = 6) {
  const g = G();
  rbox(g, -1, 0, 0, 1, tall, 1, 0, (x, y) => (y === tall ? shade(col, 0.15) : col));
  g.box(-1, tall - 2, 2, 1, tall - 1, 2, shade(col, -0.2));
  g.set(0, 2, 2, INK);
  return g;
}

function miniTube(g, cx, cz, y0, y1, r, liq, capC) {
  const split = Math.round(y0 + (y1 - y0) * 0.58);
  cyl(g, 'y', cx, cz, y0, y1, r, r, (x, y) => (y <= split ? (y === split ? shade(liq, 0.3) : liq) : (y === y1 ? 0xffffff : 0xcfeeff)));
  cyl(g, 'y', cx, cz, y1 + 1, y1 + 2, r + 0.3, r + 0.3, (x, y) => (y === y1 + 2 ? shade(capC, 0.12) : capC));
}

function labPackGrids(def) {
  const W0 = -16, W1 = 15, D0 = -9, D1 = 8, TOP = 19, LTOP = 27;
  const main = def.label, trim = def.cap, liq = def.liquid;
  const body = G();
  rbox(body, W0, 0, D0, W1, TOP, D1, 2, (x, y, z) => {
    if (y <= 1) return INK;
    if (y === 2 || y === 3) return hazard(x + z, y);
    if (y === TOP) return shade(main, -0.18);
    return n3(x, y, z) < 0.05 ? shade(main, -0.05) : main;
  });
  // window recess with three tubes in a rack
  body.box(-11, 6, 6, 10, 15, 8, null);
  body.box(-11, 6, 5, 10, 15, 5, WALL_IN);
  body.box(-11, 6, 6, 10, 6, 7, METAL_D);
  [-7.5, -0.5, 6.5].forEach((cx, i) => miniTube(body, cx, 6.5, 7, 12, 1.6, liq, [trim, PINK, BLUE][i]));
  for (let x = -12; x <= 11; x++) for (let y = 5; y <= 16; y++) if (x === -12 || x === 11 || y === 5 || y === 16) body.set(x, y, 9, WHITE);
  // side bolts
  stamp(body, BOLT_SMALL, { M: onColor(main) === INK ? PINK : WHITE }, { axis: 'x', y: 14, z: 2 });
  stamp(body, BOLT_SMALL, { M: onColor(main) === INK ? PINK : WHITE }, { axis: '-x', y: 14, z: -2 });
  // cavity with a foam insert full of tube caps (seen when the lid opens)
  const cav = { x0: W0 + 2, x1: W1 - 2, z0: D0 + 2, z1: 4, floor: 13, top: TOP };
  body.box(cav.x0, cav.floor, cav.z0, cav.x1, TOP, cav.z1, null);
  body.box(cav.x0, cav.floor - 1, cav.z0, cav.x1, cav.floor - 1, cav.z1, FOAM_IN);
  const capsC = [trim, PINK, BLUE, liq];
  [-11, -4, 3, 10].forEach((cx, i) => [-4, 1].forEach((cz, j) => cyl(body, 'y', cx, cz, cav.floor - 1, cav.floor, 1.7, 1.7, (x, y) => (y === cav.floor ? shade(capsC[(i + j) % 4], 0.15) : capsC[(i + j) % 4]))));

  const lid = G();
  rbox(lid, W0, TOP + 1, D0, W1, LTOP, D1, 2, (x, y, z) => (y === TOP + 1 ? shade(trim, -0.2) : y === LTOP ? shade(trim, 0.1) : n3(x, y, z) < 0.05 ? shade(trim, -0.05) : trim), { clip: (x, y) => y < TOP + 1 });
  // logo plate on the lid front
  rbox(lid, -11, TOP + 1, D1 + 1, 10, LTOP, D1 + 1, 0, WHITE);
  stamp(lid, BOLT_SMALL, { M: PINK }, { axis: 'z', x: -9, y: LTOP - 0, zmin: D1 + 1, zmax: D1 + 1 });
  stamp(lid, textArt('LAB'), { T: BLUE }, { axis: 'z', x: -3, y: LTOP - 1, zmin: D1 + 1, zmax: D1 + 1 });
  // carry handle
  capsule(lid, [-7, LTOP, -0.5], [-7, LTOP + 4, -0.5], 1.1, 1.1, INK);
  capsule(lid, [6, LTOP, -0.5], [6, LTOP + 4, -0.5], 1.1, 1.1, INK);
  capsule(lid, [-7, LTOP + 4, -0.5], [6, LTOP + 4, -0.5], 1.3, 1.3, (x, y) => (y > LTOP + 4 ? 0x3a3550 : INK));
  stamp(lid, ['MMM.', '.MMM', 'MMM.'], { M: onColor(trim) === INK ? INK : WHITE }, { axis: 'y', x: -2, z: -6 });
  return {
    body, lid, latch: latchGrid(METAL, 7),
    dims: { W0, W1, D0, D1, TOP, LTOP, cav, hingeY: TOP + 1, hingeZ: D0, latches: [[-13, TOP - 3, D1 + 1], [12, TOP - 3, D1 + 1]], window: [-11, 10, 6, 15, 9] },
  };
}

function megaLabGrids(def) {
  const W0 = -22, W1 = 21, D0 = -12, D1 = 11, TOP = 25, LTOP = 35;
  const main = def.cap, accent = def.label, liq = def.liquid;
  const body = G();
  rbox(body, W0, 0, D0, W1, TOP, D1, 3, (x, y, z) => {
    if (y <= 1) return INK;
    if (y === 2 || y === 3) return hazard(x + z, y);
    if (y === TOP || y === TOP - 1) return accent;
    return n3(x, y, z) < 0.05 ? shade(main, -0.06) : main;
  });
  // big window with a 5-tube rack
  body.box(-14, 7, 9, 13, 19, 11, null);
  body.box(-14, 7, 8, 13, 19, 8, WALL_IN);
  body.box(-14, 7, 9, 13, 7, 10, METAL_D);
  const caps = [accent, PINK, BLUE, 0x5fdc4a, 0xff8a2a];
  [-10.5, -5.5, -0.5, 4.5, 9.5].forEach((cx, i) => miniTube(body, cx, 9.5, 8, 15, 1.7, i % 2 ? liq : shade(liq, 0.2), caps[i]));
  for (let x = -15; x <= 14; x++) for (let y = 6; y <= 20; y++) if (x === -15 || x === 14 || y === 6 || y === 20) body.set(x, y, 12, accent);
  // glowing side tanks
  for (const sx of [-1, 1]) {
    const x0 = sx < 0 ? -20 : 17, x1 = x0 + 2;
    body.box(x0, 6, 10, x1, 21, 11, null);
    for (let x = x0; x <= x1; x++) for (let y = 6; y <= 21; y++) {
      const core = x === x0 + 1;
      const c = y > 17 ? 0xcfeeff : (n3(x, y, 3) < 0.18 ? 0xffffff : core ? shade(liq, 0.25) : liq);
      body.set(x, y, 10, c, core && y <= 17 && y % 3 === 0);
    }
    for (let y = 5; y <= 22; y++) { body.set(x0 - 1, y, 11, METAL); body.set(x1 + 1, y, 11, METAL); }
    body.box(x0 - 1, 22, 10, x1 + 1, 22, 11, METAL_D).box(x0 - 1, 5, 10, x1 + 1, 5, 11, METAL_D);
  }
  stamp(body, BOLT_SMALL, { M: WHITE }, { axis: 'x', y: 18, z: 3 });
  stamp(body, BOLT_SMALL, { M: WHITE }, { axis: '-x', y: 18, z: -3 });
  const cav = { x0: W0 + 3, x1: W1 - 3, z0: D0 + 3, z1: 6, floor: 17, top: TOP };
  body.box(cav.x0, cav.floor, cav.z0, cav.x1, TOP, cav.z1, null);
  body.box(cav.x0, cav.floor - 1, cav.z0, cav.x1, cav.floor - 1, cav.z1, FOAM_IN);
  [-16, -10, -4, 3, 9, 15].forEach((cx, i) => [-6, 0, 5].forEach((cz, j) => {
    const c = caps[(i + j) % caps.length];
    cyl(body, 'y', cx, cz, cav.floor - 1, cav.floor, 1.8, 1.8, (x, y) => (y === cav.floor ? shade(c, 0.15) : c));
  }));

  const lid = G();
  rbox(lid, W0, TOP + 1, D0, W1, LTOP, D1, 3, (x, y, z) => {
    if (y === TOP + 1) return hazard(x + z, y);
    if (y === TOP + 2) return INK;
    return y === LTOP ? shade(main, 0.12) : n3(x, y, z) < 0.05 ? shade(main, -0.05) : shade(main, 0.04);
  }, { clip: (x, y) => y < TOP + 1 });
  // MEGA plate
  rbox(lid, -16, TOP + 3, D1 + 1, 15, LTOP - 1, D1 + 1, 0, INK);
  stamp(lid, textArt('MEGA'), { T: accent }, { axis: 'z', x: -9, y: LTOP - 3, zmin: D1 + 1, zmax: D1 + 1 });
  stamp(lid, BOLT_SMALL, { M: PINK }, { axis: 'z', x: -15, y: LTOP - 2, zmin: D1 + 1, zmax: D1 + 1 });
  stamp(lid, BOLT_SMALL.map((r) => [...r].reverse().join('')), { M: PINK }, { axis: 'z', x: 10, y: LTOP - 2, zmin: D1 + 1, zmax: D1 + 1 });
  // reactor dome with a glowing ring + handle
  cyl(lid, 'y', -0.5, -4.5, LTOP + 1, LTOP + 2, 6, 6, METAL_D);
  cyl(lid, 'y', -0.5, -4.5, LTOP + 3, LTOP + 3, 5.4, 5.4, (x, y, z) => (Math.hypot(x + 0.5, z + 4.5) > 4.2 ? liq : METAL), 'y');
  lid.forEach((x, y, z, c) => { if (y === LTOP + 3 && c === liq) lid.set(x, y, z, liq, true); });
  blob(lid, -0.5, LTOP + 4, -4.5, 3.6, 2.2, 3.6, (x, y, z) => (y >= LTOP + 6 ? WHITE : METAL), { clip: (x, y) => y < LTOP + 4 });
  capsule(lid, [-11, LTOP, 6], [-11, LTOP + 4, 6], 1.2, 1.2, INK);
  capsule(lid, [10, LTOP, 6], [10, LTOP + 4, 6], 1.2, 1.2, INK);
  capsule(lid, [-11, LTOP + 4, 6], [10, LTOP + 4, 6], 1.4, 1.4, (x, y) => (y > LTOP + 4 ? 0x3a3550 : INK));
  for (const [rx, rz] of [[-19, -9], [18, -9], [-19, 8], [18, 8]]) lid.set(rx, LTOP + 1, rz, METAL);
  return {
    body, lid, latch: latchGrid(METAL, 7),
    dims: { W0, W1, D0, D1, TOP, LTOP, cav, hingeY: TOP + 1, hingeZ: D0, latches: [[-19, TOP - 3, D1 + 1], [18, TOP - 3, D1 + 1]], window: [-14, 13, 7, 19, 12] },
  };
}

function cashCaseGrids(def, type) {
  const W0 = -20, W1 = 19, D0 = -13, D1 = 12, TOP = 8, LTOP = 14;
  const shell = def.cap, trim = def.label, cash = def.liquid;
  const corner = (x, z) => (x <= W0 + 1 || x >= W1 - 1) && (z <= D0 + 1 || z >= D1 - 1);
  const body = G();
  rbox(body, W0, 0, D0, W1, TOP, D1, 2, (x, y, z) => {
    if (corner(x, z) || y === 0) return trim;
    if (y === TOP) return shade(trim, 0.15);
    return n3(x, y, z) < 0.06 ? shade(shell, -0.06) : shell;
  });
  // handle on the front
  capsule(body, [-6, 5, D1 + 1], [-6, 5, D1 + 3], 1, 1, trim);
  capsule(body, [5, 5, D1 + 1], [5, 5, D1 + 3], 1, 1, trim);
  capsule(body, [-6, 5, D1 + 3], [5, 5, D1 + 3], 1.3, 1.3, (x, y) => (y > 5 ? shade(trim, 0.25) : trim));
  // cavity full of cash stacks
  const cav = { x0: W0 + 2, x1: W1 - 2, z0: D0 + 2, z1: D1 - 2, floor: 2, top: TOP };
  body.box(cav.x0, cav.floor, cav.z0, cav.x1, TOP, cav.z1, null);
  body.box(cav.x0, cav.floor - 1, cav.z0, cav.x1, cav.floor - 1, cav.z1, FOAM_IN);
  const gold = type === 'crown';
  for (const sx of [-14, -5, 4, 13]) for (const sz of [-7, 3]) {
    const h = 5 + ((sx + sz) & 1);
    rbox(body, sx - 3, cav.floor, sz - 3, sx + 3, cav.floor + h, sz + 4, gold ? 1 : 0, (x, y, z) => {
      if (gold) return y === cav.floor + h ? shade(cash, 0.2) : shade(cash, (x + y) & 1 ? 0 : -0.08);
      if (z === sz || z === sz + 1) return y % 2 ? 0xf4f0d8 : 0xe6dfb8; // paper band
      return y % 2 ? cash : shade(cash, -0.18);
    });
  }
  const lid = G();
  rbox(lid, W0, TOP + 1, D0, W1, LTOP, D1, 2, (x, y, z) => {
    if (corner(x, z)) return trim;
    if (y === TOP + 1) return shade(trim, 0.15);
    if (y === LTOP && (x === W0 + 3 || x === W1 - 3 || z === D0 + 3 || z === D1 - 3) && x >= W0 + 3 && x <= W1 - 3 && z >= D0 + 3 && z <= D1 - 3) return shade(shell, -0.22);
    return n3(x, y, z) < 0.06 ? shade(shell, -0.05) : y === LTOP ? shade(shell, 0.08) : shell;
  }, { clip: (x, y) => y < TOP + 1 });
  for (const [rx, rz] of [[W0 + 4, D0 + 4], [W1 - 4, D0 + 4], [W0 + 4, D1 - 4], [W1 - 4, D1 - 4]]) lid.set(rx, LTOP + 1, rz, METAL);
  const em = emblemArt(gold ? 'crown' : 'dollar');
  stamp(lid, em, { R: { c: WHITE, raise: 1 }, F: { c: gold ? PINK : trim === INK ? PINK : trim, raise: 1 }, S: { c: gold ? YEL : WHITE, raise: 1 }, J: { c: BLUE, raise: 1 } }, { axis: 'y', x: -7, z: -7 });
  stamp(lid, BOLT_SMALL, { M: { c: PINK, raise: 1 } }, { axis: 'y', x: -17, z: 3 });
  stamp(lid, BOLT_SMALL.map((r) => [...r].reverse().join('')), { M: { c: PINK, raise: 1 } }, { axis: 'y', x: 12, z: 3 });
  return {
    body, lid, latch: latchGrid(METAL, 6),
    dims: { W0, W1, D0, D1, TOP, LTOP, cav, hingeY: TOP + 1, hingeZ: D0, latches: [[-13, TOP - 2, D1 + 1], [12, TOP - 2, D1 + 1]] },
  };
}

// ---------------------------------------------------------------------------
// Geometry cache

const geoCache = new Map();
function geos(type) {
  if (geoCache.has(type)) return geoCache.get(type);
  const def = VIALS[type];
  const b = (g, pivot, opts = {}) => g.build({ scale: V, pivot, jitter: 0.02, maxSamples: opts.samples ?? 220 });
  let out;
  if (def.product === 'testTube') {
    const g = tubeGrids(def);
    out = {
      puck: b(g.puck, [0, 0, 0]), cap: b(g.cap, [0, 0, 0], { samples: 140 }), label: b(g.label, [0, 0, 0]), bag: b(g.bag, [0, 0, 0], { samples: 80 }),
      foam: b(g.foam, [0, 0, 0], { samples: 40 }), over: b(g.over, [0, 0, 0], { samples: 60 }), sil: b(g.sil, [0, 0, 0], { samples: 20 }),
    };
  } else {
    const g = def.product === 'megaLab' ? megaLabGrids(def) : def.product === 'cashCase' ? cashCaseGrids(def, type) : labPackGrids(def);
    out = {
      dims: g.dims,
      body: b(g.body, [0, 0, 0], { samples: 320 }),
      lid: b(g.lid, [0, g.dims.hingeY, g.dims.hingeZ], { samples: 200 }),
      latch: g.latch.build({ scale: V, pivot: 'bottom', jitter: 0.02, maxSamples: 20 }),
    };
  }
  geoCache.set(type, out);
  return out;
}

// ---------------------------------------------------------------------------

/** Taps needed to open a vial in the opening scene (latches + 1 for boxes). */
export function vialTapCount(type) {
  const p = VIALS[vialId(type)]?.product ?? 'testTube';
  return p === 'testTube' ? 3 : 3;
}

/**
 * makeVial(type, opts) -> VialModel
 * opts: { thumb (static, liquid filled, no lights), filled (tube starts filled), glowColor }
 *
 * VialModel:
 *   root, body (shaking group), product, def, height, width,
 *   update(dt), shake(amount), setGlow(k 0..1), setGlowColor(hex), setRumble(k),
 *   open(): Promise (cap pops / latches + lid swing; resolves at the burst moment),
 *   mouth(): Vector3 world point the contents fly out of,
 *   test tube only: setFill(level 0..1, mix 0 water .. 1 vial liquid), setFoam(k), dissolve(): Promise, overflow(k)
 *   boxes only: unlatch(i): Promise, latchCount, lid (hinge group)
 */
export function makeVial(type, opts = {}) {
  return new VialModel(vialId(type), opts);
}

class VialModel {
  constructor(type, opts) {
    this.type = type;
    this.def = VIALS[type];
    this.product = this.def.product ?? 'testTube';
    this.opts = opts;
    this.root = new THREE.Group();
    this.root.name = 'vial:' + type;
    this.body = new THREE.Group();
    this.root.add(this.body);
    this.t = Math.random() * 10;
    this.shakeK = 0;
    this.rumble = 0;
    this.sq = 0;
    this.sqV = 0;
    this.glow = 0;
    this.glowTarget = 0;
    this.glowColor = new THREE.Color(opts.glowColor ?? this.def.liquid);
    this.opened = false;
    this.disposables = [];
    if (this.product === 'testTube') this.buildTube();
    else this.buildBox();
    this.root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(this.body);
    this.height = box.max.y;
    this.width = box.max.x - box.min.x;
    this.depth = box.max.z - box.min.z;
    this.applyGlow();
  }

  mat(m) {
    this.disposables.push(m);
    return m;
  }

  // ------------------------------------------------------------------ tube
  buildTube() {
    const g = geos(this.type);
    const def = this.def;
    const chrome = !!def.chrome;
    const gm = glassMats();
    const puck = makeMesh(g.puck, Mats.toyGlossPair);
    puck.receiveShadow = true;
    this.body.add(puck);
    // liquid (smooth, translucent, emissive with the glow)
    const lg = new THREE.CylinderGeometry(TUBE.liqR, TUBE.liqR, 1, 20, 1);
    lg.translate(0, 0.5, 0);
    this.liqMat = this.mat(new THREE.MeshStandardMaterial({ color: def.liquid, emissive: def.liquid, emissiveIntensity: 0.25, transparent: true, opacity: 0.78, roughness: 0.12, metalness: 0, depthWrite: false }));
    this.liquid = new THREE.Mesh(lg, this.liqMat);
    this.liquid.position.y = TUBE.liqBottom;
    this.liquid.renderOrder = 2;
    this.disposables.push(lg);
    this.body.add(this.liquid);
    // bag + silhouettes inside
    this.bag = makeMesh(g.bag, Mats.toyPair);
    this.bag.position.y = TUBE.puckTop - 0.02;
    this.body.add(this.bag);
    this.sils = [];
    for (let i = 0; i < 3; i++) {
      const s = makeMesh(g.sil, Mats.toyPair);
      s.visible = false;
      s.scale.setScalar(0.8 + i * 0.1);
      this.body.add(s);
      this.sils.push(s);
    }
    // foam column
    this.foam = makeMesh(g.foam, Mats.toyPair);
    this.foam.visible = false;
    this.body.add(this.foam);
    this.overflowMesh = makeMesh(g.over, Mats.toyPair);
    this.overflowMesh.visible = false;
    this.overflowMesh.position.y = TUBE.glassTop - 0.08;
    this.body.add(this.overflowMesh);
    // glass (outer + inner wall) and a highlight strip
    const pts = [
      new THREE.Vector2(TUBE.glassR - 0.01, TUBE.puckTop - 0.02), new THREE.Vector2(TUBE.glassR, TUBE.puckTop), new THREE.Vector2(TUBE.glassR, TUBE.glassTop - 0.06),
      new THREE.Vector2(TUBE.glassR + 0.02, TUBE.glassTop - 0.04), new THREE.Vector2(TUBE.glassR + 0.02, TUBE.glassTop), new THREE.Vector2(TUBE.glassR - 0.03, TUBE.glassTop),
    ];
    const glassGeo = new THREE.LatheGeometry(pts, 28);
    this.disposables.push(glassGeo);
    const glassOuter = new THREE.Mesh(glassGeo, gm.glass);
    const glassInner = new THREE.Mesh(glassGeo, gm.inner);
    glassOuter.renderOrder = 4;
    glassInner.renderOrder = 1;
    this.body.add(glassInner, glassOuter);
    const hiGeo = new THREE.PlaneGeometry(0.045, TUBE.glassTop - TUBE.puckTop - 0.25);
    this.disposables.push(hiGeo);
    const hi = new THREE.Mesh(hiGeo, gm.hi);
    hi.position.set(-TUBE.glassR * 0.55, (TUBE.glassTop + TUBE.puckTop) / 2 + 0.05, TUBE.glassR * 0.84);
    hi.rotation.y = -0.55;
    hi.renderOrder = 5;
    this.body.add(hi);
    // label wrap
    const label = makeMesh(g.label, Mats.toyPair);
    this.body.add(label);
    // cap (group so it can unscrew + fly)
    this.capGroup = new THREE.Group();
    this.capGroup.position.y = TUBE.capY;
    this.capMesh = makeMesh(g.cap, chrome ? variantMaterials('chrome') : Mats.toyGlossPair);
    this.capGroup.add(this.capMesh);
    this.body.add(this.capGroup);
    // inner glow light
    if (!this.opts.thumb) {
      this.light = new THREE.PointLight(this.glowColor, 0, 2.6, 2);
      this.light.position.y = 1.0;
      this.body.add(this.light);
    }
    this.fill = 0;
    this.fillMix = 1;
    this.foamK = 0;
    this.overK = 0;
    this.overflow(0);
    if (this.opts.thumb || this.opts.filled) this.setFill(0.62, 1);
    else this.setFill(0, 0);
  }

  /** Tube: liquid level 0..1 and colour mix (0 = clear water, 1 = vial liquid). */
  setFill(level, mix = this.fillMix) {
    if (!this.liquid) return;
    this.fill = Math.max(0, Math.min(1, level));
    this.fillMix = mix;
    const h = (TUBE.liqTop - TUBE.liqBottom) * this.fill;
    this.liquid.visible = h > 0.005;
    this.liquid.scale.y = Math.max(0.001, h);
    const c = new THREE.Color(0xa8dcff).lerp(new THREE.Color(this.def.liquid), mix);
    this.liqMat.color.copy(c);
    this.liqMat.emissive.copy(c);
    this.liqMat.opacity = 0.45 + 0.35 * mix;
    this.layoutFoam();
  }
  /** Tube: foam 0..1 (rises from the liquid to the top of the tube). */
  setFoam(k) {
    this.foamK = Math.max(0, Math.min(1, k));
    this.layoutFoam();
  }
  layoutFoam() {
    if (!this.foam) return;
    const surface = TUBE.liqBottom + (TUBE.liqTop - TUBE.liqBottom) * this.fill;
    const room = Math.max(0, TUBE.glassTop - 0.02 - surface);
    const h = room * this.foamK;
    this.foam.visible = h > 0.02;
    this.foam.scale.set(1, Math.max(0.05, h / (7 * V)), 1);
    this.foam.position.y = surface - 0.02;
  }
  /** Tube: grow the foam dome out of the open tube (0..1). */
  overflow(k) {
    if (!this.overflowMesh) return;
    this.overK = k;
    this.overflowMesh.visible = k > 0.02;
    this.overflowMesh.scale.set(0.6 + k * 0.5, Math.max(0.05, k), 0.6 + k * 0.5);
  }
  /** Tube: the paper bag dissolves, mystery silhouettes appear. */
  dissolve(dur = 0.9) {
    if (!this.bag || !this.bag.visible) return Promise.resolve();
    const b = this.bag;
    return animate(dur, (e) => {
      b.scale.set(1 - e * 0.9 + Math.sin(e * 30) * 0.04 * (1 - e), 1 - e * 0.95, 1 - e * 0.9);
      b.rotation.y = e * 2.5;
    }, { ease: 'inQuad', onComplete: () => { b.visible = false; for (const s of this.sils) s.visible = true; } }).promise;
  }

  // ------------------------------------------------------------------ boxes
  buildBox() {
    const g = geos(this.type);
    const d = g.dims;
    this.dims = d;
    const gold = this.product === 'cashCase';
    const shellMats = gold ? variantMaterials('gold') : Mats.toyGlossPair;
    const body = makeMesh(g.body, shellMats);
    body.receiveShadow = true;
    this.body.add(body);
    this.lid = new THREE.Group();
    this.lid.position.set(0, d.hingeY * V, d.hingeZ * V);
    const lidMesh = makeMesh(g.lid, shellMats);
    lidMesh.receiveShadow = true;
    this.lid.add(lidMesh);
    this.body.add(this.lid);
    this.latches = d.latches.map(([x, y, z]) => {
      const m = makeMesh(g.latch, Mats.toyGlossPair);
      const grp = new THREE.Group();
      grp.position.set((x + 0.5) * V, y * V, (z + 1.5) * V);
      grp.add(m);
      this.body.add(grp);
      grp.userData.open = false;
      return grp;
    });
    this.latchCount = this.latches.length;
    // window glass
    if (d.window) {
      const [x0, x1, y0, y1, z] = d.window;
      const gm = glassMats();
      const wg = new THREE.PlaneGeometry((x1 - x0 + 1) * V, (y1 - y0 + 1) * V);
      this.disposables.push(wg);
      const w = new THREE.Mesh(wg, gm.window);
      w.position.set(((x0 + x1 + 1) / 2) * V, ((y0 + y1 + 1) / 2) * V, z * V - 0.004);
      w.renderOrder = 3;
      this.body.add(w);
      const hg = new THREE.PlaneGeometry(0.03, (y1 - y0 + 1) * V * 0.8);
      this.disposables.push(hg);
      const hl = new THREE.Mesh(hg, gm.hi);
      hl.position.set((x0 + 3) * V, ((y0 + y1 + 1) / 2) * V, z * V);
      hl.rotation.z = -0.25;
      hl.renderOrder = 4;
      this.body.add(hl);
    }
    // light spilling out: cavity glow plane + a seam ring around the lid line
    const c = d.cav;
    this.glowMat = this.mat(glowMaterial(this.glowColor));
    const pg = new THREE.PlaneGeometry((c.x1 - c.x0 + 1) * V, (c.z1 - c.z0 + 1) * V);
    this.disposables.push(pg);
    const plane = new THREE.Mesh(pg, this.glowMat);
    plane.rotation.x = -Math.PI / 2;
    plane.position.set(((c.x0 + c.x1 + 1) / 2) * V, (c.top + 0.6) * V, ((c.z0 + c.z1 + 1) / 2) * V);
    plane.renderOrder = 6;
    this.body.add(plane);
    this.seamMat = this.mat(glowMaterial(this.glowColor));
    const W = (d.W1 - d.W0 + 1) * V + 0.03, D = (d.D1 - d.D0 + 1) * V + 0.03, th = 0.022;
    const seamY = d.hingeY * V;
    for (const [sx, sz, px, pz] of [[W, th, 0, D / 2], [W, th, 0, -D / 2], [th, D, W / 2, 0], [th, D, -W / 2, 0]]) {
      const sg = new THREE.BoxGeometry(sx, th, sz);
      this.disposables.push(sg);
      const s = new THREE.Mesh(sg, this.seamMat);
      s.position.set(px, seamY, pz);
      s.renderOrder = 6;
      this.body.add(s);
    }
    this.mouthLocal = new THREE.Vector3(((c.x0 + c.x1 + 1) / 2) * V, (c.top + 1) * V, ((c.z0 + c.z1 + 1) / 2) * V);
    if (!this.opts.thumb) {
      this.light = new THREE.PointLight(this.glowColor, 0, 3.2, 2);
      this.light.position.set(0, (c.top + 4) * V, 0);
      this.body.add(this.light);
    }
    this.lidOpen = 0;
  }

  /** Box: pop latch i (a quick flip + rattle). */
  unlatch(i) {
    const l = this.latches?.[i];
    if (!l || l.userData.open) return Promise.resolve();
    l.userData.open = true;
    return animate(0.28, (e) => (l.rotation.x = 1.35 * e), { ease: 'outBack' }).promise;
  }

  // ------------------------------------------------------------------ common
  /** Landing squash (impact from above). */
  squash(amount = 0.5) {
    this.sqV -= amount * 6;
  }
  /** Kick the model (taps, impacts): a wobble that decays + a squash. */
  shake(amount = 0.5) {
    this.shakeK = Math.min(1.6, this.shakeK + amount);
    this.sqV += amount * 3.2;
  }
  /** Continuous trembling (anticipation) 0..1. */
  setRumble(k) {
    this.rumble = k;
  }
  setGlow(k) {
    this.glowTarget = Math.max(0, k);
  }
  setGlowColor(hex) {
    this.glowColor.set(hex);
    this.applyGlow();
  }
  applyGlow() {
    const k = this.glow;
    if (this.light) {
      this.light.color.copy(this.glowColor);
      this.light.intensity = k * (this.product === 'testTube' ? 5 : 9);
    }
    if (this.liqMat) this.liqMat.emissiveIntensity = 0.22 + k * 0.9;
    if (this.glowMat) {
      this.glowMat.color.copy(this.glowColor).multiplyScalar(1.4 + k * 1.2);
      this.glowMat.opacity = Math.min(1, k * (0.35 + this.lidOpen * 0.65));
    }
    if (this.seamMat) {
      this.seamMat.color.copy(this.glowColor).multiplyScalar(2.2);
      this.seamMat.opacity = this.lidOpen > 0.05 ? 0 : Math.min(1, k * 1.2);
    }
  }

  /** World position the contents emerge from. */
  mouth(out = new THREE.Vector3()) {
    if (this.product === 'testTube') out.set(0, TUBE.glassTop + 0.05, 0);
    else out.copy(this.mouthLocal);
    return this.body.localToWorld(out);
  }

  /** Pop the vial open. Resolves at the burst moment (the cap/lid keeps moving). */
  open() {
    if (this.opened) return Promise.resolve();
    this.opened = true;
    if (this.product === 'testTube') {
      const cg = this.capGroup;
      return new Promise((resolve) => {
        // unscrew...
        animate(0.32, (e) => {
          cg.rotation.y = -e * Math.PI * 3;
          cg.position.y = TUBE.capY + e * 0.06;
        }, {
          ease: 'inQuad',
          onComplete: () => {
            resolve();
            // ...POP: the cap flies off spinning
            const vx = (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.6);
            const y0 = cg.position.y;
            animate(1.1, (e, k) => {
              cg.position.set(vx * k * 1.6, y0 + k * 3.4 - k * k * 4.2, -k * 1.4);
              cg.rotation.x = k * 9;
              cg.rotation.z = k * 6 * Math.sign(vx);
              cg.scale.setScalar(k > 0.8 ? 1 - (k - 0.8) / 0.2 : 1);
            }, { onComplete: () => (cg.visible = false) });
          },
        });
      });
    }
    // boxes: snap open any closed latch, then swing the lid
    const pending = this.latches.filter((l) => !l.userData.open).map((l, i) => new Promise((r) => setTimeout(() => this.unlatch(this.latches.indexOf(l)).then(r), i * 60)));
    return Promise.all(pending).then(() => new Promise((resolve) => {
      const target = this.product === 'cashCase' ? 1.85 : 1.95;
      animate(0.5, (e) => {
        this.lid.rotation.x = -target * e;
        this.lidOpen = Math.min(1, e);
        this.applyGlow();
      }, { ease: 'outBack' });
      setTimeout(resolve, 110);
    }));
  }

  update(dt) {
    this.t += dt;
    const t = this.t;
    this.shakeK = Math.max(0, this.shakeK - dt * 2.4);
    const s = Math.min(1.8, this.shakeK + this.rumble * 0.55);
    const tall = this.product === 'testTube' ? 1 : 0.55;
    this.body.rotation.z = (Math.sin(t * 47) * 0.09 + Math.sin(t * 23 + 1) * 0.04) * s * tall;
    this.body.rotation.x = Math.sin(t * 39 + 1) * 0.045 * s * tall;
    this.body.position.x = Math.sin(t * 53 + 2) * 0.03 * s;
    this.body.position.z = Math.sin(t * 29 + 3) * 0.015 * s;
    this.sqV += (-this.sq * 190 - this.sqV * 11) * dt;
    this.sq += this.sqV * dt;
    const q = Math.max(-0.25, Math.min(0.25, this.sq * 0.08));
    this.body.scale.set(1 - q * 0.5, 1 + q, 1 - q * 0.5);
    // glow eases towards its target, with a little life
    this.glow += (this.glowTarget - this.glow) * (1 - Math.exp(-dt * 6));
    const flick = this.glow > 0.02 ? 1 + Math.sin(t * 13) * 0.06 + Math.sin(t * 31) * 0.04 : 1;
    const g0 = this.glow;
    this.glow = g0 * flick;
    this.applyGlow();
    this.glow = g0;
    if (this.product === 'testTube') {
      // foam breathing, silhouettes swirling, cap rattling while trembling
      if (this.foam.visible) this.foam.rotation.y += dt * 0.6;
      if (this.overflowMesh.visible) {
        const b = 1 + Math.sin(t * 9) * 0.04;
        this.overflowMesh.scale.x = (0.6 + this.overK * 0.5) * b;
        this.overflowMesh.scale.z = (0.6 + this.overK * 0.5) * (2 - b);
      }
      const surface = TUBE.liqBottom + (TUBE.liqTop - TUBE.liqBottom) * this.fill;
      this.sils.forEach((m, i) => {
        if (!m.visible) return;
        const a = t * (0.9 + i * 0.25) + i * 2.1;
        m.position.set(Math.cos(a) * 0.1, TUBE.puckTop + 0.12 + ((Math.sin(t * 0.8 + i * 2) + 1) / 2) * Math.max(0, surface - TUBE.puckTop - 0.45), Math.sin(a) * 0.1);
        m.rotation.y = -a;
      });
      if (!this.opened) {
        this.capGroup.position.y = TUBE.capY + Math.abs(Math.sin(t * 41)) * 0.025 * Math.min(1, s);
        this.capGroup.rotation.y = Math.sin(t * 33) * 0.08 * s;
      }
    } else if (this.lidOpen === 0) {
      this.lid.rotation.x = -Math.abs(Math.sin(t * 37)) * 0.05 * Math.min(1, s);
      for (const l of this.latches) if (!l.userData.open) l.rotation.x = Math.abs(Math.sin(t * 43 + l.position.x * 9)) * 0.12 * Math.min(1, s);
    }
  }

  dispose() {
    for (const d of this.disposables) d.dispose?.();
    this.disposables.length = 0;
  }
}

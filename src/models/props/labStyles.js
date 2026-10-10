// Battle Lab building styles. Each builder returns a canonical description
// (front faces +X, detailed facade on +Z, voxel units) consumed by lab.js.
// `m` = mirror flag: text is drawn mirror-imaged so that it reads correctly
// after the whole building is mirrored for the enemy side.
import { VoxGrid, PAL, shade, mixHex, hash3, vnoise, ring, text, checker, hazardC, stripesY } from './common.js';
import {
  panelBox, windowZ, windowX, barrel, crate, hazard, dishGrid, antennaGrid, flagGrid, pipe, vaultDoor, cartGrid,
  productBox, signZ, boltEmblem,
} from './labParts.js';

const PRODUCT_COLS = [PAL.red, PAL.yellow, PAL.blue, PAL.green, PAL.pink, PAL.orange, PAL.purple, 0xffffff, PAL.cyan];

/** Generic flag (pole + cloth). Returns { pole: grid, cloth: grid, clothAt } */
function flagParts(h, w, fh, fill, poleCol = PAL.metalL, knob = PAL.gold) {
  const pole = new VoxGrid();
  pole.box(0, 0, 0, 0, h, 0, poleCol).set(0, h + 1, 0, knob);
  const cloth = flagGrid(w, fh, fill);
  return { pole, cloth, clothY: h - fh + 1 };
}

const SPARKS = [[-15.5, 20, 13.6], [-1, 26, 13.6], [16.6, 12, 7], [11, 29, 13.6], [-7, 6, 13.6], [16.6, 24, -8]];

// ---------------------------------------------------------------------------
function sDefault(m) {
  const b = new VoxGrid();
  // plinth
  b.box(-22, 0, -14, 17, 1, 14, PAL.metalDD);
  b.box(-22, 2, -14, 17, 2, 14, (x, y, z) => ((x + z) % 6 === 0 ? PAL.metalDD : PAL.metalD));
  hazard(b, -22, 2, 13, 17, 2, 14);
  hazard(b, 16, 2, -14, 17, 2, 14);
  for (let x = -21; x <= 16; x += 3) b.set(x, 1, 14, PAL.blueL, true);
  for (let z = -13; z <= 13; z += 3) b.set(17, 1, z, PAL.blueL, true);
  // ramp toward battlefield
  b.box(18, 0, -6, 19, 1, 5, PAL.metalD);
  b.box(20, 0, -6, 21, 0, 5, PAL.metalD);
  for (let z = -6; z <= 5; z += 2) b.set(19, 1, z, PAL.yellow).set(21, 0, z, PAL.yellow);
  // tank pad
  b.cylinder(10, 18, 0, 2, 6, PAL.metalD);
  ring(b, 10, 18, 2, 2, 6, PAL.yellow);
  for (let a = 0; a < 10; a++) {
    const t = (a / 10) * Math.PI * 2;
    b.set(Math.round(10 + Math.cos(t) * 6.4), 1, Math.round(18 + Math.sin(t) * 6.4), PAL.blueL, true);
  }
  // main block
  panelBox(b, -20, 3, -12, 15, 30, 12);
  b.box(-20, 3, -12, 15, 4, 12, (x, y, z) => (y === 4 ? PAL.metal : PAL.metalD));
  b.box(-20, 28, -12, 15, 28, 12, PAL.blue);
  b.box(-20, 29, -12, 15, 30, 12, (x, y, z) => ((x + z) % 4 === 0 && y === 29 ? PAL.pinkL : PAL.pink));
  // roof
  b.box(-20, 31, -12, 15, 31, 12, checker(PAL.metalD, shade(PAL.metalD, -0.12), 3));
  b.box(-20, 32, -12, -20, 33, 12, PAL.white2);
  b.box(-20, 32, -12, 15, 33, -12, PAL.white2);
  b.box(-20, 32, 12, 7, 33, 12, PAL.white2);
  b.box(-20, 34, -12, -20, 34, 12, PAL.pink).box(-20, 34, -12, 15, 34, -12, PAL.pink).box(-20, 34, 12, 7, 34, 12, PAL.pink);
  hazard(b, 15, 31, -12, 15, 31, 12);
  // seat cushion
  b.box(9, 32, -3, 14, 32, 2, PAL.pink).box(10, 33, -2, 13, 33, 1, PAL.pinkL);

  // facade: door
  b.box(-19, 4, 13, -13, 14, 13, PAL.pink);
  b.box(-18, 5, 13, -14, 13, 13, null);
  b.box(-18, 5, 12, -14, 13, 12, (x, y) => (y % 3 === 0 ? PAL.metal : PAL.metalD));
  b.box(-17, 10, 12, -15, 12, 12, PAL.blueL, true);
  b.box(-19, 3, 13, -13, 4, 15, PAL.metal);
  b.set(-12, 9, 13, PAL.slime, true).set(-12, 8, 13, PAL.ink).set(-12, 10, 13, PAL.ink);
  // emblem + sign + windows
  boltEmblem(b, -6, 9, 13, { r: 4 });
  signZ(b, 'BEAST', -9, 15, 13, { board: 0x1b2440, color: PAL.pink, pad: 1, mirror: m });
  b.box(-20, 14, 13, 1, 14, 13, PAL.white2).box(-20, 22, 13, 1, 22, 13, PAL.white2);
  windowZ(b, -18, 24, -1, 26, 12, { mull: 5, frame: PAL.white2, glass: PAL.blueL, shine: true });
  // vent grilles behind the tank
  for (let y = 6; y <= 12; y += 2) b.box(6, y, 13, 14, y, 13, PAL.metalDD);

  // front face: blast door
  hazard(b, 16, 3, -7, 16, 19, 6);
  b.box(16, 3, -5, 16, 17, 4, null);
  b.box(15, 3, -5, 15, 17, 4, (x, y) => (y % 3 === 0 ? PAL.metal : PAL.metalD));
  b.box(15, 9, -5, 15, 10, 4, PAL.ink).box(15, 9, -1, 15, 10, 0, PAL.yellow);
  b.box(16, 20, -4, 16, 20, 3, PAL.pinkL, true);
  windowX(b, -10, 22, -6, 26, 15, { frame: PAL.white2 });
  windowX(b, 5, 22, 9, 26, 15, { frame: PAL.white2 });

  // pipes (stage 2)
  const pipes = new VoxGrid();
  pipe(pipes, 'x', -19, 10, 30, 14, PAL.metal, PAL.blue, 1, 6);
  pipe(pipes, 'z', 14, 18, 10, 30, PAL.metal, PAL.blue, 1, 4);
  pipe(pipes, 'y', 23, 30, 10, 18, PAL.metal, PAL.blue, 1, 7);
  pipe(pipes, 'y', 3, 29, -21, 13, PAL.metalL, PAL.pink, 0, 5);
  // vents (stage 2)
  const vents = new VoxGrid();
  vents.box(0, 32, -10, 6, 35, -5, (x, y, z) => (z === -5 && y % 2 === 0 && y < 35 ? PAL.metalDD : PAL.metal));
  ring(vents, 3, -8, 36, 36, 2, PAL.metalD);
  vents.box(3, 36, -8, 3, 36, -8, PAL.ink).box(2, 36, -8, 4, 36, -8, PAL.metalL);
  vents.box(-1, 32, 4, 4, 34, 9, PAL.white2).box(0, 35, 5, 3, 35, 8, PAL.metalD);
  for (let x = 0; x <= 3; x++) vents.set(x, 33, 10, x % 2 ? PAL.ink : PAL.metalD);
  vents.set(4, 35, 9, PAL.slime, true);
  // tower (stage 3)
  const tower = new VoxGrid();
  panelBox(tower, -16, 32, -10, -5, 40, 3);
  tower.box(-16, 39, -10, -5, 39, 3, PAL.blue);
  tower.box(-17, 41, -11, -4, 42, 4, PAL.pink);
  tower.box(-15, 43, -9, -6, 43, 2, PAL.metalD);
  windowZ(tower, -14, 34, -7, 37, 3, { mull: 3, frame: PAL.white2, glass: PAL.cyan, shine: true });
  windowX(tower, -8, 34, -2, 37, -5, { frame: PAL.white2 });
  // antenna (stage 1)
  const antenna = new VoxGrid().merge(antennaGrid(18), -18, 32, 9);
  // clutter (stage 3)
  const clutter = new VoxGrid();
  barrel(clutter, -10, 0, 18, PAL.blue, { hazard: true });
  barrel(clutter, -5, 0, 19, PAL.yellow, { h: 6 });
  barrel(clutter, -7, 6, 18, PAL.pink, { h: 5, r: 1, glow: PAL.slime });
  crate(clutter, -25, 0, 13, 5);
  crate(clutter, -24, 5, 14, 3, PAL.woodL);

  return {
    body: b,
    chunks: [
      { name: 'antenna', grid: antenna, stage: 1 },
      { name: 'vents', grid: vents, stage: 2 },
      { name: 'pipes', grid: pipes, stage: 2 },
      { name: 'tower', grid: tower, stage: 3 },
      { name: 'clutter', grid: clutter, stage: 3 },
    ],
    anims: [{ type: 'spin', grid: dishGrid({ r: 6 }), at: [-10.5, 44, -3.5], stage: 2, speed: 0.8 }],
    beacons: [{ at: [-17.5, 51, 9.5], color: 0xff3040, stage: 1 }, { at: [16.5, 21, 7.5], color: PAL.yellow, stage: 3 }],
    core: { at: [10.5, 3, 18.5], frame: PAL.white, frameD: PAL.metalD, trim: PAL.pink },
    gauge: { x: 1, frame: PAL.metalDD },
    seat: [12.6, 34, -0.5],
    fires: [[-12, 32, 6], [3, 36, -7], [10, 32, 8]],
    sparks: [[-17.5, 20, 13.6], [-1, 26, 13.6], [16.6, 12, 7], [-3, 29, 13.6], [-9, 6, 13.6], [16.6, 24, -8]],
    rubble: [PAL.white, PAL.white2, PAL.metal, PAL.metalD, PAL.pink, PAL.blue, PAL.seam],
  };
}

// ---------------------------------------------------------------------------
function sMansion(m) {
  const b = new VoxGrid();
  const marble = (x, y, z) => (vnoise(x * 0.3, y * 0.3, z * 0.3) < 0.36 ? PAL.white2 : PAL.white);
  b.box(-21, 0, -15, 19, 0, 15, PAL.creamD);
  b.box(-20, 1, -14, 18, 2, 14, (x, y, z) => (y === 2 && (x === -20 || x === 18 || z === -14 || z === 14) ? PAL.gold : marble(x, y, z)));
  // steps up to vault door with red carpet
  b.box(19, 0, -6, 20, 1, 5, marble).box(21, 0, -6, 22, 0, 5, marble);
  b.box(19, 1, -4, 20, 1, 3, PAL.red).box(21, 0, -4, 22, 0, 3, PAL.red);
  b.box(13, 2, -4, 18, 2, 3, PAL.red);
  // walls
  b.box(-17, 3, -11, 15, 24, 11, (x, y, z) => {
    const onZ = Math.abs(z) === 11, onX = x === -17 || x === 15;
    const u = onZ ? x + 17 : z + 11;
    if (y <= 4) return PAL.creamD;
    if (y === 21) return PAL.gold;
    if (y >= 22) return (y === 23 && u % 2 === 0) ? PAL.creamD : PAL.cream;
    if ((onZ || onX) && (u % 8 === 0 || u % 8 === 1)) return mixHex(PAL.cream, PAL.creamD, 0.6);
    return PAL.cream;
  });
  // roof
  b.box(-18, 25, -12, 16, 25, 12, (x, y, z) => ((x + z) % 3 === 0 ? 0x8a2a3a : 0xa83246));
  for (let x = -18; x <= 16; x += 2) {
    b.box(x, 26, -12, x, 27, -12, PAL.cream);
    if (x < 6) b.box(x, 26, 12, x, 27, 12, PAL.cream);
  }
  for (let z = -12; z <= 12; z += 2) b.box(-18, 26, z, -18, 27, z, PAL.cream);
  b.box(-18, 28, -12, 16, 28, -12, PAL.gold).box(-18, 28, -12, -18, 28, 12, PAL.gold).box(-18, 28, 12, 6, 28, 12, PAL.gold);
  b.box(16, 25, -12, 16, 25, 12, PAL.gold);
  // velvet seat cushion
  b.box(9, 26, -3, 14, 26, 2, PAL.gold).box(10, 27, -2, 13, 27, 1, 0xc0203a);
  // facade windows (arched, warm glow) behind columns
  const warm = 0xffe08a;
  for (const wx of [-12, -7, -2, 3, 8]) {
    windowZ(b, wx, 7, wx + 1, 15, 11, { frame: PAL.gold, glass: warm });
    b.set(wx, 16, 12, PAL.gold).set(wx + 1, 16, 12, PAL.gold);
    windowZ(b, wx, 18, wx + 1, 19, 11, { frame: PAL.creamD, glass: warm });
  }
  // portico: columns, entablature, pediment
  const port = new VoxGrid();
  for (const cx of [-15, -10, -5, 0]) {
    port.cylinder(cx, 14, 5, 20, 1, (x, y, z) => ((x + z) % 2 === 0 ? PAL.white : PAL.white2));
    port.box(cx - 2, 3, 12, cx + 2, 4, 16, PAL.white2);
    port.box(cx - 2, 21, 12, cx + 2, 22, 16, PAL.gold);
  }
  port.box(-17, 23, 12, 2, 24, 16, (x, y) => (y === 23 ? PAL.gold : PAL.cream));
  for (let i = 0; i <= 7; i++) {
    const x0 = -17 + Math.round(i * 1.35), x1 = 2 - Math.round(i * 1.35);
    if (x1 < x0) break;
    port.box(x0, 25 + i, 12, x1, 25 + i, 16, PAL.cream);
    port.set(x0, 25 + i, 16, PAL.gold).set(x1, 25 + i, 16, PAL.gold).set(x0, 25 + i, 17, PAL.gold).set(x1, 25 + i, 17, PAL.gold);
  }
  port.box(-17, 25, 17, 2, 25, 17, PAL.gold);
  text(port, '$', -7, 27, 17, '+z', PAL.goldL, { center: true, mirror: m, glow: true });
  // front: money vault door
  b.box(16, 3, -10, 16, 20, 9, PAL.creamD);
  b.box(16, 3, -9, 16, 19, 8, PAL.gold);
  vaultDoor(b, '+x', 0, 11, 17, 7);
  windowX(b, -10, 14, -9, 19, 15, { frame: PAL.gold, glass: warm });
  windowX(b, 8, 14, 9, 19, 15, { frame: PAL.gold, glass: warm });
  // gold planters
  const clutter = new VoxGrid();
  for (const z of [-11, 11]) {
    clutter.cylinder(20, z, 0, 3, 2, PAL.gold).cylinder(20, z, 4, 4, 3, PAL.goldD);
    clutter.ellipsoid(20, 7, z, 3, 3, 3, (x, y, zz) => (hash3(x, y, zz) < 0.3 ? PAL.grassD : PAL.grass));
  }
  for (const x of [-19, -14]) {
    clutter.cylinder(x, 17, 0, 2, 2, PAL.gold);
    clutter.ellipsoid(x, 5, 17, 2.5, 3, 2.5, (xx, y, zz) => (hash3(xx, y, zz) < 0.3 ? PAL.grassD : PAL.grass));
  }
  // lab tower (back)
  const tower = new VoxGrid();
  panelBox(tower, -17, 26, -11, -9, 40, -3, { c1: PAL.white, c2: PAL.white2 });
  for (let y = 29; y <= 38; y += 3) tower.box(-16, y, -2, -10, y, -2, PAL.cyan, true);
  tower.box(-18, 41, -12, -8, 41, -2, PAL.gold);
  tower.ellipsoid(-13, 42, -7, 4, 4, 4, (x, y, z) => ((x + y + z) % 3 === 0 ? PAL.blueL : PAL.sky));
  tower.carve((x, y, z) => y < 42 && z > -12 && z < -2 && x > -18 && x < -8 && y > 41);
  windowX(tower, -9, 30, -5, 37, -9, { frame: PAL.gold, glass: PAL.cyan });
  // dish + flag
  const fl = flagParts(10, 9, 6, (x, y) => (x >= 3 && x <= 5 && y >= 1 && y <= 4 ? PAL.gold : PAL.pink));
  text(fl.cloth, '$', 4, 1, 1, '+z', PAL.goldL, { center: true, mirror: m });
  const flagPole = new VoxGrid().merge(fl.pole, -13, 46, -7);
  return {
    body: b,
    chunks: [
      { name: 'portico', grid: port, stage: 3 },
      { name: 'flagpole', grid: flagPole, stage: 1 },
      { name: 'tower', grid: tower, stage: 2 },
      { name: 'clutter', grid: clutter, stage: 3 },
    ],
    anims: [
      { type: 'spin', grid: dishGrid({ r: 5, rim: PAL.gold, tip: PAL.gold }), at: [3.5, 26, -6.5], stage: 2, speed: 0.6 },
      { type: 'flag', grid: fl.cloth, at: [-12.5, 46 + fl.clothY, -6.5], stage: 1 },
    ],
    beacons: [{ at: [-12.5, 58, -6.5], color: PAL.gold, stage: 1 }],
    core: { at: [6.5, 3, 18.5], frame: PAL.gold, frameD: PAL.goldD, trim: PAL.white },
    gauge: { x: 12, frame: PAL.goldDD },
    seat: [12.6, 28, -0.5],
    fires: [[-6, 26, 4], [4, 26, -4], [-13, 26, 8]],
    sparks: [[-15.5, 18, 12.6], [-1, 12, 12.6], [17.6, 12, 7], [11, 22, 12.6], [17.6, 20, -6]],
    rubble: [PAL.cream, PAL.creamD, PAL.white, PAL.gold, 0xa83246, PAL.white2],
  };
}

// ---------------------------------------------------------------------------
function storeWindow(b, x0, y0, x1, y1, z) {
  // glass with shelves of products visible behind
  b.box(x0 - 1, y0 - 1, z + 1, x1 + 1, y1 + 1, z + 1, PAL.white2);
  b.box(x0, y0, z + 1, x1, y1, z + 1, null);
  b.box(x0, y0, z, x1, y1, z, (x, y) => {
    const ry = (y - y0) % 4;
    if (ry === 0) return 0xdfe8f2;
    if (ry === 3) return 0xe9fbff;
    const c = PRODUCT_COLS[Math.floor(hash3(x >> 1, y >> 2, 3) * PRODUCT_COLS.length)];
    return hash3(x, y, 1) < 0.15 ? 0xe9fbff : mixHex(c, 0xffffff, 0.35);
  }, true);
  for (let x = x0 + 5; x < x1; x += 6) b.box(x, y0, z + 1, x, y1, z + 1, PAL.white2);
}
function awning(b, x0, x1, y, z, a = PAL.pink, c = 0xffffff) {
  for (let x = x0; x <= x1; x++) {
    const col = Math.floor((x - x0) / 2) % 2 ? a : c;
    b.box(x, y, z, x, y + 1, z, col).set(x, y, z + 1, col).set(x, y - 1, z + 2, col).set(x, y - 2, z + 2, (x - x0) % 2 ? null : col);
  }
}

function sMartLab(m) {
  const b = new VoxGrid();
  b.box(-20, 0, -15, 18, 1, 15, (x, y, z) => (y === 1 && (x === -20 || x === 18 || z === -15 || z === 15) ? PAL.yellow : PAL.asphalt));
  b.box(-20, 0, 15, 2, 1, 23, PAL.asphalt);
  b.box(-20, 1, 23, 2, 1, 23, PAL.yellow);
  for (let x = -19; x <= 1; x += 7) b.box(x, 1, 16, x, 1, 22, 0xffffff);
  b.cylinder(6, 18, 0, 1, 6, PAL.asphalt);
  ring(b, 6, 18, 1, 1, 6, PAL.yellow);
  // building
  const stripes = stripesY([PAL.pink, PAL.pink, PAL.yellow, PAL.yellow, PAL.blue, PAL.blue, PAL.green, PAL.green], 1, 17);
  b.box(-17, 2, -11, 15, 24, 11, (x, y, z) => {
    if (y <= 4) return ((x + z + y) & 1) ? PAL.red : PAL.redD;
    if (y >= 17) return stripes(x, y, z);
    return (Math.abs(z) === 11 ? (x + 17) : (z + 11)) % 6 === 0 ? PAL.white2 : PAL.white;
  });
  b.box(-17, 25, -11, 15, 25, 11, PAL.metalD);
  b.box(-18, 25, -12, 16, 26, -12, PAL.pink).box(-18, 25, 12, 16, 26, 12, PAL.pink).box(-18, 25, -12, -18, 26, 12, PAL.pink);
  // seat
  b.box(9, 26, -3, 14, 26, 2, PAL.yellow).box(10, 27, -2, 13, 27, 1, PAL.pink);
  // facade store windows + awning
  storeWindow(b, -16, 6, -1, 13, 11);
  awning(b, -17, 0, 15, 12);
  // door on facade
  b.box(-1, 2, 12, 3, 11, 12, PAL.red);
  b.box(0, 2, 12, 2, 10, 12, null);
  b.box(0, 2, 11, 2, 10, 11, 0xcff4ff, true);
  // front: automatic sliding doors
  b.box(16, 2, -7, 16, 14, 6, PAL.red);
  b.box(16, 2, -6, 16, 13, 5, null);
  b.box(15, 2, -6, 15, 13, 5, (x, y, z) => (z === 0 || z === -1 ? PAL.metal : 0xcff4ff), true);
  b.box(16, 15, -9, 16, 21, 8, PAL.ink);
  text(b, 'OPEN', 17, 16, 0, '+x', PAL.slime, { center: true, mirror: m, glow: true });
  windowX(b, -9, 6, -8, 12, 15, { frame: PAL.white2, glass: 0xcff4ff });
  windowX(b, 8, 6, 9, 12, 15, { frame: PAL.white2, glass: 0xcff4ff });
  // big MART billboard (stage 2)
  const sign = new VoxGrid();
  sign.box(-18, 27, 10, 17, 28, 11, PAL.metalD);
  for (const x of [-14, -1, 13]) sign.box(x, 25, 10, x, 28, 10, PAL.metal);
  signZ(sign, 'MART', 0, 29, 11, { scale: 2, sy: 2, board: 0xffffff, color: PAL.pink, pad: 2, frame: PAL.pink, mirror: m, depth: 2 });
  for (let x = -17; x <= 16; x += 3) sign.set(x, 43, 11, PAL.yellow, true);
  // cart corral (stage 3)
  const corral = new VoxGrid();
  for (const z of [14, 22]) {
    corral.box(-19, 2, z, -5, 2, z, PAL.metalL);
    corral.box(-19, 6, z, -5, 6, z, PAL.red);
    for (let x = -19; x <= -5; x += 4) corral.box(x, 2, z, x, 6, z, PAL.metal);
  }
  corral.box(-19, 2, 14, -19, 6, 22, PAL.metal).box(-19, 6, 14, -19, 6, 22, PAL.red);
  const cg = cartGrid({ full: true });
  corral.merge(cg, -12, 3, 18).merge(cartGrid(), -8, 3, 18);
  for (const x of [-15, -9, -5]) corral.set(x, 2, 16, PAL.ink).set(x, 2, 20, PAL.ink);
  // roof lab gear (stage 2)
  const gear = new VoxGrid();
  gear.box(-14, 26, -9, -6, 29, -3, PAL.metalL).box(-13, 30, -8, -7, 30, -4, PAL.metalD);
  ring(gear, -10, -6, 31, 31, 2, PAL.metal);
  gear.ellipsoid(2, 26, -6, 4, 4, 4, (x, y, z) => ((x + y) % 3 === 0 ? PAL.white2 : PAL.white));
  gear.carve((x, y, z) => y < 26);
  gear.box(1, 28, -2, 3, 29, -2, PAL.cyan, true);
  return {
    body: b,
    chunks: [
      { name: 'sign', grid: sign, stage: 2 },
      { name: 'corral', grid: corral, stage: 3 },
      { name: 'gear', grid: gear, stage: 1 },
    ],
    anims: [{ type: 'spin', grid: dishGrid({ r: 4, rim: PAL.yellow, tip: PAL.pink }), at: [-9.5, 32, -5.5], stage: 1, speed: 1 }],
    beacons: [{ at: [2.5, 31, -5.5], color: PAL.pink, stage: 2 }, { at: [-17.5, 44, 11.5], color: PAL.yellow, stage: 2 }],
    core: { at: [6.5, 2, 18.5], frame: PAL.white, frameD: PAL.red, trim: PAL.yellow },
    gauge: { x: 12, frame: PAL.ink },
    seat: [12.6, 28, -0.5],
    fires: [[-6, 26, 4], [6, 26, -6], [-15, 26, -4]],
    sparks: [[-15.5, 15, 13.6], [-1, 20, 12.6], [16.6, 12, 7], [11, 19, 12.6], [-8, 10, 13.6], [16.6, 20, -8]],
    rubble: [PAL.white, PAL.white2, PAL.pink, PAL.yellow, PAL.blue, PAL.red, PAL.green],
  };
}

// ---------------------------------------------------------------------------
function sMart(m) {
  const b = new VoxGrid();
  b.box(-20, 0, -15, 18, 1, 15, checker(0xf2f6fb, 0x9fd8ff, 3));
  b.box(-20, 0, 15, 18, 1, 23, checker(0xf2f6fb, 0x9fd8ff, 3));
  // fortress: stacked checkout tiers
  const laneCols = [PAL.red, PAL.blue, PAL.green, PAL.orange];
  b.box(-17, 2, -11, 15, 20, 11, (x, y, z) => {
    const tier = Math.floor((y - 2) / 6);
    const ty = (y - 2) % 6;
    if (ty === 5) return PAL.ink; // conveyor stripe
    if (ty === 4) return PAL.metalL;
    const u = Math.abs(z) === 11 ? x + 17 : z + 11;
    const lane = Math.floor(u / 8);
    if (u % 8 === 0) return PAL.metalD;
    return ty === 0 ? shade(laneCols[(lane + tier) % 4], -0.25) : laneCols[(lane + tier) % 4];
  });
  // conveyor belts sticking out on facade + registers
  for (let t = 0; t < 3; t++) {
    const y = 2 + t * 6 + 5;
    b.box(-17 + t * 2, y, 12, 9 - t * 2, y, 13 - t, (x) => (x % 2 ? PAL.ink : 0x2a2a34));
    b.box(-17 + t * 2, y - 1, 12, 9 - t * 2, y - 1, 13 - t, PAL.metal);
    for (let x = -14 + t * 2; x <= 6; x += 10) {
      b.box(x, y + 1, 11, x + 3, y + 2, 12, PAL.metalL);
      b.box(x, y + 3, 11, x + 3, y + 3, 11, PAL.slime, true);
      b.box(x + 1, y + 1, 13, x + 2, y + 1, 13, PAL.metalD);
    }
  }
  // crenellations (product crates)
  for (let x = -17; x <= 15; x += 4)
    for (const z of [-11, 11]) productBox(b, x, 21, z - (z > 0 ? 2 : 0), 3, 3, 3, PRODUCT_COLS[Math.floor(hash3(x, 1, z) * 9)]);
  for (let z = -7; z <= 7; z += 4) productBox(b, -17, 21, z, 3, 3, 3, PRODUCT_COLS[Math.floor(hash3(z, 2, 3) * 9)]);
  b.box(-16, 21, -10, 15, 21, 10, PAL.metalD);
  // seat
  b.box(9, 22, -3, 14, 22, 2, PAL.red).box(10, 23, -2, 13, 23, 1, PAL.yellow);
  // front gate (EXIT)
  hazard(b, 16, 2, -7, 16, 16, 6, PAL.red, 0xffffff);
  b.box(16, 2, -5, 16, 14, 4, null);
  b.box(15, 2, -5, 15, 14, 4, (x, y, z) => ((z + 10) % 3 === 0 ? PAL.metal : 0x2a2a34));
  text(b, 'EXIT', 17, 17, 0, '+x', PAL.red, { center: true, mirror: m, glow: true });
  b.box(17, 16, -8, 17, 23, 7, null);
  // register tower (stage 3)
  const tower = new VoxGrid();
  tower.box(-16, 22, -10, -5, 31, 1, (x, y, z) => ((y - 22) % 5 === 0 ? PAL.metalD : PAL.metalL));
  // giant cash register
  tower.box(-17, 32, -11, -4, 37, 2, PAL.white2);
  tower.box(-17, 32, 2, -4, 35, 4, PAL.metal);
  tower.box(-15, 33, 5, -6, 34, 5, PAL.cash).box(-15, 33, 5, -6, 33, 5, PAL.cashD);
  for (let x = -16; x <= -5; x++) for (let z = -9; z <= 1; z++) {
    const k = (x + z) & 1;
    tower.set(x, 38 + Math.floor((z + 9) / 4), z, k ? PAL.white : [PAL.red, PAL.yellow, PAL.green, PAL.blue][(x * 3 + z) & 3]);
  }
  tower.box(-14, 38, -11, -7, 47, -9, PAL.white2);
  tower.box(-13, 40, -8, -8, 46, -8, 0x103020);
  text(tower, '$', -10, 42, -7, '+z', PAL.slime, { center: true, mirror: m, glow: true });
  // price signs (stage 1)
  const signs = new VoxGrid();
  signs.box(1, 22, 9, 1, 33, 9, PAL.metal);
  signZ(signs, '$1', 1, 34, 9, { board: PAL.yellow, color: PAL.red, pad: 1, mirror: m, glow: false, frame: PAL.red });
  signs.box(-2, 22, -8, -2, 29, -8, PAL.metal);
  signZ(signs, 'SALE', -2, 30, -8, { board: PAL.red, color: 0xffffff, pad: 1, mirror: m, frame: PAL.yellow });
  // lane lights (stage 2)
  const lights = new VoxGrid();
  for (const [x, n] of [[-12, '1'], [-2, '2'], [8, '3']]) {
    lights.box(x, 22, 9, x, 26, 9, PAL.metal);
    lights.box(x - 2, 27, 8, x + 2, 33, 10, PAL.ink);
    text(lights, n, x, 28, 11, '+z', PAL.yellow, { center: true, mirror: m, glow: true });
  }
  return {
    body: b,
    chunks: [
      { name: 'signs', grid: signs, stage: 1 },
      { name: 'lights', grid: lights, stage: 2 },
      { name: 'tower', grid: tower, stage: 3 },
    ],
    anims: [],
    beacons: [{ at: [-10.5, 48, -9.5], color: PAL.slime, stage: 3 }, { at: [16.5, 18, -7.5], color: PAL.red, stage: 2 }],
    core: { at: [6.5, 2, 18.5], frame: PAL.metalL, frameD: PAL.red, trim: PAL.yellow },
    gauge: { x: 12, frame: PAL.ink },
    seat: [12.6, 24, -0.5],
    fires: [[-6, 22, 4], [6, 22, -6], [-2, 22, 8]],
    sparks: [[-15.5, 15, 12.6], [-1, 9, 14.6], [16.6, 10, 7], [11, 14, 12.6], [16.6, 18, -8]],
    rubble: [PAL.red, PAL.blue, PAL.green, PAL.orange, PAL.metalL, PAL.ink, PAL.yellow],
  };
}

// ---------------------------------------------------------------------------
const chocoFn = (u, y) => {
  const su = ((u % 5) + 5) % 5, sy = ((y % 5) + 5) % 5;
  if (su === 0 || sy === 0) return PAL.chocoD;
  if (su === 1 || sy === 4) return PAL.chocoL;
  return PAL.choco;
};
function sChoco(m) {
  const b = new VoxGrid();
  b.box(-20, 0, -15, 18, 2, 15, (x, y, z) => (y === 2 ? chocoFn(x, z) : PAL.chocoD));
  // walls of chocolate bars
  b.box(-17, 3, -11, 15, 27, 11, (x, y, z) => {
    const onZ = Math.abs(z) === 11;
    return chocoFn(onZ ? x + 17 : z + 11, y - 3);
  });
  // wrapper band (lower half) with torn foil edge
  const wrap = 0xff4fa3, wrapD = 0xc2185b;
  b.box(-18, 3, -12, 16, 13, 12, (x, y, z) => ((y === 3) ? wrapD : wrap));
  for (let x = -18; x <= 16; x++) for (const z of [-12, 12]) {
    const h = 14 + Math.floor(hash3(x, 1, z) * 3);
    for (let y = 14; y <= h; y++) b.set(x, y, z, 0xd8dde8);
  }
  for (let z = -12; z <= 12; z++) for (const x of [-18, 16]) {
    const h = 14 + Math.floor(hash3(x, 2, z) * 3);
    for (let y = 14; y <= h; y++) b.set(x, y, z, 0xd8dde8);
  }
  // label on wrapper facade
  b.box(-16, 6, 13, -1, 11, 13, 0xffffff);
  text(b, 'CHOCO', -8, 7, 14, '+z', PAL.choco, { center: true, mirror: m });
  b.box(-16, 5, 13, -1, 5, 13, PAL.gold).box(-16, 12, 13, -1, 12, 13, PAL.gold);
  // caramel round window
  b.cylinder(-7, 21, 12, 12, 4, PAL.gold, 'z');
  b.cylinder(-7, 21, 12, 12, 3, null, 'z');
  b.cylinder(-7, 21, 11, 11, 3, (x, y) => ((x + y) % 4 === 0 ? 0xffe08a : 0xffa63a), 'z', true);
  b.box(-7, 18, 12, -7, 24, 12, PAL.gold).box(-10, 21, 12, -4, 21, 12, PAL.gold);
  // wafer door on front
  b.box(16, 3, -5, 16, 15, 4, (x, y, z) => ((y + z) % 3 === 0 ? 0xc98c55 : 0xe0b070));
  b.box(17, 16, -6, 17, 17, 5, PAL.gold);
  // drips from roof edge
  for (let x = -17; x <= 15; x++) {
    const d = Math.floor(hash3(x, 7, 3) * 6);
    for (let i = 0; i < d; i++) b.set(x, 27 - i, 12, PAL.chocoL);
    if (d > 3) b.set(x, 27 - d, 12, PAL.chocoM);
  }
  for (let z = -11; z <= 11; z++) {
    const d = Math.floor(hash3(z, 8, 3) * 5);
    for (let i = 0; i < d; i++) b.set(16, 27 - i, z, PAL.chocoL);
  }
  // roof
  b.box(-18, 28, -12, 16, 29, 12, (x, y, z) => (y === 29 ? chocoFn(x, z) : PAL.chocoL));
  // seat: gold foil square
  b.box(9, 30, -3, 14, 30, 2, PAL.gold).box(10, 31, -2, 13, 31, 1, PAL.goldL);
  // tower: stacked bars with a bite (stage 3)
  const tower = new VoxGrid();
  tower.box(-16, 30, -10, -5, 44, 1, (x, y, z) => chocoFn(Math.abs(z - 1) < 0.5 || Math.abs(z + 10) < 0.5 ? x : z, y));
  tower.box(-17, 36, -11, -4, 38, 2, wrap);
  tower.box(-17, 37, -11, -4, 37, 2, PAL.gold);
  tower.carve((x, y, z) => (x + 5) ** 2 + (y - 44) ** 2 < 14 || (x + 7) ** 2 + (y - 45) ** 2 < 8);
  // stack of wrapped bars by the door (stage 2)
  const bar = new VoxGrid();
  const wrapBar = (x, y, z, len, col) => {
    bar.box(x, y, z, x + len - 1, y + 1, z + 3, (xx, yy, zz) => chocoFn(xx * 2, zz * 2 + yy));
    bar.box(x + 2, y, z - 1 + 1, x + len - 3, y + 2, z + 3, col);
    bar.box(x + 2, y + 2, z + 1, x + len - 3, y + 2, z + 2, 0xffffff);
    bar.box(x + 1, y, z, x + 1, y + 1, z + 3, 0xd8dde8).box(x + len - 2, y, z, x + len - 2, y + 1, z + 3, 0xd8dde8);
  };
  wrapBar(-21, 0, 15, 10, 0x1d9bf0);
  wrapBar(-20, 3, 16, 9, wrap);
  wrapBar(-19, 6, 15, 8, PAL.gold);
  // flags
  const f1 = flagParts(9, 8, 5, (x, y) => (y === 2 ? PAL.gold : wrap));
  const f2 = flagParts(7, 7, 5, (x, y) => (y === 2 ? 0xffffff : 0x1d9bf0));
  const poles = new VoxGrid().merge(f1.pole, -10, 45, -4).merge(f2.pole, 4, 30, -10);
  return {
    body: b,
    chunks: [
      { name: 'poles', grid: poles, stage: 1 },
      { name: 'bar', grid: bar, stage: 2 },
      { name: 'tower', grid: tower, stage: 3 },
    ],
    anims: [
      { type: 'flag', grid: f1.cloth, at: [-9.5, 45 + f1.clothY, -3.5], stage: 1 },
      { type: 'flag', grid: f2.cloth, at: [4.5, 30 + f2.clothY, -9.5], stage: 1 },
    ],
    beacons: [],
    core: { at: [6.5, 3, 18.5], frame: PAL.chocoL, frameD: PAL.gold, trim: wrap },
    gauge: { x: 12, frame: PAL.chocoD },
    seat: [12.6, 32, -0.5],
    fires: [[-6, 30, 4], [6, 30, -6], [-2, 30, 8]],
    sparks: [[-15.5, 18, 12.6], [-1, 24, 12.6], [17.6, 12, 7], [11, 20, 12.6], [17.6, 22, -6]],
    rubble: [PAL.choco, PAL.chocoL, PAL.chocoD, 0xff4fa3, 0xd8dde8, PAL.gold],
  };
}

// ---------------------------------------------------------------------------
const goldBrick = (u, y) => {
  const row = Math.floor(y / 2);
  const off = row % 2 ? 2 : 0;
  if (y % 2 === 0) return PAL.goldD;
  if ((u + off) % 4 === 0) return PAL.goldD;
  return hash3(Math.floor((u + off) / 4), row, 9) < 0.3 ? PAL.goldL : PAL.gold;
};
function goldBars(g, x, y, z, nx, nz, layers) {
  for (let l = 0; l < layers; l++)
    for (let i = 0; i < nx - l; i++)
      for (let k = 0; k < nz; k++) {
        const bx = x + i * 3 + l * 1.5, by = y + l * 2, bz = z + k * 2;
        g.box(Math.round(bx), by, bz, Math.round(bx) + 2, by + 1, bz + 1, (xx, yy) => (yy === by + 1 ? PAL.goldL : PAL.gold));
      }
}
function sGoldVault(m) {
  const b = new VoxGrid();
  b.box(-20, 0, -15, 18, 2, 15, (x, y, z) => (y === 2 && (x === -20 || x === 18 || z === -15 || z === 15) ? PAL.gold : (vnoise(x * 0.25, y, z * 0.25) < 0.4 ? 0x3a3550 : 0x2e2a40)));
  b.box(-17, 3, -11, 15, 26, 11, (x, y, z) => goldBrick(Math.abs(z) === 11 ? x + 17 : z + 11, y));
  b.box(-18, 3, -12, 16, 4, 12, PAL.goldDD);
  b.box(-18, 24, -12, 16, 26, 12, (x, y) => (y === 25 ? PAL.goldDD : PAL.gold));
  // crenellations with diamonds
  for (let x = -18; x <= 16; x += 4) for (const z of [-12, 12]) {
    if (z === 12 && x > 6 && x < 16) continue;
    b.box(x, 27, z, x + 1, 29, z, PAL.gold);
    b.set(x, 30, z, PAL.cyan, true);
  }
  for (let z = -12; z <= 12; z += 4) b.box(-18, 27, z, -18, 29, z + 1, PAL.gold).set(-18, 30, z, PAL.cyan, true);
  // corner columns
  for (const [x, z] of [[-17, 12], [15, 12], [15, -12], [-17, -12]]) {
    b.cylinder(x, z, 3, 27, 2, (xx, yy, zz) => ((xx + zz) % 2 ? PAL.gold : PAL.goldL));
    b.cylinder(x, z, 28, 29, 3, PAL.goldD);
  }
  // facade vault door
  vaultDoor(b, '+z', -6, 14, 12, 8, { steel: PAL.goldL, dark: PAL.goldDD, gold: PAL.white, hub: PAL.cyan });
  // $ emblems
  text(b, '$', 0, 19, 12, '+z', PAL.goldL, { center: true, mirror: m, scale: 1, glow: true });
  // front: barred gate
  b.box(16, 3, -7, 16, 20, 6, PAL.goldDD);
  b.box(16, 3, -6, 16, 18, 5, null);
  b.box(15, 3, -6, 15, 18, 5, 0x1a1626);
  for (let z = -6; z <= 5; z += 2) b.box(16, 3, z, 16, 18, z, PAL.gold);
  b.box(16, 11, -6, 16, 11, 5, PAL.gold);
  b.box(17, 21, -3, 17, 23, 2, PAL.cyan, true);
  // roof + seat
  b.box(-17, 26, -11, 15, 26, 11, PAL.goldD);
  b.box(9, 27, -3, 14, 27, 2, 0x8a1a3a).box(10, 28, -2, 13, 28, 1, PAL.gold);
  // gold bar piles (stage 3)
  const piles = new VoxGrid();
  goldBars(piles, -21, 0, 14, 4, 2, 3);
  goldBars(piles, 17, 3, 9, 2, 2, 2);
  goldBars(piles, -2, 0, 15, 3, 1, 2);
  piles.box(-20, 0, 18, -17, 1, 19, PAL.cash).box(-19, 2, 18, -18, 2, 19, PAL.cashD);
  // dome tower with giant $ (stage 2)
  const tower = new VoxGrid();
  tower.cylinder(-10, -3, 27, 33, 6, (x, y, z) => goldBrick(x + z, y));
  tower.cylinder(-10, -3, 34, 34, 7, PAL.goldDD);
  tower.ellipsoid(-10, 35, -3, 6, 5, 6, (x, y, z) => ((x + z) % 3 === 0 ? PAL.goldL : PAL.gold));
  for (let a = 0; a < 8; a++) {
    const t = (a / 8) * Math.PI * 2;
    tower.box(Math.round(-10 + Math.cos(t) * 6.4), 29, Math.round(-3 + Math.sin(t) * 6.4), Math.round(-10 + Math.cos(t) * 6.4), 31, Math.round(-3 + Math.sin(t) * 6.4), 0x1a1626);
  }
  const dollar = new VoxGrid();
  text(dollar, '$', -10, 42, -3, '+z', PAL.goldL, { center: true, mirror: m, scale: 2, depth: 2, glow: true });
  dollar.box(-10, 40, -3, -10, 41, -2, PAL.gold);
  return {
    body: b,
    chunks: [
      { name: 'dollar', grid: dollar, stage: 1 },
      { name: 'tower', grid: tower, stage: 2 },
      { name: 'piles', grid: piles, stage: 3 },
    ],
    anims: [],
    beacons: [{ at: [15.5, 31, 12.5], color: PAL.cyan, stage: 2 }, { at: [-16.5, 31, -11.5], color: PAL.cyan, stage: 2 }],
    core: { at: [6.5, 3, 18.5], frame: PAL.gold, frameD: PAL.goldDD, trim: PAL.cyan },
    gauge: { x: 11, frame: PAL.goldDD },
    seat: [12.6, 29, -0.5],
    fires: [[-6, 27, 4], [6, 27, -6], [-2, 27, 8]],
    sparks: [[-15.5, 18, 12.6], [3, 8, 12.6], [17.6, 12, 7], [10, 22, 12.6], [17.6, 20, -6]],
    rubble: [PAL.gold, PAL.goldL, PAL.goldD, PAL.goldDD, PAL.cyan],
  };
}

// ---------------------------------------------------------------------------
function sRival(m) {
  const b = new VoxGrid();
  const pur = 0x6a2fa0, purD = 0x45206e, purL = 0x8a4ad0, grn = PAL.toxic;
  b.box(-19, 0, -14, 17, 2, 14, (x, y, z) => (y === 2 && (z >= 13 || x >= 16) ? hazardC(grn, PAL.ink)(x, y, z) : 0x2a2236));
  for (let x = -18; x <= 16; x += 3) b.set(x, 1, 14, grn, true);
  b.cylinder(6, 18, 0, 2, 6, 0x2a2236);
  ring(b, 6, 18, 2, 2, 6, grn);
  panelBox(b, -17, 3, -12, 15, 28, 12, { c1: pur, c2: purD, seam: 0x1c1428, px: 6, py: 6 });
  b.box(-17, 3, -12, 15, 4, 12, 0x1c1428);
  b.box(-18, 27, -13, 16, 28, 13, purL);
  b.box(-17, 29, -12, 15, 29, 12, 0x1c1428);
  // roof spikes (stage 2)
  const spikes = new VoxGrid();
  for (let x = -18; x <= 16; x += 3) for (const z of [-13, 13]) {
    if (z === 13 && x > 6) continue;
    spikes.box(x, 30, z, x + 1, 31, z, PAL.metal).set(x, 32, z, PAL.metalL).set(x, 33, z, 0xffffff);
  }
  for (let z = -10; z <= 10; z += 3) spikes.box(-18, 30, z, -18, 31, z + 1, PAL.metal).set(-18, 32, z, PAL.metalL).set(-18, 33, z, 0xffffff);
  // skull plate + RIVAL sign on facade
  b.box(-16, 5, 13, -6, 15, 13, PAL.ink);
  const sk = ['.#####.', '#######', '##.#.##', '#######', '.#####.', '.#.#.#.', '.......', '..###..'];
  sk.forEach((row, r) => [...row].forEach((c, i) => {
    if (c === '#') b.set(-14 + i, 13 - r, 14, 0xf4f0e6);
    else if (r === 2) b.set(-14 + i, 13 - r, 14, grn, true);
  }));
  signZ(b, 'RIVAL', -7, 19, 13, { board: PAL.ink, color: grn, pad: 1, mirror: m, frame: purL });
  for (let y = 6; y <= 14; y += 2) b.box(-4, y, 13, 0, y, 13, 0x1c1428);
  // front: toothy door
  b.box(16, 3, -7, 16, 19, 6, PAL.ink);
  b.box(15, 3, -6, 15, 18, 5, 0x1c1428);
  b.box(16, 4, -6, 16, 18, 5, null);
  for (let z = -6; z <= 5; z += 2) b.set(16, 18, z, 0xffffff).set(16, 17, z, 0xffffff).set(16, 4, z + 1, 0xffffff);
  b.box(16, 20, -4, 16, 20, 3, grn, true);
  // seat
  b.box(9, 30, -3, 14, 30, 2, PAL.ink).box(10, 31, -2, 13, 31, 1, grn);
  // pipes + toxic tanks (stage 2)
  const tanks = new VoxGrid();
  for (const [x, z] of [[0, -8], [4, 6]]) {
    tanks.cylinder(x, z, 30, 36, 2, (xx, y) => (y === 30 || y === 36 ? PAL.metalD : grn), 'y');
    tanks.cylinder(x, z, 31, 35, 2, grn, 'y', true);
    tanks.box(x - 2, 33, z, x + 2, 33, z, PAL.metalD);
  }
  pipe(tanks, 'x', -16, 6, 29, 14, PAL.metalD, grn, 1, 5);
  // evil tower (stage 3)
  const tower = new VoxGrid();
  panelBox(tower, -15, 30, -10, -5, 42, 2, { c1: purD, c2: pur, seam: 0x1c1428, px: 5, py: 4 });
  for (let i = 0; i < 6; i++) tower.box(-15 + i, 43 + i, -10 + i, -5 - i, 43 + i, 2 - i, i % 2 ? purL : purD);
  // angry eyes on the tower face
  for (const [x0, dir] of [[-14, 1], [-9, -1]]) {
    for (let x = 0; x < 4; x++) {
      const top = 38 - Math.floor((dir > 0 ? x : 3 - x) / 2);
      tower.box(x0 + x, 34, 3, x0 + x, top, 3, grn, true);
    }
    tower.box(x0 + (dir > 0 ? 2 : 0), 34, 4, x0 + (dir > 0 ? 3 : 1), 35, 4, PAL.ink);
  }
  for (let x = -14; x <= -6; x += 2) tower.set(x, 32, 3, 0xffffff).set(x + 1, 31, 3, 0xffffff);
  const orb = new VoxGrid();
  orb.sphere(-10, 51, -4, 2, grn, true);
  return {
    body: b,
    chunks: [
      { name: 'orb', grid: orb, stage: 1 },
      { name: 'spikes', grid: spikes, stage: 2 },
      { name: 'tanks', grid: tanks, stage: 2 },
      { name: 'tower', grid: tower, stage: 3 },
    ],
    anims: [{ type: 'spin', grid: dishGrid({ r: 4, col: purL, back: purD, rim: grn, tip: grn }), at: [10.5, 30, -7.5], stage: 1, speed: -1.2 }],
    beacons: [{ at: [16.5, 21, 7.5], color: grn, stage: 3 }],
    core: { at: [6.5, 3, 18.5], frame: purL, frameD: 0x1c1428, trim: grn },
    gauge: { x: 12, frame: 0x1c1428 },
    seat: [12.6, 32, -0.5],
    fires: [[-6, 30, 4], [6, 30, -6], [-2, 30, 8]],
    sparks: SPARKS,
    rubble: [pur, purD, purL, 0x1c1428, PAL.metal, grn],
  };
}

export const LAB_STYLE_BUILDERS = {
  default: sDefault, mansion: sMansion, martLab: sMartLab, mart: sMart, chocoLab: sChoco, goldVault: sGoldVault, rival: sRival,
};

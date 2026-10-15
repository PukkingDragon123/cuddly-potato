// Arena 15 (legendary): ZERO-G SPACE STATION — "I Spent 24 Hours In Zero Gravity".
// The lane is the station's lit walkway on a huge orbital deck. Behind it:
// cargo pods, a glass greenhouse dome, a robotic arm, antenna masts and
// astronauts drifting on tethers among floating crates, pizza slices and
// Feastables bars (everything not bolted down floats!). Beyond, habitat
// modules with spinning solar wings, a docked BEAST-1 rocket, a big rotating
// ring habitat and satellites drifting past - and far below, the curved Earth
// slowly turning under a nebula sky with a ringed planet and the Moon.
import {
  THREE, VoxGrid, Mats, makeMesh, FIELD, shade, mixHex, hash3, vnoise, clamp, text, textW, mulberry32, bayer,
  paintGradient, paintStars, px, disc, skyTexture, parallaxWidth, canvasTex, glassMat,
} from './kit.js';
import { pixels, setInst, liveInst, fitSky, addParticles, addGlints, zoneDisc, anchor } from './wildsKit.js';

const C = {
  deck: 0xc8ced8, deckL: 0xdde3ea, deckD: 0x9aa2b0, deckDD: 0x6b7386, seam: 0x4a5262, grate: 0x3a4050,
  hull: 0xeef0f6, hullD: 0xc8ccd8, hullDD: 0x9aa0b0, panel: 0x2a3a8a, panelL: 0x4a6ac8, panelD: 0x1a2660,
  gold: 0xffc21a, goldL: 0xffe680, foil: 0xd8a83a, blue: 0x8f9bff, blueL: 0xc8d0ff, cyan: 0x5ce1e6,
  orange: 0xff8a1a, red: 0xe8343c, white: 0xffffff, ink: 0x15121f, glass: 0x9fd8ff, green: 0x5fdc4a, greenD: 0x2f9a3a,
  suit: 0xf4f6fa, suitD: 0xc8ccd8, visor: 0xffb84a, pink: 0xff4fa3,
};
const LH = FIELD.LANE_HALF;
const ZONE_SCALE = 1.18;

// --------------------------------------------------------------------------- voxel props

/** Habitat module: a long voxel cylinder along x with windows, rings and docking ports. */
const moduleGrid = (L, R, col = C.hull) => () => {
  const g = new VoxGrid();
  for (let x = -L; x < L; x++) for (let y = -R - 1; y <= R; y++) for (let z = -R - 1; z <= R; z++) {
    const d = Math.hypot(y + 0.5, z + 0.5);
    if (d > R + 0.3 || d < R - 1.2) continue;
    const ring = (x + L) % 10 === 0;
    let c = ring ? C.hullDD : ((x + L) >> 1) % 7 === 0 ? shade(col, -0.08) : col;
    if (!ring && z > R - 1.5 && Math.abs(y + 0.5) < 1.5 && (x + L) % 10 > 3 && (x + L) % 10 < 7) c = 0x6ac8ff; // windows
    g.set(x, y, z, c, c === 0x6ac8ff);
  }
  for (const x of [-L - 1, L]) for (let y = -R; y < R; y++) for (let z = -R; z < R; z++) if (Math.hypot(y + 0.5, z + 0.5) < R - 0.5) g.set(x, y, z, Math.hypot(y + 0.5, z + 0.5) < 2 ? C.hullDD : C.hullD);
  // gold foil band + label
  for (let x = -4; x < 4; x++) for (let y = -R - 1; y <= R; y++) for (let z = -R - 1; z <= R; z++) { const d = Math.hypot(y + 0.5, z + 0.5); if (d <= R + 0.3 && d >= R - 1.2) g.set(x, y, z, (x + y) % 3 ? C.foil : C.gold); }
  return g;
};
/** Solar wing: a truss with a grid of blue cells. Long axis along y (rotates about it). */
const solarGrid = (L) => () => {
  const g = new VoxGrid();
  g.box(0, -L, 0, 0, L, 0, C.deckD);
  for (let y = -L; y <= L; y++) {
    if (Math.abs(y) < 3) continue;
    for (let x = 1; x <= 9; x++) g.set(x, y, 0, (y % 5 === 0 || x === 9) ? C.deckL : ((x + y) & 1) ? C.panel : C.panelL);
    for (let x = -9; x <= -1; x++) g.set(x, y, 0, (y % 5 === 0 || x === -9) ? C.deckL : ((x + y) & 1) ? C.panel : C.panelL);
  }
  return g;
};
/** Ring habitat (wheel) in the x-y plane, spokes to a hub. */
const ringGrid = () => {
  const g = new VoxGrid();
  const R = 30;
  for (let a = 0; a < 400; a++) {
    const an = (a / 400) * Math.PI * 2;
    for (let r = R - 3; r <= R; r++) for (let z = -3; z <= 3; z++) {
      const x = Math.round(Math.cos(an) * r), y = Math.round(Math.sin(an) * r);
      const win = r === R && Math.abs(z) < 2 && (a % 20) < 10;
      g.set(x, y, z, win ? 0x6ac8ff : r === R - 3 ? C.hullDD : (a % 40 < 2 ? C.gold : C.hull), win && z === 0);
    }
  }
  for (let k = 0; k < 4; k++) { const an = (k / 4) * Math.PI * 2 + 0.4; g.line(0, 0, 0, Math.round(Math.cos(an) * (R - 3)), Math.round(Math.sin(an) * (R - 3)), 0, C.deckD, 1); }
  g.sphere(0, 0, 0, 5, (x, y, z) => (z > 3 ? C.gold : C.hull));
  return g;
};
/** BEAST-1 rocket (upright) on a launch clamp. */
const rocketGrid = () => {
  const g = new VoxGrid();
  for (let y = 0; y < 60; y++) {
    const r = y < 46 ? 5 : 5 * (1 - (y - 46) / 15);
    for (let x = -6; x <= 5; x++) for (let z = -6; z <= 5; z++) {
      const d = Math.hypot(x + 0.5, z + 0.5);
      if (d > r + 0.3 || (d < r - 1.2 && y > 1 && y < 58)) continue;
      let c = y > 46 ? C.red : (y >> 3) % 2 ? C.white : 0xe8ecf4;
      if (y > 30 && y < 34) c = C.ink;
      if (z > 3 && y > 36 && y < 42 && Math.abs(x + 0.5) < 2) c = 0x6ac8ff;
      g.set(x, y, z, c);
    }
  }
  for (let k = 0; k < 4; k++) { const an = (k / 4) * Math.PI * 2 + Math.PI / 4; for (let y = 0; y < 14; y++) for (let r = 5; r < 5 + Math.max(0, 6 - y * 0.4); r++) g.set(Math.round(Math.cos(an) * r - 0.5), y, Math.round(Math.sin(an) * r - 0.5), C.red); }
  text(g, 'BEAST', 0, 14, 6, '+z', C.ink, { center: true });
  text(g, '1', 0, 22, 6, '+z', C.red, { center: true, scale: 2 });
  for (let y = -4; y < 0; y++) g.cylinder(-0.5, -0.5, y, y, 3.4 + (y + 4) * 0.3, C.deckDD);
  return g;
};
const gantryGrid = () => {
  const g = new VoxGrid();
  for (const [x, z] of [[-4, -4], [3, -4], [-4, 3], [3, 3]]) g.box(x, 0, z, x, 64, z, C.deckDD);
  for (let y = 0; y < 64; y += 6) { g.box(-4, y, -4, 3, y, -4, C.deckD); g.box(-4, y, 3, 3, y, 3, C.deckD); g.line(-4, y, -4, 3, y + 5, -4, C.deckD); }
  for (const y of [20, 44]) g.box(4, y, -1, 12, y + 1, 0, C.deckD);
  g.set(0, 65, 0, C.red, true);
  return g;
};
/** Glass greenhouse dome base (the glass shell is a translucent mesh). */
const domeBaseGrid = () => {
  const g = new VoxGrid();
  for (let x = -12; x <= 11; x++) for (let z = -12; z <= 11; z++) { const d = Math.hypot(x + 0.5, z + 0.5); if (d > 12) continue; g.set(x, 0, z, d > 11 ? C.deckDD : d > 9 ? C.deckD : 0x6a4a2a); }
  for (let k = 0; k < 18; k++) {
    const x = Math.round((hash3(k, 1, 3) - 0.5) * 14), z = Math.round((hash3(k, 2, 3) - 0.5) * 14);
    if (Math.hypot(x, z) > 8) continue;
    const h = 2 + Math.floor(hash3(k, 4, 3) * 6);
    g.box(x, 1, z, x, h, z, C.greenD);
    g.box(x - 1, h, z - 1, x + 1, h + 1, z + 1, k % 3 ? C.green : 0x8ae05a);
    if (k % 4 === 0) g.set(x, h + 2, z, [C.pink, C.goldL, C.red][k % 3]);
  }
  g.box(-1, 1, -1, 0, 4, 0, C.deckDD).box(-2, 5, -2, 1, 5, 1, C.cyan, true); // grow lamp
  return g;
};
const domeFrameGrid = () => {
  const g = new VoxGrid();
  const R = 11.5;
  for (let a = 0; a < 6; a++) for (let t = 0; t <= 24; t++) {
    const th = (t / 24) * Math.PI / 2, an = (a / 6) * Math.PI * 2;
    g.set(Math.round(Math.cos(an) * Math.cos(th) * R - 0.5), Math.round(Math.sin(th) * R), Math.round(Math.sin(an) * Math.cos(th) * R - 0.5), C.deckL);
  }
  for (let a = 0; a < 48; a++) { const an = (a / 48) * Math.PI * 2; g.set(Math.round(Math.cos(an) * R * 0.7 - 0.5), Math.round(R * 0.7), Math.round(Math.sin(an) * R * 0.7 - 0.5), C.deckL); }
  return g;
};
/** Glass dome shell (rendered with a translucent material). */
const domeGlassGrid = () => {
  const g = new VoxGrid();
  const R = 11.4;
  for (let x = -12; x <= 11; x++) for (let y = 0; y <= 12; y++) for (let z = -12; z <= 11; z++) {
    const d = Math.hypot(x + 0.5, y, z + 0.5);
    if (d <= R && d > R - 1.1) g.set(x, y, z, 0xbfe9ff);
  }
  return g;
};
const podGrid = (col) => () => {
  const g = new VoxGrid();
  g.box(-7, 0, -4, 6, 8, 3, (x, y, z) => (x === -7 || x === 6 || y === 0 || y === 8 ? C.deckDD : (x + 20) % 4 === 0 ? shade(col, -0.2) : col));
  g.box(-3, 2, 4, 2, 6, 4, C.ink);
  g.box(-2, 3, 5, 1, 5, 5, C.cyan);
  g.set(5, 7, 4, C.green, true);
  return g;
};
const crateGrid = () => {
  const g = new VoxGrid();
  g.box(-3, -3, -3, 2, 2, 2, (x, y, z) => (Math.abs(x + 0.5) > 2 && Math.abs(y + 0.5) > 2 ? C.deckDD : ((x + y + z) & 1) ? C.white : C.hullD));
  g.box(-2, -1, 3, 1, 0, 3, C.orange);
  return g;
};
const pizzaGrid = () => {
  const g = new VoxGrid();
  for (let y = 0; y < 8; y++) for (let x = -Math.floor(y / 2); x <= Math.floor(y / 2); x++) g.set(x, y, 0, y === 7 ? 0xd8a060 : (x + y) % 3 === 0 ? C.red : 0xffd060);
  g.box(-3, 7, 0, 3, 7, 0, 0xc88a48);
  return g;
};
const barGrid = () => {
  const g = new VoxGrid();
  g.box(-5, -1, -1, 4, 1, 0, (x) => (Math.abs(x + 0.5) < 2 ? C.white : C.pink));
  text(g, 'F', -1, -1, 1, '+z', C.pink, {});
  return g;
};
const dropletGrid = () => { const g = new VoxGrid(); g.sphere(0, 0, 0, 2, (x, y) => (y > 0 ? 0xd8f4ff : 0x8fd8ff)); g.set(-1, 1, 1, 0xffffff); return g; };
const wrenchGrid = () => { const g = new VoxGrid(); g.box(-5, 0, 0, 4, 0, 0, C.deckD); g.box(4, -1, 0, 6, 1, 0, C.deckD); g.del(6, 0, 0); g.box(-6, -1, 0, -6, 1, 0, C.deckD); return g; };
/** Astronaut (suit + gold visor + Beast patch), arms out. Faces +z. */
const astronautGrid = () => {
  const g = new VoxGrid();
  g.ellipsoid(0, 9, 0, 3, 4, 2.5, C.suit);
  g.sphere(0, 15, 0, 3, (x, y, z) => (z > 1 && y > 13 && y < 17 && Math.abs(x) < 3 ? C.visor : C.suit));
  g.set(-1, 16, 3, 0xffe8b0);
  g.box(-2, 6, -4, 1, 11, -3, C.hullDD); // backpack
  for (const s of [-1, 1]) { g.line(s * 3, 11, 0, s * 7, 13, 1, C.suit, 1); g.box(s * 7 - 1, 13, 0, s * 7 + 1, 14, 2, C.suitD); }
  for (const s of [-1, 1]) { g.line(s * 1, 5, 0, s * 3, 0, 1, C.suit, 1); g.box(s * 3 - 1, -1, 0, s * 3 + 1, 0, 2, C.hullDD); }
  g.box(1, 9, 3, 2, 10, 3, C.blue);
  g.set(-2, 10, 3, C.red, true);
  return g;
};
/** Robotic arm segments (base + upper + lower + gripper) — articulated in buildBattle. */
const armBaseGrid = () => { const g = new VoxGrid(); g.cylinder(-0.5, -0.5, 0, 3, 3.5, C.deckDD); g.box(-2, 4, -2, 1, 6, 1, C.white); return g; };
const armSegGrid = (L) => () => { const g = new VoxGrid(); g.box(0, -1, -1, L, 0, 0, C.white); g.box(0, -2, -2, 2, 1, 1, C.deckD); g.box(L - 2, -2, -2, L, 1, 1, C.deckD); g.box(4, 0, 0, L - 4, 0, 0, C.gold); return g; };
const gripperGrid = () => { const g = new VoxGrid(); g.box(0, -2, -2, 2, 1, 1, C.deckDD); g.box(3, -3, -1, 6, -3, 0, C.deckD); g.box(3, 2, -1, 6, 2, 0, C.deckD); return g; };
const mastGrid = () => {
  const g = new VoxGrid();
  g.box(0, 0, 0, 0, 30, 0, C.deckD);
  for (const y of [12, 20, 26]) g.box(-3, y, 0, 3, y, 0, C.deckDD);
  for (let x = -5; x <= 4; x++) for (let y = -5; y <= 4; y++) if ((x + 0.5) ** 2 + (y + 0.5) ** 2 < 25) g.set(x, 34 + y, Math.round(((x + 0.5) ** 2 + (y + 0.5) ** 2) / 10), C.white);
  g.set(0, 31, 0, C.red, true);
  return g;
};
const satGrid = () => {
  const g = new VoxGrid();
  g.box(-2, -2, -2, 1, 1, 1, C.foil);
  for (const s of [-1, 1]) g.box(s > 0 ? 3 : -10, -1, 0, s > 0 ? 9 : -4, 0, 0, (x) => ((x & 1) ? C.panel : C.panelL));
  g.line(0, 2, 0, 0, 5, 0, C.deckD);
  g.set(0, 6, 0, C.red, true);
  return g;
};
const shuttleGrid = () => {
  const g = new VoxGrid();
  for (let x = -18; x <= 18; x++) { const r = x > 12 ? 4 * (1 - (x - 12) / 7) : 4; for (let y = -4; y <= 4; y++) for (let z = -4; z <= 4; z++) if (Math.hypot(y, z) <= r) g.set(x, y, z, y < -1 ? 0x2a2e3a : x > 13 && y > 0 && z > 1 ? 0x6ac8ff : C.white); }
  for (let x = -16; x <= 2; x++) { const w = Math.round((x + 16) * 0.6); g.box(x, -2, -4 - w, x, -2, 4 + w, x === -16 ? C.red : C.white); }
  g.box(-18, 1, -1, -15, 9, 0, C.white).box(-18, 8, -1, -16, 9, 0, C.red);
  for (const z of [-2, 1]) g.box(-21, -1, z, -19, 1, z + 1, C.deckDD);
  return g;
};
const lightStripGrid = () => { const g = new VoxGrid(); for (let x = -2; x <= 1; x++) g.set(x, 0, 0, x === 0 ? C.blueL : C.blue, x === 0); g.box(-3, 0, 0, -3, 0, 0, C.deckDD).box(2, 0, 0, 2, 0, 0, C.deckDD); return g; };
const ventGrid = () => { const g = new VoxGrid(); g.box(-4, 0, -3, 3, 0, 2, C.deckDD); for (let x = -3; x <= 2; x++) if (x & 1) g.box(x, 0, -2, x, 0, 1, C.grate); return g; };
const boltGrid = () => { const g = new VoxGrid(); g.box(-1, 0, -1, 0, 0, 0, C.deckL); g.set(-1, 1, -1, C.deckD); return g; };

// --------------------------------------------------------------------------- painted backdrops

function paintSpaceSky(ctx, w, h) {
  const P = pixels(ctx, w, h);
  // galaxy band + soft nebula clouds (banded, lightly dithered)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const band = Math.abs((y - h * 0.62) - (x - w * 0.5) * -0.35);
    const n = vnoise(x * 0.03, y * 0.05, 3);
    const bi = (1 - band / 26) * n;
    if (band < 26 && bi > 0.18) P.set(x, y, bi > 0.42 ? 0x5a4a9a : bi > 0.3 ? 0x3a3478 : 0x24225a, bayer(x, y) < 0.5 || bi > 0.3 ? 1 : 0.6);
    const neb = vnoise(x * 0.02 + 9, y * 0.03, 7);
    if (neb > 0.6) P.set(x, y, x < w * 0.45 ? (neb > 0.7 ? 0x8a2a6a : 0x5a1e5a) : (neb > 0.7 ? 0x1e5a8a : 0x163a6a), neb > 0.64 || bayer(x, y) < 0.5 ? 1 : 0);
  }
  P.flush();
  paintStars(ctx, w, h, { n: 260, ymax: h, seed: 29, tint: 0xc8d0ff });
  // ringed planet + moon + sun flare
  const px0 = w * 0.16, py0 = h * 0.2;
  disc(ctx, px0, py0, 12, 0xe8a86a);
  for (let y = -12; y <= 12; y += 4) px(ctx, px0 - 11, py0 + y, 22, 2, 0xd88a4a, 0.55);
  disc(ctx, px0 + 4, py0 + 4, 9, 0xc87a3a);
  disc(ctx, px0 - 2, py0 - 2, 9, 0xe8a86a);
  for (let x = -26; x <= 26; x++) { const y = Math.round(x * 0.22); px(ctx, px0 + x, py0 + y, 1, 2, Math.abs(x) > 12 || y > 0 ? 0xf4d8a8 : 0xc89a6a); }
  disc(ctx, w * 0.6, h * 0.1, 5, 0xe8eaf0);
  disc(ctx, w * 0.6 + 2, h * 0.1 + 1, 2, 0xb8bcc8);
  disc(ctx, w * 0.6 - 2, h * 0.1 - 2, 1, 0xc8ccd8);
  const sx = w * 0.92, sy = h * 0.07;
  for (let k = 3; k >= 1; k--) { ctx.globalAlpha = 0.1 * k; disc(ctx, sx, sy, 3 + k * 3, 0xfff8e0); }
  ctx.globalAlpha = 1;
  disc(ctx, sx, sy, 3, 0xffffff);
  for (let k = -30; k <= 30; k++) px(ctx, sx + k, sy, 1, 1, 0xfff8e0, 0.5 * (1 - Math.abs(k) / 30));
  for (let k = -14; k <= 14; k++) px(ctx, sx, sy + k, 1, 1, 0xfff8e0, 0.5 * (1 - Math.abs(k) / 14));
}
/** The Earth's curved limb far below: ocean, continents, clouds, atmosphere glow. */
function paintEarth(ctx, w, h) {
  const P = pixels(ctx, w, h);
  const R = w * 1.6, cx = w * 0.5, cy = R + h * 0.18;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const d = Math.hypot(x - cx, y - cy);
    if (d > R + 5) continue;
    if (d > R) { P.set(x, y, d > R + 3 ? 0x2a4ae8 : 0x6ab0ff, d > R + 3 ? 0.5 : 0.85); continue; }
    const lat = (y - h * 0.18) / h;
    const land = vnoise(x * 0.035, lat * 9, 4) > 0.58 + lat * 0.08;
    let c = land ? (vnoise(x * 0.08, y * 0.1, 2) > 0.5 ? 0x4aa84a : 0x8a9a4a) : (lat < 0.1 ? 0x2a7ae0 : 0x1a5ac8);
    if (land && vnoise(x * 0.05, y * 0.05, 8) > 0.7) c = 0xe8d8a0; // desert
    if (d > R - 3) c = mixHex(c, 0x9fd8ff, 0.5);
    P.set(x, y, c);
  }
  P.flush();
}
function paintEarthClouds(ctx, w, h) {
  const P = pixels(ctx, w, h);
  const R = w * 1.6, cx = w * 0.5, cy = R + h * 0.18;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const d = Math.hypot(x - cx, y - cy);
    if (d > R - 1) continue;
    const n = vnoise(x * 0.07, y * 0.16, 12) * 0.7 + vnoise(x * 0.2, y * 0.4, 3) * 0.3;
    if (n > 0.6) P.set(x, y, n > 0.7 ? 0xffffff : 0xdce8f8);
  }
  P.flush();
}

// --------------------------------------------------------------------------- battle

export function buildBattle(K) {
  const sky = skyTexture('space', [[0, 0x02030c], [0.3, 0x060a20], [0.55, 0x0c1238], [0.8, 0x141a48], [1, 0x1a2458]], paintSpaceSky, { w: 256, h: 144 });
  fitSky(K, sky);

  // ---- the Earth below (+ a slowly turning cloud layer)
  K.parallax('earth', { z: -168, y: -38, w: parallaxWidth(-168), h: 54, tw: 400, th: 96, paint: paintEarth });
  const clouds = K.parallax('earthClouds', { z: -167, y: -38, w: parallaxWidth(-168), h: 54, tw: 400, th: 96, paint: paintEarthClouds, repeat: true });
  clouds.material.map.wrapS = THREE.RepeatWrapping;
  K.onUpdate((dt, t) => { clouds.material.map.offset.x = (t * 0.004) % 1; });

  // ---- the deck: plated near deck, lower outer tiers toward the camera, open space beyond
  const plate = (x, z, s) => {
    const ix = Math.floor(x / s), iz = Math.floor(z / s);
    const gx = ((ix % 8) + 8) % 8, gz = ((iz % 8) + 8) % 8;
    if (gx === 0 || gz === 0) return C.seam;
    if (gx === 4 && gz === 4) return C.deckDD;
    return hash3(ix >> 3, 7, iz >> 3) < 0.25 ? C.deckL : hash3(ix >> 3, 8, iz >> 3) > 0.85 ? C.deckD : C.deck;
  };
  K.ground({ id: 'deckNear', x0: -64, x1: 64, z0: -16, z1: 14, scale: 0.5, color: (x, z) => (Math.abs(z) < LH + 0.3 ? C.grate : z > 3 ? shade(plate(x, z, 0.5), -0.12) : plate(x, z, 0.5)) });
  K.ground({ id: 'deckFront', x0: -90, x1: 90, z0: 14, z1: 40, scale: 1, y: -0.6, color: (x, z) => (((x + 200) % 6 === 0 || (z + 200) % 6 === 0) ? C.grate : hash3(x >> 1, 2, z >> 1) < 0.2 ? 0x8a92a2 : 0x9aa2b2) });
  const backEdge = (x) => (Math.abs(x - 25.5) < 7 ? -24 : -17);
  K.ground({ id: 'deckBack', x0: -110, x1: 110, z0: -26, z1: -16, scale: 1, color: (x, z) => plate(x, z, 1), skip: (x, z) => z < backEdge(x) });
  K.mesh('backEdge', () => {
    const g = new VoxGrid();
    for (let x = -110; x < 110; x++) { const z = backEdge(x); for (let y = -3; y < 0; y++) g.set(x, y, z, y === -1 ? ((x & 3) ? C.deckDD : C.blue) : C.hullD, y === -1 && !(x & 3)); }
    for (const x of [18, 32]) for (let z = -24; z < -17; z++) for (let y = -3; y < 0; y++) g.set(x, y, z, C.hullD);
    return g;
  }, { scale: 1, pivot: [0, 0, 0] }, 0, -0.02, 0);
  // truss spine the floating modules hang from
  K.mesh('spine', () => {
    const g = new VoxGrid();
    for (let x = -240; x < 240; x++) { for (const [y, z] of [[0, 0], [0, 3], [3, 0], [3, 3]]) g.set(x, y, z, C.deckD); if ((x & 7) === 0) { g.line(x, 0, 0, x + 4, 3, 0, C.deckDD); g.line(x, 0, 3, x + 4, 3, 3, C.deckDD); g.box(x, 0, 0, x, 3, 3, C.deckDD); } }
    return g;
  }, { scale: 0.2, pivot: [0, 0, 1.5] }, 0, 2.9, -22.6);
  // deck edge railings (front lower tier: low) + hull skirt under the deck
  K.mesh('deckSkirt', () => {
    const g = new VoxGrid();
    for (let x = -90; x < 90; x++) { g.set(x, -1, 0, C.hullD); g.set(x, -2, 0, C.hullDD); g.set(x, 0, 0, (x & 3) ? C.deckDD : C.blue, !(x & 3)); }
    return g;
  }, { scale: 1, pivot: [0, 0, 0] }, 0, -0.6, 40);
  K.mesh('stepEdge', () => { const g = new VoxGrid(); for (let x = -128; x < 128; x++) { g.set(x, 0, 0, (x & 7) === 0 ? C.blueL : C.deckDD, (x & 7) === 0); g.set(x, -1, 0, C.hullDD); } return g; }, { scale: 0.5, pivot: [0, 1, 0] }, 0, -0.02, 14);

  // ---- lane: walkway grating with blue light strips + Beast paw marker
  K.lane({
    x0: -24, x1: 24, scale: 0.25, depth: 3, side: C.deckDD,
    color: (ix, iz) => {
      if (iz === -10 || iz === 9) return C.deckDD;
      if (iz === -9 || iz === 8) return (ix & 3) === 0 ? C.blue : C.deckD;
      if ((ix & 1) && (iz & 1)) return C.grate;
      return hash3(ix >> 3, iz >> 3, 5) < 0.2 ? C.deckL : C.deck;
    },
  });
  K.mesh('laneGlow', () => { const g = new VoxGrid(); for (let x = -96; x < 96; x += 16) { g.set(x, 0, -9, C.blueL, true); g.set(x, 0, 8, C.blueL, true); } return g; }, { scale: 0.25, pivot: [0, 0, 0] }, 0, 0.002, 0);
  K.mesh('pawMarker', () => {
    const g = new VoxGrid();
    for (let x = -3; x <= 3; x++) for (let z = -2; z <= 3; z++) if ((x / 3.4) ** 2 + ((z - 0.6) / 2.9) ** 2 <= 1) g.set(x, 0, z, C.blue, (x + z) % 3 === 0);
    for (const [cx, cz] of [[-4, -3], [-1.5, -4.6], [1.5, -4.6], [4, -3]]) for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) if (x * x + z * z <= 1.2) g.set(Math.round(cx) + x, 0, Math.round(cz) + z, C.blueL);
    return g;
  }, { scale: 0.11, pivot: [0, 0, 0] }, 0.05, 0.003, 1.2);

  // ---- breakables behind the lane (cargo)
  const brk = [[-19, 'pod'], [-9.6, 'crate'], [-3.3, 'pod2'], [4.4, 'crate'], [10.2, 'pod'], [18.6, 'crate']];
  for (const [x, kind] of brk) {
    if (kind === 'pod') K.breakable('crate', 'podB', podGrid(C.white), { scale: 0.1 }, x, -3.3, K.rand(-0.2, 0.2));
    else if (kind === 'pod2') K.breakable('crate', 'podO', podGrid(C.orange), { scale: 0.1 }, x, -3.3, K.rand(-0.2, 0.2));
    else K.breakable('crate', 'cargoCrate', crateGrid, { scale: 0.11 }, x, -3.3, K.rand(-0.3, 0.3));
  }

  // ---- midground: greenhouse dome, cargo pods, robotic arm, masts
  K.mesh('domeBase', domeBaseGrid, { scale: 0.13, ao: true }, -15.6, 0, -9.4, 0, 1, { shadow: true });
  K.mesh('domeFrame', domeFrameGrid, { scale: 0.13, pivot: [0, 0, 0] }, -15.6 - 0.065, 0.1, -9.4 - 0.065);
  const dome = K.mesh('domeGlass', domeGlassGrid, { scale: 0.13, pivot: [0, 0, 0] }, -15.6 - 0.065, 0.12, -9.4 - 0.065, 0, 1, { mats: [glassMat(0xbfe9ff, 0.24), Mats.glow] });
  dome.renderOrder = 3;
  K.inst('podW', podGrid(C.white), { scale: 0.12, ao: true }, [[-7.4, 0, -7.2, 0.1], [12.4, 0, -7.6, -0.1], [24, 0, -8.4, 0.2]], { shadow: true });
  K.inst('podO', podGrid(C.orange), { scale: 0.12, ao: true }, [[-24.6, 0, -6.8, 0.3], [6.8, 0, -10.6, -0.2]], { shadow: true });
  K.inst('mast', mastGrid, { scale: 0.12 }, [[-1.6, 0, -12.6, 0.4], [18.4, 0, -12.2, -0.6]], { shadow: true });
  // robotic arm reaching for a floating crate
  const armB = K.mesh('armBase', armBaseGrid, { scale: 0.12 }, 2.6, 0, -7.6, 0, 1, { shadow: true });
  void armB;
  const sh = new THREE.Group(); sh.position.set(2.6, 0.78, -7.6); K.add(sh);
  const upper = K.mesh('armUpper', armSegGrid(26), { scale: 0.12, pivot: [0, 0, 0] }, 0, 0, 0, 0, 1, { parent: sh, shadow: true });
  const el = new THREE.Group(); el.position.set(26 * 0.12, 0, 0); upper.add(el);
  const lower = K.mesh('armLower', armSegGrid(22), { scale: 0.12, pivot: [0, 0, 0] }, 0, 0, 0, 0, 1, { parent: el, shadow: true });
  const wr = new THREE.Group(); wr.position.set(22 * 0.12, 0, 0); lower.add(wr);
  K.mesh('gripper', gripperGrid, { scale: 0.12, pivot: [0, 0, 0] }, 0, 0, 0, 0, 1, { parent: wr, shadow: true });
  K.onUpdate((dt, t) => {
    sh.rotation.set(0, Math.sin(t * 0.25) * 0.8 + 0.6, 0);
    upper.rotation.z = 0.9 + Math.sin(t * 0.4) * 0.25;
    el.rotation.z = -1.6 + Math.sin(t * 0.4 + 1) * 0.35;
    wr.rotation.z = 0.5 + Math.sin(t * 0.7) * 0.3;
  });

  // ---- landmarks: habitat modules + solar wings, docked rocket on its gantry, rotating ring, shuttle
  K.mesh('moduleA', moduleGrid(30, 7), { scale: 0.2 }, -6, 3.6, -24, 0, 1, { shadow: true });
  K.mesh('moduleB', moduleGrid(16, 6, 0xe8ecf4), { scale: 0.2 }, 13, 3.4, -21, Math.PI / 2, 1, { shadow: true });
  K.inst('strut', () => { const g = new VoxGrid(); g.box(-1, 0, -1, 0, 6, 0, C.deckDD); g.box(-2, 6, -2, 1, 7, 1, C.deckD); return g; }, { scale: 0.2 }, [[-10, 1.5, -23.4], [-2, 1.5, -23.4], [13, 1.5, -22.4]], { shadow: true });
  const wings = [[-14, 3.6, -24, 0], [2, 3.6, -24, 1.3], [13, 3.4, -25.5, 2.1]].map(([x, y, z, ph]) => {
    const m = K.mesh('solar', solarGrid(30), { scale: 0.2, pivot: [0, 0, 0] }, x, y, z, 0, 1, { shadow: true });
    m.rotation.x = Math.PI / 2;
    return [m, ph];
  });
  K.onUpdate((dt, t) => { for (const [m, ph] of wings) m.rotation.y = Math.sin(t * 0.08 + ph) * 0.5; });
  K.mesh('gantry', gantryGrid, { scale: 0.14 }, 26.6, 0, -18.6, 0, 1, { shadow: true });
  const rocket = K.mesh('rocket', rocketGrid, { scale: 0.14 }, 24.6, 0.6, -18.6, 0, 1, { shadow: true });
  addParticles(K, 16, [23.6, 25.6, 0.4, 3.2, -19.6, -17.6], { color: 0xf4f8ff, size: [0.08, 0.16], vy: 0.5, drift: 0.6, fadeTop: true, seed: 12 }); // venting cryo steam
  K.onUpdate((dt, t) => { rocket.position.y = 0.6 + Math.sin(t * 0.7) * 0.02; });
  const ring = K.mesh('ringHab', ringGrid, { scale: 0.42, pivot: [0, 0, 0] }, -26, 14, -52, 0.5, 1, {});
  K.onUpdate((dt, t) => { ring.rotation.z = t * 0.06; });
  const shuttle = K.mesh('shuttle', shuttleGrid, { scale: 0.16 }, 0, 0, 0, 0, 1, { shadow: true });
  K.onUpdate((dt, t) => {
    const q = (t * 0.03) % 1;
    const k = q < 0.5 ? q * 2 : 2 - q * 2;
    shuttle.position.set(-40 + k * 28, 9 + Math.sin(t * 0.3) * 0.5, -40 + k * 4);
    shuttle.rotation.set(0, q < 0.5 ? 0 : Math.PI, Math.sin(t * 0.2) * 0.05);
  });
  const sats = liveInst(K, 'sat', satGrid, { scale: 0.16 }, 3, { shadow: true });
  K.onUpdate((dt, t) => {
    for (let i = 0; i < 3; i++) { const x = ((t * (0.8 + i * 0.3) + i * 40) % 120) - 60; setInst(sats, i, x, 15 + i * 3, -60 - i * 10, t * 0.2 + i, 0.4, Math.sin(t * 0.3 + i) * 0.3); }
    sats.instanceMatrix.needsUpdate = true;
  });

  // ---- zero-G life: astronauts on tethers, floating crates / pizza / Feastables / droplets / tools
  const astro = liveInst(K, 'astronaut', astronautGrid, { scale: 0.09, pivot: [0, 9, 0] }, 3, { shadow: true });
  const tethers = liveInst(K, 'tether', () => { const g = new VoxGrid(); for (let x = 0; x < 40; x++) g.set(x, 0, 0, (x & 1) ? 0xffd23f : 0xf4f6fa); return g; }, { scale: 0.08, pivot: [0, 0, 0] }, 3);
  const astroAnchor = [[-9.6, 1.6, -9.6], [9.6, 1.2, -9.0], [-21, 2.0, -12]];
  K.onUpdate((dt, t) => {
    astroAnchor.forEach(([ax, ay, az], i) => {
      const x = ax + Math.sin(t * 0.3 + i) * 1.4, y = ay + 2.2 + Math.sin(t * 0.45 + i * 2) * 0.7, z = az + Math.cos(t * 0.27 + i) * 0.8;
      setInst(astro, i, x, y, z, Math.sin(t * 0.2 + i) * 1.2, Math.sin(t * 0.33 + i) * 0.6, t * 0.15 + i);
      const dx = x - ax, dy = y - ay, dz = z - az, L = Math.hypot(dx, dy, dz);
      _q.setFromUnitVectors(_X, _v.set(dx / L, dy / L, dz / L));
      _e.setFromQuaternion(_q, 'YXZ');
      setInst(tethers, i, ax, ay, az, _e.y, _e.x, _e.z, [L / 3.2, 1, 1]);
    });
    astro.instanceMatrix.needsUpdate = true;
    tethers.instanceMatrix.needsUpdate = true;
  });
  K.inst('tetherPost', () => { const g = new VoxGrid(); g.box(-1, 0, -1, 0, 16, 0, C.deckDD); g.set(-1, 17, -1, C.gold); return g; }, { scale: 0.1 }, astroAnchor.map(([x, y, z]) => [x, 0, z]));
  const floaters = [
    ['fCrate', crateGrid, 0.09, 7], ['fPizza', pizzaGrid, 0.07, 5], ['fBar', barGrid, 0.07, 6], ['fDrop', dropletGrid, 0.06, 10], ['fWrench', wrenchGrid, 0.07, 3],
  ];
  for (const [id, fn, s, n] of floaters) {
    const im = liveInst(K, id, fn, { scale: s, pivot: 'center' }, n, { shadow: true });
    const ps = Array.from({ length: n }, () => ({ x: K.rand(-30, 30), y: K.rand(1.2, 7.5), z: K.rand(-16, -4), ph: K.rand(0, 6), sp: K.rand(0.1, 0.35) * (K.R() < 0.5 ? -1 : 1) }));
    K.onUpdate((dt, t) => {
      ps.forEach((p, i) => {
        p.x += p.sp * dt;
        if (p.x > 32) p.x = -32; if (p.x < -32) p.x = 32;
        setInst(im, i, p.x, p.y + Math.sin(t * 0.5 + p.ph) * 0.4, p.z + Math.cos(t * 0.3 + p.ph) * 0.3, t * 0.3 + p.ph, t * 0.21 + p.ph, t * 0.13);
      });
      im.instanceMatrix.needsUpdate = true;
    });
  }
  // blinking beacons + shooting stars + glints
  const beacons = liveInst(K, 'beacon', () => { const g = new VoxGrid(); g.set(0, 0, 0, C.red, true); return g; }, { scale: 0.12 }, 8);
  const bpos = [[-12, 0.2, -5.2], [-0.4, 0.2, -5.4], [11.6, 0.2, -5.0], [22, 0.2, -5.3], [-24, 0.2, -5.0], [-1.6, 4.4, -12.6], [18.4, 4.4, -12.2], [26.6, 9.3, -18.6]];
  K.onUpdate((dt, t) => { bpos.forEach(([x, y, z], i) => setInst(beacons, i, x, y, z, 0, 0, 0, (t * 1.1 + i * 0.37) % 1 < 0.22 ? 1 : 0.0001)); beacons.instanceMatrix.needsUpdate = true; });
  const shoot = liveInst(K, 'shootingStar', () => { const g = new VoxGrid(); for (let x = 0; x < 14; x++) g.set(x, 0, 0, x < 2 ? 0xffffff : 0x9fb8ff, x < 4); return g; }, { scale: 0.4 }, 2);
  K.onUpdate((dt, t) => {
    for (let i = 0; i < 2; i++) { const q = (t * 0.09 + i * 0.5) % 1; setInst(shoot, i, 60 - q * 140 + i * 30, 40 - q * 14 + i * 6, -140, 0, 0, -0.18, q < 0.35 ? 1 : 0.0001); }
    shoot.instanceMatrix.needsUpdate = true;
  });
  addGlints(K, [[-6, 4, -24, 10, 1], [13, 3.4, -21, 6, 1], [24.6, 4, -18, 1, 6]], 14, [2.2, 2.3, 2.6]);
  addParticles(K, 40, [-34, 34, 0.5, 9, -14, 2], { color: [0xc8d0ff, 0xffffff], size: [0.03, 0.05], vy: 0.04, drift: 0.25, seed: 71 }); // dust motes in zero-G

  // ---- LOW foreground: deck light strips, vents, bolts (the deck is the floor)
  const strips = [], vents = [], bolts = [];
  for (let x = -40; x <= 40; x += 5) strips.push([x + K.rand(-1, 1), 0.01, K.rand(4, 12), 0, 1]);
  for (let i = 0; i < 14; i++) vents.push([K.rand(-40, 40), 0.01, K.rand(5, 13), 0, K.rand(1, 1.4)]);
  for (let i = 0; i < 40; i++) bolts.push([K.rand(-40, 40), 0.0, K.rand(LH + 0.6, 13), 0, K.rand(0.8, 1.2)]);
  K.inst('stripF', lightStripGrid, { scale: 0.12 }, strips);
  K.inst('ventF', ventGrid, { scale: 0.12 }, vents);
  K.inst('boltF', boltGrid, { scale: 0.08 }, bolts);
  K.mesh('deckText', () => { const g = new VoxGrid(); text(g, 'ZERO-G DECK', 0, 0, 0, '+y', C.deckDD, { center: true, scale: 2 }); return g; }, { scale: 0.12, pivot: [0, 0, 0] }, 0, 0.004, 9.5);

  return {
    sky,
    fog: { color: 0x0e1236, near: 90, far: 280 },
    lights: { sky: 0xc8d4ff, ground: 0x3a3a62, hemi: 0.95, sun: 2.2, sunColor: 0xfff8f0, dir: [-10, 12, 8], rim: 1.4, rimColor: 0x8f9bff },
    dust: 0xc8ced8,
    bloom: { strength: 0.85, threshold: 1.7, radius: 0.3 },
  };
}
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _X = new THREE.Vector3(1, 0, 0);

// --------------------------------------------------------------------------- Beast Island zone diorama

/** Station hull underside (hangs below the plinth; the island's elevator tether docks at the bottom). */
const hullGrid = () => {
  const g = new VoxGrid();
  // voxel 0.5: a stepped dish tapering to the tether dock
  for (let y = 0; y < 11; y++) {
    const r = 15 - y * 1.1;
    for (let x = -16; x <= 15; x++) for (let z = -16; z <= 15; z++) {
      const d = Math.hypot(x + 0.5, z + 0.5);
      if (d > r || d < r - 1.6) continue;
      g.set(x, -y, z, y % 3 === 0 ? C.gold : (Math.floor(Math.atan2(z, x) * 4 / Math.PI) & 1) ? C.hull : C.hullD, y % 5 === 2 && (Math.floor(Math.atan2(z, x) * 8 / Math.PI) % 3 === 0));
    }
  }
  for (let x = -3; x <= 2; x++) for (let z = -3; z <= 2; z++) if (Math.hypot(x + 0.5, z + 0.5) < 3) g.set(x, -11, z, C.deckDD);
  g.box(-1, -12, -1, 0, -11, 0, C.blue);
  return g;
};

export function buildZone(K) {
  K.mesh('hull', hullGrid, { scale: 0.5, pivot: [0, 0, 0] }, 0, -1.6, 0);
  zoneDisc(K, 'zoneDeck', {
    r: 22, seed: 6, depth: 2,
    colorTop: (x, z, r, R) => {
      if (r > R - 1.2) return (Math.floor(Math.atan2(z, x) * 6) & 1) ? C.blue : C.deckDD;
      const gx = ((x % 6) + 6) % 6, gz = ((z % 6) + 6) % 6;
      return gx === 0 || gz === 0 ? C.seam : hash3(x >> 2, 1, z >> 2) < 0.2 ? C.deckL : C.deck;
    },
    colorSide: (x, y) => (y === -1 ? C.blue : C.hullD),
  });
  K.mesh('moduleA', moduleGrid(18, 5), { scale: 0.1 }, -0.6, 0.7, -2.8, 0, 1, { shadow: true });
  K.mesh('moduleB', moduleGrid(10, 4, 0xe8ecf4), { scale: 0.1 }, 2.6, 0.6, -0.6, Math.PI / 2, 1, { shadow: true });
  K.inst('strut', () => { const g = new VoxGrid(); g.box(-1, 0, -1, 0, 5, 0, C.deckDD); g.box(-2, 0, -2, 1, 0, 1, C.deckD); return g; }, { scale: 0.1 }, [[-2.4, 0, -2.8], [1.2, 0, -2.8], [2.6, 0, -0.6]], { shadow: true });
  const wings = [[-4.2, 1.0, -2.8, 0], [3.0, 1.0, -2.8, 1.3]].map(([x, y, z, ph]) => {
    const m = K.mesh('solar', solarGrid(30), { scale: 0.1, pivot: [0, 0, 0] }, x, y, z, 0, 1, { shadow: true });
    m.rotation.x = Math.PI / 2;
    return [m, ph];
  });
  K.onUpdate((dt, t) => { for (const [m, ph] of wings) m.rotation.y = Math.sin(t * 0.1 + ph) * 0.6; });
  K.mesh('gantry', gantryGrid, { scale: 0.06 }, 4.6, 0, 2.6, 0, 1, { shadow: true });
  K.mesh('rocket', rocketGrid, { scale: 0.06 }, 3.8, 0.24, 2.6, 0, 1, { shadow: true });
  K.mesh('domeBase', domeBaseGrid, { scale: 0.08, ao: true }, -3.4, 0, 2.2, 0, 1, { shadow: true });
  const dome = K.mesh('domeGlass', domeGlassGrid, { scale: 0.08, pivot: [0, 0, 0] }, -3.44, 0.08, 2.16, 0, 1, { mats: [glassMat(0xbfe9ff, 0.24), Mats.glow] });
  dome.renderOrder = 3;
  K.mesh('domeFrame', domeFrameGrid, { scale: 0.08, pivot: [0, 0, 0] }, -3.44, 0.08, 2.16);
  const ring = K.mesh('ringHab', ringGrid, { scale: 0.09, pivot: [0, 0, 0] }, -1.0, 4.6, -4.6, 0, 1, { shadow: true });
  K.onUpdate((dt, t) => { ring.rotation.z = t * 0.12; });
  K.mesh('mast', mastGrid, { scale: 0.06 }, 1.6, 0, 1.4, 0.4, 1, { shadow: true });
  const astro = liveInst(K, 'astronaut', astronautGrid, { scale: 0.05, pivot: [0, 9, 0] }, 2, { shadow: true });
  K.onUpdate((dt, t) => {
    for (let i = 0; i < 2; i++) { const a = t * 0.2 * (i ? -1 : 1) + i * 3; setInst(astro, i, Math.cos(a) * 5.4, 2.4 + Math.sin(t * 0.5 + i) * 0.5, Math.sin(a) * 4.4, -a, Math.sin(t * 0.3 + i) * 0.6, t * 0.2); }
    astro.instanceMatrix.needsUpdate = true;
  });
  const cr = liveInst(K, 'fCrate', crateGrid, { scale: 0.05, pivot: 'center' }, 4, { shadow: true });
  const pz = liveInst(K, 'fPizza', pizzaGrid, { scale: 0.05, pivot: 'center' }, 2, { shadow: true });
  K.onUpdate((dt, t) => {
    for (let i = 0; i < 4; i++) { const a = t * 0.12 + i * 1.6; setInst(cr, i, Math.cos(a) * 4.2, 1.6 + Math.sin(t * 0.6 + i) * 0.4 + i * 0.3, Math.sin(a) * 3.6, t * 0.4 + i, t * 0.3, 0); }
    for (let i = 0; i < 2; i++) { const a = -t * 0.15 + i * 3; setInst(pz, i, Math.cos(a) * 3, 2.6 + Math.sin(t * 0.7 + i) * 0.3, Math.sin(a) * 2.6, t * 0.5, t * 0.4 + i, 0); }
    cr.instanceMatrix.needsUpdate = true;
    pz.instanceMatrix.needsUpdate = true;
  });
  const beacons = liveInst(K, 'beacon', () => { const g = new VoxGrid(); g.set(0, 0, 0, C.red, true); return g; }, { scale: 0.08 }, 4);
  K.onUpdate((dt, t) => { [[5.2, 0.1, 0], [-5.2, 0.1, 0], [0, 0.1, 5.2], [0, 0.1, -5.2]].forEach(([x, y, z], i) => setInst(beacons, i, x, y, z, 0, 0, 0, (t + i * 0.25) % 1 < 0.2 ? 1 : 0.0001)); beacons.instanceMatrix.needsUpdate = true; });
  addParticles(K, 14, [-5, 5, 0.3, 4, -5, 5], { color: [0xc8d0ff, 0xffffff], glow: 1.9, size: [0.03, 0.05], vy: 0.05, drift: 0.3, twinkle: 1.6 });
  anchor(K, 'boss', -2.0, 0, 4.6);
  anchor(K, 'npc', 2.0, 0, 4.8);
  anchor(K, 'airlock', 0, 1.0, -1.4);
  K.root.scale.setScalar(ZONE_SCALE); // fill the plinth
  return { focus: [0, 1.2, 0], radius: 7 };
}

// TROPHY ROAD, built into Beast Island like a treasure map: every milestone of TROPHY_ROAD is a
// big voxel treasure chest (wood / iron / gold / legendary by reward) sitting on a sandy dais
// painted with a red X, a little stake sign with its trophy count in front and the reward floating
// above it as pixel art. A red dashed trail runs along the road ahead of you, footprints behind.
// Claimable chests glow, hop, shine (a hard-edged glint sweeps across them) and send up a pixel
// light beam in their rarity colour; locked ones wear a padlock; claimed ones stand open with a flag.
// Arena thresholds get a stone arch over the road (portcullis down while the arena is locked, the
// trophy count on a sign that faces the road camera). In front of every arch a ROAD BOSS checkpoint
// (data/roadBosses.js): a spiked barricade across the road (the boss swarm itself stands behind it,
// placed by scenes/homeRoad.js) that breaks apart once the boss is beaten. Past the last arena the
// road keeps going: floating tech tiles spiral up around the space elevator to orbit pads.
//
// FORKS (data/roadForks.js): between two arenas the road splits. The main road is the COIN TRAIL
// (gold pavers), a side road the VIAL TRAIL (blue pavers); both rejoin before the next gate. A
// signpost (a coin / vial icon, no text) stands at the start of each trail, each trail holds two
// bonus chests, and the trail you did not pick is barred with a barricade until it opens. The camera
// follows a route through the trails you picked (setChoices).
//
//   const TP = addTrophyPath({ T, root, roadPoints, roadIdx, zones, plinthR, exclude, updaters, forks });
//   TP.milestones[i]  { m, key, t, s, chapter, gate, fork, side, tier, anchor, rewardPos, roadPos, standPos, group }
//   TP.forks[j]       { F (data), id, chapter, s0, s1, sSign, signPos, signs { a, b: { mesh, pos } }, bars, bpts, mid }
//   TP.bosses[j]      { rb (data), id, k, s, stopS, pos, yaw, broken }   (road boss checkpoints, in road order)
//   TP.posAt(s, out) / TP.tangentAt(s, out)   along the current route (arc length s, 0..TP.length)
//   TP.setChoices({ forkId: 'a' | 'b' })   reroute through the picked trails (milestone s values update)
//   TP.setBarrier(forkId, side | null)   barricade across that trail's entrance
//   TP.sOfTrophies(t, choices)  where a player with t trophies stands
//   TP.setState(i, 'locked' | 'ready' | 'claimed', { pop })   chest look (padlock / glowing + hopping / open + flag)
//   TP.setGateLocked(arenaId, locked)   portcullis
//   TP.setBossBarrier(id, up) / TP.breakBarricade(id)   a road boss barricade (breaking flings its parts)
//   TP.open(i)  plays the lid-pop + coin spill (then the chest stays open)
//   TP.spillAt(pos, n)  coin spill anywhere (the boss loot chest)
//   TP.setTrail(s)  dashes ahead of route position s, footprints behind it
//   TP.setFocus(i | -1)  pixel arrow over a milestone's reward
//   TP.atlas { canvas, ctx, cell, rect(i), commit() }  the reward art atlas (painted by the home scene)
//   TP.camDir  horizontal unit vector (x, z) from a road point toward the road camera
//
// Everything still is plain voxel meshes in the island root (static-batched by the home scene);
// the rewards, beams and focus arrow are one instanced pixel-billboard draw, the spilled coins one
// instanced draw, the trail dashes and footprints one each.
import * as THREE from 'three';
import { VoxGrid, Mats } from '../../core/voxel.js';
import { text, textW } from '../props/common.js';
import { shade, clamp, hash3 } from '../../core/util.js';
import { TROPHY_ROAD, ARENAS } from '../../data/arenas.js';
import { TRAILS } from '../../data/roadForks.js';
import { ROAD_BOSSES } from '../../data/roadBosses.js';
import * as P from './props.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
// the road camera looks from the south (a touch east), so every plate faces that way
const CAM_DIR = new THREE.Vector2(0.14, 1).normalize();
const FACE_Y = Math.atan2(CAM_DIR.x, CAM_DIR.y);
const PV = 0.1; // dais / chest voxel
const GV = 0.125; // gate voxel
const SIDE = 1.5 + 1.45; // chest centre offset from the road centre line
const DAIS = 0.2; // the dais top over the ground (the chest stands on it)
const ATLAS = 1024;
let CELL = 102, PER_ROW = 10;
// road boss checkpoint, as arc-length offsets from the gate arch: the boss, its barricade, where you wait
const BOSS_AT = -2.6, BAR_AT = -5.4, STOP_AT = -8.6, LAST_CHEST_AT = -11.2;

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const hex = (c) => (typeof c === 'string' ? parseInt(c.replace('#', ''), 16) : c);

// ---------------------------------------------------------------------------
// Voxel grids

const TROPHY = ['#####', '#####', '.###.', '..#..', '.###.'];

/** Sandy dais with a painted red X (the chest stands on its middle). Top at y = 0, a deep skirt below for slopes. */
function daisGrid(tech = false) {
  const g = new VoxGrid();
  const RX = 15, RZ = 11;
  const sand = tech ? [0xd8dce8, 0xc8ccd8, 0xeef0f8] : [0xf0da98, 0xe6cc86, 0xfae6b0];
  const rim = tech ? 0x8f98aa : 0xd2b26c, dirt = tech ? 0x6b7386 : 0x9a7444;
  const xc = tech ? 0x29e0ff : 0xd8352a, xd = tech ? 0x1a6a8a : 0x7a1a14;
  for (let x = -RX; x <= RX; x++) for (let z = -RZ; z <= RZ; z++) {
    // ragged oval edge
    const e = (x / RX) ** 2 + (z / RZ) ** 2;
    if (e > 1 + (hash3(x, 7, z) - 0.5) * 0.18) continue;
    const edge = e > 0.78;
    const top = edge ? rim : sand[(hash3(x, 1, z) * 3) | 0];
    g.set(x, 0, z, top);
    for (let y = -1; y >= -16; y--) g.set(x, y, z, y > -3 && !edge ? sand[1] : dirt);
  }
  // the X: two thick diagonal strokes with a dark outline, arms longer than the chest is wide
  const inX = (x, z) => {
    for (const s of [1, -1]) if (Math.abs(x * 0.72 - s * z) <= 1.45 && Math.abs(x) <= 13) return true;
    return false;
  };
  for (let x = -RX; x <= RX; x++) for (let z = -RZ; z <= RZ; z++) {
    if (!g.has(x, 0, z)) continue;
    if (inX(x, z)) g.set(x, 1, z, xc, tech);
    else if (inX(x + 1, z) || inX(x - 1, z) || inX(x, z + 1) || inX(x, z - 1)) g.set(x, 1, z, xd);
  }
  // a few pebbles
  if (!tech) for (const [x, z] of [[-13, 4], [12, -6], [11, 7], [-10, -8], [14, 1]]) if (g.has(x, 0, z)) g.set(x, 1, z, 0xc8b28a);
  return g;
}

/** Stake sign in front of a chest: a post and a cream board with a trophy + the count (tall digits). Faces +z, bottom at 0. */
function stakeSignGrid(num, color) {
  const g = new VoxGrid();
  const label = String(num);
  const tw = textW(label) + 7;
  const hw = Math.ceil(tw / 2) + 1;
  const trim = hex(color), trimD = shade(trim, -0.35);
  // posts (sharpened into the ground)
  for (const x of [-hw + 2, hw - 2]) { g.box(x, -3, 0, x, 3, 0, 0x6e4224); g.set(x, -4, 0, 0x4a2e18); }
  // board: dark frame, arena-colour edge, cream face
  g.box(-hw, 4, -1, hw, 16, 0, trimD);
  g.box(-hw + 1, 5, 1, hw - 1, 15, 1, trim);
  g.box(-hw + 2, 6, 1, hw - 2, 14, 1, 0xfff6dc);
  const tx = -Math.floor(tw / 2);
  TROPHY.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === '#') g.set(tx + c, 12 - r, 2, r < 2 ? 0xffd23f : 0xe0a010); }));
  text(g, label, tx + 7, 7, 2, '+z', 0x6a3a10, { sy: 2 });
  return g;
}

// Treasure chests: wood (oak planks + iron brackets), iron (riveted steel), gold (gold + crimson straps + gems),
// legendary (violet crystal with gold trim and glowing runes), tech (orbit road).
export const CHEST = {
  wood: { body: [0xb07840, 0x9a6634, 0xc08a4c], seam: 0x6e4224, grain: 0x8a5a2c, metal: 0x4a505e, metalL: 0x8a92a4, rivet: 0xc8ccd8, lock: 0xffc21a, key: 0x1a1020, feet: 0x4a3018, inside: 0x2a1a10, beam: 'wood' },
  iron: { body: [0x8a94a8, 0x7a8498, 0x9eaabe], seam: 0x5a6478, metal: 0x2f3542, metalL: 0x5f6a80, rivet: 0xe6ecf4, lock: 0x29b6f6, key: 0x0a1a2a, feet: 0x2e3440, inside: 0x1a1e28, gem: 0x29e0ff, beam: 'iron' },
  gold: { body: [0xffc21a, 0xf0ac10, 0xffda52], seam: 0xc8901a, metal: 0xb82a38, metalL: 0xff5a6a, rivet: 0xfff0b0, lock: 0xffffff, key: 0x6a1020, feet: 0x8a5a10, inside: 0x3a1a10, gem: 0x29e0ff, beam: 'gold' },
  legendary: { body: [0x3a2a6a, 0x2e2058, 0x4c3c86], seam: 0x22183e, metal: 0xffc21a, metalL: 0xffe680, rivet: 0xfff6c8, lock: 0xff4fa3, key: 0x2a0a1a, feet: 0x1a1030, inside: 0x0e0a1e, rune: 0x3ff2c8, gem: 0xff4fa3, beam: 'legendary' },
  tech: { body: [0xd8dce8, 0xc8ccd8, 0xeef0f8], seam: 0x8f98aa, metal: 0x29e0ff, metalL: 0x9ff4ff, rivet: 0xffffff, lock: 0x8f9bff, key: 0x1a1e3a, feet: 0x6b7386, inside: 0x1a1e28, beam: 'tech' },
};
const CW = 9, CD = 6, CH = 8, LH = 6; // half width, half depth, body height, lid height (voxels)
const CS = 1.2; // the road's chests are drawn a size up (they are the stars)
/** Chest body, top open (a heap of treasure inside, or bare boards once looted). Bottom at y = 0, front toward +z. */
function chestBodyGrid(tier, glow, empty = false) {
  const C = CHEST[tier], g = new VoxGrid();
  const bx = CW - 3; // strap columns at x = -bx and x = bx - 1
  for (let x = -CW; x <= CW - 1; x++) for (let z = -CD; z <= CD - 1; z++) for (let y = 0; y < CH; y++) {
    const ex = x === -CW || x === CW - 1, ez = z === -CD || z === CD - 1;
    if (y === 0) { // stubby feet at the corners
      if ((x <= -CW + 1 || x >= CW - 2) && (z <= -CD + 1 || z >= CD - 2)) g.set(x, 0, z, C.feet);
      continue;
    }
    if (!ex && !ez) {
      if (y === CH - 2 && !empty) { // the treasure heap: coins, a few gems
        const h = hash3(x, y, z);
        g.set(x, y, z, h < 0.06 && C.gem ? C.gem : h < 0.22 ? 0xffe680 : ((x + z) & 1) ? 0xffc21a : 0xe0a010, h < 0.06 && !!C.gem);
      } else if (y === 1) g.set(x, y, z, C.inside);
      else if (y === 2 && empty && hash3(x, y, z) < 0.07) g.set(x, y, z, 0xffc21a); // a couple of coins left behind
      continue;
    }
    const strap = x === -bx || x === bx - 1;
    const rim = y === CH - 1 || y === 1;
    // L-brackets on the four vertical edges, reaching 2 voxels onto each face top + bottom
    const near = ex ? Math.abs(z + 0.5) >= CD - 2.5 : Math.abs(x + 0.5) >= CW - 2.5;
    const bracket = (ex && ez) || ((ex || ez) && near && (y <= 2 || y >= CH - 3));
    let c = C.body[(y >> 1) % 3];
    let gl = false;
    if (tier === 'wood') { // planks 2 tall with dark seams and a little grain
      if ((y & 1) === 0) c = C.seam;
      else if (hash3(x, y, z) < 0.18) c = C.grain;
    }
    if (tier === 'iron' && (x === -1 || x === 0 || z === 0)) c = C.seam;
    if (tier === 'gold' && ((x + y * 2 + z) & 3) === 0) c = C.body[2];
    if (tier === 'legendary' && ((x - y + z) % 5 === 0)) c = C.body[2];
    if (tier === 'tech' && y === 4) c = C.metal;
    if (rim) c = C.metal;
    if (strap || bracket) { c = y === CH - 1 ? C.metalL : C.metal; gl = glow && strap && tier !== 'wood'; }
    if (bracket && !(ex && ez) && ((x + y + z) & 1) === 0) c = C.rivet;
    if (strap && (y === 2 || y === CH - 3)) c = C.rivet;
    if (tier === 'legendary' && !strap && !bracket && !rim && ez && z > 0 && ((x * 7 + y * 3) % 5 === 0)) { c = C.rune; gl = true; }
    g.set(x, y, z, c, gl);
  }
  // lock plate + keyhole on the front
  g.box(-2, CH - 6, CD, 1, CH - 1, CD, C.lock, glow);
  g.box(-2, CH - 6, CD, 1, CH - 6, CD, shade(C.lock, -0.3));
  g.set(-1, CH - 3, CD + 1, C.key).set(0, CH - 3, CD + 1, C.key).set(-1, CH - 4, CD + 1, C.key);
  // gems on the front corners for the fancy tiers
  if (C.gem) for (const x of [-CW + 1, CW - 2]) g.set(x, CH - 4, CD, C.gem, true);
  // ring handles on both ends
  for (const x of [-CW - 1, CW]) {
    g.box(x, CH - 4, -2, x, CH - 4, 1, C.metalL);
    g.set(x, CH - 3, -2, C.metal).set(x, CH - 3, 1, C.metal);
  }
  return g;
}
/** Barrel-top chest lid; hinge on its back-bottom edge at local (0, 0, 0), extending toward +z. */
function chestLidGrid(tier, glow) {
  const C = CHEST[tier], g = new VoxGrid();
  const bx = CW - 3, D2 = CD * 2;
  const inset = [0, 0, 0, 1, 2, 3];
  for (let y = 0; y < LH; y++) for (let x = -CW; x <= CW - 1; x++) for (let z = inset[y]; z < D2 - inset[y]; z++) {
    const shell = y === LH - 1 || z === inset[y] || z === D2 - 1 - inset[y] || x === -CW || x === CW - 1 || y === 0;
    if (!shell) continue;
    const strap = x === -bx || x === bx - 1;
    const edge = x === -CW || x === CW - 1;
    // the underside (seen when the lid is thrown open): plain boards a shade darker than the body
    let c = y === 0 ? (x === -CW || x === CW - 1 || z === inset[0] || z === D2 - 1 ? C.metal : shade(C.body[1], -0.22)) : C.body[(z >> 1) % 3];
    let gl = false;
    if (tier === 'wood' && y > 0) c = (z & 1) === 0 ? C.seam : hash3(x, y, z) < 0.15 ? C.grain : c;
    if (tier === 'gold' && ((x + z) & 3) === 0) c = C.body[2];
    if (strap || (edge && y > 0)) { c = y === LH - 1 ? C.metalL : C.metal; gl = glow && strap && tier !== 'wood'; }
    if (edge && y > 0 && ((y + z) & 1) === 0) c = C.rivet;
    if (strap && y === LH - 1 && (z & 1) === 0) c = C.rivet;
    if (tier === 'legendary' && y === LH - 1 && !strap && ((x + z) % 4 === 0)) { c = C.rune; gl = true; }
    g.set(x, y, z, c, gl);
  }
  // hasp over the lock + a gem crown on the lid for the fancy tiers
  g.box(-2, 0, D2, 1, 2, D2, C.lock, glow);
  g.set(-1, 1, D2 + 1, C.key).set(0, 1, D2 + 1, C.key);
  if (C.gem) {
    g.box(-1, LH, CD - 1, 0, LH, CD, C.gem, true);
    g.box(-2, LH - 1, CD - 2, 1, LH - 1, CD + 1, C.metalL);
  }
  return g;
}
/** Closed chest in one grid (body + lid), for the instanced hopping chests. */
function chestClosedGrid(tier, glow) {
  const g = chestBodyGrid(tier, glow);
  chestLidGrid(tier, glow).forEach((x, y, z, c, gl) => g.set(x, y + CH, z - CD, c, gl));
  return g;
}
/** Chunky padlock hanging on a locked chest's hasp. Its shackle top at about (0, 0, 0). */
function padlockGrid() {
  const g = new VoxGrid();
  // shackle
  g.box(-2, -1, 0, -2, 1, 0, 0xc8ccd8).box(1, -1, 0, 1, 1, 0, 0xc8ccd8).box(-1, 2, 0, 0, 2, 0, 0xe6ecf4);
  // body
  g.box(-3, -6, -1, 2, -2, 1, (x, y) => (y === -2 ? 0xffe680 : x === -3 || x === 2 ? 0xc8901a : 0xffc21a));
  g.set(-1, -4, 2, 0x1a1020).set(0, -4, 2, 0x1a1020).set(-1, -5, 2, 0x1a1020);
  return g;
}
/** Pixel coin for the spill: an octagon-ish disc with a rim and a stamped B. */
function coinGrid() {
  const g = new VoxGrid();
  const M = ['.####.', '#oooo#', '#oBBo#', '#oBBo#', '#oooo#', '.####.'];
  M.forEach((row, r) => [...row].forEach((ch, c) => {
    if (ch === '.') return;
    g.set(c, 5 - r, 0, ch === '#' ? 0xc8901a : ch === 'B' ? 0xffe680 : 0xffc21a);
  }));
  return g;
}
/** Little claimed flag: pole + green pennant with a white check on both faces. */
function flagGrid() {
  const g = new VoxGrid();
  g.box(0, 0, 0, 0, 16, 0, 0x6e4224);
  g.set(0, 17, 0, 0xffc21a);
  g.box(1, 10, 0, 8, 16, 0, 0x3fbf4f);
  g.box(1, 10, 0, 8, 10, 0, 0x2a8a3a);
  const chk = ['.....#', '....#.', '#..#..', '.##...'];
  chk.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === '#') { g.set(2 + c, 15 - r, 1, 0xffffff); g.set(2 + c, 15 - r, -1, 0xffffff); } }));
  return g;
}
/** Treasure-map dash on the trail ahead (voxel 0.06): a red stroke with a dark edge. Along local z. */
function dashGrid() {
  const g = new VoxGrid();
  g.box(-1, 0, -3, 0, 0, 2, 0x7a1a14);
  g.box(-1, 1, -2, 0, 1, 1, 0xd8352a);
  g.set(0, 1, 1, 0xff6a50);
  return g;
}
/** A pair of boot prints behind you (voxel 0.06). Along local z. */
function printGrid() {
  const g = new VoxGrid();
  const P0 = ['.##.', '####', '####', '.##.', '....', '.##.', '.##.'];
  for (const [ox, oz] of [[-4, -2], [2, 2]]) {
    P0.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === '#') g.set(ox + c, 0, oz - r, r < 4 ? 0x8a6a3a : 0x9a7a48); }));
  }
  return g;
}

/** Arena gate: two brick pillars + a beam (no text: the trophy count rides on a sign that faces the camera). Road runs along local z. */
function gateGrid(color) {
  const g = new VoxGrid();
  const col = hex(color), colD = shade(col, -0.3), colL = shade(col, 0.35);
  const half = 15; // inner half width (voxels)
  const PW = 3; // pillar half width
  const top = 34;
  const st = [0xe6e0d2, 0xcbc2ae, 0xf4f0e6];
  for (const sx of [-1, 1]) {
    const cx = sx * (half + PW);
    for (let x = cx - PW; x <= cx + PW; x++) for (let z = -PW; z <= PW; z++) for (let y = -10; y < top; y++) {
      const edge = Math.abs(x - cx) === PW || Math.abs(z) === PW;
      if (!edge && y > -2) continue;
      const course = Math.floor((y + 40) / 3);
      const joint = (y % 3 === 0) || ((x + z + course * 2) % 5 === 0);
      let c = joint ? st[1] : ((x * 3 + y) & 3) ? st[0] : st[2];
      if (y >= top - 9 && y < top - 6) c = col;
      if (y === top - 6) c = colD;
      g.set(x, y, z, c);
    }
    // cap + torch
    g.box(cx - PW - 1, top, -PW - 1, cx + PW + 1, top + 1, PW + 1, colD);
    g.box(cx - 1, top + 2, -1, cx + 1, top + 2, 1, 0x3d4352);
    g.box(cx - 1, top + 3, -1, cx + 1, top + 5, 1, 0xffb84a, true);
    g.set(cx, top + 6, 0, 0xffe08a, true);
  }
  // beam with a stud row
  const by0 = top - 6, by1 = top - 1;
  g.box(-half - PW, by0, -2, half + PW, by1, 2, (x, y) => (y === by0 ? colD : y === by1 ? colL : col));
  g.box(-half - PW, by1 + 1, -2, half + PW, by1 + 1, 2, 0xffc21a);
  for (let x = -half; x <= half; x += 4) for (const z of [-3, 3]) g.set(x, by0 + 2, z, 0xffe680);
  // hanging pennants under the beam
  for (const px of [-half + 2, half - 4]) {
    for (let y = 0; y < 7; y++) for (let x = 0; x < 3; x++) {
      if (y === 6 && x === 1) continue; // V-cut tail
      g.set(px + x, by0 - 1 - y, 0, y === 1 || y === 4 ? colL : col);
    }
  }
  return g;
}
/** The gate's trophy sign: a framed board with a trophy + the count, on two posts (faces +z). */
function gateSignGrid(num, color) {
  const g = new VoxGrid();
  const col = hex(color), colD = shade(col, -0.35);
  const label = String(num);
  const tw = textW(label, 1) + 8;
  const hw = Math.ceil(tw / 2) + 2;
  for (const x of [-hw + 3, hw - 3]) g.box(x, 0, 0, x, 4, 0, 0x3d4352);
  g.box(-hw, 5, -1, hw, 19, 0, colD);
  g.box(-hw + 1, 6, 1, hw - 1, 18, 1, col);
  g.box(-hw + 2, 7, 1, hw - 2, 17, 1, 0xfff6dc);
  const tx = -Math.floor(tw / 2);
  TROPHY.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === '#') g.set(tx + c, 15 - r, 2, r < 2 ? 0xffd23f : 0xe0a010); }));
  text(g, label, tx + 7, 8, 2, '+z', 0x6a3a10, { sy: 2 });
  for (let x = -hw + 2; x <= hw - 2; x += 3) g.set(x, 20, -1, 0xffc21a);
  return g;
}
/** Portcullis between the gate pillars (iron bars). */
function portcullisGrid() {
  const g = new VoxGrid();
  const half = 15, top = 27;
  for (let x = -half; x <= half; x++) for (let y = 0; y < top; y++) {
    const bar = (x + half) % 4 === 1, rail = y % 7 === 3;
    if (!bar && !rail) continue;
    g.set(x, y, 0, bar ? (y === 0 ? 0x3d4352 : 0x6b7386) : 0x4a5262);
    if (bar && y === 0) g.set(x, -1, 0, 0x3d4352);
  }
  return g;
}
const COIN_ICON = ['..####..', '.#oooo#.', '#oyyyyo#', '#oyBByo#', '#oyBByo#', '#oyyyyo#', '.#oooo#.', '..####..'];
const VIAL_ICON = ['..####..', '...##...', '..#ww#..', '..#ww#..', '.#pppp#.', '#pPppPp#', '#ppppPp#', '.######.'];
/** Trail sign at the start of one trail of a fork: a post with a board showing the trail's icon (a coin or a vial) under an arrow. Faces +z. */
function trailSignGrid(tr, sd) {
  const g = new VoxGrid();
  const c = hex(tr.color), d = hex(tr.dark), l = shade(c, 0.35);
  const hw = 8;
  g.box(-1, 0, -1, 0, 26, 0, (x, y) => ((y & 3) === 0 ? 0x6e4224 : 0x8a5a30));
  // board: dark frame, trail colour face with a light top edge, a cream disc for the icon
  g.box(-hw, 13, -1, hw, 27, 0, d);
  g.box(-hw + 1, 14, 1, hw - 1, 26, 1, c);
  g.box(-hw + 1, 26, 1, hw - 1, 26, 1, l);
  g.box(-5, 15, 2, 4, 25, 2, 0xfff6dc);
  const ICON = sd === 'a' ? COIN_ICON : VIAL_ICON;
  const pal = { '#': sd === 'a' ? 0x8a5a00 : 0x2a1a4a, o: 0xc8901a, y: 0xffc21a, B: 0xffe680, w: 0xe8f4ff, p: 0xb072ff, P: 0xe0c0ff };
  ICON.forEach((row, r) => [...row].forEach((ch, x) => { if (ch !== '.') g.set(-4 + x, 24 - r, 3, pal[ch]); }));
  // arrow on top pointing up the trail
  for (let k = 0; k < 5; k++) g.box(-4 + k, 28 + k, 0, 3 - k, 28 + k, 0, k === 4 ? l : c);
  g.box(-1, 28, 0, 0, 28, 0, d);
  return g;
}
const CHEST_ICON = ['.######.', '#yyyyyy#', '#bbbbbb#', '########', '#bbllbb#', '#bbllbb#', '#bbbbbb#', '########'];
const SKULL_ICON = ['.#####.', '#######', '#..#..#', '#..#..#', '###.###', '.#####.', '.#.#.#.'];
/**
 * Treasure-map signpost at the start of a chapter (no text): an arrow board up the road with a
 * chest on it, a second one with a skull (the road boss at the far end). Faces +z.
 */
function mapSignGrid() {
  const g = new VoxGrid();
  g.box(-1, -3, -1, 0, 30, 0, (x, y) => ((y & 3) === 0 ? 0x5a3418 : 0x7a4a24));
  g.box(-1, 31, -1, 0, 31, 0, 0xffc21a);
  const board = (y0, dir, icon, pal) => {
    // a plank with a pointed end (dir +1: points right) and a dark outline
    for (let y = 0; y < 10; y++) for (let x = -9; x <= 10; x++) {
      const tip = dir > 0 ? x - 6 : -x - 5;
      if (tip > 0 && Math.abs(y - 4.5) > 5 - tip) continue;
      const edge = y === 0 || y === 9 || x === -9 || x === 10 || (tip > 0 && Math.abs(y - 4.5) > 4 - tip);
      g.set(x * dir, y0 + y, 1, edge ? 0x4a2e18 : ((x + y * 3) % 7 === 0 ? 0xc89a5a : 0xe0b874));
    }
    icon.forEach((row, r) => [...row].forEach((ch, c) => { if (ch !== '.') g.set((c - 4) * dir - (dir > 0 ? 1 : -1), y0 + 8 - r, 2, pal[ch]); }));
  };
  board(19, 1, CHEST_ICON, { '#': 0x4a2e18, y: 0xffc21a, b: 0xb07840, l: 0xffe680 });
  board(7, -1, SKULL_ICON, { '#': 0xf4ecd8 });
  return g;
}
/** Wooden barricade with hazard stripes + a padlock (blocks a trail that is not open yet). Faces +z, spans x. */
function barricadeGrid() {
  const g = new VoxGrid();
  const W = 13;
  for (const x of [-W + 2, W - 2]) {
    g.box(x - 1, 0, -1, x, 9, 0, 0x6e4224);
    g.box(x - 3, 0, -2, x + 2, 0, 1, 0x4a3018);
  }
  for (const [y0, y1] of [[4, 5], [8, 9]]) g.box(-W, y0, 1, W, y1, 1, (x) => (((x + 40) >> 2) & 1 ? 0xffffff : 0xe8343c));
  g.box(-2, 5, 2, 1, 8, 2, 0xffc21a);
  g.box(-1, 9, 2, 0, 10, 2, 0x8f98aa);
  g.set(-1, 6, 3, 0x3a2a18);
  return g;
}
// The boss barricade comes in parts (they fly apart when the boss falls). Spans x, faces +z (down the road).
/** One end: a spiked cheval-de-frise (crossed sharpened logs). */
function bossFrameGrid() {
  const g = new VoxGrid();
  const log = (y, s) => ((y + (s > 0 ? 1 : 0)) % 3 === 0 ? 0x5a3418 : 0x7a4a24);
  for (let i = 0; i <= 17; i++) {
    for (const s of [1, -1]) {
      const z = Math.round(s * (i - 8.5) * 0.6);
      g.box(-1, i, z - 1, 1, i, z, log(i, s));
    }
  }
  // sharpened, bone-tipped ends
  for (const s of [1, -1]) { const z = Math.round(s * 5.1); g.box(-1, 18, z - 1, 1, 18, z, 0xe8e0c8); g.box(0, 19, z - (s > 0 ? 0 : 1), 0, 19, z - (s > 0 ? 0 : 1), 0xffffff); }
  // an iron band where the logs cross
  g.box(-2, 7, -2, 2, 9, 1, (x, y) => (y === 9 ? 0x6b7386 : 0x3d4352));
  return g;
}
/** The middle: three heavy planks with red / black hazard stripes and iron spikes along the top. */
function bossPlanksGrid() {
  const g = new VoxGrid();
  const W = 17;
  for (const [y0, y1] of [[2, 4], [6, 8], [10, 12]]) {
    g.box(-W, y0, -1, W, y1, 1, (x, y) => (y === y1 ? shade(((x + 40) >> 2) & 1 ? 0xb8202a : 0x1a1420, 0.25) : ((x + 40 + y) >> 2) & 1 ? 0xb8202a : 0x1a1420));
  }
  // iron spikes along the top
  for (let x = -W + 1; x <= W - 1; x += 3) { g.box(x, 13, -1, x, 15, 0, 0x8f98aa); g.set(x, 16, 0, 0xe6ecf4); }
  return g;
}
/** The centre plate: a dark shield with a bone-white pixel skull. */
function bossPlateGrid() {
  const g = new VoxGrid();
  const S = ['..#####..', '.#######.', '#########', '##..#..##', '##..#..##', '####.####', '.#######.', '..#.#.#..'];
  g.box(-6, -1, 0, 5, 9, 0, (x, y) => (x === -6 || x === 5 || y === -1 || y === 9 ? 0xffc21a : 0x2a0e18));
  g.box(-5, 0, 1, 4, 8, 1, 0x3a1424);
  S.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === '#') g.set(-5 + c, 8 - r, 2, 0xf4ecd8); }));
  return g;
}
/** Floating tech tile (orbit road). */
function skyTileGrid() {
  const g = new VoxGrid();
  for (let x = -4; x <= 4; x++) for (let z = -4; z <= 4; z++) {
    const edge = Math.abs(x) === 4 || Math.abs(z) === 4;
    if (Math.abs(x) === 4 && Math.abs(z) === 4) continue;
    g.set(x, 0, z, edge ? 0x29e0ff : ((x + z) & 1 ? 0xeef0f8 : 0xd8dce8), edge);
    g.set(x, -1, z, 0x8f98aa);
  }
  g.box(-1, -2, -1, 1, -2, 1, 0x9ff4ff, true);
  return g;
}
/** Orbit pad under a milestone past the last arena. */
function orbitPadGrid() {
  const g = new VoxGrid();
  const R = 14;
  for (let x = -R; x <= R; x++) for (let z = -R; z <= R; z++) {
    const o = Math.max(Math.abs(x), Math.abs(z), (Math.abs(x) + Math.abs(z)) / 1.38);
    if (o > R) continue;
    const rim = o > R - 1.5;
    g.set(x, 0, z, rim ? 0x8f9bff : (((x >> 2) + (z >> 2)) & 1 ? 0xeef0f8 : 0xd8dce8), rim && ((x + z) & 3) === 0);
    if (o < R - 1) g.set(x, -1, z, 0xb0b6c8);
    if (o < R - 4) g.set(x, -2, z, 0x8f98aa);
  }
  for (const [x, z] of [[-8, -8], [8, -8], [-8, 8], [8, 8]]) {
    g.box(x - 1, -4, z - 1, x + 1, -3, z + 1, 0x6b7386);
    g.box(x - 1, -5, z - 1, x + 1, -5, z + 1, 0x9ff4ff, true);
  }
  return g;
}

// ---------------------------------------------------------------------------
// Shine: a hard-edged glint sweeping diagonally across the claimable chests (voxel-quantised, no sparkles)

const shineTime = { value: 0 };
let shineMats = null;
function shinePair() {
  if (shineMats) return shineMats;
  const m = Mats.solid.clone();
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uShT = shineTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vShP;\nvarying float vShPh;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vShP = transformed;
        #ifdef USE_INSTANCING
          vShPh = fract(instanceMatrix[3].x * 0.137 + instanceMatrix[3].z * 0.291);
        #else
          vShPh = 0.0;
        #endif`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uShT;\nvarying vec3 vShP;\nvarying float vShPh;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        vec3 shq = floor(vShP / ${PV.toFixed(2)} + 0.001);
        float shd = shq.x * 0.6 + shq.y;
        float shc = mix(-16.0, 34.0, fract(uShT * 0.34 + vShPh));
        float shb = step(abs(shd - shc), 1.1) + step(abs(shd - shc + 3.0), 0.55) * 0.6;
        totalEmissiveRadiance += vec3(1.0, 0.96, 0.82) * shb * 0.75;`);
  };
  m.customProgramCacheKey = () => 'chestShine';
  return (shineMats = [m, Mats.glow]);
}

// ---------------------------------------------------------------------------
// Pixel billboards: reward art, light beams, focus arrow (one instanced draw)

function makeBillboards(n, map) {
  const geo = new THREE.PlaneGeometry(1, 1);
  const aFrame = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
  const aPar = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
  geo.setAttribute('aFrame', aFrame);
  geo.setAttribute('aPar', aPar);
  const mat = new THREE.MeshBasicMaterial({ map, fog: true });
  const uTime = { value: 0 };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aFrame;\nattribute vec4 aPar;\nuniform float uTime;')
      .replace('#include <uv_vertex>', `#include <uv_vertex>
        vMapUv = aFrame.xy + uv * aFrame.zw;
        if (aPar.z > 0.5) vMapUv.x += step(0.5, fract(uTime * 2.5 + aPar.x)) * aFrame.z;`)
      .replace('#include <project_vertex>', `
        vec4 mvPosition = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float bsx = length(instanceMatrix[0].xyz), bsy = length(instanceMatrix[1].xyz);
        mvPosition.y += sin(uTime * 2.4 + aPar.x) * aPar.y;
        mvPosition = modelViewMatrix * mvPosition;
        mvPosition.z += aPar.w;
        mvPosition.xy += position.xy * vec2(bsx, bsy);
        gl_Position = projectionMatrix * mvPosition;`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
        if (diffuseColor.a < 0.5) discard;
        diffuseColor.a = 1.0;`);
  };
  mat.customProgramCacheKey = () => 'trophyBillboard';
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.name = 'trophyRewards';
  const c = new THREE.Color(1, 1, 1);
  for (let i = 0; i < n; i++) mesh.setColorAt(i, c);
  const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
  return {
    mesh, uTime,
    set(i, pos, sx, sy = sx) {
      _p.copy(pos);
      _s.set(Math.max(1e-4, sx), Math.max(1e-4, sy), 1);
      mesh.setMatrixAt(i, _m.compose(_p, _q, _s));
      mesh.instanceMatrix.needsUpdate = true;
    },
    frame(i, r) { aFrame.setXYZW(i, r[0], r[1], r[2], r[3]); aFrame.needsUpdate = true; },
    par(i, phase, bob, frames, zoff) { aPar.setXYZW(i, phase, bob, frames, zoff); aPar.needsUpdate = true; },
    tint(i, k) { mesh.setColorAt(i, c.setScalar(k)); mesh.instanceColor.needsUpdate = true; },
    dispose() { geo.dispose(); mat.dispose(); },
  };
}

// ---------------------------------------------------------------------------
// Polylines: arc length, position, tangent

function polyline(pts) {
  const arc = new Float32Array(pts.length);
  for (let i = 1; i < pts.length; i++) arc[i] = arc[i - 1] + pts[i].distanceTo(pts[i - 1]);
  const length = arc[pts.length - 1];
  const idxAt = (s) => {
    let lo = 0, hi = pts.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (arc[mid] <= s) lo = mid; else hi = mid; }
    return lo;
  };
  const posAt = (s, out = new THREE.Vector3()) => {
    s = clamp(s, 0, length);
    const i = idxAt(s), j = Math.min(pts.length - 1, i + 1);
    const u = arc[j] > arc[i] ? (s - arc[i]) / (arc[j] - arc[i]) : 0;
    return out.copy(pts[i]).lerp(pts[j], u);
  };
  const tangentAt = (s, out = new THREE.Vector3()) => {
    const a = posAt(s - 1.5), b = posAt(s + 1.5);
    return out.copy(b).sub(a).setY(0).normalize();
  };
  return { pts, arc, length, idxAt, posAt, tangentAt };
}

// ---------------------------------------------------------------------------

/**
 * zones: the island's zone specs ({ id, x, z, y, ground, color }) in arena order;
 * roadIdx[k]: index of zone k's centre in roadPoints; forks: data/roadForks.js FORKS;
 * T.branches: the side trails the terrain carved ({ chapter, k0, k1, side, pts }).
 */
export function addTrophyPath({ T, root, roadPoints, roadIdx, zones, plinthR, exclude, updaters, forks = [] }) {
  const group = new THREE.Group();
  group.name = 'trophyRoad';
  root.add(group);

  // ------------------------------------------------ the main road polyline (+ orbit extension)
  const main = roadPoints.map((p) => p.clone());
  const last = zones[zones.length - 1];
  const lastArena = ARENAS[ARENAS.length - 1];
  const beyond = TROPHY_ROAD.filter((m) => m.t > lastArena.trophies && !m.arena);
  const skyStart = main.length;
  if (beyond.length) {
    // out across the anchor plaza, then a rising half-turn in front of the elevator tether
    const cx = last.x, cz = last.z, gy = (last.ground ?? last.y);
    const R = 12, a0 = 0, turn = Math.PI * 1.05;
    const rise = Math.min(20, (last.y - gy) - 6);
    for (let r = 1; r <= R; r++) main.push(V(cx + r, gy + Math.max(0, r - 8) * 0.2, cz));
    const y0 = gy + 0.8;
    const len = R * turn;
    const n = Math.ceil(Math.hypot(len, rise));
    for (let i = 1; i <= n; i++) {
      const u = i / n, a = a0 + u * turn; // +a swings south (toward the camera) first
      main.push(V(cx + Math.cos(a) * R, y0 + rise * (u * 0.85 + u * u * 0.15), cz + Math.sin(a) * R));
    }
  }
  main.forEach((p, i) => { p.mi = i; });
  const M0 = polyline(main);

  // ------------------------------------------------ forks: the side trails as 1-unit polylines
  const nearestMain = (p, i0 = 0, i1 = main.length - 1) => {
    let bi = i0, bd = Infinity;
    for (let i = i0; i <= i1; i++) { const d = (main[i].x - p.x) ** 2 + (main[i].z - p.z) ** 2; if (d < bd) { bd = d; bi = i; } }
    return bi;
  };
  const fks = [];
  for (const F of forks) {
    const B = T.branches?.find((b) => b.chapter === F.chapter);
    if (!B) continue;
    const iF = nearestMain(T.road[B.k0]), iJ = nearestMain(T.road[B.k1]);
    if (iJ - iF < 8) continue;
    const bp = [];
    for (let k = 0; k < B.pts.length; k += 4) { const q = B.pts[k]; bp.push(V(q.x, T.heightAt(q.x, q.z), q.z)); }
    const qe = B.pts[B.pts.length - 1];
    bp.push(V(qe.x, T.heightAt(qe.x, qe.z), qe.z));
    // the trail's ends meet the main road: pin them to it
    bp[0].copy(main[iF]);
    bp[bp.length - 1].copy(main[iJ]);
    bp.forEach((p, i) => { p.mi = iF + ((iJ - iF) * i) / (bp.length - 1); });
    fks.push({ F, id: F.id, chapter: F.chapter, B, iF, iJ, bpts: bp, BL: polyline(bp), side: B.side });
  }
  const forkById = Object.fromEntries(fks.map((f) => [f.id, f]));

  // ------------------------------------------------ the route (main road with the picked trails swapped in)
  let route = M0;
  let choices = {};
  function buildRoute() {
    const out = [];
    for (let i = 0; i < main.length; i++) {
      const f = fks.find((q) => q.iF === i);
      if (f && choices[f.id] === 'b') { out.push(...f.bpts.slice(0, -1)); i = f.iJ - 1; continue; }
      out.push(main[i]);
    }
    route = polyline(out);
  }
  /** Arc length on the current route at main-road index mi (fractional). */
  const sOfMi = (mi) => {
    const pts = route.pts;
    let lo = 0, hi = pts.length - 1;
    if (mi <= pts[0].mi) return 0;
    if (mi >= pts[hi].mi) return route.length;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (pts[mid].mi <= mi) lo = mid; else hi = mid; }
    const a = pts[lo], b = pts[hi];
    const u = b.mi > a.mi ? (mi - a.mi) / (b.mi - a.mi) : 0;
    return route.arc[lo] + (route.arc[hi] - route.arc[lo]) * u;
  };
  /** Main-road index (fractional) at route arc length s. */
  const miOfS = (s) => {
    const i = route.idxAt(clamp(s, 0, route.length)), j = Math.min(route.pts.length - 1, i + 1);
    const u = route.arc[j] > route.arc[i] ? (s - route.arc[i]) / (route.arc[j] - route.arc[i]) : 0;
    return route.pts[i].mi + (route.pts[j].mi - route.pts[i].mi) * clamp(u, 0, 1);
  };
  const miOfS0 = (s) => { const i = M0.idxAt(s); const j = Math.min(main.length - 1, i + 1); const u = M0.arc[j] > M0.arc[i] ? (s - M0.arc[i]) / (M0.arc[j] - M0.arc[i]) : 0; return i + u; };

  // ------------------------------------------------ zone gates + chapter ranges (main-road indices)
  const near = (p, Z, r) => Math.hypot(p.x - Z.x, p.z - Z.z) < r;
  const zoneMi = zones.map((Z, k) => roadIdx[k]);
  const exitMi = zones.map((Z, k) => {
    let i = roadIdx[k];
    while (i < roadPoints.length - 1 && near(main[i], Z, plinthR + 2.4)) i++;
    return i;
  });
  const gateMi = zones.map((Z, k) => {
    if (k === 0) return 0;
    let i = roadIdx[k];
    while (i > 0 && near(main[i], Z, plinthR + 3.2)) i--;
    return i;
  });
  if (beyond.length) exitMi[zones.length - 1] = Math.min(main.length - 1, skyStart + 10);
  // arc length of each gate's arch on the main road
  const archS0 = gateMi.map((i) => M0.arc[i] + 0.6);
  // a road boss guards the gate of arena k (data/roadBosses.js)
  const bossOfGate = new Map(ROAD_BOSSES.filter((rb) => rb.k < zones.length && ARENAS[rb.k]).map((rb) => [rb.k, rb]));

  // ------------------------------------------------ milestones
  const arenaIdx = (t) => { let k = 0; for (let i = 0; i < ARENAS.length; i++) if (t >= ARENAS[i].trophies) k = i; return k; };
  const chapters = ARENAS.map(() => []);
  const gates = new Map();
  for (const m of TROPHY_ROAD) {
    const k = m.arena ? ARENAS.findIndex((a) => a.id === m.arena) : -1;
    if (k > 0) gates.set(k, m);
    else chapters[arenaIdx(m.t)].push(m);
  }
  // list entries: { m, s0 (arc on the main road), chapter, gate, fork, side, onBranch, bs (arc on the branch) }
  const list = [];
  const spread = (items, a, b, chapter) => {
    const n = items.length;
    items.forEach((m, i) => {
      const s0 = n === 1 ? (a + b) / 2 : a + ((b - a) * i) / Math.max(1, n - 1);
      list.push({ m, s0, chapter, gate: false });
    });
  };
  ARENAS.forEach((A, k) => {
    if (k >= zones.length) return;
    const g = gates.get(k);
    // the arena chest stands just inside the gate when a road boss guards it (past the barricade), else in front of it
    if (g) list.push({ m: g, s0: bossOfGate.has(k) ? archS0[k] + 2.4 : M0.arc[gateMi[k]] - 2.6, s1: M0.arc[gateMi[k]] - 2.6, chapter: k, gate: true });
    const items = chapters[k].sort((x, y) => x.t - y.t);
    const a = M0.arc[exitMi[k]] + 2.2;
    const nk = k + 1;
    const b = nk < zones.length ? (bossOfGate.has(nk) ? archS0[nk] + LAST_CHEST_AT : M0.arc[gateMi[nk]] - (gates.get(nk) ? 6.4 : 3.6)) : M0.length - 2;
    const f = fks.find((q) => q.chapter === k);
    if (!f) { spread(items, a, b, k); return; }
    // trunk milestones before + after the fork, two bonus chests on each trail inside it
    const sF = M0.arc[f.iF], sJ = M0.arc[f.iJ];
    const nb = Math.min(items.length, f.F.nBefore);
    const before = items.slice(0, nb), after = items.slice(nb);
    // before: from the arena exit to just short of the fork sign; after: from the rejoin to the gate
    if (before.length) spread(before, a, Math.max(a, sF - 4.5), k);
    if (after.length) spread(after, Math.min(b, sJ + (b - sJ < 8 ? 2.4 : 3.5)), b, k);
    for (const side of ['a', 'b']) {
      const tr = f.F[side];
      tr.items.forEach((m, j) => {
        const u = (j + 1) / (tr.items.length + 1);
        if (side === 'a') list.push({ m, s0: sF + (sJ - sF) * (0.12 + u * 0.76), chapter: k, gate: false, fork: f.id, side });
        else list.push({ m, s0: sF, bs: f.BL.length * (0.12 + u * 0.76), chapter: k, gate: false, fork: f.id, side, onBranch: true });
      });
    }
  });
  list.sort((x, y) => x.m.t - y.m.t || (x.side ?? '').localeCompare(y.side ?? ''));

  const color = (k) => hex(ARENAS[k]?.color ?? '#29b6f6');
  const tierOf = (m) => {
    const r = m.reward ?? {};
    if (['mega', 'commander', 'entrance', 'labSkin'].includes(r.type) || (r.type === 'vial' && r.id === 'cashCase')) return 'legendary';
    if (m.arena || ['banner', 'cmdSkin', 'skin'].includes(r.type)) return 'gold';
    if (r.type === 'vial' && ['megaLab', 'hyperchrome'].includes(r.id)) return 'gold';
    if (r.type === 'card' || r.type === 'vial' || r.type === 'bucks') return 'iron';
    return 'wood';
  };
  const chestGeos = {};
  const chestGeo = (tier, look, part) => {
    if (part === 'l' && look === 'open') look = 'norm';
    const key = tier + look + part;
    if (chestGeos[key]) return chestGeos[key];
    const fn = part === 'b' ? () => chestBodyGrid(tier, look === 'glow', look === 'open') : () => chestLidGrid(tier, look === 'glow');
    return (chestGeos[key] = P.geo(`trChest3_${key}`, fn, PV, [0, 0, 0]));
  };
  const flagGeo = P.geo('trFlag', flagGrid, PV, 'bottom');
  const padGeo = P.geo('trOrbitPad', orbitPadGrid, PV, 'bottom');
  const skyTileGeo = P.geo('trSkyTile', skyTileGrid, PV, 'bottom');
  const lockGeo = P.geo('trPadlock', padlockGrid, PV * 0.9, [0, 0, 0]);
  const daisGeo = (tech) => P.geo(tech ? 'trDaisT' : 'trDais', () => daisGrid(tech), PV, [0, 0, 0]);

  const ms = [];
  const tmp = new THREE.Vector3(), tan = new THREE.Vector3();
  let side = 1;
  // a dry, level-ish spot beside line at s0 (nudged along the road if the bank is wet or steep)
  function findSpot(line, s0, sides, sky) {
    for (const ds of [0, 0.8, -0.8, 1.6, -1.6, 2.4, -2.4]) {
      for (const sd of sides) {
        const s = s0 + ds;
        line.posAt(s, tmp);
        line.tangentAt(s, tan);
        let dir = sd;
        if (sky) dir = Math.hypot(tmp.x - tan.z - last.x, tmp.z + tan.x - last.z) > Math.hypot(tmp.x + tan.z - last.x, tmp.z - tan.x - last.z) ? 1 : -1;
        const off = sky ? 2.4 : SIDE;
        const x = tmp.x - tan.z * off * dir, z = tmp.z + tan.x * off * dir;
        if (!sky) {
          const id = T.colAt(x, z);
          if (id < 0 || T.riverD[id] < T.riverW[id] + 1.4) continue;
          if (T.roadD[id] < T.RW + 0.6) continue;
          const lo = T.minHeight(x, z, 0.9), hi = T.maxHeight(x, z, 0.9);
          if (hi - lo > 1.6 || Math.abs(hi - tmp.y) > 2.2) continue;
          if (zones.some((Z) => Math.hypot(x - Z.x, z - Z.z) < plinthR + 1.2)) continue;
          return { s, sd, x, z, y: hi, rp: tmp.clone() };
        }
        return { s, sd, x, z, y: tmp.y, rp: tmp.clone() };
      }
    }
    return null;
  }
  for (const L of list) {
    const k = L.chapter;
    const f = L.fork ? forkById[L.fork] : null;
    const line = L.onBranch ? f.BL : M0;
    const s0 = L.onBranch ? L.bs : L.s0;
    const sky = !L.onBranch && M0.idxAt(s0) >= skyStart;
    // which side of the road: fork chests sit on the outside of their trail
    let sides = [side, -side];
    if (f) { const out = L.side === 'a' ? -f.side : f.side; sides = [out]; }
    let spot = findSpot(line, s0, sides, sky);
    // the arena chest inside a guarded gate: fall back to its old place in front of the gate
    if (!spot && L.s1 !== undefined) spot = findSpot(line, L.s1, sides, sky);
    if (!spot) {
      line.posAt(s0, tmp);
      line.tangentAt(s0, tan);
      const sd = sides[0];
      const x = tmp.x - tan.z * SIDE * sd, z = tmp.z + tan.x * SIDE * sd;
      spot = { s: s0, sd, x, z, y: T.heightAt(x, z), rp: tmp.clone() };
    }
    if (!L.gate && !f) side = -spot.sd;
    const top = spot.y + (sky ? 1.3 : DAIS);
    const g = new THREE.Group();
    g.name = 'milestone:' + L.m.key;
    g.position.set(spot.x, top, spot.z);
    g.rotation.y = FACE_Y;
    group.add(g);
    const trim = f ? hex(TRAILS[L.side].color) : color(k);
    // the sandy X dais (or an orbit pad up in space)
    const dais = P.mesh(daisGeo(sky), { receive: true });
    g.add(dais);
    if (sky) {
      const pad = P.mesh(padGeo, { receive: true });
      pad.position.y = -1.3 - 0.6;
      g.add(pad);
    }
    // the trophy count on a stake sign, front-left of the chest
    const sign = P.mesh(P.geo(`trStake_${L.m.t}_${trim.toString(16)}`, () => stakeSignGrid(L.m.t, trim), PV * 0.8, 'bottom'), {});
    sign.position.set(-2.05, -0.02, 1.05);
    g.add(sign);
    const tier = sky && tierOf(L.m) === 'wood' ? 'tech' : tierOf(L.m);
    const chest = new THREE.Group();
    chest.name = 'chest';
    chest.position.y = 1 * PV; // on the X paint
    chest.scale.setScalar(CS);
    g.add(chest);
    const body = P.mesh(chestGeo(tier, 'norm', 'b'), {});
    const lid = P.mesh(chestGeo(tier, 'norm', 'l'), {});
    lid.position.set(0, CH * PV, -CD * PV);
    chest.add(body, lid);
    const lock = P.mesh(lockGeo, {});
    lock.position.set(-0.05, (CH - 0.5) * PV, (CD + 2.2) * PV);
    lock.visible = false;
    chest.add(lock);
    const flag = P.mesh(flagGeo, {});
    flag.position.set(1.45, 0, -0.85);
    flag.visible = false;
    g.add(flag);
    if (!sky) exclude.push([spot.x, spot.z, 2.6]);
    const anchor = V(spot.x, top + PV, spot.z);
    // where your Commander stands to kick it open: between the chest and the road, on the ground
    const stand = V(spot.rp.x + (spot.x - spot.rp.x) * 0.36, 0, spot.rp.z + (spot.z - spot.rp.z) * 0.36);
    stand.y = sky ? spot.rp.y : Math.max(T.heightAt(stand.x, stand.z), spot.rp.y - 0.4);
    // main-road index this milestone belongs to (branch chests: their spot along the trail's span)
    const mi = L.onBranch ? f.iF + ((f.iJ - f.iF) * spot.s) / f.BL.length : miOfS0(spot.s);
    ms.push({
      m: L.m, key: L.m.key, t: L.m.t, s: 0, mi, chapter: k, gate: L.gate, fork: L.fork ?? null, side: L.side ?? null, onBranch: !!L.onBranch,
      color: trim, tier, sky, roadPos: spot.rp, standPos: stand, ground: spot.y,
      anchor, rewardPos: anchor.clone().add(V(0, 2.75, 0)), group: g, chest, body, lid, lock, flag,
      state: 'norm', lidA: 0, lidT: -1, phase: ms.length * 1.7, pop: 0,
    });
  }

  // ------------------------------------------------ claimable chests: one instanced draw per chest tier
  // (they hop all the time; as separate meshes each would cost its own draw + shadow draw)
  const hops = {};
  for (const M of ms) {
    let H = hops[M.tier];
    if (!H) {
      const n = ms.filter((q) => q.tier === M.tier).length;
      const im = new THREE.InstancedMesh(P.geo(`trChestC3_${M.tier}`, () => chestClosedGrid(M.tier, true), PV, [0, 0, 0]), shinePair(), n);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.frustumCulled = false;
      im.castShadow = true;
      im.name = 'trophyChestsReady';
      for (let i = 0; i < n; i++) im.setMatrixAt(i, ZERO);
      im.count = 0; // only the claimable chests are drawn (compacted in relist)
      group.add(im);
      H = hops[M.tier] = { im, list: [] };
    }
    M.hop = H;
  }
  /** Claimable chests of one tier, packed at the front of its instanced mesh. */
  const relist = (H) => {
    H.list = ms.filter((q) => q.hop === H && q.state === 'glow');
    H.list.forEach((q, i) => { q.slot = i; });
    H.im.count = H.list.length;
  };

  // ------------------------------------------------ arena gates (arches + portcullis + a camera-facing trophy sign)
  const gateObjs = {};
  zones.forEach((Z, k) => {
    if (k === 0) return;
    const A = ARENAS[k];
    if (!A) return;
    const s = archS0[k];
    M0.posAt(s, tmp);
    M0.tangentAt(s, tan);
    const ry = Math.atan2(tan.x, tan.z);
    const y = Math.min(T.minHeight(tmp.x, tmp.z, 2.6), tmp.y);
    const arch = P.mesh(P.geo(`trGate2_${A.id}`, () => gateGrid(A.color), GV, [0, 0, 0]), { receive: true });
    arch.position.set(tmp.x, y, tmp.z);
    arch.rotation.y = ry;
    arch.name = 'gate:' + A.id;
    group.add(arch);
    const sign = P.mesh(P.geo(`trGateSign_${A.id}_${A.trophies}`, () => gateSignGrid(A.trophies, A.color), GV, 'bottom'), {});
    sign.position.set(tmp.x, y + 35 * GV, tmp.z);
    sign.rotation.y = FACE_Y;
    sign.name = 'gateSign';
    group.add(sign);
    const bars = P.mesh(P.geo('trPortcullis', portcullisGrid, GV, [0, 0, 0]), {});
    bars.position.set(tmp.x, Math.max(y, tmp.y - 0.05), tmp.z);
    bars.rotation.y = ry;
    bars.visible = false;
    group.add(bars);
    exclude.push([tmp.x, tmp.z, 3.4]);
    gateObjs[A.id] = { arch, bars, y0: bars.position.y, lift: null };
  });

  // ------------------------------------------------ road boss checkpoints: a spiked barricade in front of each guarded gate
  const bosses = [];
  const bossById = {};
  const _st = new THREE.Vector3();
  const frameGeo = P.geo('trBossFrame', bossFrameGrid, PV, 'bottom');
  const planksGeo = P.geo('trBossPlanks', bossPlanksGrid, PV, 'bottom');
  const plateGeo = P.geo('trBossPlate', bossPlateGrid, PV, 'center');
  for (const [k, rb] of bossOfGate) {
    const sBoss = archS0[k] + BOSS_AT, sBar = archS0[k] + BAR_AT, sStop = archS0[k] + STOP_AT;
    M0.posAt(sBoss, tmp);
    M0.tangentAt(sBoss, tan);
    const pos = V(tmp.x, Math.min(tmp.y, T.heightAt(tmp.x, tmp.z) + 0.02), tmp.z);
    // the boss faces down the road toward you, turned halfway to the camera so its face reads
    const down = Math.atan2(-tan.x, -tan.z);
    let dy = FACE_Y - down;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    const yaw = down + dy * 0.5;
    M0.posAt(sBar, tmp);
    M0.tangentAt(sBar, tan);
    const bar = new THREE.Group();
    bar.name = 'bossBarricade:' + rb.id;
    bar.position.set(tmp.x, T.heightAt(tmp.x, tmp.z) - 0.02, tmp.z);
    // across the road with its skull toward you, turned partly to the camera so it never shows its thin edge
    const bdown = Math.atan2(-tan.x, -tan.z);
    let bdy = FACE_Y - bdown;
    bdy = Math.atan2(Math.sin(bdy), Math.cos(bdy));
    bar.rotation.y = bdown + bdy * 0.55;
    group.add(bar);
    const parts = [];
    for (const sx of [-1, 1]) {
      const fr = P.mesh(frameGeo, {});
      fr.position.set(sx * 1.95, 0, 0);
      bar.add(fr);
      parts.push(fr);
    }
    const planks = P.mesh(planksGeo, {});
    planks.position.set(0, 0, 0);
    bar.add(planks);
    parts.push(planks);
    const plate = P.mesh(plateGeo, {});
    plate.position.set(0, 0.9, 0.22);
    plate.scale.setScalar(1.25);
    bar.add(plate);
    parts.push(plate);
    parts.forEach((pt) => { pt.userData.p0 = pt.position.clone(); pt.userData.r0 = pt.rotation.clone(); pt.userData.s0 = pt.scale.x; });
    // keep the trees well clear: nothing may hide the boss, its barricade or where you wait
    M0.posAt(sStop, _st);
    exclude.push([tmp.x, tmp.z, 4.2], [pos.x, pos.z, 4], [_st.x, _st.z, 3]);
    const B = {
      rb, id: rb.id, k, t: rb.t, pos, yaw, bar, parts, broken: false, anim: null,
      miBoss: miOfS0(sBoss), miStop: miOfS0(sStop), s: 0, stopS: 0,
    };
    bosses.push(B);
    bossById[rb.id] = B;
  }
  bosses.sort((a, b) => a.t - b.t);

  // ------------------------------------------------ fork trail signs + barricades
  for (const f of fks) {
    f.signs = {};
    f.bars = {};
    for (const sd of ['a', 'b']) {
      // a sign on the outside of each trail, a few units after the split
      const pl = sd === 'a' ? M0 : f.BL;
      const out = sd === 'a' ? -f.side : f.side;
      const s1 = sd === 'a' ? M0.arc[f.iF] + 4.5 : 4.5;
      pl.posAt(s1, tmp);
      pl.tangentAt(s1, tan);
      let sx = 0, sz = 0;
      for (const off of [SIDE + 0.4, SIDE + 1.4, SIDE + 2.4]) {
        sx = tmp.x - tan.z * off * out; sz = tmp.z + tan.x * off * out;
        const id = T.colAt(sx, sz);
        if (id >= 0 && T.roadD[id] > T.RW + 0.5) break;
      }
      const sign = P.mesh(P.geo(`trTrailSign2_${sd}`, () => trailSignGrid(TRAILS[sd], sd), 0.09, 'bottom'), {});
      const sy = T.heightAt(sx, sz);
      sign.position.set(sx, sy - 0.05, sz);
      sign.rotation.y = FACE_Y;
      sign.name = 'trailSign:' + f.id + sd;
      group.add(sign);
      exclude.push([sx, sz, 2.4]);
      f.signs[sd] = { mesh: sign, pos: V(sx, sy + 2, sz) };
      // the barricade across this trail's entrance (shown when the other trail was picked)
      const s2 = sd === 'a' ? M0.arc[f.iF] + 8.5 : 8.5;
      pl.posAt(s2, tmp);
      pl.tangentAt(s2, tan);
      const bar = P.mesh(P.geo('trBarricade', barricadeGrid, PV, 'bottom'), {});
      bar.position.set(tmp.x, T.heightAt(tmp.x, tmp.z), tmp.z);
      bar.rotation.y = Math.atan2(tan.x, tan.z);
      bar.visible = false;
      bar.name = 'barricade';
      group.add(bar);
      f.bars[sd] = bar;
    }
    // the fork's own spot (for the camera + taps): between the two signs
    f.signPos = f.signs.a.pos.clone().add(f.signs.b.pos).multiplyScalar(0.5);
    f.signGroup = f.signs.a.mesh;
    f.s0 = 0; f.s1 = 0;
    const mid = Math.round((f.iF + f.iJ) / 2);
    const bm = f.bpts[Math.round((f.bpts.length - 1) / 2)];
    f.mid = V((main[mid].x + bm.x) / 2, (main[mid].y + bm.y) / 2, (main[mid].z + bm.z) / 2);
  }

  // ------------------------------------------------ treasure-map signposts where each chapter of the road starts
  const mapSignGeo = P.geo('trMapSign', mapSignGrid, 0.09, 'bottom');
  zones.forEach((Z, k) => {
    if (k >= zones.length - 1 || !bossOfGate.has(k + 1)) return;
    const s0 = M0.arc[exitMi[k]] + 1.0;
    for (const sd of [-1, 1]) {
      M0.posAt(s0, tmp);
      M0.tangentAt(s0, tan);
      const x = tmp.x - tan.z * (SIDE + 0.4) * sd, z = tmp.z + tan.x * (SIDE + 0.4) * sd;
      const id = T.colAt(x, z);
      if (id < 0 || T.riverD[id] < T.riverW[id] + 1 || T.roadD[id] < T.RW + 0.6) continue;
      if (zones.some((Q) => Math.hypot(x - Q.x, z - Q.z) < plinthR + 0.8)) continue;
      if (ms.some((M) => Math.hypot(M.anchor.x - x, M.anchor.z - z) < 2.6)) continue;
      const sign = P.mesh(mapSignGeo, {});
      sign.position.set(x, T.heightAt(x, z) - 0.05, z);
      sign.rotation.y = FACE_Y;
      sign.name = 'mapSign';
      group.add(sign);
      exclude.push([x, z, 1.6]);
      break;
    }
  });

  // ------------------------------------------------ orbit road tiles
  if (beyond.length) {
    const tiles = [];
    for (let s = M0.arc[skyStart + 9] ?? M0.length; s < M0.length; s += 1.25) {
      M0.posAt(s, tmp);
      M0.tangentAt(s, tan);
      tiles.push([tmp.x, tmp.y - 0.05, tmp.z, Math.atan2(tan.x, tan.z), 1]);
    }
    const im = new THREE.InstancedMesh(skyTileGeo, Mats.pair, tiles.length);
    const o = new THREE.Object3D();
    tiles.forEach(([x, y, z, r], i) => { o.position.set(x, y, z); o.rotation.set(0, r, 0); o.updateMatrix(); im.setMatrixAt(i, o.matrix); });
    im.castShadow = true;
    im.computeBoundingSphere();
    im.name = 'orbitRoad';
    group.add(im);
  }

  // ------------------------------------------------ the treasure-map trail: red dashes ahead, boot prints behind
  // candidate spots along the main road and every side trail (each knows its main-road index + yaw)
  const trailPts = [];
  const addTrail = (line, branch, mi0, mi1) => {
    for (let s = 1.2; s < line.length - 0.6; s += 1.15) {
      line.posAt(s, tmp);
      line.tangentAt(s, tan);
      const mi = branch ? branch.iF + ((branch.iJ - branch.iF) * s) / line.length : miOfS0(s);
      if (mi < mi0 || mi > mi1) continue;
      const id = T.colAt(tmp.x, tmp.z);
      const y = id >= 0 ? Math.max(T.heightAt(tmp.x, tmp.z), tmp.y - 0.3) : tmp.y;
      trailPts.push({ x: tmp.x, y: y + 0.015, z: tmp.z, yaw: Math.atan2(tan.x, tan.z), mi, branch: branch?.id ?? null });
    }
  };
  addTrail(M0, null, 0, skyStart + 8);
  for (const f of fks) addTrail(f.BL, f, f.iF + 0.6, f.iJ - 0.6);
  // skip spots under gate arches, chests and boss barricades
  const busy = [...ms.map((M) => [M.roadPos.x, M.roadPos.z, 0.2]), ...bosses.map((B) => [B.bar.position.x, B.bar.position.z, 1.4])];
  const trail = trailPts.filter((q) => !busy.some(([x, z, r]) => Math.hypot(q.x - x, q.z - z) < r));
  const dashIM = new THREE.InstancedMesh(P.geo('trDash', dashGrid, 0.06, 'bottom', 0), Mats.pair, trail.length);
  const printIM = new THREE.InstancedMesh(P.geo('trPrints', printGrid, 0.06, 'bottom', 0), Mats.pair, trail.length);
  for (const im of [dashIM, printIM]) {
    im.castShadow = false;
    im.receiveShadow = true;
    im.frustumCulled = false;
    im.count = 0;
    group.add(im);
  }
  dashIM.name = 'trailDashes';
  printIM.name = 'trailPrints';
  let trailKey = '';
  function setTrail(s) {
    const youMi = miOfS(s);
    const key = youMi.toFixed(1) + '|' + JSON.stringify(choices);
    if (key === trailKey) return;
    trailKey = key;
    const _o = new THREE.Object3D();
    let nd = 0, np = 0;
    for (const q of trail) {
      // a side trail counts as yours when you picked it; the other one only shows dashes
      const onRoute = !q.branch ? !fks.some((f) => choices[f.id] === 'b' && q.mi > f.iF + 0.5 && q.mi < f.iJ - 0.5) : choices[q.branch] === 'b';
      _o.position.set(q.x, q.y, q.z);
      _o.rotation.set(0, q.yaw, 0);
      _o.updateMatrix();
      if (q.mi > youMi + 0.35) dashIM.setMatrixAt(nd++, _o.matrix);
      else if (onRoute && q.mi < youMi - 0.6) printIM.setMatrixAt(np++, _o.matrix);
    }
    dashIM.count = nd;
    printIM.count = np;
    dashIM.instanceMatrix.needsUpdate = true;
    printIM.instanceMatrix.needsUpdate = true;
  }

  // ------------------------------------------------ coin spill (one instanced pool shared by every chest)
  const COINS = 48;
  const coinIM = new THREE.InstancedMesh(P.geo('trCoin', coinGrid, 0.055, 'center', 0), Mats.pair, COINS);
  coinIM.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  coinIM.frustumCulled = false;
  coinIM.castShadow = false;
  coinIM.name = 'chestCoins';
  for (let i = 0; i < COINS; i++) coinIM.setMatrixAt(i, ZERO);
  group.add(coinIM);
  const coins = Array.from({ length: COINS }, () => ({ t: -1, p: new THREE.Vector3(), v: new THREE.Vector3(), floor: 0, spin: 0, ax: 0, life: 0 }));
  let coinHead = 0;
  let coinsLive = false;
  function spillAt(at, n, top = at.y) {
    for (let k = 0; k < n; k++) {
      const c = coins[coinHead];
      coinHead = (coinHead + 1) % COINS;
      const a = Math.random() * Math.PI * 2, sp = 1.2 + Math.random() * 1.8;
      c.t = -k * 0.022; // a quick stream, not one blob
      c.p.copy(at).add(V((Math.random() - 0.5) * 0.6, 0.95, (Math.random() - 0.5) * 0.3));
      c.v.set(Math.cos(a) * sp, 3.8 + Math.random() * 2.6, Math.sin(a) * sp * 0.7 + 0.7);
      c.top = top + 0.03;
      c.edge = at;
      c.spin = (Math.random() < 0.5 ? -1 : 1) * (6 + Math.random() * 8);
      c.ax = Math.random() * 6.28;
      c.life = 1.7 + Math.random() * 0.6;
      c.bounced = 0;
    }
    coinsLive = true;
  }

  // ------------------------------------------------ billboards (reward art, light beams, focus arrow)
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = ATLAS;
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 2;
  const N = ms.length;
  PER_ROW = Math.max(12, Math.ceil(Math.sqrt(N + 16)));
  CELL = Math.floor(ATLAS / PER_ROW);
  const BEAMS = N, ARROW = N * 2;
  const bb = makeBillboards(N * 2 + 1, tex);
  group.add(bb.mesh);
  const rect = (i) => {
    const cx = (i % PER_ROW) * CELL, cy = Math.floor(i / PER_ROW) * CELL;
    return [cx / ATLAS, 1 - (cy + CELL) / ATLAS, CELL / ATLAS, CELL / ATLAS];
  };
  // fixed cells after the reward cells: a light beam per chest tier (2 frames side by side) and the arrow
  const BEAM_TIERS = ['wood', 'iron', 'gold', 'legendary', 'tech'];
  const beamCell0 = Math.ceil((N + 0.5) / PER_ROW) * PER_ROW; // start of a fresh row
  BEAM_TIERS.forEach((tr, j) => { paintBeam(ctx, beamCell0 + j * 2, tr, 0); paintBeam(ctx, beamCell0 + j * 2 + 1, tr, 1); });
  const arrowCell = beamCell0 + BEAM_TIERS.length * 2;
  paintArrow(ctx, arrowCell);
  const painted = new Array(N).fill(false);
  const hide = new THREE.Vector3(0, -999, 0);
  ms.forEach((M, i) => {
    bb.frame(i, rect(i));
    bb.par(i, M.phase, 0.12, 0, 0);
    bb.set(i, hide, 0);
    bb.frame(BEAMS + i, rect(beamCell0 + BEAM_TIERS.indexOf(CHEST[M.tier].beam) * 2));
    bb.par(BEAMS + i, M.phase, 0, 1, -1.4);
    bb.set(BEAMS + i, hide, 0);
  });
  bb.frame(ARROW, rect(arrowCell));
  bb.par(ARROW, 0, 0.18, 0, 0.2);
  bb.set(ARROW, hide, 0);
  let focus = -1;
  const place = (i) => {
    const M = ms[i];
    const big = M.gate || M.tier === 'gold' || M.tier === 'legendary';
    const sz = (painted[i] ? 1.65 : 0) * (big ? 1.18 : 1);
    bb.set(i, M.rewardPos, sz);
    bb.tint(i, M.state === 'lock' ? 0.78 : M.state === 'open' ? 0.0 : 1);
    if (M.state === 'open') bb.set(i, hide, 0);
    const beam = M.state === 'glow';
    bb.set(BEAMS + i, beam ? tmp.copy(M.anchor).add(V(0, 2.55, 0)) : hide, beam ? 1.6 : 0, beam ? 5.2 : 0);
  };

  // ------------------------------------------------ state + animation
  function setState(i, st, o = {}) {
    const M = ms[i];
    const look = st === 'locked' ? 'lock' : st === 'ready' ? 'glow' : 'open';
    if (M.state === look) return;
    const wasLock = M.state === 'lock';
    M.state = look;
    const geoLook = look === 'glow' ? 'glow' : look === 'open' ? 'open' : 'norm';
    M.body.geometry = chestGeo(M.tier, geoLook, 'b');
    M.lid.geometry = chestGeo(M.tier, geoLook, 'l');
    M.flag.visible = look === 'open';
    M.lock.visible = look === 'lock';
    if (look === 'open') { if (M.lidT < 0) { M.lidA = 1.95; M.lid.rotation.x = -M.lidA; } }
    else { M.lidA = 0; M.lidT = -1; M.lid.rotation.x = 0; }
    M.chest.position.y = PV;
    M.chest.scale.setScalar(CS);
    // a chest that just became claimable pops (its padlock bursts off)
    M.pop = o.pop && wasLock && look === 'glow' ? 1 : 0;
    // a claimable chest hops in the instanced set; the still one hides meanwhile
    M.chest.visible = look !== 'glow';
    relist(M.hop);
    place(i);
  }
  function open(i) {
    const M = ms[i];
    M.lidT = 0;
    M.state = 'opening';
    M.spilled = false;
    M.body.geometry = chestGeo(M.tier, 'glow', 'b');
    M.lid.geometry = chestGeo(M.tier, 'glow', 'l');
    M.lid.rotation.x = 0;
    M.flag.visible = false;
    M.lock.visible = false;
    M.chest.visible = true;
    relist(M.hop);
    bb.tint(i, 1);
    bb.set(BEAMS + i, hide, 0);
  }
  function setFocus(i) {
    focus = i;
    if (i < 0) bb.set(ARROW, hide, 0);
  }
  const _a = new THREE.Vector3(), _o = new THREE.Object3D(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s1 = new THREE.Vector3(1, 1, 1), _m4 = new THREE.Matrix4();
  updaters.push((dt, t) => {
    bb.uTime.value = t % 1000;
    shineTime.value = t % 1000;
    for (const tier in hops) {
      const H = hops[tier];
      for (let j = 0; j < H.list.length; j++) {
        const M = H.list[j];
        // hop + squash, a beat apart from the neighbours (a fresh one pops up first)
        const k = (t * 1.6 + M.phase) % 2;
        const hop = k < 0.5 ? Math.sin((k / 0.5) * Math.PI) : 0;
        const sq = k < 0.5 ? 1 + Math.sin((k / 0.5) * Math.PI * 2) * 0.06 : 1 - Math.max(0, Math.sin(((k - 0.5) / 0.25) * Math.PI)) * 0.08 * (k < 0.75 ? 1 : 0);
        let pop = 0;
        if (M.pop > 0) { M.pop = Math.max(0, M.pop - dt * 2.2); pop = Math.sin((1 - M.pop) * Math.PI) * (M.pop > 0 ? 1 : 0); }
        _o.position.copy(M.anchor);
        _o.position.y += hop * 0.28 + pop * 0.9;
        _o.rotation.set(0, FACE_Y + pop * 0.6, Math.sin(t * 9 + M.phase) * 0.04 * hop);
        const ps = CS * (1 + pop * 0.22);
        _o.scale.set(ps / Math.sqrt(sq), ps * sq, ps / Math.sqrt(sq));
        _o.updateMatrix();
        H.im.setMatrixAt(j, _o.matrix);
      }
      if (H.list.length) H.im.instanceMatrix.needsUpdate = true;
    }
    for (let i = 0; i < N; i++) {
      const M = ms[i];
      if (M.state === 'opening') {
        M.lidT += dt;
        // a rattle, then the lid bursts open with an overshoot and the coins spill out
        const rattle = M.lidT < 0.22 ? Math.sin(M.lidT * 70) * 0.06 * (1 - M.lidT / 0.22) : 0;
        M.chest.rotation.z = rattle;
        const u = clamp((M.lidT - 0.18) / 0.4, 0, 1);
        const e = 1 - Math.pow(1 - u, 3);
        M.lidA = 2.2 * e - Math.sin(u * Math.PI) * 0.15;
        M.lid.rotation.x = -M.lidA;
        const k = clamp((M.lidT - 0.12) / 0.3, 0, 1);
        const sq = 1 + Math.sin(k * Math.PI) * 0.16;
        M.chest.scale.set(sq * CS, (2 - sq) * CS, sq * CS);
        M.chest.position.y = PV + Math.sin(k * Math.PI) * 0.18;
        if (!M.spilled && M.lidT > 0.26) {
          M.spilled = true;
          const r = M.m.reward ?? {};
          spillAt(M.anchor, r.type === 'coins' ? 30 : M.tier === 'legendary' ? 24 : 14, M.anchor.y);
        }
        // the reward pops up and out
        const ru = clamp((M.lidT - 0.2) / 0.55, 0, 1);
        bb.set(i, _a.copy(M.rewardPos).add(V(0, ru * 1.4, 0)), (1.65 + Math.sin(ru * Math.PI) * 0.8) * (1 - ru * ru));
        if (M.lidT > 0.85) { M.state = 'norm'; M.lidT = -1; M.chest.rotation.z = 0; setState(i, 'claimed'); M.lidA = 1.95; M.lid.rotation.x = -1.95; }
      }
    }
    // spilled coins: ballistic arcs, a bounce or two on the dais (or the ground), then they shrink away
    if (coinsLive) {
      let any = false;
      for (let i = 0; i < COINS; i++) {
        const c = coins[i];
        if (c.t === -1) continue;
        c.t += dt;
        if (c.t < 0) { coinIM.setMatrixAt(i, ZERO); any = true; continue; }
        if (c.t > c.life) { c.t = -1; coinIM.setMatrixAt(i, ZERO); continue; }
        any = true;
        c.v.y -= 16 * dt;
        c.p.addScaledVector(c.v, dt);
        const onTop = Math.abs(c.p.x - c.edge.x) < 1.3 && Math.abs(c.p.z - c.edge.z) < 1.0;
        const floor = onTop ? c.top : T.heightAt(c.p.x, c.p.z) + 0.03;
        if (c.p.y < floor) {
          c.p.y = floor;
          if (c.bounced < 2) { c.v.y = Math.abs(c.v.y) * 0.38; c.v.x *= 0.6; c.v.z *= 0.6; c.bounced++; } else { c.v.set(0, 0, 0); }
        }
        c.ax += c.spin * dt * (c.bounced < 2 ? 1 : 0.2);
        const lie = c.bounced >= 2 ? Math.PI / 2 : 0;
        _e.set(lie, c.ax, 0, 'YXZ');
        _q.setFromEuler(_e);
        const sc = c.t > c.life - 0.3 ? Math.max(0.001, (c.life - c.t) / 0.3) : 1;
        _s1.setScalar(sc);
        coinIM.setMatrixAt(i, _m4.compose(c.p, _q, _s1));
      }
      coinIM.instanceMatrix.needsUpdate = true;
      coinsLive = any;
    }
    for (const id in gateObjs) {
      const G = gateObjs[id];
      if (!G.lift) continue;
      G.lift.t += dt;
      const u = G.lift.t;
      G.bars.position.y = G.y0 + (u < 0.5 ? Math.sin(u * 50) * 0.04 : Math.pow(Math.min(1, (u - 0.5) / 1.1), 2) * 3.6);
      if (u > 1.6) { G.bars.visible = false; G.bars.position.y = G.y0; G.lift = null; }
    }
    for (const B of bosses) {
      const A = B.anim;
      if (!A) continue;
      A.t += dt;
      // the barricade bursts: every part flies off spinning, bounces once and sinks away
      for (const pt of B.parts) {
        const d = pt.userData.fly;
        d.v.y -= 15 * dt;
        pt.position.addScaledVector(d.v, dt);
        if (pt.position.y < -0.1 && d.v.y < 0 && !d.b) { d.b = true; d.v.y *= -0.3; d.v.x *= 0.5; d.v.z *= 0.5; }
        pt.rotation.x += d.r.x * dt; pt.rotation.z += d.r.z * dt;
        if (A.t > 1.1) pt.scale.setScalar(Math.max(0.001, (pt.userData.s0 ?? 1) * (1 - (A.t - 1.1) / 0.4)));
      }
      if (A.t > 1.55) { B.anim = null; B.bar.visible = false; resetParts(B); }
    }
    for (const f of fks) {
      for (const sd of ['a', 'b']) {
        const A = f.bars[sd].anim;
        if (!A) continue;
        A.t += dt;
        const bar = f.bars[sd];
        if (A.out) {
          // the barricade topples backwards and sinks
          bar.rotation.x = -(Math.min(1, A.t / 0.5) ** 2) * 1.4;
          bar.position.y = A.y0 - Math.max(0, A.t - 0.4) * 3;
          if (A.t > 1.0) { bar.visible = false; bar.rotation.x = 0; bar.position.y = A.y0; f.bars[sd].anim = null; }
        } else {
          const k = Math.min(1, A.t / 0.35);
          bar.scale.set(1, 0.2 + 0.8 * (1 - Math.pow(1 - k, 3)) + Math.sin(k * Math.PI) * 0.15, 1);
          if (A.t > 0.35) { bar.scale.set(1, 1, 1); f.bars[sd].anim = null; }
        }
      }
    }
    if (focus >= 0) {
      const M = ms[focus];
      bb.set(ARROW, _a.copy(M.rewardPos).add(V(0, M.state === 'open' ? 0.2 : 1.6, 0)), 0.9);
    }
  });
  function resetParts(B) {
    for (const pt of B.parts) { pt.position.copy(pt.userData.p0); pt.rotation.copy(pt.userData.r0); pt.scale.setScalar(pt.userData.s0 ?? 1); }
  }

  // ------------------------------------------------ route + s values
  function reroute() {
    buildRoute();
    for (const M of ms) M.s = sOfMi(M.mi);
    for (const f of fks) { f.s0 = sOfMi(f.iF); f.s1 = sOfMi(f.iJ); f.sSign = f.s0 + 2; }
    for (const B of bosses) { B.s = sOfMi(B.miBoss); B.stopS = sOfMi(B.miStop); }
    api.length = route.length;
    api.zoneS = zoneMi.map(sOfMi);
    api.exitS = exitMi.map(sOfMi);
    api.gateS = gateMi.map(sOfMi);
    trailKey = '';
  }

  const api = {
    group, milestones: ms, forks: fks, bosses, length: 0, camDir: CAM_DIR.clone(), faceY: FACE_Y,
    zoneS: [], gateS: [], exitS: [],
    posAt: (s, out) => route.posAt(s, out),
    tangentAt: (s, out) => route.tangentAt(s, out),
    /** Reroute through the picked trails: { forkId: 'a' | 'b' } (unpicked forks follow the main road). */
    setChoices(c) {
      const next = { ...c };
      const same = fks.every((f) => (next[f.id] ?? 'a') === (choices[f.id] ?? 'a'));
      choices = next;
      if (!same || !route.pts.length || api.length === 0) reroute();
    },
    /** Barricade across one trail's entrance (side 'a' | 'b'), or none (null). animate: it pops up / topples. */
    setBarrier(id, sd, o = {}) {
      const f = forkById[id];
      if (!f) return;
      for (const k of ['a', 'b']) {
        const bar = f.bars[k];
        const want = k === sd;
        if (bar.visible === want && !bar.anim) continue;
        if (want) { bar.visible = true; bar.anim = o.animate ? { t: 0, out: false } : null; if (!o.animate) bar.scale.set(1, 1, 1); }
        else if (o.animate && bar.visible) bar.anim = { t: 0, out: true, y0: bar.position.y };
        else { bar.visible = false; bar.anim = null; }
      }
    },
    /** A road boss's barricade standing (up) or gone. */
    setBossBarrier(id, up) {
      const B = bossById[id];
      if (!B || B.anim) return;
      B.broken = !up;
      B.bar.visible = up;
      if (up) resetParts(B);
    },
    /** The road boss fell: its barricade bursts apart. */
    breakBarricade(id) {
      const B = bossById[id];
      if (!B || B.broken) return;
      B.broken = true;
      B.bar.visible = true;
      B.parts.forEach((pt, j) => {
        const sx = pt.position.x === 0 ? (j % 2 ? 1 : -1) * 0.4 : Math.sign(pt.position.x);
        pt.userData.fly = { v: V(sx * (2.2 + Math.random() * 1.6), 4.2 + Math.random() * 2.2, -1.5 - Math.random() * 2), r: V(-4 - Math.random() * 6, 0, sx * (3 + Math.random() * 4)), b: false };
      });
      B.anim = { t: 0 };
    },
    sOfTrophies(t, ch = choices) {
      // keypoints: each arena's threshold sits just past its plinth, each milestone at its chest; a road
      // boss checkpoint in front of its barricade; just short of the arena threshold you wait at the arch;
      // a fork with no trail picked keeps you at its signpost
      const keys = [];
      ARENAS.forEach((A, k) => {
        if (k >= zones.length) return;
        keys.push([A.trophies, api.exitS[k] - 1.3]);
        if (k > 0) keys.push([A.trophies - 0.5, api.gateS[k] + 0.6 - 1.4]);
      });
      for (const M of ms) {
        if (M.gate) continue;
        if (M.fork && M.side !== (ch[M.fork] ?? 'a')) continue;
        if (M.fork && !ch[M.fork]) continue;
        keys.push([M.t, M.s]);
      }
      for (const B of bosses) keys.push([B.t, B.stopS]);
      for (const f of fks) {
        if (ch[f.id]) continue;
        keys.push([f.F.lo + 0.001, f.sSign], [f.F.hi - 0.001, f.sSign]);
      }
      keys.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      if (t <= keys[0][0]) return keys[0][1];
      for (let i = 0; i < keys.length - 1; i++) {
        const [t0, s0] = keys[i], [t1, s1] = keys[i + 1];
        if (t >= t0 && t < t1) return s0 + (s1 - s0) * ((t - t0) / (t1 - t0));
      }
      return Math.min(api.length - 1, keys[keys.length - 1][1] + 1.5);
    },
    setState(i, st, o) { setState(i, st, o); },
    /** Portcullis down (locked) or up; animate: it rattles and slides up out of sight. */
    setGateLocked(id, locked, o = {}) {
      const G = gateObjs[id];
      if (!G || G.lift) return;
      if (!locked && o.animate && G.bars.visible) { G.lift = { t: 0 }; return; }
      G.bars.visible = locked;
    },
    gateLocked: (id) => !!gateObjs[id]?.bars.visible && !gateObjs[id]?.lift,
    open, setFocus, spillAt, setTrail,
    /** Body + lid geometry of a chest tier (the boss loot chest), with the lid's hinge offset. */
    chestParts: (tier) => ({ body: chestGeo(tier, 'glow', 'b'), lid: chestGeo(tier, 'glow', 'l'), lidY: CH * PV, lidZ: -CD * PV }),
    atlas: {
      canvas, ctx, cell: CELL,
      origin: (i) => [(i % PER_ROW) * CELL, Math.floor(i / PER_ROW) * CELL],
      painted(i) { painted[i] = true; place(i); },
      commit() { tex.needsUpdate = true; },
    },
    dispose() { bb.dispose(); tex.dispose(); },
  };
  reroute();
  return api;
}

// ---------------------------------------------------------------------------
// fixed atlas art

function px(ctx, x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); }
const BEAM_COL = {
  wood: ['#fffbe8', '#ffe69a', '#ffc94a'],
  iron: ['#f2feff', '#a6f2ff', '#3ec8f4'],
  gold: ['#fffbe0', '#ffe680', '#ffb21a'],
  legendary: ['#fff2fc', '#ffa6e6', '#c063ff'],
  tech: ['#f2feff', '#b8f6ff', '#8f9bff'],
};
/**
 * Pixel light beam rising behind a claimable chest, in its rarity colour: a bright core, a coloured
 * body and a dithered rim that thins out toward the top (16 x 52 px, drawn into a square cell and
 * shown 1.6 x 5.2 so the pixels stay square). Frame 1 shifts the dither one step (a slow shimmer).
 */
function paintBeam(ctx, cell, tier, f) {
  const x0 = (cell % PER_ROW) * CELL, y0 = Math.floor(cell / PER_ROW) * CELL;
  const W = 16, H = 52;
  const [core, mid, rim] = BEAM_COL[tier];
  const tmpC = document.createElement('canvas');
  tmpC.width = W; tmpC.height = H;
  const c = tmpC.getContext('2d');
  for (let y = 0; y < H; y++) {
    const u = 1 - y / (H - 1); // 0 at the top, 1 at the bottom
    const half = 1.6 + u * 4.6;
    for (let x = 0; x < W; x++) {
      const d = Math.abs(x + 0.5 - W / 2);
      if (d > half) continue;
      const chk = ((x + y + f) & 1) === 0;
      const sparse = ((x + 2 * y + f * 2) & 3) === 0;
      let col = null;
      if (d <= 0.6 + u * 1.1) col = u > 0.18 || chk ? core : null;
      else if (d <= half - 1.4) col = u > 0.5 ? mid : u > 0.22 ? (chk ? mid : null) : sparse ? mid : null;
      else col = u > 0.3 ? (chk ? rim : null) : sparse ? rim : null;
      if (!col) continue;
      c.fillStyle = col;
      c.fillRect(x, y, 1, 1);
    }
  }
  // a few motes drifting up beside the beam (they move up a step from one frame to the next)
  for (const [mx, my] of [[1, 40], [14, 30], [2, 18], [13, 9]]) { c.fillStyle = core; c.fillRect(mx, (my - f * 4 + H) % H, 1, 2); }
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(x0, y0, CELL, CELL);
  ctx.drawImage(tmpC, x0, y0, CELL, CELL);
}
/** Bouncing gold pixel arrow pointing down at the focused reward. */
function paintArrow(ctx, cell) {
  const x0 = (cell % PER_ROW) * CELL, y0 = Math.floor(cell / PER_ROW) * CELL;
  const A = [
    '....#######....',
    '....#ooooo#....',
    '....#oyyyo#....',
    '....#oyyyo#....',
    '....#oyyyo#....',
    '#####oyyyo#####',
    '#ooooyyyyyoooo#',
    '.#oyyyyyyyyyo#.',
    '..#oyyyyyyyo#..',
    '...#oyyyyyo#...',
    '....#oyyyo#....',
    '.....#oyo#.....',
    '......#o#......',
    '.......#.......',
  ];
  const s = Math.floor(CELL / 16), ox = x0 + Math.round((CELL - 15 * s) / 2), oy = y0 + Math.round((CELL - 14 * s) / 2);
  A.forEach((row, r) => [...row].forEach((ch, c) => {
    if (ch === '.') return;
    px(ctx, ox + c * s, oy + r * s, s, s, ch === '#' ? '#120c24' : ch === 'o' ? '#ffe680' : '#ffc21a');
  }));
}

/** A treasure chest's body + lid geometries (shared with the road's chests) for other island props. */
export function treasureChest(tier = 'wood') {
  return {
    body: P.geo(`trChest3_${tier}normb`, () => chestBodyGrid(tier, false), PV, [0, 0, 0]),
    lid: P.geo(`trChest3_${tier}norml`, () => chestLidGrid(tier, false), PV, [0, 0, 0]),
    lidY: CH * PV, lidZ: -CD * PV,
  };
}

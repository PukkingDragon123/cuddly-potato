// 3D reward items for the FOOD SEASON pass path: every pass reward floats above
// its stand as a real model (Swarm figures, vials, Commanders in their outfit)
// or a crafted voxel prop (coin stacks, Beast Buck gems, banners, serums, a
// film clapper for entrances, a gift box for anything new). Pictures that only
// exist as renders (spells, lab skins) sit on a voxel trading card.
//
//   const it = makeRewardItem(reward)  ->  { obj, update(dt), dispose(), h }
// obj stands on y = 0, about 1.1 units tall, facing +z.
import * as THREE from 'three';
import { VoxGrid, Mats, makeMesh } from '../../core/voxel.js';
import { aoGeometry } from '../../models/props/voxmesh.js';
import { shade, hash3 } from '../../core/util.js';
import { Chibi } from '../../core/chibi.js';
import { createSwarm } from '../../models/swarmModels.js';
import { makeVial } from '../../models/props/vials.js';
import { text } from '../../models/props/common.js';
import { CHARACTERS } from '../../data/characters.js';
import { COMMANDERS } from '../../data/commanders.js';
import { CMD_SKINS, SWARM_SKINS, BANNERS } from '../../data/season.js';
import { cardDef, isSpell } from '../../data/cards.js';
import { state } from '../../game/state.js';

const GOLD = 0xffc21a, GOLD_D = 0xc8901a, GOLD_L = 0xffe680;
const RARITY = { common: 0x8fb4e8, rare: 0xff9a2e, epic: 0xc063ff, legendary: 0x3ff2c8, mythic: 0xff2e88 };
const geo = (id, fn, scale = 0.05, pivot = 'bottom') => {
  const g = aoGeometry('pzi:' + id, fn, { scale, pivot, jitter: 0.03 });
  g.name = id;
  return g;
};

// ---------------------------------------------------------------------------
// Voxel props

function coin(g, x0, y0, z0, r = 5) {
  // a coin lying flat: rim, face and a little $ on top
  g.cylinder(x0, z0, y0, y0 + 1, r, (x, y, z) => (Math.hypot(x - x0, z - z0) > r - 1.1 ? GOLD_D : y === y0 + 1 ? GOLD : GOLD_D));
  g.set(x0, y0 + 2, z0, GOLD_L).set(x0, y0 + 2, z0 - 1, GOLD_L).set(x0 - 1, y0 + 2, z0 + 1, GOLD_L);
}
function standingCoin(g, cx, cy, cz, r = 7) {
  for (let x = -r; x <= r; x++) for (let y = -r; y <= r; y++) {
    const d = Math.hypot(x + 0.5, y + 0.5);
    if (d > r + 0.2) continue;
    const rim = d > r - 1.4;
    for (let z = -1; z <= 0; z++) g.set(cx + x, cy + y, cz + z, rim ? (((x + y) & 1) ? GOLD_D : GOLD) : z === 0 ? GOLD : GOLD_D);
  }
  // embossed $
  text(g, '$', cx, cy - 3, cz + 1, '+z', GOLD_L, { center: true });
}
const coinGrids = {
  small: () => { const g = new VoxGrid(); for (let k = 0; k < 4; k++) coin(g, -3, k * 2, 1); standingCoin(g, 4, 7, -1, 6); return g; },
  stack: () => {
    const g = new VoxGrid();
    for (let k = 0; k < 6; k++) coin(g, -5, k * 2, -1);
    for (let k = 0; k < 4; k++) coin(g, 4, k * 2, 2);
    standingCoin(g, 1, 8, 5, 6);
    return g;
  },
  pile: () => {
    const g = new VoxGrid();
    for (let x = -10; x <= 10; x++) for (let z = -8; z <= 8; z++) {
      const r = Math.hypot(x / 10, z / 8);
      if (r > 1) continue;
      const top = Math.round((1 - r * r) * 8 + hash3(x, 2, z) * 1.5);
      for (let y = 0; y <= top; y++) g.set(x, y, z, y === top ? (hash3(x, y, z) < 0.35 ? GOLD_L : GOLD) : GOLD_D);
    }
    standingCoin(g, 0, 15, 2, 7);
    return g;
  },
  chest: () => {
    const g = new VoxGrid();
    const wood = 0x8a4a24, woodD = 0x5e3018;
    g.box(-11, 0, -7, 10, 9, 6, (x, y, z) => ((y === 0 || y === 9 || x === -11 || x === 10 || z === -7 || z === 6) ? ((x === -11 || x === 10 || y === 9) ? GOLD_D : (y & 2 ? wood : woodD)) : null));
    for (const x of [-6, 5]) g.box(x, 0, 7, x, 9, 7, GOLD);
    g.box(-2, 4, 7, 1, 7, 7, GOLD_L);
    // heap of gold inside + spilling over
    for (let x = -10; x <= 9; x++) for (let z = -6; z <= 5; z++) {
      const top = 9 + Math.round((1 - Math.abs(x / 11)) * 4 + hash3(x, 3, z) * 2);
      for (let y = 6; y <= top; y++) g.set(x, y, z, y === top ? (hash3(x, y, z) < 0.3 ? GOLD_L : GOLD) : GOLD_D);
    }
    // open lid leaning back
    for (let y = 0; y <= 10; y++) g.box(-11, 10 + y, -8 - Math.round(y * 0.35), 10, 10 + y, -8 - Math.round(y * 0.35), (x) => (x === -11 || x === 10 || y === 10 ? GOLD_D : (y & 2 ? wood : woodD)));
    g.set(-4, 16, 3, 0xff4fa3, true).set(5, 15, -2, 0x29b6f6, true);
    return g;
  },
};

function gemGrid(col = 0xff4fa3) {
  const g = new VoxGrid();
  const L = shade(col, 0.45), D = shade(col, -0.3), DD = shade(col, -0.5);
  // crown (y 0..4): table on top, facets around; pavilion (y -1..-9) narrows to a point
  for (let y = -9; y <= 4; y++) {
    const r = y >= 0 ? 7 - y * 0.75 : 7 + y * 0.78;
    for (let x = -8; x <= 8; x++) for (let z = -8; z <= 8; z++) {
      const d = Math.hypot(x + 0.5, z + 0.5);
      if (d > r) continue;
      const sector = Math.floor(((Math.atan2(z + 0.5, x + 0.5) + Math.PI) / (Math.PI * 2)) * 8);
      let c = y === 4 ? L : y >= 0 ? (sector & 1 ? col : L) : (sector & 1 ? D : col);
      if (y < -5) c = sector & 1 ? DD : D;
      g.set(x, y + 9, z, c);
    }
  }
  g.set(-2, 13, 2, 0xffffff, true).set(-3, 12, 3, 0xffffff, true);
  return g;
}
const gemSets = {
  one: () => gemGrid(),
  two: () => { const g = gemGrid(); const b = gemGrid(0xff7ac0); b.forEach((x, y, z, c, gl) => { if (y > 2) g.set(x + 9, y - 4, z + 5, c, gl); }); return g; },
  pile: () => {
    const g = gemGrid();
    const b = gemGrid(0xff7ac0), c2 = gemGrid(0xd8308a);
    b.forEach((x, y, z, c, gl) => { if (y > 3) g.set(x - 10, y - 5, z + 4, c, gl); });
    c2.forEach((x, y, z, c, gl) => { if (y > 3) g.set(x + 10, y - 5, z + 3, c, gl); });
    return g;
  },
};

function bannerGrid(cols) {
  // a hanging banner on a T-stand (crossbar on top, swallowtail at the bottom), striped in the banner's colours
  const g = new VoxGrid();
  g.box(-1, 0, -1, 0, 30, 0, 0xd7dde6);
  g.box(-4, 0, -3, 3, 1, 2, 0x8a93a8);
  g.box(-10, 30, 0, 9, 31, 1, GOLD);
  g.set(-11, 30, 0, GOLD_L).set(10, 30, 0, GOLD_L);
  for (let x = -8; x <= 7; x++) for (let y = 8; y <= 29; y++) {
    const tail = 8 + Math.round(Math.abs(x + 0.5) * 0.7);
    if (y < tail) continue;
    const c = cols[Math.floor((y + 40) / 4) % cols.length];
    g.set(x, y, 2, (x === -8 || x === 7) ? shade(c, -0.2) : c);
  }
  // a gold star in the middle
  for (const [x, y] of [[0, 22], [-1, 21], [0, 21], [1, 21], [-2, 20], [-1, 20], [0, 20], [1, 20], [2, 20], [-1, 19], [0, 19], [1, 19], [-2, 18], [2, 18]]) g.set(x, y, 3, GOLD_L);
  return g;
}

function serumGrid() {
  // MEGA serum: a round-bottom flask of glowing goo with a cork and a bolt label
  const g = new VoxGrid();
  g.ellipsoid(0, 7, 0, 7, 7, 7, (x, y, z) => (y < 9 ? null : 0xd8f4ff));
  g.ellipsoid(0, 7, 0, 6, 6, 6, (x, y, z) => (y < 9 ? (y < 4 ? 0xff2e88 : 0xff6ab4) : null), true);
  g.box(-2, 13, -2, 1, 19, 1, 0xd8f4ff);
  g.box(-1, 13, -1, 0, 16, 0, 0xff6ab4, true);
  g.box(-3, 20, -3, 2, 22, 2, 0xa0673a);
  g.box(-3, 5, 6, 2, 9, 6, 0xffffff);
  g.set(0, 8, 7, GOLD).set(-1, 7, 7, GOLD).set(0, 7, 7, GOLD).set(0, 6, 7, GOLD);
  return g;
}

function clapperGrid() {
  const g = new VoxGrid();
  g.box(-10, 0, -1, 9, 13, 1, 0x1a1a24);
  g.box(-9, 1, 2, 8, 12, 2, 0x2a2a38);
  // star on the board
  for (const [x, y] of [[0, 9], [-1, 8], [0, 8], [1, 8], [-3, 7], [-2, 7], [-1, 7], [0, 7], [1, 7], [2, 7], [3, 7], [-1, 6], [0, 6], [1, 6], [-2, 5], [-1, 5], [1, 5], [2, 5], [-2, 4], [2, 4]]) g.set(x, y, 3, GOLD, true);
  // the clapper stick, open at an angle, black and white stripes
  for (let x = -10; x <= 9; x++) {
    const y = 15 + Math.round((x + 10) * 0.32);
    for (let k = 0; k < 3; k++) g.set(x, y + k, 0, ((x + 10) >> 2) & 1 ? 0xffffff : 0x1a1a24);
  }
  g.box(-10, 13, -1, 9, 14, 1, (x) => ((x + 10) >> 2) & 1 ? 0x1a1a24 : 0xffffff);
  return g;
}

function giftGrid() {
  const g = new VoxGrid();
  g.box(-8, 0, -8, 7, 13, 7, (x, y, z) => (x === -1 || x === 0 || z === -1 || z === 0 ? GOLD : 0xff4fa3));
  g.box(-9, 14, -9, 8, 16, 8, (x, y, z) => (x === -1 || x === 0 || z === -1 || z === 0 ? GOLD : 0xff2e88));
  for (const s of [-1, 1]) for (let k = 0; k < 5; k++) g.set(s * (2 + k) - (s < 0 ? 1 : 0), 17 + (k < 3 ? k : 5 - k), 0, GOLD_L);
  text(g, '?', 4, 3, 8, '+z', 0xffffff, { center: true });
  return g;
}

function cardFrameGrid(col) {
  const g = new VoxGrid();
  for (let x = -7; x <= 6; x++) for (let y = 0; y <= 19; y++) {
    const edge = x === -7 || x === 6 || y === 0 || y === 19;
    g.set(x, y, 0, edge ? shade(col, -0.25) : col);
    if (edge) g.set(x, y, 1, x === -7 || y === 0 ? shade(col, 0.25) : col);
    // the back: lab logo pattern
    if (!edge && ((x + y) % 4 === 0)) g.set(x, y, -1, shade(col, 0.3));
  }
  return g;
}

/** Display base under a Swarm figure (rarity colour, gold rim for big rewards). */
function baseGrid(col, gold) {
  const g = new VoxGrid();
  const rim = gold ? GOLD : shade(col, -0.3);
  for (let x = -9; x <= 8; x++) for (let z = -9; z <= 8; z++) {
    if ((x === -9 || x === 8) && (z === -9 || z === 8)) continue;
    const e = x === -9 || x === 8 || z === -9 || z === 8;
    g.set(x, 0, z, rim);
    g.set(x, 1, z, e ? rim : col);
  }
  for (let x = -6; x <= 5; x += 4) g.set(x, 1, 9, gold ? GOLD_L : 0xffffff, true);
  return g;
}

// ---------------------------------------------------------------------------

const _box = new THREE.Box3(), _size = new THREE.Vector3();
/** Scale + lift an object so it stands on y = 0 inside a w x h box. */
function fit(obj, maxH = 1.1, maxW = 1.15) {
  obj.updateMatrixWorld(true);
  _box.setFromObject(obj);
  _box.getSize(_size);
  const s = Math.min(maxH / Math.max(0.01, _size.y), maxW / Math.max(0.01, _size.x, _size.z * 0.9));
  const holder = new THREE.Group();
  holder.add(obj);
  obj.scale.multiplyScalar(s);
  obj.position.y -= _box.min.y * s;
  obj.position.x -= ((_box.min.x + _box.max.x) / 2) * s;
  obj.position.z -= ((_box.min.z + _box.max.z) / 2) * s;
  holder.userData.h = _size.y * s;
  return holder;
}

function imageCard(urlP, col) {
  const root = new THREE.Group();
  root.add(makeMesh(geo('cardFrame' + col, () => cardFrameGrid(col), 0.05), Mats.pair));
  const tex = new THREE.Texture();
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.02, color: 0xbdbdbd });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.75), mat);
  plane.position.set(-0.025, 0.5, 0.06);
  plane.visible = false;
  root.add(plane);
  let dead = false;
  Promise.resolve(urlP).then((url) => {
    if (!url || dead) return;
    const img = new Image();
    img.onload = () => { if (dead) return; tex.image = img; tex.needsUpdate = true; plane.visible = true; };
    img.src = url;
  }).catch(() => {});
  return { obj: root, dispose() { dead = true; tex.dispose(); mat.dispose(); plane.geometry.dispose(); } };
}

/** Parse up to 4 hex colours from a banner's CSS (fallback: season colours). */
function bannerCols(id) {
  const css = BANNERS[id]?.css ?? '';
  const m = [...css.matchAll(/#([0-9a-f]{6})/gi)].map((x) => parseInt(x[1], 16));
  const uniq = [...new Set(m)].slice(0, 4);
  if (uniq.length >= 2) return uniq;
  if (uniq.length === 1) return [uniq[0], 0xffffff];
  return [0xff4fa3, 0xffd23f, 0x29b6f6];
}

function commanderChar(r) {
  if (r.type === 'commander') return { char: COMMANDERS[r.id]?.char ?? 'recruit', override: null };
  const sk = CMD_SKINS[r.id];
  let cmd = sk?.commander && sk.commander !== '*' ? sk.commander : r.commander && r.commander !== '*' ? r.commander : 'juan';
  if (!COMMANDERS[cmd]) cmd = state.p?.commanders?.equipped ?? 'juan';
  const { name, commander, ...rest } = sk ?? {};
  return { char: COMMANDERS[cmd]?.char ?? 'juan', override: sk ? rest : null };
}

/**
 * Build the 3D item for a pass reward. Unknown reward kinds become a gift box.
 * opts.big: grand prize (larger, gold base).
 */
export function makeRewardItem(r, opts = {}) {
  const maxH = opts.big ? 1.7 : 1.25, maxW = opts.big ? 2.0 : 1.25;
  let inner = null, upd = null, disp = null;
  try {
    switch (r?.type) {
      case 'coins': {
        const k = r.amount >= 2500 ? 'chest' : r.amount >= 900 ? 'pile' : r.amount >= 300 ? 'stack' : 'small';
        inner = makeMesh(geo('coins_' + k, coinGrids[k]), Mats.toyGlossPair);
        break;
      }
      case 'bucks': {
        const k = r.amount >= 90 ? 'pile' : r.amount >= 50 ? 'two' : 'one';
        inner = makeMesh(geo('gems_' + k, gemSets[k]), Mats.toyGlossPair);
        break;
      }
      case 'calories': {
        inner = makeMesh(geo('serum', serumGrid), Mats.toyGlossPair);
        break;
      }
      case 'vial': {
        const v = makeVial(r.id, { thumb: true });
        v.update?.(0.016);
        inner = v.root;
        upd = (dt) => v.update?.(dt);
        disp = () => v.dispose?.();
        break;
      }
      case 'card': case 'swarm': case 'spell': {
        const d = cardDef(r.id);
        if (isSpell(r.id) || r.type === 'spell') {
          const c = imageCard(import('../thumbs.js').then((m) => m.spellThumbAsync(r.id, 160)), 0x8a4ad0);
          inner = c.obj; disp = c.dispose;
        } else {
          const rig = createSwarm(r.id, {});
          rig.setState('idle');
          const col = RARITY[d?.rarity] ?? RARITY.common;
          const g = new THREE.Group();
          const base = makeMesh(geo('base' + col, () => baseGrid(col, false), 0.06), Mats.toyPair);
          g.add(base);
          rig.root.position.y = 0.12;
          // fit the figure on its base
          rig.root.updateMatrixWorld(true);
          _box.setFromObject(rig.root); _box.getSize(_size);
          const s = Math.min((maxH - 0.15) / Math.max(0.01, _size.y), 1.0 / Math.max(0.01, _size.x, _size.z));
          rig.root.scale.setScalar(s);
          g.add(rig.root);
          inner = g;
          upd = (dt) => rig.update(dt);
        }
        break;
      }
      case 'skin': case 'serum': case 'mega': {
        const id = r.type === 'skin' ? (SWARM_SKINS[r.id]?.swarm ?? 'panther') : r.id;
        const variant = r.type === 'mega' ? (r.variant ?? 'base') : 'base';
        const rig = createSwarm(id, { variant, skin: r.type === 'skin' ? r.id : null });
        rig.setState('idle');
        const g = new THREE.Group();
        const gold = r.type === 'mega' || r.type === 'serum';
        g.add(makeMesh(geo('base' + (gold ? 'g' : 's'), () => baseGrid(gold ? 0xff4fa3 : 0x29b6f6, gold), 0.06), Mats.toyPair));
        rig.root.position.y = 0.12;
        rig.root.updateMatrixWorld(true);
        _box.setFromObject(rig.root); _box.getSize(_size);
        const s = Math.min((maxH - 0.15) / Math.max(0.01, _size.y), (maxW - 0.1) / Math.max(0.01, _size.x, _size.z));
        rig.root.scale.setScalar(s);
        g.add(rig.root);
        if (r.type === 'serum') {
          const fl = makeMesh(geo('serum', serumGrid), Mats.toyGlossPair);
          fl.scale.setScalar(0.55);
          fl.position.set(0.42, 0.12, 0.32);
          g.add(fl);
        }
        inner = g;
        upd = (dt) => rig.update(dt);
        break;
      }
      case 'commander': case 'cmdSkin': {
        const { char, override } = commanderChar(r);
        const ch = new Chibi({ ...CHARACTERS[char], ...(override ?? {}) }, { fidget: false });
        ch.play('idle');
        ch.expr('happy', 'grin');
        ch.snap();
        inner = ch.root;
        let t = Math.random() * 4;
        upd = (dt) => {
          t += dt;
          if (t > 5) { t = 0; ch.react(Math.random() < 0.5 ? 'wave' : 'thumbsUp', { boing: false }); }
          ch.update(Math.min(dt, 1 / 30));
        };
        disp = () => { ch.face?.texture?.dispose?.(); ch.facePlane?.material?.dispose?.(); };
        break;
      }
      case 'labSkin': {
        const c = imageCard(import('../thumbs.js').then((m) => m.labSkinThumb(r.id, 160)), 0x1aa88a);
        inner = c.obj; disp = c.dispose;
        break;
      }
      case 'banner': {
        const cols = bannerCols(r.id);
        inner = makeMesh(geo('banner_' + r.id, () => bannerGrid(cols)), Mats.toyPair);
        break;
      }
      case 'entrance': {
        inner = makeMesh(geo('clapper', clapperGrid), Mats.toyGlossPair);
        break;
      }
      default: break;
    }
  } catch (e) {
    console.warn('pass item', r, e);
    inner = null;
  }
  if (!inner) {
    inner = makeMesh(geo('gift', giftGrid), Mats.toyGlossPair);
    upd = null; disp = null;
  }
  const obj = fit(inner, maxH, maxW);
  // one shadow per item: only its biggest solid mesh joins the shadow pass (vials and figures have many parts)
  let big = null, br = -1;
  obj.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = false;
    o.receiveShadow = false;
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    if (m?.transparent || !o.visible || !o.geometry) return;
    if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
    const r = o.geometry.boundingSphere.radius * o.getWorldScale(_size).x;
    if (r > br) { br = r; big = o; }
  });
  if (big) big.castShadow = true;
  return { obj, h: obj.userData.h, update: upd ?? (() => {}), dispose: disp ?? (() => {}) };
}

// ---------------------------------------------------------------------------
// Locked look: a darker copy of every material (cached per source material)

const DIM = new Map();
const _dimTint = new THREE.Color();
function dimOf(m) {
  let d = DIM.get(m);
  if (d) return d;
  d = m.clone();
  if (d.color) d.color.multiply(_dimTint.setRGB(0.5, 0.52, 0.66)).multiplyScalar(m.isMeshBasicMaterial ? 0.7 : 1);
  if (d.emissive) d.emissive.multiplyScalar(0.2);
  if (d.transparent && d.opacity !== undefined) d.opacity *= 0.6;
  if (d.envMapIntensity !== undefined) d.envMapIntensity *= 0.4;
  DIM.set(m, d);
  return d;
}
/** Swap every mesh under obj to its dimmed material (or back). */
export function setDim(obj, on) {
  obj.traverse((o) => {
    if (!o.isMesh) return;
    const u = o.userData;
    if (on) {
      if (u.litMat) return;
      u.litMat = o.material;
      o.material = Array.isArray(o.material) ? o.material.map(dimOf) : dimOf(o.material);
    } else if (u.litMat) {
      o.material = u.litMat;
      u.litMat = null;
    }
  });
}
/** Free the dimmed material copies (when the pass closes). */
export function disposeDims() {
  for (const d of DIM.values()) d.dispose();
  DIM.clear();
}

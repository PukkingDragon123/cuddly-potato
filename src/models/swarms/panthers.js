// The Panther family. Just like the real MrBeast Lab Swarms figures, every
// Panther shares one sculpt ("mold"): a chunky big-headed crouching panther
// mid-roar with magenta lightning bolts around angry eyes, a black nose, an
// open mouth full of white teeth and sharp claws. Variants are colourways and
// add-ons (armour, cape, chocolate, fusion flames...).
import {
  G, blob, rbox, capsule, chain, stamp, eyes, mirror, sym, symBox, glowWhere, fadeY, gradY, n3, jp, shade, mixHex,
} from '../kit.js';

// ---------------------------------------------------------------------------
// Colour schemes (from the toy line where one exists)

export const PANTHER_SCHEMES = {
  // Prime Panther: light blue, black claws, magenta lightning bolts
  panther: { fur: 0x52c4ff, dark: 0x2b84dc, light: 0xa8e4ff, muzzle: 0xc6efff, bolt: 0xff1f9e, claw: 0x15121f, inner: 0xff59b8, nose: 0x15121f, iris: 0x15121f },
  // Toxic Panther (Lab Brats): green-grape panther
  toxicPanther: { fur: 0x9fdc3c, dark: 0x5c9a1c, light: 0xdcf7a0, muzzle: 0xeefbc8, bolt: 0xff1f9e, claw: 0x15121f, inner: 0xff59b8, nose: 0x15121f, iris: 0x15121f, drip: 0x7cff3a },
  // Fiery Panther (Home Horrors): orange with magenta claws
  fieryPanther: { fur: 0xff8a1f, dark: 0xd2560e, light: 0xffd49a, muzzle: 0xfff0d8, bolt: 0xff1f9e, claw: 0xff1f9e, inner: 0xffd23f, nose: 0x15121f, iris: 0x15121f },
  // Midnight Panther (Creepy Critters): black fading to blue, blue claws, glows
  midnightPanther: { fur: 0x1c1f3e, dark: 0x0e1024, light: 0x3a6cff, muzzle: 0x2a4ad8, bolt: 0xff1f9e, claw: 0x3d86ff, inner: 0xff59b8, nose: 0x0a0a14, iris: 0x3d86ff, fade: [0x101226, 0x2f62ff], finish: 'glow' },
  // Hypercharge Panther (Techno Terrors): electric blue, glow-in-the-dark
  hyperchargePanther: { fur: 0x2f6bff, dark: 0x1a3cb8, light: 0x9fd0ff, muzzle: 0xc8e6ff, bolt: 0xff1f9e, claw: 0x15121f, inner: 0xff59b8, nose: 0x15121f, iris: 0x15121f, finish: 'glow' },
  // Steel / Ultra Armor Panther: blue panther in silver armour
  steelPanther: { fur: 0x3a8dff, dark: 0x2160c8, light: 0xa8d4ff, muzzle: 0xd0e8ff, bolt: 0xff1f9e, claw: 0x15121f, inner: 0xff59b8, nose: 0x15121f, iris: 0x15121f },
  // Beast Tiger: orange tiger with black stripes and glowing cyan eyes
  beastTiger: { fur: 0xff8a1f, dark: 0xd8601a, light: 0xfff2e2, muzzle: 0xfff6ec, bolt: 0x15121f, claw: 0xffffff, inner: 0xffb0c8, nose: 0x2a1a1a, iris: 0x0f6fb8, eye: 0x9ff6ff, eyeGlow: true },
};

const T = 0xffffff; // teeth
const MOUTH = 0x4a0820, TONGUE = 0xff5a8a;

// ---------------------------------------------------------------------------
// Face art (left half; stamped mirrored). One char = one voxel, top row first.
// M = magenta lightning bolt, B = brow ridge (raised), W = eye white,
// P = pupil, G = glint, '.' = untouched. Columns map to x = -11 .. -2.
const FACE_L = [
  'MM.BBB....',
  '.MM.BBBBB.',
  '..M.WWBBBB',
  '.MM.WWWWW.',
  'MM..WWWPPW',
  '.M..WWWPPW',
  '.MM.WWWGPW',
  '..M..WWWW.',
  '.MM.......',
  'MM........',
  'M.........',
];

/** Mirror a grid across the seam into a new grid (left limb -> right limb). */
function flipX(g) {
  const o = G();
  g.forEach((x, y, z, c, glow) => o.set(-1 - x, y, z, c, glow));
  return o;
}

/**
 * Build the Panther sculpt. S = colour scheme. opts:
 *   big: number (overall chunkiness, 1 = standard)
 *   stripes: true -> tiger stripes
 *   furFn: optional colour function override for fur (x,y,z) => colour
 * Returns { parts, muzzle, grids:{head,jaw,body,...}, joints } so variants can add extras before packing.
 */
export function pantherMold(S, opts = {}) {
  const fur = opts.furFn ?? S.fur;
  const furAt = (x, y, z) => (typeof fur === 'function' ? fur(x, y, z) : fur);
  const stripe = (x, y, z) => {
    if (!opts.stripes) return furAt(x, y, z);
    // tiger stripes: diagonal bands on the body
    const v = Math.floor((z * 0.9 + y * 0.55 + 40) / 3.2);
    return v % 3 === 0 && y > 8 ? 0x1a1420 : furAt(x, y, z);
  };

  // ------------------------------------------------------------ body
  const body = G();
  blob(body, -0.5, 11.5, -1.5, 7, 5.6, 9.2, stripe, { p: 2.5 });
  // chest / neck mass blending into the head
  blob(body, -0.5, 13.5, 5, 6.4, 5.6, 4.4, stripe, { p: 2.3 });
  // lighter belly + chest
  body.paint((x, y, z, c) => {
    const ax = Math.abs(x + 0.5);
    if (y <= 8 && ax <= 4.2) return S.light;
    if (z >= 6 && y <= 13 && ax <= 3.6) return S.light;
    return undefined;
  });
  // darker spine chevrons (sculpted fur ridges)
  if (!opts.stripes) {
    body.paint((x, y, z, c) => {
      const ax = Math.abs(x + 0.5);
      if (y >= 15 && ((z + 20) % 6 === 0 || (z + 20) % 6 === 1) && ax <= 3.5 - ((z + 20) % 6)) return S.dark;
      return undefined;
    });
  }
  // magenta lightning bolt decals on both flanks
  if (!opts.noFlankBolt) {
    const BOLT_FLANK = ['..MMM', '.MMM.', 'MMM..', 'MMMMM', '..MM.', '.MM..', 'MM...'];
    stamp(body, BOLT_FLANK, { M: S.bolt }, { axis: '-x', y: 15, z: -6 });
    stamp(body, BOLT_FLANK.map((r) => [...r].reverse().join('')), { M: S.bolt }, { axis: 'x', y: 15, z: -2 });
  }
  gradY(body, 5, 17, -0.12, 0.05);

  // ------------------------------------------------------------ head
  const HJ = [-0.5, 14, 6]; // neck joint
  const head = G();
  const headCol = (x, y, z) => (opts.stripes && y >= 25 && (Math.abs(x + 0.5) === 2.5 || Math.abs(x + 0.5) === 5.5) ? 0x1a1420 : furAt(x, y, z));
  blob(head, -0.5, 20, 9, 10.2, 8.4, 8.4, headCol, { p: 2.15 });
  // cheek mass so the jaw line reads wide
  blob(head, -0.5, 15.8, 11, 9.4, 4.4, 6, furAt, { p: 2.2 });
  // muzzle (upper snout)
  blob(head, -0.5, 16, 17.2, 5.2, 2.9, 3.4, S.muzzle, { p: 2.2 });
  // ears (cones + inner colour)
  for (const s2 of [-1, 1]) {
    const ex = s2 < 0 ? -7.5 : 6.5;
    capsule(head, [ex, 25.5, 7.5], [ex + s2 * 1.6, 32, 6.5], 3.5, 0.7, headCol);
    capsule(head, [ex, 26, 9.2], [ex + s2 * 1.3, 30.5, 8.4], 1.9, 0.5, S.inner);
  }
  // cheek fluff spikes
  for (const s2 of [-1, 1]) {
    const cx = s2 < 0 ? -10 : 9;
    capsule(head, [cx, 16, 11], [cx + s2 * 3.2, 14, 11.5], 1.8, 0.5, furAt);
    capsule(head, [cx, 13.5, 12], [cx + s2 * 2.8, 11.5, 12.5], 1.5, 0.4, S.dark);
  }
  // open roaring mouth: carve a deep cavity under the muzzle
  head.carve((x, y, z) => y >= 8 && y <= 13 && z >= 11 && Math.abs(x + 0.5) <= 5.6);
  head.carve((x, y, z) => y < 8 && z >= 9);
  for (let x = -6; x <= 5; x++) {
    if (Math.abs(x + 0.5) > 5.6) continue;
    for (let y = 9; y <= 13; y++) head.set(x, y, 11, MOUTH);
    for (let z = 11; z <= 20; z++) if (head.has(x, 14, z)) head.set(x, 14, z, MOUTH);
  }
  // upper teeth row + big canines
  for (let x = -5; x <= 4; x++) {
    let fz = 0;
    for (let z = 22; z >= 11; z--) if (head.has(x, 14, z)) { fz = z; break; }
    if (!fz) continue;
    head.set(x, 13, fz, T);
    if ((x + 5) % 2 === 0) head.set(x, 12, fz, T);
  }
  for (const x of [-5, 4]) for (let y = 10; y <= 13; y++) head.set(x, y, 18, T);
  // nose (black, raised) + glint
  stamp(head, ['NNNNNN', '.NNNN.', '..NN..'], { N: S.nose }, { axis: 'z', x: -3, y: 18.5 | 0, raise: 1 });
  // face: eyes, angry brows and the lightning-bolt mask (mirrored)
  const eyeW = S.eyeGlow ? { c: S.eye ?? 0xffffff, glow: true } : (S.eye ?? 0xffffff);
  stamp(head, FACE_L, {
    M: opts.noBolts ? undefined : S.bolt, B: { c: opts.stripes ? 0x1a1420 : S.dark, raise: 1 }, W: eyeW, P: S.pupil ?? 0x15121f, G: { c: 0xffffff, glow: true },
  }, { axis: 'z', x: -11, y: 27, mirror: true, zmin: 6 });
  gradY(head, 10, 29, -0.1, 0.06);

  // ------------------------------------------------------------ jaw (hinged, opens on attacks)
  const JJ = [-0.5, 12, 11];
  const jaw = G();
  blob(jaw, -0.5, 9.2, 15, 5.2, 2.2, 5, S.muzzle, { p: 2.3 });
  blob(jaw, -0.5, 9.6, 12, 6.6, 2.8, 3, furAt, { p: 2.2 });
  jaw.carve((x, y, z) => y >= 11);
  for (let x = -5; x <= 4; x++) for (let z = 11; z <= 19; z++) if (jaw.has(x, 10, z)) jaw.set(x, 10, z, Math.abs(x + 0.5) <= 2.2 && z <= 17 ? TONGUE : MOUTH);
  for (let x = -5; x <= 4; x++) {
    let fz = 0;
    for (let z = 22; z >= 11; z--) if (jaw.has(x, 10, z)) { fz = z; break; }
    if (!fz) continue;
    if ((x + 5) % 2 === 1 || x === -5 || x === 4) jaw.set(x, 11, fz, T);
  }
  for (const x of [-5, 4]) { jaw.set(x, 12, 17, T); jaw.set(x, 11, 17, T); }

  // ------------------------------------------------------------ legs
  const leg = (front) => {
    const g = G();
    const cx = -5, cz = front ? 4 : -7;
    const top = front ? 9 : 10;
    if (front) capsule(g, [cx, top, cz], [cx, 3, cz + 0.5], 2.9, 2.4, stripe);
    else {
      blob(g, cx, 8.5, cz, 3.4, 3.6, 3.6, stripe, { p: 2.2 }); // thigh
      capsule(g, [cx, 6, cz], [cx, 3, cz + 0.5], 2.5, 2.3, stripe);
    }
    blob(g, cx, 1.8, cz + 1.2, 3, 1.9, 3.3, S.light, { p: 2.4, clip: (x, y) => y < 0 }); // paw
    // claws
    for (const dx of [-2, 0, 2]) {
      g.set(cx + dx, 0, cz + 4, S.claw);
      g.set(cx + dx, 1, cz + 4, S.claw);
      g.set(cx + dx, 0, cz + 5, S.claw);
    }
    return g;
  };
  const legFL = leg(true), legBL = leg(false);
  const legFR = flipX(legFL), legBR = flipX(legBL);

  // ------------------------------------------------------------ tail
  const TJ = [-0.5, 13, -10];
  const tail = G();
  chain(tail, [[-0.5, 13, -10], [-0.5, 14.5, -14], [-0.5, 18, -17], [-0.5, 22, -17], [-0.5, 24.5, -14.5]], [2.3, 1.5], (x, y, z, t) => (opts.stripes && Math.floor(y / 2.4) % 2 === 0 ? 0x1a1420 : furAt(x, y, z)));
  blob(tail, -0.5, 25, -13.5, 1.7, 1.7, 1.7, opts.stripes ? 0x1a1420 : S.dark);

  return {
    grids: { body, head, jaw, legFL, legFR, legBL, legBR, tail },
    joints: {
      head: HJ, jaw: JJ, tail: TJ,
      legFL: [-5, 9, 4], legFR: [4, 9, 4], legBL: [-5, 10, -7], legBR: [4, 10, -7],
    },
  };
}

/** Pack a mold (plus extra parts) into a SwarmRig model definition. */
export function packPanther(m, extra = {}) {
  const { grids: g, joints: j } = m;
  const parts = [
    jp('legFL', g.legFL, j.legFL), jp('legFR', g.legFR, j.legFR), jp('legBL', g.legBL, j.legBL), jp('legBR', g.legBR, j.legBR),
    jp('body', g.body, [-0.5, 0, 0]),
    jp('head', g.head, j.head),
    jp('jaw', g.jaw, j.jaw, j.head, { parent: 'head', rot: [0.12, 0, 0] }),
    jp('tail', g.tail, j.tail),
    ...(extra.parts ?? []),
  ];
  return { gait: 'walk', voxel: 0.05, parts, muzzle: [-0.5, 14, 22], finish: extra.finish, jitter: 0.02 };
}

// ---------------------------------------------------------------------------
// Variants

function basic(id) {
  const S = PANTHER_SCHEMES[id];
  return () => packPanther(pantherMold(S), { finish: S.finish });
}

export const PANTHER_MODELS = {
  panther(o = {}) {
    if (o.skin === 'wrapperPanther') {
      // FOOD SEASON skin: Prime Panther wrapped in a chocolate-bar wrapper
      const S = { ...PANTHER_SCHEMES.panther };
      const m = pantherMold(S);
      m.grids.body.paint((x, y, z) => (z >= -6 && z <= 2 ? (Math.abs(z + 2) === 4 ? 0xd8dde8 : 0x1d9bf0) : undefined));
      stamp(m.grids.body, ['WWW', 'W.W', 'WWW'], { W: 0xffffff }, { axis: '-x', y: 13, z: -3 });
      stamp(m.grids.body, ['WWW', 'W.W', 'WWW'], { W: 0xffffff }, { axis: 'x', y: 13, z: -1 });
      return packPanther(m);
    }
    return packPanther(pantherMold(PANTHER_SCHEMES.panther));
  },

  toxicPanther() {
    const S = PANTHER_SCHEMES.toxicPanther;
    const m = pantherMold(S);
    // dripping toxic goo from the jaw and back
    const goo = (g, pts) => { for (const [x, y, z, n] of pts) for (let i = 0; i < n; i++) g.set(x, y - i, z, S.drip, i === n - 1); };
    goo(m.grids.jaw, [[-4, 8, 17, 3], [3, 8, 15, 2], [-1, 8, 19, 2]]);
    goo(m.grids.body, [[-7, 9, -6, 2], [6, 10, 0, 2], [-6, 9, 3, 3]]);
    glowWhere(m.grids.body, (x, y, z) => y >= 16 && n3(x, y, z, 4) < 0.08, S.drip);
    return packPanther(m);
  },

  fieryPanther() {
    const S = PANTHER_SCHEMES.fieryPanther;
    const m = pantherMold(S);
    // flame tufts licking up the back
    const flame = (i, h) => (i >= h - 1 ? 0xfff2a0 : i >= h - 2 ? 0xffd23f : 0xff7a1a);
    for (const [z, h] of [[-8, 4], [-4, 6], [0, 5], [3, 3]]) {
      for (let i = 0; i < h; i++) for (const x of [-1, 0]) m.grids.body.set(x, 17 + i, z - (i >> 1), flame(i, h), i >= h - 2);
    }
    for (let i = 0; i < 4; i++) m.grids.tail.set(-1, 27 + i, -16 + (i >> 1), flame(i, 4), true), m.grids.tail.set(0, 27 + i, -16 + (i >> 1), flame(i, 4), true);
    return packPanther(m);
  },

  midnightPanther() {
    const S = PANTHER_SCHEMES.midnightPanther;
    // black fading to blue from the top down
    const furFn = (x, y) => mixHex(S.fade[1], S.fade[0], Math.max(0, Math.min(1, (y - 3) / 22)));
    const m = pantherMold(S, { furFn });
    // glowing speckles like a night sky
    for (const k of ['body', 'head']) glowWhere(m.grids[k], (x, y, z, c) => c !== S.bolt && n3(x, y, z, 9) < 0.025, 0xbfe0ff);
    return packPanther(m, { finish: S.finish });
  },

  hyperchargePanther() {
    const S = PANTHER_SCHEMES.hyperchargePanther;
    const m = pantherMold(S);
    // charged circuit lines + glowing bolts
    glowWhere(m.grids.head, (x, y, z, c) => c === S.bolt);
    glowWhere(m.grids.body, (x, y, z, c) => c === S.bolt);
    m.grids.body.paint((x, y, z, c) => (y === 12 && c === S.fur && (z + x) % 3 === 0 ? 0x9ff2ff : undefined));
    glowWhere(m.grids.body, (x, y, z, c) => c === 0x9ff2ff);
    // little antenna coil on the head
    capsule(m.grids.head, [-0.5, 27, 8], [-0.5, 31, 7], 0.8, 0.6, 0xc8ccd8);
    blob(m.grids.head, -0.5, 32, 7, 1.3, 1.3, 1.3, 0x9ff2ff, { glow: true });
    return packPanther(m, { finish: S.finish });
  },

  steelPanther() {
    // Ultra Armor Panther: blue panther in silver armour with a blue cape and a mace tail
    const S = PANTHER_SCHEMES.steelPanther;
    const m = pantherMold(S, { noFlankBolt: true });
    const steel = (x, y, z) => (n3(x, y, z, 2) < 0.12 ? 0x9aa4b8 : (x + y + z) % 7 === 0 ? 0xeef2f8 : 0xc8d0dc);
    const trim = 0x6b7386, rivet = 0xffffff;
    const b = m.grids.body;
    // back plate (shell over the top of the body) + rivet line
    blob(b, -0.5, 13.5, -2, 7.4, 4.8, 9.8, steel, { p: 2.6, clip: (x, y) => y < 13 });
    for (let z = -10; z <= 6; z += 4) sym(b, 0, 18, z, rivet);
    for (let z = -11; z <= 7; z++) for (const x of [-8, 7]) if (b.has(x, 13, z)) b.set(x, 13, z, trim);
    // shoulder pauldrons
    for (const s of [-1, 1]) blob(b, s < 0 ? -6.5 : 5.5, 14, 4, 3.2, 2.6, 3.4, steel, { p: 2.4 });
    // blue cape flowing back
    const cape = G();
    for (let z = -2; z >= -15; z--) {
      const t = (-2 - z) / 13;
      const w = Math.round(6 + t * 2);
      for (let x = -w; x <= w - 1; x++) {
        const y = Math.round(18 - t * 7 + Math.sin(x * 0.7 + z * 0.5) * 0.7);
        cape.set(x, y, z, (x + z) % 5 === 0 ? 0x1a4fb8 : 0x2a6bff);
        cape.set(x, y - 1, z, 0x1a4fb8);
      }
    }
    stamp(cape, ['.MMM', 'MMM.', 'MMMM', '.MM.', 'MM..'], { M: 0xffd23f }, { axis: 'y', x: -2, z: -11 });
    // helmet with a crest + face guard
    const hd = m.grids.head;
    blob(hd, -0.5, 24.5, 8, 10.3, 4.6, 8.9, steel, { p: 2.4, clip: (x, y, z) => y < 24 || (z > 13 && y < 27) });
    for (let z = 0; z <= 15; z++) for (const x of [-1, 0]) hd.set(x, 29, z, 0x2a6bff), hd.set(x, 30, z - 1, 0x2a6bff);
    for (let x = -10; x <= 9; x++) if (hd.has(x, 24, 15) || hd.has(x, 24, 14)) hd.set(x, 24, hd.has(x, 24, 15) ? 15 : 14, trim);
    // the tail ends in a silver spiked mace
    const tl = m.grids.tail;
    blob(tl, -0.5, 26, -13.5, 3.2, 3.2, 3.2, steel);
    for (const [x, y, z] of [[-0.5, 30, -13.5], [3, 26, -13.5], [-4, 26, -13.5], [-0.5, 26, -10], [-0.5, 26, -17], [-0.5, 22.5, -13.5]]) blob(tl, x, y, z, 0.8, 0.8, 0.8, 0xeef2f8);
    // armoured gauntlets on the front legs
    for (const k of ['legFL', 'legFR']) {
      const g = m.grids[k];
      const cx = k === 'legFL' ? -5 : 4;
      blob(g, cx, 5.5, 5.5, 2.9, 2.2, 2.9, steel, { p: 2.5 });
    }
    return packPanther(m, { parts: [jp('cape', cape, [-0.5, 18, -2], [-0.5, 0, 0], { parent: 'body' })], finish: 'gloss' });
  },

  beastTiger() {
    const S = PANTHER_SCHEMES.beastTiger;
    const m = pantherMold(S, { stripes: true, noBolts: true, noFlankBolt: true });
    // white ruff + whisker dots
    const hd = m.grids.head;
    for (const s of [-1, 1]) capsule(hd, [s < 0 ? -9 : 8, 17, 10], [s < 0 ? -12 : 11, 13, 10.5], 2, 0.6, 0xfff6ec);
    for (const [x, y] of [[-4, 16], [-3, 15], [-5, 15]]) {
      const z = 20;
      sym(hd, x, y, z, 0x2a1a1a);
    }
    // forehead "MrBeast" bolt mark in black (tiger marking)
    stamp(hd, ['.KK.', 'KKKK', '.KK.', 'KK..'], { K: 0x1a1420 }, { axis: 'z', x: -2, y: 28 });
    glowWhere(hd, (x, y, z, c) => c === S.eye);
    return packPanther(m, { finish: 'gloss' });
  },

  hyperFusionPanther() {
    // Limited Edition Hyper Fusion Panther: fire half + ice half fused around a chrome core
    const fireP = [0xff4a1a, 0xf03a14, 0xff6a22];
    const iceP = [0x3a9ad8, 0x4ab0e8, 0x58c0f4];
    const isFire = (x, y, z) => x + (n3(y, z, 7) < 0.3 ? 1 : 0) - (n3(y, z, 9) < 0.25 ? 1 : 0) < 0;
    const furFn = (x, y, z) => {
      const p = isFire(x, y, z) ? fireP : iceP;
      return p[Math.floor(n3(x, y, z, 3) * p.length) % p.length];
    };
    const S = { ...PANTHER_SCHEMES.panther, dark: 0x8a2a8a, light: 0xffe0f0, muzzle: 0xf2f4ff, inner: 0xffd23f, claw: 0xeef2f8 };
    const m = pantherMold(S, { furFn });
    const flame = (i, h) => (i >= h - 1 ? 0xfff6a0 : i >= h - 2 ? 0xffd23f : i >= h - 3 ? 0xffa21a : 0xff6a1a);
    const icy = (i, h) => (i === h - 1 ? 0xffffff : i === 0 ? 0x8fe4ff : 0xc8f4ff);
    const b = m.grids.body, hd = m.grids.head;
    // flame mane (left) + ice crystals (right) along the back and head
    for (const [z, h] of [[-9, 4], [-5, 6], [-1, 5], [3, 4]]) for (let i = 0; i < h; i++) { b.set(-3, 17 + i, z - (i >> 1), flame(i, h), true); b.set(-2, 17 + i, z - (i >> 1), flame(i, h), i > 1); }
    for (const [z, h] of [[-9, 3], [-5, 5], [-1, 4], [3, 3]]) for (let i = 0; i < h; i++) { b.set(1, 17 + i, z - (i >> 1), icy(i, h), i === h - 1); b.set(2, 17 + i, z, icy(i, h)); }
    for (const [x, z, h] of [[-7, 9, 5], [-5, 5, 6], [-3, 3, 4]]) for (let i = 0; i < h; i++) hd.set(x, 27 + i, z - (i >> 1), flame(i, h), true);
    for (const [x, z, h] of [[6, 9, 4], [4, 5, 5], [2, 3, 3]]) for (let i = 0; i < h; i++) hd.set(x, 27 + i, z - (i >> 1), icy(i, h), i === h - 1);
    // chrome fusion core on the chest
    blob(b, -0.5, 12, 9.5, 3, 3, 1.6, (x, y) => ([0xffffff, 0xc8d2e0, 0xa4b0c4][(x + y + 30) % 3]));
    b.set(-1, 12, 11, 0xff5ad8, true); b.set(0, 12, 11, 0x7ff6ff, true); b.set(-1, 13, 11, 0xffffff, true); b.set(0, 11, 11, 0xffffff, true);
    // eyes: fire eye + ice eye glow
    glowWhere(hd, (x, y, z, c) => c === 0xffffff && y >= 19 && y <= 24 && z > 12);
    return packPanther(m, { finish: 'gloss' });
  },

  feastablesPanther(o = {}) {
    // MEGA FORM: a gigantic Panther sculpted from Feastables chocolate with a torn wrapper
    const golden = o.skin === 'goldenWrapperPanther';
    const choco = golden ? 0xb8862b : 0x5a3220, chocoL = golden ? 0xe0b040 : 0x7d4a2d, chocoD = golden ? 0x8a5a1a : 0x3e2014;
    const wrapC = golden ? 0xffd23f : 0x1d9bf0;
    const bar = (x, y, z) => (((x + 40) % 5 === 0 || (z + 40) % 5 === 0) ? chocoD : n3(x, y, z) < 0.5 ? choco : chocoL);
    const S = { fur: choco, dark: chocoD, light: chocoL, muzzle: chocoL, bolt: wrapC, claw: 0xfff4e0, inner: 0xff4fa3, nose: 0x1a0a06, iris: 0xff2e88, eye: 0xfff27a, eyeGlow: true };
    const m = pantherMold(S, { furFn: bar, noFlankBolt: true });
    const b = m.grids.body;
    // wrapper band with torn foil edges and a white label
    b.paint((x, y, z) => (z >= -5 && z <= 1 ? (z === -5 || z === 1 ? 0xe4e8f0 : wrapC) : undefined));
    stamp(b, ['WWWWW', 'WPPPW', 'WWWWW'], { W: 0xffffff, P: 0xff4fa3 }, { axis: '-x', y: 13, z: -1 });
    stamp(b, ['WWWWW', 'WPPPW', 'WWWWW'], { W: 0xffffff, P: 0xff4fa3 }, { axis: 'x', y: 13, z: -5 });
    // chocolate drips
    for (const [x, z, n] of [[-6, 4, 3], [5, -8, 2], [-3, 7, 2], [4, 6, 3], [-6, -10, 2]]) for (let i = 0; i < n; i++) b.set(x, 7 - i, z, chocoL);
    return packPanther(m, { finish: 'gloss' });
  },
};

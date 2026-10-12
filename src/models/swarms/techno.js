// Techno Terrors: household appliances and technology gone feral. Every
// figure is a chunky 1" toy sculpt with a big angry face, glowing LEDs and
// MrBeast-magenta accents. See ../kit.js and ./panthers.js for conventions
// (model faces +Z, y = 0 ground, x symmetric around -0.5, parts modelled in
// absolute coordinates and attached with jp() at their joints).
// eslint-disable-next-line no-unused-vars
import { G, blob, rbox, capsule, chain, cyl, stamp, eyes, mirror, sym, symBox, glowWhere, fadeY, gradY, n3, jp, part, shade, mixHex, mottle } from '../kit.js';

const MAG = 0xff1f9e; // MrBeast magenta
const INK = 0x15121f;
const TOOTH = 0xffffff;
const MOUTH = 0x3a0a22;
const TONGUE = 0xff5a9a;

/** Mirror a grid across the seam into a new grid (left limb -> right limb). */
function flipX(g) {
  const o = G();
  g.forEach((x, y, z, c, glow) => o.set(-1 - x, y, z, c, glow));
  return o;
}
/** Mirror pixel-art rows horizontally. */
const rev = (rows) => rows.map((r) => [...r].reverse().join(''));

/**
 * Bulging cartoon eyeball on a front-facing surface with a slanted angry brow
 * slab (reads in profile too). side: -1 = model's left (x < -0.5).
 * o: white, glow, pupil, pupilGlow, pw/ph, inward/down, browCol, browT,
 *    browHi/browLo (brow height at the outer/inner end as a fraction of ry), brow:false.
 */
function eyeBall(g, cx, cy, cz, r, side, o = {}) {
  const [rx, ry, rz] = r;
  const white = o.white ?? 0xffffff;
  const inEye = (x, y) => Math.abs(x - cx) <= rx + 1 && Math.abs(y - cy) <= ry + 1;
  blob(g, cx, cy, cz, rx, ry, rz, white, { p: 2.2, clip: (x, y, z) => z < cz - 1, glow: !!o.glow });
  const outer = cx + side * (rx + 0.5), inner = cx - side * (rx + 0.5);
  const yo = cy + ry * (o.browHi ?? 0.95), yi = cy + ry * (o.browLo ?? 0.15);
  const yLine = (x) => yo + ((x - outer) / (inner - outer)) * (yi - yo);
  if (o.brow !== false) g.carve((x, y, z, c) => c === white && inEye(x, y) && z >= cz - 1 && y > yLine(x) - 0.5);
  const pw = o.pw ?? 3, ph = o.ph ?? 3;
  const px = Math.round(cx - side * (o.inward ?? 1) - pw / 2 + 0.5), py = Math.round(cy - (o.down ?? 0.8) + ph / 2 - 0.5);
  const art = [];
  for (let v = 0; v < ph; v++) art.push('P'.repeat(pw));
  const gx = side < 0 ? 0 : pw - 1;
  if (o.glint !== false) art[0] = art[0].slice(0, gx) + 'G' + art[0].slice(gx + 1);
  stamp(g, art, { P: { c: o.pupil ?? INK, glow: !!o.pupilGlow }, G: { c: 0xffffff, glow: true } }, { axis: 'z', x: px, y: py, depth: 2 });
  if (o.brow !== false) {
    const bc = o.browCol ?? INK, bt = o.browT ?? 2;
    const x0 = Math.floor(Math.min(outer, inner)) - (side < 0 ? 1 : 0), x1 = Math.ceil(Math.max(outer, inner)) + (side > 0 ? 1 : 0);
    for (let x = x0; x <= x1; x++) {
      const yb = Math.round(yLine(Math.max(Math.min(x, Math.max(outer, inner)), Math.min(outer, inner))));
      const t = (x - cx) / (rx + 1.2);
      const zf = Math.round(cz + rz * Math.sqrt(Math.max(0, 1 - t * t)) + 0.6);
      for (let y = yb; y < yb + bt; y++) for (let z = cz - 1; z <= zf; z++) g.set(x, y, z, bc);
    }
  }
  return g;
}

/** Extrude pixel art into a flat slab in the y-z plane (x0..x1 thick). Rows top-first at y, columns go -z from z. */
function slabYZ(g, art, pal, x0, x1, y, z, o = {}) {
  for (let v = 0; v < art.length; v++) for (let u = 0; u < art[v].length; u++) {
    const ch = art[v][u];
    if (ch === '.' || ch === ' ') continue;
    let spec = pal[ch];
    if (spec === undefined) continue;
    if (typeof spec === 'number') spec = { c: spec };
    for (let x = x0; x <= x1; x++) g.set(x, y - v, o.forward ? z + u : z - u, spec.c, !!spec.glow);
  }
  return g;
}

// ===========================================================================
// Glitch Bot: an angry CRT monitor on stubby robot legs. Its screen is the
// face (glitching cyan/magenta eyes), the disk-slot mouth below chomps open,
// and the rabbit-ear antennas crackle. Fires lasers from its screen.
function glitchBot() {
  const K = {
    shell: 0x8b66ff, shellD: 0x6440dc, shellL: 0xc2adff, tube: 0x7350e6,
    screen: 0x0c1230, scan: 0x17224c, cyan: 0x5ff6ff, cyanL: 0xd8ffff,
    metal: 0xa4aec4, metalD: 0x4e5670, boot: 0x2a2440, lime: 0x8cff3a, yellow: 0xffd23f,
  };

  // ------------------------------------------------------------ head (CRT)
  const HJ = [-0.5, 12, 1];
  const head = G();
  const shellCol = (x, y, z) => (y >= 26 ? K.shellL : K.shell);
  rbox(head, -11, 13, -2, 10, 27, 9, 3, shellCol);
  // picture-tube bulge at the back
  blob(head, -0.5, 20, -4, 8.2, 6.2, 4, K.tube, { p: 2.6 });
  blob(head, -0.5, 20, -8, 4.6, 3.6, 2.4, K.shellD, { p: 2.2 });
  // vent slats on the tube + sides
  head.paint((x, y, z, c) => (c === K.tube && z <= -6 && (y + 40) % 2 === 0 ? K.shellD : undefined));
  for (const s of [-1, 1]) {
    const x = s < 0 ? -11 : 10;
    for (let z = 0; z <= 5; z += 2) for (let y = 19; y <= 24; y++) head.set(x, y, z, K.shellD);
  }
  // screen inset + raised bezel lip
  const inScreen = (x, y) => x >= -9 && x <= 8 && y >= 18 && y <= 25 && !((x === -9 || x === 8) && (y === 18 || y === 25));
  head.carve((x, y, z) => z === 9 && inScreen(x, y));
  for (let x = -9; x <= 8; x++) for (let y = 18; y <= 25; y++) if (inScreen(x, y)) head.set(x, y, 8, (y & 1) ? K.screen : K.scan);
  for (let x = -10; x <= 9; x++) for (let y = 17; y <= 26; y++) {
    const edge = x === -10 || x === 9 || y === 17 || y === 26;
    const corner = (x === -10 || x === 9) && (y === 17 || y === 26);
    if (edge && !corner) head.set(x, y, 10, K.shellL);
  }
  // the face on the screen (glowing pixels): angry slanted eyes, magenta brows, RGB-split glitches
  const SCREEN_L = [
    'MM.......',
    '.MMMM....',
    '...MMMMM.',
    '.CCCC....',
    'mCCCCCC..',
    'mCCCGPC..',
    'mCCCPPC..',
    '..CCCC...',
  ];
  const SCREEN = SCREEN_L.map((r) => r + [...r].reverse().join('').replace(/m/g, 'k'));
  stamp(head, SCREEN, {
    M: { c: MAG, glow: true }, C: { c: K.cyan, glow: true }, P: INK, G: { c: 0xffffff, glow: true },
    m: { c: 0xb0207a, glow: true }, k: { c: 0x2a9ab8, glow: true },
  }, { axis: 'z', x: -9, y: 25, zmin: 7, zmax: 9 });
  head.set(7, 17, 11, K.lime, true); // power LED on the bezel
  // disk-slot mouth: a dark cavity with zig-zag teeth hanging from the top
  head.carve((x, y, z) => y >= 13 && y <= 16 && z >= 2 && x >= -8 && x <= 7);
  for (let x = -8; x <= 7; x++) {
    for (let y = 13; y <= 16; y++) head.set(x, y, 1, MOUTH);
    for (let z = 2; z <= 8; z++) head.set(x, 17, z, MOUTH);
    head.set(x, 16, 8, TOOTH);
    if ((x + 8) % 2 === 0 || x === 7) head.set(x, 15, 8, TOOTH);
  }
  // magenta lightning-bolt sticker on both sides + a few glitch "dead pixels"
  const BOLT = ['..MMM', '.MMM.', 'MMM..', 'MMMMM', '..MM.', '.MM..', 'MM...'];
  stamp(head, BOLT, { M: MAG }, { axis: '-x', y: 26, z: 1, raise: 0 });
  stamp(head, rev(BOLT), { M: MAG }, { axis: 'x', y: 26, z: 5 });
  for (const [x, y, z, c] of [[-12, 17, 6, K.cyan], [-12, 16, 7, MAG], [11, 23, -1, K.lime], [11, 22, 0, K.cyan], [-6, 28, 6, MAG], [4, 28, -1, K.cyan]]) head.set(x, y, z, c, true);
  // antenna base dome
  blob(head, -0.5, 28, 2, 3.2, 1.2, 2.6, K.metalD, { p: 2.4 });
  gradY(head, 13, 27, -0.08, 0.05);

  // rabbit-ear antennas (wobble)
  const antL = G();
  capsule(antL, [-2, 29, 2], [-7, 33, 0], 0.55, 0.45, K.metal);
  blob(antL, -7, 33.5, 0, 1.2, 1.2, 1.2, MAG, { glow: true });
  const antR = flipX(antL);

  // ------------------------------------------------------------ jaw (bottom of the casing)
  const JJ = [-0.5, 12.5, -1];
  const jaw = G();
  rbox(jaw, -10, 8, -1, 9, 12, 9, 2, K.shellD);
  jaw.carve((x, y, z) => y === 12 && x >= -8 && x <= 7 && z >= 1 && z <= 8);
  for (let x = -8; x <= 7; x++) for (let z = 1; z <= 8; z++) jaw.set(x, 11, z, Math.abs(x + 0.5) <= 4 && z <= 7 && z >= 2 ? TONGUE : MOUTH);
  for (let x = -8; x <= 7; x++) if ((x + 8) % 2 === 1 || x === -8) { jaw.set(x, 13, 8, TOOTH); jaw.set(x, 12, 8, TOOTH); }
  // chin vents
  for (let x = -6; x <= 5; x += 2) jaw.set(x, 9, 9, K.boot);

  // ------------------------------------------------------------ torso
  const body = G();
  rbox(body, -6, 4, -4, 5, 10, 3, 2, K.metalD);
  rbox(body, -4, 5, 3, 3, 8, 4, 1, K.boot);
  for (const [x, c] of [[-3, 0xff3a3a], [-1, K.yellow], [1, K.lime]]) body.set(x, 7, 5, c, true);
  for (let x = -3; x <= 2; x++) body.set(x, 5, 5, (x & 1) ? K.metal : K.cyan, !(x & 1));
  // shoulder sockets
  for (const s of [-1, 1]) blob(body, s < 0 ? -7 : 6, 9, 0, 1.6, 1.6, 1.6, K.metal);

  // ------------------------------------------------------------ arms: coiled-cable arms with grabber mitts
  const arm = G();
  const coil = (x, y, z) => ((y + 40) % 2 === 0 ? K.shellL : K.shell);
  capsule(arm, [-8, 9, 0], [-10, 6, 1.5], 1.4, 1.3, coil);
  blob(arm, -10.5, 5, 2, 2.3, 2, 2.3, K.shellD, { p: 2.4 });
  for (const dx of [-1.3, 1.3]) {
    capsule(arm, [-10.5 + dx, 4, 3.5], [-10.5 + dx * 1.2, 2.5, 5.5], 0.8, 0.6, K.metal);
    blob(arm, Math.round(-10.5 + dx * 1.2), 2, 6, 0.6, 0.6, 0.6, MAG);
  }
  const armR = flipX(arm);

  // ------------------------------------------------------------ legs: stubby legs + chunky boots
  const leg = G();
  capsule(leg, [-3.5, 5, 0], [-3.5, 2.5, 0.5], 1.8, 1.7, K.metal);
  rbox(leg, -6, 0, -3, -1, 2, 4, 1, K.boot);
  rbox(leg, -6, 1, 2, -1, 3, 5, 1, K.shellL);
  for (let x = -6; x <= -1; x++) for (let z = -3; z <= 4; z++) if (leg.has(x, 0, z) && (x === -6 || x === -1 || z === -3 || z === 4)) leg.set(x, 0, z, MAG);
  const legR = flipX(leg);

  return {
    gait: 'walk', voxel: 0.05, jitter: 0.02,
    parts: [
      jp('legL', leg, [-3.5, 5, 0]), jp('legR', legR, [2.5, 5, 0]),
      jp('body', body, [-0.5, 0, 0]),
      jp('armL', arm, [-8, 9, 0]), jp('armR', armR, [7, 9, 0]),
      jp('head', head, HJ),
      jp('jaw', jaw, JJ, HJ, { parent: 'head', rot: [0.1, 0, 0] }),
      jp('antennaL', antL, [-1.5, 29, 2], HJ, { parent: 'head' }),
      jp('antennaR', antR, [0.5, 29, 2], HJ, { parent: 'head' }),
    ],
    muzzle: [-0.5, 22, 12],
  };
}

// ===========================================================================
// Drone Fang: a feral quadcopter pod with a glowing red visor glare, a mouth
// full of vampire fangs, magenta prop guards and dangling grabber claws.
function droneFang() {
  const K = {
    top: 0x5a6484, shell: 0x414a68, belly: 0x2b3146, trim: 0xd2d9e8, visor: 0x14161f,
    red: 0xff2f45, hot: 0xffc2b0, ring: 0x9aa3ba, strut: 0x30364a, prop: 0xe4e9f2, gum: 0x7a1030,
  };
  const shellCol = (x, y, z) => (y >= 18 ? K.top : y === 12 ? K.trim : y <= 11 ? K.belly : K.shell);

  // ------------------------------------------------------------ body pod
  const body = G();
  blob(body, -0.5, 14, 0, 9, 7, 9, shellCol, { p: 2.6 });
  // raised armour ridge along the top + panel seams
  blob(body, -0.5, 21, -1.5, 3.4, 1.3, 6.5, K.top, { p: 2.4 });
  body.paint((x, y, z, c) => (c === K.top && (z === -5 || z === 3) && y >= 18 ? K.shell : undefined));
  // dark visor band across the face
  body.paint((x, y, z, c) => (z >= 4 && y >= 13 && y <= 19 && Math.abs(x + 0.5) <= 8.6 ? K.visor : undefined));
  // the face: ringed red LED eyes under heavy slanted brow plates
  const EYE = ['.RRRRR.', 'RrrrrrR', 'RrWhhrR', 'RrhhhrR', 'RrrrrrR', '.RRRRR.'];
  const epal = { R: { c: K.ring, raise: 1 }, r: { c: K.red, glow: true, raise: 1 }, h: { c: K.hot, glow: true, raise: 1 }, W: { c: 0xffffff, glow: true, raise: 1 } };
  stamp(body, EYE, epal, { axis: 'z', x: -9, y: 18, mirror: true, zmin: 0 });
  const BROW = ['BB........', 'BBBBB.....', '..BBBBBBB.', '......BBBB'];
  stamp(body, BROW, { B: { c: K.trim, raise: 2 } }, { axis: 'z', x: -11, y: 21, mirror: true, zmin: 3 });
  // fanged mouth carved under the visor
  body.carve((x, y, z) => y >= 7 && y <= 11 && z >= 2 && Math.abs(x + 0.5) <= 6.6);
  for (let x = -8; x <= 7; x++) {
    if (Math.abs(x + 0.5) > 6.6) continue;
    for (let y = 7; y <= 11; y++) body.set(x, y, 2, MOUTH);
    let fz = 0;
    for (let z = 14; z >= 2; z--) if (body.has(x, 12, z)) { fz = z; break; }
    for (let z = 3; z < fz; z++) body.set(x, 12, z, MOUTH);
    if (!fz) continue;
    body.set(x, 12, fz, K.gum);
    const ax = Math.abs(x + 0.5);
    if (ax >= 3.5 && ax <= 4.5) for (let y = ax < 4 ? 8 : 9; y <= 11; y++) body.set(x, y, fz - 1, TOOTH); // big fangs
    else if (Math.round(ax + 0.5) % 2 === 1) body.set(x, 11, fz - 1, TOOTH);
  }
  // magenta lightning bolts on both flanks
  const BOLT = ['..MMM', '.MMM.', 'MMM..', 'MMMMM', '..MM.', '.MM..', 'MM...'];
  stamp(body, BOLT, { M: MAG }, { axis: '-x', y: 18, z: -1 });
  stamp(body, rev(BOLT), { M: MAG }, { axis: 'x', y: 18, z: 3 });

  // rotor struts, motor hubs and magenta prop guards (up high so the face stays clear)
  const HUBS = [[-13, 8], [12, 8], [-13, -9], [12, -9]];
  for (const [hx, hz] of HUBS) {
    const sx = hx < 0 ? -6 : 5, sz = hz > 0 ? 4 : -5;
    capsule(body, [sx, 19, sz], [hx, 21, hz], 1.3, 1, K.strut);
    cyl(body, 'y', hx, hz, 19, 22, 1.8, 1.8, K.shell);
    body.set(hx, 18, hz, K.red, true);
    cyl(body, 'y', hx, hz, 22, 22, 6.2, 6.2, MAG, { hollow: 1.2 });
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (let i = 2; i <= 5; i++) body.set(hx + dx * i, 21, hz + dz * i, K.strut);
  }

  // ------------------------------------------------------------ jaw: lower mandible with up-fangs
  const JJ = [-0.5, 8.5, 0];
  const jaw = G();
  blob(jaw, -0.5, 7, 3.5, 6.8, 2.6, 5.6, K.belly, { p: 2.4 });
  jaw.carve((x, y) => y > 8);
  for (let x = -8; x <= 7; x++) for (let z = 0; z <= 9; z++) if (jaw.has(x, 8, z) && Math.abs(x + 0.5) <= 5.6 && z <= 7) jaw.set(x, 8, z, Math.abs(x + 0.5) <= 3 && z >= 1 ? TONGUE : MOUTH);
  for (let x = -8; x <= 7; x++) {
    let fz = 0;
    for (let z = 12; z >= 0; z--) if (jaw.has(x, 8, z)) { fz = z; break; }
    if (!fz) continue;
    const ax = Math.abs(x + 0.5);
    if (ax >= 2.5 && ax <= 2.5) { jaw.set(x, 9, fz, TOOTH); jaw.set(x, 10, fz, TOOTH); }
    else if (ax <= 5 && Math.round(ax + 0.5) % 2 === 0) jaw.set(x, 9, fz, TOOTH);
  }
  jaw.paint((x, y, z, c) => (c === K.belly && y === 5 ? K.trim : undefined));

  // ------------------------------------------------------------ grabber claws (dangle, snap forward on attack)
  const claw = G();
  capsule(claw, [-4, 8, -2], [-5, 5, 0], 1, 0.9, K.ring);
  blob(claw, -5, 4.5, 0.5, 1.4, 1.2, 1.4, K.strut);
  capsule(claw, [-5.5, 4, 1], [-6.5, 2.5, 2.5], 0.6, 0.4, K.trim);
  capsule(claw, [-4.5, 4, 1], [-3.5, 2.5, 2.5], 0.6, 0.4, K.trim);
  blob(claw, -7, 2, 3, 0.5, 0.5, 0.5, MAG);
  blob(claw, -3, 2, 3, 0.5, 0.5, 0.5, MAG);
  const clawR = flipX(claw);

  // ------------------------------------------------------------ antenna + tail light
  const ant = G();
  capsule(ant, [2, 22, -5], [3, 27, -7], 0.5, 0.4, K.trim);
  blob(ant, 3, 27.5, -7, 1, 1, 1, K.red, { glow: true });
  const tail = G();
  rbox(tail, -1, 13, -12, 0, 18, -8, 0, K.shell);
  rbox(tail, -1, 17, -13, 0, 19, -10, 0, K.top);
  tail.set(-1, 15, -13, K.red, true); tail.set(0, 15, -13, K.red, true);

  // ------------------------------------------------------------ props (spin around their hubs)
  const prop = (hx, hz) => {
    const g = G();
    for (let i = -5; i <= 5; i++) {
      if (i === 0) continue;
      const tip = Math.abs(i) >= 4;
      g.set(hx + i, 23, hz, tip ? MAG : K.prop);
      g.set(hx + i, 23, hz + (i > 0 ? 1 : -1), tip ? MAG : K.prop);
    }
    cyl(g, 'y', hx, hz, 23, 24, 1, 1, K.trim);
    g.set(hx, 25, hz, K.red, true);
    return g;
  };

  return {
    gait: 'float', voxel: 0.05, jitter: 0.02,
    parts: [
      jp('body', body, [-0.5, 0, 0]),
      jp('jaw', jaw, JJ, [-0.5, 0, 0], { parent: 'body', rot: [0.2, 0, 0] }),
      jp('armL', claw, [-4, 8, -2], [-0.5, 0, 0], { parent: 'body', rot: [0.2, 0, 0] }),
      jp('armR', clawR, [3, 8, -2], [-0.5, 0, 0], { parent: 'body', rot: [0.2, 0, 0] }),
      jp('antenna', ant, [2.5, 22, -5.5], [-0.5, 0, 0], { parent: 'body' }),
      jp('tail', tail, [-0.5, 15, -9], [-0.5, 0, 0], { parent: 'body' }),
      ...HUBS.map(([hx, hz], i) => jp('prop' + (i + 1), prop(hx, hz), [hx + 0.5, 23, hz + 0.5], [-0.5, 0, 0], { parent: 'body' })),
    ],
    muzzle: [-0.5, 11, 12],
  };
}

// ===========================================================================
// Circuit Shark: a land-shark built from a printed circuit board. Huge toothy
// grin, angry eyes, gold traces with glowing vias down its flanks, a magenta
// lightning-bolt dorsal fin crackling with sparks, and chunky robot legs.
function circuitShark() {
  const K = {
    top: 0x14935a, main: 0x22c46c, light: 0x7fe8a8, belly: 0xe9fff2, bellyD: 0xbfeed2,
    gold: 0xffc93a, goldD: 0xd89a1a, via: 0x7ff6ff, chip: 0x1d2236, pin: 0xd8dde8,
    metal: 0xb4bdd0, metalD: 0x5a6378, boot: 0x2a2440, spark: 0x9ffcff,
  };
  // countershaded PCB skin: dark top, green flanks, white belly
  const skin = (bellyY) => (x, y, z) => (y <= bellyY ? K.belly : y >= bellyY + 9 ? K.top : n3(x, y, z, 3) < 0.07 ? K.light : K.main);
  // circuit traces stamped on a side (art columns run towards the tail)
  const TRACE = [
    '..GGGGGGo....',
    '..G.......GGo',
    'oGG...o...G..',
    '......G...G..',
    '..oGGGG..GG..',
    '.........G...',
    '...oGGGGGG...',
  ];
  const tracePal = { G: K.gold, o: { c: K.via, glow: true } };

  // ------------------------------------------------------------ body (rear torso + bolt fin)
  const body = G();
  blob(body, -0.5, 15, -7, 6.6, 6.2, 8.5, skin(11), { p: 2.2 });
  blob(body, -0.5, 15.5, -14, 4.4, 4.4, 4.6, skin(12), { p: 2.2 });
  // gill slits behind the head
  for (const s of [-1, 1]) for (const z of [-3, -5, -7]) for (let y = 13; y <= 18; y++) {
    const xs = s < 0 ? -9 : 8;
    for (let x = xs; s < 0 ? x <= -1 : x >= 0; x -= s) if (body.has(x, y, z)) { body.set(x, y, z, K.top); break; }
  }
  stamp(body, TRACE, tracePal, { axis: '-x', y: 17, z: -9 });
  stamp(body, rev(TRACE), tracePal, { axis: 'x', y: 17, z: -21 });
  // IC chip "scales" on the back
  rbox(body, -3, 21, -12, 2, 21, -9, 0, K.chip);
  for (let z = -12; z <= -9; z += 1) { body.set(-4, 21, z, K.pin); body.set(3, 21, z, K.pin); }
  // magenta lightning-bolt dorsal fin
  const FIN = [
    '........MM',
    '.......MMM',
    '......MMM.',
    '.....MMMm.',
    '....MMMMMM',
    '...MMMMMM.',
    '...MMMMm..',
    '..MMMMMMMm',
    '.MMMMMMMMM',
    'MMMMMMMMMMM',
  ];
  slabYZ(body, FIN, { M: MAG, m: 0xff7ccc }, -1, 0, 30, -3);
  for (const [y, z] of [[31, -12], [32, -13], [29, -14], [27, -13]]) body.set(y === 31 ? -1 : 0, y, z, K.spark, true);
  gradY(body, 8, 22, -0.08, 0.05);

  // ------------------------------------------------------------ head (upper jaw, eyes, snout)
  const HJ = [-0.5, 15, -2];
  const head = G();
  blob(head, -0.5, 18, 3, 8.6, 7.6, 9.6, skin(13), { p: 2.25 });
  blob(head, -0.5, 19.5, 9.5, 6.6, 4.6, 4.4, skin(13), { p: 2.2 });
  // the mouth: carve the lower front and line it
  head.carve((x, y, z) => y <= 15 && z >= 3);
  head.carve((x, y, z) => y < 11);
  head.forEach((x, y, z) => {
    if (y === 16 && z >= 3 && head.has(x, 17, z) && !head.has(x, 15, z)) head.set(x, y, z, MOUTH);
  });
  for (let x = -9; x <= 8; x++) for (let y = 11; y <= 15; y++) if (head.has(x, y, 2)) head.set(x, y, 2, MOUTH);
  // upper teeth: zig-zag row hanging from the rim (front + sides)
  head.forEach((x, y, z) => {
    if (y !== 16 || z < 3) return;
    const rim = !head.has(x, 16, z + 1) || !head.has(x + 1, 16, z) || !head.has(x - 1, 16, z);
    if (!rim) return;
    head.set(x, 15, z, TOOTH);
    if (((x + z + 40) % 2) === 0) head.set(x, 14, z, TOOTH);
  });
  // eyes: bulging, angry, high on the head
  eyeBall(head, -5, 21, 9, [2.6, 3, 2.6], -1, { browCol: K.top, browT: 2, pw: 2, ph: 3, inward: 0.6 });
  eyeBall(head, 4, 21, 9, [2.6, 3, 2.6], 1, { browCol: K.top, browT: 2, pw: 2, ph: 3, inward: 0.6 });
  // nostrils + magenta bolt cheek marks
  sym(head, -2, 21, 14, K.top);
  stamp(head, ['..MM', '.MM.', 'MMMM', '.MM.', 'MM..'], { M: MAG }, { axis: '-x', y: 20, z: 4 });
  stamp(head, ['MM..', '.MM.', 'MMMM', '.MM.', '..MM'], { M: MAG }, { axis: 'x', y: 20, z: 1 });
  stamp(head, TRACE.slice(0, 4), tracePal, { axis: '-x', y: 25, z: 1 });
  stamp(head, rev(TRACE.slice(0, 4)), tracePal, { axis: 'x', y: 25, z: -11 });
  gradY(head, 11, 26, -0.06, 0.06, (x, y, z, c) => c !== TOOTH && c !== MOUTH);

  // ------------------------------------------------------------ jaw (lower jaw, opens wide)
  const JJ = [-0.5, 14, 1];
  const jaw = G();
  blob(jaw, -0.5, 12, 6.5, 7.4, 3.2, 7.4, (x, y) => (y <= 10 ? K.bellyD : K.belly), { p: 2.3 });
  jaw.carve((x, y) => y > 13);
  jaw.forEach((x, y, z) => {
    if (y !== 13) return;
    const rim = !jaw.has(x, 13, z + 1) || !jaw.has(x + 1, 13, z) || !jaw.has(x - 1, 13, z);
    if (rim) { jaw.set(x, 14, z, TOOTH); if (((x + z + 41) % 2) === 0) jaw.set(x, 15, z, TOOTH); }
    else jaw.set(x, y, z, Math.abs(x + 0.5) <= 3 && z <= 10 ? TONGUE : MOUTH);
  });

  // ------------------------------------------------------------ pectoral fin-arms
  const armL = G();
  chain(armL, [[-6, 13, 0], [-9.5, 11, -1], [-12, 8, -3]], [2.2, 1.4, 0.6], K.top);
  capsule(armL, [-9, 11.5, 0.4], [-11.5, 8.5, -1.5], 0.9, 0.5, K.gold);
  const armR = flipX(armL);

  // ------------------------------------------------------------ tail (crescent fin)
  const TJ = [-0.5, 15.5, -16];
  const tail = G();
  chain(tail, [[-0.5, 15.5, -16], [-0.5, 16.5, -20], [-0.5, 17.5, -23]], [3.4, 2.4, 1.6], skin(13));
  const flat = { clip: (x) => x < -1 || x > 0 };
  chain(tail, [[-0.5, 17.5, -23], [-0.5, 21, -25], [-0.5, 25, -27.5]], [2.2, 1.6, 0.6], K.top, flat);
  chain(tail, [[-0.5, 16.5, -23], [-0.5, 13.5, -25], [-0.5, 11, -26]], [2, 1.4, 0.6], K.top, flat);
  for (const [y, z] of [[25, -27], [24, -27], [11, -26]]) for (const x of [-1, 0]) if (tail.has(x, y, z)) tail.set(x, y, z, MAG);
  stamp(tail, ['GGGo', '...G'], tracePal, { axis: '-x', y: 17, z: -17 });
  stamp(tail, ['oGGG', 'G...'], tracePal, { axis: 'x', y: 17, z: -20 });

  // ------------------------------------------------------------ robot legs
  const leg = G();
  blob(leg, -4.5, 9, -4, 2.6, 2.4, 2.6, K.metalD);
  capsule(leg, [-4.5, 8, -4], [-4.5, 3.5, -3.5], 2, 1.7, K.metal);
  cyl(leg, 'y', -4.5, -3.6, 5, 6, 2.3, 2.3, K.gold);
  rbox(leg, -7, 0, -7, -2, 3, 1, 1.5, K.boot);
  rbox(leg, -7, 0, 0, -2, 2, 2, 1, 0xffffff);
  for (let x = -7; x <= -2; x++) for (let z = -7; z <= 2; z++) if (leg.has(x, 0, z)) leg.set(x, 0, z, MAG);
  leg.set(-7, 2, -3, K.via, true); leg.set(-7, 2, -4, K.via, true);
  const legR = flipX(leg);

  return {
    gait: 'walk', voxel: 0.05, jitter: 0.02, finish: 'gloss',
    parts: [
      jp('legL', leg, [-4.5, 9, -4]), jp('legR', legR, [3.5, 9, -4]),
      jp('body', body, [-0.5, 0, 0]),
      jp('armL', armL, [-6, 13, 0], [-0.5, 0, 0], { parent: 'body' }),
      jp('armR', armR, [5, 13, 0], [-0.5, 0, 0], { parent: 'body' }),
      jp('tail', tail, TJ, [-0.5, 0, 0], { parent: 'body' }),
      jp('head', head, HJ),
      jp('jaw', jaw, JJ, HJ, { parent: 'head', rot: [0.18, 0, 0] }),
    ],
    muzzle: [-0.5, 14, 15],
  };
}

export const TECHNO_MODELS = {
  glitchBot,
  droneFang,
  circuitShark,
};

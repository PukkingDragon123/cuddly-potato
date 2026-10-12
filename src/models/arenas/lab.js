// Arena 1: BEAST LAB — the futuristic Lab compound yard where every recruit
// starts. Clean white/blue lab tiles, hazard-striped lane edges, bubbling
// specimen tanks, a giant glowing MRBEAST LAB billboard, satellite dishes and
// lab domes, layered over pixel-art hills, mountains and a bright sky.
import {
  THREE, VoxGrid, ArenaKit, FIELD, shade, mixHex, hash3, vnoise, text, textW, glassMat, glowMat,
  paintGradient, paintClouds, paintRidge, paintTrees, paintSkyline, paintSun, px, disc, skyTexture, parallaxWidth,
  treeGrid, rockGrid, signGrid,
} from './kit.js';

const C = {
  tile: 0xf2f6fc, tile2: 0xe2eaf6, seam: 0x9fb4d6, blue: 0x29b6f6, blueD: 0x1477c9, pink: 0xff2e88, yellow: 0xffd23f, ink: 0x15121f,
  grass: 0x5cc24a, grassD: 0x3f9e3a, grassL: 0x86de5e, metal: 0xb8c0cc, metalD: 0x6b7386, glass: 0xbfe9ff,
};

// --------------------------------------------------------------------------- shared props

const tankGrid = (liquid) => () => {
  const g = new VoxGrid();
  // base
  for (let x = -6; x <= 5; x++) for (let z = -6; z <= 5; z++) {
    const d = (x + 0.5) ** 2 + (z + 0.5) ** 2;
    if (d <= 36) { g.set(x, 0, z, C.metalD); g.set(x, 1, z, d > 25 ? C.yellow : C.metal); }
    if (d <= 36 && d > 25) g.set(x, 2, z, (x + z) & 1 ? C.yellow : C.ink);
  }
  // cap
  for (let x = -6; x <= 5; x++) for (let z = -6; z <= 5; z++) {
    const d = (x + 0.5) ** 2 + (z + 0.5) ** 2;
    if (d <= 36) { g.set(x, 22, z, C.metal); g.set(x, 23, z, d > 20 ? C.metalD : C.metal); }
  }
  for (let x = -2; x <= 1; x++) for (let z = -2; z <= 1; z++) g.set(x, 24, z, C.blue, true);
  // struts
  for (const [x, z] of [[-6, -1], [5, -1], [-1, -6], [-1, 5]]) for (let y = 3; y < 22; y++) g.set(x, y, z, C.metalD);
  void liquid;
  return g;
};

function addTank(K, x, z, liquid, s = 0.12) {
  const grp = new THREE.Group();
  grp.position.set(x, 0, z);
  K.add(grp);
  K.mesh('tankFrame', tankGrid(liquid), { scale: s, ao: true }, 0, 0, 0, 0, 1, { parent: grp, shadow: true });
  const r = 5.4 * s, h = 19 * s;
  const liq = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.96, r * 0.96, h * 0.86, 20), new THREE.MeshBasicMaterial({ color: liquid, transparent: true, opacity: 0.55, toneMapped: false }));
  liq.position.y = 3 * s + h * 0.43;
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 20, 1, true), glassMat(C.glass, 0.22));
  glass.position.y = 3 * s + h / 2;
  grp.add(liq, glass);
  // floating specimen silhouette + rising bubbles
  const bubbles = [];
  for (let i = 0; i < 7; i++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.07), glowMat(shade(liquid, 0.6)));
    b.userData.o = Math.random() * 10;
    b.position.set((Math.random() - 0.5) * r, 0, (Math.random() - 0.5) * r);
    grp.add(b);
    bubbles.push(b);
  }
  K.onUpdate((dt, t) => {
    for (const b of bubbles) {
      const k = ((t * 0.35 + b.userData.o) % 1);
      b.position.y = 3 * s + k * h * 0.84;
    }
    liq.material.opacity = 0.5 + Math.sin(t * 2 + x) * 0.05;
  });
  return grp;
}

const domeGrid = () => {
  const g = new VoxGrid();
  const R = 14;
  for (let x = -R; x <= R; x++) for (let z = -R; z <= R; z++) for (let y = 0; y <= R; y++) {
    const d = Math.sqrt(x * x + y * y * 1.25 + z * z);
    if (d > R || d < R - 1.6) continue;
    const ring = y % 4 === 0;
    const win = !ring && Math.abs(x) % 5 < 2 && y > 2 && y < 10;
    g.set(x, y, z, win ? 0x8fe3ff : ring ? C.blue : C.tile, win);
  }
  for (let x = -R - 1; x <= R + 1; x++) for (let z = -R - 1; z <= R + 1; z++) if (x * x + z * z <= (R + 1) ** 2) g.set(x, 0, z, C.metalD);
  // antenna
  for (let y = R; y < R + 6; y++) g.set(0, y, 0, C.metal);
  g.set(0, R + 6, 0, C.pink, true);
  return g;
};

const dishGrid = () => {
  const g = new VoxGrid();
  for (let y = 0; y < 10; y++) g.box(-1, y, -1, 0, y, 0, C.metalD);
  for (let x = -7; x <= 6; x++) for (let y = -7; y <= 6; y++) {
    const d = (x + 0.5) ** 2 + (y + 0.5) ** 2;
    if (d <= 49) g.set(x, y + 16, Math.round(d / 14), d > 36 ? C.metal : C.tile);
  }
  for (let z = 0; z < 6; z++) g.set(0, 16, -z - 1, C.metalD);
  g.set(0, 16, -7, C.pink, true);
  return g;
};

const fenceGrid = () => {
  const g = new VoxGrid();
  for (let x = 0; x < 24; x++) {
    const post = x % 12 === 0;
    for (let y = 0; y < (post ? 9 : 7); y++) g.set(x, y, 0, post ? C.metalD : y === 0 || y === 6 ? C.metal : (x + y) % 2 ? 0xd8e6f6 : 0xc6d6ec);
    if (post) g.set(x, 9, 0, C.blue, true);
    if (x % 12 === 6) for (let y = 2; y < 5; y++) g.set(x, y, 1, C.pink);
  }
  return g;
};

const crateGrid = () => {
  const g = new VoxGrid();
  g.box(-3, 0, -3, 2, 5, 2, 0xc9874a);
  g.box(-3, 0, -3, 2, 0, 2, 0x8a5a2a);
  g.box(-3, 5, -3, 2, 5, 2, 0xe0a060);
  for (const z of [-3, 2]) for (let x = -3; x <= 2; x++) { g.set(x, x + 3, z, 0x8a5a2a); }
  text(g, '$', 0, 1, 3, '+z', C.yellow, { center: true });
  return g;
};

const barrelGrid = (col) => () => {
  const g = new VoxGrid();
  for (let y = 0; y < 8; y++) for (let x = -3; x <= 2; x++) for (let z = -3; z <= 2; z++) {
    if ((x + 0.5) ** 2 + (z + 0.5) ** 2 > 9.5) continue;
    g.set(x, y, z, y === 1 || y === 6 ? shade(col, -0.25) : col);
  }
  for (let x = -1; x <= 0; x++) for (let z = -1; z <= 0; z++) g.set(x, 8, z, shade(col, 0.2));
  // hazard trefoil-ish sticker
  g.set(-1, 4, 3, C.yellow).set(0, 4, 3, C.yellow).set(-1, 3, 3, C.ink).set(0, 3, 3, C.yellow);
  return g;
};

const bollardGrid = () => {
  const g = new VoxGrid();
  for (let y = 0; y < 3; y++) g.box(-1, y, -1, 0, y, 0, y === 2 ? C.blue : (y & 1 ? C.yellow : C.ink));
  g.box(-1, 3, -1, 0, 3, 0, C.blue);
  return g;
};

const robotArmGrid = () => {
  const g = new VoxGrid();
  g.box(-3, 0, -3, 2, 2, 2, C.metalD);
  g.box(-1, 3, -1, 0, 12, 0, C.yellow);
  g.box(-2, 12, -2, 1, 14, 1, C.metalD);
  for (let i = 0; i < 9; i++) g.box(i - 1, 14 + Math.round(i * 0.4), -1, i, 15 + Math.round(i * 0.4), 0, C.yellow);
  g.box(8, 16, -2, 10, 19, 1, C.metalD);
  g.set(9, 15, 0, C.pink, true);
  return g;
};

// --------------------------------------------------------------------------- battle

export function buildBattle(K) {
  const LH = FIELD.LANE_HALF;
  // ---- sky (screen space)
  const sky = skyTexture('lab', [[0, 0x2f9fff], [0.55, 0x8fdcff], [1, 0xe8f8ff]], (ctx, w, h) => {
    paintSun(ctx, w * 0.78, h * 0.2, 6);
    paintClouds(ctx, w, h, { n: 5, y0: 8, y1: h * 0.45, size: 6, seed: 4 });
  });

  // ---- parallax pixel layers (far -> near)
  const w1 = parallaxWidth(-160);
  K.parallax('mountains', {
    z: -160, y: -4, w: w1, h: 34, tw: 384, th: 64,
    paint: (ctx, w, h) => {
      paintClouds(ctx, w, h, { n: 7, y0: 4, y1: 18, size: 5, seed: 9, color: 0xf4fbff, shade: 0xd2e6f8 });
      paintRidge(ctx, w, h, { base: 0.62, amp: 18, freq: 0.03, seed: 2, color: 0x7aa8dc, rim: 0xb8d8f8, dark: 0x5a86c0, snow: 0xf2f8ff, peaks: true });
    },
  });
  const w2 = parallaxWidth(-110);
  K.parallax('hills', {
    z: -110, y: -4, w: w2, h: 17, tw: 320, th: 44,
    paint: (ctx, w, h) => {
      const tops = paintRidge(ctx, w, h, { base: 0.55, amp: 9, freq: 0.035, seed: 5, color: 0x5ab05a, rim: 0x9ee07a, dark: 0x3e8a48, speck: 0x7ccc5a });
      paintTrees(ctx, w, Math.round(h * 0.62), { seed: 3, size: 4, step: 5, color: 0x3f9a4a, kind: 'pine' });
      void tops;
    },
  });
  const w3 = parallaxWidth(-70);
  K.parallax('compound', {
    z: -70, y: -3, w: w3, h: 11, tw: 288, th: 44,
    paint: (ctx, w, h) => {
      // lab compound silhouettes: domes, towers, a big antenna mast, lit windows
      paintSkyline(ctx, w, h, { color: 0xd6e6f8, rim: 0xffffff, window: [0x29b6f6, 0x8fe3ff], minH: 10, maxH: 30, minW: 10, maxW: 22, seed: 12, gap: 8, lit: 0.6 });
      for (const cx of [w * 0.18, w * 0.52, w * 0.83]) {
        disc(ctx, cx, h - 2, 12, 0xe8f2ff);
        disc(ctx, cx, h - 2, 10, 0xd0e2f6);
        px(ctx, cx - 12, h - 3, 25, 3, 0x9fb4d6);
        for (let k = -2; k <= 2; k++) px(ctx, cx + k * 4, h - 8, 2, 2, 0x29b6f6);
      }
      px(ctx, w * 0.36, h - 46, 2, 46, 0x9fb4d6);
      px(ctx, w * 0.36 - 3, h - 46, 8, 2, 0xff2e88);
      paintGradient(ctx, 0, h - 4, w, 4, [[0, 0x8fc77a], [1, 0x6aa85a]], { bands: 2 });
    },
  });

  // ---- ground + lane
  const grassCol = (x, z) => {
    const n = vnoise(x * 0.11, 3, z * 0.11), m = hash3(Math.floor(x * 2), 7, Math.floor(z * 2));
    if (m < 0.012) return [0xffd23f, 0xff6fb8, 0xffffff][Math.floor(m * 250) % 3]; // flowers
    return n > 0.64 ? C.grassL : n < 0.3 ? C.grassD : m < 0.2 ? shade(C.grass, -0.06) : C.grass;
  };
  // fine ground near the camera, coarse ground far away
  K.ground({ id: 'groundNear', x0: -60, x1: 60, z0: -12, z1: 20, scale: 0.5, color: (x, z) => (Math.abs(z) < FIELD.LANE_HALF + 0.3 ? 0x8a9aae : grassCol(x, z)) });
  K.ground({
    id: 'groundFar', x0: -110, x1: 110, z0: -70, z1: -12, scale: 1,
    color: (x, z) => {
      const n = vnoise(x * 0.08, 3, z * 0.08);
      if (z < -3.5 && z > -9 && Math.abs(x) < 34) return (Math.floor(x) + Math.floor(z)) & 1 ? 0xdfe8f4 : 0xcfdcec; // plaza tiles behind lane
      return grassCol(x, z);
    },
  });
  K.lane({
    x0: -24, x1: 24, scale: 0.25,
    color: (ix, iz, x, z) => {
      const edge = Math.abs(z) > LH - 0.5;
      if (edge) return ((ix + iz) >> 1) & 1 ? C.yellow : C.ink; // hazard stripes
      if (Math.abs(x) < 0.26) return C.blue; // centre line
      const tx = ((ix % 8) + 8) % 8, tz = ((iz % 8) + 8) % 8;
      if (tx === 0 || tz === 0) return C.seam;
      return ((Math.floor(ix / 8) + Math.floor(iz / 8)) & 1) ? C.tile : C.tile2;
    },
    raise: (ix, iz) => Math.abs(iz * 0.25) < 0.75 && Math.abs(ix * 0.25) < 0.26,
    raiseColor: () => C.blue,
    depth: 3,
  });
  // glowing centre marker (magenta bolt on the floor)
  K.mesh('centerBolt', () => {
    const g = new VoxGrid();
    const B = ['..###', '.###.', '#####', '..##.', '.##..', '##...'];
    B.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === '#') g.set(c - 2, 0, r - 3, C.pink, true); }));
    return g;
  }, { scale: 0.25, pivot: [0, 0, 0] }, 0.02, 0.005, 1.4);

  // ---- behind the lane: plaza, fence, tanks, crates/barrels (breakables)
  K.inst('fence', fenceGrid, { scale: 0.125, ao: true }, [-36, -30, -24, -18, -12, -6, 0, 6, 12, 18, 24, 30].map((x) => [x, 0, -9.6]), { shadow: true });
  for (const [x, col] of [[-16, 0x7cff3a], [-9.5, 0x29e0ff], [9.5, 0xff4fd8], [16, 0x7cff3a]]) addTank(K, x, -6.4, col);
  const dish = K.mesh('dish', dishGrid, { scale: 0.13, ao: true }, -22, 0, -12, 0.5, 1, { shadow: true });
  K.onUpdate((dt, t) => { dish.rotation.y = 0.5 + Math.sin(t * 0.3) * 0.6; });
  K.mesh('dish', dishGrid, { scale: 0.13, ao: true }, 23, 0, -13, -0.6, 1, { shadow: true });
  const arm = K.mesh('robotArm', robotArmGrid, { scale: 0.12, ao: true }, 4.5, 0, -6.2, 0, 1, { shadow: true });
  K.onUpdate((dt, t) => { arm.rotation.y = Math.sin(t * 0.7) * 0.9; });
  // breakables right behind the lane
  for (const [x, kind] of [[-13, 'crate'], [-4.5, 'barrel'], [3, 'crate'], [12.5, 'barrel'], [-19, 'barrel'], [19, 'crate']]) {
    if (kind === 'crate') K.breakable('crate', 'crate', crateGrid, { scale: 0.1 }, x, -3.3, K.rand(-0.3, 0.3));
    else K.breakable('barrel', 'barrel' + (x > 0 ? 'p' : 'g'), barrelGrid(x > 0 ? C.pink : 0x5fdc4a), { scale: 0.1 }, x, -3.2, K.rand(0, 1));
  }

  // ---- far background: big billboard, domes, trees
  K.mesh('billboard', () => signGrid('MRBEAST LAB', { textScale: 3, pad: 3, legH: 34, bg: 0x15121f, frame: C.blue, color: C.pink }), { scale: 0.16 }, -2, 0, -34, 0, 1, { shadow: false });
  K.mesh('dome', domeGrid, { scale: 0.22 }, -15, 0, -28);
  K.mesh('dome', domeGrid, { scale: 0.22 }, 17, 0, -31, 0, 1.2);
  const trees = [];
  for (let i = 0; i < 26; i++) {
    const x = K.rand(-60, 60), z = K.rand(-46, -14);
    if (Math.abs(x) < 7 && z > -26) continue;
    trees.push([x, 0, z, K.rand(0, 6), K.rand(0.18, 0.26)]);
  }
  K.inst('treeRound', () => treeGrid('round', { seed: 2 }), { scale: 1 }, trees.filter((_, i) => i % 2 === 0));
  K.inst('treePine', () => treeGrid('pine', { leaf: 0x3fae4a }), { scale: 1 }, trees.filter((_, i) => i % 2 === 1));
  K.inst('rock', () => rockGrid({ color: 0xa8b0c0 }), { scale: 0.18 }, [[-26, 0, -5, 0.4], [27, 0, -4.6, 1.2], [-31, 0, 5, 2], [33, 0, 6, 0.1]]);

  // ---- foreground (low!): bollards, cables, grass tufts
  const boll = [];
  for (let x = -22; x <= 22; x += 4) boll.push([x, 0, LH + 0.45, 0, 1]);
  K.inst('bollard', bollardGrid, { scale: 0.11, ao: true }, boll, { shadow: true });
  const tufts = [];
  for (let i = 0; i < 70; i++) tufts.push([K.rand(-40, 40), 0, K.rand(LH + 1.2, 12), K.rand(0, 6), K.rand(0.6, 1.2)]);
  K.inst('tuft', () => {
    const g = new VoxGrid();
    for (const [x, h] of [[0, 3], [1, 2], [-1, 2], [2, 1]]) for (let y = 0; y < h; y++) g.set(x, y, 0, y === h - 1 ? C.grassL : C.grassD);
    return g;
  }, { scale: 0.08 }, tufts);

  return {
    sky,
    fog: { color: 0xcfeaff, near: 60, far: 170 },
    lights: { sky: 0xdff0ff, ground: 0x7a8a6a, hemi: 1.15, sun: 2.3, sunColor: 0xfff1dc, dir: [-6, 14, 10], rim: 1.0, rimColor: 0xa8dcff },
    dust: 0xd8e2ee,
  };
}

// --------------------------------------------------------------------------- Beast Island zone diorama

export function buildZone(K) {
  // circular lab plaza with a mini dome, tanks, the Beast Tiger tank and the billboard
  K.mesh('zoneBase', () => {
    const g = new VoxGrid();
    for (let x = -28; x <= 27; x++) for (let z = -28; z <= 27; z++) {
      const d = Math.sqrt((x + 0.5) ** 2 + (z + 0.5) ** 2);
      if (d > 27.5) continue;
      const edge = d > 25.5;
      g.set(x, 0, z, edge ? (((x + z) >> 1) & 1 ? C.yellow : C.ink) : (((x >> 2) + (z >> 2)) & 1) ? C.tile : C.tile2);
      g.set(x, -1, z, C.metalD);
    }
    return g;
  }, { scale: 0.25 }, 0, -0.25, 0);
  K.mesh('dome', domeGrid, { scale: 0.16 }, -2.5, 0, -2.5, 0.4);
  for (const [x, z, col] of [[3.2, -2.6, 0x7cff3a], [4.6, 0.2, 0xff4fd8], [-4.8, 1.6, 0x29e0ff]]) addTank(K, x, z, col, 0.09);
  K.mesh('billboard', () => signGrid('LAB', { textScale: 3, pad: 2, legH: 10, bg: 0x15121f, frame: C.blue, color: C.pink }), { scale: 0.12 }, 2, 0, -5);
  const dish = K.mesh('dish', dishGrid, { scale: 0.09, ao: true }, -5.5, 0, -2, 0.3, 1, { shadow: true });
  K.onUpdate((dt, t) => { dish.rotation.y = Math.sin(t * 0.4) * 0.8; });
  // hotspot anchors (the home scene places NPCs / boss gates / secrets here)
  const anchor = (name, x, y, z) => { const o = new THREE.Object3D(); o.position.set(x, y, z); o.name = name; K.root.add(o); K.hotspots[name] = o; return o; };
  anchor('npc', 1.5, 0, 3.5);
  anchor('boss', -3.5, 0, 3.8);
  anchor('enterLab', -2.5, 0.8, 0.5);
  return { focus: [0, 1.2, 0], radius: 7 };
}

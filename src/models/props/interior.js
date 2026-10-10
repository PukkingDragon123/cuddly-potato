// Lab interior (hub room) props.
import {
  THREE, VoxGrid, Mats, makeMesh, PAL, shade, mixHex, hash3, vnoise, ring, text, vmesh, vgeo, glassMat, glowMat, tintMat,
  group, hazardC, pixelTex, texPlane, css, checker,
} from './common.js';
import { barrel, pipe, hazard, windowZ } from './labParts.js';

const S = { scale: 0.1 };
const wrap = (m, name) => { const r = group(m); r.name = name; return r; };

// ---------------------------------------------------------------------------
/** Huge specimen tank. { root, glass, liquid, frame, bubbler, update(dt) } */
export function makeTank(o = {}) {
  const liquidColor = o.color ?? 0x3fe8d0;
  const frame = vmesh('bigTank_frame', () => {
    const g = new VoxGrid();
    const R = 14;
    // base
    g.cylinder(0, 0, 0, 2, R + 2, PAL.metalDD);
    g.cylinder(0, 0, 3, 6, R + 1, (x, y, z) => (y === 5 ? PAL.yellow : PAL.metalD));
    ring(g, 0, 0, 5, 5, R + 1, hazardC(), false, 1);
    for (let a = 0; a < 16; a++) {
      const t = (a / 16) * Math.PI * 2;
      g.set(Math.round(Math.cos(t) * (R + 2.4)), 1, Math.round(Math.sin(t) * (R + 2.4)), PAL.cyan, true);
    }
    // inner floor (glowing grate)
    g.cylinder(0, 0, 6, 6, R - 1, (x, y, z) => ((x + z) % 3 === 0 ? 0x2a4048 : 0x5ce1e6), 'y', true);
    // top cap
    g.cylinder(0, 0, 40, 44, R + 1, (x, y, z) => (y === 41 ? PAL.pink : PAL.metal));
    g.cylinder(0, 0, 45, 45, R - 2, PAL.metalD);
    g.cylinder(0, 0, 40, 40, R - 1, PAL.metalD);
    // vertical struts
    for (let a = 0; a < 6; a++) {
      const t = (a / 6) * Math.PI * 2 + Math.PI / 6;
      const x = Math.round(Math.cos(t) * (R + 1)), z = Math.round(Math.sin(t) * (R + 1));
      g.box(x, 7, z, x, 39, z, PAL.metalD);
    }
    // pipes on top
    pipe(g, 'y', 46, 52, -5, -4, PAL.metal, PAL.pink, 1, 4);
    pipe(g, 'x', -5, -16, 52, -4, PAL.metal, PAL.pink, 1, 4);
    pipe(g, 'y', 46, 50, 6, 3, PAL.metalL, PAL.blue, 1, 4);
    pipe(g, 'z', 3, -12, 6, 50, PAL.metalL, PAL.blue, 1, 4);
    // control box
    g.box(10, 7, 12, 15, 14, 14, PAL.metalD);
    g.box(11, 10, 15, 14, 13, 15, 0x103040);
    g.set(12, 12, 15, PAL.slime, true).set(13, 11, 15, PAL.pink, true).set(11, 11, 15, PAL.yellow, true);
    // warning label
    g.box(-4, 2, R + 2, 3, 3, R + 2, PAL.yellow);
    text(g, '!', 0, 1, R + 3, '+z', PAL.ink);
    return g;
  }, { scale: 0.1, pivot: [0.5, 0, 0.5] });
  const H = 3.35, R = 1.45;
  const liquidMat = new THREE.MeshPhongMaterial({ color: liquidColor, transparent: true, opacity: 0.35, depthWrite: false, emissive: mixHex(liquidColor, 0, 0.6), shininess: 50 });
  const liquid = new THREE.Mesh(new THREE.CylinderGeometry(R - 0.06, R - 0.06, H * 0.92, 24, 1, false), liquidMat);
  liquid.position.y = 0.7 + (H * 0.92) / 2;
  liquid.renderOrder = 2;
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(R, R, H, 24, 1, true), glassMat(0xd8f8ff, 0.2));
  glass.position.y = 0.7 + H / 2;
  glass.renderOrder = 3;
  // liquid surface highlight ring
  const surf = new THREE.Mesh(new THREE.RingGeometry(R * 0.7, R - 0.07, 24), glowMat(mixHex(liquidColor, 0xffffff, 0.5), 0.5));
  surf.rotation.x = -Math.PI / 2;
  surf.position.y = 0.7 + H * 0.92;
  const bubbler = new THREE.Group();
  bubbler.name = 'bubbler';
  const bGeo = new THREE.BoxGeometry(0.09, 0.09, 0.09);
  const bMat = new THREE.MeshBasicMaterial({ color: 0xeaffff, transparent: true, opacity: 0.7, depthWrite: false });
  for (let i = 0; i < 22; i++) {
    const b = new THREE.Mesh(bGeo, bMat);
    const a = Math.random() * Math.PI * 2, r = 0.25 + Math.random() * 1.0;
    b.userData = { a, r, sp: 0.4 + Math.random() * 0.7, ph: Math.random() * 6 };
    b.position.set(Math.cos(a) * r, 0.75 + Math.random() * 3, Math.sin(a) * r);
    b.renderOrder = 2;
    bubbler.add(b);
  }
  const root = group(frame, liquid, surf, bubbler, glass);
  root.name = 'tank';
  let t = 0;
  const update = (dt) => {
    t += dt;
    for (const b of bubbler.children) {
      const u = b.userData;
      b.position.y += dt * u.sp;
      if (b.position.y > 0.7 + H * 0.9) b.position.y = 0.75;
      b.position.x = Math.cos(u.a) * u.r + Math.sin(t * 2 + u.ph) * 0.05;
    }
    surf.material.opacity = 0.4 + Math.sin(t * 2) * 0.1;
  };
  root.userData.update = update;
  return { root, glass, liquid, frame, bubbler, update };
}

// ---------------------------------------------------------------------------
export function makeConsole() {
  return wrap(vmesh('console', () => {
    const g = new VoxGrid();
    // sloped desk console, faces +z
    for (let z = -5; z <= 5; z++) {
      const h = 9 + Math.round((-z + 5) * 0.4);
      g.box(-12, 0, z, 11, h, z, (x, y) => (y < 2 ? PAL.metalDD : y === h ? PAL.metalL : PAL.white2));
    }
    g.box(-12, 2, 6, 11, 8, 6, PAL.white);
    g.box(-12, 5, 6, 11, 5, 6, PAL.blue);
    // buttons on top slope
    const btn = [PAL.red, PAL.yellow, PAL.slime, PAL.blue, PAL.pink];
    for (let x = -10; x <= 9; x += 2) for (let z = 1; z <= 4; z += 2) {
      const h = 9 + Math.round((-z + 5) * 0.4);
      g.set(x, h + 1, z, btn[(x + z * 3) & 3 ? (x + z) % 5 < 0 ? 0 : (x + z) % 5 : 4], (x + z) % 3 === 0);
    }
    // big red button
    g.box(-1, 11, -1, 0, 12, 0, PAL.red);
    g.box(-2, 11, -2, 1, 11, 1, PAL.yellow);
    // levers
    for (const x of [7, 9]) { g.box(x, 13, -3, x, 16, -3, PAL.metal); g.set(x, 17, -3, PAL.red); }
    // screens on back
    g.box(-12, 14, -5, -2, 22, -4, PAL.metalDD);
    g.box(-11, 15, -3, -3, 21, -3, (x, y) => (y === 18 || (x + y) % 5 === 0 ? 0x5ce1e6 : 0x0d3a4a), true);
    g.box(1, 14, -5, 11, 22, -4, PAL.metalDD);
    g.box(2, 15, -3, 10, 21, -3, (x, y) => {
      const v = Math.round(Math.sin(x * 0.9) * 2) + 18;
      return y === v ? PAL.slime : y < 16 ? 0x1a3a1a : 0x0d2a1a;
    }, true);
    return g;
  }, S), 'console');
}

export function makeComputer() {
  return wrap(vmesh('computer', () => {
    const g = new VoxGrid();
    // desk
    g.box(-10, 7, -5, 9, 8, 4, PAL.wood);
    for (const x of [-10, 9]) for (const z of [-5, 4]) g.box(x, 0, z, x, 6, z, PAL.metalD);
    // monitor
    g.box(-1, 9, -3, 0, 11, -2, PAL.metalDD);
    g.box(-7, 12, -3, 6, 21, -3, PAL.ink);
    g.box(-6, 13, -2, 5, 20, -2, (x, y) => {
      if (y === 20) return 0xff4fa3;
      if (x > -5 && x < 0 && y > 14 && y < 18) return 0xffd23f;
      if (x > 1 && x < 5 && (y === 16 || y === 18)) return 0xffffff;
      return 0x29b6f6;
    }, true);
    // keyboard + mouse + mug
    g.box(-5, 9, 0, 3, 9, 2, 0xe4e8ee);
    for (let x = -4; x <= 2; x += 2) g.set(x, 10, 1, 0xb8c0cc);
    g.box(5, 9, 1, 6, 9, 2, 0xe4e8ee);
    g.box(-9, 9, 0, -7, 11, 2, 0xffffff).set(-8, 11, 1, 0x5a3220).set(-6, 10, 1, 0xffffff);
    // tower
    g.box(10, 0, -4, 14, 10, 3, 0x2a2e3a);
    g.box(14, 2, -3, 14, 9, 2, 0x1a1d26);
    for (let y = 3; y <= 8; y += 2) g.set(15, y, 0, (y % 4) ? PAL.cyan : PAL.pink, true);
    return g;
  }, S), 'computer');
}

export function makePipes(len = 4) {
  const n = Math.max(4, Math.round(len * 10));
  return wrap(vmesh('pipes_' + n, () => {
    const g = new VoxGrid();
    const x0 = -Math.floor(n / 2), x1 = x0 + n - 1;
    pipe(g, 'x', x0, x1, 4, 0, PAL.metal, PAL.blue, 1, 8);
    pipe(g, 'x', x0, x1, 9, 1, PAL.metalL, PAL.pink, 1, 10);
    pipe(g, 'x', x0, x1, 13, 0, 0x8a6a3a, PAL.yellow, 0, 6);
    for (let x = x0 + 5; x < x1; x += 14) {
      g.box(x, 0, -1, x, 15, -1, PAL.metalD);
      g.cylinder(x, 3, 3, 3, 2, PAL.red, 'z');
      g.set(x, 4, 3, PAL.red).set(x, 2, 3, PAL.red);
    }
    for (let x = x0 + 9; x < x1; x += 14) g.box(x - 1, 7, 3, x + 1, 11, 3, PAL.yellow).set(x, 9, 4, PAL.ink);
    return g;
  }, { scale: 0.1 }), 'pipes');
}

export function makeLabDesk() {
  const body = vmesh('labDesk', () => {
    const g = new VoxGrid();
    g.box(-14, 7, -5, 13, 8, 5, PAL.white);
    g.box(-14, 8, -5, 13, 8, 5, (x, z) => 0xe8ecf2);
    g.box(-14, 0, -5, -8, 6, 5, PAL.white2);
    g.box(-13, 2, 6, -9, 3, 6, PAL.metal).box(-13, 4, 6, -9, 5, 6, PAL.metal);
    for (const [x, z] of [[13, -5], [13, 5]]) g.box(x, 0, z, x, 6, z, PAL.metalD);
    // microscope
    g.box(4, 9, -2, 8, 9, 1, PAL.ink);
    g.box(7, 10, -1, 7, 15, -1, PAL.white2);
    g.line(7, 15, -1, 5, 17, 1, PAL.white2, 0);
    g.box(5, 12, 0, 6, 12, 1, PAL.metalD);
    g.set(5, 18, 1, PAL.ink);
    // papers + clipboard
    g.box(-12, 9, -3, -7, 9, 2, 0xffffff);
    g.box(-11, 9, -1, -8, 9, -1, 0x9aa2b4);
    g.box(-5, 9, 1, -1, 9, 4, PAL.woodL).box(-4, 10, 1, -2, 10, 3, 0xffffff);
    // test tube rack
    g.box(9, 9, 2, 13, 10, 3, PAL.wood);
    for (const [x, c] of [[9, PAL.slime], [11, PAL.pink], [13, PAL.cyan]]) { g.box(x, 11, 2, x, 13, 2, c, true); g.set(x, 14, 2, 0xe8f8ff); }
    return g;
  }, S);
  const r = group(body);
  r.name = 'labDesk';
  return r;
}

export function makeMug() {
  return wrap(vmesh('mug', () => {
    const g = new VoxGrid();
    g.cylinder(0, 0, 0, 6, 3, (x, y) => (y === 0 ? 0xd8dde6 : 0xffffff));
    g.cylinder(0, 0, 6, 6, 2, 0x5a3220);
    g.cylinder(0, 0, 1, 6, 2, null);
    g.cylinder(0, 0, 1, 5, 2, 0x4a2412);
    g.box(4, 2, 0, 4, 4, 0, 0xffffff).set(5, 2, 0, 0xffffff).set(5, 4, 0, 0xffffff).box(5, 3, 0, 5, 3, 0, 0xffffff).set(6, 3, 0, 0xffffff);
    // pink bolt logo
    g.set(0, 4, 4, PAL.pink).set(-1, 3, 4, PAL.pink).set(0, 3, 4, PAL.pink).set(0, 2, 4, PAL.pink).set(1, 2, 4, PAL.pink).set(0, 1, 4, PAL.pink);
    // steam
    g.set(0, 8, 0, 0xffffff, true).set(1, 9, 0, 0xeaeaea, true).set(0, 10, 0, 0xffffff, true);
    return g;
  }, { scale: 0.035 }), 'mug');
}

export function makeLabShelf() {
  return wrap(vmesh('labShelf', () => {
    const g = new VoxGrid();
    for (const x of [-10, 9]) g.box(x, 0, -3, x, 26, 2, PAL.metalD);
    g.box(-10, 0, -3, 9, 26, -3, PAL.white2);
    for (const y of [1, 9, 17, 25]) g.box(-9, y, -2, 8, y, 2, PAL.metal);
    // jars and beakers
    const cols = [PAL.slime, PAL.pink, PAL.cyan, PAL.yellow, PAL.purple, PAL.orange];
    let i = 0;
    for (const y of [2, 10, 18]) {
      for (let x = -8; x <= 6; ) {
        const c = cols[i++ % cols.length];
        const kind = (x + y) % 3;
        if (kind === 0) { g.box(x, y, -1, x + 2, y + 4, 1, 0xe8f8ff); g.box(x, y, 0, x + 2, y + 2, 1, c, true); g.box(x, y + 5, -1, x + 2, y + 5, 1, PAL.metalD); x += 4; }
        else if (kind === 1) { g.box(x, y, -1, x + 1, y + 1, 0, c, true); g.box(x, y + 2, -1, x + 1, y + 3, 0, 0xe8f8ff); x += 3; }
        else { g.box(x, y, -2, x + 3, y + 3, 1, PAL.woodL); g.box(x, y + 1, 2, x + 3, y + 1, 2, 0xffffff); x += 5; }
      }
    }
    // hazard box on top
    g.box(-6, 26, -2, -1, 29, 1, PAL.yellow);
    g.set(-4, 28, 2, PAL.ink).set(-4, 27, 2, PAL.ink);
    return g;
  }, S), 'labShelf');
}

export function makeVialRack() {
  return wrap(vmesh('vialRack', () => {
    const g = new VoxGrid();
    g.box(-8, 0, -3, 7, 1, 2, PAL.metalD);
    g.box(-8, 5, -3, 7, 5, 2, PAL.metal);
    for (const x of [-8, 7]) g.box(x, 2, -3, x, 5, 2, PAL.metalD);
    const cols = [PAL.slime, PAL.pink, PAL.cyan, PAL.yellow, PAL.purple, PAL.orange, PAL.red];
    let i = 0;
    for (let x = -6; x <= 5; x += 2) for (const z of [-2, 1]) {
      const c = cols[i++ % cols.length];
      const h = 3 + ((x + z) & 3);
      g.box(x, 2, z, x, 2 + h, z, c, true);
      g.box(x, 3 + h, z, x, 4 + h, z, 0xe8f8ff);
      g.set(x, 5 + h, z, PAL.red);
    }
    return g;
  }, { scale: 0.06 }), 'vialRack');
}

export function makeLabDoor() {
  const r = wrap(vmesh('labDoor', () => {
    const g = new VoxGrid();
    g.box(-14, 0, -2, 13, 30, 1, PAL.metalD);
    g.box(-11, 0, -1, 10, 25, 1, null);
    hazard(g, -12, 0, 1, -11, 26, 1);
    hazard(g, 10, 0, 1, 11, 26, 1);
    hazard(g, -12, 26, 1, 11, 27, 1);
    // two door halves
    g.box(-11, 0, -1, -1, 25, -1, (x, y) => (y % 5 === 0 ? PAL.metal : PAL.white2));
    g.box(0, 0, -1, 10, 25, -1, (x, y) => (y % 5 === 0 ? PAL.metal : PAL.white2));
    g.box(-1, 0, -1, 0, 25, -1, PAL.ink);
    g.box(-8, 15, 0, -4, 20, 0, PAL.blueL, true).box(3, 15, 0, 7, 20, 0, PAL.blueL, true);
    // panel + lights
    g.box(12, 10, 2, 13, 14, 2, PAL.ink);
    g.set(12, 13, 3, PAL.slime, true).set(13, 11, 3, PAL.red, true);
    g.box(-7, 28, 1, 6, 35, 2, PAL.ink);
    text(g, 'LAB', 0, 29, 3, '+z', PAL.pink, { center: true, glow: true });
    return g;
  }, S), 'labDoor');
  return r;
}

export function makeMonitorWall() {
  return wrap(vmesh('monitorWall', () => {
    const g = new VoxGrid();
    g.box(-30, 0, -2, 29, 26, -1, PAL.metalDD);
    const screens = [
      (x, y) => ((x + y) % 4 === 0 ? 0x5ce1e6 : 0x0d3a4a),
      (x, y) => (y === Math.round(Math.sin(x * 0.7) * 2) + 4 ? PAL.slime : 0x0d2a1a),
      (x, y) => (Math.hypot(x - 4, y - 3) < 2.5 ? PAL.pink : 0x2a0d1a),
      (x, y) => (y < (x * 7) % 6 ? PAL.yellow : 0x2a2410),
      (x, y) => ((x * 3 + y * 5) % 7 === 0 ? 0xffffff : 0x1a2a4a),
      (x, y) => (y === 6 ? 0xff3040 : Math.abs(x - 4) + Math.abs(y - 3) < 3 ? 0x29b6f6 : 0x0d1a2a),
    ];
    let k = 0;
    for (let row = 0; row < 3; row++) for (let col = 0; col < 6; col++) {
      const x0 = -29 + col * 10, y0 = 1 + row * 8;
      const fn = screens[k++ % screens.length];
      g.box(x0, y0, 0, x0 + 8, y0 + 6, 0, PAL.ink);
      g.box(x0 + 1, y0 + 1, 0, x0 + 7, y0 + 5, 0, (x, y) => fn(x - x0, y - y0), true);
    }
    // big centre screen with bolt
    g.box(-14, 6, 1, 13, 20, 1, PAL.ink);
    g.box(-13, 7, 1, 12, 19, 1, 0x1b2440, true);
    text(g, 'SWARM', 0, 13, 2, '+z', PAL.pink, { center: true, glow: true });
    for (let x = -12; x <= 11; x++) g.set(x, 9 + Math.round(Math.sin(x * 0.8) * 1.5), 2, PAL.cyan, true);
    return g;
  }, S), 'monitorWall');
}

/** Lab floor: pixel tile texture with a voxel hazard border (w x d units, centred). */
export function makeFloorTiles(w = 10, d = 8) {
  const tex = pixelTex('labTile', 32, 32, (c) => {
    c.fillStyle = css(0xd8dee8); c.fillRect(0, 0, 32, 32);
    c.fillStyle = css(0xe8eef6); c.fillRect(1, 1, 14, 14); c.fillRect(17, 17, 14, 14);
    c.fillStyle = css(0xcfd6e2); c.fillRect(17, 1, 14, 14); c.fillRect(1, 17, 14, 14);
    c.fillStyle = css(0xa8b2c2); c.fillRect(0, 15, 32, 2); c.fillRect(15, 0, 2, 32);
    c.fillStyle = css(0xffffff); c.fillRect(2, 2, 3, 1); c.fillRect(18, 18, 3, 1);
  }, [w / 1.6, d / 1.6]);
  const plane = texPlane(tex, -w / 2, w / 2, -d / 2, d / 2, 0.001);
  const nx = Math.round(w * 10), nz = Math.round(d * 10);
  const border = vmesh(`floorBorder_${nx}_${nz}`, () => {
    const g = new VoxGrid();
    const x0 = -Math.floor(nx / 2), z0 = -Math.floor(nz / 2), x1 = x0 + nx - 1, z1 = z0 + nz - 1;
    const hz = hazardC(PAL.yellow, PAL.ink, 2);
    g.box(x0, 0, z0, x1, 0, z0 + 1, hz).box(x0, 0, z1 - 1, x1, 0, z1, hz);
    g.box(x0, 0, z0, x0 + 1, 0, z1, hz).box(x1 - 1, 0, z0, x1, 0, z1, hz);
    return g;
  }, { scale: 0.1, pivot: [0, 0.8, 0], ao: false, maxSamples: 10 });
  border.castShadow = false;
  border.receiveShadow = true;
  const r = group(plane, border);
  r.name = 'floorTiles';
  return r;
}

/** Sci-fi wall panel (w x h units) facing +z, bottom centre at origin. */
export function makeWallPanel(w = 4, h = 3) {
  const nx = Math.max(6, Math.round(w * 5)), ny = Math.max(6, Math.round(h * 5));
  return wrap(vmesh(`wallPanel_${nx}_${ny}`, () => {
    const g = new VoxGrid();
    const x0 = -Math.floor(nx / 2), x1 = x0 + nx - 1;
    g.box(x0, 0, -1, x1, ny - 1, 0, (x, y) => {
      if (y === 0) return PAL.metalD;
      if (y === ny - 1) return PAL.pink;
      if ((x - x0) % 5 === 0) return 0xb4bfd0;
      if (y % 6 === 0) return 0xc8d2e0;
      return hash3(Math.floor((x - x0) / 5), Math.floor(y / 6), 1) < 0.5 ? 0xeef2f8 : 0xe2e8f0;
    });
    for (let x = x0 + 2; x < x1; x += 10) {
      g.box(x, Math.floor(ny * 0.6), 1, x + 1, Math.floor(ny * 0.6) + 1, 1, PAL.cyan, true);
      g.box(x + 4, 2, 1, x + 7, 4, 1, (xx, y) => (y % 2 ? 0x5a6478 : 0x3d4352));
    }
    g.box(x0, ny - 3, 1, x1, ny - 3, 1, PAL.blue);
    return g;
  }, { scale: 0.2 }), 'wallPanel');
}

// BEAST NEWS studio: the 3D set behind the battle report (result.js), drawn by the main renderer
// as an engine backdrop (no extra WebGL context) while the report covers the battle.
//   anchor Nora Newsly (3D chibi) behind a voxel news desk (LED chase strip along its front), an
//   animated LED video wall (BEAST NEWS logo / the result, scrolling stripes, an equalizer), two
//   voxel-framed screens (BATTLE REPORT board, a LIVE clock), a neon night-city wall, colour LED
//   pillars, a lighting truss whose coloured lamps throw dithered pixel beams, a tiled floor.
//   Lit bright and saturated: hemisphere + warm key, pink / cyan rims and two coloured fills.
//   Camera: TV shots (wide / mid / close) cut per segment with a slow push; Nora sits in the
//   studio area the report's layout leaves free (top in portrait, left in landscape).
//
//   const st = createNewsStudio({ result, arena, layout: () => ({ sx, sy, h }) });
//   engine.setBackdrop({ scene: st.scene, camera: st.camera, update: st.update, ... });
//   st.shot('mid'); st.anchor.talk(true); st.headScreen(); st.dispose();
import * as THREE from 'three';
import { engine } from '../../core/engine.js';
import { VoxGrid, makeMesh, Mats } from '../../core/voxel.js';
import { Chibi } from '../../core/chibi.js';
import { CHARACTERS } from '../../data/characters.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp01 = (k) => (k < 0 ? 0 : k > 1 ? 1 : k);
const lerp = (a, b, k) => a + (b - a) * k;
const inOut = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const FONT = '"Swarm Display", "Arial Narrow", sans-serif';

function canvasTex(w, hgt, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = hgt;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  draw(g, w, hgt);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
/** Pixel text: drawn small, then the anti-aliased edges are snapped to hard pixels. */
function pixText(g, txt, x, y, size, col, align = 'center') {
  g.font = `800 ${size}px ${FONT}`;
  g.textAlign = align; g.textBaseline = 'middle';
  g.fillStyle = col;
  g.fillText(txt, x, y);
}
function crisp(g, w, hgt) {
  const d = g.getImageData(0, 0, w, hgt);
  for (let i = 3; i < d.data.length; i += 4) d.data[i] = d.data[i] > 110 ? 255 : 0;
  g.putImageData(d, 0, 0);
}

// ---------------------------------------------------------------------------
// voxel set pieces (geometry cached across reports)

// truss lamps: x (voxels) and colour; each throws a pixel beam of its colour (beamTex)
const LAMPS = [[-36, 0xff2e88], [-18, 0x2fe0ff], [0, 0xffd23f], [18, 0x8cf53a], [36, 0xa45cff]];

let G = null;
function geos() {
  if (G) return G;
  G = {};
  // news desk: glossy top with a chrome lip, panelled front with a red LED strip, monitor, mug, scripts
  {
    const g = new VoxGrid();
    const W = 20;
    const top = 0x22206a, trim = 0xf2f4ff, panel = 0x2348c8, panelHi = 0xff2e88, base = 0x0c1238, slot = 0x0a0820, gold = 0xffd23f;
    for (let x = -W; x < W; x++) {
      const edge = Math.abs(x + 0.5) > W - 3;
      const z1 = edge ? 4 : 5;
      for (let z = -2; z <= z1 - 1; z++) g.set(x, 0, z, base);
      for (let y = 1; y <= 7; y++) {
        const seam = ((x + W) % 8) === 0;
        // y 6: the LED chase strip sits in this slot (a scrolling texture, see ledStrip); y 1: gold kick plate
        g.set(x, y, z1, y === 6 ? slot : y === 1 ? gold : seam ? panelHi : panel, seam && y !== 6 && y !== 1);
        g.set(x, y, z1 - 1, panel);
      }
      for (let z = -4; z <= z1 + 1; z++) g.set(x, 8, z, z >= z1 + 1 ? trim : top);
      g.set(x, 9, z1 + 1, trim);
    }
    g.box(-19, 9, -2, -15, 9, 0, 0x22283a);
    g.box(-18, 10, -1, -16, 10, -1, 0x22283a);
    g.box(-20, 11, -1, -14, 15, -1, 0x14182a);
    for (let x = -19; x <= -15; x++) for (let y = 12; y <= 14; y++) g.set(x, y, 0, (x + y) % 4 === 0 ? 0xffd23f : y === 14 ? 0xff2e88 : 0x2fe0ff, true);
    g.cylinder(13, 2, 9, 11, 1.2, 0xffffff);
    g.set(13, 11, 2, 0x5a3418);
    g.set(15, 10, 2, 0xffffff);
    g.box(6, 9, 1, 10, 9, 3, 0xf4f6ff);
    g.box(6, 10, 1, 10, 10, 2, 0xe8eef8);
    g.set(9, 10, 3, 0xff2e88);
    G.desk = g.build({ pivot: [0, 0, 0] });
  }
  // a screen bezel: chunky dark frame with bolts and a red corner tab (w x h voxels inside)
  const bezel = (w, hgt, tab = 0xff2e88) => {
    const g = new VoxGrid();
    const dark = 0x161a34, mid = 0x262c54, bolt = 0x9aa6d8;
    for (let x = -1; x <= w; x++) for (let y = -1; y <= hgt; y++) {
      if (x >= 0 && x < w && y >= 0 && y < hgt) { g.set(x, y, -1, 0x05061a); continue; }
      const corner = (x === -1 || x === w) && (y === -1 || y === hgt);
      g.set(x, y, 0, corner ? bolt : (x + y) % 2 ? dark : mid);
      g.set(x, y, -1, dark);
    }
    for (let x = 0; x < 3; x++) g.set(w - 1 - x, hgt, 1, tab, x === 0);
    return g.build({ scale: 0.1, pivot: [w / 2, hgt / 2, 0] });
  };
  G.bezelMain = bezel(28, 16, 0xffd23f);
  G.bezelSide = bezel(16, 10, 0x2fe0ff);
  G.bezelPanel = bezel(20, 14, 0xff2e88);
  // LED pillar
  {
    const g = new VoxGrid();
    for (let y = 0; y < 34; y++) {
      for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) if (Math.abs(x) === 2 || Math.abs(z) === 2) g.set(x, y, z, (y % 6 === 0) ? 0x2a3270 : 0x1a2050);
      // LED column: pink / yellow / cyan / lime, every voxel lit (its brightness chases, see update)
      g.set(0, y, 2, [0xff2e88, 0xffd23f, 0x2fe0ff, 0x8cf53a][y % 4], true);
      g.set(-1, y, 2, 0x10142e); g.set(1, y, 2, 0x10142e);
    }
    G.pillar = g.build({ scale: 0.1, pivot: [0, 0, 0] });
  }
  // lighting truss with lamp heads
  {
    const g = new VoxGrid();
    for (let x = -50; x <= 50; x++) {
      g.set(x, 0, 0, 0x3a4060); g.set(x, 3, 0, 0x3a4060);
      if (x % 3 === 0) { g.set(x, 1, 0, 0x2a3048); g.set(x, 2, 0, 0x2a3048); }
    }
    LAMPS.forEach(([lx, col]) => {
      g.box(lx - 2, -4, -2, lx + 2, -1, 2, 0x1a1e30);
      for (let x = lx - 1; x <= lx + 1; x++) for (let z = -1; z <= 1; z++) g.set(x, -5, z, x === lx && z === 0 ? 0xffffff : col, true);
    });
    G.truss = g.build({ scale: 0.1, pivot: [0, 0, 0] });
  }
  return G;
}

// ---------------------------------------------------------------------------
// pixel textures

function wallTex() {
  return canvasTex(256, 112, (g, w, hgt) => {
    // night sky
    const sky = g.createLinearGradient(0, 0, 0, hgt);
    sky.addColorStop(0, '#120a4a'); sky.addColorStop(0.45, '#3a1a8a'); sky.addColorStop(0.75, '#a0207a'); sky.addColorStop(1, '#ff4a7a');
    g.fillStyle = sky; g.fillRect(0, 0, w, hgt);
    // dithered sky bands (pixel art, no smooth gradient left)
    const B = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
    for (let y = 0; y < hgt; y++) for (let x = 0; x < w; x++) {
      const f = (y / hgt) * 6 % 1;
      if ((B[(y & 3) * 4 + (x & 3)] + 0.5) / 16 < f * 0.35) { g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(x, y, 1, 1); }
    }
    // stars
    let s = 7;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 60; i++) { g.fillStyle = r() < 0.3 ? '#ffd84a' : '#c8d4ff'; g.fillRect((r() * w) | 0, (r() * hgt * 0.5) | 0, 1, 1); }
    // two rows of skyline with lit windows
    const row = (base, col, win, minH, maxH) => {
      let x = 0;
      while (x < w) {
        const bw = 8 + ((r() * 14) | 0), bh = minH + ((r() * (maxH - minH)) | 0);
        g.fillStyle = col; g.fillRect(x, hgt - base - bh, bw, bh + base);
        for (let wy = hgt - base - bh + 3; wy < hgt - base - 2; wy += 4) for (let wx = x + 2; wx < x + bw - 2; wx += 3) if (r() < 0.5) { const q = r(); g.fillStyle = q < 0.18 ? '#ff6ab4' : q < 0.32 ? '#4ae8ff' : win; g.fillRect(wx, wy, 1, 2); }
        if (r() < 0.3) { g.fillStyle = r() < 0.5 ? '#ff2e88' : '#2fe0ff'; g.fillRect(x + 1, hgt - base - bh, bw - 2, 1); }
        if (r() < 0.25) { g.fillStyle = '#ff3a52'; g.fillRect(x + (bw >> 1), hgt - base - bh - 3, 1, 3); }
        x += bw + 1 + ((r() * 3) | 0);
      }
    };
    row(0, '#2a1a6a', '#8a9aff', 26, 60);
    row(0, '#140e44', '#ffd84a', 10, 36);
    g.fillStyle = '#05061a'; g.fillRect(0, hgt - 6, w, 6);
  });
}

function floorTex() {
  const t = canvasTex(32, 32, (g) => {
    g.fillStyle = '#16125a'; g.fillRect(0, 0, 32, 32);
    g.fillStyle = '#221a78'; g.fillRect(1, 1, 14, 14); g.fillRect(17, 17, 14, 14);
    g.fillStyle = '#1a1666'; g.fillRect(17, 1, 14, 14); g.fillRect(1, 17, 14, 14);
    g.fillStyle = '#3a2a9a'; g.fillRect(1, 1, 14, 1); g.fillRect(17, 17, 14, 1); // tile highlight rows
    g.fillStyle = '#5a3ab8'; g.fillRect(0, 0, 32, 1); g.fillRect(0, 0, 1, 32); g.fillRect(0, 16, 32, 1); g.fillRect(16, 0, 1, 32);
    g.fillStyle = '#ff2e88'; g.fillRect(0, 0, 2, 1); g.fillRect(16, 16, 2, 1);
    g.fillStyle = '#2fe0ff'; g.fillRect(16, 0, 2, 1); g.fillRect(0, 16, 2, 1);
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(16, 10);
  return t;
}

function reportTex(result, arena) {
  return canvasTex(224, 128, (g, w, hgt) => {
    const win = result === 'win', loss = result === 'loss';
    g.fillStyle = loss ? '#1a2a9a' : win ? '#b0105a' : '#5a1aa0'; g.fillRect(0, 0, w, hgt);
    // stepped diagonal stripes behind the word
    for (let y = 27; y < hgt; y++) for (let x = 0; x < w; x++) if (((x + y) >> 3) % 2 === 0) { g.fillStyle = 'rgba(255,255,255,0.07)'; g.fillRect(x, y, 1, 1); }
    for (let y = 0; y < hgt; y += 2) { g.fillStyle = 'rgba(0,0,0,0.16)'; g.fillRect(0, y, w, 1); }
    g.fillStyle = '#ff2e88'; g.fillRect(0, 0, w, 24);
    g.fillStyle = '#ffd23f'; g.fillRect(0, 24, w, 3);
    g.fillStyle = '#2fe0ff'; g.fillRect(0, hgt - 4, w, 4);
    pixText(g, 'BATTLE REPORT', w / 2, 13, 16, '#ffffff');
    pixText(g, win ? 'VICTORY' : loss ? 'DEFEAT' : 'DRAW', w / 2, 66, 44, win ? '#ffd84a' : loss ? '#b8c8ff' : '#d8c0ff');
    pixText(g, String(arena ?? 'Beast Island').toUpperCase(), w / 2, 104, 15, '#ffffff');
    crisp(g, w, hgt);
  });
}

/**
 * The LED video wall: an animated pixel picture (120 x 56) redrawn ~10 times a second.
 * Scrolling stepped stripes in broadcast colours, a pixel equalizer, and in the middle the BEAST NEWS
 * logo, then the result word, swapping every few seconds (both pre-rendered once, crisp).
 */
function videoWallTex(result) {
  const W = 120, H = 56;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  const sprite = (w, hgt, draw) => {
    const s = document.createElement('canvas');
    s.width = w; s.height = hgt;
    const sg = s.getContext('2d', { willReadFrequently: true });
    sg.imageSmoothingEnabled = false;
    draw(sg, w, hgt);
    crisp(sg, w, hgt);
    return s;
  };
  // logo: yellow BEAST plate + pink NEWS plate with an ink outline and a drop shadow
  const logo = sprite(84, 24, (sg) => {
    sg.fillStyle = '#120c24'; sg.fillRect(0, 0, 84, 22);
    sg.fillStyle = '#ffd23f'; sg.fillRect(1, 1, 42, 19);
    sg.fillStyle = '#ff2e88'; sg.fillRect(43, 1, 40, 19);
    sg.fillStyle = '#fff6c8'; sg.fillRect(1, 1, 42, 2);
    sg.fillStyle = '#ff8ac0'; sg.fillRect(43, 1, 40, 2);
    sg.fillStyle = '#120c24'; sg.fillRect(2, 22, 82, 2);
    pixText(sg, 'BEAST', 22, 11, 14, '#120c24');
    pixText(sg, 'NEWS', 63, 11, 14, '#ffffff');
  });
  const win = result === 'win', loss = result === 'loss';
  const word = win ? 'VICTORY' : loss ? 'DEFEAT' : 'DRAW';
  const wcol = win ? '#ffd23f' : loss ? '#8ad8ff' : '#e0b8ff';
  const big = sprite(110, 26, (sg) => {
    // outline: the word drawn 8 ways in ink, then the colour on top
    for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2], [0, 2], [-2, -2], [2, 2], [-2, 2], [2, -2], [0, 3]]) pixText(sg, word, 55 + dx, 12 + dy, 20, '#120c24');
    pixText(sg, word, 55, 12, 20, wcol);
  });
  // deep stripes so Nora (in front) keeps her contrast; the bright bits are the picture and the lights
  const STRIPE = win ? ['#2a1474', '#3a1c92'] : loss ? ['#0c2270', '#14308e'] : ['#34126e', '#46188c'];
  const EQ = ['#8cf53a', '#8cf53a', '#ffd23f', '#ffd23f', '#ff8a1a', '#ff2e88'];
  // stepped diagonal stripes (6 px wide), painted once 12 px wider than the wall and slid along
  const stripes = document.createElement('canvas');
  stripes.width = W + 12; stripes.height = H;
  {
    const sg = stripes.getContext('2d');
    for (let y = 0; y < H; y++) for (let x = 0; x < W + 12; x++) { sg.fillStyle = ((x + y) % 12) < 6 ? STRIPE[0] : STRIPE[1]; sg.fillRect(x, y, 1, 1); }
  }
  let last = -1;
  t.redraw = (time) => {
    const f = Math.floor(time * 10);
    if (f === last) return;
    last = f;
    g.drawImage(stripes, -(f % 12), 0);
    // dark band behind the middle picture, cyan rule lines
    g.fillStyle = 'rgba(10, 6, 40, 0.72)'; g.fillRect(0, 12, W, 30);
    g.fillStyle = '#ff2e88'; g.fillRect(0, 11, W, 1); g.fillStyle = '#2fe0ff'; g.fillRect(0, 42, W, 1);
    // equalizer along the bottom
    for (let i = 0; i < 20; i++) {
      const hgt = 2 + Math.round((Math.sin(time * 5.3 + i * 1.7) * 0.5 + 0.5) * (Math.sin(time * 2.1 + i * 0.6) * 0.5 + 0.5) * 9);
      for (let k = 0; k < hgt; k++) { g.fillStyle = EQ[Math.min(5, k)]; g.fillRect(2 + i * 6, H - 2 - k, 4, 1); }
    }
    // the picture: logo, then the result word (4 s each), with a glint sweeping across the logo
    const phase = Math.floor(time / 4) % 2;
    if (phase === 0) {
      g.drawImage(logo, (W - 84) >> 1, 15);
      const gx = ((f * 4) % 220) - 30;
      g.fillStyle = 'rgba(255,255,255,0.55)';
      for (let y = 0; y < 20; y++) g.fillRect(((W - 84) >> 1) + gx + (y >> 1), 16 + y, 3, 1);
    } else g.drawImage(big, (W - 110) >> 1, 14);
    // top: a ticking row of lights
    for (let i = 0; i < 28; i++) { g.fillStyle = (i + f) % 4 === 0 ? '#ffd23f' : 'rgba(255,255,255,0.35)'; g.fillRect(W - 4 - i * 4, 4, 2, 2); }
    t.needsUpdate = true;
  };
  t.redraw(0);
  return t;
}

/** A pixel light beam (white, dithered toward its edges and its end), tinted per lamp. */
function beamTex() {
  return canvasTex(24, 64, (g, w, hgt) => {
    const B = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
    for (let y = 0; y < hgt; y++) {
      const half = 2 + (y / hgt) * (w / 2 - 2);
      for (let x = 0; x < w; x++) {
        const dx = Math.abs(x + 0.5 - w / 2);
        if (dx > half) continue;
        const k = (1 - dx / half) * 1.6 * (1 - (y / hgt) * 0.8);
        if ((B[(y & 3) * 4 + (x & 3)] + 0.5) / 16 < k) { g.fillStyle = dx < half * 0.35 ? '#ffffff' : '#c8c8c8'; g.fillRect(x, y, 1, 1); }
      }
    }
  });
}

/** LED chase strip: a repeating run of coloured LEDs with dark gaps (scrolled by texture offset). */
function ledTex() {
  const t = canvasTex(16, 1, (g) => {
    const C = ['#ff2e88', '#ffd23f', '#2fe0ff', '#8cf53a'];
    for (let x = 0; x < 16; x++) { g.fillStyle = x % 2 ? '#140c30' : C[(x >> 1) % 4]; g.fillRect(x, 0, 1, 1); }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function clockTex() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 80;
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  const g = c.getContext('2d', { willReadFrequently: true });
  let last = '';
  t.redraw = (blink) => {
    const d = new Date();
    const hh = d.getHours() % 12 || 12, mm = String(d.getMinutes()).padStart(2, '0');
    const txt = `${hh}${blink ? ':' : ' '}${mm}`;
    if (txt === last) return;
    last = txt;
    g.fillStyle = '#05061a'; g.fillRect(0, 0, 128, 80);
    g.fillStyle = '#ff2e88'; g.fillRect(8, 10, 38, 16);
    pixText(g, 'LIVE', 27, 18, 13, '#ffffff');
    pixText(g, txt, 64, 50, 30, '#ffd84a');
    crisp(g, 128, 80);
    t.needsUpdate = true;
  };
  t.redraw(true);
  return t;
}

// ---------------------------------------------------------------------------

/**
 * o: { result, arena (name), layout() -> { sx, sy, h } where Nora should sit on screen
 *      (fractions) and how much of the screen height she should fill }
 */
export function createNewsStudio(o = {}) {
  const g = geos();
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x120a3a);
  scene.fog = new THREE.Fog(0x120a3a, 40, 80);
  const camera = new THREE.PerspectiveCamera(30, engine.aspect, 0.1, 80);
  const owned = { tex: [], mat: [], geo: [] };
  const own = (x, k = 'mat') => { owned[k].push(x); return x; };

  // lights: bright cool fill, a warm key from camera left, hot pink + cyan rims, and two coloured
  // fills from the sides of the set (pink left, cyan right) so the desk and floor pick up colour
  scene.add(new THREE.HemisphereLight(0xdce6ff, 0x5a2a8a, 1.45));
  const key = new THREE.DirectionalLight(0xfff2e4, 2.7);
  key.position.set(-3, 5, 7);
  scene.add(key);
  const rimR = new THREE.DirectionalLight(0xff3a9a, 2.2);
  rimR.position.set(5, 3, -4);
  const rimB = new THREE.DirectionalLight(0x3ad8ff, 2.2);
  rimB.position.set(-5, 3, -4);
  scene.add(rimR, rimB);
  const fillP = new THREE.PointLight(0xff2e88, 9, 9, 1.4);
  fillP.position.set(-4.2, 2.2, 1.2);
  const fillC = new THREE.PointLight(0x2fe0ff, 9, 9, 1.4);
  fillC.position.set(4.4, 2.2, 1.2);
  scene.add(fillP, fillC);

  // floor + back wall
  const floor = new THREE.Mesh(own(new THREE.PlaneGeometry(40, 24), 'geo'), own(new THREE.MeshLambertMaterial({ map: own(floorTex(), 'tex') })));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, -0.36, 4);
  scene.add(floor);
  const wall = new THREE.Mesh(own(new THREE.PlaneGeometry(26, 11.4), 'geo'), own(new THREE.MeshBasicMaterial({ map: own(wallTex(), 'tex'), toneMapped: true })));
  wall.position.set(0, 3.6, -5.2);
  scene.add(wall);

  // the video wall
  const screen = (bez, tex, w, hgt, x, y, z, ry = 0) => {
    const grp = new THREE.Group();
    grp.add(makeMesh(bez));
    const mat = own(new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    mat.color.setScalar(1.15);
    const pl = new THREE.Mesh(own(new THREE.PlaneGeometry(w * 0.1, hgt * 0.1), 'geo'), mat);
    pl.position.z = 0.012; // just in front of the black backing, inside the frame
    grp.add(pl);
    grp.position.set(x, y, z);
    grp.rotation.y = ry;
    scene.add(grp);
    return grp;
  };
  const report = own(reportTex(o.result, o.arena), 'tex');
  const clock = own(clockTex(), 'tex');
  // the video wall right behind the desk: one picture across 3 x 2 framed panels
  const vw = own(videoWallTex(o.result), 'tex');
  const vwMat = own(new THREE.MeshBasicMaterial({ map: vw, toneMapped: false }));
  vwMat.color.setScalar(0.95);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
    const grp = new THREE.Group();
    grp.add(makeMesh(g.bezelPanel));
    const pg = own(new THREE.PlaneGeometry(2, 1.4), 'geo');
    const uv = pg.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, (i + uv.getX(k)) / 3, (j + uv.getY(k)) / 2);
    const pl = new THREE.Mesh(pg, vwMat);
    pl.position.z = 0.012;
    grp.add(pl);
    grp.position.set((i - 1) * 2.2, 1.55 + j * 1.6, -2.5);
    scene.add(grp);
  }
  screen(g.bezelMain, report, 28, 16, 4.6, 2.3, -2.2, -0.38);
  screen(g.bezelSide, clock, 16, 10, -4.2, 2.6, -2.3, 0.4);
  // pillars (their LEDs share one glow material whose brightness pulses) + truss
  const pillarGlow = own(Mats.glow.clone());
  for (const [x, z] of [[-4.6, -2.2], [4.9, -2.4], [-7.2, -3.4], [7.6, -3.6]]) {
    const p = makeMesh(g.pillar, [Mats.solid, pillarGlow]);
    p.position.set(x, -0.36, z);
    scene.add(p);
  }
  const truss = makeMesh(g.truss);
  truss.position.set(0, 4.7, -1.2);
  scene.add(truss);
  // pixel light beams from the truss lamps (additive, behind Nora), swaying slowly
  const bTex = own(beamTex(), 'tex');
  const bGeo = own(new THREE.PlaneGeometry(1.5, 4.6), 'geo');
  bGeo.translate(0, -2.3, 0);
  const beams = LAMPS.map(([lx, col], i) => {
    const m = own(new THREE.MeshBasicMaterial({ map: bTex, color: col, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    const b = new THREE.Mesh(bGeo, m);
    b.position.set(lx * 0.1, 4.2, -1.6);
    b.userData.base = -lx * 0.006;
    b.userData.ph = i * 1.3;
    b.renderOrder = 2;
    scene.add(b);
    return b;
  });
  // LED chase strip along the desk front (in the dark slot of voxel row 6)
  const led = own(ledTex(), 'tex');
  led.repeat.set(17, 1);
  const ledMat = own(new THREE.MeshBasicMaterial({ map: led, toneMapped: false }));
  ledMat.color.setScalar(2.2);
  const ledStrip = new THREE.Mesh(own(new THREE.PlaneGeometry(3.4, 0.07), 'geo'), ledMat);
  ledStrip.position.set(0.15, -0.36 + 0.65, 0.62 + 0.605);
  scene.add(ledStrip);

  // desk + anchor
  const desk = makeMesh(g.desk);
  desk.position.set(0.15, -0.36, 0.62);
  desk.receiveShadow = true;
  scene.add(desk);
  let anchor = null;
  try {
    anchor = new Chibi(CHARACTERS.anchor, { fidget: false });
    anchor.root.rotation.y = 0.22;
    anchor.play('talk');
    anchor.expr('happy', 'grin');
    scene.add(anchor.root);
  } catch (e) { anchor = null; }

  // ---- camera: TV shots, cut per segment, each with a slow push
  const _f = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3();
  const frame = (c, hh, sx, sy, yaw, pitch) => {
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const d = hh / (2 * tan);
    const pos = V(c.x + Math.sin(yaw) * Math.cos(pitch) * d, c.y + Math.sin(pitch) * d, c.z + Math.cos(yaw) * Math.cos(pitch) * d);
    const look = c.clone();
    _f.subVectors(look, pos).normalize();
    _r.crossVectors(_f, THREE.Object3D.DEFAULT_UP).normalize();
    _u.crossVectors(_r, _f);
    const halfH = d * tan, halfW = halfH * camera.aspect;
    look.addScaledVector(_r, -(2 * sx - 1) * halfW).addScaledVector(_u, (2 * sy - 1) * halfH);
    return { pos, look };
  };
  const SHOTS = {
    wide: { z: 1.55, yaw: -0.08, pitch: 0.1, push: 0.08, y: 1.25 },
    mid: { z: 1, yaw: 0.14, pitch: 0.05, push: 0.06, y: 1.2 },
    close: { z: 0.74, yaw: 0.22, pitch: 0.03, push: 0.05, y: 1.4 },
    desk: { z: 1.25, yaw: -0.3, pitch: 0.16, push: 0.07, y: 1.0 },
  };
  let shotName = 'wide', shotT = 0, cutBlend = 0;
  const cur = { pos: V(), look: V() };
  const target = () => {
    const S = SHOTS[shotName] ?? SHOTS.mid;
    const L = o.layout?.() ?? { sx: 0.3, sy: 0.3, h: 0.34 };
    // Nora from the hair tip to the desk top fills L.h of the screen at the 'mid' shot
    const hh = (2.1 / Math.max(0.15, L.h)) * S.z * (1 - S.push * inOut(clamp01(shotT / 6)));
    return frame(V(0, S.y, 0), hh, L.sx, L.sy, S.yaw, S.pitch);
  };
  const place = (snap, dt = 0) => {
    const s = target();
    if (snap || cutBlend <= 0) { cur.pos.copy(s.pos); cur.look.copy(s.look); }
    else { const k = 1 - Math.exp(-dt * cutBlend); cur.pos.lerp(s.pos, k); cur.look.lerp(s.look, k); }
    camera.position.copy(cur.pos);
    camera.lookAt(cur.look);
  };

  let t = 0;
  const update = (dt) => {
    t += dt;
    shotT += dt;
    if (camera.aspect !== engine.aspect) { camera.aspect = engine.aspect; camera.updateProjectionMatrix(); }
    place(false, dt);
    if (anchor) {
      const n = Math.max(1, Math.ceil(dt * 40));
      for (let i = 0; i < n; i++) anchor.update(dt / n);
    }
    clock.redraw(Math.floor(t * 1.4) % 2 === 0);
    vw.redraw(t);
    // LED chase (stepped: one LED per tick), pillar pulse, beam sway
    led.offset.x = -Math.floor(t * 8) / 16;
    pillarGlow.color.setScalar(1.8 + (Math.floor(t * 6) % 3) * 0.5);
    for (const b of beams) b.rotation.z = b.userData.base + Math.sin(t * 0.7 + b.userData.ph) * 0.12;
  };
  place(true);

  return {
    scene, camera, anchor, update,
    bloom: { strength: 0.7, radius: 0.18, threshold: 1.6 },
    grade: { sat: 0.22, contrast: 0.1, vignette: 0.18 },
    /** Cut to a shot ('wide' | 'mid' | 'close' | 'desk'); blend > 0 eases there instead (rate per second). */
    shot(name, blend = 0) {
      if (!SHOTS[name]) return;
      shotName = name;
      shotT = 0;
      cutBlend = blend;
      if (!blend) place(true);
    },
    /** Screen point above Nora's head (speech bubble anchor). */
    headScreen() {
      if (!anchor) return null;
      const p = anchor.headTop(V());
      p.y += 0.15;
      return engine.toScreen(p, camera);
    },
    dispose() {
      if (anchor) { anchor.face?.texture?.dispose?.(); anchor.facePlane?.material?.dispose?.(); scene.remove(anchor.root); }
      for (const x of owned.tex) x.dispose();
      for (const x of owned.mat) x.dispose();
      for (const x of owned.geo) x.dispose();
    },
  };
}

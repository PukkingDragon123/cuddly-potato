// The LAB tab's live lab: a moody voxel Beast Lab drawn behind the tab by the main
// renderer (engine.setBackdrop: no extra WebGL context, only while the tab covers
// the island). Steel walls, a goo pipe and a goo spill, the BEAST LAB neon sign,
// a containment tube with a Swarm floating in it (its liquid fills up with the
// active research and shows the progress on a readout), the main workbench with
// the research project of the moment, a fume hood breathing green fumes, a
// whiteboard the scientist writes formulas on, a reactor-centrifuge spinning its
// vials behind a window, the RESEARCH terminal (the camera dollies into it when
// the tree opens), a specimen shelf, a microscope table, a robot arm sorting
// vials, cables with a sparking frayed end, goo barrels and pixel-art particles
// (bubbles, steam, fumes, sparks, smoke puffs, confetti).
//
// One instance lives for the session (built in slices the first time the tab
// opens); closing the tab frees its GPU buffers and textures (three re-uploads
// them on the next visit), so tab hopping never grows GPU memory. Everything that
// never moves is merged into a few draws (core/staticBatch.js).
import * as THREE from 'three';
import { engine } from '../../core/engine.js';
import { Mats, makeMesh } from '../../core/voxel.js';
import { audio } from '../../core/audio.js';
import { batchStatic } from '../../core/staticBatch.js';
import { neonSign, specimenTube } from '../../models/props/labDecor.js';
import { labScreen, tickLabScreens, makeVialRack } from '../../models/props/interior.js';
import { createSwarm } from '../../models/swarmModels.js';
import { SWARMS } from '../../data/swarms.js';
import { state, currentDeck } from '../../game/state.js';
import { CHARACTERS } from '../../data/characters.js';
import { COMMANDERS } from '../../data/commanders.js';
import { CMD_SKINS } from '../../data/season.js';
import * as LP from './labStageProps.js';
import { PixelFx, TILE } from './labStageFx.js';
import { Scientist, branchKind, BRANCH_COLOR } from './labScientist.js';

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
const { V } = LP;
const WALL = LP.ROOM.back; // back wall face (z)
const smooth = (x) => x * x * (3 - 2 * x);
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

// layout (world): where every big piece stands
const AT = {
  tube: new THREE.Vector3(-1.25, 0, -2.5),
  bench: new THREE.Vector3(0, -0.1, 0.12),
  hood: new THREE.Vector3(-4.48, 0, WALL + 0.52),
  board: new THREE.Vector3(-2.5, 1.86, WALL + 0.01),
  term: new THREE.Vector3(1.75, 2.8, WALL + 0.01),
  reactor: new THREE.Vector3(3.2, 0, -1.6),
  scope: new THREE.Vector3(2.55, 0, 0.0),
  robot: new THREE.Vector3(4.75, 0, -0.3),
  rack: new THREE.Vector3(4.3, 0, 0.75),
  shelf: new THREE.Vector3(5.2, 0, WALL + 0.32),
  lamp: new THREE.Vector3(0.1, 3.3, 0.1),
};

// ---------------------------------------------------------------------------
// Tiny 3x5 pixel font for the canvas screens (board, terminal, readout)

const F3 = {
  0: '###/#.#/#.#/#.#/###', 1: '.#./##./.#./.#./###', 2: '##./..#/.#./#../###', 3: '##./..#/.#./..#/##.', 4: '#.#/#.#/###/..#/..#',
  5: '###/#../##./..#/##.', 6: '.##/#../###/#.#/###', 7: '###/..#/.#./.#./.#.', 8: '###/#.#/###/#.#/###', 9: '###/#.#/###/..#/##.',
  A: '.#./#.#/###/#.#/#.#', B: '##./#.#/##./#.#/##.', C: '.##/#../#../#../.##', D: '##./#.#/#.#/#.#/##.', E: '###/#../##./#../###',
  F: '###/#../##./#../#..', G: '.##/#../#.#/#.#/.##', H: '#.#/#.#/###/#.#/#.#', I: '###/.#./.#./.#./###', K: '#.#/#.#/##./#.#/#.#',
  L: '#../#../#../#../###', M: '#.#/###/###/#.#/#.#', N: '##./#.#/#.#/#.#/#.#', O: '.#./#.#/#.#/#.#/.#.', P: '##./#.#/##./#../#..',
  R: '##./#.#/##./#.#/#.#', S: '.##/#../.#./..#/##.', T: '###/.#./.#./.#./.#.', U: '#.#/#.#/#.#/#.#/###', V: '#.#/#.#/#.#/#.#/.#.',
  W: '#.#/#.#/###/###/#.#', X: '#.#/#.#/.#./#.#/#.#', Y: '#.#/#.#/.#./.#./.#.',
  '+': '.../.#./###/.#./...', '-': '.../.../###/.../...', '=': '.../###/.../###/...', '?': '##./..#/.#./.../.#.', '!': '.#./.#./.#./.../.#.',
  '%': '#.#/..#/.#./#../#.#', '>': '#../.#./..#/.#./#..', '(': '.#./#../#../#../.#.', ')': '.#./..#/..#/..#/.#.', '/': '..#/..#/.#./#../#..',
  '.': '.../.../.../.../.#.', ':': '.../.#./.../.#./...', ' ': '.../.../.../.../...', $: '.##/##./.#./.##/##.', x: '.../#.#/.#./#.#/...',
};
/** Pixel ops for a string: [[x, y], ...] at scale s (top-left anchor). */
function textPx(str, x0, y0, s = 1) {
  const out = [];
  let x = x0;
  for (const ch of String(str)) {
    const g = F3[ch] ?? F3[' '];
    g.split('/').forEach((row, ry) => [...row].forEach((c, rx) => {
      if (c !== '#') return;
      for (let a = 0; a < s; a++) for (let b = 0; b < s; b++) out.push([x + rx * s + a, y0 + ry * s + b]);
    }));
    x += 4 * s;
  }
  return out;
}
function pxCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  return { c, ctx, tex, w, h };
}

// ---------------------------------------------------------------------------
// Whiteboard: formulas and doodles revealed pixel by pixel while he writes

const BW = 128, BH = 80;
const INK = { blue: '#2a4ad0', red: '#d8303a', green: '#1f9a4a', black: '#1a1c28' };
const BOARDS = [
  () => [
    ['blue', textPx('E=MC', 6, 6, 2)], ['blue', textPx('2', 38, 2, 1)],
    ['red', textPx('SWARM+H2O=?', 6, 22, 2)],
    ['green', doodleSwarm(10, 42)], ['black', arrow(34, 54, 52, 54)], ['green', textPx('X2', 56, 48, 2)],
    ['blue', graph(80, 40)],
    ['red', boxed('NO LICK', 64, 68)],
  ],
  () => [
    ['black', textPx('GOO', 6, 6, 2)], ['black', textPx('+', 34, 6, 2)], ['green', textPx('$100', 44, 6, 2)],
    ['red', textPx('= BOOM?', 6, 22, 2)],
    ['blue', doodleFlask(12, 40)], ['black', arrow(30, 56, 50, 56)], ['blue', textPx('9000', 54, 50, 2)],
    ['green', graph(90, 38)],
    ['red', textPx('DAY 41', 82, 6, 1)],
  ],
  () => [
    ['blue', textPx('TUBE 3', 6, 6, 2)], ['red', textPx('(DO NOT', 6, 20, 1)], ['red', textPx('SHAKE)', 6, 27, 1)],
    ['black', textPx('A+B=PURPLE', 6, 38, 1)],
    ['green', doodleSwarm(62, 8)], ['green', doodleSwarm(86, 10)],
    ['blue', textPx('LV UP', 70, 34, 2)],
    ['black', arrow(10, 60, 40, 60)], ['red', textPx('ASK JIMMY', 44, 57, 1)],
  ],
];
function arrow(x0, y0, x1) {
  const out = [];
  for (let x = x0; x <= x1; x++) out.push([x, y0]);
  for (let k = 1; k <= 3; k++) out.push([x1 - k, y0 - k], [x1 - k, y0 + k]);
  return out;
}
function graph(x0, y0) {
  const out = [];
  for (let y = 0; y < 26; y++) out.push([x0, y0 + y]);
  for (let x = 0; x < 34; x++) out.push([x0 + x, y0 + 25]);
  const pts = [[2, 22], [8, 18], [13, 20], [19, 12], [24, 14], [31, 2]];
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
    const n = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
    for (let k = 0; k <= n; k++) out.push([x0 + Math.round(ax + ((bx - ax) * k) / n), y0 + Math.round(ay + ((by - ay) * k) / n)]);
  }
  out.push([x0 + 30, y0 + 1], [x0 + 29, y0 + 2], [x0 + 32, y0 + 3], [x0 + 31, y0]);
  return out;
}
function boxed(str, x0, y0) {
  const out = textPx(str, x0 + 3, y0 + 2, 1);
  const w = str.length * 4 + 4;
  for (let x = 0; x <= w; x++) out.push([x0 + x, y0], [x0 + x, y0 + 8]);
  for (let y = 0; y <= 8; y++) out.push([x0, y0 + y], [x0 + w, y0 + y]);
  return out;
}
function doodleSwarm(x0, y0) {
  // a little Swarm face: ears, round head outline, eyes, grin
  const art = ['.#......#.', '##......##', '#.######.#', '#........#', '#.##..##.#', '#.##..##.#', '#........#', '#..####..#', '.#......#.', '..######..'];
  const out = [];
  art.forEach((row, y) => [...row].forEach((c, x) => { if (c === '#') out.push([x0 + x * 2, y0 + y * 2], [x0 + x * 2 + 1, y0 + y * 2]); }));
  return out;
}
function doodleFlask(x0, y0) {
  const art = ['...##...', '...##...', '..#..#..', '.#....#.', '#......#', '#.####.#', '########'];
  const out = [];
  art.forEach((row, y) => [...row].forEach((c, x) => { if (c === '#') for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) out.push([x0 + x * 2 + a, y0 + y * 2 + b]); }));
  return out;
}

class Board {
  constructor() {
    this.p = pxCanvas(BW, BH);
    this.k = 0;
    this.load(0);
    this.wipe = 0;
    this.draw();
  }
  load(k) {
    this.k = k % BOARDS.length;
    this.ops = [];
    for (const [ink, px] of BOARDS[this.k]()) for (const [x, y] of px) this.ops.push([x, y, INK[ink]]);
    this.n = Math.floor(this.ops.length * 0.35); // part of it was already there
  }
  write(n) {
    if (this.wipe) return;
    this.n = Math.min(this.ops.length, this.n + n);
    if (this.n >= this.ops.length) this.full = (this.full ?? 0) + 1;
  }
  draw() {
    const { ctx } = this.p;
    ctx.fillStyle = '#e4e8ee';
    ctx.fillRect(0, 0, BW, BH);
    // old ghost marks
    ctx.fillStyle = '#d4d9e2';
    for (let i = 0; i < 26; i++) ctx.fillRect((i * 37) % BW, (i * 23) % BH, 6 + (i % 4) * 3, 1);
    for (let i = 0; i < this.n; i++) {
      const o = this.ops[i];
      ctx.fillStyle = o[2];
      ctx.fillRect(o[0], o[1], 1, 1);
    }
    if (this.wipe > 0) {
      // the eraser sweeps the board clean from the left
      const x = Math.floor((1 - this.wipe) * BW);
      ctx.fillStyle = '#e4e8ee';
      ctx.fillRect(0, 0, x, BH);
      ctx.fillStyle = '#3a4a6a';
      ctx.fillRect(Math.max(0, x - 6), 4, 6, BH - 8);
    }
    this.p.tex.needsUpdate = true;
  }
}

// ---------------------------------------------------------------------------
// Research terminal screen: a pixel tree of the nine branches + progress

class Terminal {
  constructor() {
    this.p = pxCanvas(96, 56);
    this.t = 0;
  }
  draw(dt, st) {
    this.t += dt;
    const { ctx } = this.p;
    ctx.fillStyle = '#04110c';
    ctx.fillRect(0, 0, 96, 56);
    // grid
    ctx.fillStyle = '#082418';
    for (let x = 0; x < 96; x += 8) ctx.fillRect(x, 0, 1, 56);
    for (let y = 0; y < 56; y += 8) ctx.fillRect(0, y, 96, 1);
    const done = st?.done?.length ?? 0;
    const act = st?.active;
    // 9 rows x 7 cols of nodes (a stylised tree), lit by research count
    const cols = 7, rows = 9;
    let k = 0;
    for (let r = 0; r < rows; r++) {
      const y = 3 + r * 5.4;
      const start = r % 3;
      for (let c = start; c < cols; c++) {
        const x = 8 + c * 12;
        const lit = k < done;
        const isAct = act && k === done;
        k++;
        if (c > start) { ctx.fillStyle = lit ? '#3fd06a' : '#0e3a24'; ctx.fillRect(x - 9, Math.round(y) + 1, 9, 1); }
        const blink = isAct && Math.floor(this.t * 3) % 2;
        ctx.fillStyle = isAct ? (blink ? '#ffe680' : '#ff9a2e') : lit ? '#7cff9a' : '#145a34';
        ctx.fillRect(x, Math.round(y), 3, 3);
      }
    }
    // progress strip
    if (act) {
      const k2 = clamp01((Date.now() - act.startedAt) / Math.max(1, act.endsAt - act.startedAt));
      ctx.fillStyle = '#0e3a24';
      ctx.fillRect(4, 51, 88, 3);
      ctx.fillStyle = '#ffd84a';
      ctx.fillRect(4, 51, Math.round(88 * k2), 3);
    }
    // scanlines
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    for (let y = 1; y < 56; y += 2) ctx.fillRect(0, y, 96, 1);
    this.p.tex.needsUpdate = true;
  }
}

// readout on the tube base: progress bar + percent (or a heartbeat while idle)
class Readout {
  constructor() {
    this.p = pxCanvas(40, 14);
    this.t = 0;
  }
  draw(dt, k, color) {
    this.t += dt;
    const { ctx } = this.p;
    ctx.fillStyle = '#051008';
    ctx.fillRect(0, 0, 40, 14);
    if (k == null) {
      ctx.fillStyle = '#3fd06a';
      for (let x = 0; x < 40; x++) {
        const ph = (x + Math.floor(this.t * 20)) % 20;
        const y = ph === 8 ? 3 : ph === 9 ? 10 : ph === 10 ? 5 : 7;
        ctx.fillRect(x, y, 1, 1);
      }
    } else {
      const pct = Math.floor(k * 100);
      ctx.fillStyle = color;
      for (const [x, y] of textPx(pct + '%', 2, 2, 1)) ctx.fillRect(x, y, 1, 1);
      ctx.fillStyle = '#123020';
      ctx.fillRect(2, 9, 36, 3);
      ctx.fillStyle = color;
      ctx.fillRect(2, 9, Math.max(1, Math.round(36 * k)), 3);
    }
    this.p.tex.needsUpdate = true;
  }
}

// ---------------------------------------------------------------------------

const GRADE = { exposure: 0.1, sat: 0.08, contrast: 0.12, tint: [-0.01, 0.01, 0.025], lift: [0.004, 0.01, 0.02], vignette: 0.36 };
const BLOOM = { strength: 0.7, radius: 0.24, threshold: 1.55 };

export class LabStage {
  constructor() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x06080e);
    this.scene.fog = new THREE.Fog(0x06080e, 16, 30);
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 60);
    this.grade = GRADE;
    this.bloom = BLOOM;
    this.t = 0;
    this.ready = false;
    this.frameRect = null;
    this.scrollY = 0;
    this.textures = [];
    this.mats = [];
    this.focus = 0; // 0 lab, 1 terminal close-up
    this.focusTo = 0;
    this.research = null;
    this.level = 0.86; // tube liquid level (0..1)
    this.updateFn = (dt) => this.update(dt);
    this.sfxOn = false;
  }

  // ------------------------------------------------------------------ build

  async build() {
    if (this.ready || this.building) return this.building;
    this.building = (async () => {
      const T0 = performance.now(), tm = (this.timings = { at: Math.round(T0) });
      let tp = T0;
      const mark = (k) => { const n = performance.now(); tm[k] = Math.round(n - tp); tp = n; };
      const sc = this.scene;
      const still = (this.still = new THREE.Group());
      still.name = 'labStill';
      sc.add(still);
      this.buildLights();
      const put = (m, at, ry = 0, parent = still) => { m.position.copy(at); m.rotation.y = ry; parent.add(m); return m; };

      // shell + wall dressing
      still.add(LP.roomMesh());
      put(LP.gooPipeMesh(), new THREE.Vector3(0, 0.62, WALL + 0.17));
      mark('room');
      await nextFrame();
      const sign = (this.sign = neonSign('BEAST LAB', { color: LP.C.pink, color2: LP.C.yellow, bolts: true, vox: 0.042, step: 2 }));
      sign.position.set(0, 4.08, WALL + 0.01);
      sc.add(sign);
      this.mats.push(sign.material);
      mark('sign');
      await nextFrame();

      // furniture
      put(LP.benchMesh(), AT.bench);
      put(LP.stepMesh(), new THREE.Vector3(0, 0, -0.74));
      this.platform = { x: 0, z: -0.74, hw: LP.STEP.hw, hd: LP.STEP.hd, h: LP.STEP.h };
      mark('bench');
      await nextFrame();
      put(LP.hoodMesh(), AT.hood);
      put(LP.boardMesh(), AT.board);
      mark('hood');
      await nextFrame();
      put(LP.reactorMesh(), AT.reactor, -0.35);
      mark('reactor');
      await nextFrame();
      put(LP.termMesh(), AT.term);
      put(LP.shelfMesh(), AT.shelf);
      mark('termShelf');
      await nextFrame();
      put(LP.scopeTableMesh(), AT.scope, -Math.PI / 2);
      put(LP.cablesMesh(), new THREE.Vector3(0, 0, 0));
      mark('scopeCables');
      await nextFrame();
      const rack = makeVialRack();
      put(rack, AT.rack, -0.5);
      const bg = LP.barrelGeo();
      for (const [x, z, ry] of [[-5.55, -1.5, 0.3], [-5.85, -0.7, 1.4], [5.75, 0.6, 0.8]]) put(makeMesh(bg, Mats.pair), new THREE.Vector3(x, 0, z), ry).castShadow = true;
      mark('furniture');
      await nextFrame();

      // screens: whiteboard, terminal, oscilloscope, side monitors, tube readout
      this.board = new Board();
      this.boardMesh = this.screen(this.board.p.tex, LP.BOARD.w - 0.08, LP.BOARD.h - 0.06, AT.board.clone().add(new THREE.Vector3(-0.025, 0, 0.052)), 1.0);
      this.term = new Terminal();
      const TS = LP.TERM_SCREENS;
      this.termMesh = this.screen(this.term.p.tex, TS.main.w, TS.main.h, AT.term.clone().add(new THREE.Vector3(TS.main.x, TS.main.y, TS.main.z)), 1.5);
      for (const s of TS.small) put(labScreen(s.kind, s.w, s.h, { seed: 40 + s.y }), AT.term.clone().add(new THREE.Vector3(s.x, s.y, s.z)));
      const osc = labScreen('wave', LP.SCOPE_SCREEN.w, LP.SCOPE_SCREEN.h, { seed: 77 });
      put(osc, AT.bench.clone().add(new THREE.Vector3(LP.SCOPE_SCREEN.x, LP.SCOPE_SCREEN.y, LP.SCOPE_SCREEN.z)));
      // fume hood sash glass + interior glow
      const sash = new THREE.Mesh(new THREE.PlaneGeometry(LP.HOOD.sash.w - 0.08, LP.HOOD.sash.y1 - LP.HOOD.sash.y0), new THREE.MeshPhongMaterial({ color: 0xa8ffd0, transparent: true, opacity: 0.16, shininess: 90, specular: 0xffffff, depthWrite: false }));
      sash.position.set(AT.hood.x, (LP.HOOD.sash.y0 + LP.HOOD.sash.y1) / 2 + 0.03, AT.hood.z + LP.HOOD.sash.z + 0.01);
      sash.renderOrder = 3;
      sc.add(sash);
      this.mats.push(sash.material);
      mark('screens');
      await nextFrame();

      // containment tube (specimen tube shell with our own liquid + a Swarm)
      this.buildTube();
      mark('tube');
      await nextFrame();
      // reactor rotor + beacon, robot arm, lamp
      this.rotor = LP.rotorMesh();
      this.rotor.position.set(AT.reactor.x, LP.REACTOR.core - 0.02, AT.reactor.z);
      sc.add(this.rotor);
      this.beacon = LP.beaconMesh();
      this.beacon.position.set(AT.reactor.x, LP.REACTOR.top + 0.01, AT.reactor.z);
      sc.add(this.beacon);
      this.buildRobot();
      this.lamp = LP.lampMesh();
      this.lamp.position.copy(AT.lamp);
      sc.add(this.lamp);
      // a small specimen tube in the right corner
      const st = specimenTube({ color: 0x29e0ff, specimen: 'eye', h: 1.7, r: 0.3, accent: LP.C.goo });
      put(st.root, new THREE.Vector3(5.55, 0, -2.75), 0, sc);
      this.smallTube = st;
      mark('rotorRobot');
      await nextFrame();

      // particles + the scientist
      this.fx = new PixelFx(700);
      sc.add(this.fx.points);
      this.sci = new Scientist({
        scene: sc, fx: this.fx, benchTop: LP.BENCH.top, platform: this.platform,
        sfx: (n, o) => this.sfx(n, o),
        onBoard: (dt) => this.writeBoard(dt),
        tubeTap: () => this.tubeTap(),
      });
      this.sci.stage.onCheerDone = () => { this.cheering = false; };
      this.applyScientist();
      mark('scientist');
      this.layoutCamera();
      await engine.precompile(sc, this.camera);
      mark('precompile');
      tm.total = Math.round(performance.now() - T0);
      this.ready = true;
    })();
    return this.building;
  }

  buildLights() {
    const sc = this.scene;
    sc.add(new THREE.HemisphereLight(0x8a9ad0, 0x221a28, 2.1));
    const spot = (this.spot = new THREE.SpotLight(0xffe2b8, 46, 10, 0.75, 0.55, 1.3));
    spot.position.set(AT.lamp.x, AT.lamp.y - 0.12, AT.lamp.z + 0.6);
    spot.target.position.set(0, 0.6, -0.5);
    spot.castShadow = true;
    spot.shadow.mapSize.set(1024, 1024);
    spot.shadow.bias = -0.0005;
    spot.shadow.normalBias = 0.02;
    spot.shadow.camera.near = 0.4;
    spot.shadow.camera.far = 7;
    sc.add(spot, spot.target);
    const front = new THREE.DirectionalLight(0xc8d4ff, 1.35);
    front.position.set(1.5, 3, 8);
    const rim = new THREE.DirectionalLight(0x8ab4ff, 1.1);
    rim.position.set(-3, 4.5, -5);
    this.tubeLight = new THREE.PointLight(0x7cff3a, 9, 6, 1.5);
    this.tubeLight.position.set(AT.tube.x + 0.2, 1.5, AT.tube.z + 0.8);
    this.termLight = new THREE.PointLight(0x3fe8ff, 4, 5, 1.5);
    this.termLight.position.set(AT.term.x, AT.term.y - 0.2, AT.term.z + 1.0);
    this.neonLight = new THREE.PointLight(0xff2e88, 4.5, 5, 1.6);
    this.neonLight.position.set(0, 4.0, WALL + 0.7);
    this.hoodLight = new THREE.PointLight(0x7cff3a, 4.5, 4, 1.5);
    this.hoodLight.position.set(AT.hood.x, 1.3, AT.hood.z + 0.6);
    this.reactorLight = new THREE.PointLight(0x3fe8ff, 4, 4, 1.5);
    this.reactorLight.position.set(AT.reactor.x - 0.3, 1.0, AT.reactor.z + 1.0);
    sc.add(front, rim, this.tubeLight, this.termLight, this.neonLight, this.hoodLight, this.reactorLight);
  }

  /** Unlit canvas screen plane. */
  screen(tex, w, h, pos, gain = 1.2) {
    const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
    mat.color.setScalar(gain);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.copy(pos);
    this.scene.add(m);
    this.textures.push(tex);
    this.mats.push(mat);
    return m;
  }

  buildTube() {
    const sc = this.scene;
    const R = 0.62, H = 2.1;
    const t = (this.tube = specimenTube({ color: 0x7cff3a, h: H, r: R, accent: LP.C.pink }));
    t.root.position.copy(AT.tube);
    sc.add(t.root);
    // swap its liquid for ours (fills with research progress, tinted per branch)
    const liq0 = t.root.children.find((c) => c.material?.transparent && c.material?.vertexColors && c !== t.root.children[0]);
    if (liq0) liq0.visible = false;
    const Rv = Math.round(R / V), Hv = Math.round(H / V);
    this.liqMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: 0x7cff3a, transparent: true, opacity: 0.55, depthWrite: false });
    this.mats.push(this.liqMat);
    this.liquid = new THREE.Mesh(LP.tubeLiquidGeo(Rv, Hv), this.liqMat);
    this.liquid.position.set(AT.tube.x, 9 * V, AT.tube.z);
    this.liquid.renderOrder = 2;
    sc.add(this.liquid);
    this.tubeDims = { y0: 9 * V, h: (Hv - 1) * V, r: (Rv - 2) * V };
    // the readout on the base
    this.readout = new Readout();
    this.readMesh = this.screen(this.readout.p.tex, 0.44, 0.155, new THREE.Vector3(AT.tube.x, 0.21, AT.tube.z + 0.86), 1.4);
    // a Swarm from your deck floats inside
    const deck = (() => { try { return currentDeck() ?? []; } catch (e) { return []; } })();
    const pick = deck.find((id) => SWARMS[id] && !SWARMS[id].isMega) ?? 'panther';
    try {
      this.swarm = createSwarm(pick, { scale: 0.62 });
      this.swarm.setState?.('idle');
      this.swarm.root.position.set(AT.tube.x, 1.25, AT.tube.z);
      this.swarm.root.rotation.y = 0.3;
      sc.add(this.swarm.root);
    } catch (e) { this.swarm = null; }
  }

  buildRobot() {
    const P = LP.robotParts();
    const root = (this.robot = new THREE.Group());
    root.position.copy(AT.robot);
    root.rotation.y = -0.4;
    root.add(P.ped);
    const tur = new THREE.Group(); tur.position.y = 12 * V; root.add(tur); tur.add(P.turret);
    const sh = new THREE.Group(); sh.position.y = 5 * V; tur.add(sh); sh.add(P.upper);
    const el = new THREE.Group(); el.position.y = 16.5 * V; sh.add(el); el.add(P.fore);
    const wr = new THREE.Group(); wr.position.y = 14.5 * V; el.add(wr);
    const fL = P.finger, fR = P.finger.clone();
    const gL = new THREE.Group(), gR = new THREE.Group();
    gL.position.x = -1 * V; gR.position.x = 1 * V; gR.scale.x = -1;
    gL.add(fL); gR.add(fR); wr.add(gL, gR);
    const vial = makeMesh(LP.HAND.beaker(), [Mats.solid, this.robotLiq = Object.assign(new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }), {})]);
    this.robotLiq.color.setHex(0xffd23f).multiplyScalar(1.8);
    this.mats.push(this.robotLiq);
    vial.position.y = 3 * V;
    vial.scale.setScalar(0.8);
    vial.visible = false;
    wr.add(vial);
    this.scene.add(root);
    this.arm = { tur, sh, el, wr, gL, gR, vial, t: 0 };
  }

  /** (Re)dress the scientist as the equipped Commander in lab gear. */
  applyScientist() {
    if (!this.sci) return;
    const { def, voice } = scientistDef();
    this.sci.setDef(def, voice);
    this.charId = voice;
  }

  // ------------------------------------------------------------------ show / hide

  attach() {
    // the merged statics free their JS copies once uploaded, so they are rebuilt after a release()
    if (!this.batch && this.still) { try { this.batch = batchStatic(this.still, { cell: 12 }); } catch (e) { this.batch = null; } }
    if (engine.backdrop?.owner !== this) engine.setBackdrop({ scene: this.scene, camera: this.camera, update: this.updateFn, bloom: this.bloom, grade: this.grade, owner: this });
  }
  detach() {
    if (engine.backdrop?.owner === this) engine.setBackdrop(null);
  }
  get live() {
    return engine.bdLive?.owner === this;
  }
  /** Free GPU buffers / textures / the shadow map (everything re-uploads on the next visit). */
  release() {
    this.detach();
    this.batch?.dispose();
    this.batch = null;
    this.scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    for (const t of this.textures) t.dispose();
    if (this.sci?.ch) this.sci.ch.face.texture?.dispose?.();
    if (this.spot?.shadow?.map) { this.spot.shadow.map.dispose(); this.spot.shadow.map = null; }
    this.fx?.clear();
    this.focus = this.focusTo = 0;
  }

  /** Frame the lab in a screen rect (CSS px); scrollY slides it up with the page. */
  frame(rect, scrollY = 0) {
    this.frameRect = rect;
    this.scrollY = scrollY;
  }

  layoutCamera() {
    const W = engine.width, H = engine.height, cam = this.camera;
    const r = this.frameRect ?? { left: 0, top: 0, width: W, height: H * 0.55 };
    // subject: bench + tube + whiteboard + terminal; wide rects show more of the room
    const wide = r.width / Math.max(1, r.height) > 1.2;
    const subjH = wide ? 5.0 : 4.25, subjW = 5.3;
    const upp = Math.max(subjH / Math.max(80, r.height), subjW / Math.max(80, r.width));
    const fullH = H * upp;
    const dist = fullH / 2 / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const look = (this._look ??= new THREE.Vector3());
    look.set(wide ? -0.2 : 0.05, wide ? 1.98 : 2.08, -1.3);
    const pos = (this._pos ??= new THREE.Vector3());
    pos.set(look.x + Math.sin(this.t * 0.11) * 0.25, look.y + dist * 0.05, look.z + dist);
    // the dolly into the RESEARCH terminal
    const f = smooth(this.focus);
    if (f > 0) {
      const tl = AT.term, th = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
      const d2 = Math.max(LP.TERM.h * 1.5, (LP.TERM.w * 1.2) / (W / H)) / (2 * th);
      look.lerp(this._tl ??= new THREE.Vector3(tl.x - 0.02, tl.y + 0.12, tl.z), f);
      pos.lerp(this._tp ??= new THREE.Vector3(), f);
      this._tp.set(tl.x - 0.02, tl.y + 0.18, tl.z + d2);
    }
    cam.aspect = W / H;
    cam.position.copy(pos);
    cam.lookAt(look);
    const cx = r.left + r.width / 2, cy = r.top + r.height * 0.5 - this.scrollY * 0.5;
    const off = 1 - f;
    cam.setViewOffset(W, H, (W / 2 - cx) * off, (H / 2 - cy) * off, W, H);
    cam.updateProjectionMatrix();
  }

  // ------------------------------------------------------------------ research

  /** Show the active research (researchStatus().active) or null. */
  setResearch(active, color) {
    this.research = active ? { ...active, kind: branchKind(active.branch), color: color ?? BRANCH_COLOR[branchKind(active.branch)] } : null;
    if (this.research) this.lastProject = this.research.kind;
    this.sci?.setResearch(this.research);
    if (this.liqMat) this.liqMat.color.setHex(this.research ? this.research.color : 0x7cff3a);
    this.tubeLight?.color.setHex(this.research ? this.research.color : 0x7cff3a);
  }
  progress() {
    const a = this.research;
    if (!a) return null;
    return clamp01((Date.now() - a.startedAt) / Math.max(1, a.endsAt - a.startedAt));
  }
  /** Research finished: confetti, the project pops off the bench, the tube flashes, he cheers. */
  celebrate(color = 0xffd23f) {
    if (!this.ready) return;
    const P = this.sci.props;
    const k = this.research?.kind ?? this.lastProject;
    const proj = { shack: P.shack, power: P.cell, tanks: P.plate, spells: P.potion, ultimate: P.serum }[k] ?? P.potion;
    for (const m of [P.shack, P.cell, P.plate, P.potion, P.serum]) if (m !== proj) { m.visible = false; m.userData.pop = null; }
    proj.userData.pop = { t: 0, color };
    proj.visible = true;
    this.cheering = true;
    this.flashT = 1.2;
    this.sci.celebrate();
    const at = new THREE.Vector3(0, LP.BENCH.top + 0.5, 0.05);
    const conf = [0xff2e88, 0x29b6f6, 0xffd23f, 0x7cff6b, 0xb05cff, 0xff8a2a, 0xffffff];
    for (let i = 0; i < 70; i++) {
      const a = Math.random() * Math.PI * 2, s = 2.2 + Math.random() * 2.6;
      this.fx.spawn({ x: at.x + (Math.random() - 0.5) * 0.3, y: at.y + 0.4, z: at.z, vx: Math.cos(a) * s * 0.7, vy: 2.2 + Math.random() * 2.8, vz: Math.sin(a) * s * 0.35 + 0.6, grav: -3.2, drag: 1.6, life: 2.4 + Math.random() * 1.2, size: 0.07, flip: true, color: conf[i % conf.length], wobble: 1.2, floor: 0.02 });
    }
    this.fx.burst(at, 18, { speed: 2.6, life: 0.9, size: 0.09, size1: 0.03, tile: TILE.star, color: [0xffe680, 0xffffff, color], glow: 2.2, grav: -2, up: 1.4 });
  }

  // ------------------------------------------------------------------ interaction

  sfx(name, o) {
    if (this.sfxOn && this.live) audio.play(name, o);
  }
  writeBoard(dt) {
    this.boardAcc = (this.boardAcc ?? 0) + dt * 70;
    const n = Math.floor(this.boardAcc);
    if (n > 0) { this.boardAcc -= n; this.board.write(n); this.boardDirty = true; }
    if (this.board.full > 40 && !this.board.wipe) { this.board.wipe = 1; this.board.full = 0; }
  }
  tubeTap() {
    if (this.swarm) { this.swarm.boing?.(0.35); this.swarmKick = 0.8; }
    this.sfx('boing', { pitch: 1.4, vol: 0.25 });
    const g = this.tubeDims;
    for (let i = 0; i < 6; i++) this.bubble(g.y0 + Math.random() * 0.4, 0.06);
  }
  bubble(y = null, size = 0.045) {
    const g = this.tubeDims, a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * g.r;
    const top = g.y0 + g.h * this.level;
    this.fx.spawn({ x: AT.tube.x + Math.cos(a) * r, y: y ?? g.y0 + Math.random() * 0.2, z: AT.tube.z + Math.sin(a) * r, vy: 0.45 + Math.random() * 0.35, life: Math.max(0.3, (top - (y ?? g.y0)) / 0.6), size, size1: size * 1.2, tile: TILE.bubble, color: this.research ? this.research.color : 0xb8ffb0, glow: 1.1, wobble: 0.25 });
  }
  /** What is under a screen point: 'scientist' | 'tube' | 'terminal' | 'reactor' | 'robot' | 'board' | 'hood' | null. */
  pick(x, y) {
    if (!this.ready) return null;
    const ch = this.sci?.ch;
    if (ch && engine.raycast(x, y, [ch.root], this.camera, true).length) return 'scientist';
    const ray = engine.raycaster.ray;
    const boxes = this._boxes ??= [
      ['tube', new THREE.Box3(new THREE.Vector3(AT.tube.x - 0.85, 0, AT.tube.z - 0.8), new THREE.Vector3(AT.tube.x + 0.85, 3.1, AT.tube.z + 0.85))],
      ['terminal', new THREE.Box3(new THREE.Vector3(AT.term.x - 1.0, AT.term.y - 0.65, WALL), new THREE.Vector3(AT.term.x + 1.0, AT.term.y + 0.95, WALL + 0.3))],
      ['reactor', new THREE.Box3(new THREE.Vector3(AT.reactor.x - 0.8, 0, AT.reactor.z - 0.8), new THREE.Vector3(AT.reactor.x + 0.8, 2.5, AT.reactor.z + 0.8))],
      ['robot', new THREE.Box3(new THREE.Vector3(AT.robot.x - 0.6, 0, AT.robot.z - 0.6), new THREE.Vector3(AT.robot.x + 0.6, 2.2, AT.robot.z + 0.6))],
      ['board', new THREE.Box3(new THREE.Vector3(AT.board.x - 0.9, AT.board.y - 0.6, WALL), new THREE.Vector3(AT.board.x + 0.9, AT.board.y + 0.6, WALL + 0.3))],
      ['hood', new THREE.Box3(new THREE.Vector3(AT.hood.x - 0.8, 0, AT.hood.z - 0.6), new THREE.Vector3(AT.hood.x + 0.8, 2.6, AT.hood.z + 0.6))],
    ];
    let best = null, bd = Infinity;
    const v = this._pv ??= new THREE.Vector3();
    for (const [k, b] of boxes) if (ray.intersectBox(b, v)) { const d = v.distanceTo(ray.origin); if (d < bd) { bd = d; best = k; } }
    return best;
  }
  /** Prop reactions to taps. */
  poke(what) {
    if (what === 'tube') this.tubeTap();
    else if (what === 'reactor') { this.rotorKick = 2.5; this.steam(1.6); this.sfx('whoosh', { pitch: 0.7, vol: 0.35 }); }
    else if (what === 'robot') { this.arm.wave = 1.6; this.sfx('squeak', { pitch: 1.3, vol: 0.3 }); }
    else if (what === 'hood') { this.fumes(10); this.sfx('fizz', { vol: 0.3, pitch: 0.8 }); }
    else if (what === 'board') { this.sfx('tap', { vol: 0.3 }); }
  }
  /** Screen position (CSS px) above the scientist's head (speech bubble anchor) + head width. */
  headScreen(out = {}) {
    const ch = this.sci?.ch;
    if (!ch) return null;
    const v = ch.headTop(this._hv ??= new THREE.Vector3());
    v.y += 0.05;
    const s = engine.toScreen(v, this.camera);
    out.x = s.x; out.y = s.y;
    v.x += 0.5;
    out.w = Math.abs(engine.toScreen(v, this.camera).x - s.x) * 2;
    return out;
  }
  /** Screen rect (CSS px) of the terminal's screen (for the tree sheet to grow out of). */
  terminalRect() {
    const TS = LP.TERM_SCREENS.main;
    const c = AT.term;
    const a = engine.toScreen(this._ta ??= new THREE.Vector3(c.x + TS.x - TS.w / 2, c.y + TS.y + TS.h / 2, c.z + TS.z), this.camera);
    const b = engine.toScreen(this._tb ??= new THREE.Vector3(c.x + TS.x + TS.w / 2, c.y + TS.y - TS.h / 2, c.z + TS.z), this.camera);
    return { left: a.x, top: a.y, width: b.x - a.x, height: b.y - a.y };
  }
  steam(k = 1) {
    const r = AT.reactor;
    for (let i = 0; i < Math.round(6 * k); i++) this.fx.spawn({ x: r.x + 0.15 + (Math.random() - 0.5) * 0.2, y: LP.REACTOR.top - 0.15, z: r.z - 0.1, vx: (Math.random() - 0.3) * 0.3, vy: 0.6 + Math.random() * 0.5, vz: (Math.random() - 0.5) * 0.2, drag: 0.9, life: 1.4 + Math.random(), size: 0.1, size1: 0.34, tile: TILE.smoke, color: 0xc8d0e0, fadeIn: 0.1 });
  }
  fumes(n = 1) {
    const f = LP.HOOD.flask;
    for (let i = 0; i < n; i++) this.fx.spawn({ x: AT.hood.x + f.x + (Math.random() - 0.5) * 0.1, y: f.y + 0.3, z: AT.hood.z + f.z, vx: (Math.random() - 0.5) * 0.12, vy: 0.35 + Math.random() * 0.25, drag: 0.4, life: 2.2, size: 0.07, size1: 0.2, tile: TILE.smoke, color: 0x8aff6a, glow: 1.15, fadeIn: 0.2 });
  }

  // ------------------------------------------------------------------ frame

  update(dt) {
    if (!this.ready) return;
    dt = Math.min(dt, 0.1);
    this.t += dt;
    const t = this.t;
    // camera (re-layout while resizing, dollying or swaying)
    if (this.focus !== this.focusTo) {
      const sp = dt / 0.7;
      this.focus = this.focusTo > this.focus ? Math.min(this.focusTo, this.focus + sp) : Math.max(this.focusTo, this.focus - sp);
    }
    this.layoutCamera();

    // scientist + hand props
    this.sci.update(dt);

    // research: tube level + colour, readout, terminal
    const k = this.progress();
    const wantLevel = k == null ? 0.86 : 0.18 + 0.78 * k;
    this.level += (wantLevel - this.level) * (1 - Math.exp(-3 * dt));
    if (this.drain > 0) { this.drain -= dt; }
    this.liquid.scale.y = Math.max(0.03, this.level);
    const flash = this.flashT > 0 ? (this.flashT -= dt, Math.max(0, this.flashT)) : 0;
    this.liqMat.opacity = 0.5 + Math.sin(t * 2.4) * 0.04 + flash * 0.4;
    this.tubeLight.intensity = 8.5 + Math.sin(t * 3.1) * 0.8 + (k ?? 0) * 3 + flash * 5;
    // the Swarm bobs in the liquid (rests on the bottom while the tube is low)
    if (this.swarm) {
      const g = this.tubeDims;
      const top = g.y0 + g.h * this.level;
      const yy = Math.min(g.y0 + 0.85, top - 0.55);
      const kick = this.swarmKick > 0 ? (this.swarmKick -= dt) : 0;
      this.swarm.root.position.y = Math.max(g.y0 + 0.05, yy) + Math.sin(t * 1.1) * 0.06 + Math.sin(kick * 12) * kick * 0.08;
      this.swarm.root.rotation.y = 0.3 + Math.sin(t * 0.35) * 0.5;
      this.swarm.root.rotation.z = Math.sin(t * 0.8) * 0.06;
      this.swarm.update?.(dt);
    }
    // tube bubbles
    this.bubAcc = (this.bubAcc ?? 0) + dt * (k == null ? 7 : 10 + k * 14);
    while (this.bubAcc > 1) { this.bubAcc -= 1; this.bubble(); }

    // the project pops off the bench after a research
    for (const k2 of ['shack', 'plate', 'potion', 'serum', 'cell']) {
      const m = this.sci.props[k2];
      const pop = m.userData.pop;
      if (!pop) continue;
      pop.t += dt;
      const u = pop.t;
      m.visible = true;
      if (u < 2.2) {
        // hops off the bench to his side, spins in the light, sparkles
        const e = Math.sin(Math.min(1, u / 0.45) * Math.PI / 2);
        m.position.set(0.02 + e * 0.78, LP.BENCH.top + e * 0.62 + Math.sin(u * 5) * 0.03, 0.2 + e * 0.12);
        m.rotation.y = u * 6;
        m.scale.setScalar(1 + e * 0.45);
        if (Math.random() < 0.6) this.fx.spawn({ x: m.position.x + (Math.random() - 0.5) * 0.5, y: m.position.y + Math.random() * 0.5, z: m.position.z + 0.1, vy: 0.4, life: 0.6, size: 0.05, tile: TILE.star, color: pop.color, glow: 2.2 });
      } else if (u < 2.7) {
        const e = smooth((u - 2.2) / 0.5);
        m.position.set(0.8 - e * 0.78, LP.BENCH.top + 0.62 * (1 - e), 0.32 - e * 0.12);
        m.scale.setScalar(1.45 - e * 0.45);
        m.rotation.y = u * 6 * (1 - e);
      } else {
        m.userData.pop = null;
        m.scale.setScalar(1);
        if (!this.research) m.visible = false;
      }
    }

    // reactor rotor + beacon, steam
    this.rotorKick = Math.max(0, (this.rotorKick ?? 0) - dt);
    this.rotor.rotation.y += dt * (5 + (k != null ? 4 : 0) + this.rotorKick * 6);
    this.beacon.rotation.y += dt * 4;
    this.reactorLight.intensity = 3.6 + Math.sin(t * 6) * 0.35;
    this.steamIn = (this.steamIn ?? 3) - dt;
    if (this.steamIn <= 0) { this.steamIn = 4 + Math.random() * 5; this.steam(1); this.sfx('whoosh', { pitch: 0.55, vol: 0.12 }); }
    // fume hood
    this.fumeAcc = (this.fumeAcc ?? 0) + dt * 2.2;
    while (this.fumeAcc > 1) { this.fumeAcc -= 1; this.fumes(1); }
    this.hoodLight.intensity = 4.3 + Math.sin(t * 2.3) * 0.6;
    // burner flame (pixel flame licks)
    this.flameAcc = (this.flameAcc ?? 0) + dt * 18;
    while (this.flameAcc > 1) {
      this.flameAcc -= 1;
      const b = LP.BURNER;
      const hot = Math.random() < 0.35;
      this.fx.spawn({ x: AT.bench.x + b.x + (Math.random() - 0.5) * 0.03, y: AT.bench.y + b.y, z: AT.bench.z + b.z, vy: 0.5 + Math.random() * 0.3, life: 0.25, size: 0.03, size1: 0.012, color: hot ? 0x6ad0ff : 0xffa030, glow: 2.2 });
    }
    // sparks from the frayed cable now and then (flash the reactor light warm)
    this.sparkIn = (this.sparkIn ?? 2) - dt;
    if (this.sparkIn <= 0) {
      this.sparkIn = 3.5 + Math.random() * 5;
      this.fx.burst(LP.SPARK_AT, 9, { speed: 1.7, life: 0.45, size: 0.035, tile: TILE.spark, color: [0xffffff, 0xffe680, 0x8ae8ff], glow: 2.6, grav: -6, zs: 1, floor: 0.02 });
      this.sparkT = 0.15;
      this.sfx('zap', { pitch: 1.8, vol: 0.12 });
    }
    if (this.sparkT > 0) { this.sparkT -= dt; this.reactorLight.intensity += 6; }
    // goo drips from the pipe valve into the spill
    this.dripIn = (this.dripIn ?? 1) - dt;
    if (this.dripIn <= 0) { this.dripIn = 1.4 + Math.random() * 1.6; this.fx.spawn({ x: -4.05, y: 0.5, z: WALL + 0.3, vy: 0, grav: -5, life: 0.5, size: 0.04, tile: TILE.drop, color: 0x7cff3a, glow: 1.6, floor: 0.02 }); }
    // neon flicker
    this.flickT = (this.flickT ?? 6) - dt;
    let neon = 2.6;
    if (this.flickT < 0.3) neon = Math.random() < 0.5 ? 0.6 : 2.6;
    if (this.flickT < 0) this.flickT = 5 + Math.random() * 9;
    this.sign.material.color.setScalar(neon);
    this.neonLight.intensity = neon * 1.7;
    // lamp sway (spot follows)
    this.lamp.rotation.z = Math.sin(t * 0.6) * 0.03;
    // robot arm
    this.updateRobot(dt);
    // the specimen in the corner tube
    this.smallTube.update(dt, t);

    // screens
    this.scrAcc = (this.scrAcc ?? 0) + dt;
    if (this.scrAcc > 0.12) {
      const d = this.scrAcc;
      this.scrAcc = 0;
      this.term.draw(d, this.status);
      this.readout.draw(d, k, '#' + new THREE.Color(this.research ? this.research.color : 0x7cff3a).getHexString());
      if (this.board.wipe > 0) {
        this.board.wipe = Math.max(0, this.board.wipe - d * 0.8);
        this.boardDirty = true;
        if (this.board.wipe === 0) this.board.load(this.board.k + 1);
      }
      if (this.boardDirty) { this.boardDirty = false; this.board.draw(); }
    }
    tickLabScreens();

    this.fx.update(dt, this.camera);
    this.batch?.check();
  }

  updateRobot(dt) {
    const A = this.arm;
    A.t += dt;
    // keyframes: [t, yaw, shoulder, elbow, claw (1 = shut), holding]
    const K = [[0, 0.5, -0.35, -1.1, 0, 0], [1.4, -0.95, -0.85, -1.45, 0, 0], [2.0, -0.95, -0.95, -1.45, 1, 1], [2.9, -0.3, -0.25, -0.75, 1, 1], [4.4, -0.3, -0.25, -0.75, 1, 1], [5.4, -0.95, -0.95, -1.45, 1, 1], [5.9, -0.95, -0.95, -1.45, 0, 0], [7.0, 0.5, -0.35, -1.1, 0, 0], [11.0, 0.5, -0.35, -1.1, 0, 0]];
    const L = K[K.length - 1][0];
    const u = A.t % L;
    let i = 0;
    while (i < K.length - 2 && u > K[i + 1][0]) i++;
    const a = K[i], b = K[i + 1], e = smooth(clamp01((u - a[0]) / Math.max(0.001, b[0] - a[0])));
    const lerp = (j) => a[j] + (b[j] - a[j]) * e;
    let yaw = lerp(1), sh = lerp(2), el = lerp(3);
    const claw = lerp(4);
    // shake the vial between the keyframes 2.9..4.4; idle sway at rest; a wave when tapped
    if (u > 2.9 && u < 4.4) A.wr.rotation.z = Math.sin(A.t * 26) * 0.35;
    else A.wr.rotation.z *= 0.8;
    if (u > 7) { yaw += Math.sin(A.t * 0.9) * 0.12; sh += Math.sin(A.t * 1.3) * 0.05; }
    if (A.wave > 0) { A.wave -= dt; sh = -0.1; el = -0.4 + Math.sin(A.t * 14) * 0.35; }
    A.tur.rotation.y = yaw;
    A.sh.rotation.x = sh;
    A.el.rotation.x = el;
    A.gL.rotation.z = 0.5 - claw * 0.45;
    A.gR.rotation.z = 0.5 - claw * 0.45;
    A.vial.visible = a[5] > 0 && b[5] > 0 || (a[5] > 0 && e < 0.5) || (b[5] > 0 && e > 0.5);
  }
}

/** The scientist's look: the equipped Commander (and outfit) in a lab coat, goggles and gloves. */
export function scientistDef() {
  const p = state.p;
  const id = p.commanders?.equipped ?? 'recruit';
  return labGear(id, p.commanders?.owned?.[id]?.skin ?? null);
}
function labGear(cmdId, skin) {
  const charId = COMMANDERS[cmdId]?.char ?? 'recruit';
  const base = { ...(CHARACTERS[charId] ?? CHARACTERS.recruit) };
  if (skin && CMD_SKINS[skin]) { const { name, commander, ...rest } = CMD_SKINS[skin]; Object.assign(base, rest); }
  const d = { ...base };
  d.outfit = 'labcoat';
  d.coat = base.outfit === 'labcoat' && base.coat && base.coat !== 0xb08d5c ? base.coat : 0xf2f5fa;
  d.gloves = 0x6ab4ff;
  // lab safety: goggles on, nothing dangly; the Recruit takes the helmet and jetpack off
  d.accMinus = [...(base.accMinus ?? []), 'helmet', 'jetpack', 'cape', 'backpack', 'whisk', 'clipboard', 'phone', 'mic', 'spyShades', 'shades'];
  d.hat = null;
  d.accPlus = [...(base.accPlus ?? []).filter((a) => !['whisk', 'phone', 'mic', 'clipboard', 'cape'].includes(typeof a === 'string' ? a : a.type)), { type: 'goggles', lens: 0x7cff3a }];
  if (charId === 'recruit') { d.acc = []; d.shirt = 0x26304a; d.accent = 0xff2e88; }
  return { def: d, voice: charId };
}

let single = null;
/** The session's one lab stage (built on first use). */
export function labStage() {
  if (!single) {
    single = new LabStage();
    if (typeof window !== 'undefined') window.__labStage = single; // tests / dev tools
  }
  return single;
}

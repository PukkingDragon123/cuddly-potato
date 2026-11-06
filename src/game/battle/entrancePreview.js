// Shop PREVIEW of a battle entrance: the real cinematic (entranceCine.js + entranceSets.js),
// played full screen on a small test range drawn by the main renderer (engine.setBackdrop:
// no extra WebGL context, the shop's bunker gets the renderer back afterwards). Your
// Commander in their outfit, your base, your banner and rank on the title card.
// Tap to skip; REPLAY / BACK at the end. Everything built here is freed on close.
//
//   await playEntrancePreview(id, { onClose })   // resolves when the player backs out
import * as THREE from 'three';
import { engine } from '../../core/engine.js';
import { audio } from '../../core/audio.js';
import { VoxGrid, Mats, makeMesh } from '../../core/voxel.js';
import { Chibi } from '../../core/chibi.js';
import { n3 } from '../../models/kit.js';
import { coverFit, treeGrid } from '../../models/arenas/kit.js';
import { h, button, $overlay } from '../../ui/ui.js';
import { CHARACTERS } from '../../data/characters.js';
import { entranceDef } from '../../data/entrances.js';
import { state } from '../state.js';
import { playerSide } from './loadout.js';
import { playEntrance, makeWrap, wrapOut } from './entranceCine.js';
import { prepSet } from './entranceSets.js';

let busy = false;

const hash = (a, b) => { let h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };

/** Dusk sky with pixel stars and clouds over rolling pixel hills and a far-off lab (screen-space backdrop). */
function skyTexture() {
  const W = 160, H = 120;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const stops = [[0, [24, 16, 70]], [0.4, [70, 42, 156]], [0.68, [196, 92, 170]], [0.82, [255, 160, 150]], [1, [255, 200, 160]]];
  const at = (k) => {
    for (let i = 1; i < stops.length; i++) if (k <= stops[i][0]) {
      const [k0, a] = stops[i - 1], [k1, b] = stops[i];
      const u = (k - k0) / (k1 - k0);
      return a.map((v, j) => Math.round(v + (b[j] - v) * u));
    }
    return stops[stops.length - 1][1];
  };
  for (let y = 0; y < H; y++) {
    const k = y / (H - 1), a = at(k), b = at(Math.min(1, k + 0.03));
    for (let x = 0; x < W; x++) { const col = (x + y) & 1 ? a : b; g.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`; g.fillRect(x, y, 1, 1); }
  }
  for (let i = 0; i < 60; i++) {
    const x = Math.floor(hash(i, 1) * W), y = Math.floor(hash(i, 2) * H * 0.5);
    g.fillStyle = hash(i, 3) < 0.25 ? '#ffffff' : '#b8b0f0';
    g.fillRect(x, y, 1, 1);
    if (hash(i, 4) < 0.1) { g.fillRect(x - 1, y, 3, 1); g.fillRect(x, y - 1, 1, 3); }
  }
  for (const [cx, cy, w] of [[18, 54, 26], [92, 46, 34], [130, 60, 20]]) {
    g.fillStyle = '#ffc8dc'; g.fillRect(cx, cy, w, 3); g.fillRect(cx + 4, cy - 3, w - 10, 3); g.fillRect(cx + 9, cy - 5, w - 20, 2);
    g.fillStyle = '#e894bc'; g.fillRect(cx + 2, cy + 3, w - 4, 1);
  }
  // two layers of rolling hills + a little lab with lit windows on the far ridge
  const ridge = (base, amp, f, ph, col) => {
    g.fillStyle = col;
    for (let x = 0; x < W; x++) { const y = Math.round(base - amp * (Math.sin(x * f + ph) * 0.6 + Math.sin(x * f * 2.3 + ph) * 0.4)); g.fillRect(x, y, 1, H - y); }
  };
  ridge(H * 0.74, 6, 0.045, 1, '#5a3a8a');
  g.fillStyle = '#3e2a6a'; g.fillRect(104, 76, 16, 10); g.fillRect(108, 70, 8, 6); g.fillRect(111, 64, 2, 6);
  g.fillStyle = '#ffd27a'; for (const [x, y] of [[106, 79], [110, 79], [114, 79], [118, 79], [110, 73]]) g.fillRect(x, y, 1, 2);
  g.fillStyle = '#ff4fa3'; g.fillRect(111, 63, 2, 1);
  ridge(H * 0.84, 5, 0.06, 3, '#3a2a62');
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** The test range floor: grass with a sandy battle lane and hazard-striped edges (one merged voxel mesh). */
function floorMesh() {
  const g = new VoxGrid();
  const V = 0.25;
  for (let x = -96; x < 96; x++) for (let z = -64; z < 40; z++) {
    const wz = z * V;
    const lane = wz >= -1.5 && wz < 1.75;
    const edge = !lane && (wz >= -1.75 && wz < -1.5 || wz >= 1.75 && wz < 2.0);
    let c;
    if (edge) c = ((x + 200) >> 2) % 2 ? 0xffd23f : 0x2a2e3a;
    else if (lane) c = n3(x, 0, z, 5) < 0.1 ? 0xb89060 : ((x >> 1) + (z >> 1)) & 1 ? 0xd8b07a : 0xd0a872;
    else { const k = n3(x >> 1, 0, z >> 1, 9); c = k < 0.08 ? 0x8ee05a : k < 0.5 ? 0x5fbf4a : 0x56b444; }
    g.set(x, 0, z, c);
  }
  const m = makeMesh(g.build({ scale: V, pivot: [0, 1, 0], jitter: 0.01, ao: false }), Mats.pair);
  m.castShadow = false;
  m.receiveShadow = true;
  return m;
}

/** Build the stage, play the entrance, offer REPLAY / BACK. Resolves on close. */
export async function playEntrancePreview(id, opts = {}) {
  if (busy) return;
  busy = true;
  const e = entranceDef(id);
  document.body.classList.add('ent-pv-on');
  const ui = h('div', { class: 'ent-pv-ui' }, h('i', { class: 'ent-pv-bg' }), h('div', { class: 'ent-pv-load' }, 'SETTING UP THE SHOT...'));
  $overlay().appendChild(ui);
  let wrap = null, stage = null, ctl = null, closed = false, resolveClose;
  const closedP = new Promise((r) => (resolveClose = r));
  const close = () => {
    if (closed) return;
    closed = true;
    ctl?.finish?.();
    if (engine.backdrop?.owner === stage) engine.setBackdrop(null);
    document.body.classList.remove('ent-pv-on');
    ui.remove();
    wrapOut(wrap);
    if (stage) {
      stage.scene.traverse((o) => { if (o.geometry && !o.userData.keepGeo) o.geometry.dispose(); });
      stage.sky.dispose();
      stage.ch.face?.texture?.dispose?.();
      if (stage.sun.shadow?.map) { stage.sun.shadow.map.dispose(); stage.sun.shadow.map = null; }
    }
    busy = false;
    opts.onClose?.();
    resolveClose();
  };
  try {
    const { makeBase } = await import('../../models/props/base.js');
    if (closed) return closedP;
    const me = playerSide();
    // ---- the set
    const scene = new THREE.Scene();
    const sky = skyTexture();
    scene.background = sky;
    scene.fog = new THREE.Fog(0xb878c0, 22, 52);
    const camera = new THREE.PerspectiveCamera(30, engine.aspect, 0.1, 200);
    coverFit(sky, engine.aspect);
    scene.add(new THREE.HemisphereLight(0xeaf0ff, 0x6a4a3a, 1.5));
    const sun = new THREE.DirectionalLight(0xfff0dc, 2.4);
    sun.position.set(-6, 14, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 50 });
    sun.shadow.bias = -0.0006;
    scene.add(sun, sun.target);
    const rim = new THREE.DirectionalLight(0xff9ad8, 0.9);
    rim.position.set(6, 5, -8);
    scene.add(rim);
    scene.add(floorMesh());
    // a tree line behind the range for depth (one merged mesh)
    const trees = new VoxGrid();
    [[-14, -9, 'round'], [-9, -11, 'pine'], [-3, -10, 'round'], [3, -12, 'pine'], [8, -9.5, 'round'], [13, -11, 'pine'], [18, -10, 'round'], [-19, -12, 'pine']].forEach(([x, z, kind], i) => {
      trees.merge(treeGrid(kind, { seed: i + 3, leaf: i % 2 ? 0x3f9a4a : 0x5fbf4a }), Math.round(x / 0.12), 0, Math.round(z / 0.12));
    });
    const tm = makeMesh(trees.build({ scale: 0.12, pivot: [0, 0, 0], jitter: 0.03 }), Mats.pair);
    tm.scale.setScalar(1.6);
    scene.add(tm);
    const style = me.labStyle ?? 'default';
    const lab = makeBase(1, { side: 0, flip: false, style });
    lab.root.position.set(-5.2, 0, 0);
    for (const m of lab.meshes ?? []) m.castShadow = true;
    scene.add(lab.root);
    lab.root.updateMatrixWorld(true);
    const seat = new THREE.Vector3().setFromMatrixPosition(lab.seat.matrixWorld);
    const c = me.commander;
    const def = { ...CHARACTERS[c?.char ?? 'recruit'], ...(c?.override ?? {}) };
    const ch = new Chibi(def, { scale: 0.9 });
    ch.root.scale.setScalar(0.68);
    ch.root.position.copy(seat);
    ch.root.rotation.y = 0.55;
    ch.play('sit');
    scene.add(ch.root);
    const bd = lab.bounds ?? { x0: -1.7, x1: 1.7, z0: -1.4, z1: 1.8 };
    stage = {
      scene, camera, sky, sun, ch, lab,
      overlay: () => $overlay(),
      cmd: (i) => (i === 0 ? ch : null),
      base: () => ({ x: lab.root.position.x, front: lab.root.position.x + bd.x1, z1: bd.z1 ?? 1.8, height: lab.height ?? 3, seat: seat.clone(), seatYaw: 0.55 }),
      shake: (a) => engine.shake(a * 0.7),
      toScreen: (v) => engine.toScreen(v, camera),
    };
    // a resting camera on the base until the first shot
    camera.position.set(-1, 2.6, 13);
    camera.lookAt(-2, 1.2, 0);
    try { prepSet(e.id); } catch (err) { /* built on the fly */ }
    const update = (dt) => {
      if (camera.aspect !== engine.aspect) { camera.aspect = engine.aspect; camera.updateProjectionMatrix(); coverFit(sky, engine.aspect); }
      const n = Math.min(4, Math.ceil(dt / (1 / 40)));
      for (let i = 0; i < n; i++) ch.update(dt / n);
      lab.update?.(dt);
      if (ctl && !ctl.done) ctl.update(dt);
      sun.position.set(camera.position.x - 6, 14, 10);
      sun.target.position.set(camera.position.x, 0, 0);
    };
    update(0.016);
    await engine.precompile(scene, camera);
    if (closed) return closedP;
    engine.setBackdrop({ scene, camera, update, bloom: { strength: 0.5, radius: 0.12, threshold: 1.75 }, grade: { sat: 0.1, contrast: 0.08, vignette: 0.16 }, owner: stage });
    ui.classList.add('live');
    ui.querySelector('.ent-pv-load')?.remove();
    wrap = makeWrap($overlay());
    // REPLAY / BACK under the letterbox once it has played
    const btns = h('div', { class: 'ent-pv-btns' },
      button('REPLAY', (ev) => { ev?.stopPropagation?.(); play(); }, 'blue', { icon: 'play', sound: 'tap' }),
      button('BACK', (ev) => { ev?.stopPropagation?.(); audio.play('whoosh', { pitch: 1.2, vol: 0.5 }); close(); }, 'gray', { icon: 'arrowL', sound: 'tap' }));
    ui.appendChild(btns);
    const info = { name: state.p.name, trophies: state.p.trophies, labLevel: me.labLevel, banner: me.banner, commander: c };
    const play = async () => {
      if (closed) return;
      ui.classList.remove('done');
      wrap.classList.add('in');
      wrap.classList.remove('idle');
      ctl = playEntrance(stage, 0, e.id, { info, wrap, preview: true });
      await ctl.wait;
      if (!closed) { ui.classList.add('done'); wrap.classList.add('idle'); }
    };
    play();
  } catch (err) {
    console.error('entrance preview failed', err);
    close();
  }
  return closedP;
}

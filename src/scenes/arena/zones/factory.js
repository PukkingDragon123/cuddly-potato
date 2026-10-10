// Chocolate Factory: chocolate river with bridges and a chocolate waterfall, the
// factory with smoking chimneys, a chocolate-bar conveyor, giant candy decor.
import * as THREE from 'three';
import { VoxGrid, makeMesh, cachedGeometry } from '../../../core/voxel.js';
import { fx } from '../../../core/particles.js';
import { audio } from '../../../core/audio.js';
import { rand, pick } from '../../../core/util.js';
import { speech } from '../../../ui/ui.js';
import { textPanel, pickProxy } from '../kit.js';

const _v = new THREE.Vector3();
const Z = 'factory';
const RIVER = [32.5, 36]; // x range

export function buildFactory(A) {
  const T = A.terrain;
  T.rect(22, -21, 58, 9, 'choco', { onlyLand: true });
  // chocolate river (north -> south) with two bridges
  T.rect(RIVER[0] - 0.6, -21, RIVER[1] + 0.6, 9, 'dirt', { onlyLand: true });
  T.rect(RIVER[0], -21, RIVER[1], 9, 'chocoBed', { onlyLand: true });
  T.rect(RIVER[0] - 0.6, -7.6, RIVER[1] + 0.6, -4.4, 'bridge', { h: 0.08 });
  T.rect(RIVER[0] - 0.6, 2, RIVER[1] + 0.6, 4.4, 'bridge', { h: 0.08 });
  T.rect(22, -7.5, 50, -4.5, 'candy');
  T.rect(43, -11, 46, -4.5, 'candy');
  const L = A.liquid((RIVER[0] + RIVER[1]) / 2, -6, RIVER[1] - RIVER[0] + 1.4, 30, 'choco', -0.28, { texel: 2, flow: [0.0, -0.18], range: 40 });
  // bridge rails
  for (const [z0, z1] of [[-7.6, -4.4], [2, 4.4]]) for (const z of [z0 + 0.1, z1 - 0.1]) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(RIVER[1] - RIVER[0] + 1.4, 0.5, 0.14), new THREE.MeshLambertMaterial({ color: 0xff8ac0 }));
    r.position.set((RIVER[0] + RIVER[1]) / 2, 0.35, z);
    A.addStatic(r, Z);
    A.world.box(RIVER[0] - 0.7, z - 0.08, RIVER[1] + 0.7, z + 0.08);
  }
  // waterfall pipe at the north end
  const pipeGeo = cachedGeometry('arena:chocoPipe', () => {
    const g = new VoxGrid();
    g.box(-12, 0, -6, 11, 22, 3, 0xa0503a);
    g.paint((x, y, z, c) => (y % 3 === 0 ? 0x8a4030 : undefined));
    g.cylinder(0, 4, 16, 20, 5, 0x8a93a8, 'z');
    g.cylinder(0, 4, 16, 20, 3.5, 0x5a3220, 'z');
    return g;
  }, { scale: 0.15 });
  const pipe = makeMesh(pipeGeo);
  pipe.position.set((RIVER[0] + RIVER[1]) / 2, 0, -21.5);
  A.addStatic(pipe, Z);
  A.world.box(RIVER[0] - 1.6, -22.5, RIVER[1] + 1.6, -20.6);
  const fall = new THREE.Vector3((RIVER[0] + RIVER[1]) / 2, 2.6, -20.4);
  let acc = 0;
  A.onUpdate((dt) => {
    L.mesh.material.map.offset.y -= 0; // flow handled by liquid
    acc += dt;
    while (acc > 0.04) {
      acc -= 0.04;
      fx.burst(fall, { count: 1, colors: [0x5a3220, 0x6e3e26, 0x7d4a2d], speed: 0.4, vz: rand(1.2, 1.8), vy: 0.3, up: 0.2, size: 0.16, life: 0.9, ground: -0.25, bounce: 0, grav: -12, jitter: 0.3 });
    }
    if (Math.random() < dt * 4) fx.bubbles(_v.set(rand(RIVER[0], RIVER[1]), -0.25, rand(-20, -17)), { count: 1, color: 0x8a5a3c, size: 0.12 });
  }, fall.x, fall.z, 30);

  // the factory
  const fac = A.put('makeFactory', [], { x: 46, z: -16, zone: Z, fit: { w: 13, clamp: 1.3 } });
  fac.root.updateMatrixWorld(true);
  const fb = new THREE.Box3().setFromObject(fac.root);
  const chim = (fac.root.userData.chimneys ?? []).map((v) => v.clone().applyMatrix4(fac.root.matrixWorld));
  if (!chim.length) {
    const w = fb.max.x - fb.min.x;
    for (const k of [0.25, 0.5, 0.8]) chim.push(new THREE.Vector3(fb.min.x + w * k, fb.max.y, (fb.min.z + fb.max.z) / 2));
  }
  let sAcc = 0;
  A.onUpdate((dt) => {
    sAcc += dt;
    if (sAcc < 0.22) return;
    sAcc = 0;
    for (const c of chim) fx.smoke(c, { count: 1, scale: 1.8, color: pick([0xb07650, 0xc8a080, 0xe8d0b8]), rise: 1.4 });
  }, 46, -16, 36);
  const sign = textPanel([{ text: 'CHOCOLATE FACTORY', size: 0.32, color: '#ffd23f' }], { w: 6, h: 0.6, bg: '#5a3220', border: '#ffd23f' });
  sign.position.set(46, fb.max.y + 0.6, fb.max.z - 0.6);
  A.scene.add(sign);

  conveyor(A, 39, 52, -2.6);
  // giant candy
  for (const [x, z, c] of [[25, -18, 0], [27.5, 6, 1], [55, 6.5, 0], [55.5, -9, 1], [39.5, 6, 0], [24.5, 2, 1]]) candyCane(A, x, z, c);
  for (const [x, z, col] of [[29.5, -15, 0xff4fa3], [52.5, 3.5, 0x29b6f6], [38.5, -19, 0xffd23f], [25.5, -11, 0x7cff3a]]) lollipop(A, x, z, col);
  for (const [x, z, k] of [[29, -1.5, 'donut'], [50, -1.5, 'chocoBar'], [40.5, 0, 'cake']]) {
    A.put('makeFood', [k], { x, z, zone: Z, collide: { r: 0.9 }, fit: { h: 1.8, clamp: 1.6 }, rot: rand(-0.4, 0.4) });
  }
  for (const [x, z] of [[24, -2], [56, -19], [56, 0]]) gumdrops(A, x, z);
  A.npc('stocker', {
    id: 'chocoChuck', name: 'Choco Chuck', pos: [43, -2], wander: 2.5, react: 'wave',
    override: { shirt: 0x7d4a2d, accent: 0xffd23f, hat: { type: 'chef' }, hair: { style: 'short', color: 0x3a2618 } },
    lines: ['Mind the chocolate river!', 'Everything here is edible. Except the bridges.', 'Feastables, fresh off the line!'],
    onTalk: async (n) => {
      await A.line(n, pick([
        'Welcome to the *Chocolate Factory*! Do NOT swim in the river. We checked: it is too thick.',
        'Every bar on that conveyor goes straight to the Beast Mart shelves. Well, most of them.',
        'Legend says one bar in Beast Mart is made of *pure gold*. I made it. Do not tell anyone.',
      ]), { expr: ['happy', 'grin'] });
    },
  });
}

function conveyor(A, x0, x1, z) {
  const len = x1 - x0;
  const belt = new THREE.Mesh(new THREE.BoxGeometry(len, 0.5, 1), new THREE.MeshLambertMaterial({ color: 0x2a2a30 }));
  belt.position.set((x0 + x1) / 2, 0.25, z);
  belt.castShadow = true;
  A.addStatic(belt, Z);
  const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.12, 0.12), new THREE.MeshLambertMaterial({ color: 0xffd23f }));
  rail.position.set((x0 + x1) / 2, 0.55, z + 0.5);
  A.addStatic(rail, Z);
  A.world.box(x0, z - 0.5, x1, z + 0.5);
  const barGeo = cachedGeometry('arena:beltBar', () => {
    const g = new VoxGrid();
    g.box(-4, 0, -2, 3, 1, 1, 0x6a3a22);
    g.box(-2, 0, -2, 3, 1, 1, 0x1d9bf0);
    g.box(-1, 2, -1, 2, 2, 0, 0xffffff);
    return g;
  }, { scale: 0.08 });
  const bars = [];
  const n = 9;
  for (let i = 0; i < n; i++) {
    const m = makeMesh(barGeo);
    m.castShadow = false;
    A.scene.add(m);
    bars.push(m);
  }
  let t = 0;
  A.onUpdate((dt) => {
    t += dt * 1.2;
    bars.forEach((m, i) => {
      const u = ((t + (i * len) / n) % len) / len;
      m.position.set(x0 + u * len, 0.5, z);
      m.scale.setScalar(u < 0.05 ? u / 0.05 : u > 0.95 ? (1 - u) / 0.05 : 1);
    });
  }, (x0 + x1) / 2, z, 30);
  const proxy = pickProxy(1, 1);
  proxy.position.set((x0 + x1) / 2, 0, z);
  A.scene.add(proxy);
  A.interact({
    id: 'conveyor', pos: new THREE.Vector3((x0 + x1) / 2, 0, z + 1.3), range: 1.5, label: 'SNACK', icon: 'calorie', color: 'orange', hit: proxy,
    act: () => {
      const pl = A.player;
      pl.chibi.play('holdUp', { dur: 1.2, then: 'idle' });
      pl.chibi.expr('happy', 'chew', 1.2);
      audio.play('chomp');
      fx.chocolate(_v.set(pl.pos.x, 1.6, pl.pos.z), { count: 10, speed: 2.5 });
      speech(pl.chibi, pick(['Quality control!', 'Mmm... research.', 'Just one. Okay two.']), 1.4);
    },
  });
}

function candyCane(A, x, z, v) {
  const geo = cachedGeometry('arena:cane' + v, () => {
    const g = new VoxGrid();
    const stripe = (y) => ((y >> 1) % 2 ? 0xffffff : v ? 0x5fdc4a : 0xe8343c);
    for (let y = 0; y < 22; y++) g.box(-1, y, -1, 0, y, 0, stripe(y));
    for (let a = 0; a <= 12; a++) {
      const t = (a / 12) * Math.PI;
      const xx = Math.round(-Math.cos(t) * 4) + 4, yy = 22 + Math.round(Math.sin(t) * 4);
      g.box(xx - 1, yy - 1, -1, xx, yy, 0, stripe(a * 2));
    }
    return g;
  }, { scale: 0.13 });
  const m = makeMesh(geo);
  m.position.set(x, 0, z);
  m.rotation.y = rand(0, Math.PI * 2);
  A.addStatic(m, Z);
  A.world.circle(x, z, 0.25);
}

function lollipop(A, x, z, col) {
  const geo = cachedGeometry('arena:lolli' + col, () => {
    const g = new VoxGrid();
    g.box(0, 0, 0, 0, 16, 0, 0xffffff);
    for (let yy = -6; yy <= 6; yy++) for (let xx = -6; xx <= 6; xx++) {
      const r = Math.hypot(xx, yy);
      if (r > 6.4) continue;
      const a = Math.atan2(yy, xx);
      g.set(xx, 22 + yy, 0, Math.sin(a * 2 + r * 0.9) > 0 ? col : 0xffffff);
    }
    return g;
  }, { scale: 0.13 });
  const m = makeMesh(geo);
  m.position.set(x, 0, z);
  A.scene.add(m);
  A.world.circle(x, z, 0.2);
  let t = rand(0, 6);
  A.onUpdate((dt) => {
    t += dt;
    m.rotation.y = Math.sin(t * 0.7) * 0.6;
  }, x, z, 28);
}

function gumdrops(A, x, z) {
  const geo = cachedGeometry('arena:gumdrops', () => {
    const g = new VoxGrid();
    const cols = [0xff4fa3, 0x7cff3a, 0xffd23f, 0x29b6f6, 0xb05cff];
    [[0, 0], [5, 2], [-4, 3], [2, -4]].forEach(([gx, gz], i) => {
      for (let y = 0; y < 5; y++) g.cylinder(gx, gz, y, y, 2.6 - y * 0.45, cols[i % cols.length]);
    });
    return g;
  }, { scale: 0.12 });
  const m = makeMesh(geo);
  m.position.set(x, 0, z);
  A.addStatic(m, Z);
  A.world.circle(x, z, 0.6);
}

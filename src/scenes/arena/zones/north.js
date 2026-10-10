// Techno Tower (Mega Mech Prime) and Atomic Reactor (Beast Tiger Unleashed) zones.
import * as THREE from 'three';
import { VoxGrid, makeMesh, cachedGeometry } from '../../../core/voxel.js';
import { fx } from '../../../core/particles.js';
import { audio } from '../../../core/audio.js';
import { rand, pick } from '../../../core/util.js';
import { speech } from '../../../ui/ui.js';
import { state } from '../../../game/state.js';
import { createSwarm } from '../../../models/swarmModels.js';
import { textPanel, pickProxy } from '../kit.js';
import { placeBossGate } from '../gates.js';

const _v = new THREE.Vector3();

// ---------------------------------------------------------------------------
// TECHNO TOWER

export function buildTechno(A) {
  const T = A.terrain;
  const Z = 'techno';
  T.rect(-14, -60, 14, -30, 'metal', { onlyLand: true, filter: (x, z, c) => T.h[c] <= 0.05 });
  T.rect(-1.5, -46, 1.5, -30, 'metalDark');
  T.rect(-12, -40.5, 12, -38.5, 'metalDark');
  T.circle(0, -49, 6.5, 'metalDark');
  // glowing seams
  const seamMat = new THREE.MeshBasicMaterial({ color: 0x5ce1e6 });
  for (let x = -12; x <= 12; x += 6) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, 26), seamMat);
    s.position.set(x, 0.01, -45);
    s.castShadow = false;
    A.addStatic(s, Z);
  }
  for (let z = -56; z <= -32; z += 6) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(26, 0.02, 0.08), seamMat);
    s.position.set(0, 0.01, z);
    s.castShadow = false;
    A.addStatic(s, Z);
  }
  const tower = A.put('makeTechnoTower', [], { x: 0, z: -50, zone: Z, fit: { h: 17, clamp: 1.3 } });
  // rotating holo ring around the tower
  const ringGeo = cachedGeometry('arena:holoRing', () => {
    const g = new VoxGrid();
    for (let a = 0; a < 90; a++) {
      const t = (a / 90) * Math.PI * 2;
      if (a % 9 < 6) g.set(Math.round(Math.cos(t) * 26), 0, Math.round(Math.sin(t) * 26), 0x5ce1e6, true);
    }
    return g;
  }, { scale: 0.15, pivot: 'center' });
  const rings = [];
  for (const [y, s] of [[6, 1], [11, 0.8], [15.5, 0.6]]) {
    const r = makeMesh(ringGeo);
    r.castShadow = false;
    r.position.set(0, y, -50);
    r.scale.setScalar(s);
    A.scene.add(r);
    rings.push(r);
  }
  A.onUpdate((dt, t) => {
    rings.forEach((r, i) => {
      r.rotation.y += dt * (i % 2 ? -0.8 : 0.6);
      r.position.y += Math.sin(t * 1.5 + i) * 0.004;
    });
  }, 0, -50, 40);
  // drones
  const droneGeo = cachedGeometry('arena:drone', () => {
    const g = new VoxGrid();
    g.box(-2, 0, -2, 1, 1, 1, 0x3a4458);
    g.box(-1, -1, -1, 0, -1, 0, 0xff2e88, true);
    for (const [x, z] of [[-4, -4], [3, -4], [-4, 3], [3, 3]]) g.box(x, 1, z, x, 1, z, 0x9aa2b4).box(x - 1, 2, z, x + 1, 2, z, 0x5ce1e6, true);
    g.line(-3, 1, -3, 2, 1, 2, 0x5d6476);
    g.line(-3, 1, 2, 2, 1, -3, 0x5d6476);
    return g;
  }, { scale: 0.1, pivot: 'center' });
  for (let i = 0; i < 4; i++) {
    const d = makeMesh(droneGeo);
    A.scene.add(d);
    const r = 6 + i * 1.6, sp = 0.4 + i * 0.12, y = 3 + i * 0.9, ph = i * 1.7;
    A.onUpdate((dt, t) => {
      const a = t * sp + ph;
      d.position.set(Math.cos(a) * r, y + Math.sin(t * 2 + i) * 0.3, -46 + Math.sin(a) * r * 0.6);
      d.rotation.y = -a;
      if (Math.random() < dt * 0.6) fx.sparkle(d.position, { count: 1, color: 0x5ce1e6, speed: 0.3 });
    }, 0, -46, 34);
  }
  // server racks with blinking LEDs
  const rackGeo = cachedGeometry('arena:rack', () => {
    const g = new VoxGrid();
    g.box(-4, 0, -3, 3, 20, 2, 0x232a3a);
    for (let y = 2; y < 19; y += 2) for (let x = -3; x <= 2; x += 1) if ((x * 7 + y * 3) % 5 < 2) g.set(x, y, 3, [0x7cff3a, 0x5ce1e6, 0xff2e88][(x + y + 9) % 3], true);
    return g;
  }, { scale: 0.1 });
  const racks = [];
  for (const [x, z] of [[-11, -44], [-9.8, -44], [-8.6, -44], [8.6, -44], [9.8, -44], [11, -44], [-11, -54], [-9.8, -54], [9.8, -54], [11, -54]]) {
    const r = makeMesh(rackGeo);
    r.position.set(x, 0, z);
    A.scene.add(r);
    racks.push(r);
    A.world.box(x - 0.42, z - 0.32, x + 0.42, z + 0.3);
  }
  // holo panels
  const holo = [];
  for (const [x, z, txt] of [[-7, -36, 'SYSTEM ONLINE'], [6.5, -55.5, 'MEGA MECH: ARMED'], [-7, -56, 'BEEP BOOP']]) {
    const p = textPanel([{ text: txt, size: 0.2, color: '#9ff2ff' }], { w: 2.6, h: 0.5, bg: '#0d3a4a', border: '#5ce1e6' });
    p.material.transparent = true;
    p.material.opacity = 0.8;
    p.position.set(x, 1.8, z);
    A.scene.add(p);
    holo.push(p);
  }
  A.onUpdate((dt, t) => {
    holo.forEach((p, i) => {
      p.material.opacity = Math.random() < 0.02 ? 0.2 : 0.75 + Math.sin(t * 3 + i) * 0.1;
      p.position.y = 1.8 + Math.sin(t * 1.4 + i) * 0.08;
    });
  }, 0, -46, 30);
  // satellite dish
  const dishGeo = cachedGeometry('arena:dish', () => {
    const g = new VoxGrid();
    for (let y = 0; y < 7; y++) g.cylinder(0, 0, y, y, 2 + y * 1.4, 0xdfe4ec);
    g.cylinder(0, 0, 1, 6, 1.2 + 1 * 1.4, null);
    g.box(0, 0, 0, 0, 12, 0, 0x9aa2b4);
    g.box(-1, 12, -1, 1, 13, 1, 0xff2e88, true);
    return g;
  }, { scale: 0.15 });
  const dish = makeMesh(dishGeo);
  dish.position.set(-9, 1.6, -49);
  dish.rotation.x = -0.8;
  const dishBase = new THREE.Group();
  dishBase.position.set(-9, 0, -49);
  A.scene.add(dish);
  A.world.circle(-9, -49, 1.2);
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.6, 0.3), new THREE.MeshLambertMaterial({ color: 0x5d6476 }));
  post.position.set(-9, 0.8, -49);
  A.addStatic(post, Z);
  A.onUpdate((dt, t) => {
    dish.rotation.y = Math.sin(t * 0.3) * 1.2;
  }, -9, -49, 30);
  placeBossGate(A, 'megaMech', 8.5, -37.5, Z);
  A.npc('labTech', {
    id: 'techTess', name: 'Tech Tess', pos: [-4, -35], wander: 2.5, react: 'wave',
    override: { shirt: 0x5ce1e6, coat: 0x2a3348, hair: { style: 'bob', color: 0xff2e88 } },
    lines: ['Mega Mech Prime runs on 9,000 batteries.', 'Do not unplug anything. Anything!', 'The drones are friendly. Mostly.'],
    onTalk: async (n) => {
      await A.line(n, pick([
        'Welcome to *Techno Tower*! Every Techno Terror Swarm was born on these servers.',
        '*Mega Mech Prime* is guarding the skull gate. Bring your strongest deck... and spare batteries.',
        'I tried to turn the tower off and on again. It turned *me* off and on again.',
      ]));
    },
  });
  for (const [x, z] of [[-12.5, -32], [12.5, -32]]) A.put('makeLamp', [], { x, z, zone: Z, collide: { r: 0.22 }, fit: { h: 2.8, clamp: 1.5 } });
}

// ---------------------------------------------------------------------------
// ATOMIC REACTOR

export function buildReactor(A) {
  const T = A.terrain;
  const Z = 'reactor';
  T.rect(22, -60, 58, -26, 'toxic', { onlyLand: true, filter: (x, z, c) => T.h[c] <= 0.05 });
  T.rect(22, -37.5, 46, -34.5, 'metalDark');
  T.rect(33, -42, 36, -34.5, 'metalDark');
  T.rect(38, -55, 55, -40, 'hazard', { filter: (x, z) => x < 38.8 || x > 54.2 || z < -54.2 || z > -40.8 });
  T.rect(38.8, -54.2, 54.2, -40.8, 'metalDark');
  // goo puddles
  for (const [x, z, r] of [[28, -48, 2.2], [50, -31, 1.8], [30, -29, 1.3]]) {
    T.circle(x, z, r + 0.6, 'dirt');
    T.circle(x, z, r, 'pondBed', { h: -0.6 });
    A.liquid(x, z, r * 2 + 1, r * 2 + 1, 'goo', -0.25, { opacity: 0.92, texel: 1.5, flow: [0.05, 0.03], glow: 0x2a8a10, range: 30 });
  }
  const reactor = A.put('makeReactor', [], { x: 46.5, z: -48, zone: Z, fit: { h: 10, clamp: 1.3 } });
  const rb = A.bbox(reactor.root);
  const ventsW = (reactor.root.userData.vents ?? []).map((v) => v.clone().applyMatrix4(reactor.root.matrixWorld));
  const rw = rb.max.x - rb.min.x;
  const vents = [new THREE.Vector3(rb.min.x + rw * 0.25, rb.max.y, (rb.min.z + rb.max.z) / 2), new THREE.Vector3(rb.min.x + rw * 0.72, rb.max.y * 0.85, (rb.min.z + rb.max.z) / 2)];
  let acc = 0;
  A.onUpdate((dt) => {
    acc += dt;
    if (acc < 0.12) return;
    acc = 0;
    for (const v of ventsW.length ? ventsW : vents) {
      fx.smoke(v, { count: 1, color: pick([0xb6ff7a, 0x9ae86a, 0xd8ffc0]), scale: 2.4, rise: 1.6, radius: 1.5, life: 1.6 });
      fx.rise(v, { count: 1, color: 0x7cff3a, radius: 0.8 });
    }
  }, 46, -48, 38);
  // toxic barrels
  const barrels = [[37, -40], [37.8, -39.2], [36.5, -38.6], [55, -38], [54.2, -37.2], [25, -54], [25.9, -54.6], [44, -30], [56, -56]];
  barrels.forEach(([x, z], i) => A.put('makeBarrel', ['toxic'], { x, z, rot: i, zone: Z, collide: { r: 0.36 }, fallback: true }));
  // geiger crackle near barrels
  A.onUpdate(() => {
    const p = A.player.pos;
    for (const [x, z] of barrels) {
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < 3 && Math.random() < 0.25 * (1 - d / 3)) audio.play('tick', { pitch: rand(0.4, 1.8), vol: 0.5, gap: 0.02 });
    }
  }, 40, -44, 24);
  // pipes
  const pipeMat = new THREE.MeshLambertMaterial({ color: 0x8a93a8 });
  for (const [x0, z0, x1, z1] of [[24, -44, 38, -44], [38, -58, 38, -44], [24, -44, 24, -58]]) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, len, 8), pipeMat);
    p.rotation.z = x1 !== x0 ? Math.PI / 2 : 0;
    p.rotation.x = z1 !== z0 ? Math.PI / 2 : 0;
    p.position.set((x0 + x1) / 2, 0.5, (z0 + z1) / 2);
    p.castShadow = true;
    A.addStatic(p, Z);
    A.world.box(Math.min(x0, x1) - 0.3, Math.min(z0, z1) - 0.3, Math.max(x0, x1) + 0.3, Math.max(z0, z1) + 0.3);
  }
  // hazard signs
  for (const [x, z] of [[37.6, -36.5], [53, -36.5]]) {
    const s = textPanel([{ text: '☢ DANGER', size: 0.2, color: '#0d1029' }, { text: 'do not lick', size: 0.13, color: '#0d1029' }], { w: 1.4, h: 0.62, bg: '#ffd23f', border: '#0d1029' });
    s.position.set(x, 1.3, z);
    A.scene.add(s);
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.1, 0.1), pipeMat);
    p.position.set(x, 0.5, z - 0.05);
    A.addStatic(p, Z);
    A.world.circle(x, z, 0.15);
  }
  tigerTank(A, 30, -51);
  placeBossGate(A, 'tigerUnleashed', 34.5, -42.5, Z);
  A.npc('labTech', {
    id: 'drGlow', name: 'Dr. Glow', pos: [29, -38.5], wander: 2, react: 'shocked',
    override: { coat: 0xffd23f, shirt: 0x2a2a30, hat: { type: 'goggles' }, hair: { style: 'spiky', color: 0x7cff3a } },
    lines: ['I glow in the dark now. It is fine.', 'Do NOT tap the tiger tank.', 'Reactor at 99%! That is good. I think.'],
    onTalk: async (n) => {
      await A.line(n, pick([
        "The *Beast Tiger* broke out of its tank once. Now it's in a bigger tank. Please don't tap the glass.",
        'Atomic Swarms are made right here. The green glow is a *feature*.',
        'Bring sunscreen. Radiation-proof sunscreen. SPF 9000.',
      ]), { expr: ['dizzy', 'grin'] });
    },
  });
}

function tigerTank(A, x, z) {
  const geo = cachedGeometry('arena:tank', () => {
    const g = new VoxGrid();
    g.cylinder(0, 0, 0, 2, 13, 0x5d6476);
    g.cylinder(0, 0, 26, 28, 13, 0x5d6476);
    g.box(-1, 29, -1, 1, 31, 1, 0x7cff3a, true);
    return g;
  }, { scale: 0.1 });
  const base = makeMesh(geo);
  base.position.set(x, 0, z);
  A.addStatic(base, 'reactor');
  const glass = new THREE.Mesh(
    new THREE.CylinderGeometry(1.25, 1.25, 2.3, 16, 1, true),
    new THREE.MeshLambertMaterial({ color: 0x7cff3a, transparent: true, opacity: 0.32, emissive: 0x1a5a10, side: THREE.DoubleSide, depthWrite: false }),
  );
  glass.position.set(x, 1.45, z);
  A.scene.add(glass);
  let tiger = null;
  try {
    tiger = createSwarm('beastTiger', { scale: 1.1 });
    tiger.root.position.set(x, 0.3, z);
    tiger.root.rotation.y = 0.3;
    A.scene.add(tiger.root);
  } catch (e) {
    tiger = null;
  }
  A.world.circle(x, z, 1.35);
  let taps = 0, rage = 0;
  A.onUpdate((dt, t) => {
    if (tiger) {
      tiger.update(dt);
      tiger.root.position.y = 0.35 + Math.sin(t * 1.3) * 0.12;
      tiger.root.rotation.y += dt * (rage > 0 ? 4 : 0.2);
    }
    rage = Math.max(0, rage - dt);
    if (Math.random() < dt * 3) fx.bubbles(_v.set(x + rand(-0.8, 0.8), 0.4, z + rand(-0.8, 0.8)), { count: 1, color: 0xb6ff7a, speed: 1 });
  }, x, z, 26);
  const proxy = pickProxy(1.3, 2.8);
  proxy.position.set(x, 0, z);
  A.scene.add(proxy);
  A.interact({
    id: 'tigerTank', pos: new THREE.Vector3(x, 0, z + 1.9), range: 1.5, label: 'TAP', icon: 'hp', color: 'orange', hit: proxy, ringR: 0.8,
    act: () => {
      taps++;
      rage = 0.8;
      const pl = A.player;
      pl.chibi.play('flick');
      audio.play('tick', { pitch: 1.6 });
      audio.play(taps % 2 ? 'growl' : 'roar', { pitch: 1.1, vol: 0.6 });
      tiger?.attack?.(0.4);
      tiger?.boing?.();
      A.engineShake(0.12 + taps * 0.03);
      fx.bubbles(_v.set(x, 1.2, z), { count: 12, color: 0xb6ff7a });
      if (taps === 5) {
        if (!A.secret('tigerTaps', _v.set(x, 2.2, z))) speech(pl.chibi, 'It REALLY does not like that.', 1.6);
      } else speech(pl.chibi, pick(['*tap tap*', 'Here kitty kitty...', 'Is it looking at me?', 'Sorry! Sorry!']), 1.2);
    },
  });
  const sign = textPanel([{ text: 'DO NOT TAP', size: 0.2, color: '#ffffff' }], { w: 1.5, h: 0.36, bg: '#b8282f' });
  sign.position.set(x, 3.25, z + 0.9);
  A.scene.add(sign);
}

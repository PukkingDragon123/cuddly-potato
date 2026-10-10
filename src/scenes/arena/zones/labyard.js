// Beast Lab Yard: spawn plaza, Lab entrance, Ranked Battle Gate, practice range,
// swarm hologram, pier, and the hidden Golden Panther cove.
import * as THREE from 'three';
import { VoxGrid, makeMesh, cachedGeometry } from '../../../core/voxel.js';
import { fx } from '../../../core/particles.js';
import { audio } from '../../../core/audio.js';
import { rand, pick } from '../../../core/util.js';
import { speech, floatText } from '../../../ui/ui.js';
import { state } from '../../../game/state.js';
import { currentArena } from '../../../data/arena.js';
import { createSwarm } from '../../../models/swarmModels.js';
import { PORTAL_POS, PRACTICE_POS } from '../layout.js';
import { textPanel, pickProxy, bboxSize } from '../kit.js';
import { openMatchmaking, openPractice } from '../modals.js';

const _v = new THREE.Vector3();

export const FAN_LINES = [
  'OMG it\'s {name}!!', 'Can I get an autograph?!', "I'm your biggest fan!", 'Subscribed AND hit the bell!', "LET'S GOOO!",
  'Is that a real lab coat?!', "I've watched every battle. Twice.", 'Can you say hi to my mom?',
];
export const FAN_COLORS = [
  { shirt: 0x29b6f6, hat: { type: 'beanie', color: 0xff2e88 } },
  { shirt: 0xff2e88, hat: { type: 'cap', color: 0x29b6f6 }, hair: { style: 'bob', color: 0x6b4428 } },
  { shirt: 0xffd23f, hat: { type: 'cap', color: 0xff4a4a }, skin: 0xb07a52, hair: { style: 'buzz', color: 0x1a1010 } },
  { shirt: 0x5fdc4a, hat: { type: 'headband', color: 0xff8a2a }, hair: { style: 'ponytail', color: 0xffd23f } },
  { shirt: 0xb05cff, hat: { type: 'beanie', color: 0xffd23f }, skin: 0xc98d62 },
];

export function spawnFan(A, x, z, i, wander = 6) {
  return A.npc('fan', {
    id: 'fan' + i + '_' + Math.round(x),
    pos: [x, z],
    override: FAN_COLORS[i % FAN_COLORS.length],
    wander,
    speed: 1.7,
    react: 'cheer',
    greet: FAN_LINES,
    lines: ['*hums the Beast theme*', 'Where is the Golden Panther statue?', 'I heard the Subscribe button does something...', 'Carts at Beast Mart go SO fast'],
  });
}

export function buildLabYard(A) {
  const T = A.terrain;
  const Z = 'labYard';
  T.rect(-16, 16, 16, 56, 'lawn', { onlyLand: true });
  // plaza
  T.circle(0, 38, 9.4, 'plazaBlue');
  T.circle(0, 38, 8.6, 'plaza');
  T.circle(0, 38, 2.1, 'plazaPink');
  T.rect(-6.5, 27.5, 6.5, 30, 'plaza');
  T.rect(-7.5, 26.5, -5.2, 28, 'flowerbed');
  T.rect(5.2, 26.5, 7.5, 28, 'flowerbed');
  // pier
  T.rect(-1.25, 52, 1.25, 66, 'bridge', { h: 0.08 });
  T.rect(-3.5, 62.5, 3.5, 66, 'bridge', { h: 0.08 });

  // ---- Beast Lab building
  const lab = A.put('makeLabBuilding', [{ style: 'default' }], { x: 0, z: 23.2, zone: Z, fit: { w: 11, clamp: 1.25 } });
  lab.root.updateMatrixWorld(true);
  const lb = new THREE.Box3().setFromObject(lab.root);
  const doorZ = lb.max.z + 0.35;
  const doorProxy = pickProxy(2.2, 4);
  doorProxy.position.set(0, 0, lb.max.z - 1);
  A.scene.add(doorProxy);
  A.interact({ id: 'labDoor', pos: new THREE.Vector3(0, 0, doorZ + 0.4), range: 1.9, label: 'LAB', icon: 'flask', color: 'blue', hit: doorProxy, act: () => A.goLab() });
  A.interact({ id: 'labDoorAuto', pos: new THREE.Vector3(0, 0, doorZ), range: 0.75, auto: 'only', hidden: true, act: () => A.goLab() });
  const labSign = textPanel([{ text: 'BEAST LAB', size: 0.42, color: '#ffffff' }], { w: 3.6, h: 0.62, bg: '#29b6f6', border: '#0d1029' });
  labSign.position.set(0, lb.max.y + 0.55, lb.max.z - 1.2);
  A.scene.add(labSign);
  for (const s of [-1, 1]) {
    A.put('makeBush', [s + 1], { x: s * 6.3, z: lb.max.z + 0.5, zone: Z, collide: { r: 0.45 }, fit: { h: 0.9, clamp: 1.8 } });
    A.put('makeFlowers', [s + 2], { x: s * 6.3, z: 27.4, zone: Z, collide: false });
  }

  // ---- Ranked Battle Gate
  const [px, pz] = PORTAL_POS;
  A.put('makePortal', [0xb05cff], { x: px, z: pz, collide: false, dynamic: true, fit: { h: 4.6, clamp: 1.4 } });
  A.world.circle(px - 2.1, pz, 0.45);
  A.world.circle(px + 2.1, pz, 0.45);
  const arena = currentArena(state.p.trophies);
  const rs = textPanel(
    [{ text: 'RANKED BATTLE', size: 0.3, color: '#ffffff', icon: 'trophy' }, { text: arena.name.toUpperCase(), size: 0.17, color: '#ffd23f' }],
    { w: 3.8, h: 0.95, bg: '#7a2fd0', border: '#0d1029' },
  );
  rs.position.set(px, 5.15, pz + 0.25);
  A.scene.add(rs);
  const portalProxy = pickProxy(2, 4.4);
  portalProxy.position.set(px, 0, pz);
  A.scene.add(portalProxy);
  A.interact({ id: 'ranked', pos: new THREE.Vector3(px, 0, pz + 1.3), range: 2.3, label: 'RANKED', icon: 'sword', color: 'pink', hit: portalProxy, ringR: 1.5, act: () => openMatchmaking(A) });
  A.interact({ id: 'rankedAuto', pos: new THREE.Vector3(px, 0, pz + 0.15), range: 0.9, auto: 'only', hidden: true, act: () => openMatchmaking(A) });
  T.circle(px, pz + 1.6, 2.6, 'plazaBlue');
  let acc = 0;
  A.onUpdate((dt) => {
    acc += dt;
    if (acc > 0.12) {
      acc = 0;
      const a = Math.random() * Math.PI;
      fx.sparkle(_v.set(px + Math.cos(a) * 2, 2.1 + Math.sin(a) * 2, pz + 0.3), { count: 1, colors: [0xb05cff, 0xff2e88, 0xffffff], speed: 0.8, life: 0.9 });
    }
  }, px, pz, 24);
  A.poi({ x: px, z: pz, color: '#b05cff', size: 4 });

  // ---- Practice range
  practiceRange(A, PRACTICE_POS[0], PRACTICE_POS[1]);

  // ---- Swarm hologram in the plaza centre
  hologram(A, 0, 38);

  // ---- Lamps & benches around the plaza
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
    const x = Math.cos(a) * 10.4, z = 38 + Math.sin(a) * 10.4;
    if (Math.abs(x) < 3.2 && z < 38) continue;
    if (Math.hypot(x - px, z - pz) < 3.6 || Math.hypot(x - PRACTICE_POS[0], z - PRACTICE_POS[1]) < 4.2) continue;
    if (Math.hypot(Math.abs(x) - 4.5, z - 46.4) < 2.2) continue;
    A.put('makeLamp', [], { x, z, zone: Z, collide: { r: 0.22 }, fit: { h: 2.8, clamp: 1.5 } });
  }
  A.put('makeBench', [], { x: -4.5, z: 46.4, zone: Z, rot: Math.PI, fit: { w: 1.7, clamp: 1.6 } });
  A.put('makeBench', [], { x: 4.5, z: 46.4, zone: Z, rot: Math.PI, fit: { w: 1.7, clamp: 1.6 } });
  for (const [x, z] of [[-4.5, 46.4], [4.5, 46.4]]) {
    A.interact({
      id: 'bench' + x, pos: new THREE.Vector3(x, 0, z - 0.6), range: 1.2, label: 'SIT', icon: 'clock', color: 'green',
      act: () => {
        const pl = A.player;
        pl.place(x, z - 0.15);
        pl.facing = Math.PI * 0;
        pl.root.rotation.y = 0;
        pl.sitting = true;
        audio.play('thud', { vol: 0.4 });
      },
    });
  }
  // trees around the yard edges
  const trees = [[-14, 20], [-13, 26], [14, 20], [13.5, 26], [-14.5, 44], [14.5, 46], [11, 51], [15, 33.8], [-7, 54], [7, 54.5]];
  trees.forEach(([x, z], i) => A.put('makeTree', [i % 4 === 0 ? 'pine' : 'round', i], { x, z, zone: Z, rot: i, collide: { r: 0.4 }, fit: { h: 3.6, clamp: 1.6 } }));
  for (const [x, z] of [[-12.5, 38.5], [12.5, 30], [-3, 50], [9, 49]]) A.put('makeFlowers', [Math.round(x)], { x, z, zone: Z, collide: false });
  // pier end
  A.put('makeLamp', [], { x: -3, z: 65.5, zone: Z, collide: { r: 0.2 }, fit: { h: 2.8, clamp: 1.5 } });
  A.put('makeLamp', [], { x: 3, z: 65.5, zone: Z, collide: { r: 0.2 }, fit: { h: 2.8, clamp: 1.5 } });
  A.put('makeCrate', [], { x: 2.6, z: 63.3, zone: Z, collide: { r: 0.4 }, fit: { h: 0.8, clamp: 1.6 } });
  A.put('makeBarrel', ['wood'], { x: -2.7, z: 63.3, zone: Z, collide: { r: 0.4 }, fit: { h: 1, clamp: 1.6 } });

  // ---- Lab tech NPC by the door
  A.npc('labTech', {
    pos: [-4.2, 30.6], facing: 0.5, wander: 1.5, react: 'wave',
    lines: ['Lab is open 24/7. Like Jimmy.', 'Did someone feed the slime?', 'Ranked Gate is the purple swirl!'],
    onTalk: async (n) => {
      const r = await A.line(n, 'Need to tweak your deck or open Vials? The *Lab* is right behind me!', { choices: ['Enter Lab', 'Later'] });
      if (r === 0) A.goLab();
    },
  });
  // ---- Fans
  spawnFan(A, -5, 42, 0, 5);
  spawnFan(A, 6, 35, 1, 5);
  spawnFan(A, 3, 50, 2, 4);

  // ---- Golden Panther cove (hidden behind rocks in the south-west corner)
  goldenCove(A, -12.8, 52.2);
}

// ---------------------------------------------------------------------------

function practiceRange(A, x, z) {
  const T = A.terrain;
  T.rect(x - 4.5, z - 2.8, x + 4.5, z + 2.2, 'dirt');
  const sign = textPanel([{ text: 'PRACTICE', size: 0.32, color: '#ffffff' }, { text: 'no trophies lost', size: 0.15, color: '#c8ffb8' }], { w: 2.4, h: 0.9, bg: '#2f9e2f', border: '#0d1029' });
  const post = A.put('makeSignpost', [0x5fdc4a], { x: x + 3.4, z: z - 2.2, zone: 'labYard', collide: { r: 0.25 }, fit: { h: 1.7, clamp: 1.6 } });
  sign.position.set(x + 3.4, 2.4, z - 2.0);
  A.scene.add(sign);
  const signProxy = pickProxy(0.9, 3);
  signProxy.position.set(x + 3.4, 0, z - 2.2);
  A.scene.add(signProxy);
  A.interact({ id: 'practice', pos: new THREE.Vector3(x + 3.4, 0, z - 0.9), range: 1.7, label: 'PRACTICE', icon: 'sword', color: 'green', act: () => openPractice(A), hit: signProxy });
  const geo = cachedGeometry('arena:dummy', () => {
    const g = new VoxGrid();
    g.box(0, 0, 0, 0, 6, 0, 0x7a5a3a);
    g.ellipsoid(0, 10, 0, 3, 4, 2.5, 0xd8b87a);
    g.paint((xx, y, zz, c) => (c === 0xd8b87a && (y === 8 || y === 12) ? 0xb89a5a : undefined));
    g.box(-6, 11, 0, 6, 11, 0, 0x7a5a3a);
    g.sphere(0, 16, 0, 2.5, 0xd8b87a);
    g.box(-1, 15, 3, 1, 17, 3, 0xff4a4a);
    g.set(0, 16, 3, 0xffffff);
    return g;
  }, { scale: 0.11 });
  [-2.2, 0, 2.2].forEach((dx, i) => {
    const m = makeMesh(geo);
    const dxp = x + dx - 1, dzp = z + (i === 1 ? 0.6 : 0);
    m.position.set(dxp, 0, dzp);
    m.rotation.y = rand(-0.3, 0.3);
    A.scene.add(m);
    const st = { wob: 0, wv: 0, ax: 1, hits: 0 };
    const hit = (dirX, dirZ, power = 1) => {
      st.wv += 9 * power;
      st.ax = Math.atan2(dirX, dirZ);
      const dmg = Math.round(rand(8, 30) * power);
      const crit = Math.random() < 0.18;
      floatText(_v.set(dxp, 2.1, dzp), crit ? `${dmg * 3}!` : `${dmg}`, crit ? 'crit' : 'dmg');
      audio.play(crit ? 'hitHeavy' : 'hit', { pitch: rand(0.9, 1.2) });
      fx.burst(_v.set(dxp, 1.2, dzp), { count: crit ? 12 : 6, colors: [0xd8b87a, 0xf6e6b0, 0xb89a5a], speed: 3, size: 0.08, ground: 0 });
      if (crit) A.engineShake(0.15);
    };
    let last = 0;
    A.world.circle(dxp, dzp, 0.42, {
      onBump: (ct, who) => {
        const now = performance.now();
        if (who !== A.player || now - last < 450 || A.player.speed < 1.5) return;
        last = now;
        hit(-ct.nx, -ct.nz, A.player.speed / 5);
      },
    });
    const proxy = pickProxy(0.6, 2);
    proxy.position.set(dxp, 0, dzp);
    A.scene.add(proxy);
    A.interact({
      id: 'dummy' + i, pos: new THREE.Vector3(dxp, 0, dzp), range: 1.5, label: 'PUNCH', icon: 'sword', color: 'orange', hit: proxy, ringR: 0.7,
      act: () => {
        const pl = A.player;
        pl.chibi.play(pick(['kick', 'throw', 'flick']));
        setTimeout(() => hit(dxp - pl.pos.x, dzp - pl.pos.z, 1.3), 220);
      },
    });
    A.onUpdate((dt) => {
      st.wv += (-st.wob * 90 - st.wv * 5) * dt;
      st.wob += st.wv * dt;
      m.rotation.x = Math.cos(st.ax) * st.wob * 0.12;
      m.rotation.z = -Math.sin(st.ax) * st.wob * 0.12;
    }, dxp, dzp, 20);
  });
}

function hologram(A, x, z) {
  const geo = cachedGeometry('arena:holoPed', () => {
    const g = new VoxGrid();
    g.cylinder(0, 0, 0, 3, 9, 0xc8d2e0);
    g.cylinder(0, 0, 4, 4, 8, 0x29b6f6, 'y', true);
    g.cylinder(0, 0, 4, 4, 6, 0x7fe8ff, 'y', true);
    return g;
  }, { scale: 0.12 });
  const ped = makeMesh(geo);
  ped.position.set(x, 0, z);
  A.addStatic(ped, 'labYard');
  A.world.circle(x, z, 1.1);
  let rig = null;
  try {
    rig = createSwarm('panther', { scale: 1.4 });
    rig.root.position.set(x, 0.62, z);
    A.scene.add(rig.root);
  } catch (e) {
    rig = null;
  }
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.75, 0.95, 2.6, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x7fe8ff, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }),
  );
  beam.position.set(x, 1.9, z);
  A.scene.add(beam);
  let t = 0;
  A.onUpdate((dt) => {
    t += dt;
    if (rig) {
      rig.root.rotation.y += dt * 0.8;
      rig.root.position.y = 0.62 + Math.sin(t * 2) * 0.08;
      rig.update(dt);
    }
    beam.material.opacity = 0.14 + Math.sin(t * 5) * 0.04;
  }, x, z, 26);
  const proxy = pickProxy(1.2, 2.6);
  proxy.position.set(x, 0, z);
  A.scene.add(proxy);
  A.interact({
    id: 'holo', pos: new THREE.Vector3(x, 0, z + 1.6), range: 1.6, label: 'PET', icon: 'heart', color: 'pink', hit: proxy,
    act: () => {
      if (rig) {
        rig.boing?.();
        rig.attack?.(0.4);
      }
      audio.play('growl', { pitch: 1.3 });
      fx.sparkle(_v.set(x, 1.8, z), { count: 16, colors: [0x29b6f6, 0xffffff, 0xff2e88] });
      speech(A.player.chibi, pick(['Good kitty!', 'Who\'s a good Panther?', 'It purrs in binary.']), 1.6);
    },
  });
}

function goldenCove(A, cx, cz) {
  const T = A.terrain;
  // ring of rocks with a narrow gap facing north-east
  T.rect(cx - 4, cz - 4, cx + 4, cz + 4, (x, z) => {
    const d = Math.hypot(x - cx, z - cz);
    return d > 2.4 && d < 3.9 ? 'rock' : 'grass';
  }, { h: (x, z) => (Math.hypot(x - cx, z - cz) > 2.4 && Math.hypot(x - cx, z - cz) < 3.9 ? 1.4 + ((Math.floor(x) + Math.floor(z)) & 1) * 0.6 : 0), onlyLand: true, filter: (x, z) => Math.hypot(x - cx, z - cz) < 3.9 });
  // carve the entrance gap (towards +x/-z)
  T.line([[cx + 1.4, cz - 1.4], [cx + 4.2, cz - 4.2]], 1.6, 'grass', { h: 0 });
  const st = A.put('makeGoldenStatue', [], { x: cx - 0.3, z: cz + 0.3, rot: Math.PI * 0.75, zone: 'labYard', collide: { r: 0.7 }, fit: { h: 2.2, clamp: 1.4 } });
  const found = () => !!state.p.secrets?.goldPanther;
  let acc = 0;
  const sp = new THREE.Vector3(cx - 0.3, 1.6, cz + 0.3);
  A.onUpdate((dt) => {
    acc += dt;
    if (acc > (found() ? 0.6 : 0.25)) {
      acc = 0;
      fx.sparkle(sp, { count: 2, color: 0xfff27a, radius: 1.6, speed: 0.8 });
    }
  }, cx, cz, 18);
  A.interact({
    id: 'goldPanther', pos: new THREE.Vector3(cx - 0.3, 0, cz + 0.3), range: 2.1, auto: true, label: 'ADMIRE', icon: 'star', color: 'yellow',
    act: () => {
      if (!A.secret('goldPanther', sp)) speech(A.player.chibi, 'Still the shiniest thing on the island.', 1.8);
    },
  });
}

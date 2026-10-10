// Jimmy's Mansion: the mansion, golden fountain, hedges, helipad with a spinning
// helicopter, Jimmy (jokes + rematch) and the Jimmy Rematch boss gate.
import * as THREE from 'three';
import { VoxGrid, makeMesh, cachedGeometry, variantMaterials } from '../../../core/voxel.js';
import { fx } from '../../../core/particles.js';
import { audio } from '../../../core/audio.js';
import { rand, pick } from '../../../core/util.js';
import { speech } from '../../../ui/ui.js';
import { state } from '../../../game/state.js';
import { makeLiquid } from '../terrain.js';
import { textPanel, pickProxy } from '../kit.js';
import { placeBossGate } from '../gates.js';
import { openBossModal } from '../modals.js';

const _v = new THREE.Vector3();

const JOKES = [
  'Why did the Panther sit on the computer? To keep an eye on the *mouse*!',
  'I once gave away a whole island. Not this one though. I like this one.',
  'My fountain is filled with... water. I checked. Twice.',
  "What do you call a Swarm that tells jokes? A *pun-ther*!",
  'I tried to start a hot air balloon business. It never took off. So I bought a helicopter.',
  'Last one to leave this mansion wins... the mansion? Wait, that is a bad deal for me.',
  'Did you press the giant *Subscribe* button in the park? Press it TEN times. Trust me.',
  "Why don't toilets ever win battles? They always get *flushed*. Sorry, King Clog.",
];

export function buildMansion(A) {
  const T = A.terrain;
  const Z = 'mansion';
  T.rect(-58, -28, -22, 10, 'lawn', { onlyLand: true });
  T.rect(-38, -7.5, -22, -4.5, 'marble');
  T.rect(-42, -17, -39, -4, 'redcarpet');
  T.circle(-40.5, -6, 4.4, 'gold');
  T.circle(-40.5, -6, 3.6, 'marble');
  T.circle(-52, -4.5, 3.6, 'metalDark');
  T.rect(-53, -6, -52.4, -3, 'lineW');
  T.rect(-51.6, -6, -51, -3, 'lineW');
  T.rect(-52.4, -4.8, -51.6, -4.2, 'lineW');

  const m = A.put('makeMansion', [], { x: -40.5, z: -22, zone: Z, fit: { w: 17, clamp: 1.25 } });
  m.root.updateMatrixWorld(true);
  const mb = new THREE.Box3().setFromObject(m.root);
  fountain(A, -40.5, -6);
  helicopter(A, -52, -4.5);

  // hedges along the marble path and the drive
  for (let x = -36.5; x <= -24; x += 1.5) {
    A.put('makeBush', [Math.round(x)], { x, z: -8.6, zone: Z, collide: { r: 0.45 }, fit: { h: 0.9, clamp: 1.8 } });
    A.put('makeBush', [Math.round(x) + 1], { x, z: -3.4, zone: Z, collide: { r: 0.45 }, fit: { h: 0.9, clamp: 1.8 } });
  }
  for (const [x, z] of [[-44, -15], [-37, -15], [-44, -11], [-37, -11]]) A.put('makeTrophyPodium', [], { x, z, zone: Z, fit: { h: 2, clamp: 1.6 } });
  for (const [x, z] of [[-56, -26], [-56, -14], [-56, 4], [-46, 8], [-28, 8], [-24, -26], [-33, -26.5], [-49, -26.5]])
    A.put('makeTree', [Math.random() < 0.4 ? 'pine' : 'round', Math.round(x * z)], { x, z, zone: Z, rot: x, collide: { r: 0.4 }, fit: { h: 3.6, clamp: 1.6 } });
  for (const [x, z] of [[-44.5, -8], [-36.5, -2.5], [-47, 2], [-33, 4]]) A.put('makeFlowers', [Math.round(x)], { x, z, zone: Z, collide: false });
  for (const [x, z] of [[-38.2, -12], [-42.8, -12], [-26, -9], [-30, -9]]) A.put('makeLamp', [], { x, z, zone: Z, collide: { r: 0.22 }, fit: { h: 2.8, clamp: 1.5 } });
  moneyBags(A, -45.3, -16.3);
  moneyBags(A, -35.7, -16.3);
  goldCar(A, -30.5, 1.5);

  placeBossGate(A, 'jimmyRematch', -28, -20.5, Z);

  A.npc('jimmy', {
    pos: [-36, -3.2], facing: 0.3, wander: 2.4, react: 'wave',
    lines: ['Welcome to my humble mansion!', 'Has anyone seen my coffee mug?', 'Rematch? Any time!', 'Chandler, where is my helicopter?!'],
    greet: ['Hey {name}!', '{name}! My favourite scientist!'],
    onTalk: async (n) => {
      const beaten = !!state.p.bosses?.jimmyRematch;
      const r = await A.line(n, pick(JOKES), { choices: ['Haha!', beaten ? 'Rematch again!' : 'Rematch me!', 'Bye'], expr: ['happy', 'grin'] });
      if (r === 0) {
        n.chibi.play('cheer', { dur: 1.4, then: 'idle' });
        audio.play('cheer');
        A.player.emote('cheer', 1.4);
        await A.line(n, pick(['I knew you would like that one.', 'I have a million of these. Literally. I paid someone.', 'Comedy is my second passion. After giving stuff away.']));
      } else if (r === 1) {
        setTimeout(() => openBossModal(A, 'jimmyRematch'), 0);
      }
    },
  });
}

function fountain(A, x, z) {
  const geo = cachedGeometry('arena:fountain', () => {
    const g = new VoxGrid();
    g.cylinder(0, 0, 0, 5, 23, 0xf6f2ea);
    g.cylinder(0, 0, 3, 5, 21, null);
    g.cylinder(0, 0, 5, 5, 23, 0xffd23f);
    g.cylinder(0, 0, 5, 5, 21, null);
    g.cylinder(0, 0, 0, 16, 3, 0xf6f2ea);
    g.cylinder(0, 0, 14, 15, 9, 0xf6f2ea);
    g.cylinder(0, 0, 15, 15, 8, null);
    g.cylinder(0, 0, 16, 16, 9, 0xffd23f);
    g.cylinder(0, 0, 16, 16, 8, null);
    g.cylinder(0, 0, 16, 26, 2, 0xf6f2ea);
    // golden trophy on top
    g.box(-1, 27, -1, 0, 28, 0, 0xffd23f);
    g.box(-3, 29, -3, 2, 34, 2, 0xffd23f);
    g.box(-2, 31, -2, 1, 34, 1, null);
    g.box(-5, 31, -1, -4, 33, 0, 0xffd23f);
    g.box(3, 31, -1, 4, 33, 0, 0xffd23f);
    return g;
  }, { scale: 0.1 });
  const f = makeMesh(geo);
  f.position.set(x, 0, z);
  A.addStatic(f, 'mansion');
  A.world.circle(x, z, 2.35);
  const tex = makeLiquid(1, 1, 'pond', {}).mesh.material;
  tex.map = tex.map.clone();
  tex.map.repeat.set(2, 2);
  tex.map.needsUpdate = true;
  const water = new THREE.Mesh(new THREE.CircleGeometry(2.15, 20), tex);
  water.rotation.x = -Math.PI / 2;
  water.position.set(x, 0.42, z);
  A.scene.add(water);
  const top = new THREE.Mesh(new THREE.CircleGeometry(0.85, 12), tex);
  top.rotation.x = -Math.PI / 2;
  top.position.set(x, 1.52, z);
  A.scene.add(top);
  let acc = 0;
  const src = new THREE.Vector3(x, 2.9, z);
  A.onUpdate((dt) => {
    tex.map.offset.x += dt * 0.05;
    acc += dt;
    while (acc > 0.05) {
      acc -= 0.05;
      const a = Math.random() * Math.PI * 2;
      const sp = rand(0.8, 1.3);
      fx.burst(src, { count: 1, color: pick([0x9ff2ff, 0xffffff, 0x7fd0f5]), speed: 0.1, vx: Math.cos(a) * sp, vy: 2.6, vz: Math.sin(a) * sp, size: 0.07, life: 1.1, ground: 0.45, bounce: 0, grav: -9, up: 0 });
    }
  }, x, z, 24);
  const proxy = pickProxy(2.3, 3);
  proxy.position.set(x, 0, z);
  A.scene.add(proxy);
  A.interact({
    id: 'fountain', pos: new THREE.Vector3(x, 0, z + 3), range: 1.5, label: 'WISH', icon: 'coin', color: 'yellow', hit: proxy, ringR: 0.9,
    act: () => {
      const pl = A.player;
      pl.chibi.play('throw');
      setTimeout(() => {
        fx.coins(_v.set(x, 1.2, z + 1), 4, { ground: 0.4 });
        audio.play('coin');
        audio.play('slosh', { pitch: 1.4 });
        fx.bubbles(_v.set(x, 0.5, z + 1), { count: 8 });
        speech(pl.chibi, pick(['I wish for... more Swarms!', 'I wish for a Golden Panther!', 'I wish Nolan finds his phone.', 'Wishing for legendary drops!']), 2);
      }, 300);
    },
  });
}

function helicopter(A, x, z) {
  const body = cachedGeometry('arena:heli', () => {
    const g = new VoxGrid();
    g.ellipsoid(0, 6, 0, 5, 4, 7, 0x29b6f6);
    g.ellipsoid(0, 7, 4, 4, 3, 3, 0x9ff2ff);
    g.box(-1, 6, -8, 0, 7, -18, 0x29b6f6);
    g.box(-1, 7, -18, 0, 11, -17, 0x29b6f6);
    g.box(-5, 0, -4, -5, 1, 5, 0x2a2f3c);
    g.box(4, 0, -4, 4, 1, 5, 0x2a2f3c);
    g.box(-5, 2, -2, 4, 2, -2, 0x2a2f3c);
    g.box(-5, 2, 3, 4, 2, 3, 0x2a2f3c);
    g.box(-1, 10, -1, 0, 11, 0, 0x2a2f3c);
    g.box(-3, 5, 7, 2, 6, 7, 0xffd23f);
    return g;
  }, { scale: 0.12 });
  const rotor = cachedGeometry('arena:rotor', () => new VoxGrid().box(-24, 0, -1, 23, 0, 0, 0x3a4050).box(-1, 0, -24, 0, 0, 23, 0x3a4050), { scale: 0.12, pivot: 'center' });
  const root = new THREE.Group();
  const b = makeMesh(body);
  const r = makeMesh(rotor);
  r.position.y = 1.42;
  root.add(b, r);
  root.position.set(x, 0, z);
  root.rotation.y = 0.5;
  A.scene.add(root);
  A.world.circle(x, z, 1.1);
  let spin = 0.6;
  A.onUpdate((dt) => {
    r.rotation.y += dt * spin * 10;
  }, x, z, 26);
  const proxy = pickProxy(1.2, 2);
  root.add(proxy);
  A.interact({
    id: 'heli', pos: new THREE.Vector3(x + 1.6, 0, z + 1.4), range: 1.5, label: 'HONK', icon: 'speed', color: 'blue', hit: proxy, ringR: 0.8,
    act: () => {
      spin = 4;
      audio.play('engine');
      fx.smoke(_v.set(x, 0.4, z), { count: 12, scale: 1.3, color: 0xe8eef6 });
      speech(A.player.chibi, pick(['Vroom vroom? Whirr whirr!', "Jimmy's ride!", 'No pilot licence. Better not.']), 1.6);
      setTimeout(() => (spin = 0.6), 2200);
    },
  });
}

function moneyBags(A, x, z) {
  const geo = cachedGeometry('arena:moneybags', () => {
    const g = new VoxGrid();
    for (const [bx, bz, s] of [[0, 0, 1], [4, 1, 0.8], [-3, 2, 0.8], [1, 4, 0.7]]) {
      g.ellipsoid(bx, 3 * s, bz, 3 * s, 3 * s, 3 * s, 0x5fa83a);
      g.box(bx - 1, 6 * s, bz - 1, bx, 7 * s, bz, 0x4a8a2a);
      g.box(bx, 3 * s, bz + 3 * s, bx, 3 * s, bz + 3 * s, 0xffd23f);
    }
    return g;
  }, { scale: 0.1 });
  const m = makeMesh(geo);
  m.position.set(x, 0, z);
  A.addStatic(m, 'mansion');
  A.world.circle(x, z, 0.5);
}

function goldCar(A, x, z) {
  const geo = cachedGeometry('arena:goldCar', () => {
    const g = new VoxGrid();
    g.box(-8, 2, -18, 7, 6, 17, 0xffd23f);
    g.box(-7, 7, -8, 6, 10, 6, 0xffd23f);
    g.box(-6, 7, 7, 5, 9, 7, 0x9ff2ff);
    g.box(-6, 7, -9, 5, 9, -9, 0x9ff2ff);
    g.box(-8, 7, -6, -8, 9, 4, 0x9ff2ff);
    g.box(7, 7, -6, 7, 9, 4, 0x9ff2ff);
    g.box(-5, 4, 18, -3, 5, 18, 0xffffff, true);
    g.box(2, 4, 18, 4, 5, 18, 0xffffff, true);
    g.box(-5, 4, -19, -3, 5, -19, 0xff2e2e, true);
    g.box(2, 4, -19, 4, 5, -19, 0xff2e2e, true);
    for (const wx of [-9, 7]) for (const wz of [-12, 10]) g.box(wx, 0, wz, wx + 1, 3, wz + 3, 0x15121f);
    return g;
  }, { scale: 0.1 });
  const m = makeMesh(geo);
  m.material = variantMaterials('gold');
  m.position.set(x, 0, z);
  m.rotation.y = 1.2;
  A.scene.add(m);
  A.world.circle(x, z, 1.4);
  A.world.circle(x + Math.sin(1.2) * 1.2, z + Math.cos(1.2) * 1.2, 0.8);
  A.world.circle(x - Math.sin(1.2) * 1.2, z - Math.cos(1.2) * 1.2, 0.8);
  const proxy = pickProxy(1.6, 1.4);
  proxy.position.set(x, 0, z);
  A.scene.add(proxy);
  A.interact({
    id: 'goldCar', pos: new THREE.Vector3(x, 0, z + 2), range: 2, label: 'HONK', icon: 'truck', color: 'yellow', hit: proxy,
    act: () => {
      audio.play('horn');
      fx.sparkle(_v.set(x, 1, z), { count: 16, color: 0xfff27a, radius: 2 });
      speech(A.player.chibi, pick(['A solid gold car. Of course.', 'The Lambeast!', 'Do not scratch it. DO NOT scratch it.']), 1.8);
    },
  });
}

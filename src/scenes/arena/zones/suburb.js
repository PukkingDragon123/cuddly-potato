// Suburb of Horrors: streets, houses, alive mailboxes, trash cans, TP'd trees,
// Nolan (quest chain), King Clog's boss gate and Nolan's lost phone.
import * as THREE from 'three';
import { VoxGrid, makeMesh, cachedGeometry } from '../../../core/voxel.js';
import { fx } from '../../../core/particles.js';
import { audio } from '../../../core/audio.js';
import { rand, pick, damp } from '../../../core/util.js';
import { speech, floatText } from '../../../ui/ui.js';
import { state } from '../../../game/state.js';
import { pickProxy, blobShadow, textPanel } from '../kit.js';
import { placeBossGate } from '../gates.js';
import { questMarker, questTalk } from '../quests.js';
import { makeMailbox } from '../fallbacks.js';

const _v = new THREE.Vector3();
const HOUSE_COLORS = [0xf2a65a, 0x8fd0f0, 0xf0e28a, 0xc8a0e8, 0x9ad88a, 0xf09aa8];

export function buildSuburb(A) {
  const T = A.terrain;
  const Z = 'suburb';
  const zone = A.zoneUnlocked({ arena: 'suburb' });
  // streets
  T.rect(-58, 23, -22, 29, 'sidewalk', { onlyLand: true });
  T.rect(-58, 24, -22, 28, 'asphalt', { onlyLand: true });
  T.rect(-58, 41, -33, 47, 'sidewalk', { onlyLand: true });
  T.rect(-58, 42, -34, 46, 'asphalt', { onlyLand: true });
  T.rect(-39, 23, -33, 47, 'sidewalk', { onlyLand: true });
  T.rect(-38, 24, -34, 46, 'asphalt', { onlyLand: true });
  for (let x = -56; x < -23; x += 3) if (x < -39 || x > -33) T.rect(x, 25.8, x + 1.6, 26.2, 'lineY');
  for (let x = -56; x < -39; x += 3) T.rect(x, 43.8, x + 1.6, 44.2, 'lineY');
  for (let z = 30; z < 41; z += 3) T.rect(-36.2, z, -35.8, z + 1.6, 'lineY');

  // houses: north side of each street, facing the camera
  const houses = [[-28.5, 18.6], [-45, 18.6], [-53.5, 18.6], [-28.5, 36.6], [-45, 36.6], [-53.5, 36.6]];
  houses.forEach(([x, z], i) => {
    const h = A.put('makeHouse', [HOUSE_COLORS[i % HOUSE_COLORS.length]], { x, z, zone: Z, fit: { w: 5.4, clamp: 1.25 } });
    T.rect(x - 0.8, z + 2.3, x + 0.8, z + 4.4, 'path');
    // fence pieces either side of the front path
    A.put('makeFence', [2.2], { x: x - 2.1, z: z + 3.6, zone: Z, collide: false });
    A.put('makeFence', [2.2], { x: x + 2.1, z: z + 3.6, zone: Z, collide: false });
    A.world.box(x - 3.2, z + 3.5, x - 1, z + 3.75);
    A.world.box(x + 1, z + 3.5, x + 3.2, z + 3.75);
    // mailbox + trash can by the sidewalk
    const mbx = x + 2.4, mbz = z + 4.4;
    if (i === 1 || i === 3) aliveMailbox(A, mbx, mbz, HOUSE_COLORS[(i + 2) % 6]);
    else A.put('makeMailbox', [[0x3a6ad8, 0xe8343c, 0x2f9e4a][i % 3]], { x: mbx, z: mbz, zone: Z, collide: { r: 0.25 }, fit: { h: 1.5, clamp: 1.6 } });
    trashCan(A, x - 2.6, z + 4.3);
    // backyard tree
    A.put('makeTree', [i % 2 ? 'pine' : 'round', i + 11], { x: x + (i % 2 ? 3.6 : -3.4), z: z - 2.6, zone: Z, collide: { r: 0.4 }, fit: { h: 3.6, clamp: 1.6 } });
  });
  // street lamps & hydrants
  for (const x of [-25, -32, -41, -49, -56]) A.put('makeLamp', [], { x, z: 29.4, zone: Z, collide: { r: 0.22 }, fit: { h: 2.8, clamp: 1.5 } });
  for (const x of [-42, -50]) A.put('makeLamp', [], { x, z: 47.4, zone: Z, collide: { r: 0.22 }, fit: { h: 2.8, clamp: 1.5 } });
  A.put('makeHydrant', [], { x: -33, z: 22.6, zone: Z, collide: { r: 0.2 } });
  A.put('makeHydrant', [], { x: -50, z: 40.6, zone: Z, collide: { r: 0.2 } });
  for (const [x, z] of [[-37.5, 30], [-34.5, 39], [-30, 27]]) A.put('makeCone', [], { x, z, zone: Z, collide: { r: 0.2 }, fit: { h: 0.75, clamp: 1.6 } });

  // spooky yard decorations
  tpTree(A, -40.5, 33.5);
  graves(A, -50, 31.5);
  flamingos(A, -31.5, 32.2);
  lawnToilet(A, -25.5, 33);
  // Nolan
  const nolan = A.npc('nolan', {
    pos: [-35.6, 31.5], facing: 0, wander: 2.2, react: 'wave',
    marker: () => questMarker('nolan'),
    lines: ['Has anyone seen my phone?!', 'This suburb is SO creepy at night.', 'King Clog lives behind that skull gate...', 'I am NOT afraid of mailboxes. They bite though.'],
    greet: ['Yo {name}!', 'Oh hey! You scared me.'],
    onTalk: (n) => questTalk(A, n, 'nolan', NOLAN),
  });
  A.poi({ x: -35.6, z: 31.5, color: '#ffd23f', size: 2, visible: () => false });

  // King Clog boss gate (south yard) + sewage
  T.rect(-50.5, 48, -41.5, 56, 'dirt', { onlyLand: true });
  T.circle(-46, 53.2, 1.8, 'toxic');
  placeBossGate(A, 'kingClog', -46, 50.6, Z);
  lawnToilet(A, -49.8, 52.6, 1.2);
  lawnToilet(A, -42.2, 52.9, 0.9);
  for (const [x, z] of [[-51.5, 49], [-40.5, 49.5]]) A.put('makeBush', [Math.round(x)], { x, z, zone: Z, collide: { r: 0.5 }, fit: { h: 0.9, clamp: 1.8 } });

  // Nolan's phone (hidden in the north-west corner bushes)
  nolanPhone(A, -56.2, 16.6);
  for (const [x, z] of [[-55, 15.8], [-57.2, 18.2], [-55.6, 18.4]]) A.put('makeBush', [Math.round(x * z)], { x, z, zone: Z, collide: { r: 0.45 }, fit: { h: 0.9, clamp: 1.8 } });
}

const NOLAN = {
  intro: {
    nolan1: "Jimmy's got me battling non-stop and I keep LOSING. Can you win a couple for me?",
    nolan2: "I lost my phone. AGAIN. It's somewhere in this suburb... I swear I heard it buzzing near some bushes up in the north-west corner.",
    nolan3: 'Panthers are the best Swarm. Fact. Deploy a whole bunch of them and we throw a party!',
    nolan4: "Open some Vials for me. Don't tell Jimmy I said vials are better than cake.",
    nolan5: "King Clog is clogging the WHOLE neighbourhood. Beat him and I'll join your Lab as a Commander!",
  },
  done: {
    nolan1: 'You won?! You are officially my backup forever.',
    nolan2: "MY PHONE! 47 missed calls from Jimmy... Thanks! Here's a reward.",
    nolan3: 'PANTHER PARTY! Look at them go!',
    nolan4: 'So many vials. You are a true Lab scientist.',
    nolan5: 'You beat King Clog! I am SO in. Nolan, reporting for duty!',
  },
  progress: (st) => {
    if (st.quest.id === 'nolan2') return "Still no phone... Check the bushes in the far north-west corner of the suburb!";
    if (st.quest.boss) return "King Clog is still out there. His skull gate is south of Second Street.";
    return `${st.text} You're at ${st.prog}/${st.need}. Keep going!`;
  },
  finished: ["Commander Nolan at your service! ...Can I still borrow your phone?", 'Best. Lab partner. Ever.', 'Wanna race to Beast Mart?'],
  allDone: "That's everything! Thanks for having my back, {name}.",
  decline: "No worries. I'll just... stand here. Next to the scary mailbox.",
};

// ---------------------------------------------------------------------------

function trashCan(A, x, z) {
  const m = A.put('makeTrashCan', [0x5d7060], { x, z, dynamic: true, collide: false, fit: { h: 1.1, clamp: 1.6 } }).root;
  const st = { wob: 0, wv: 0, ax: 0 };
  let last = 0;
  A.world.circle(x, z, 0.36, {
    onBump: (ct, who) => {
      const now = performance.now();
      if (now - last < 500 || A.player.speed < 1.2) return;
      last = now;
      st.wv += 6 + A.player.speed;
      st.ax = Math.atan2(-ct.nx, -ct.nz);
      audio.play('thud', { pitch: rand(1.1, 1.4), vol: 0.5 });
      fx.burst(_v.set(x, 1.1, z), { count: 6, colors: [0x8a8f9c, 0xd8c4a0, 0x6a8a5a, 0xffffff], speed: 3, size: 0.08, ground: 0 });
      if (Math.random() < 0.3) speech(_v.set(x, 1.4, z).clone(), pick(['*hiss*', 'Rude!', '*rattle rattle*', 'Occupied!']), 1.2);
    },
  });
  A.onUpdate((dt) => {
    st.wv += (-st.wob * 120 - st.wv * 6) * dt;
    st.wob += st.wv * dt;
    m.rotation.x = Math.cos(st.ax) * st.wob * 0.1;
    m.rotation.z = -Math.sin(st.ax) * st.wob * 0.1;
  }, x, z, 20);
}

/** A mailbox that is alive: hops around its post spot, chomps when you get close. */
function aliveMailbox(A, x, z, color) {
  const root = new THREE.Group();
  const mb = makeMailbox(color);
  root.add(mb);
  // googly eyes
  const eye = cachedGeometry('arena:mbEyes', () => {
    const g = new VoxGrid();
    g.box(-2, 0, 0, -1, 1, 0, 0xffffff);
    g.box(1, 0, 0, 2, 1, 0, 0xffffff);
    g.set(-1, 0, 1, 0x0d1029);
    g.set(1, 0, 1, 0x0d1029);
    return g;
  }, { scale: 0.1, pivot: 'center' });
  const eyes = makeMesh(eye);
  eyes.position.set(0, 1.18, 0.56);
  root.add(eyes);
  root.add(blobShadow(0.35));
  root.position.set(x, 0, z);
  A.scene.add(root);
  const s = { x, z, home: { x, z }, hopT: rand(0, 2), vy: 0, y: 0, tx: x, tz: z, fleeing: false, chompT: 0 };
  const proxy = pickProxy(0.5, 1.5);
  root.add(proxy);
  A.interact({
    id: 'mailbox' + x, pos: root.position, range: 1.4, label: 'POKE', icon: 'hp', color: 'orange', hit: proxy, ringR: 0.6,
    act: () => {
      s.vy = 6;
      s.chompT = 0.6;
      audio.play('chomp');
      audio.play('boing', { pitch: 1.4 });
      const pl = A.player;
      pl.chibi.play('shocked');
      pl.chibi.expr('shock', 'o', 1);
      speech(pl.chibi, pick(['IT BIT ME!', 'Mail bites back!', 'Return to sender!']), 1.4);
      fx.burst(_v.set(s.x, 1.2, s.z), { count: 10, colors: [0xffffff, 0xf4f0e6], speed: 4, size: 0.1, ground: 0 }); // letters!
    },
  });
  A.onUpdate((dt, t) => {
    const p = A.player.pos;
    const d = Math.hypot(p.x - s.x, p.z - s.z);
    s.hopT -= dt;
    if (s.y <= 0 && s.vy <= 0) {
      s.y = 0;
      if (s.hopT <= 0) {
        // pick a hop target: flee if the player is close, otherwise wander home
        if (d < 3) {
          const ax = (s.x - p.x) / (d || 1), az = (s.z - p.z) / (d || 1);
          s.tx = s.x + ax * 1.2 + rand(-0.4, 0.4);
          s.tz = s.z + az * 1.2 + rand(-0.4, 0.4);
        } else {
          s.tx = s.home.x + rand(-1.2, 1.2);
          s.tz = s.home.z + rand(-0.5, 0.6);
        }
        if (Math.hypot(s.tx - s.home.x, s.tz - s.home.z) > 2.6 || !A.world.free(s.tx, s.tz, 0.3, 'npc')) {
          s.tx = s.home.x;
          s.tz = s.home.z;
        }
        s.vy = d < 3 ? 5 : 3.6;
        s.hopT = d < 3 ? rand(0.2, 0.5) : rand(1, 3);
        audio.play('boing', { pitch: 1.6 + Math.random() * 0.4, vol: d < 8 ? 0.35 : 0 });
        if (d < 2.2 && Math.random() < 0.5) {
          s.chompT = 0.5;
          audio.play('chomp', { vol: 0.6 });
        }
      }
    }
    if (s.y > 0 || s.vy > 0) {
      s.vy -= 18 * dt;
      s.y = Math.max(0, s.y + s.vy * dt);
      s.x = damp(s.x, s.tx, 5, dt);
      s.z = damp(s.z, s.tz, 5, dt);
      if (s.y === 0) fx.dust(_v.set(s.x, 0, s.z), { count: 3 });
    }
    s.chompT = Math.max(0, s.chompT - dt);
    root.position.set(s.x, s.y, s.z);
    root.rotation.y = Math.atan2(p.x - s.x, p.z - s.z) * (d < 6 ? 1 : 0);
    const sq = s.y > 0 ? 1 + Math.min(0.25, s.vy * 0.04) : 1 - Math.max(0, Math.sin(s.hopT * 20)) * 0.04;
    mb.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
    mb.rotation.x = s.chompT > 0 ? -Math.sin(s.chompT * 30) * 0.15 : 0;
  }, x, z, 26);
}

function tpTree(A, x, z) {
  const t = A.put('makeTree', ['round', 1], { x, z, zone: 'suburb', collide: { r: 0.4 }, fit: { h: 3.6, clamp: 1.6 } });
  const b = A.bbox(t.root);
  const r = Math.min(b.max.x - b.min.x, b.max.z - b.min.z) / 2;
  const H = b.max.y;
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const strand = (px, py, pz, len, w = 0.07) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, len, w), mat);
    m.position.set(px, py - len / 2, pz);
    m.castShadow = false;
    A.addStatic(m, 'suburb');
  };
  // hanging strands around the canopy edge
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.3;
    const rr = r * (0.82 + (i % 2) * 0.12);
    strand(x + Math.cos(a) * rr, H * (0.62 + (i % 3) * 0.06), z + Math.sin(a) * rr, 0.45 + ((i * 7) % 4) * 0.18);
  }
  // loops thrown over the top
  for (const rot of [0.4, 1.9]) {
    for (let k = 0; k <= 8; k++) {
      const u = (k / 8) * Math.PI;
      const px = x + Math.cos(rot) * Math.cos(u) * r * 0.85, pz = z + Math.sin(rot) * Math.cos(u) * r * 0.85;
      const py = H * 0.62 + Math.sin(u) * H * 0.4;
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.07, 0.16), mat);
      m.position.set(px, py, pz);
      A.addStatic(m, 'suburb');
    }
  }
  // a roll on the ground
  const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.22, 10), mat);
  roll.rotation.z = Math.PI / 2;
  roll.position.set(x + r + 0.3, 0.12, z + 0.6);
  A.addStatic(roll, 'suburb');
}

function graves(A, x, z) {
  const geo = cachedGeometry('arena:graves', () => {
    const g = new VoxGrid();
    for (const [gx, gz] of [[-6, 0], [0, -2], [6, 0]]) {
      g.box(gx - 2, 0, gz, gx + 2, 6, gz + 1, 0x9aa0ac);
      g.box(gx - 1, 7, gz, gx + 1, 7, gz + 1, 0x9aa0ac);
      g.box(gx - 1, 4, gz + 2, gx + 1, 4, gz + 2, 0x6a707c);
      g.box(gx, 3, gz + 2, gx, 5, gz + 2, 0x6a707c);
      g.box(gx - 2, 0, gz + 2, gx + 2, 0, gz + 5, 0x7a5236);
    }
    return g;
  }, { scale: 0.1 });
  const m = makeMesh(geo);
  m.position.set(x, 0, z);
  A.addStatic(m, 'suburb');
  A.world.box(x - 0.85, z - 0.25, x + 0.85, z + 0.15);
  const sign = textPanel([{ text: 'R.I.P. LOST SOCKS', size: 0.12, color: '#ffffff' }], { w: 1.7, h: 0.25, bg: '#3a3f50' });
  sign.position.set(x, 0.95, z + 0.18);
  A.scene.add(sign);
}

function flamingos(A, x, z) {
  const geo = cachedGeometry('arena:flamingo', () => {
    const g = new VoxGrid();
    g.box(0, 0, 0, 0, 6, 0, 0x2a2a30);
    g.ellipsoid(0, 8, 0, 1.5, 1.4, 2.5, 0xff8ac0);
    g.box(0, 9, 2, 0, 13, 2, 0xff8ac0);
    g.box(0, 13, 3, 0, 14, 4, 0xff8ac0);
    g.set(0, 13, 5, 0x2a2a30);
    return g;
  }, { scale: 0.1 });
  for (const [dx, r] of [[0, 0.3], [0.9, -0.5]]) {
    const m = makeMesh(geo);
    m.position.set(x + dx, 0, z);
    m.rotation.y = r;
    A.addStatic(m, 'suburb');
  }
}

function lawnToilet(A, x, z, s = 1) {
  const geo = cachedGeometry('arena:toilet', () => {
    const g = new VoxGrid();
    g.box(-2, 0, -2, 2, 3, 3, 0xf4f6fb);
    g.ellipsoid(0, 5, 1, 3.4, 1.6, 3.6, 0xf4f6fb);
    g.ellipsoid(0, 6, 1, 2.2, 1, 2.4, 0x7cff3a, true);
    g.box(-3, 4, -5, 3, 11, -2, 0xf4f6fb);
    g.box(-1, 9, -1, 1, 9, -1, 0xc8ccd8);
    return g;
  }, { scale: 0.1 });
  const m = makeMesh(geo);
  m.position.set(x, 0, z);
  m.scale.setScalar(s);
  m.rotation.y = rand(-0.5, 0.5);
  A.addStatic(m, 'suburb');
  A.world.circle(x, z, 0.35 * s);
}

function nolanPhone(A, x, z) {
  if (state.p.secrets?.nolanPhone) return;
  const geo = cachedGeometry('arena:phone', () => {
    const g = new VoxGrid();
    g.box(-1, 0, -2, 1, 0, 2, 0x15121f);
    g.box(-1, 1, -1, 1, 1, 1, 0x7fe8ff, true);
    g.set(0, 1, 2, 0xffd23f);
    return g;
  }, { scale: 0.1 });
  const m = makeMesh(geo);
  m.position.set(x, 0.02, z);
  m.rotation.y = 0.6;
  A.scene.add(m);
  let acc = 0, buzz = 0;
  const sp = new THREE.Vector3(x, 0.3, z);
  const upd = A.onUpdate((dt) => {
    if (!m.parent) return;
    acc += dt;
    buzz += dt;
    if (acc > 1.1) {
      acc = 0;
      fx.sparkle(sp, { count: 1, color: 0x9ff2ff, speed: 0.5, life: 0.9, size: 0.05 });
    }
    // occasional buzz (vibration)
    const vib = buzz % 4 < 0.5;
    m.position.x = x + (vib ? Math.sin(buzz * 90) * 0.015 : 0);
    if (vib && buzz % 4 < 0.02) audio.play('tick', { pitch: 0.5, vol: Math.max(0, 1 - A.player.pos.distanceTo(sp) / 8) * 0.6 });
  }, x, z, 20);
  A.interact({
    id: 'nolanPhone', pos: new THREE.Vector3(x, 0, z), range: 1.5, auto: true, label: 'PICK UP', icon: 'star', color: 'yellow',
    enabled: () => !!m.parent,
    act: () => {
      if (!m.parent) return;
      A.scene.remove(m);
      if (A.secret('nolanPhone', sp)) speech(A.player.chibi, "Nolan's phone! 47 missed calls...", 2.2);
    },
  });
}

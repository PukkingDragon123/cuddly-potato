// Beast Island's tappable fun (home lobby): poke a bee hive and the bees swarm the camera, shake a
// coconut palm, watch Nolan land a fish off the pier, dig up the treasure X, set off the geyser,
// wake whatever lives in the forest cave, spin the lighthouse beam, let the seagull steal a fry,
// chat with Jimmy and the townsfolk. Some spots pay a few coins once a day (game/islandFun.js).
// Spots in an arena area you have not reached yet stay quiet ("Reach <arena> to explore here").
//
//   const fun = setupIslandFun(home);   // after the island is built, before static batching
//   fun.update(dt)   fun.dispose()
import * as THREE from 'three';
import { engine } from '../core/engine.js';
import { audio } from '../core/audio.js';
import { fx } from '../core/particles.js';
import { Chibi } from '../core/chibi.js';
import { Mats } from '../core/voxel.js';
import * as IP from '../models/island/props.js';
import * as FUN from '../models/island/fun.js';
import { treasureChest } from '../models/island/trophyPath.js';
import { CHARACTERS } from '../data/characters.js';
import { arenaById } from '../data/arenas.js';
import { featureUnlocked } from '../game/progression.js';
import { funClaim, funReady } from '../game/islandFun.js';
import { h, toast, flyIcons, speech, $overlay } from '../ui/ui.js';
import { flyText } from '../ui/home/common.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const FACE_Y = Math.atan2(0.14, 1); // toward the default island cameras (south, a touch east)
const _o = new THREE.Object3D();
_o.rotation.order = 'YXZ';
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
function liveIM(geo, n, shadow = false) {
  const im = new THREE.InstancedMesh(geo, Mats.pair, n);
  im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  im.frustumCulled = false;
  im.castShadow = shadow;
  for (let i = 0; i < n; i++) im.setMatrixAt(i, ZERO);
  return im;
}
const setM = (im, i, p, ry = 0, rx = 0, rz = 0, s = 1) => {
  _o.position.copy(p);
  _o.rotation.set(rx, ry, rz);
  _o.scale.setScalar(s);
  _o.updateMatrix();
  im.setMatrixAt(i, _o.matrix);
};

// what the townsfolk say (voiced through the speech bubbles)
const LINES = {
  jimmy: ['I bought this town. Then I gave it back. Then I bought it again.', 'Every house here has a trophy in the fridge. Do not ask.', 'Whoever finds the X on the beach keeps the gold. Probably.', 'Poke a beehive once. Just once. Trust me.'],
  nolan: ['Six hours out here. The fish are winning.', 'Shh. They can hear you.', 'If I catch one more, it gets a name and a contract.', 'I am not losing. I am letting the fish feel good.'],
  fan: ['I came for the beach. I stayed for the free chests.', 'Do NOT poke the beehives. I poked the beehives.', 'Jimmy waved at me! Well, at that seagull. Still counts.', 'The crabs here walk sideways. Even the rich ones.'],
  cashier: ['Fresh fruit! Mostly fresh!', 'The seagull is not a customer.', 'Two bananas for one high five.', 'We also sell trophies. They are just painted bananas.'],
};

export function setupIslandFun(home) {
  const I = home.I;
  const S = I?.spots;
  if (!S) return null;
  const F = S.fun ?? {};
  const scene = home.scene;
  const ups = [];
  const disposers = [];
  const cam = () => home.camera;
  let alive = true;

  // ---------------------------------------------------------------- helpers
  const zoneLocked = (p) => {
    const id = I.zoneOf?.(p.x, p.z);
    if (!id) return null;
    return I.isLocked(id) || !featureUnlocked('island.' + id) ? id : null;
  };
  /** Taps on a spot in a locked arena area just say where to go. */
  const guard = (p, fn) => () => {
    const lock = zoneLocked(p);
    if (lock) { audio.play('deny'); toast(`Reach *${arenaById(lock)?.name ?? 'that arena'}* to explore here.`, { icon: 'lock' }); return; }
    fn();
  };
  /** A small daily treat: coins fly from the spot to the coin counter. */
  function treat(id, coins, pos, label) {
    const got = funClaim(id, coins);
    if (!got) return false;
    const sp = engine.toScreen(pos, cam());
    if (!sp.visible) { home.refresh(); return true; }
    const anchor = h('div', { class: 'trd-anchor', style: { left: sp.x + 'px', top: sp.y + 'px' } });
    $overlay().appendChild(anchor);
    flyText(anchor, `${label} +${got}`, 'c-gold');
    audio.play('coin', { pitch: 1.1 });
    flyIcons(anchor, 'coin', home.coinPill, { count: 5, size: 26 }).then(() => { anchor.remove(); home.refresh(); });
    setTimeout(() => anchor.remove(), 2400);
    return true;
  }
  const say = (chibi, text) => { try { speech(chibi, text, 2.8); } catch (e) { /* no speech layer */ } };
  const nextLine = (who) => { const L = LINES[who]; L.k = ((L.k ?? Math.floor(Math.random() * L.length)) + 1) % L.length; return L[L.k]; };
  const camNear = (p, d = 95) => cam().position.distanceToSquared(p) < d * d;
  const buzz = (vol = 0.04) => {
    if (!audio.ctx) return;
    const f = 175 + Math.random() * 55;
    audio.tone({ type: 'sawtooth', f0: f, f1: f * 1.08, dur: 0.34, vol, vibrato: 22, vibRate: 34, lp: 1700 });
  };

  // ---------------------------------------------------------------- NPCs with something to do
  const npcs = [];
  function npc(charId, pos, ry, o = {}) {
    if (!CHARACTERS[charId] || !pos) return null;
    const c = new Chibi(CHARACTERS[charId], { scale: o.scale ?? 1.45 });
    c.root.position.copy(pos);
    c.root.rotation.y = ry;
    c.play(o.pose ?? 'idle');
    scene.add(c.root);
    const N = { c, pos: pos.clone(), who: o.who ?? charId, idle: o.idle ?? [], t: 3 + Math.random() * 4 };
    npcs.push(N);
    home.addPick(c.root, guard(pos, () => {
      c.play(o.react ?? 'wave', { restart: true, dur: 1.3, then: o.pose ?? 'idle' });
      audio.play('pop');
      say(c, nextLine(N.who));
      o.onTap?.();
    }), { radius: 1.5 });
    return N;
  }
  ups.push((dt) => {
    for (const N of npcs) {
      if (!camNear(N.pos)) continue;
      N.c.update(dt);
      N.t -= dt;
      if (N.t <= 0 && N.idle.length) {
        N.t = 5 + Math.random() * 6;
        const pose = N.idle[Math.floor(Math.random() * N.idle.length)];
        N.c.play(pose, { restart: true, dur: 1.6, then: 'idle' });
      }
    }
  });

  // Jimmy in the town square
  if (S.square) {
    const p = S.square.clone().add(V(2.6, 0, 2.2));
    npc('jimmy', p, FACE_Y + 0.5, { who: 'jimmy', idle: ['wave', 'point', 'thumbsUp', 'laugh'], react: 'cheer' });
  }

  // ---------------------------------------------------------------- the seagull + the fruit stall cashier
  const stall = S.stalls?.[0];
  if (stall) {
    const fw = V(Math.sin(stall.ry), 0, Math.cos(stall.ry));
    const cashier = npc('cashier', stall.pos.clone().addScaledVector(fw, -0.25), stall.ry, { who: 'cashier', idle: ['present', 'wave'], react: 'shrug' });
    const gull = new THREE.Group();
    gull.name = 'thiefGull';
    const gb = IP.mesh(IP.geo('gullBody', IP.gullBodyGrid, 0.07, 'center'), {});
    const wl = IP.mesh(IP.geo('gullWing', IP.gullWingGrid, 0.07, [0, 0, 0]), {});
    const wr = IP.mesh(IP.geo('gullWing', IP.gullWingGrid, 0.07, [0, 0, 0]), {});
    wl.position.set(0.08, 0.12, 0); wr.position.set(-0.08, 0.12, 0); wr.rotation.y = Math.PI;
    gb.add(wl, wr);
    gull.add(gb);
    const fry = IP.mesh(IP.geo('stolenFry', FUN.fryGrid, 0.05, 'center'), {});
    scene.add(gull, fry);
    const perch = stall.pos.clone().addScaledVector(fw, 0.55).add(V(0.5, 2.15, 0));
    const fryHome = stall.pos.clone().addScaledVector(fw, 0.6).add(V(-0.4, 1.15, 0));
    gull.position.copy(perch);
    gull.rotation.y = stall.ry;
    fry.position.copy(fryHome);
    fry.rotation.y = 0.6;
    let G = null; // { t } while stealing
    home.addPick(gull, guard(perch, () => {
      if (G) return;
      G = { t: 0 };
      audio.play('squeak', { pitch: 0.55 });
      setTimeout(() => audio.play('squeak', { pitch: 0.62 }), 180);
      if (cashier) setTimeout(() => { cashier.c.play('angry', { restart: true, dur: 1.4, then: 'idle' }); say(cashier.c, 'Hey! That fry was paid for!'); }, 700);
    }), { radius: 1.1 });
    ups.push((dt, t) => {
      const flap = (k) => { wl.rotation.z = Math.sin(t * 22) * 0.7 * k; wr.rotation.z = -Math.sin(t * 22) * 0.7 * k; };
      if (!G) {
        // idle on the canopy: look around, the odd wing stretch
        gb.rotation.y = Math.sin(t * 0.7) * 0.6;
        gb.position.y = Math.abs(Math.sin(t * 3)) < 0.05 ? 0.03 : 0;
        flap(Math.max(0, Math.sin(t * 0.9) - 0.92) * 6);
        return;
      }
      G.t += dt;
      const u = G.t;
      if (u < 0.45) { // swoop down to the fry
        gull.position.lerpVectors(perch, fryHome.clone().add(V(0, 0.15, 0)), u / 0.45);
        flap(1);
      } else if (u < 9) { // off with it: a wide loop over the square, the fry in its beak
        const k = (u - 0.45) / 8.55;
        const a = k * Math.PI * 2;
        gull.position.set(fryHome.x + Math.sin(a) * 9, fryHome.y + 1 + Math.sin(k * Math.PI) * 6, fryHome.z + (1 - Math.cos(a)) * 5);
        gull.rotation.y = Math.atan2(Math.cos(a) * 9, Math.sin(a) * 5);
        fry.position.copy(gull.position).add(V(Math.sin(gull.rotation.y) * 0.5, -0.05, Math.cos(gull.rotation.y) * 0.5));
        fry.rotation.y = gull.rotation.y + Math.PI / 2;
        flap(1);
      } else if (u < 10) { // back to its perch, the fry is gone (eaten)
        fry.visible = false;
        gull.position.lerp(perch, Math.min(1, dt * 6));
        flap(1);
      } else {
        gull.position.copy(perch);
        gull.rotation.y = stall.ry;
        // a new fry appears on the counter a little later
        if (u > 13) { fry.visible = true; fry.position.copy(fryHome); fry.rotation.y = 0.6; G = null; }
      }
    });
  }

  // a fan on the beach
  if (F.palms?.length) {
    const p0 = F.palms[0];
    npc('fan', p0.clone().add(V(2.7, 0, -1.2)), FACE_Y - 0.6, { who: 'fan', idle: ['dance', 'cheer', 'peace', 'waveBoth'], react: 'laugh' });
  }

  // ---------------------------------------------------------------- Nolan fishing off the pier
  if (S.pier) {
    const end = S.pier.end;
    const nolan = npc('nolan', end.clone(), 0, { who: 'nolan', idle: ['think', 'yawn', 'lookAround'], react: 'shrug' });
    let rodTip = null;
    if (nolan) {
      const rod = IP.mesh(IP.geo('fishRod', FUN.rodGrid, 0.05, [0, 0, 0]), {});
      rod.rotation.x = -0.4;
      nolan.c.handR?.add(rod);
      rodTip = rod;
    }
    const bob = IP.mesh(IP.geo('bobber', () => FUN.dropGrid().box(-1, 1, -1, 0, 1, 0, 0xe8343c), 0.09, 'center'), {});
    const bobP = end.clone().add(V(0.6, 0, 3.6)).setY(0.04);
    bob.position.copy(bobP);
    scene.add(bob);
    const fish = IP.mesh(IP.geo('fishJump', () => FUN.fishGrid(0xff8a1f), 0.07, 'center'), {});
    fish.visible = false;
    scene.add(fish);
    let J = null;
    const jump = () => {
      if (J) return;
      J = { t: 0, a: bobP.clone().add(V(-1.2, -0.3, 0.6)), b: bobP.clone().add(V(1.6, -0.3, 1.4)) };
      fish.visible = true;
      audio.play('slosh', { pitch: 1.3 });
      fx.burst(J.a.clone().setY(0.1), { count: 12, colors: [0xffffff, 0xbcecff, 0x7cd8f4], speed: 3, size: 0.08, life: 0.6, up: 1.4 });
      if (nolan) {
        nolan.c.play('cheer', { restart: true, dur: 1.4, then: 'idle' });
        setTimeout(() => say(nolan.c, nextLine('nolan')), 500);
      }
      treat('fish', 10, end.clone().add(V(0, 2, 0)), 'FISH');
    };
    home.addPick(bob, guard(end, jump), { radius: 1.6 });
    if (nolan) {
      // Nolan's tap already speaks; it also gets a fish going
      const pk = home.pickables[home.pickables.length - 2];
      if (pk?.obj === nolan.c.root) { const fn0 = pk.fn; pk.fn = () => { fn0(); setTimeout(jump, 400); }; }
    }
    ups.push((dt, t) => {
      bob.position.y = bobP.y + Math.sin(t * 2.1) * 0.06 + (J && J.t < 0.3 ? -0.15 : 0);
      void rodTip;
      if (!J) return;
      J.t += dt;
      const u = Math.min(1, J.t / 1.1);
      fish.position.lerpVectors(J.a, J.b, u);
      fish.position.y += Math.sin(u * Math.PI) * 2.6;
      fish.rotation.set(-Math.cos(u * Math.PI) * 1.1, Math.atan2(J.b.x - J.a.x, J.b.z - J.a.z), Math.sin(t * 20) * 0.2, 'YXZ');
      if (J.t >= 1.1) {
        fish.visible = false;
        fx.burst(J.b.clone().setY(0.1), { count: 14, colors: [0xffffff, 0xbcecff, 0x7cd8f4], speed: 3.2, size: 0.08, life: 0.6, up: 1.4 });
        audio.play('splat', { pitch: 1.4 });
        J = null;
      }
    });
  }

  // ---------------------------------------------------------------- bee hives: poke one and the swarm comes for the camera
  const hives = (F.hives ?? []).map((p, k) => {
    const m = IP.mesh(IP.geo('beeHive', FUN.hiveGrid, 0.08, 'bottom'), {});
    m.position.copy(p);
    m.rotation.y = FACE_Y + (k - 1) * 0.3;
    m.name = 'beeHive';
    scene.add(m);
    return { m, p, k, shake: 0, mouth: p.clone().add(V(Math.sin(m.rotation.y) * 0.6, 1.25, Math.cos(m.rotation.y) * 0.6)) };
  });
  const IDLE_BEES = 4, SWARM = 30;
  let bees = null, swarm = null;
  if (hives.length) {
    bees = liveIM(IP.geo('bee', FUN.beeGrid, 0.04, 'center'), hives.length * IDLE_BEES + SWARM);
    bees.name = 'bees';
    scene.add(bees);
    const B = Array.from({ length: SWARM }, () => ({ ph: Math.random() * 6.28, r: 0.7 + Math.random() * 1.7, sp: (3.5 + Math.random() * 3.5) * (Math.random() < 0.5 ? -1 : 1), up: (Math.random() - 0.5) * 1.6, dl: Math.random() * 0.35, p: new THREE.Vector3(), prev: new THREE.Vector3() }));
    const tgt = new THREE.Vector3(), right = new THREE.Vector3(), upV = new THREE.Vector3(), fwd = new THREE.Vector3(), tmp = new THREE.Vector3();
    hives.forEach((H) => home.addPick(H.m, guard(H.p, () => {
      H.shake = 0.7;
      audio.play('thud', { pitch: 1.4 });
      if (swarm) return;
      swarm = { H, t: 0, next: 0 };
      for (const b of B) b.p.copy(H.mouth);
      setTimeout(() => treat('hive' + H.k, 15, H.p.clone().add(V(0, 2.2, 0)), 'HONEY'), 900);
    }), { radius: 1.4 }));
    ups.push((dt, t) => {
      // off-screen work: only when a hive is near the camera or the swarm is out
      bees.visible = !!swarm || hives.some((H) => camNear(H.p, 70));
      if (!bees.visible) return;
      // idle bees: lazy loops around each hive
      hives.forEach((H, k) => {
        for (let i = 0; i < IDLE_BEES; i++) {
          const a = t * (1.4 + i * 0.3) + i * 1.6 + k;
          tmp.set(H.mouth.x + Math.cos(a) * (0.7 + i * 0.12), H.mouth.y + 0.3 + Math.sin(a * 1.7) * 0.25, H.mouth.z + Math.sin(a) * (0.7 + i * 0.12));
          setM(bees, k * IDLE_BEES + i, tmp, -a, 0, 0, swarm?.H === H && swarm.t < 4.6 ? 0.0001 : 1);
        }
        if (H.shake > 0) {
          H.shake = Math.max(0, H.shake - dt);
          const s = H.shake / 0.7;
          H.m.rotation.z = Math.sin(t * 46) * 0.09 * s;
          H.m.scale.set(1 + Math.sin(t * 40) * 0.03 * s, 1 - Math.sin(t * 40) * 0.04 * s, 1);
        }
      });
      // the swarm: out of the hive, right up to the camera, a buzzing swirl, then home
      const base = hives.length * IDLE_BEES;
      if (swarm) {
        swarm.t += dt;
        const c = cam();
        c.getWorldDirection(fwd);
        right.crossVectors(fwd, c.up).normalize();
        upV.crossVectors(right, fwd).normalize();
        tgt.copy(c.position).addScaledVector(fwd, 6.5).addScaledVector(upV, -0.6);
        const u = swarm.t;
        swarm.next -= dt;
        if (swarm.next <= 0 && u < 4.4) { swarm.next = 0.26; buzz(u < 0.6 || u > 3.6 ? 0.025 : 0.05); }
        B.forEach((b, i) => {
          b.prev.copy(b.p);
          const a = b.ph + u * b.sp;
          // their spot in the swirl (camera plane)
          tmp.copy(tgt).addScaledVector(right, Math.cos(a) * b.r * 1.3).addScaledVector(upV, Math.sin(a) * b.r * 0.8 + b.up * 0.5).addScaledVector(fwd, Math.sin(a * 0.5) * 0.8);
          const k1 = Math.min(1, Math.max(0, (u - b.dl) / 0.9));
          if (u < 3.6) b.p.lerpVectors(swarm.H.mouth, tmp, k1 * k1 * (3 - 2 * k1));
          else {
            const k2 = Math.min(1, (u - 3.6) / 1.1);
            b.p.lerpVectors(tmp, swarm.H.mouth, k2 * k2);
          }
          b.p.y += Math.sin(t * 13 + i) * 0.05;
          const vx = b.p.x - b.prev.x, vz = b.p.z - b.prev.z;
          setM(bees, base + i, b.p, Math.atan2(vx, vz), 0, Math.sin(t * 30 + i) * 0.3, u > 4.6 ? 0.0001 : 1.25);
        });
        if (u > 4.8) { swarm = null; for (let i = 0; i < SWARM; i++) bees.setMatrixAt(base + i, ZERO); }
      }
      bees.instanceMatrix.needsUpdate = true;
    });
  }

  // ---------------------------------------------------------------- coconut palms
  const nuts = (F.palms ?? []).map((p, k) => {
    const palm = IP.mesh(IP.geo('coconutPalm' + (k & 1), () => FUN.coconutPalmGrid(k), 0.12, [0, 0, 0]), {});
    palm.position.copy(p).setY(p.y - 0.05);
    palm.rotation.y = k * 1.7;
    palm.name = 'coconutPalm';
    scene.add(palm);
    const nut = IP.mesh(IP.geo('coconut', FUN.coconutGrid, 0.12, 'center'), {});
    const top = V(4 * 0.12 - 0.05, FUN.PALM_TOP * 0.12, 0.12).applyAxisAngle(V(0, 1, 0), palm.rotation.y).add(palm.position);
    nut.position.copy(top);
    scene.add(nut);
    return { palm, nut, top, p, k, sway: 0, fall: null };
  });
  nuts.forEach((N) => home.addPick(Object.assign(new THREE.Object3D(), { name: 'palmPick' }).translateX(N.p.x).translateY(N.p.y + 1.6).translateZ(N.p.z), guard(N.p, () => {
    N.sway = 1.2;
    audio.play('swing', { pitch: 0.8 });
    if (N.fall) return;
    const out = V(Math.random() - 0.5, 0, 0.6 + Math.random() * 0.5).normalize();
    N.fall = { t: -0.25, p: N.top.clone(), v: V(out.x * 1.4, 0, out.z * 1.4), bounced: 0, rest: 0 };
  }), { radius: 2.4 }));
  ups.push((dt, t) => {
    for (const N of nuts) {
      if (N.sway > 0) {
        N.sway = Math.max(0, N.sway - dt);
        N.palm.rotation.z = Math.sin(N.sway * 14) * 0.07 * N.sway;
        N.palm.rotation.x = Math.sin(N.sway * 11) * 0.04 * N.sway;
      }
      const f = N.fall;
      if (!f) continue;
      f.t += dt;
      if (f.t < 0) { N.nut.position.copy(N.top).add(V(Math.sin(t * 40) * 0.04, 0, 0)); continue; }
      const ground = N.p.y + 0.12;
      if (f.rest === 0) {
        f.v.y -= 18 * dt;
        f.p.addScaledVector(f.v, dt);
        if (f.p.y < ground) {
          f.p.y = ground;
          if (f.bounced++ < 2) {
            f.v.y = Math.abs(f.v.y) * 0.35;
            audio.play('thud', { pitch: 1.6 - f.bounced * 0.2 });
            fx.dust(f.p, { count: 6, color: 0xf0da98 });
            if (f.bounced === 1) treat('palm' + N.k, 10, f.p.clone().add(V(0, 1.2, 0)), 'COCONUT');
          } else { f.v.set(0, 0, 0); f.rest = 0.0001; }
        }
        N.nut.position.copy(f.p);
        N.nut.rotation.x += dt * 8;
      } else {
        f.rest += dt;
        // lies there a while, then a new one grows back up top
        if (f.rest > 4) N.nut.scale.setScalar(Math.max(0.001, 1 - (f.rest - 4) * 2));
        if (f.rest > 7) { N.fall = null; N.nut.position.copy(N.top); N.nut.rotation.set(0, 0, 0); N.nut.scale.setScalar(1); }
      }
    }
  });

  // ---------------------------------------------------------------- crabs on the sand
  if (F.crabs?.length) {
    const crabs = liveIM(IP.geo('crab', FUN.crabGrid, 0.06, 'bottom'), F.crabs.length, true);
    crabs.name = 'crabs';
    scene.add(crabs);
    const C = F.crabs.map((p, i) => {
      const o = new THREE.Object3D();
      o.position.copy(p);
      scene.add(o);
      const c = { home: p.clone(), o, ry: Math.random() * 6.28, ph: Math.random() * 10, flee: null, pos: p.clone() };
      home.addPick(o, guard(p, () => {
        if (c.flee) return;
        const a = c.ry + (Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
        c.flee = { t: 0, from: c.pos.clone(), dir: V(Math.sin(a), 0, Math.cos(a)) };
        audio.play('squeak', { pitch: 1.8 + Math.random() * 0.3 });
      }), { radius: 0.9 });
      void i;
      return c;
    });
    const beach = F.crabs.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(1 / F.crabs.length);
    ups.push((dt, t) => {
      crabs.visible = camNear(beach, 90);
      if (!crabs.visible) return;
      C.forEach((c, i) => {
        if (c.flee) {
          const F2 = c.flee;
          F2.t += dt;
          const u = F2.t;
          if (u < 0.7) c.pos.copy(F2.from).addScaledVector(F2.dir, u * 5);
          // burrow: sinks into the sand in a puff, pops back up at home later
          const sink = u > 0.7 ? Math.min(1, (u - 0.7) / 0.3) : 0;
          if (u > 0.7 && !F2.puff) { F2.puff = true; fx.dust(c.pos, { count: 8, color: 0xf0da98 }); }
          setM(crabs, i, V(c.pos.x, I.heightAt(c.pos.x, c.pos.z) - sink * 0.4, c.pos.z), c.ry + Math.sin(t * 30) * 0.15, 0, 0, sink >= 1 ? 0.0001 : 1);
          if (u > 6) { c.flee = null; c.pos.copy(c.home); fx.dust(c.pos, { count: 5, color: 0xf0da98 }); }
        } else {
          // sideways scuttles with pauses
          const k = (t * 0.45 + c.ph) % 4;
          const step = k < 1 ? Math.sin(k * Math.PI) : k < 2 ? 0 : k < 3 ? -Math.sin((k - 2) * Math.PI) : 0;
          const sx = Math.cos(c.ry), sz = -Math.sin(c.ry);
          c.pos.set(c.home.x + sx * step * 0.9, c.home.y, c.home.z + sz * step * 0.9);
          setM(crabs, i, V(c.pos.x, I.heightAt(c.pos.x, c.pos.z) + Math.abs(Math.sin(t * 18)) * 0.03 * (k < 1 || (k > 2 && k < 3) ? 1 : 0), c.pos.z), c.ry, 0, Math.sin(t * 20) * 0.05);
        }
        c.o.position.copy(c.pos);
      });
      crabs.instanceMatrix.needsUpdate = true;
    });
  }

  // ---------------------------------------------------------------- the treasure X (dig it up once a day)
  if (F.xmark) {
    const p = F.xmark;
    const x = IP.mesh(IP.geo('treasureX', FUN.xMarkGrid, 0.1, 'bottom'), { shadow: false });
    const hole = IP.mesh(IP.geo('treasureHole', FUN.holeGrid, 0.1, 'bottom'), { shadow: false });
    for (const m of [x, hole]) { m.position.copy(p).setY(p.y - 0.06); scene.add(m); }
    const TC = treasureChest('gold');
    const chest = new THREE.Group();
    const body = IP.mesh(TC.body, {}), lid = IP.mesh(TC.lid, {});
    lid.position.set(0, TC.lidY, TC.lidZ);
    chest.add(body, lid);
    chest.rotation.y = FACE_Y;
    chest.visible = false;
    scene.add(chest);
    const show = () => { const ready = funReady('treasure'); x.visible = ready; hole.visible = !ready; };
    show();
    let D = null;
    home.addPick(x, guard(p, () => {
      if (D) return;
      if (!funReady('treasure')) { audio.play('tap'); toast('Already dug up today. The X comes back tomorrow.', { icon: 'pin' }); return; }
      D = { t: 0 };
      audio.play('scratch', { pitch: 0.8 });
    }), { radius: 1.4 });
    ups.push((dt) => {
      if (!D) return;
      D.t += dt;
      const u = D.t;
      if (u < 0.9) { if (Math.random() < 0.5) fx.burst(p.clone().add(V(0, 0.2, 0)), { count: 3, colors: [0xf0da98, 0xe0c482, 0xfff0c4], speed: 3, size: 0.09, life: 0.5, up: 1.6 }); return; }
      if (!D.up) { D.up = true; x.visible = false; hole.visible = true; chest.visible = true; audio.play('reveal'); }
      // the chest rises out of the hole, pops open, coins fly
      const k = Math.min(1, (u - 0.9) / 0.5);
      chest.position.copy(p).setY(p.y - 1.1 + k * 1.15);
      if (u > 1.5) lid.rotation.x = -Math.min(1, (u - 1.5) / 0.3) * 1.9;
      if (u > 1.6 && !D.paid) {
        D.paid = true;
        fx.coins?.(p.clone().add(V(0, 1, 0)), 14);
        audio.play('chaching');
        treat('treasure', 25, p.clone().add(V(0, 1.8, 0)), 'TREASURE');
      }
      if (u > 4.2) chest.position.y -= dt * 1.2;
      if (u > 5.2) { chest.visible = false; lid.rotation.x = 0; D = null; show(); }
    });
  }

  // ---------------------------------------------------------------- the geyser (blows every half minute, or when tapped)
  if (F.geyser) {
    const p = F.geyser;
    const mound = IP.mesh(IP.geo('geyser', FUN.geyserGrid, 0.12, 'bottom'), { receive: true });
    mound.position.copy(p).setY(p.y - 0.12);
    mound.name = 'geyser';
    I.root.add(mound); // still: merged by the static batcher
    const N = 72;
    const drops = liveIM(IP.geo('geyserDrop', FUN.dropGrid, 0.15, 'center'), N);
    drops.name = 'geyserDrops';
    scene.add(drops);
    const D = Array.from({ length: N }, () => ({ t: -1, p: new THREE.Vector3(), v: new THREE.Vector3() }));
    const vent = p.clone().add(V(-0.06, 0.75, -0.06));
    let next = 12, erupt = 0, idx = 0;
    const blow = () => { erupt = 1.6; audio.play('whoosh', { pitch: 0.6 }); audio.play('fizz', { pitch: 0.7 }); };
    const tapper = new THREE.Object3D();
    tapper.position.copy(vent);
    scene.add(tapper);
    home.addPick(tapper, guard(p, () => { if (erupt <= 0) { blow(); next = 30; } }), { radius: 1.8 });
    ups.push((dt) => {
      drops.visible = camNear(p, 110);
      if (!drops.visible) return;
      next -= dt;
      if (next <= 0 && erupt <= 0) { next = 30; blow(); }
      if (erupt > 0) {
        erupt -= dt;
        const n = Math.max(1, Math.round((erupt > 1.2 ? 150 : 50) * dt));
        for (let k = 0; k < n; k++) {
          const d = D[idx];
          idx = (idx + 1) % N;
          d.t = 0;
          d.p.copy(vent);
          d.v.set((Math.random() - 0.5) * 1.6, 8 + Math.random() * 5 * Math.min(1, erupt), (Math.random() - 0.5) * 1.6);
        }
      } else if (Math.random() < dt * 3) { // lazy steam pops while it rests
        const d = D[idx];
        idx = (idx + 1) % N;
        d.t = 0; d.p.copy(vent); d.v.set((Math.random() - 0.5) * 0.3, 1.2, (Math.random() - 0.5) * 0.3);
      }
      for (let i = 0; i < N; i++) {
        const d = D[i];
        if (d.t < 0) continue;
        d.t += dt;
        d.v.y -= 12 * dt;
        d.p.addScaledVector(d.v, dt);
        if (d.p.y < vent.y - 0.6 || d.t > 2.4) { d.t = -1; drops.setMatrixAt(i, ZERO); continue; }
        setM(drops, i, d.p, d.t * 3, d.t * 2, 0, 1 - d.t * 0.3);
      }
      drops.instanceMatrix.needsUpdate = true;
    });
  }

  // ---------------------------------------------------------------- the forest cave: something with yellow eyes lives in there
  if (F.cave) {
    const p = F.cave.pos;
    const rock = IP.mesh(IP.geo('cave', FUN.caveGrid, 0.15, 'bottom'), { receive: true });
    rock.position.copy(p).setY(p.y - 0.3);
    rock.rotation.y = F.cave.ry;
    rock.name = 'cave';
    I.root.add(rock);
    const eyes = IP.mesh(IP.geo('caveEyes', FUN.caveEyesGrid, 0.15, 'center'), { shadow: false });
    eyes.position.copy(p).add(V(0, 1.1, -0.75));
    scene.add(eyes);
    const bats = liveIM(IP.geo('batBody', IP.batBodyGrid, 0.07, 'center'), 6, true);
    const wings = liveIM(IP.geo('batWing', IP.batWingGrid, 0.07, [0, 0, 0]), 12);
    scene.add(bats, wings);
    let W2 = null;
    home.addPick(eyes, guard(p, () => {
      if (W2) return;
      W2 = { t: 0 };
      audio.play('growl', { pitch: 0.7 });
      engine.shake(0.08);
    }), { radius: 1.8 });
    const m4 = new THREE.Matrix4(), w4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = V(1, 1, 1), bp = new THREE.Vector3(), rz = new THREE.Matrix4(), ry = new THREE.Matrix4();
    ups.push((dt, t) => {
      // idle: a slow blink every few seconds
      const blink = (t % 5) < 0.14;
      eyes.scale.set(1, blink ? 0.15 : 1, 1);
      bats.visible = wings.visible = !!W2;
      if (!W2) return;
      W2.t += dt;
      const u = W2.t;
      eyes.scale.setScalar(1 + Math.min(1, u * 4) * 0.5);
      if (u > 0.4 && !W2.out) { W2.out = true; audio.play('squeak', { pitch: 2.2 }); }
      for (let i = 0; i < 6; i++) {
        const k = Math.max(0, u - 0.35 - i * 0.08);
        if (k <= 0 || k > 2.6) { bats.setMatrixAt(i, ZERO); wings.setMatrixAt(i * 2, ZERO); wings.setMatrixAt(i * 2 + 1, ZERO); continue; }
        const a = (i / 6) * Math.PI - Math.PI / 2;
        bp.copy(p).add(V(Math.sin(a) * k * 4, 1.1 + k * 3.2 + Math.sin(k * 6 + i) * 0.4, 0.4 + k * 3.5));
        e.set(0, a * 0.6, 0, 'YXZ');
        q.setFromEuler(e);
        m4.compose(bp, q, one);
        bats.setMatrixAt(i, m4);
        const flap = Math.sin(t * 28 + i) * 0.9;
        for (const s of [1, -1]) {
          w4.makeTranslation(0, 0.1, 0).multiply(rz.makeRotationZ(s * flap));
          if (s < 0) w4.multiply(ry.makeRotationY(Math.PI));
          wings.setMatrixAt(i * 2 + (s > 0 ? 0 : 1), m4.clone().multiply(w4));
        }
      }
      bats.instanceMatrix.needsUpdate = true;
      wings.instanceMatrix.needsUpdate = true;
      if (u > 3.4) { W2 = null; eyes.scale.setScalar(1); }
    });
  }

  // ---------------------------------------------------------------- the lighthouse beam (tap: a fast sweep + the horn)
  if (S.lighthouse) {
    const beamMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false });
    disposers.push(() => beamMat.dispose());
    const beam = new THREE.Mesh(IP.geo('lightBeam', FUN.beamGrid, 0.5, [0, 0, 0], 0), beamMat);
    beam.position.copy(S.lighthouse);
    beam.renderOrder = 3;
    beam.name = 'lighthouseBeam';
    scene.add(beam);
    let spin = 0;
    const tapper = new THREE.Object3D();
    tapper.position.copy(S.lighthouse).add(V(0, -4, 0));
    scene.add(tapper);
    home.addPick(tapper, guard(S.lighthouse, () => { spin = 2.2; audio.play('horn', { pitch: 0.6 }); }), { radius: 2.4 });
    ups.push((dt) => {
      spin = Math.max(0, spin - dt);
      beam.rotation.y += dt * (0.55 + spin * 5);
      beam.rotation.x = 0.08;
      beamMat.opacity = 0.3 + spin * 0.12;
    });
  }

  // ---------------------------------------------------------------- a hot-air balloon over the town (tap: burner blast + a hop)
  if (S.square) {
    const bl = IP.mesh(IP.geo('balloon1', () => IP.balloonGrid(0x29b6f6, 0xffffff), 0.12, 'bottom'), {});
    bl.name = 'townBalloon';
    scene.add(bl);
    const c0 = S.square.clone();
    let hop = 0;
    home.addPick(bl, guard(c0, () => {
      hop = 1.6;
      audio.play('flare', { pitch: 0.7 });
      fx.burst(bl.position.clone().add(V(0, 1.3, 0)), { count: 16, colors: [0xffb84a, 0xff6a1f, 0xffe680], speed: 3, size: 0.12, life: 0.6, up: 1.5 });
    }), { radius: 3.2 });
    ups.push((dt, t) => {
      hop = Math.max(0, hop - dt);
      const a = t * 0.025;
      bl.position.set(c0.x + Math.cos(a) * 26, 21 + Math.sin(t * 0.3) * 0.8 + Math.sin((1.6 - hop) / 1.6 * Math.PI) * (hop > 0 ? 3 : 0), c0.z - 6 + Math.sin(a) * 14);
      bl.rotation.y = t * 0.04;
    });
  }

  return {
    update(dt) {
      if (!alive) return;
      const t = home.t ?? 0;
      for (const u of ups) u(dt, t);
    },
    dispose() {
      alive = false;
      for (const d of disposers) d();
    },
  };
}

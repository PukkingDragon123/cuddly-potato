// COMMANDER ULTIMATE: a full cinematic cutscene.
//
// sim.useSignature() freezes the battle in sim time (sim.cinematic, ~4.4 s for
// you, ~3 s for the rival) and the view stops the whole world (engine.timeScale
// = 0: troops, projectiles, particles, the battle clock; battle.js keeps the
// sim's cinematic clock on real time). Only the Commander and the ability move.
//
//   A  HERO      hard cut to the Commander standing on the roof, low angle,
//                slow push-in; the NAME CARD slams in (big pixel letters,
//                kicker chip, tagline); energy gathers in 2D pixel sprites
//   B  WIND-UP   over-the-shoulder across the frozen battlefield; the ability
//                is unleashed (thrown vat / briefcase, rocket launch, whistle)
//   C  FOLLOW    the camera tracks the ability as it crosses the field
//   D  ARRIVAL   wide on the target as it comes in
//   E  PAYOFF    the sim fires it: flash, the payoff word stamps in, slow-mo
//                while the world restarts and the effect resolves (sigFx.js)
//   R  RETURN    ease back to the battle camera, HUD returns
//
// Tap anywhere to skip (the ability lands at once, then a quick look and back).
// The sim stays deterministic: the cutscene only reads it.
import * as THREE from 'three';
import { engine } from '../../core/engine.js';
import { audio } from '../../core/audio.js';
import { rand, lerp, clamp } from '../../core/util.js';
import { animate } from '../../core/tween.js';
import * as Props from '../../models/props.js';
import { h, $overlay } from '../../ui/ui.js';
import { battleCamera } from '../../models/arenas/kit.js';
import { pixSystem } from './pixfx.js';
import { SIG_COL, sigColor, PAYOFF } from './sigFx.js';
import './sigCutscene.css';

export { SIG_COL };

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const outQ = (t) => 1 - (1 - t) * (1 - t);
const inQ = (t) => t * t;
const hex = (css) => new THREE.Color(css).getHex();
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const TAN = Math.tan((30 * Math.PI) / 360);
// phase starts as fractions of the frozen time (A = 0, the ability lands at 1)
const PH = { B: 0.36, L: 0.52, C: 0.58, D: 0.8 };
const PAY = 0.95; // payoff hold after the hit (s, real time)
const BACK = 0.65; // ease back to the battle camera

function prop(name, ...a) {
  try { return typeof Props[name] === 'function' ? Props[name](...a) : null; } catch (e) { console.warn('prop failed', name, e); return null; }
}
function freeObj(o) {
  if (!o) return;
  o.parent?.remove(o);
}

export function playSigCutscene(view, ev) {
  const side = ev.side;
  const sim = view.sim;
  const ch = view.cmds?.[side];
  const s = sim.sides[side];
  const sg = s.cmd?.signature;
  if (!ch || !sg) return null;
  const rival = side !== 0;
  const dir = side === 0 ? 1 : -1;
  const cam = view.camera;
  const scene = view.scene;
  const P = pixSystem(scene);
  const col = sigColor(sg);
  const C = hex(col), W = 0xffffff, G = 0xffe27a;
  const portrait = cam.aspect < 1;
  const D = Math.max(1.5, ev.dur ?? 3);
  const X = Number.isFinite(ev.x) ? ev.x : sim.sigAim?.(side) ?? 0;
  /** camera distance so a w x hh window (world units) fits the screen */
  const fit = (w, hh) => Math.max(hh / (2 * TAN), w / (2 * TAN * cam.aspect));

  // ------------------------------------------------------------ overlay
  const name = sg.name.toUpperCase();
  let li = 0;
  const letters = name.split(' ').map((w) => h('span', { class: 'sc-word' }, [...w].map((c) => h('i', { style: { '--i': li++ } }, c))));
  const kicker = rival ? 'RIVAL ULTIMATE' : `${(s.cmd.name ?? 'COMMANDER').toUpperCase()} · ULTIMATE`;
  const pay = h('div', { class: 'sc-pay' }, h('b', {}, PAYOFF[sg.id] ?? 'BOOM!'));
  const wrap = h('div', { class: `sc-wrap s${side}${rival ? ' rival' : ''}${portrait ? ' port' : ''}`, style: { '--sc': col } },
    h('div', { class: 'sc-tint' }),
    h('div', { class: 'sc-bar top' }, h('i', { class: 'sc-trim' })),
    h('div', { class: 'sc-bar bot' }, h('i', { class: 'sc-trim' })),
    h('div', { class: 'sc-card' },
      h('small', { class: 'sc-kick' }, kicker),
      h('div', { class: 'sc-name' }, h('span', { class: 'sc-chev l' }), h('b', {}, letters), h('span', { class: 'sc-chev r' })),
      sg.tagline ? h('div', { class: 'sc-tag', style: { '--n': li } }, sg.tagline) : null),
    pay,
    h('div', { class: 'sc-skip' }, 'TAP TO SKIP', h('span', { class: 'sc-chev r' })),
    h('div', { class: 'sc-flash' }));
  $overlay().appendChild(wrap);
  requestAnimationFrame(() => wrap.classList.add('in'));
  const flash = (cls = 'go') => {
    const f = wrap.querySelector('.sc-flash');
    f.className = 'sc-flash';
    void f.offsetWidth;
    f.classList.add(cls);
  };

  // ------------------------------------------------------------ freeze the world
  const ctl = { done: false, ownsCamera: true, sig: true, freeze: true };
  let myTS = 0; // the time scale this cutscene set (restored on exit unless someone else changed it since)
  engine.timeScale = 0;
  flash('freeze');
  audio.play('lightsOut', { vol: 0.55 });
  audio.play('whoosh', { pitch: 0.5 });

  // ------------------------------------------------------------ clear the foreground
  // arena props in front of the lane (palms, torches, statues) would block the close shots
  const hidden = [];
  const _b = new THREE.Box3();
  const hideFront = (root) => root?.traverse?.((o) => {
    if (!o.visible || !(o.isMesh || o.isPoints || o.isSprite)) return;
    _b.setFromObject(o);
    if (!_b.isEmpty() && _b.min.z > 1.6 && _b.max.y > 0.35) { o.visible = false; hidden.push(o); }
  });
  const showFront = () => { for (const o of hidden) o.visible = true; hidden.length = 0; };
  try { hideFront(view.arena?.root); for (const b of view.breakables ?? []) if (b.obj && !hidden.includes(b.obj)) hideFront(b.obj); } catch (e) { console.warn('cutscene foreground', e); }

  // ------------------------------------------------------------ the Commander
  ch.busy = true;
  const home = (ch.home ?? ch.root.position).clone();
  const rotY0 = side === 0 ? 0.55 : -0.55;
  const box = new THREE.Box3().setFromObject(ch.root);
  const H = clamp(box.max.y - box.min.y, 0.5, 3);
  ch.root.rotation.set(0, dir * 0.2, 0);
  ch.play('stomp', { restart: true, dur: 0.4, then: 'idle' });
  ch.mood?.('rage', 1.6);
  ch.boing?.(0.5);

  const _hl = V(), _hr = V();
  /** Between the Commander's hands. */
  const handPos = (lift = 0.08) => {
    if (!ch.handWorld) return V(ch.root.position.x, ch.root.position.y + H * 1.05, ch.root.position.z + 0.1);
    ch.handWorld(_hl, 'L');
    ch.handWorld(_hr, 'R');
    return _hl.add(_hr).multiplyScalar(0.5).clone().add(V(0, H * lift, 0.05));
  };
  const chest = () => V(ch.root.position.x, ch.root.position.y + H * 0.55, ch.root.position.z);

  // ------------------------------------------------------------ ability directors
  const tL = D * PH.L;
  // particle emission by rate (per second of cutscene time), so the look doesn't depend on the frame rate
  const acc = {};
  const E = (key, perSec, dt) => { const a = (acc[key] ?? Math.random()) + perSec * dt; const n = Math.floor(a); acc[key] = a - n; return n; };
  const dirc = DIRECTORS[sg.id]?.({ view, sim, side, dir, ch, H, P, X, D, tL, home, handPos, chest, col: C, scene, E }) ?? DIRECTORS.generic({ view, sim, side, dir, ch, H, P, X, D, tL, home, handPos, chest, col: C, scene, E });

  // ------------------------------------------------------------ camera shots
  const pos = V(), lk = V();
  const smPos = V(), smLook = V();
  let smInit = false;
  // A: the Commander framed in the screen band the name card leaves free (card low for you, high for the rival)
  const band = portrait ? 0.3 : 0.43; // screen-height share the letterbox + name card cover on the card's side
  const avail = 1 - 0.11 - band;
  const centerOff = 0.5 - (rival ? band + avail / 2 : 0.11 + avail / 2); // > 0: the free band is above centre
  const heroShot = (k) => {
    const c = chest();
    const Hf = (H * 1.3) / avail; // the Commander fills ~75% of the free band
    const d = Math.max(Hf / (2 * TAN), fit(H * 1.5, 0)) * lerp(1.12, 0.94, outQ(k));
    const vis = 2 * d * TAN;
    return { pos: V(c.x + dir * H * 0.7, c.y - H * 0.2, c.z + d), look: V(c.x + dir * H * 0.1, c.y - centerOff * vis, c.z) };
  };
  // B: low angle from below the roof edge, the Commander against the sky
  const launchShot = (k) => {
    const c = V(home.x, home.y + H * 0.55, home.z);
    const d = fit(H * (portrait ? 2.6 : 3.4), H * 3.6) * lerp(1, 0.9, k);
    return { pos: V(c.x + dir * H * 1.1, Math.max(0.35, c.y - H * 1.5), c.z + d), look: V(c.x + dir * H * 0.35, c.y + H * 0.75, c.z) };
  };
  // C: a tracking shot alongside the travelling ability
  const followShot = (q) => {
    const d = fit(portrait ? 3.4 : 9, 5.5);
    return { pos: V(q.x - dir * (portrait ? 0.8 : 2.6), Math.max(1.2, q.y * 0.9 + 0.7), q.z + d), look: V(q.x + dir * (portrait ? 0.3 : 1.4), Math.max(0.6, q.y), q.z) };
  };
  // D / E: the target, framed with whatever is still coming in (q)
  const arrivalShot = (k, q) => {
    const ty = 0.8, qx = q ? q.x : X, qy = q ? clamp(q.y, 0, 16) : ty;
    const cx = (X + qx) / 2, cy = clamp((ty + qy) / 2 + 0.3, 1.1, 9);
    const w = Math.max(portrait ? 5 : 12, Math.abs(qx - X) + (portrait ? 2.5 : 5));
    const hh = Math.max(5.5, Math.abs(qy - ty) + 3);
    const d = fit(w, hh) * lerp(1.05, 0.96, k);
    return { pos: V(cx - dir * (portrait ? 0.6 : 2.2), Math.min(cy, 4) * 0.5 + 1.5, d), look: V(cx, cy, 0) };
  };
  const battleShot = () => {
    const c = battleCamera(view.camX, view.viewWidth(), cam.aspect, cam.fov, cam.aspect < 1 ? 0.56 : 0.6);
    return { pos: V(...c.pos), look: V(...c.look) };
  };
  const place = (shot, smooth = 0, dt = 0) => {
    if (smooth > 0 && smInit) {
      const a = 1 - Math.exp(-smooth * dt);
      smPos.lerp(shot.pos, a);
      smLook.lerp(shot.look, a);
    } else { smPos.copy(shot.pos); smLook.copy(shot.look); smInit = true; }
    pos.copy(smPos);
    lk.copy(smLook);
    cam.position.copy(pos);
    cam.lookAt(lk);
  };

  // ------------------------------------------------------------ timeline
  let T = 0, landT = -1, back = null, launched = false, arrived = false, cardOut = false, chargeT = 0, boltT = 0, sfxT = 0.2, slowOn = false, lastShot = '';
  let hold = PAY;
  const cut = (name) => {
    if (name === lastShot) return false;
    lastShot = name;
    smInit = false;
    return true;
  };

  ctl.update = (dt) => {
    if (ctl.done) return;
    T += dt;
    ctl.t = T;
    ctl.shot = landT < 0 ? lastShot : T - landT < hold ? 'E' : 'R';
    P.update(dt, cam);
    dirc.tick?.(T, dt, landT >= 0 ? T - landT : -1);
    if (landT < 0) {
      // ---- frozen acts: A hero -> B wind-up -> C follow -> D arrival
      const tB = D * PH.B, tC = D * PH.C, tD = D * PH.D;
      if (T < tB) {
        cut('A');
        place(heroShot(T / tB));
      } else if (T < tC) {
        if (cut('B')) dirc.windup?.();
        place(launchShot((T - tB) / (tC - tB)));
      } else if (T < tD) {
        cut('C');
        const u = (T - tL) / (D - tL);
        place(followShot(dirc.piece(u)), 14, dt);
      } else {
        if (cut('D') && !arrived) { arrived = true; dirc.arrive?.(); }
        const u = (T - tL) / (D - tL);
        const q = dirc.piece(Math.min(1, u));
        if (dirc.dFollow) { const f = followShot(V(q.x, Math.max(q.y, 2.2), q.z)); f.pos.z *= 1.25; place(f, 12, dt); }
        else place(arrivalShot((T - tD) / (D - tD), q), 10, dt);
      }
      if (!launched && T >= tL) { launched = true; dirc.launch?.(); }
      if (launched) dirc.fly?.(clamp((T - tL) / (D - tL), 0, 1), dt);
      // the name card leaves after the wind-up starts
      if (!cardOut && T > tB + 0.15) { cardOut = true; wrap.classList.add('cardout'); }
      if (T > (rival ? 0.12 : 0.3) && !ctl.slammed) {
        ctl.slammed = true;
        wrap.classList.add('slam');
        audio.play('vsSlam', { vol: 0.8 });
        audio.play('thud', { pitch: 0.7 });
        engine.shake(0.25);
      }
      // charge-up energy around the Commander until the launch
      if (!launched) {
        const hp = handPos();
        chargeT -= dt;
        if (chargeT <= 0 && T > 0.12) {
          chargeT = 0.04;
          const kk = Math.min(1, T / tL);
          P.converge(hp, { tex: Math.random() < 0.5 ? 'star4' : Math.random() < 0.5 ? 'plus' : 'diamond', count: 2 + Math.round(kk * 2), radius: H * (1.1 + Math.random() * 0.7), size: H * 0.12, color: [W, C, C, G], glow: 2.2, life: 0.42 });
          P.spawn({ tex: 'ember', x: home.x + rand(-0.5, 0.5) * H, y: home.y + rand(-0.2, 0.2) * H, z: home.z + rand(-0.3, 0.4) * H, vy: H * rand(1.4, 2.4), size: H * 0.07, color: [C, G], glow: 2, life: 0.7, flicker: 0.2 });
        }
        boltT -= dt;
        if (boltT <= 0 && T > tB * 0.6) {
          boltT = 0.08;
          const a2 = Math.random() * Math.PI * 2;
          P.spawn({ tex: 'bolt', x: hp.x + Math.cos(a2) * H * 0.5, y: hp.y + Math.sin(a2) * H * 0.4, z: hp.z + 0.15, size: H * 0.24, size1: H * 0.2, rot: a2, color: [W, C], glow: 2.6, life: 0.12 });
        }
        sfxT -= dt;
        if (sfxT <= 0) { sfxT = 0.26; audio.play('zap', { pitch: 1.1 + T * 0.5, vol: 0.22, gap: 0.1 }); }
      }
      // the sim never landed it (battle ended / paused for long): bow out
      if (T > D + 3) ctl.finish();
      return;
    }
    // ---- E payoff, then R back to the battle
    const tb = T - landT;
    if (slowOn && tb > 0.55) { slowOn = false; if (engine.timeScale === myTS) engine.timeScale = myTS = 1; }
    // the battle just ended (a base fell): its own finale takes the camera
    if (sim.over) { ctl.finish(); return; }
    if (tb > hold - 0.15 && !ctl.out) { ctl.out = true; wrap.classList.remove('in'); wrap.classList.add('out'); }
    if (tb < hold) {
      const q = dirc.focus?.() ?? null;
      const sh = arrivalShot(1 + (tb / hold) * 0.6, q);
      sh.pos.z *= 1 + (tb / hold) * 0.08;
      place(sh, 6, dt); // (snaps on the cut: land() resets the smoothing)
    } else {
      if (!back) {
        back = { pos: cam.position.clone(), look: lk.clone() };
        showFront(); // the foreground props come back as the camera pulls out to the battle view
      }
      const b = battleShot();
      const k = ease(Math.min(1, (tb - hold) / BACK));
      pos.lerpVectors(back.pos, b.pos, k);
      lk.lerpVectors(back.look, b.look, k);
      cam.position.copy(pos);
      cam.lookAt(lk);
    }
    if (tb >= hold + BACK) ctl.finish();
  };

  /** The sim fired the ability ('signature' event): the payoff. */
  ctl.land = (e) => {
    if (ctl.done || landT >= 0) return;
    landT = T;
    ctl.freeze = false;
    if (!launched) { launched = true; dirc.launch?.(true); }
    dirc.land?.(e);
    if (engine.timeScale === myTS) { engine.timeScale = myTS = 0.35; slowOn = true; }
    if (ctl.skipped) hold = 0.6;
    wrap.classList.add('land', 'cardout');
    flash('go');
    void pay.offsetWidth;
    pay.classList.add('go');
    audio.play('vsSting', { vol: 0.7 });
    lastShot = 'E';
    smInit = false;
  };
  ctl.skip = () => {
    if (ctl.done) return;
    if (landT < 0) { ctl.skipped = true; sim.skipCinematic?.(); }
    else if (T - landT < hold) landT = T - hold;
  };
  wrap.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); ctl.skip(); });

  ctl.finish = () => {
    if (ctl.done) return;
    ctl.done = true;
    ctl.ownsCamera = false;
    ctl.freeze = false;
    if (engine.timeScale === myTS && myTS < 1) engine.timeScale = 1;
    dirc.cleanup?.();
    showFront();
    if (!dirc.keepsCommander) {
      ch.root.position.copy(home);
      ch.root.rotation.set(0, rotY0, 0);
      ch.play('sit');
      ch.busy = false;
    }
    wrap.classList.remove('in');
    wrap.classList.add('out');
    setTimeout(() => wrap.remove(), 500);
    // let the cutscene's own sprites finish, then free them
    let t = 0;
    const z = { done: false, update: (dt) => { t += dt; P.update(Math.max(dt, 1 / 60), cam); if (t > 1.5) { P.dispose(); z.done = true; } } };
    view.zones.push(z);
  };
  void inQ;
  return ctl;
}

// ---------------------------------------------------------------------------
// Directors: what each ultimate does on screen.
//   piece(u)   world position of the travelling ability (u 0..1 from launch to the hit)
//   windup()   start of the over-the-shoulder shot      launch(skipped)  it leaves
//   fly(u,dt)  per-frame while it travels                arrive()  the arrival shot starts
//   land(ev)   the sim fired it                         focus()   payoff camera target
//   tick(T, dt, tAfter)  every frame                      cleanup() remove props

const DIRECTORS = {
  /** RECRUIT: a giant vat of MEGA serum is hurled over your army and bursts into mutagen rain. */
  mutantUprising(c) {
    const { ch, H, P, X, dir, home, handPos, scene, side, view, E } = c;
    const G = [0x7cff3a, 0xd4ff9a, 0x3fd14a, 0xffffff];
    const vat = prop('makeBeaker', 0x7cff3a) ?? new THREE.Group();
    vat.scale.setScalar(H * 1.45);
    scene.add(vat);
    let held = true, from = null, apex = null;
    const army = view.sim.alliesOf(side).filter((u) => !u.mega);
    const tx = army.length ? X : X;
    ch.play('holdUp', { restart: true });
    ch.expr('determined', 'grin', 3);
    const d = {
      windup() { ch.mood?.('excited', 1.5); audio.play('slosh', { pitch: 0.7 }); audio.play('vsRiser', { vol: 0.5 }); },
      tick(T, dt) {
        if (held) {
          const hp = handPos(0.02);
          vat.position.set(hp.x, hp.y + H * 0.12, hp.z + 0.05); // held up over the head
          vat.rotation.z = Math.sin(T * 9) * 0.08;
          for (let n = E('e367', 15, dt); n > 0; n--) P.spawn({ tex: 'drop', x: hp.x + rand(-0.2, 0.2) * H, y: hp.y + H * 0.8, z: hp.z + 0.2, vy: rand(0.8, 1.6), size: H * 0.09, color: G, glow: 1.5, life: 0.5 });
          for (let n = E('e368', 9, dt); n > 0; n--) P.spawn({ tex: 'helix', x: hp.x + rand(-0.6, 0.6) * H, y: hp.y + rand(0, 0.6) * H, z: hp.z + 0.3, vy: 1, size: H * 0.22, color: G, glow: 2.2, life: 0.6 });
        }
      },
      launch() {
        held = false;
        from = vat.position.clone();
        apex = V(tx, 6.4, 0.4);
        ch.play('throw', { restart: true, dur: 0.5, then: 'cheer' });
        ch.expr('star', 'shout', 2);
        audio.play('whoosh', { pitch: 0.6 });
        audio.play('swing', { pitch: 0.7 });
      },
      piece(u) {
        if (!from) return vat.position.clone();
        const k = Math.min(1, u / 0.62);
        const p = V().lerpVectors(from, apex, outQ(k));
        p.y += Math.sin(k * Math.PI) * 2.4;
        if (u > 0.62) p.y = apex.y - (u - 0.62) * 0.6;
        return p;
      },
      fly(u, dt) {
        if (vat.visible) {
          const p = d.piece(u);
          vat.position.copy(p);
          vat.rotation.z -= dt * 7 * dir;
          for (let n = E('e393', 27, dt); n > 0; n--) P.spawn({ tex: 'drop', x: p.x, y: p.y, z: p.z + 0.1, vx: -dir * 2, vy: -1, grav: 6, size: 0.22, color: G, glow: 2.2, life: 0.6 });
          if (u >= 0.62) d.burst();
        }
      },
      burst() {
        if (!vat.visible) return;
        vat.visible = false;
        const p = vat.position.clone();
        P.burst(p, { tex: 'diamond', count: 18, speed: 6, size: 0.3, color: [0xffffff, 0xdff8ff], glow: 2.4, life: 0.6, drag: 1.5 });
        P.burst(p, { tex: 'star4', count: 10, speed: 5, size: 0.8, color: G, glow: 2.8, life: 0.4 });
        // the mutagen rain falls over your whole army
        for (let i = 0; i < 80; i++) P.spawn({ tex: 'drop', x: p.x + rand(-5, 5), y: p.y + rand(-0.5, 1.5), z: rand(-1.2, 1.6), vy: rand(-3, -1), grav: 9, delay: rand(0, 0.5), size: rand(0.24, 0.4), color: [0x7cff3a, 0x3fd14a, 0xb8ff6a], glow: 1.35, life: 1.4, ground: 0.08, additive: false }); 
        audio.play('shatter', { pitch: 0.7 });
        audio.play('slime', { pitch: 0.6 });
      },
      arrive() {},
      land() {
        d.burst();
        const q = V(tx, 0.4, 0.3);
        for (let i = 0; i < 26; i++) P.spawn({ tex: 'plus', x: q.x + rand(-5, 5), y: 0.3, z: rand(-1, 1.4), vy: rand(2, 5), size: rand(0.2, 0.34), color: G, glow: 2.4, life: 0.8 });
      },
      focus: () => V(tx, 1.4, 0),
      cleanup() { freeObj(vat); },
    };
    void home;
    return d;
  },

  /** JIMMY: a golden briefcase full of cash flies over the rival army and buys it. */
  beastBuyout(c) {
    const { ch, H, P, X, dir, handPos, scene, view, side, E } = c;
    const bc = prop('makeBriefcase');
    const obj = bc?.root ?? new THREE.Group();
    obj.scale.setScalar(H * 0.95);
    scene.add(obj);
    const CASH = [0x5fdc4a, 0x8af07a, 0xd4ffb0];
    const GOLD = [0xffd84a, 0xfff2b0, 0xffb02e, 0xffffff];
    let held = true, from = null, to = null, lidT = 0;
    // the troops the buyout will take (same pick as the sim)
    const sg = view.sim.sides[side].cmd.signature;
    const value = (u) => (u.cost || 1) * 1000 + u.maxHp;
    const targets = view.sim.enemiesOf(side).filter((u) => !u.boss && !u.mega && u.state !== 'spawn').sort((a, b) => value(b) - value(a)).slice(0, sg.buy);
    ch.play('present', { restart: true });
    ch.expr('money', 'grin', 3);
    const d = {
      windup() {
        lidT = 0.001;
        ch.play('holdUp', { restart: true }); // the open case goes up over his head
        audio.play('latch', { pitch: 0.9 });
        audio.play('vsRiser', { vol: 0.5 });
        ch.mood?.('excited', 1.5);
      },
      tick(T, dt) {
        if (lidT > 0 && lidT < 1) { lidT = Math.min(1, lidT + dt * 2.5); bc?.open(outQ(lidT)); }
        if (held) {
          const hp = handPos(-0.05);
          if (lidT > 0) {
            obj.position.set(hp.x, hp.y + H * 0.02, hp.z + 0.05); // overhead, lid open, cash spraying out
            obj.rotation.set(0, Math.PI - dir * 0.25, 0);
          } else {
            obj.position.set(hp.x, hp.y - H * 0.42, hp.z + 0.3); // held out at waist height
            obj.rotation.set(0, Math.PI - dir * 0.25, 0);
          }
          if (lidT > 0) for (let n = E('cash', 21, dt); n > 0; n--) P.spawn({ tex: Math.random() < 0.5 ? 'cash' : 'dollar', x: hp.x + rand(-0.3, 0.3) * H, y: hp.y + H * 0.2, z: hp.z + 0.3, vx: rand(-1, 1), vy: rand(2, 4), grav: 4, size: H * 0.16, color: Math.random() < 0.5 ? CASH : GOLD, glow: 1.8, life: 0.8, spin: rand(-5, 5) });
        }
        // the bought troops get price-tagged while the world is frozen
        if (lidT > 0) {
          for (const u of targets) {
            const a = view.actors.get(u.id);
            if (!a || !E('tag' + u.id, 5, dt)) continue;
            const q = a.rig.root.position, hh = Math.max(0.5, a.rig.height);
            P.spawn({ tex: 'dollar', x: q.x + rand(-0.3, 0.3), y: q.y + hh + rand(0.1, 0.5), z: q.z + 0.4, vy: 0.7, size: 0.32, color: GOLD, glow: 2.4, life: 0.5 });
          }
        }
      },
      launch() {
        held = false;
        from = obj.position.clone();
        to = V(X, 5.2, 0.5);
        ch.play('throw', { restart: true, dur: 0.5, then: 'holdUp' });
        ch.expr('star', 'shout', 2);
        audio.play('whoosh', { pitch: 0.7 });
        audio.play('chaching');
      },
      piece(u) {
        if (!from) return obj.position.clone();
        const k = Math.min(1, u / 0.7);
        const p = V().lerpVectors(from, to, outQ(k));
        p.y += Math.sin(k * Math.PI) * 2;
        return p;
      },
      fly(u, dt) {
        const p = d.piece(u);
        obj.position.copy(p);
        obj.rotation.y += dt * 5;
        for (let n = E('e488', 27, dt); n > 0; n--) P.spawn({ tex: 'cash', x: p.x, y: p.y, z: p.z, vx: rand(-1.5, 1.5) - dir, vy: rand(-0.5, 1.5), grav: 3, size: 0.32, color: CASH, glow: 1.4, life: 1.2, spin: rand(-6, 6), additive: false });
        if (u >= 0.7 && !d.rained) {
          d.rained = true;
          bc?.open(1);
          for (let i = 0; i < 60; i++) P.spawn({ tex: Math.random() < 0.75 ? 'cash' : 'dollar', x: X + rand(-4.5, 4.5), y: 5.4 + rand(0, 2), z: rand(-1.2, 1.6), vx: rand(-0.5, 0.5), vy: rand(-2.5, -1), grav: 1.5, delay: rand(0, 0.4), size: rand(0.3, 0.42), color: Math.random() < 0.7 ? CASH : GOLD, glow: 1.5, life: 1.8, spin: rand(-4, 4), ground: 0.05, additive: false });
          audio.play('coin', { pitch: 1.2 });
        }
      },
      land() {
        obj.visible = false;
        P.burst(obj.position, { tex: 'star4', count: 14, speed: 6, size: 0.7, color: GOLD, glow: 2.8, life: 0.4 });
      },
      focus: () => V(X, 1.3, 0),
      cleanup() { freeObj(obj); },
    };
    return d;
  },

  /** NOLAN: rides a soda rocket into orbit and belly-flops back down as a meteor. */
  orbitalFlop(c) {
    const { ch, H, P, X, dir, home, scene, side, E } = c;
    const rocket = prop('makeSodaRocket') ?? new THREE.Group();
    const RS = H * 1.25;
    rocket.scale.setScalar(RS);
    const rb = new THREE.Box3().setFromObject(rocket);
    const rTop = rb.max.y, rBot = rb.min.y; // relative to the rocket's origin at scale RS
    rocket.scale.setScalar(0.001);
    rocket.position.set(home.x, home.y - rBot, home.z);
    scene.add(rocket);
    const SKY = 14;
    const overX = X - dir * 1.2; // the dive starts high over the target
    const FIRE = [0xff3a1a, 0xff7a1f, 0xffd84a, 0xfff2b0];
    const STAR = [0xffffff, 0xbfe8ff, 0xffe27a];
    let phase = 'roof', grow = 0;
    const _rb = new THREE.Box3();
    /** Top of the rocket's nose cone right now (Nolan stands on it). */
    const noseY = () => (grow > 0.02 ? _rb.setFromObject(rocket).max.y - RS * grow * 0.24 : home.y); // feet on the cone, not the needle tip
    ch.play('flex', { restart: true });
    ch.expr('determined', 'grin', 3);
    const d = {
      keepsCommander: true,
      dFollow: true, // the arrival shot rides the meteor down
      windup() {
        phase = 'rocket';
        ch.play('stomp', { restart: true, dur: 0.3, then: 'idle' });
        ch.expr('star', 'grin', 2);
        audio.play('fizz', { pitch: 0.8 });
        audio.play('vsRiser', { vol: 0.5 });
        animate(0.3, (e) => { grow = e; rocket.scale.setScalar(Math.max(0.001, RS * e)); rocket.position.y = home.y - rBot * e; }, { ease: 'outBack' });
      },
      tick(T, dt) {
        if (phase === 'rocket') {
          // Nolan rides up on the rocket's nose; foam hisses out of the bottle
          ch.root.position.set(home.x, noseY(), home.z);
          for (let n = E('e542', 24, dt); n > 0; n--) P.spawn({ tex: 'cloud', x: home.x + rand(-0.6, 0.6), y: home.y + 0.1, z: home.z + rand(-0.2, 0.5), vx: rand(-1.5, 1.5), vy: rand(0.2, 0.8), drag: 2, size: rand(0.4, 0.7), color: [0xffffff, 0xdff2ff], glow: 1.1, life: 0.6, additive: false });
        }
      },
      launch() {
        phase = 'up';
        grow = 1;
        rocket.scale.setScalar(RS);
        ch.play('cheer', { restart: true });
        ch.expr('star', 'shout', 2);
        audio.play('engine', { pitch: 1.4 });
        audio.play('boom', { pitch: 1.2, vol: 0.6 });
        engine.shake(0.4);
      },
      /** Nolan himself: blast-off (0-0.3), across the sky (0.3-0.55), the meteor dive (0.55-1). */
      piece(u) {
        const top = home.y + (rTop - rBot);
        if (u < 0.3) { const k = inQ(u / 0.3); return V(home.x, lerp(top, SKY, k) + H * 0.5, home.z); }
        if (u < 0.55) { const k = ease((u - 0.3) / 0.25); return V(lerp(home.x, overX, k), SKY + H * 0.5 + Math.sin(k * Math.PI) * 1.5, lerp(home.z, 0.2, k)); }
        const k = inQ((u - 0.55) / 0.45);
        return V(lerp(overX, X, k), lerp(SKY, 0.05, k) + H * 0.5 * (1 - k), lerp(0.2, 0.3, k));
      },
      fly(u, dt) {
        const p = d.piece(u);
        if (u < 0.3) {
          rocket.position.set(p.x, p.y - H * 0.5 - (rTop - rBot) - rBot, p.z);
          ch.root.position.set(p.x, noseY(), p.z);
          for (let n = E('e568', 90, dt); n > 0; n--) P.spawn({ tex: 'flame', x: p.x + rand(-0.25, 0.25), y: rocket.position.y + rBot, z: p.z + 0.2, vx: rand(-1, 1), vy: rand(-9, -5), size: rand(0.5, 0.9), color: FIRE, glow: 2.4, life: 0.4 });
          for (let n = E('e569', 21, dt); n > 0; n--) P.spawn({ tex: 'cloud', x: p.x + rand(-0.5, 0.5), y: rocket.position.y + rBot - 0.4, z: p.z, vx: rand(-1.2, 1.2), vy: -1.2, drag: 1.5, size: rand(0.8, 1.3), color: [0xffffff, 0xe8f4ff], glow: 1.05, life: 1.1, additive: false });
          for (let n = E('e570', 18, dt); n > 0; n--) P.spawn({ tex: 'streak', x: p.x + rand(-1.2, 1.2), y: p.y + rand(-1, 2), z: p.z + 0.6, vy: -14, size: rand(0.5, 0.9), color: [0xffffff, 0xdff2ff], glow: 2, life: 0.25 });
        } else if (u < 0.55) {
          if (phase !== 'orbit') {
            phase = 'orbit';
            rocket.visible = false;
            P.burst(p, { tex: 'star4', count: 16, speed: 4, size: 0.5, color: STAR, glow: 2.6, life: 0.7, drag: 1.5 });
            ch.play('jump', { restart: true });
            ch.expr('star', 'grin', 2);
            audio.play('shimmer', { vol: 0.6 });
          }
          ch.root.position.set(p.x, p.y - H * 0.5, p.z);
          ch.root.rotation.set(0, side === 0 ? Math.PI / 2 : -Math.PI / 2, -dir * ((u - 0.3) / 0.25) * Math.PI * 1.5);
          // up here it's space: twinkling pixel stars around him
          for (let n = E('e583', 18, dt); n > 0; n--) P.spawn({ tex: Math.random() < 0.6 ? 'plus' : 'star4', x: p.x + rand(-3, 3), y: p.y + rand(-2, 2.5), z: p.z - rand(0.5, 3), size: rand(0.15, 0.35), color: STAR, glow: 2.2, life: rand(0.4, 0.8), flicker: 0.3 });
        } else {
          if (phase !== 'dive') {
            phase = 'dive';
            ch.play('bellyflop', { restart: true });
            ch.expr('fire', 'shout', 3);
            audio.play('whoosh', { pitch: 0.4 });
            audio.play('flare', { pitch: 0.5, vol: 0.7 });
          }
          ch.root.position.set(p.x, p.y - H * 0.5, p.z);
          ch.root.rotation.set(0, side === 0 ? Math.PI / 2 : -Math.PI / 2, 0); // the belly-flop pose lies him belly-down
          // meteor: flames wrapped around him and a long fire trail streaming up
          for (let n = E('e595', 55, dt); n > 0; n--) P.spawn({ tex: 'flame', x: p.x + rand(-0.55, 0.55) * H, y: p.y + rand(-0.2, 0.7) * H, z: p.z - rand(0.15, 0.6), vy: rand(4, 8), size: rand(0.35, 0.75) * H, color: FIRE, glow: 2.5, life: 0.32 });
          for (let n = E('e596', 24, dt); n > 0; n--) P.spawn({ tex: 'streak', x: p.x + rand(-0.6, 0.6), y: p.y + H * 1.2, z: p.z + 0.3, vy: 12, size: rand(0.8, 1.4), color: [0xffffff, 0xffd84a], glow: 2.6, life: 0.22 });
          for (let n = E('e597', 18, dt); n > 0; n--) P.spawn({ tex: 'ember', x: p.x, y: p.y + H * 0.5, z: p.z + 0.2, vx: rand(-2, 2), vy: rand(3, 6), size: 0.22, color: FIRE, glow: 2.4, life: 0.6 });
        }
        void dt;
      },
      land() {
        rocket.visible = false;
        phase = 'down';
        ch.root.position.set(X, 0.02, 0.3);
        ch.root.rotation.set(0, side === 0 ? Math.PI / 2 : -Math.PI / 2, 0);
        ch.play('bellyflop', { restart: true });
        ch.expr('dizzy', 'wobble', 2);
      },
      focus: () => V(X, 1.2, 0),
      cleanup() {
        freeObj(rocket);
        // Nolan picks himself up out of the crater and hops home
        if (phase !== 'down') d.land();
        const start = ch.root.position.clone();
        const back = home.clone();
        ch.root.rotation.set(0, side === 0 ? -Math.PI / 2 : Math.PI / 2, 0);
        ch.play('run');
        ch.expr('happy', 'grin', 2);
        animate(1.3, (e, k) => {
          ch.root.position.set(lerp(start.x, back.x, k), lerp(start.y, back.y, k) + Math.sin(k * Math.PI) * 3.2, lerp(start.z, back.z, k));
        }, {
          onComplete: () => {
            ch.root.position.copy(back);
            ch.root.rotation.set(0, side === 0 ? 0.55 : -0.55, 0);
            ch.play('sit');
            ch.busy = false;
          },
        });
      },
    };
    return d;
  },

  /** JUAN: the final whistle; a wave of stopped time rolls across the field onto the rival army. */
  tiempoMuerto(c) {
    const { ch, H, P, X, dir, home, E } = c;
    const AM = [0xffa31a, 0xffd27a, 0xff7a1f, 0xfff2c8];
    let fx0 = null;
    ch.play('whistle', { restart: true });
    ch.expr('determined', 'shout', 3);
    const d = {
      windup() {
        audio.play('vsRiser', { vol: 0.5 });
        // a giant clock appears in the sky behind Juan, its hands racing
        P.spawn({ tex: 'clock', x: home.x + dir * H * 1.2, y: home.y + H * 2.2, z: home.z - 1.5, size: H * 2.6, size1: H * 2.6, spin: -3, color: 0xffb02e, glow: 1.35, life: 1.6, additive: false });
        P.burst(V(home.x + dir * H * 1.2, home.y + H * 2.2, home.z - 1.2), { tex: 'plus', count: 16, speed: 3, size: H * 0.14, color: AM, glow: 2.2, life: 0.8, drag: 2 });
      },
      tick(T, dt) {
        if (fx0 === null && Math.random() < 0.15) audio.play('tick', { pitch: 1 + T * 0.4, vol: 0.4, gap: 0.12 });
        void dt;
      },
      launch() {
        fx0 = home.x + dir * 1.5;
        ch.play('point', { restart: true });
        ch.expr('star', 'shout', 2);
        audio.play('bell', { pitch: 1.8 });
        audio.play('horn', { pitch: 1.7, vol: 0.5 });
        audio.play('freeze', { pitch: 0.8 });
      },
      piece(u) {
        // the wave reaches the rival army (X) as the ability lands, and rolls on to their base
        const x = lerp(fx0 ?? home.x, X + dir * 0.6, Math.min(1, u));
        return V(x, 1.6, 0.4);
      },
      fly(u, dt) {
        const p = d.piece(u);
        // the wave front: a wall of clock glyphs and amber sparks; stopped flecks hang behind it
        // the wave front: a wall of clock glyphs, hexes and amber streaks; stopped flecks hang in the air behind it
        for (let n = E('e669', 30, dt); n > 0; n--) P.spawn({ tex: 'clock', x: p.x + rand(-0.3, 0.3), y: rand(0.3, 4.2), z: rand(-0.8, 1.4), size: rand(0.5, 1.1), size1: 0.25, spin: rand(-4, 4), color: AM, glow: 2, life: 0.5 });
        for (let n = E('e670', 21, dt); n > 0; n--) P.spawn({ tex: 'streak', x: p.x + rand(-0.2, 0.2), y: rand(0.3, 4), z: rand(-0.6, 1.2), vy: rand(-2, 2), size: rand(0.45, 0.7), color: [0xffb02e, 0xffd27a], glow: 1.6, life: 0.22 });
        for (let n = E('e671', 60, dt); n > 0; n--) P.spawn({ tex: 'plus', x: p.x - dir * rand(0, 0.6), y: rand(0.2, 4.2), z: rand(-1, 1.6), size: rand(0.14, 0.26), color: AM, glow: 2.2, life: rand(1.5, 2.5) });
        for (let n = E('e672', 18, dt); n > 0; n--) P.spawn({ tex: 'hex', x: p.x, y: rand(0.5, 3.5), z: rand(-0.5, 1.2), vx: dir * 5, size: rand(0.35, 0.55), color: AM, glow: 2.2, life: 0.4 });
        void dt;
      },
      arrive() {
        audio.play('tick', { pitch: 0.6, vol: 0.6 });
      },
      land() {
        const p = V(X, 1.6, 0.5);
        P.burst(p, { tex: 'clock', count: 6, speed: 4, size: 0.8, color: AM, glow: 2, life: 0.6 });
        P.burst(p, { tex: 'star4', count: 10, speed: 5, size: 0.7, color: [0xffffff, 0xffd27a], glow: 2.8, life: 0.4 });
      },
      focus: () => V(X, 1.4, 0),
      cleanup() {},
    };
    return d;
  },

  /** Fallback for an unknown ultimate: a plain charge and blast. */
  generic(c) {
    const { X } = c;
    return { piece: (u) => V(lerp(c.home.x, X, u), 2, 0.4), focus: () => V(X, 1.2, 0) };
  },
};

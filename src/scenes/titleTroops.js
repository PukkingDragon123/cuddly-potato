// Real 3D swarm troops playing on the title logo (scenes/title.js).
//
// A transparent Stage3D (ui/stage3d.js) sits over the Swarm Block lettering; each
// troop is pinned to one letter, measured from the DOM so it stays put on any screen:
//   stand  lands on top of a letter (dust puff), idles, now and then roars / stomps
//   peek   hides behind a letter and peeks over its top edge (clipped at the edge,
//          so it reads as being behind the letters), looking left and right
//   climb  grips the outside edge of a letter, facing it, climbs, slips, climbs again
//   hang   hangs upside down by its feet from a letter's bottom edge and swings
// The letters themselves are never moved or tilted.
//
//   const tr = logoTroops(logoEl); ... tr.dispose();
import * as THREE from 'three';
import { Stage3D } from '../ui/stage3d.js';
import { createSwarm } from '../models/swarmModels.js';
import { dustPuff, BOX_H } from '../ui/bigType.js';
import { audio } from '../core/audio.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const clamp01 = (k) => (k < 0 ? 0 : k > 1 ? 1 : k);
const outBack = (k) => { const c = 1.9; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); };
const FACE_TOP = 2 / BOX_H, FACE_BOT = 30 / BOX_H, BOX_BOT = 34 / BOX_H, SIDE = 2; // art rows / cols of the letter box

// who goes where: line (0 MRBEAST / 1 SWARMERS), letter index (negative from the end)
const CAST = [
  { id: 'fryFiend', role: 'stand', line: 0, at: -1, h: 1.15, yaw: -0.45, t: 1.15 },
  { id: 'cloggedToilet', role: 'peek', line: 0, at: 4, h: 1.35, t: 2.2 },
  { id: 'toiletRollRipper', role: 'climb', line: 0, at: 0, h: 1.0, t: 1.5 },
  { id: 'panther', role: 'stand', line: 1, at: -1, h: 0.95, yaw: -0.55, t: 1.9 },
  { id: 'trashedCan', role: 'stand', line: 1, at: 0, h: 0.8, yaw: 0.5, t: 2.7 },
  { id: 'pizzaSlicer', role: 'hang', line: 1, at: 1, h: 0.85, t: 2.45 },
];

export function logoTroops(logo, o = {}) {
  const host = document.createElement('div');
  host.className = 'tt-troops';
  logo.appendChild(host);
  const st = new Stage3D({ fov: 10, maxPixels: 1.3e6, rimA: 0xff7ac8, rimB: 0xffd84a, rimI: 2.6, key: 2.8, hemi: 1.5 });
  const D = 60;
  st.camera.position.set(0, 0, D);
  st.camera.lookAt(0, 0, 0);
  st.mount(host);

  const lines = [...logo.querySelectorAll('.l1 .bt, .l2 .bt')].map((bt) => [...bt.querySelectorAll('.bt-ch')]);
  let k = 0.01, hw = 0, hh = 0; // world units per css px, host size
  const toW = (x, y, out = new THREE.Vector3()) => out.set((x - hw / 2) * k, (hh / 2 - y) * k, 0);
  /** Letter box in host px (layout only, so the entrance transforms don't move it). */
  const box = (el) => {
    let x = 0, y = 0, n = el;
    while (n && n !== logo) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
    return { x: x - host.offsetLeft, y: y - host.offsetTop, w: el.offsetWidth, h: el.offsetHeight };
  };

  const actors = [];
  for (const c of CAST) {
    const L = lines[c.line];
    const el = L?.[c.at < 0 ? L.length + c.at : c.at];
    if (!el) continue;
    let rig;
    try { rig = createSwarm(c.id, {}); } catch (e) { continue; }
    rig.posed = true;
    for (let i = 0; i < 4; i++) rig.update(0.016);
    const b3 = new THREE.Box3().setFromObject(rig.root);
    const pivot = new THREE.Group(); // pinned to the letter
    const body = new THREE.Group(); // the troop's own offset / orientation
    body.add(rig.root);
    pivot.add(body);
    pivot.visible = false;
    st.add(pivot);
    actors.push({ ...c, el, rig, pivot, body, h0: Math.max(0.05, b3.max.y - b3.min.y), foot: b3.min.y, T: 0, on: false, nextMove: rnd(2.5, 5), phase: Math.random() * 6 });
  }

  // world-space clip line for each peeker (only what rises above its letter shows)
  const clip = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  st.renderFn = (R, scene, cam) => {
    const peek = actors.filter((a) => a.role === 'peek' && a.on);
    for (const a of peek) a.pivot.visible = false;
    R.render(scene, cam);
    if (!peek.length) return;
    R.autoClear = false;
    const vis = actors.map((a) => a.pivot.visible);
    for (const a of actors) a.pivot.visible = false;
    for (const a of peek) {
      a.pivot.visible = true;
      clip.constant = -a.clipY;
      R.clippingPlanes = [clip];
      R.render(scene, cam);
      a.pivot.visible = false;
    }
    actors.forEach((a, i) => { a.pivot.visible = vis[i]; });
    for (const a of peek) a.pivot.visible = true;
  };

  const layout = () => {
    hw = host.clientWidth; hh = host.clientHeight;
    if (hw < 2 || hh < 2) return;
    const H = 2 * D * Math.tan(THREE.MathUtils.degToRad(st.camera.fov / 2));
    k = H / hh;
    for (const a of actors) {
      const b = box(a.el);
      const face = b.h * (FACE_BOT - FACE_TOP);
      const s = (face * a.h * k) / a.h0;
      a.rig.root.scale.setScalar(s);
      a.s = s;
      a.H = face * a.h * k; // troop height, world
      const cx = b.x + b.w / 2;
      if (a.role === 'stand') { toW(cx + b.w * 0.04, b.y + b.h * (FACE_TOP * 0.5), a.pivot.position); }
      else if (a.role === 'peek') {
        toW(cx, b.y + b.h * FACE_TOP, a.pivot.position);
        a.clipY = a.pivot.position.y;
        a.pivot.position.z = -0.4;
      } else if (a.role === 'climb') {
        toW(b.x + (SIDE / BOX_H) * b.h * 0.2, b.y + b.h * FACE_BOT, a.pivot.position);
        a.climbH = face * k;
      } else if (a.role === 'hang') { toW(cx, b.y + b.h * BOX_BOT, a.pivot.position); a.pivot.position.z = 0.3; }
      a.rig.root.position.y = -a.foot * s;
      a.depth = a.rig.length * s;
    }
  };
  st.onResize = layout;

  const puff = (a, theme) => {
    const b = box(a.el);
    const p = dustPuff(theme, Math.round(b.w / b.h * BOX_H));
    p.classList.add('tt-puff');
    p.style.left = `${b.x + host.offsetLeft + b.w / 2}px`;
    p.style.top = `${b.y + host.offsetTop}px`;
    p.style.fontSize = `${b.h}px`;
    logo.appendChild(p);
    setTimeout(() => p.remove(), 1000);
  };

  let t = 0;
  const yAxis = new THREE.Vector3(0, 1, 0);
  const t0 = performance.now();
  st.onUpdate((dt0) => {
    // the timeline follows the wall clock (it lines up with the CSS letter entrances even on a slow frame rate)
    const now = (performance.now() - t0) / 1000;
    const dt = Math.min(0.25, Math.max(0, now - t));
    t = now;
    for (const a of actors) {
      if (t < a.t) continue;
      if (!a.on) { a.on = true; a.pivot.visible = true; }
      a.T = t - a.t;
      const T = a.T, rig = a.rig, body = a.body, H = a.H ?? 1;
      if (a.role === 'stand') {
        // drops from above, lands with a boing and a dust puff, then idles
        const fall = 0.42;
        if (T < fall) { const q = T / fall; body.position.y = (1 - q * q) * H * 4; body.scale.set(0.9, 1.15, 0.9); }
        else {
          if (!a.landed) { a.landed = true; rig.boing(0.55); puff(a, a.line ? 'gold' : 'pink'); audio.play('boing', { vol: 0.25, pitch: rnd(1.1, 1.4), gap: 0.1 }); }
          body.position.y = 0;
          body.scale.setScalar(1);
          body.quaternion.setFromAxisAngle(yAxis, a.yaw + Math.sin(T * 0.7 + a.phase) * 0.25);
          if ((a.nextMove -= dt) < 0) { a.nextMove = rnd(3.2, 5.5); rig.play(Math.random() < 0.5 ? 'roar' : 'stomp', 1.1); rig.boing(0.25); }
        }
      } else if (a.role === 'peek') {
        // rise up behind the letter, look around, duck, pop back up
        const cyc = 4.6, c = (T + 0.9) % cyc;
        const up = c < 0.35 ? outBack(c / 0.35) : c < 3.4 ? 1 : c < 3.7 ? 1 - (c - 3.4) / 0.3 : 0;
        if (c < dt && T > 1) rig.boing(0.35);
        body.position.y = -H * 1.05 + up * H * 0.8;
        body.quaternion.setFromAxisAngle(yAxis, Math.sin(T * 1.6) * 0.55);
      } else if (a.role === 'climb') {
        // grips the letter's outer edge, facing it: climbs up, hangs on, slips a little, climbs again
        const cyc = 5.2, c = T % cyc, top = a.climbH * 0.42;
        let y;
        if (c < 2.6) { y = (c / 2.6) * top; rig.setState('walk'); }
        else if (c < 3.6) { y = top; rig.setState('idle'); }
        else if (c < 3.9) { y = top * (1 - outBack(clamp01((c - 3.6) / 0.3)) * 0.55); if (!a.slip) { a.slip = true; rig.boing(0.4); } }
        else { y = top * 0.45 * (1 - (c - 3.9) / 1.3); rig.setState('walk'); a.slip = false; }
        const appear = clamp01(T / 0.3);
        const yaw = Math.PI / 2 - 0.35 + Math.sin(T * 5) * 0.08; // turned to the letter, a little toward the camera
        body.quaternion.setFromAxisAngle(yAxis, yaw);
        body.position.set(-a.depth * 0.42 + Math.sin(T * 10) * a.H * 0.015, y - a.H * 0.35, 0);
        body.scale.setScalar(outBack(appear) || 0.001);
        rig.walkRate = 0.55;
      } else if (a.role === 'hang') {
        // swings in from a big arc that settles into a lazy sway, kicking now and then
        const amp = 0.18 + 0.9 * Math.exp(-T * 1.4);
        a.pivot.rotation.z = Math.sin(T * 2.4 + 0.6) * amp; // the troop swings, the letter stays still
        body.rotation.set(0, 0, Math.PI);
        body.scale.setScalar(outBack(clamp01(T / 0.35)) || 0.001);
        if ((a.nextMove -= dt) < 0) { a.nextMove = rnd(2.6, 4.5); rig.play('claw', 0.8); }
      }
      rig.update(Math.min(dt, 0.05));
    }
  });
  st.start();
  layout();
  return {
    dispose() { st.dispose(); host.remove(); },
  };
}

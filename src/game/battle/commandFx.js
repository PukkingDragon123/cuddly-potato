// Commander + base interaction visuals for the Battle Cats-style controls:
//
//   ChargeAura   electric energy that builds up around a Commander as the MEGA
//                charges: crackling voxel lightning bolts (instanced cubes, HDR
//                so they bloom), orbiting sparks and a world label with the
//                charge; at 100% it goes wild and the label says TAP!
//   BaseBadge    a floating upgrade sign in front of your base ("LAB SHACK
//                5 power") - tap it (or the base) to upgrade
import * as THREE from 'three';
import { fx } from '../../core/particles.js';
import { audio } from '../../core/audio.js';
import { h, icon } from '../../ui/ui.js';
import { BASE_UPGRADES, MEGA } from '../../data/labs.js';

const CUBE = new THREE.BoxGeometry(1, 1, 1);
const BOLT_CUBES = 30;
const MAX_BOLTS = 4;
const RING_N = 24;
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

/** Jagged lightning polyline from a to b (midpoint displacement), written into out[]. */
function boltPath(a, b, out, rough, rng) {
  out.length = 0;
  out.push(a.clone(), b.clone());
  for (let pass = 0; pass < 3; pass++) {
    const next = [out[0]];
    for (let i = 1; i < out.length; i++) {
      const p0 = out[i - 1], p1 = out[i];
      const mid = p0.clone().lerp(p1, 0.4 + rng() * 0.2);
      const len = p0.distanceTo(p1);
      mid.x += (rng() - 0.5) * len * rough;
      mid.y += (rng() - 0.5) * len * rough;
      mid.z += (rng() - 0.5) * len * rough * 0.6;
      next.push(mid, p1);
    }
    out.splice(0, out.length, ...next);
  }
  return out;
}

export class ChargeAura {
  constructor(view, side, layer) {
    this.view = view;
    this.side = side;
    this.t = 0;
    this.regenT = 0;
    this.crackleT = 1;
    this.sparkT = 0;
    this.k = 0;
    // voxel lightning: two colour layers (white-hot core, coloured glow) as instanced cubes
    const mk = (hex, mul) => new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(mul), toneMapped: false, transparent: true, opacity: 1, depthWrite: false });
    this.core = new THREE.InstancedMesh(CUBE, mk(0xffffff, 2.6), BOLT_CUBES * MAX_BOLTS);
    this.glow = new THREE.InstancedMesh(CUBE, mk(side === 0 ? 0x5fe8ff : 0xff5a9a, 2.2), BOLT_CUBES * MAX_BOLTS);
    for (const im of [this.core, this.glow]) {
      im.count = 0;
      im.frustumCulled = false;
      im.renderOrder = 7;
      view.scene.add(im);
    }
    this.path = [];
    // electric halo: voxel cubes orbiting the Commander, one more lights up per ~4% of charge
    this.ring = new THREE.InstancedMesh(CUBE, mk(side === 0 ? 0x9ff2ff : 0xffb0cc, 2.4), RING_N);
    this.ring.count = 0;
    this.ring.frustumCulled = false;
    this.ring.renderOrder = 7;
    view.scene.add(this.ring);
    // world label: "MEGA 63%" with an electric bar / TAP!
    this.fill = h('i', { class: 'f' });
    this.txt = h('b', {}, '');
    this.el = h('div', { class: `cmd-charge s${side}` }, icon('powerBolt'), h('div', { class: 'bar' }, this.fill), this.txt);
    layer.appendChild(this.el);
  }

  dispose() {
    for (const im of [this.core, this.glow, this.ring]) {
      this.view.scene.remove(im);
      im.dispose();
    }
    this.el.remove();
  }

  /** The big release when the MEGA is unleashed. */
  discharge(pos) {
    fx.burst(pos.clone().setY(pos.y + 0.8), { count: 60, colors: [0xffffff, 0x9ff2ff, 0xffe27a], size: 0.12, speed: 9 });
    fx.shockwave(new THREE.Vector3(pos.x, 0.05, pos.z), { radius: 5, color: this.side === 0 ? 0x5fe8ff : 0xff5a9a });
    this.burstT = 0.8;
  }

  /** k: MEGA charge 0..1 (null = no MEGA), state: 'locked' | 'charging' | 'ready' | 'used' */
  update(dt, ch, k, state) {
    this.t += dt;
    const visible = !!ch && k !== null && state !== 'used' && !this.view.sim.over;
    this.k += ((k ?? 0) - this.k) * Math.min(1, dt * 4);
    if (!visible) {
      this.core.count = this.glow.count = this.ring.count = 0;
      this.el.style.display = 'none';
      return;
    }
    const p = ch.root.position;
    const sc = ch.root.scale.x || 1;
    const center = _a.set(p.x, p.y + 0.75 * sc, p.z + 0.1);
    const ready = state === 'ready';
    // --- label
    const pct = Math.floor(this.k * 100);
    this.el.classList.toggle('ready', ready);
    this.el.classList.toggle('locked', state === 'locked');
    this.fill.style.width = Math.min(100, this.k * 100).toFixed(1) + '%';
    this.txt.textContent = ready ? 'TAP!' : state === 'locked' && this.k >= 1 ? BASE_UPGRADES[MEGA.minTier - 1].name.toUpperCase() : `${pct}%`;
    const s = this.view.engineToScreen(_b.set(p.x, p.y + 1.75 * sc + 0.25, p.z));
    if (!s.visible) this.el.style.display = 'none';
    else {
      this.el.style.display = '';
      this.el.style.transform = `translate3d(${Math.round(s.x)}px, ${Math.round(s.y)}px, 0)`;
    }
    // --- halo: cubes light up around the Commander as the charge fills, spinning faster when full
    const lit = Math.round(RING_N * Math.min(1, this.k));
    const spin = this.t * (ready ? 5 : 1.6 + this.k * 2);
    for (let i = 0; i < lit; i++) {
      const a = (i / RING_N) * Math.PI * 2 + spin;
      const r = (0.62 + (ready ? Math.sin(this.t * 14 + i) * 0.06 : 0)) * sc;
      _p.set(center.x + Math.cos(a) * r, center.y - 0.1 * sc + Math.sin(a * 2 + this.t * 3) * 0.08 * sc, center.z + Math.sin(a) * r * 0.55);
      _s.setScalar((ready ? 0.1 : 0.07) * sc * (i === lit - 1 && !ready ? 0.6 + Math.sin(this.t * 20) * 0.4 : 1));
      _m.compose(_p, _q, _s);
      this.ring.setMatrixAt(i, _m);
    }
    this.ring.count = lit;
    this.ring.instanceMatrix.needsUpdate = true;
    // --- lightning: more, longer, wilder bolts as the charge builds
    this.regenT -= dt;
    if (this.burstT > 0) this.burstT -= dt;
    if (this.regenT <= 0) {
      this.regenT = ready ? 0.05 : 0.08 + (1 - this.k) * 0.08;
      const rng = Math.random;
      const nb = ready ? MAX_BOLTS : this.k < 0.15 ? 0 : Math.min(MAX_BOLTS - 1, 1 + Math.floor(this.k * 2.4 + rng() * 0.6));
      let n = 0;
      for (let b = 0; b < nb; b++) {
        // flicker: not every bolt every frame
        if (!ready && rng() > 0.35 + this.k * 0.6) continue;
        const reach = (ready ? 1.4 : 0.55 + this.k * 0.7) * sc;
        const ang = rng() * Math.PI * 2;
        const end = _b.set(center.x + Math.cos(ang) * reach, Math.max(0.05, center.y + (rng() - 0.35) * reach * 1.3), center.z + Math.sin(ang) * reach * 0.5);
        // ready: some bolts strike down into the base / ground
        if (ready && b === 0) end.set(center.x + (rng() - 0.5) * 1.6, Math.max(0.05, p.y - 1.4 - rng() * 1.5), center.z + 0.4);
        const pts = boltPath(center, end, this.path, 0.55, rng);
        // place cubes along the path
        let total = 0;
        for (let i = 1; i < pts.length; i++) total += pts[i - 1].distanceTo(pts[i]);
        const step = total / BOLT_CUBES;
        let seg = 1, segPos = 0;
        for (let c = 0; c < BOLT_CUBES; c++) {
          let d = c * step;
          while (seg < pts.length - 1 && d > segPos + pts[seg - 1].distanceTo(pts[seg])) {
            segPos += pts[seg - 1].distanceTo(pts[seg]);
            seg++;
          }
          const sl = pts[seg - 1].distanceTo(pts[seg]) || 1;
          _p.copy(pts[seg - 1]).lerp(pts[seg], Math.min(1, (d - segPos) / sl));
          const taper = 1 - (c / BOLT_CUBES) * 0.6;
          const size = (ready ? 0.11 : 0.06 + this.k * 0.035) * taper * sc;
          _s.setScalar(size);
          _m.compose(_p, _q, _s);
          this.core.setMatrixAt(n, _m);
          _s.setScalar(size * 2.3);
          _m.compose(_p, _q, _s);
          this.glow.setMatrixAt(n, _m);
          n++;
        }
      }
      this.core.count = this.glow.count = n;
      this.core.instanceMatrix.needsUpdate = this.glow.instanceMatrix.needsUpdate = true;
    }
    this.glow.material.opacity = 0.35 + this.k * 0.25 + (ready ? Math.sin(this.t * 30) * 0.15 : 0);
    // --- orbiting sparks + rising energy
    this.sparkT -= dt;
    if (this.sparkT <= 0 && this.k > 0.05) {
      this.sparkT = ready ? 0.05 : 0.22 - this.k * 0.14;
      const a = this.t * 5 + Math.random() * 6;
      const r = (0.5 + Math.random() * 0.4) * sc;
      fx.sparkle(new THREE.Vector3(center.x + Math.cos(a) * r, center.y + (Math.random() - 0.3) * 0.8 * sc, center.z + Math.sin(a) * r * 0.5),
        { count: ready ? 3 : 1, colors: [0xffffff, 0x9ff2ff, 0xffe27a], speed: ready ? 2.5 : 1.2, life: 0.35 });
    }
    // --- crackle sound (your side only), faster when full
    if (this.side === 0 && this.k > 0.5) {
      this.crackleT -= dt;
      if (this.crackleT <= 0) {
        this.crackleT = ready ? 0.9 + Math.random() * 0.6 : 2.5 + Math.random() * 2;
        audio.play('zap', { pitch: 1.4 + Math.random() * 0.4, vol: ready ? 0.35 : 0.18, gap: 0.2 });
      }
    }
  }
}

export class BaseBadge {
  constructor(layer, onTap) {
    this.name = h('b', {}, '');
    this.cost = h('span', { class: 'c' }, '');
    this.fill = h('i', { class: 'f' });
    this.el = h('div', { class: 'base-badge' },
      h('div', { class: 'up' }, icon('up')),
      h('div', { class: 'tx' }, h('small', {}, 'TAP TO UPGRADE'), this.name),
      h('div', { class: 'cost' }, icon('power'), this.cost),
      h('div', { class: 'meter' }, this.fill));
    this.el.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      audio.unlock();
      onTap?.();
    });
    layer.appendChild(this.el);
    this.lastKey = '';
  }
  dispose() {
    this.el.remove();
  }
  update(view, lab, side) {
    const sim = view.sim;
    const nx = BASE_UPGRADES[side.overclock + 1];
    if (!nx || !lab || !side.lab.alive || sim.over || sim.cinematic) {
      this.el.style.display = 'none';
      return;
    }
    const cost = BASE_UPGRADES[side.overclock].cost;
    const key = nx.name + cost;
    if (key !== this.lastKey) {
      this.lastKey = key;
      this.name.textContent = nx.name.toUpperCase();
      this.cost.textContent = String(cost);
    }
    const afford = side.energy >= cost;
    this.el.classList.toggle('afford', afford);
    this.fill.style.width = Math.min(100, (side.energy / cost) * 100).toFixed(1) + '%';
    // a sign standing on the ground just in front of the base
    const x = lab.root.position.x + (lab.centerX ?? 0) + 0.4;
    const s = view.engineToScreen(_b.set(x, 0.15, 2.6));
    if (!s.visible) { this.el.style.display = 'none'; return; }
    this.el.style.display = '';
    this.el.style.transform = `translate3d(${Math.round(s.x)}px, ${Math.round(s.y)}px, 0)`;
  }
}

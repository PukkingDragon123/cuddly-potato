// Containment vessel check: ?dev=containment[&id=panthar][&variant=gold]
//   static:  &fill=0..1 &crack=0..1 &glow=0..1 [&burst=1]
//   auto:    &auto=1 loops the breakout (slam, pour, glow, crack, burst, roar); &t=sec warms up to a moment, &freeze=1 holds it
//   camera:  &cam=front|side|high  &zoom=1
// Places a MEGA figure inside the vessel scaled to the interior, like the ultimate cutscene does.
import * as THREE from 'three';
import { engine, addLights } from '../core/engine.js';
import { createSwarm } from '../models/swarmModels.js';
import { makeContainment } from '../models/props/containment.js';
import { h, $ui } from '../ui/ui.js';

const ACCENTS = {
  panthar: { accent: 0xff3fc0, liquid: 0x52d6ff },
  silverByte: { accent: 0x3ef0ff, liquid: 0x8fe8ff },
  necroClaw: { accent: 0x8cff3a, liquid: 0x9dff6a },
  cyberGlitch: { accent: 0xff2ea6, liquid: 0x7a6bff },
};

export class ContainmentViewScene {
  constructor() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x323a5c);
    this.camera = new THREE.PerspectiveCamera(30, engine.aspect, 0.1, 400);
    addLights(this.scene, { shadowExtent: 12, dir: [5, 12, 9] });
    const ground = new THREE.Mesh(new THREE.CircleGeometry(30, 48), new THREE.MeshLambertMaterial({ color: 0x5a6486 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
    this.t = 0;
    this.shards = [];
  }

  async enter(params) {
    this.params = params;
    const id = params.id ?? 'panthar';
    this.id = id;
    const col = ACCENTS[id] ?? ACCENTS.panthar;
    this.vessel = makeContainment({ accent: col.accent, liquid: col.liquid, height: +(params.height ?? 7) });
    this.scene.add(this.vessel.root);
    // fit the figure to the interior (like the cutscene)
    const probe = createSwarm(id, { variant: params.variant ?? 'base' });
    const I = this.vessel.interior;
    const want = Math.min(+(params.fig ?? 5.5), I.topY - I.floorY - 0.12);
    this.figScale = want / probe.height;
    this.rig = createSwarm(id, { variant: params.variant ?? 'base', scale: this.figScale });
    this.rig.root.position.y = I.floorY;
    this.scene.add(this.rig.root);
    this.auto = !!params.auto;
    if (!this.auto) {
      this.vessel.setFill(+(params.fill ?? 0.7));
      this.vessel.setCrack(+(params.crack ?? 0));
      this.vessel.setGlow(+(params.glow ?? 0.5));
      if (params.burst) this.doBurst();
    }
    this.info = h('div', { style: { position: 'absolute', left: '6px', top: '6px', color: '#fff', font: '12px monospace', background: 'rgba(0,0,0,0.5)', padding: '4px' } },
      `containment | ${id} | fig ${(this.rig.height).toFixed(2)}u (x${this.figScale.toFixed(2)}) wide ${this.rig.width.toFixed(2)}u | vessel ${this.vessel.height.toFixed(2)}u r=${I.radius.toFixed(2)}`);
    $ui().appendChild(this.info);
    this.place();
    const warm = +(params.t ?? 0);
    for (let i = 0; i < warm * 30; i++) this.update(1 / 30);
    this.frozen = !!params.freeze;
  }

  place() {
    const mode = this.params?.cam ?? 'front';
    const z = +(this.params?.zoom ?? 1);
    const cam = this.camera;
    if (mode === 'side') cam.position.set(16 * z, 5, 3 * z);
    else if (mode === 'high') cam.position.set(4 * z, 12 * z, 13 * z);
    else cam.position.set(2.5 * z, 4.6, 15.5 * z);
    cam.lookAt(0, 3.4, 0);
  }

  resize(w, hh) {
    this.camera.aspect = w / hh;
    this.camera.updateProjectionMatrix();
    this.place();
  }

  doBurst() {
    this.shards = this.vessel.burst({ force: 10 }); // the vessel flies its own shards
    this.rig.attack(0.9);
  }

  update(dt) {
    if (this.frozen) return;
    this.t += dt;
    const v = this.vessel;
    if (this.auto) {
      // looping breakout: 0-0.6 slam, 0.6-3.2 pour, 3.2-4.6 rumble+crack, 4.6 burst, 4.6-8 roar + stomp, reset at 8.5
      const T = 8.5, s = this.t % T;
      if (s < dt * 1.5 && this.t > dt * 2) this.reset();
      const drop = Math.max(0, 1 - s / 0.45);
      v.root.position.y = drop * drop * 9;
      this.rig.root.position.y = v.interior.floorY + drop * drop * 9;
      v.setFill(Math.max(0, Math.min(1, (s - 0.6) / 2.6)));
      v.setGlow(s < 3.2 ? 0.25 : s < 4.6 ? 0.6 + (s - 3.2) * 0.4 : 1.2);
      v.setRumble(s > 3.2 && s < 4.6 ? (s - 3.2) / 1.4 : 0);
      v.setCrack(Math.max(0, Math.min(1, (s - 3.4) / 1.1)));
      if (s >= 4.6 && !this.shards.length) this.doBurst();
      this.rig.setState(s > 5.8 && s < 8 ? 'walk' : 'idle');
    }
    v.update(dt);
    this.rig.update(dt);
  }

  reset() {
    // rebuild the vessel for the next loop
    this.shards = [];
    this.scene.remove(this.vessel.root);
    this.vessel.dispose();
    const col = ACCENTS[this.id] ?? ACCENTS.panthar;
    this.vessel = makeContainment({ accent: col.accent, liquid: col.liquid, height: +(this.params.height ?? 7) });
    this.scene.add(this.vessel.root);
  }

  exit() {
    this.vessel?.dispose();
  }
}

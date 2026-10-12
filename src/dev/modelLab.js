// Model QA turntable: ?dev=modellab&id=a,b,c[&anim=idle|walk|attack|dance][&variant=gold][&skin=x][&views=4]
// Each model is shown from several fixed angles side by side (front, 3/4, side,
// back) at the same scale so proportions and faces can be judged from one
// screenshot. Card-style thumbnails of each model are shown along the bottom.
import * as THREE from 'three';
import { engine, addLights } from '../core/engine.js';
import { createSwarm } from '../models/swarmModels.js';
import { h, $ui } from '../ui/ui.js';

const VIEWS = [
  { name: 'front', yaw: 0 },
  { name: '3/4', yaw: 0.75 },
  { name: 'side', yaw: Math.PI / 2 },
  { name: 'back 3/4', yaw: Math.PI - 0.6 },
];

export class ModelLabScene {
  constructor() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x56607e);
    this.camera = new THREE.PerspectiveCamera(22, engine.aspect, 0.1, 400);
    addLights(this.scene, { shadowExtent: 30, dir: [5, 12, 9] });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshLambertMaterial({ color: 0x8a94ae }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
    this.items = [];
    this.t = 0;
  }
  async enter(params) {
    const ids = (params.id || 'panther').split(',');
    const nViews = Math.min(4, Math.max(1, +(params.views ?? 4)));
    this.anim = params.anim ?? 'idle';
    const spacingX = +(params.sx ?? 2.4), spacingZ = +(params.sz ?? 2.8);
    let maxH = 1;
    const cells = [];
    ids.forEach((id) => { for (let c = 0; c < nViews; c++) cells.push({ id, view: VIEWS[c] }); });
    const cols = Math.min(cells.length, +(params.cols ?? 8));
    const rows = Math.ceil(cells.length / cols);
    cells.forEach((cell, i) => {
      const rig = createSwarm(cell.id, { variant: params.variant ?? 'base', skin: params.skin ?? null, scale: +(params.scale ?? 1) });
      const c = i % cols, r = Math.floor(i / cols);
      rig.root.position.set((c - (cols - 1) / 2) * spacingX, 0, -r * spacingZ);
      rig.root.rotation.y = cell.view.yaw;
      this.scene.add(rig.root);
      this.items.push(rig);
      maxH = Math.max(maxH, rig.height);
    });
    const w = cols * spacingX, d = rows * spacingZ;
    const tanV = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const pitch = rows > 1 ? 0.62 : 0.3;
    const distW = (w * 0.55) / (tanV * engine.aspect);
    const distH = ((d * Math.sin(pitch) + maxH) * 0.6) / tanV;
    const dist = Math.max(distW, distH) * +(params.zoom ?? 1);
    const cz = -(rows - 1) * spacingZ * 0.5;
    this.camera.position.set(0, maxH * 0.45 + dist * Math.sin(pitch), cz + dist * Math.cos(pitch));
    this.camera.lookAt(0, maxH * 0.45, cz);
    $ui().appendChild(h('div', { style: { position: 'absolute', left: '6px', top: '6px', color: '#fff', font: '12px monospace', background: 'rgba(0,0,0,0.5)', padding: '4px' } },
      `${ids.join(', ')} | anim=${this.anim} | views: ${VIEWS.slice(0, nViews).map((v) => v.name).join(' / ')}`));
    if (params.thumbs) {
      const { swarmThumb } = await import('../ui/thumbs.js');
      const row = h('div', { style: { position: 'absolute', left: '0', right: '0', bottom: '0', display: 'flex', gap: '6px', padding: '6px', background: 'rgba(0,0,0,0.4)', overflowX: 'auto' } });
      for (const id of ids) row.appendChild(h('img', { src: swarmThumb(id, params.variant ?? 'base', params.skin ?? null, 160), style: { width: '120px', height: '120px', background: '#2b3466' } }));
      $ui().appendChild(row);
    }
  }
  resize(w, hh) {
    this.camera.aspect = w / hh;
    this.camera.updateProjectionMatrix();
  }
  update(dt) {
    this.t += dt;
    for (const rig of this.items) {
      if (this.anim === 'attack') {
        rig.setState('idle');
        if (!rig._lastAtk || this.t - rig._lastAtk > 1.1) { rig.attack(0.55); rig._lastAtk = this.t; }
      } else rig.setState(this.anim);
      rig.update(dt);
    }
  }
}

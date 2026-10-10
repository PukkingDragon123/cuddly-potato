// The real-toy-style Swarms vial: translucent tube, sloshing liquid, foam,
// hazard-stripe label with a QR code, and a screw cap that pops off.
import * as THREE from 'three';
import { VoxGrid, makeMesh } from '../../core/voxel.js';
import { VIALS } from '../../data/vials.js';
import { shade } from '../../core/util.js';

const V = 0.05; // fine voxels for the vial details

function capGrid(color) {
  const g = new VoxGrid();
  g.cylinder(-0.5, -0.5, 0, 5, 7.5, (x, y, z) => (y === 0 || y === 5 ? shade(color, -0.15) : (Math.atan2(z + 0.5, x + 0.5) * 6) % 1 > 0.5 ? color : shade(color, 0.12)), 'y');
  g.cylinder(-0.5, -0.5, 6, 7, 5.5, shade(color, -0.05), 'y');
  // little bolt badge on top
  g.box(-1, 8, -1, 0, 8, 0, 0xffffff).set(-1, 8, 1, 0xffffff);
  return g;
}

function labelGrid(vial) {
  const g = new VoxGrid();
  const r = 6.9;
  const R2 = (r + 0.4) * (r + 0.4), r2 = (r - 0.7) * (r - 0.7);
  for (let y = 0; y < 9; y++)
    for (let x = -8; x <= 7; x++)
      for (let z = -8; z <= 7; z++) {
        const dx = x + 0.5, dz = z + 0.5;
        const d = dx * dx + dz * dz;
        if (d > R2 || d < r2) continue;
        const a = Math.atan2(dz, dx);
        let c;
        if (y < 2) c = (Math.floor((a / Math.PI) * 10 + y) & 1) ? 0x111111 : 0xffd23f; // hazard stripes
        else if (y > 7) c = vial.label;
        else {
          // QR code patch on the front, colourful art elsewhere
          const front = Math.abs(a - Math.PI / 2) < 0.45 && y >= 3 && y <= 6;
          if (front) c = ((x * 7 + y * 13) % 5 < 2) ? 0x111111 : 0xffffff;
          else c = shade(vial.label, ((x + y) & 1) ? 0.15 : -0.05);
        }
        g.set(x, y, z, c);
      }
  return g;
}

function baseGrid() {
  const g = new VoxGrid();
  g.cylinder(-0.5, -0.5, 0, 3, 7.4, 0x222233, 'y');
  g.cylinder(-0.5, -0.5, 0, 0, 7.9, 0x15151f, 'y');
  return g;
}

const geoCache = {};
function cached(key, fn) {
  if (!geoCache[key]) geoCache[key] = fn().build({ scale: V, pivot: [0, 0, 0] });
  return geoCache[key];
}

export class Vial {
  constructor(type) {
    const vial = VIALS[type] || VIALS.lab;
    this.type = type;
    this.def = vial;
    this.root = new THREE.Group();
    this.body = new THREE.Group(); // shakes/tilts
    this.root.add(this.body);
    const H = 1.5, R = 0.34;
    this.H = H;
    // base
    const base = makeMesh(cached('base', baseGrid));
    this.body.add(base);
    // liquid
    const liqMat = new THREE.MeshPhongMaterial({ color: vial.liquid, transparent: true, opacity: 0.82, shininess: 60, emissive: shade(vial.liquid, -0.55), depthWrite: true });
    this.liquid = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.9, R * 0.9, 1, 20), liqMat);
    this.liqLevel = 0.62;
    this.body.add(this.liquid);
    // mystery silhouette inside
    const sil = new VoxGrid();
    sil.ellipsoid(-0.5, 5, -0.5, 3.5, 4.5, 3, 0x1a1030);
    sil.box(-3, 8, -1, -2, 10, 0, 0x1a1030).box(1, 8, -1, 2, 10, 0, 0x1a1030);
    this.silhouette = makeMesh(sil.build({ scale: V, pivot: [0, 0, 0] }));
    this.silhouette.position.y = 0.3;
    this.body.add(this.silhouette);
    // foam
    const foamMat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x333333 });
    this.foam = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.88, R * 0.9, 1, 16), foamMat);
    this.foam.visible = false;
    this.body.add(this.foam);
    this.foamLevel = 0;
    // glass
    const glassMat = new THREE.MeshPhongMaterial({ color: 0xdff6ff, transparent: true, opacity: 0.28, shininess: 120, specular: 0xffffff, depthWrite: false, side: THREE.DoubleSide });
    this.glass = new THREE.Mesh(new THREE.CylinderGeometry(R, R, H, 24, 1, true), glassMat);
    this.glass.position.y = H / 2 + 0.15;
    this.glass.renderOrder = 2;
    this.body.add(this.glass);
    // highlight strip on glass
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.04, H * 0.8, 0.01), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 }));
    hl.position.set(-R * 0.55, H / 2 + 0.2, R * 0.85);
    this.body.add(hl);
    // label
    const label = makeMesh(cached('label_' + type, () => labelGrid(vial)));
    label.position.y = 0.55;
    this.body.add(label);
    // cap
    this.cap = new THREE.Group();
    const cap = makeMesh(cached('cap_' + type, () => capGrid(vial.cap)));
    this.cap.add(cap);
    this.cap.position.y = H + 0.1;
    this.body.add(this.cap);
    this.capMesh = cap;
    // glow light inside
    this.light = new THREE.PointLight(vial.liquid, 0, 3);
    this.light.position.y = 0.8;
    this.body.add(this.light);
    this.wobble = 0;
    this.wobbleV = 0;
    this.t = 0;
    this.setLevels();
  }

  setLevels() {
    const bottom = 0.16;
    const top = this.H + 0.12;
    const lh = (top - bottom) * this.liqLevel;
    this.liquid.scale.y = Math.max(0.001, lh);
    this.liquid.position.y = bottom + lh / 2;
    const fh = (top - bottom - lh) * this.foamLevel;
    this.foam.visible = fh > 0.01;
    this.foam.scale.y = Math.max(0.001, fh);
    this.foam.position.y = bottom + lh + fh / 2;
  }

  /** Slosh impulse from shaking (tilt velocity). */
  slosh(v) {
    this.wobbleV += v;
  }

  update(dt) {
    this.t += dt;
    this.wobbleV += (-this.wobble * 60 - this.wobbleV * 5) * dt;
    this.wobble += this.wobbleV * dt;
    this.liquid.rotation.z = this.wobble * 0.35;
    this.foam.rotation.z = this.wobble * 0.3;
    this.silhouette.rotation.y = Math.sin(this.t * 0.8) * 0.4;
    this.silhouette.position.y = 0.3 + Math.sin(this.t * 1.7) * 0.03 + this.wobble * 0.05;
    this.setLevels();
  }
}

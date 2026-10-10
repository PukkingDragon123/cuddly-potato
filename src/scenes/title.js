import * as THREE from 'three';
export class TitleScene {
  constructor() { this.scene = new THREE.Scene(); this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100); }
  update() {}
}

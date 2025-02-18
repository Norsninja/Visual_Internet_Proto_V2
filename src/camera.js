// src/camera.js
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export class CameraController {
  constructor(renderer, ship) {
    this.ship = ship; // Track the ship's position
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);

    this.camera.position.set(0, 20, 50); // Default start position

    this.controls = new OrbitControls(this.camera, renderer.domElement);
    this.controls.enableDamping = true; // Smooth movement
    this.controls.dampingFactor = 0.1;
    this.controls.target.copy(this.ship.position); // Lock target to ship

    this.onWindowResize = this.onWindowResize.bind(this);
    window.addEventListener('resize', this.onWindowResize, { passive: true });
  }

  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }

  update() {
    // Keep the camera centered on the ship but allow manual orbiting
    this.controls.target.copy(this.ship.position);
    this.controls.update();
  }

  setCameraProperties({ fov, near, far }) {
    if (fov !== undefined) this.camera.fov = fov;
    if (near !== undefined) this.camera.near = near;
    if (far !== undefined) this.camera.far = far;
    this.camera.updateProjectionMatrix();
  }

  destroy() {
    window.removeEventListener('resize', this.onWindowResize);
  }
}

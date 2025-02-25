// src/camera.js
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export class CameraController {
  constructor(renderer, ship) {
    this.ship = ship; // Track the ship's position
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
    this.camera.position.set(0, 20, 50); // Default external position
    this.controls = new OrbitControls(this.camera, renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.1;
    this.controls.target.copy(this.ship.position);

    this.onWindowResize = this.onWindowResize.bind(this);
    window.addEventListener('resize', this.onWindowResize, { passive: true });
  }

  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }

  update() {
    // Only update OrbitControls if they are enabled.
    if (this.controls.enabled) {
      // Assume this.ship is a world-space object (i.e. the ship mesh added to the scene).
      this.controls.target.copy(this.ship.position);
      this.controls.update();
    }
    
    // Set a fixed horizon for the camera's far clipping plane (if desired).
    const horizonOffset = 5000;
    this.camera.far = horizonOffset;
    this.camera.updateProjectionMatrix();
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

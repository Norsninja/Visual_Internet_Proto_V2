// src/scene.js
import * as THREE from 'three';

// Utility function to generate random positions for stars.
function generateStarPositions(count, range) {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * range;
    positions[i * 3 + 1] = (Math.random() - 0.5) * range;
    positions[i * 3 + 2] = (Math.random() - 0.5) * range;
  }
  return positions;
}

export class SceneManager {
  constructor(camera, backgroundColor = 0x000000) {
    this.scene = new THREE.Scene();
    this.camera = camera;
    this.setBackground(backgroundColor);
    
    // Initialize lighting system
    this.initLighting();
    
    // Create star field background
    this.createStarField();
  }

  initLighting() {
    // Ambient light for base illumination
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(this.ambientLight);

    // Directional light for main illumination
    this.directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    this.directionalLight.position.set(5, 5, 5);
    this.scene.add(this.directionalLight);

    // Back light to prevent complete darkness on opposite side
    this.backLight = new THREE.DirectionalLight(0xffffff, 0.3);
    this.backLight.position.set(-5, -5, -5);
    this.scene.add(this.backLight);
  }

  createStarField() {
    const starCount = 80000;
    const starGeometry = new THREE.BufferGeometry();
    const positions = generateStarPositions(starCount, 50000);
    starGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    
    const starMaterial = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 1.5,
      transparent: true,
      opacity: 0.8
    });
    
    this.starField = new THREE.Points(starGeometry, starMaterial);
    this.starField.position.z = -500;
    this.scene.add(this.starField);
  }

  addObjects(objects = []) {
    objects.forEach(obj => this.scene.add(obj));
  }

  removeObjects(objects = []) {
    objects.forEach(obj => this.scene.remove(obj));
  }

  setBackground(colorHex) {
    this.scene.background = new THREE.Color(colorHex);
  }
}
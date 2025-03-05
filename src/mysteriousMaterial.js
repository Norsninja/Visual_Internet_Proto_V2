// mysterousMaterial.js - Simplified version
import * as THREE from 'three';

// Create a simple material for unexplored nodes
export function createMysteriousMaterial() {
  // Simple material with minimal performance impact
  const material = new THREE.MeshLambertMaterial({
    color: 0x101840,           // Dark blue base
    emissive: 0x304060,        // Subtle blue glow
    emissiveIntensity: 0.3,    // Low intensity for the glow
    transparent: true,
    opacity: 0.9,              // Slightly transparent
  });
  
  // Add minimal animation data to userData
  material.userData = {
    isMysteriousMaterial: true,
    animationPhase: Math.random() * Math.PI * 2, // Random start phase
    lastUpdate: 0
  };
  
  return material;
}

// Simplified update function without environment mapping
export function updateMysteriousMaterial(mesh, scene, camera) {
  if (!mesh.material || !mesh.material.userData.isMysteriousMaterial) return;
  
  // Only update once every 300ms instead of every frame
  const now = performance.now();
  if (now - mesh.material.userData.lastUpdate < 300) return;
  mesh.material.userData.lastUpdate = now;
  
  // Simple pulsing effect using just emissive intensity
  const time = now * 0.001;
  const phase = mesh.material.userData.animationPhase;
  
  // Simple sine wave animation
  const pulseValue = 0.3 + 0.2 * Math.sin(time * 0.5 + phase);
  mesh.material.emissiveIntensity = pulseValue;
}

// Simplified cleanup function
export function disposeMysteriousMaterial(material) {
  if (material && material.userData && material.userData.isMysteriousMaterial) {
    material.dispose();
  }
}

// Lightweight manager for mysterious nodes
export class MysteriousNodesManager {
  constructor() {
    this.nodes = [];
    this.updateInterval = 300; // ms between updates
    this.lastUpdate = 0;
  }
  
  registerNode(mesh) {
    if (!this.nodes.includes(mesh)) {
      this.nodes.push(mesh);
    }
  }
  
  unregisterNode(mesh) {
    const index = this.nodes.indexOf(mesh);
    if (index !== -1) {
      this.nodes.splice(index, 1);
      
      // Clean up material resources
      if (mesh.material && mesh.material.userData.isMysteriousMaterial) {
        disposeMysteriousMaterial(mesh.material);
      }
    }
  }
  
  update(scene, camera) {
    // Throttle updates to reduce CPU usage
    const now = performance.now();
    if (now - this.lastUpdate < this.updateInterval) return;
    this.lastUpdate = now;
    
    // Only update a subset of nodes each cycle if there are many
    const maxNodesToUpdate = 5;
    const nodesToUpdate = this.nodes.length <= maxNodesToUpdate ? 
      this.nodes : 
      this.nodes.slice(0, maxNodesToUpdate);
    
    for (const mesh of nodesToUpdate) {
      updateMysteriousMaterial(mesh, scene, camera);
    }
    
    // Rotate which nodes get updated each cycle
    if (this.nodes.length > maxNodesToUpdate) {
      this.nodes.push(this.nodes.shift());
    }
  }
}

// Create a global instance if not already created
window.mysteriousNodesManager = window.mysteriousNodesManager || new MysteriousNodesManager();
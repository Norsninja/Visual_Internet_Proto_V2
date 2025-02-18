import * as THREE from 'three';
import { SimplexNoise } from 'three/examples/jsm/math/SimplexNoise.js';

function hashIP(ip) {
  let hash = 0;
  for (let i = 0; i < ip.length; i++) {
    hash = (hash << 5) - hash + ip.charCodeAt(i);
    hash &= hash;
  }
  return Math.abs(hash) % 1000;
}

function generateDistortedGeometry(seed, type, scale = 1) {
    const geometry = new THREE.SphereGeometry(2 * scale, 32, 32);
    const noise = new SimplexNoise();
    const positions = geometry.attributes.position.array;
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i], y = positions[i + 1], z = positions[i + 2];
      const noiseFactor = noise.noise3d(x * 0.1, y * 0.1, z * 0.1) * 0.2;
      positions[i] += noiseFactor;
      positions[i + 1] += noiseFactor;
      positions[i + 2] += noiseFactor;
    }
    geometry.attributes.position.needsUpdate = true;
    return geometry;
  }
  

export function generateMaterial(type, color, seed) {
  const hexColor = new THREE.Color(color);
  if (type === 'web') {
    return new THREE.MeshStandardMaterial({
      color: hexColor,
      emissive: hexColor.clone().multiplyScalar(0.5),
      emissiveIntensity: 2,
      metalness: 0.1,
      roughness: 0.5,
    });
  }
  return new THREE.MeshStandardMaterial({
    color: hexColor,
    metalness: 0.3,
    roughness: 0.7,
  });
}

export function createNodeMesh(nodeState) {
    const seed = hashIP(nodeState.id);
    const scale = window.NODE_SCALE || 1;
    let geometry;
    if (nodeState.layer === 'web') {
      geometry = new THREE.SphereGeometry(1.5 * scale, 24, 24);
    } else {
      geometry = generateDistortedGeometry(seed, nodeState.type, scale);
    }
    
    // Use a default color if none provided; web nodes are hot pink.
    const finalColor = nodeState.layer === 'web'
    ? new THREE.Color("#ff69b4")
    : new THREE.Color(nodeState.color || (nodeState.type === "external" ? "red" : "#0099FF"));
  
    
    const material = generateMaterial(nodeState.type, finalColor, seed);
    const mesh = new THREE.Mesh(geometry, material);
    
    // Store the node state on the mesh.
    mesh.userData = { ...nodeState, seed };
  
    // Positioning logic remains unchanged
    if (nodeState.layer === 'web' && nodeState.parentId) {
      const parentMesh = window.nodesManager.getNodeById(nodeState.parentId);
      if (parentMesh) {
        const angle = Math.random() * Math.PI * 2;
        const radius = (10 + Math.random() * 5) * scale;
        const zOffset = (Math.random() - 0.5) * 10 * scale;
        mesh.position.set(
          parentMesh.position.x + radius * Math.cos(angle),
          parentMesh.position.y + radius * Math.sin(angle),
          parentMesh.position.z + zOffset
        );
      } else {
        mesh.position.set(0, 0, 0);
      }
    } else if (nodeState.position) {
      mesh.position.copy(nodeState.position);
    }
    
    return mesh;
  }
  

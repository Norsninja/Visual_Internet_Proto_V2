import * as THREE from 'three';

export class EdgesManager {
  constructor(scene, getNodeById) {
    this.scene = scene;
    this.edgeRegistry = new Map(); // Ensure edgeRegistry is always initialized
    this.getNodeById = getNodeById;
    this.trafficParticles = [];
    this.edgesData = [];
  }

  updateEdges(edgesData) {
    if (!this.edgeRegistry) {
      console.error("EdgeRegistry is undefined! Initializing a new Map.");
      this.edgeRegistry = new Map();
    }
    
    this.edgesData = edgesData;
    const edgeKeys = new Set(edgesData.map(edge => `${edge.source}-${edge.target}`));

    // Remove outdated edges
    const currentKeys = new Set(this.edgeRegistry.keys());
    currentKeys.forEach(key => {
      if (!edgeKeys.has(key)) {
        const edgeObj = this.edgeRegistry.get(key);
        this.scene.remove(edgeObj.line);
        this.edgeRegistry.delete(key);
      }
    });

    // Create new edges
    edgesData.forEach(edge => {
      const key = `${edge.source}-${edge.target}`;
      if (!this.edgeRegistry.has(key)) {
        const sourceMesh = this.getNodeById(edge.source);
        const targetMesh = this.getNodeById(edge.target);

        if (!sourceMesh) console.warn(`Missing source node for edge: ${edge.source}`);
        if (!targetMesh) console.warn(`Missing target node for edge: ${edge.target}`);
        if (sourceMesh && targetMesh) {
          // Set color and opacity based on edge layer
          const color = (edge.layer === 'web') ? 0xff1493 : 0xadd8e6;
          const opacity = (edge.layer === 'web') ? 0.8 : 0.5;

          const geometry = new THREE.BufferGeometry().setFromPoints([
            sourceMesh.position.clone(),
            targetMesh.position.clone()
          ]);
          const material = new THREE.LineBasicMaterial({
            color,
            transparent: true,
            opacity
          });
          const line = new THREE.Line(geometry, material);
          this.scene.add(line);
          this.edgeRegistry.set(key, { line, layer: edge.layer });
          console.log(`Created ${edge.layer} edge: ${edge.source} → ${edge.target}`);
        }
      }
    });

    console.log(`EdgeRegistry now contains: ${[...this.edgeRegistry.keys()].length} edges.`);
  }

  updateEdgePositions() {
    this.edgeRegistry.forEach((edgeObj, key) => {
      const [sourceId, targetId] = key.split('-');
      const sourceMesh = this.getNodeById(sourceId);
      const targetMesh = this.getNodeById(targetId);
      if (!sourceMesh || !targetMesh) return; // Skip if nodes don't exist

      // Update the edge geometry using the current node positions
      edgeObj.line.geometry.setFromPoints([
        sourceMesh.position.clone(),
        targetMesh.position.clone()
      ]);
      edgeObj.line.geometry.attributes.position.needsUpdate = true;
    });
  }

  spawnLocalTrafficParticles(intensity) {
    const maxParticlesPerEdge = 5;
    this.edgeRegistry.forEach((edgeObj, key) => {
      const [sourceId, targetId] = key.split('-');
      const sourceNode = this.getNodeById(sourceId);
      const targetNode = this.getNodeById(targetId);
  
      if (sourceNode && targetNode &&
          sourceNode.userData.type !== 'external' &&
          targetNode.userData.type !== 'external') {
        const particleCount = Math.floor(intensity * maxParticlesPerEdge);
        for (let i = 0; i < particleCount; i++) {
          const particleSize = 5;
          this.animateTraffic(sourceNode, targetNode, particleSize);
        }
      }
    });
  }
  
  pollTrafficRate() {
    setInterval(() => {
      fetch('http://192.168.0.11:5000/traffic_rate')
        .then(response => response.json())
        .then(data => {
          const scaleFactor = 10;
          const scaledRate = data.average_rate * scaleFactor;
          console.log("Raw average_rate:", data.average_rate);
          const MAX_RATE = 500000;
          const intensity = Math.min(scaledRate / MAX_RATE, 1);
          console.log("Traffic intensity for local edges:", intensity);
          this.spawnLocalTrafficParticles(intensity);
        })
        .catch(err => console.error('Failed to fetch traffic rate:', err));
    }, 10000);
  }

  animateTraffic(srcNode, dstNode, size) {
    const packetMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00 });
    const packetGeometry = new THREE.SphereGeometry(size / 50, 8, 8);
    const packet = new THREE.Mesh(packetGeometry, packetMaterial);
    this.scene.add(packet);
    this.trafficParticles.push({ packet, srcNode, dstNode, progress: 0 });
  }

  updateTraffic() {
    this.trafficParticles.forEach((traffic, index) => {
      traffic.progress += 0.05;
      if (traffic.progress >= 1) {
        this.scene.remove(traffic.packet);
        this.trafficParticles.splice(index, 1);
      } else {
        traffic.packet.position.lerpVectors(traffic.srcNode.position, traffic.dstNode.position, traffic.progress);
      }
    });
  }
}

import * as THREE from 'three';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';

export class EdgesManager {
  constructor(scene, getNodeById, nodesManager) {
    this.scene = scene;
    this.getNodeById = getNodeById;
    this.edgeRegistry = new Map();
    this.trafficParticles = [];
    this.edgesData = [];
    this.pendingWebEdges = [];
    
    // Create separate edge groups for different edge types
    this.standardEdgeGeometry = new LineSegmentsGeometry();
    this.standardEdgeMaterial = new LineMaterial({
      color: 0xadd8e6,
      linewidth: 1.0,
      transparent: true,
      opacity: 0.5,
      resolution: new THREE.Vector2(window.innerWidth, window.innerHeight)
    });
    this.standardEdgeObject = new LineSegments2(this.standardEdgeGeometry, this.standardEdgeMaterial);
    this.scene.add(this.standardEdgeObject);
    
    this.webEdgeGeometry = new LineSegmentsGeometry();
    this.webEdgeMaterial = new LineMaterial({
      color: 0xff1493,
      linewidth: 0.5,
      transparent: true,
      opacity: 0.8,
      resolution: new THREE.Vector2(window.innerWidth, window.innerHeight)
    });
    this.webEdgeObject = new LineSegments2(this.webEdgeGeometry, this.webEdgeMaterial);
    this.scene.add(this.webEdgeObject);
    
    // Track node positions for quick lookups
    this.nodePositions = new Map();
    
    // Register for node creation events
    if (nodesManager) {
      nodesManager.onNodeCreated((nodeId, nodeMesh) => {
        this.updateNodePosition(nodeId, nodeMesh);
        if (nodeMesh.userData.layer === 'web') {
          this.checkPendingWebEdges(nodeId);
        }
      });
    }
    
    // Handle window resize for proper line widths
    window.addEventListener('resize', () => {
      this.standardEdgeMaterial.resolution.set(window.innerWidth, window.innerHeight);
      this.webEdgeMaterial.resolution.set(window.innerWidth, window.innerHeight);
    });
  }
  
  // Update and cache a node's world position
  updateNodePosition(nodeId, nodeMesh) {
    if (!nodeMesh) return;
    
    const worldPos = new THREE.Vector3();
    nodeMesh.updateMatrixWorld(true);
    nodeMesh.getWorldPosition(worldPos);
    this.nodePositions.set(nodeId, worldPos.clone());
    return worldPos;
  }
  
  // Check if we can create any pending web edges
  checkPendingWebEdges(nodeId) {
    const newPendingList = [];
    let updated = false;
    
    for (const edge of this.pendingWebEdges) {
      if (edge.source === nodeId || edge.target === nodeId) {
        const sourceMesh = this.getNodeById(edge.source);
        const targetMesh = this.getNodeById(edge.target);
        
        if (sourceMesh && targetMesh) {
          this.edgeRegistry.set(`${edge.source}-${edge.target}`, {
            sourceId: edge.source,
            targetId: edge.target,
            layer: 'web'
          });
          updated = true;
        } else {
          newPendingList.push(edge);
        }
      } else {
        newPendingList.push(edge);
      }
    }
    
    this.pendingWebEdges = newPendingList;
    
    if (updated) {
      this.rebuildWebEdgeGeometry();
    }
  }
  
  // Update edges from data
  updateEdges(edgesData) {
    if (!edgesData || !Array.isArray(edgesData)) {
      console.warn("Invalid edgesData provided to updateEdges");
      return;
    }
    
    this.edgesData = edgesData;
    
    // Split edges by type
    const standardEdges = edgesData.filter(edge => edge.layer !== 'web');
    const webEdges = edgesData.filter(edge => edge.layer === 'web');
    
    // Remove old edges from registry
    const newEdgeKeys = new Set(edgesData.map(edge => `${edge.source}-${edge.target}`));
    const keysToRemove = [];
    
    for (const key of this.edgeRegistry.keys()) {
      if (!newEdgeKeys.has(key)) {
        keysToRemove.push(key);
      }
    }
    
    keysToRemove.forEach(key => this.edgeRegistry.delete(key));
    
    // Process standard edges
    let standardEdgesUpdated = false;
    for (const edge of standardEdges) {
      const key = `${edge.source}-${edge.target}`;
      if (!this.edgeRegistry.has(key)) {
        const sourceMesh = this.getNodeById(edge.source);
        const targetMesh = this.getNodeById(edge.target);
        
        if (sourceMesh && targetMesh) {
          this.edgeRegistry.set(key, {
            sourceId: edge.source,
            targetId: edge.target,
            layer: edge.layer || 'default'
          });
          standardEdgesUpdated = true;
        }
      }
    }
    
    // Process web edges
    let webEdgesUpdated = false;
    for (const edge of webEdges) {
      const key = `${edge.source}-${edge.target}`;
      if (!this.edgeRegistry.has(key)) {
        const sourceMesh = this.getNodeById(edge.source);
        const targetMesh = this.getNodeById(edge.target);
        
        if (sourceMesh && targetMesh) {
          this.edgeRegistry.set(key, {
            sourceId: edge.source,
            targetId: edge.target,
            layer: 'web'
          });
          webEdgesUpdated = true;
        } else {
          this.pendingWebEdges.push(edge);
        }
      }
    }
    
    // Rebuild the geometries if needed
    if (standardEdgesUpdated) {
      this.rebuildStandardEdgeGeometry();
    }
    
    if (webEdgesUpdated) {
      this.rebuildWebEdgeGeometry();
    }
  }
  
  // Rebuild standard edges geometry
  rebuildStandardEdgeGeometry() {
    const positions = [];
    
    for (const [key, edgeObj] of this.edgeRegistry.entries()) {
      if (edgeObj.layer === 'web') continue;
      
      const sourceMesh = this.getNodeById(edgeObj.sourceId);
      const targetMesh = this.getNodeById(edgeObj.targetId);
      
      if (!sourceMesh || !targetMesh) continue;
      
      const sourcePos = this.updateNodePosition(edgeObj.sourceId, sourceMesh);
      const targetPos = this.updateNodePosition(edgeObj.targetId, targetMesh);
      
      positions.push(
        sourcePos.x, sourcePos.y, sourcePos.z,
        targetPos.x, targetPos.y, targetPos.z
      );
    }
    
    if (positions.length > 0) {
      this.standardEdgeGeometry.dispose();
      this.standardEdgeGeometry = new LineSegmentsGeometry();
      this.standardEdgeGeometry.setPositions(positions);
      this.standardEdgeObject.geometry = this.standardEdgeGeometry;
    }
  }
  
  // Rebuild web edges geometry
  rebuildWebEdgeGeometry() {
    const positions = [];
    
    for (const [key, edgeObj] of this.edgeRegistry.entries()) {
      if (edgeObj.layer !== 'web') continue;
      
      const sourceMesh = this.getNodeById(edgeObj.sourceId);
      const targetMesh = this.getNodeById(edgeObj.targetId);
      
      if (!sourceMesh || !targetMesh) continue;
      
      const sourcePos = this.updateNodePosition(edgeObj.sourceId, sourceMesh);
      const targetPos = this.updateNodePosition(edgeObj.targetId, targetMesh);
      
      positions.push(
        sourcePos.x, sourcePos.y, sourcePos.z,
        targetPos.x, targetPos.y, targetPos.z
      );
    }
    
    if (positions.length > 0) {
      this.webEdgeGeometry.dispose();
      this.webEdgeGeometry = new LineSegmentsGeometry();
      this.webEdgeGeometry.setPositions(positions);
      this.webEdgeObject.geometry = this.webEdgeGeometry;
    }
  }
  
  // Update edge positions efficiently
  updateEdgePositions() {
    let standardEdgesNeedUpdate = false;
    let webEdgesNeedUpdate = false;
    
    // Update node positions cache and check if edges need updating
    for (const [key, edgeObj] of this.edgeRegistry.entries()) {
      const sourceMesh = this.getNodeById(edgeObj.sourceId);
      const targetMesh = this.getNodeById(edgeObj.targetId);
      
      if (!sourceMesh || !targetMesh) continue;
      
      const oldSourcePos = this.nodePositions.get(edgeObj.sourceId);
      const oldTargetPos = this.nodePositions.get(edgeObj.targetId);
      
      const newSourcePos = new THREE.Vector3();
      const newTargetPos = new THREE.Vector3();
      
      sourceMesh.updateMatrixWorld(true);
      targetMesh.updateMatrixWorld(true);
      
      sourceMesh.getWorldPosition(newSourcePos);
      targetMesh.getWorldPosition(newTargetPos);
      
      // Check if positions changed significantly
      const sourceChanged = !oldSourcePos || newSourcePos.distanceToSquared(oldSourcePos) > 0.0001;
      const targetChanged = !oldTargetPos || newTargetPos.distanceToSquared(oldTargetPos) > 0.0001;
      
      if (sourceChanged) {
        this.nodePositions.set(edgeObj.sourceId, newSourcePos.clone());
      }
      
      if (targetChanged) {
        this.nodePositions.set(edgeObj.targetId, newTargetPos.clone());
      }
      
      if (sourceChanged || targetChanged) {
        if (edgeObj.layer === 'web') {
          webEdgesNeedUpdate = true;
        } else {
          standardEdgesNeedUpdate = true;
        }
      }
    }
    
    // Rebuild geometries if necessary
    if (standardEdgesNeedUpdate) {
      this.rebuildStandardEdgeGeometry();
    }
    
    if (webEdgesNeedUpdate) {
      this.rebuildWebEdgeGeometry();
    }
    
    // Try to process any pending web edges
    if (this.pendingWebEdges.length > 0 && Math.random() < 0.05) {
      this.processPendingWebEdges();
    }
  }
  
  // Process pending web edges
  processPendingWebEdges() {
    const newPendingList = [];
    let updated = false;
    
    for (const edge of this.pendingWebEdges) {
      const sourceMesh = this.getNodeById(edge.source);
      const targetMesh = this.getNodeById(edge.target);
      
      if (sourceMesh && targetMesh) {
        const key = `${edge.source}-${edge.target}`;
        this.edgeRegistry.set(key, {
          sourceId: edge.source,
          targetId: edge.target,
          layer: 'web'
        });
        updated = true;
      } else {
        newPendingList.push(edge);
      }
    }
    
    this.pendingWebEdges = newPendingList;
    
    if (updated) {
      this.rebuildWebEdgeGeometry();
    }
  }

  // Traffic visualization methods (simplified, can be expanded)
  spawnLocalTrafficParticles(intensity) {
    const maxParticlesPerEdge = 5;
    
    for (const [key, edgeObj] of this.edgeRegistry.entries()) {
      if (edgeObj.layer === 'web') continue;
      
      const sourceNode = this.getNodeById(edgeObj.sourceId);
      const targetNode = this.getNodeById(edgeObj.targetId);
      
      if (sourceNode && targetNode &&
          sourceNode.userData.type !== 'external' &&
          targetNode.userData.type !== 'external') {
        const particleCount = Math.floor(intensity * maxParticlesPerEdge);
        
        for (let i = 0; i < particleCount; i++) {
          this.animateTraffic(sourceNode, targetNode, 5);
        }
      }
    }
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

  // Traffic animation methods
  animateTraffic(srcNode, dstNode, size) {
    const packetMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00 });
    const packetGeometry = new THREE.SphereGeometry(size / 50, 8, 8);
    const packet = new THREE.Mesh(packetGeometry, packetMaterial);
    this.scene.add(packet);
    this.trafficParticles.push({ packet, srcNode, dstNode, progress: 0 });
  }

  updateTraffic() {
    for (let i = this.trafficParticles.length - 1; i >= 0; i--) {
      const traffic = this.trafficParticles[i];
      traffic.progress += 0.05;
      
      if (traffic.progress >= 1) {
        this.scene.remove(traffic.packet);
        traffic.packet.material.dispose();
        traffic.packet.geometry.dispose();
        this.trafficParticles.splice(i, 1);
      } else {
        traffic.packet.position.lerpVectors(traffic.srcNode.position, traffic.dstNode.position, traffic.progress);
      }
    }
  }
}
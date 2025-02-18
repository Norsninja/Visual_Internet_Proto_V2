import * as THREE from 'three';
import { createNodeMesh } from './singlenode.js';
import * as overlayManager from '../overlayManager.js';
import { GraphState } from './state.js';
import { PhysicsEngine } from '../physicsEngine.js';

export class NodesManager {
  constructor(scene) {
    this.scene = scene;
    this.nodeRegistry = new Map();  // Stores Three.js meshes by node ID
    this.missedUpdates = new Map(); // (Optional) Tracks how many times a node was missing
    this.state = new GraphState();  // Central data store
    this.physicsEngine = null;      // We'll instantiate it once we have data
  }

  // We add edgesData as a second parameter:
  updateNodes(nodesData, edgesData) {
    // 1. Update central state with new node data
    nodesData.forEach(node => {
      this.state.addOrUpdateNode(node);
    });

    // 2. Reconcile the state with the Three.js scene
    const allNodes = this.state.getAllNodes();
    let routerMesh = this.getNodeById("router");

    allNodes.forEach(nodeState => {
      let mesh = this.nodeRegistry.get(nodeState.id);

      if (!mesh) {
        // If no mesh exists, pick an initial position if not already set
        if (!nodeState.position && nodeState.layer !== "web") {
          if (nodeState.type === "router") {
            nodeState.position = new THREE.Vector3(0, 0, 0);
          } else if (nodeState.type === "device" && routerMesh) {
            let angle = Math.random() * Math.PI * 2;
            let radius = 30 + Math.random() * 20;
            let zOffset = (Math.random() - 0.5) * 20;
            nodeState.position = new THREE.Vector3(
              routerMesh.position.x + radius * Math.cos(angle),
              routerMesh.position.y + radius * Math.sin(angle),
              routerMesh.position.z + zOffset
            );
          } else {
            let angle = Math.random() * Math.PI * 2;
            let radius = 100 + Math.random() * 50;
            let zOffset = (Math.random() - 0.5) * 50;
            nodeState.position = new THREE.Vector3(
              radius * Math.cos(angle),
              radius * Math.sin(angle),
              routerMesh ? routerMesh.position.z + zOffset : zOffset
            );
          }
        }
        // Create a new Three.js mesh for this node
        mesh = createNodeMesh(nodeState);
        this.scene.add(mesh);
        this.nodeRegistry.set(nodeState.id, mesh);
      } else {
        // Update existing mesh userData
        Object.assign(mesh.userData, nodeState);
        // For non-web nodes, update position from state
        if (nodeState.layer !== "web" && nodeState.position) {
          mesh.position.copy(nodeState.position);
        }
        // Update color
        mesh.material.color.set(
          nodeState.color || (nodeState.type === "external" ? "red" : (nodeState.layer === "web" ? "#ff69b4" : "#0099FF"))
        );
        
      }
      // Update overlays
      overlayManager.updateOverlays(mesh);
          // After updating overlays, add:
      if (mesh.userData.ports && mesh.userData.ports.length > 0) {
        // Only spawn port moons if one of them isn’t already a child of this node.
        if (!mesh.getObjectByName(`${mesh.userData.id}-port-${mesh.userData.ports[0]}`)) {
          this.spawnChildNodes(mesh, mesh.userData.ports);
        }
      }
          
          
    });


    // 3. Build d3-format arrays for the PhysicsEngine
    //    a) Array of nodes
    const d3Nodes = [];
    this.nodeRegistry.forEach((mesh, id) => {
      // Skip port moons (child nodes) from the physics simulation.
      if (mesh.userData.type === "child") return;
      d3Nodes.push({ id: id });
    });

    //    b) Array of links
    const d3Links = (edgesData || []).map(edge => ({
      source: edge.source,
      target: edge.target
    }));

    // 4. Create or update the PhysicsEngine
    if (!this.physicsEngine) {
      this.physicsEngine = new PhysicsEngine(d3Nodes, d3Links, this.nodeRegistry);
    } else {
      this.physicsEngine.updateGraph(d3Nodes, d3Links);
    }
  }
  removeChildNodesForPorts(parentNode) {
    // Iterate over all children of the parent and remove those whose names start with the parent's id + "-port-"
    const childrenToRemove = [];
    parentNode.children.forEach(child => {
      if (child.name && child.name.startsWith(`${parentNode.userData.id}-port-`)) {
        childrenToRemove.push(child);
      }
    });
    childrenToRemove.forEach(child => {
      parentNode.remove(child);
      this.nodeRegistry.delete(child.userData.id);
    });
  }
  spawnChildNodes(parentNode, openPorts) {
    // Remove any existing port moons.
    this.removeChildNodesForPorts(parentNode);
  
    console.log(`Spawning child nodes for ${parentNode.userData.id} with ports:`, openPorts);
    const orbitRadius = 40;  // Adjust as needed.
    const numPorts = openPorts.length;
    
    openPorts.forEach((port, index) => {
      console.log(`Creating moon for port: ${port}, index: ${index}`);
      const angle = (2 * Math.PI * index) / numPorts;
      const offset = new THREE.Vector3(
        Math.cos(angle) * orbitRadius,
        Math.sin(angle) * orbitRadius,
        0
      );
      // Use the larger sphere geometry
      const geometry = new THREE.SphereGeometry(5, 16, 16);
      const material = new THREE.MeshBasicMaterial({ color: 0xaaaaaa });
      const childMesh = new THREE.Mesh(geometry, material);
      childMesh.position.copy(offset);
      
      // Set a unique name for removal later:
      childMesh.name = `${parentNode.userData.id}-port-${port}`;
      childMesh.userData = {
        id: `${parentNode.userData.id}-port-${port}`,
        label: `Port ${port}`,
        type: "child",
        port: port,
        parentId: parentNode.userData.id,
      };
      
      // Parent the child mesh to the parent node
      parentNode.add(childMesh);
      this.nodeRegistry.set(childMesh.userData.id, childMesh);
    });
    
    // Update parent's ports property
    parentNode.userData.ports = openPorts;
  }
  

  getNodesArray() {
    return Array.from(this.nodeRegistry.values());
  }

  getNodeById(id) {
    if (!id) return undefined;
    let node = this.nodeRegistry.get(id);
    if (!node) {
      const decodedId = decodeURIComponent(id);
      node = this.nodeRegistry.get(decodedId);
      if (node) {
        console.log(`✅ Found node after decoding: ${decodedId}`);
      }
    }
    return node;
  }
}

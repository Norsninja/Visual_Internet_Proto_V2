import * as THREE from 'three';
import { createNodeMesh } from './singlenode.js';
import * as overlayManager from '../overlayManager.js';
import { GraphState } from './state.js';
import { PhysicsEngine } from '../physicsEngine.js';

export class NodesManager {
  constructor(scene) {
    this.scene = scene;
    this.nodeRegistry = new Map();  // Stores Three.js meshes by node ID
    this.state = new GraphState();  // Central data store
    this.physicsEngine = null;      // We'll instantiate it once we have data
    // Maintain a set of nodes that have pending updates
    this.changedNodes = new Set();
    this.nodeCreationListeners = [];
  }
  onNodeCreated(callback) {
    this.nodeCreationListeners.push(callback);
    return this;
  }
  // Update nodes with the ability to selectively mark changes
  updateNodes(nodesData, edgesData) {
    nodesData.forEach(nodeData => {
      this.state.addOrUpdateNode(nodeData);
      // Mark this node as changed
      this.changedNodes.add(nodeData.id);
    });
    // Only update nodes that are in the changedNodes set
    this.reconcileSceneMeshes();
    this.updatePhysicsEngine(edgesData);
    // Clear the set after reconciling
    this.changedNodes.clear();
  }

  // Reconcile only changed nodes rather than all nodes
  reconcileSceneMeshes() {
    // If no specific nodes are marked, default to updating all nodes
    const nodeStates = this.changedNodes.size > 0
      ? Array.from(this.changedNodes).map(id => this.state.getNode(id))
      : this.state.getAllNodes();

    const routerMesh = this.getNodeById("router");

    nodeStates.forEach(nodeState => {
      // Skip nodes that represent scans
      if (
        nodeState.id &&
        (
          nodeState.id.startsWith('portscan-') ||
          nodeState.id.startsWith('bgpscan-') ||
          nodeState.id.startsWith('sslscan-') ||
          nodeState.id.startsWith('webscan-') ||
          nodeState.id.startsWith('advanced_')
        )
      ) {
        return;
      }    
      let mesh = this.nodeRegistry.get(nodeState.id);

      if (!mesh) {
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
        // Create a new mesh
        mesh = createNodeMesh(nodeState);
        this.scene.add(mesh);
        this.nodeRegistry.set(nodeState.id, mesh);
        this.nodeCreationListeners.forEach(listener => listener(nodeState.id, mesh));
      } else {
        // Update existing mesh's userData and properties
        Object.assign(mesh.userData, nodeState);
        if (nodeState.position) {
          mesh.position.copy(nodeState.position);
        } else if (nodeState.layer === "web" && nodeState.parentId) {
          // Special handling for web nodes with parents
          const parentNode = this.getNodeById(nodeState.parentId);
          if (parentNode) {
            const angle = Math.random() * Math.PI * 2;
            const radius = 15 + Math.random() * 10;
            const zOffset = (Math.random() - 0.5) * 10;
            
            mesh.position.set(
              radius * Math.cos(angle),
              radius * Math.sin(angle),
              zOffset
            );
            
            // Store world position for edge reference
            mesh.updateMatrixWorld(true);
            mesh.userData.worldPosition = new THREE.Vector3();
            mesh.getWorldPosition(mesh.userData.worldPosition);
          }
        }
      }

      // Update mesh material based on scan status
      if (nodeState.fully_scanned) {
        mesh.material.color.set("#00FF00");
        mesh.material.emissive.set("#008000");
        mesh.material.emissiveIntensity = 0.5;
      } else {
        mesh.material.color.set(nodeState.color || (nodeState.type === "external" ? "red" : "#0099FF"));
      }

      // Update overlays
      overlayManager.updateOverlays(mesh);

      // Spawn child nodes for open ports if necessary
      if (mesh.userData.ports && mesh.userData.ports.length > 0) {
        if (!mesh.getObjectByName(`${mesh.userData.id}-port-${mesh.userData.ports[0]}`)) {
          this.spawnChildNodes(mesh, mesh.userData.ports);
        }
      }
    });
  }

  updatePhysicsEngine(edgesData) {
    const d3Nodes = [];
    this.nodeRegistry.forEach((mesh, id) => {
      if (mesh.userData.type === "child") return;
      d3Nodes.push({ id: id });
    });
    const d3Links = (edgesData || []).map(edge => ({
      source: edge.source,
      target: edge.target
    }));

    if (!this.physicsEngine) {
      this.physicsEngine = new PhysicsEngine(d3Nodes, d3Links, this.nodeRegistry);
    } else {
      this.physicsEngine.updateGraph(d3Nodes, d3Links);
    }
  }

  removeChildNodesForPorts(parentNode) {
    // Remove child nodes whose names start with the parent's id followed by "-port-"
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
    // Remove any existing port moons before creating new ones.
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
      const geometry = new THREE.SphereGeometry(5, 16, 16);
      const material = new THREE.MeshBasicMaterial({ color: 0xaaaaaa });
      const childMesh = new THREE.Mesh(geometry, material);
      childMesh.position.copy(offset);
      
      childMesh.name = `${parentNode.userData.id}-port-${port}`;
      childMesh.userData = {
        id: `${parentNode.userData.id}-port-${port}`,
        label: `Port ${port}`,
        type: "child",
        port: port,
        parentId: parentNode.userData.id,
      };
      
      parentNode.add(childMesh);
      this.nodeRegistry.set(childMesh.userData.id, childMesh);
    });
    
    // Update parent's ports property.
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

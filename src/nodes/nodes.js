import * as THREE from 'three';
import { createNodeMesh as originalCreateNodeMesh, generateMaterial } from './singlenode.js';
import * as overlayManager from '../overlayManager.js';
import { GraphState } from './state.js';
import { PhysicsEngine } from '../physicsEngine.js';
import { updateNodeToCAMaterial, cleanupCANodes } from './CA_node_material.js';
import { createMysteriousMaterial, disposeMysteriousMaterial } from '../mysteriousMaterial.js';
// We'll use the original function directly and apply CA material afterward
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
      const existingNode = this.state.getNode(nodeData.id);
      const wasFullyScanned = existingNode?.fully_scanned || false;
      const isNowFullyScanned = nodeData.fully_scanned || false;
      
      this.state.addOrUpdateNode(nodeData);
      // Mark this node as changed
      this.changedNodes.add(nodeData.id);
      
      // Check if the node became fully scanned and needs CA material
      if (!wasFullyScanned && isNowFullyScanned) {
        const nodeMesh = this.nodeRegistry.get(nodeData.id);
        if (nodeMesh && !nodeMesh.userData.caEnabled) {
          // Instead of immediately updating, we'll do it after reconcile
          nodeMesh.userData.needsCAUpdate = true;
        }
      }
    });
    
    // Only update nodes that are in the changedNodes set
    this.reconcileSceneMeshes();
    this.updatePhysicsEngine(edgesData);
    
    // After reconciliation, check for nodes that need CA update
    this.applyPendingCAUpdates();
    
    // Clear the set after reconciling
    this.changedNodes.clear();
  }

  // Apply CA material updates after all nodes are reconciled
  applyPendingCAUpdates() {
    // Get all nodes that need CA update
    const nodesToUpdate = Array.from(this.nodeRegistry.values()).filter(
      mesh => mesh.userData.needsCAUpdate && !mesh.userData.caEnabled && !mesh.userData.caProcessing
    );
    
    // Log how many nodes need updates
    if (nodesToUpdate.length > 0) {
      console.log(`Scheduling CA updates for ${nodesToUpdate.length} nodes`);
    }
    
    // Process nodes with a maximum batch size to prevent thundering herd
    const batchSize = 1; // Process up to 3 nodes per frame
    
    // Process a limited batch of nodes
    nodesToUpdate.slice(0, batchSize).forEach(mesh => {
      mesh.userData.needsCAUpdate = false;
      mesh.userData.caProcessing = true;
      
      // Update to CA material asynchronously
      updateNodeToCAMaterial(mesh)
        .then(() => {
          console.log(`CA material applied to node: ${mesh.userData.id}`);
        })
        .catch(err => {
          console.error(`Failed to apply CA material to node: ${mesh.userData.id}`, err);
          // Reset flags on error for retry
          mesh.userData.caProcessing = false;
          mesh.userData.needsCAUpdate = true;
        });
    });
    
    // If there are more nodes to update, schedule another update on the next frame
    if (nodesToUpdate.length > batchSize) {
      requestAnimationFrame(() => this.applyPendingCAUpdates());
    }
  }

  // Reconcile only changed nodes rather than all nodes
  reconcileSceneMeshes() {
    // If no specific nodes are marked, default to updating all nodes
    const nodeStates = this.changedNodes.size > 0
      ? Array.from(this.changedNodes).map(id => this.state.getNode(id)).filter(Boolean)
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
  
      // Check if this node is transitioning from unexplored to found
      const wasUnexplored = mesh?.userData?.isUnexploredExternal === true;
      const isNowFound = nodeState.found !== undefined;
      const transitionToFound = wasUnexplored && isNowFound;
  
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
        mesh = originalCreateNodeMesh(nodeState);
        this.scene.add(mesh);
        this.nodeRegistry.set(nodeState.id, mesh);
        this.nodeCreationListeners.forEach(listener => listener(nodeState.id, mesh));
        
        // If the node is fully scanned, mark it for CA update
        if (nodeState.fully_scanned) {
          mesh.userData.needsCAUpdate = true;
        }
      } else {
        // Update existing mesh's userData with new state data
        Object.assign(mesh.userData, nodeState);
        
        // Handle transition from unexplored to found
        if (transitionToFound) {
          // Unregister from mysterious nodes manager
          if (window.mysteriousNodesManager) {
            window.mysteriousNodesManager.unregisterNode(mesh);
          }
          
          // Create a standard material to replace the mysterious one
          const newColor = nodeState.color || (nodeState.type === "external" ? "red" : "#0099FF");
          const newMaterial = generateMaterial(nodeState.type, newColor, mesh.userData.seed);
          
          // Apply the new material
          if (mesh.material && mesh.material.userData.isMysteriousMaterial) {
            disposeMysteriousMaterial(mesh.material);
          }
          mesh.material = newMaterial;
          
          // Update flags
          mesh.userData.isUnexploredExternal = false;
          
          // Create a flash effect to highlight the transition
          createTransitionEffect(mesh);
        }
        
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
              parentNode.position.x + radius * Math.cos(angle),
              parentNode.position.y + radius * Math.sin(angle),
              parentNode.position.z + zOffset
            );
            
            // Store world position for edge reference
            mesh.updateMatrixWorld(true);
            mesh.userData.worldPosition = new THREE.Vector3();
            mesh.getWorldPosition(mesh.userData.worldPosition);
          }
        }
        
        // Check if node has become fully scanned
        if (nodeState.fully_scanned && !mesh.userData.caEnabled && !mesh.userData.caProcessing) {
          mesh.userData.needsCAUpdate = true;
        }
      }
  
      // Update mesh material based on scan status if not using CA material or mysterious material
      if (!mesh.userData.isUnexploredExternal) {
        if (nodeState.fully_scanned && !mesh.userData.caEnabled) {
          mesh.material.color.set("#00FF00");
          mesh.material.emissive = mesh.material.emissive || new THREE.Color("#008000");
          mesh.material.emissiveIntensity = 0.5;
        } else if (!nodeState.fully_scanned && !mesh.userData.caEnabled) {
          mesh.material.color.set(nodeState.color || (nodeState.type === "external" ? "red" : "#0099FF"));
        }
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
  
  // Add method to clean up when nodes are removed
  removeNode(nodeId) {
    const node = this.getNodeById(nodeId);
    if (node) {
      this.scene.remove(node);
      this.nodeRegistry.delete(nodeId);
      
      // Clean up CA nodes
      cleanupCANodes();
    }
  }
}
function createTransitionEffect(mesh) {
  // Just pulse the material's emissive property
  const originalColor = mesh.material.color.clone();
  const originalEmissive = mesh.material.emissive ? mesh.material.emissive.clone() : new THREE.Color(0);
  const originalEmissiveIntensity = mesh.material.emissiveIntensity || 0;
  
  // Set initial flash state
  mesh.material.emissive = new THREE.Color(0xffffff);
  mesh.material.emissiveIntensity = 1.0;
  
  // Simple timeout to restore original appearance
  setTimeout(() => {
    mesh.material.color = originalColor;
    mesh.material.emissive = originalEmissive;
    mesh.material.emissiveIntensity = originalEmissiveIntensity;
  }, 500);
}
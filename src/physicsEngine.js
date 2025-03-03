// physicsEngine.js
import {
  forceSimulation,
  forceManyBody,
  forceLink,
  forceCenter,
  forceZ,
  forceCollide
} from 'd3-force-3d';

/**
 * Custom force that attracts non-ASN nodes toward ASN nodes.
 * Optionally uses the ASN's connectedCount (if provided in userData)
 * to scale the attraction strength.
 */
function forceAttractASN() {
  let nodes;
  const baseStrength = 0.3;
  
  function force(alpha) {
    // Filter ASN nodes
    const asnNodes = nodes.filter(n => String(n.id).startsWith("AS"));
    nodes.forEach(n => {
      if (!String(n.id).startsWith("AS")) {
        asnNodes.forEach(a => {
          let dx = a.x - n.x, dy = a.y - n.y, dz = a.z - n.z;
          let distance = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
          if (distance > 500) { // Only act if far enough apart
            let multiplier = 1;
            if (a.userData && a.userData.connectedCount) {
              multiplier = 1 + a.userData.connectedCount / 10; // scale factor based on connectivity
            }
            let factor = (baseStrength * alpha * multiplier) / (distance * 0.5);
            n.vx += dx * factor;
            n.vy += dy * factor;
            n.vz += dz * factor;
          }
        });
      }
    });
  }
  
  force.initialize = function(_nodes) {
    nodes = _nodes;
  };
  
  return force;
}

/**
 * Custom orbital force to create hierarchical orbits.
 * If a node has a parentId (in userData), it is pulled toward a target orbit radius
 * relative to that parent. This forces IP nodes to orbit ASN nodes, and web nodes
 * to orbit their hosting IP.
 */
function forceOrbit() {
  let nodes;
  // Define desired orbit radii per child type.
  const orbitRadii = {
    "device": 100,  // e.g., IP nodes orbiting ASN nodes
    "web": 30,      // web nodes orbiting hosting IP nodes
    "default": 80   // fallback radius
  };
  const orbitalStrength = 0.05;
  
  function force(alpha) {
    nodes.forEach(n => {
      if (n.userData && n.userData.parentId) {
        // Find the parent node in the simulation.
        const parent = nodes.find(p => p.id === n.userData.parentId);
        if (parent) {
          let dx = n.x - parent.x;
          let dy = n.y - parent.y;
          let dz = n.z - parent.z;
          let currentDistance = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.1;
          let type = n.userData.type || "default";
          let targetRadius = orbitRadii[type] || orbitRadii["default"];
          let error = currentDistance - targetRadius;
          let adjustment = error * orbitalStrength * alpha;
          // Normalize the vector and apply the correction force.
          let nx = (dx / currentDistance) * adjustment;
          let ny = (dy / currentDistance) * adjustment;
          let nz = (dz / currentDistance) * adjustment;
          // Adjust velocities to push or pull toward the target orbit.
          n.vx -= nx;
          n.vy -= ny;
          n.vz -= nz;
        }
      }
    });
  }
  
  force.initialize = function(_nodes) {
    nodes = _nodes;
  };
  
  return force;
}

export class PhysicsEngine {
  constructor(nodesArray, edgesArray, nodeRegistry) {
    this.nodeRegistry = nodeRegistry;
    
    // Build initial node and link arrays.
    this.nodes = this.initializeNodes(nodesArray);
    this.links = edgesArray;
    
    // Create the force simulation.
    this.simulation = forceSimulation(this.nodes)
      .force('charge', forceManyBody().strength(d => {
        if (d.id === "router") return 0; // Do not repel the router.
        if (d.userData && d.userData.type === "web") return -200;
        if (d.userData && d.userData.type === "external") return -50;
        if (d.id.startsWith("AS")) return -100; // Moderate repulsion for ASN nodes.
        return -400; // Default for other nodes.
      }))
      .force('link', forceLink(this.links)
        .id(d => d.id)
        .distance(d => {
          // Define custom link distances:
          // If link connects an ASN to its direct child, use a specified orbit distance.
          if (String(d.source.id).startsWith("AS") && d.target.userData && d.target.userData.parentId === d.source.id) {
            return 200;
          }
          if (d.source.userData && d.source.userData.type === "external") return 1000;
          if (d.source.userData && d.source.userData.type === "web") return 100;
          return 300;
        })
        .strength(0.1)
      )
      .force('center', forceCenter(0, 0, 0).strength(0.005))
      .force('z', forceZ(0).strength(0.005)) // Reduced z-axis anchoring for increased vertical spread.
      .force('collision', forceCollide().radius(d => {
        if (d.id.startsWith("AS")) return 50;
        if (d.userData && d.userData.type === "web") return 5;
        return 10;
      }).strength(0.2))
      .force('attractASN', forceAttractASN())
      .force('orbit', forceOrbit())
      .alphaDecay(0.002);
    
    // Pin the router (mission control) so it stays static.
    this.pinRouter();
    
    // On each simulation tick, update the Three.js meshes.
    this.simulation.on('tick', () => {
      this.nodes.forEach(node => {
        const mesh = this.nodeRegistry.get(node.id);
        if (mesh) {
          mesh.position.set(node.x, node.y, node.z);
        }
      });
    });
  }
  
  // Initialize nodes – preserve positions for existing nodes.
  // New ASN nodes are positioned on a spherical shell to encourage outward flow.
  initializeNodes(nodesArray) {
    const existingMap = new Map();
    if (this.nodes) {
      this.nodes.forEach(n => existingMap.set(n.id, n));
    }
    const newNodes = [];
    for (const rawNode of nodesArray) {
      let nodeObj;
      if (existingMap.has(rawNode.id)) {
        nodeObj = existingMap.get(rawNode.id);
      } else {
        let scaleFactor = 1;
        if (rawNode.id.startsWith("AS")) scaleFactor = 10;
        else if (rawNode.userData && rawNode.userData.type === "external") scaleFactor = 5;
        else if (rawNode.userData && rawNode.userData.type === "web") scaleFactor = 0.5;
        
        // For ASN nodes, position them on a sphere (radius 300-500) to encourage an outward flow.
        if (rawNode.id.startsWith("AS")) {
          const radius = 300 + Math.random() * 200;
          const theta = Math.random() * 2 * Math.PI;
          const phi = Math.acos((Math.random() * 2) - 1);
          const x = radius * Math.sin(phi) * Math.cos(theta);
          const y = radius * Math.sin(phi) * Math.sin(theta);
          const z = radius * Math.cos(phi);
          nodeObj = { id: rawNode.id, x, y, z };
        } else {
          // Otherwise, position randomly within a smaller cube.
          nodeObj = {
            id: rawNode.id,
            x: (Math.random() - 0.5) * 500 * scaleFactor,
            y: (Math.random() - 0.5) * 500 * scaleFactor,
            z: (Math.random() - 0.5) * 500 * scaleFactor,
          };
        }
      }
      newNodes.push(nodeObj);
    }
    return newNodes;
  }
  
  // Pin the router node (mission control) to keep it static.
  pinRouter() {
    const router = this.nodes.find(n => {
      const mesh = this.nodeRegistry.get(n.id);
      return mesh && mesh.userData.type === "router";
    });
    if (router) {
      router.fx = router.x;
      router.fy = router.y;
      router.fz = router.z;
    }
  }
  
  // Update the simulation with new nodes and links.
  updateGraph(nodesArray, edgesArray) {
    const prevNodeCount = this.nodes.length;
    const prevLinkCount = this.links.length;
    
    this.nodes = this.initializeNodes(nodesArray);
    this.links = edgesArray;
    
    this.simulation.nodes(this.nodes);
    this.simulation.force('link').links(this.links);
    
    this.pinRouter();
    
    const nodesChanged = this.nodes.length !== prevNodeCount;
    const linksChanged = this.links.length !== prevLinkCount;
    
    const newAlpha = (nodesChanged || linksChanged) ? 0.1 : 0.02;
    this.simulation.alpha(newAlpha).restart();
  }
}

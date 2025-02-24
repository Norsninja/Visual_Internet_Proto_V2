// physicsEngine.js
import { 
  forceSimulation,
  forceManyBody,
  forceLink,
  forceCenter,
  forceZ,
  forceCollide
} from 'd3-force-3d';
function forceAttractASN() {
  let nodes, asnNodes = [];
  const strength = 0.2; // Weaker pull

  function force(alpha) {
    asnNodes = nodes.filter(n => String(n.id).startsWith("AS"));

    nodes.forEach(n => {
      if (!String(n.id).startsWith("AS")) {
        asnNodes.forEach(a => {
          let dx = a.x - n.x, dy = a.y - n.y, dz = a.z - n.z;
          let distance = Math.sqrt(dx * dx + dy * dy) || 1;

          if (distance > 300) {  // Keep a natural spread, avoid extreme pull
            let factor = (strength * alpha) / (distance * 0.5); // Scale attraction down
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

export class PhysicsEngine {
  constructor(nodesArray, edgesArray, nodeRegistry) {
    this.nodeRegistry = nodeRegistry;

    // 1) Build or reuse node objects
    this.nodes = this.initializeNodes(nodesArray);
    this.links = edgesArray;

    // 2) Create a force simulation
    //    - ManyBody repels nodes
    //    - Link sets the distance between connected nodes
    //    - Center slightly draws everything to (0,0,0)
    //    - Z is a mild anchor toward z=0 (optional)
    //    - Collide keeps nodes from overlapping
    //    - alphaDecay is lower, so it won’t freeze too quickly
    this.simulation = forceSimulation(this.nodes)
      .force('charge', forceManyBody().strength(d => d.id.startsWith("AS") ? 0 : -400))
      .force('link', forceLink(this.links)
        .id(d => d.id)
        .distance(d => (String(d.source.id).startsWith("AS") ? 200 : 100)) // Access ID properly
        .strength(0.2)
      )

      .force('center', forceCenter(0, 0, 0).strength(0.01))
      .force('z', forceZ(0).strength(0.01))
      .force('collision', forceCollide().radius(5).strength(0.2))
      // Add our custom attraction force for ASN nodes
      .force('attractASN', forceAttractASN())
      .alphaDecay(0.001);

    // 3) Pin the router node if it exists
    this.pinRouter();

    // 4) On each simulation tick, update the Three.js node positions
    this.simulation.on('tick', () => {
      this.nodes.forEach(node => {
        const mesh = this.nodeRegistry.get(node.id);
        if (mesh) {
          mesh.position.x = node.x;
          mesh.position.y = node.y;
          mesh.position.z = node.z;
        }
      });
    });
  }

  /**
   * Reuse existing node objects if possible, else create a new one with random x,y,z.
   */
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
        nodeObj = {
          id: rawNode.id,
          x: (Math.random() - 0.5) * 400,
          y: (Math.random() - 0.5) * 400,
          z: (Math.random() - 0.5) * 400,
        };
      }
      newNodes.push(nodeObj);
    }
    return newNodes;
  }

  /**
   * Pin the router node to the origin if it exists.
   */
  pinRouter() {
    // Find a node whose corresponding mesh has userData.type === "router"
    const router = this.nodes.find(n => {
      const mesh = this.nodeRegistry.get(n.id);
      return mesh && mesh.userData.type === "router";
    });
    if (router) {
      // Pin the router at its current position
      router.fx = router.x;
      router.fy = router.y;
      router.fz = router.z;
    }
  }
  

  /**
   * Rebuild nodes & links, then lightly or strongly reheat the simulation depending on changes.
   */
  updateGraph(nodesArray, edgesArray) {
    const prevNodeCount = this.nodes.length;
    const prevLinkCount = this.links.length;

    this.nodes = this.initializeNodes(nodesArray);
    this.links = edgesArray;

    this.simulation.nodes(this.nodes);
    this.simulation.force('link').links(this.links);

    // Re-pin the router
    this.pinRouter();

    const nodesChanged = this.nodes.length !== prevNodeCount;
    const linksChanged = this.links.length !== prevLinkCount;

    // Reheat the simulation. If big changes, alpha=1; else small nudge with alpha=0.2
    const newAlpha = (nodesChanged || linksChanged) ? 0.5 : 0.2;
    this.simulation.alpha(newAlpha).restart();
  }
  
}


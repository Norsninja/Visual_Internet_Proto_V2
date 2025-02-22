// src/network.js
import * as overlayManager from './overlayManager.js';

export class NetworkManager {
  constructor(nodesManager, edgesManager, endpoint = 'http://192.168.0.11:5000') {
    this.nodesManager = nodesManager;
    this.edgesManager = edgesManager;
    this.endpoint = endpoint;
  }

  async fetchNetworkData(attempt = 0) {
    try {
      const response = await fetch(`${this.endpoint}/network`);
      if (!response.ok) throw new Error(`Network error: ${response.status}`);
      const data = await response.json();

      // console.log("🔍 Received Nodes Data:", JSON.stringify(data.nodes, null, 2));
      if (!data.nodes || data.nodes.length === 0) {
        console.warn(`No nodes received (Attempt ${attempt}), retrying in 5s...`);
        if (attempt < 10) {
          setTimeout(() => this.fetchNetworkData(attempt + 1), 5000);
        }
        return;
      }

      // Update nodes and physics simulation using the new API:
      this.nodesManager.updateNodes(data.nodes, data.edges);
      // Update edges drawing as before
      this.edgesManager.updateEdges(data.edges);
    } catch (error) {
      console.error("Error fetching network data:", error);
      setTimeout(() => this.fetchNetworkData(attempt + 1), 5000);
    }
  }

  startPeriodicUpdates(intervalMs = 10000) {
    this.fetchNetworkData(); // initial call
    setInterval(() => this.fetchNetworkData(), intervalMs);
  }

  async fetchTracerouteData(targetIP, forceNew = false) {
    let url = `${this.endpoint}/remote_traceroute?target=${targetIP}`;
    if (forceNew) url += "&nocache=true";
  
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
      const data = await response.json();
      console.log("Fetched Traceroute Data:", data);
      if (!data.hops || data.hops.length === 0) {
        console.warn(`⚠️ No hops returned for ${targetIP}`);
        return null;
      }
      this.updateTracerouteNodes(data.hops, targetIP);
      return data;
    } catch (error) {
      console.error("❌ Error fetching traceroute:", error);
      alert(`Failed to run traceroute for ${targetIP}.`);
      return null;
    }
  }

  updateTracerouteNodes(hops, targetIP) {
    let prevNode = this.nodesManager.getNodeById(targetIP);
    let newEdges = [];
  
    hops.forEach((hop, index) => {
      let existingNode = this.nodesManager.getNodeById(hop);
      if (!existingNode) {
        const newNode = {
          id: hop,
          label: `Hop ${index + 1}`,
          type: "external",
          color: "red"
        };
        // Update nodes with the new node (and no additional edges)
        this.nodesManager.updateNodes([newNode], []);
        existingNode = this.nodesManager.getNodeById(hop);
      }
  
      if (prevNode) {
        const edgeKey = `${prevNode.userData.id}-${hop}`;
        if (!this.edgesManager.edgeRegistry.has(edgeKey)) {
          newEdges.push({ source: prevNode.userData.id, target: hop });
        }
      }
  
      prevNode = existingNode;
  
      // Mark node as having undergone a traceroute and update overlay
      if (hop === targetIP) {
        existingNode.userData.tracerouted = true;
      }
      overlayManager.updateOverlays(existingNode);
    });
  
    // Merge new edges with existing ones and update edges manager
    const mergedEdges = [...(this.edgesManager.edgesData || []), ...newEdges];
    this.edgesManager.updateEdges(mergedEdges);
  
    // Optionally fetch full graph to ensure nodes/edges are fully updated
    fetch(`${this.endpoint}/full_graph`)
      .then(response => response.json())
      .then(data => {
        this.nodesManager.updateNodes(data.nodes, data.edges);
        this.edgesManager.updateEdges(data.edges);
      })
      .catch(error => console.error("Error fetching full graph:", error));
  }
}

// Traffic fetching and background traffic helpers remain unchanged below:

async function fetchTrafficData(nodesManager, edgesManager) {
  try {
    const response = await fetch('http://192.168.0.11:5000/traffic');
    if (!response.ok) throw new Error(`Traffic data fetch failed: ${response.status}`);
    const trafficResponse = await response.json();
    const trafficData = trafficResponse.traffic; // ✅ Extract the traffic array
    
    if (!Array.isArray(trafficData)) {
      throw new Error("Traffic data is not an array");
    }
    
    trafficData.forEach(({ src, dst, size }) => {
      const packetSize = size || 10;
      let srcNode = nodesManager.getNodeById(src);
      let dstNode = nodesManager.getNodeById(dst);
      if (srcNode && dstNode) {
        edgesManager.animateTraffic(srcNode, dstNode, packetSize);
      }
    });
  } catch (error) {
    console.error("Error fetching traffic data:", error);
  }
}

setInterval(() => fetchTrafficData(window.nodesManager, window.edgesManager), 5000);

window.getTrafficLevel = function() {
  if (!window.trafficPackets || window.trafficPackets.length === 0) return 0;
  let totalSize = 0;
  window.trafficPackets.forEach(packet => {
    totalSize += packet.size;
  });
  const maxTraffic = 100000;
  return Math.min(totalSize / maxTraffic, 1.0);
};

window.trafficPackets = [];

// src/network.js
import * as overlayManager from './overlayManager.js';

export class NetworkManager {
  constructor(nodesManager, edgesManager, endpoint = 'http://192.168.0.11:5000') {
    this.nodesManager = nodesManager;
    this.edgesManager = edgesManager;
    this.endpoint = endpoint;
    this.trafficCallbacks = [];
  }
  registerTrafficCallback(cb) {
    this.trafficCallbacks.push(cb);
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

  async fetchNodeDetails(targetId) {
    try {
      // Simple caching mechanism to reduce redundant calls
      const cacheKey = `node_details_${targetId}`;
      const cachedData = sessionStorage.getItem(cacheKey);
      const now = Date.now();
      
      if (cachedData) {
        const parsed = JSON.parse(cachedData);
        // Use cached data if it's less than 5 seconds old
        if (now - parsed.timestamp < 5000) {
          console.log(`Using cached node details for ${targetId}`);
          return parsed.data;
        }
      }
      
      console.log(`Fetching node details for ${targetId}`);
      
      // Check if this is a port node (format: IP-port-PORT)
      const portNodeMatch = targetId.match(/^(.+)-port-(\d+)$/);
      
      let response;
      if (portNodeMatch) {
        // For port nodes, fetch the parent node details instead
        const parentId = portNodeMatch[1];
        const portNumber = portNodeMatch[2];
        
        response = await fetch(`${this.endpoint}/node_details?node_id=${parentId}`);
        
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
        const parentResult = await response.json();
        
        if (parentResult.error) {
          console.error("Error fetching parent node details:", parentResult.error);
          return { error: parentResult.error };
        }
        
        // Add port-specific data from parent's scan results
        const portDetails = {
          ...parentResult,
          id: targetId,
          port: portNumber,
          parentId: parentId,
          // Extract just the advanced scan results for this specific port
          advancedResults: []
        };
        
        // Extract port-specific advanced scan results
        if (parentResult.scans) {
          portDetails.scans.forEach(scan => {
            if (scan.advanced && Array.isArray(scan.advanced)) {
              scan.advanced.forEach(advResult => {
                if (parseInt(advResult.port, 10) === parseInt(portNumber, 10)) {
                  portDetails.advancedResults.push(advResult);
                }
              });
            }
          });
        }
        
        // Cache the result with timestamp
        sessionStorage.setItem(cacheKey, JSON.stringify({
          timestamp: now,
          data: portDetails
        }));
        
        return portDetails;
      } else {
        // Regular node details fetching
        response = await fetch(`${this.endpoint}/node_details?node_id=${targetId}`);
        
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
        const result = await response.json();
        
        if (result.error) {
          console.error("Error fetching node details:", result.error);
          return { error: result.error };
        }
        
        // Cache the result with timestamp
        sessionStorage.setItem(cacheKey, JSON.stringify({
          timestamp: now,
          data: result
        }));
        
        return result;
      }
    } catch (error) {
      console.error("Error fetching node details:", error);
      return { error: "Failed to fetch node details." };
    }
  }  
  async fetchAndDisplayScanData(targetIp) {
    try {
        const response = await fetch(`${this.endpoint}/get_scan_data?target_ip=${targetIp}`);
        const result = await response.json();

        if (result.error) {
            console.error("Error fetching scan data:", result.error);
            return { error: result.error };
        }

        return result.scans || [];
    } catch (error) {
        console.error("Error fetching scan data:", error);
        return { error: "Failed to fetch scan data." };
    }
  }
  async fetchAdvancedScanData(targetIp) {
    try {
      const response = await fetch(`${this.endpoint}/get_adv_results?target_ip=${targetIp}`);
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      const result = await response.json();
      if (result.error) {
        console.error("Error fetching advanced scan data:", result.error);
        return { error: result.error };
      }
      // Return an array of advanced result nodes (or an empty array if none)
      return result.advanced_results || [];
    } catch (error) {
      console.error("Error fetching advanced scan data:", error);
      return { error: "Failed to fetch advanced scan data." };
    }
  }  
  // NEW: Method for fetching sensor traffic data for the TrafficMeter
  async fetchTrafficSensorData() {
    try {
      const response = await fetch(`${this.endpoint}/traffic`);
      if (!response.ok) throw new Error(`Traffic sensor fetch failed: ${response.status}`);
      const data = await response.json(); // expecting data.traffic to be an array

      // Call all registered traffic callbacks with the fetched data
      this.trafficCallbacks.forEach(cb => cb(data));
    } catch (error) {
      console.error("Error fetching traffic sensor data:", error);
    }
  }

  // NEW: Start periodic sensor updates
  startTrafficSensorUpdates(intervalMs = 5000) {
    this.fetchTrafficSensorData(); // initial call
    setInterval(() => this.fetchTrafficSensorData(), intervalMs);
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

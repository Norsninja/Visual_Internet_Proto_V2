import React, { useContext, useEffect } from 'react';
import * as THREE from 'three';
import DraggableInfoBox from './components/DraggableInfoBox.jsx';
import ConnectorLine from './components/ConnectorLine.jsx';
import { UIContext } from './components/UIContext.jsx';

// The UIManager component renders the InfoBox and ConnectorLine based on UIContext state.
const UIManager = ({ renderer }) => {
  const { 
    selectedNode,
    setSelectedNode,
    scanResults,
    setScanResults,
    advancedResults,
    setAdvancedResults,
    infoBoxPosition,
    setInfoBoxPosition,
    targetScreenPos,
    setTargetScreenPos,
    // Add the new cooldown functions
    activateScanCooldown,
    scanCooldownActive
  } = useContext(UIContext);

  // Compute screen position for a given node
  const computeScreenPosition = (node) => {
    const nodeWorldPos = new THREE.Vector3();
    node.getWorldPosition(nodeWorldPos);
    nodeWorldPos.project(window.camera);
    return {
      x: (nodeWorldPos.x * 0.5 + 0.5) * window.innerWidth,
      y: (1 - (nodeWorldPos.y * 0.5 + 0.5)) * window.innerHeight,
    };
  };

  // When a new node is selected, compute its screen position
  useEffect(() => {
    // Expose global UI functions so that legacy code can update React state
    window.uiManager = {
      // Updated showInfo method to use the consolidated node_details endpoint
      showInfo: async (node, options = {}) => {
        const ipRegex = /^(?:\d{1,3}\.){3}\d{1,3}$/;
        const data = { ...node.userData };
        const preserveParenting = options.preserveParenting || false;
        
        // Set basic action flags
        data.showScanButton = data.id && ipRegex.test(data.id) && data.type !== "ship";
        data.showTravelButton = data.type !== "ship";
        // IMPORTANT: also set userData so InfoBox can see it
        node.userData.showScanButton = data.showScanButton;
        node.userData.showTravelButton = data.showTravelButton;        
        setSelectedNode(node);
        const pos = computeScreenPosition(node);
        setTargetScreenPos(pos);
        
        // Set loading states
        setScanResults({ loading: true, error: null, data: [] });
        setAdvancedResults({ loading: true, error: null, data: [] });
        
        try {
          // Check if this is a port node
          const isPortNode = data.id && data.id.includes('-port-');
          
          if (isPortNode && preserveParenting) {
            // For port nodes with preserveParenting flag, we handle differently
            // Extract parent node ID and port number
            const portNodeMatch = data.id.match(/^(.+)-port-(\d+)$/);
            
            if (portNodeMatch) {
              const parentId = portNodeMatch[1];
              const portNumber = portNodeMatch[2];
              
              // Fetch the parent node details
              const nodeDetails = await window.networkManager.fetchNodeDetails(parentId);
              
              if (nodeDetails.error) {
                setScanResults({ loading: false, error: nodeDetails.error, data: [] });
                setAdvancedResults({ loading: false, error: nodeDetails.error, data: [] });
                return;
              }
              
              // Extract advanced results for this specific port
              let portAdvancedResults = [];
              if (nodeDetails.scans && Array.isArray(nodeDetails.scans)) {
                nodeDetails.scans.forEach(scan => {
                  if (scan.advanced && Array.isArray(scan.advanced)) {
                    const portResults = scan.advanced.filter(adv => 
                      parseInt(adv.port, 10) === parseInt(portNumber, 10)
                    );
                    portAdvancedResults = [...portAdvancedResults, ...portResults];
                  }
                });
              }
              
              // Enhance node userData without replacing it
              // This is important - we're updating properties without replacing the object
              Object.assign(node.userData, {
                parentNodeDetails: nodeDetails,
                port: portNumber,
                advancedResults: portAdvancedResults
              });
              
              // Set scan results
              setScanResults({ loading: false, error: null, data: nodeDetails.scans || [] });
              setAdvancedResults({ loading: false, error: null, data: portAdvancedResults });
            } else {
              setScanResults({ loading: false, error: "Invalid port node format", data: [] });
              setAdvancedResults({ loading: false, error: "Invalid port node format", data: [] });
            }
          } else {
            // Regular node details fetching
            const nodeDetails = await window.networkManager.fetchNodeDetails(data.id);
            
            if (nodeDetails.error) {
              setScanResults({ loading: false, error: nodeDetails.error, data: [] });
              setAdvancedResults({ loading: false, error: nodeDetails.error, data: [] });
              return;
            }
            
            // Enhance node userData with consolidated details
            // Use careful property updating, not wholesale replacement
            for (const key in nodeDetails) {
              if (key !== 'id' && key !== 'type' && key !== 'parent') {
                node.userData[key] = nodeDetails[key];
              }
            }
            
            // Set scan results from consolidated data
            setScanResults({ loading: false, error: null, data: nodeDetails.scans || [] });
            
            // Set web scan button visibility based on ports
            const ports = nodeDetails.ports || [];
            data.showWebScanButton = ports.some(port => port === 80 || port === 443);
            
            // Process advanced results for port nodes
            if (data.type === 'child' && data.port) {
              // Extract all advanced results for this specific port
              let portAdvancedResults = [];
              
              if (nodeDetails.scans && Array.isArray(nodeDetails.scans)) {
                nodeDetails.scans.forEach(scan => {
                  if (scan.advanced && Array.isArray(scan.advanced)) {
                    const portResults = scan.advanced.filter(adv => 
                      parseInt(adv.port, 10) === parseInt(data.port, 10)
                    );
                    portAdvancedResults = [...portAdvancedResults, ...portResults];
                  }
                });
              }
              
              setAdvancedResults({ 
                loading: false, 
                error: null, 
                data: portAdvancedResults 
              });
            } else {
              // Clear advanced results for non-port nodes
              setAdvancedResults({ loading: false, error: null, data: [] });
            }
          }
        } catch (err) {
          console.error("Error processing node details:", err);
          setScanResults({ loading: false, error: "Failed to fetch node details", data: [] });
          setAdvancedResults({ loading: false, error: "Failed to fetch node details", data: [] });
        }
      },
      
      // Separate hideInfo method - fixed indentation
      hideInfo: () => {
        console.log("hideInfo called - clearing selection");
        
        // Clear selected node
        setSelectedNode(null);
        
        // Clear scan results
        setScanResults({ loading: false, error: null, data: [] });
        
        // Clear advanced results
        setAdvancedResults({ loading: false, error: null, data: [] });
        
        // Reset position states if needed
        setInfoBoxPosition({ x: 0, y: 0 });
        setTargetScreenPos({ x: 0, y: 0 });
      },
      
      toggleNetworkNavigationHUD: () => {
        const uiContext = window.uiContext || (window.UI_CONTEXT_REF && window.UI_CONTEXT_REF.current);
        if (uiContext && uiContext.toggleNetworkMap) {
          console.log("Toggling Network Navigation Map");
          uiContext.toggleNetworkMap();
        } else {
          console.warn("Could not find UI Context for toggling network map");
        }
      },
      
      updateScanResults: (results) => setScanResults(results),
      
      updateInfoBoxPosition: (pos) => setInfoBoxPosition(pos),
      
      updateTravelStatus: (status) => {
        // You could add this to your UI context if needed
        console.log("Travel status:", status);
      }
    };
  }, [setSelectedNode, setScanResults, setAdvancedResults, setInfoBoxPosition, setTargetScreenPos]);
  

  // Update scan data for the target node using consolidated endpoint
  const updateScanData = async (targetId) => {
    try {
      setScanResults({ loading: true, error: null, data: [] });
      
      // Use consolidated endpoint
      const nodeDetails = await window.networkManager.fetchNodeDetails(targetId);
      
      if (nodeDetails.error) {
        setScanResults({ loading: false, error: nodeDetails.error, data: [] });
      } else {
        // Update selected node userData if it matches this ID
        if (selectedNode && selectedNode.userData.id === targetId) {
          Object.assign(selectedNode.userData, nodeDetails);
        }
        
        setScanResults({ loading: false, error: null, data: nodeDetails.scans || [] });
      }
    } catch (err) {
      console.error("Error updating scan data:", err);
      setScanResults({ loading: false, error: "Failed to fetch scan data", data: [] });
    }
  };

  // Replace updateAdvancedScanData in ui.jsx
  const updateAdvancedScanData = async (targetId, portNumber = null) => {
    try {
      setAdvancedResults({ loading: true, error: null, data: [] });
      
      // Use consolidated endpoint
      const nodeDetails = await window.networkManager.fetchNodeDetails(targetId);
      
      if (nodeDetails.error) {
        setAdvancedResults({ loading: false, error: nodeDetails.error, data: [] });
      } else {
        // Extract advanced results for the specified port from all scans
        let advancedResults = [];
        
        if (nodeDetails.scans && Array.isArray(nodeDetails.scans)) {
          nodeDetails.scans.forEach(scan => {
            if (scan.advanced && Array.isArray(scan.advanced)) {
              const relevantResults = portNumber 
                ? scan.advanced.filter(adv => parseInt(adv.port, 10) === parseInt(portNumber, 10))
                : scan.advanced;
              
              advancedResults = [...advancedResults, ...relevantResults];
            }
          });
        }
        
        setAdvancedResults({ loading: false, error: null, data: advancedResults });
      }
    } catch (err) {
      console.error("Error updating advanced scan data:", err);
      setAdvancedResults({ loading: false, error: "Failed to fetch advanced scan data", data: [] });
    }
  };

  // Handle actions from the InfoBox (port scans, travel, etc.)
  const handleAction = async (action, payload) => {
    if (!selectedNode) return;
    const data = selectedNode.userData;
    
    // Don't process scan actions if cooldown is active
    if (scanCooldownActive && 
       ['scanPorts', 'webScan', 'bgpScan', 'bannerGrab', 'cveLookup', 
        'reverseDNS', 'sslInfo', 'remoteTraceroute'].includes(action)) {
      console.log(`Scan action "${action}" ignored due to active cooldown`);
      return;
    }
    
    // Immediately set a loading state for visual feedback
    setScanResults(prev => ({ ...prev, loading: true }));
    
    // Activate cooldown for scan operations
    if (['scanPorts', 'webScan', 'bgpScan', 'bannerGrab', 'cveLookup', 
         'reverseDNS', 'sslInfo', 'remoteTraceroute'].includes(action)) {
      activateScanCooldown(5000); // 5 seconds cooldown
    }
    
    switch (action) {
      case "scanPorts":
        try {
            // Ask user if they want a deep scan
            const deepScan = window.confirm("Run a deep scan for additional service ports?");
            
            // Call API with deep_scan parameter
            const response = await fetch(`http://192.168.0.11:5000/scan_ports?ip=${data.id}&deep_scan=${deepScan}`);
            const result = await response.json();
            
            // Update the node's userData for ports without re-setting selectedNode:
            selectedNode.userData = {
                ...selectedNode.userData,
                ports: result.ports,
                scanned_ports: true
            };
    
            window.nodesManager.updateNodes([selectedNode.userData], []);
            const updatedMesh = window.nodesManager.getNodeById(selectedNode.userData.id);
            setSelectedNode(updatedMesh);
            
            // Refresh scan data to get updated port scan results
            await updateScanData(data.id);
        } catch (err) {
            console.error("Error scanning ports:", err);
            setScanResults(prev => ({
                ...prev,
                loading: false,
                error: "Failed to scan ports"
            }));
        }
        break;
        
      case "bannerGrab": {
        try {
          setAdvancedResults(prev => ({ ...prev, loading: true }));
          
          const parentId = data.parentId || data.id;
          const portToScan = data.port;
          const response = await fetch(`http://192.168.0.11:5000/banner_grab?ip=${parentId}&port=${portToScan}`);
          await response.json();
          
          // Refresh advanced scan data
          await updateAdvancedScanData(parentId);
        } catch (err) {
          console.error("Error in banner grab:", err);
          setAdvancedResults(prev => ({
            loading: false,
            error: "Error in banner grab",
            data: prev.data
          }));
        }
        break;
      }
      
      case "cveLookup": {
        try {
          setAdvancedResults(prev => ({ ...prev, loading: true }));
          
          const parentId = data.parentId || data.id;
          const portToScan = data.port;
          
          let service = prompt("Enter service name (e.g., 'apache', 'nginx'):");
          if (!service) {
            setAdvancedResults(prev => ({ ...prev, loading: false }));
            return;
          }
          
          let version = prompt("Enter version (e.g., '2.4.41'):");
          if (!version) {
            setAdvancedResults(prev => ({ ...prev, loading: false }));
            return;
          }
          
          const response = await fetch(`http://192.168.0.11:5000/cve_lookup?service=${service}&version=${version}&ip=${parentId}&port=${portToScan}`);
          await response.json();
          
          // Refresh advanced scan data
          await updateAdvancedScanData(parentId);
        } catch (err) {
          console.error("Error in CVE lookup:", err);
          setAdvancedResults(prev => ({
            loading: false,
            error: "Error in CVE lookup",
            data: prev.data
          }));
        }
        break;
      }
      
      case "reverseDNS": {
        try {
          setAdvancedResults(prev => ({ ...prev, loading: true }));
          
          const parentId = data.parentId || data.id;
          const portToScan = data.port;
          const response = await fetch(`http://192.168.0.11:5000/reverse_dns?ip=${parentId}&port=${portToScan}`);
          await response.json();
          
          // Refresh advanced scan data
          await updateAdvancedScanData(parentId);
        } catch (err) {
          console.error("Error in reverse DNS:", err);
          setAdvancedResults(prev => ({
            loading: false,
            error: "Error in reverse DNS",
            data: prev.data
          }));
        }
        break;
      }
      
      case "sslInfo": {
        try {
          setAdvancedResults(prev => ({ ...prev, loading: true }));
          
          const parentId = data.parentId || data.id;
          const portToScan = data.port;
          const response = await fetch(`http://192.168.0.11:5000/ssl_info?ip=${parentId}&port=${portToScan}`);
          await response.json();
          
          // Refresh advanced scan data
          await updateAdvancedScanData(parentId);
        } catch (err) {
          console.error("Error in SSL info:", err);
          setAdvancedResults(prev => ({
            loading: false,
            error: "Error in SSL info",
            data: prev.data
          }));
        }
        setScanResults(prev => ({ ...prev, loading: false }));
        break;
      }
      
      case "travel": {
        const shipMesh = window.ship.getMesh();
        const distance = shipMesh.position.distanceTo(selectedNode.position);
        if (distance <= window.maxTravelDistance) {
          window.ship.travelTo(selectedNode);
        } else {
          console.log("Target is too far to travel.");
        }
        setScanResults(prev => ({ ...prev, loading: false }));
        break;
      }
      

      // Complete fixed webScan action handler for ui.jsx
      case "webScan": {
        try {
          console.log("WebScan action triggered for node:", data);
          
          // For port nodes, use the parent ID to find DNS results
          const targetId = data.parentId || data.id;
          const portNumber = data.port ? parseInt(data.port, 10) : null;
          
          // Find DNS results from both sources
          let dnsResults = [];
          
          // First check advanced results data
          if (advancedResults.data && Array.isArray(advancedResults.data)) {
            const foundResults = advancedResults.data.filter(result => 
              result.scan_type === 'reverseDNS' && 
              result.target === targetId && 
              result.results && 
              (parseInt(result.port) === 80 || parseInt(result.port) === 443)
            );
            dnsResults = [...dnsResults, ...foundResults];
          }
          
          // Then check scan results if needed
          if (dnsResults.length === 0 && scanResults.data && Array.isArray(scanResults.data)) {
            scanResults.data.forEach(scan => {
              if (scan.advanced && Array.isArray(scan.advanced)) {
                const foundResults = scan.advanced.filter(advResult => 
                  advResult.scan_type === 'reverseDNS' && 
                  advResult.target === targetId && 
                  advResult.results && 
                  (parseInt(advResult.port) === 80 || parseInt(advResult.port) === 443)
                );
                dnsResults = [...dnsResults, ...foundResults];
              }
            });
          }
          
          console.log("DNS results found:", dnsResults);
          
          // If no DNS results, don't proceed (button should be disabled in UI)
          if (dnsResults.length === 0) {
            console.warn("Attempted web scan without DNS results - scan aborted");
            setScanResults(prev => ({
              loading: false,
              error: "Web scan requires DNS resolution first",
              data: [...prev.data]
            }));
            return;
          }
          
          // Sort by timestamp descending to get the most recent
          dnsResults.sort((a, b) => b.timestamp - a.timestamp);
          
          // Use specific port if it's a port node, otherwise use the DNS result's port
          const hostname = dnsResults[0].results;
          const port = portNumber || parseInt(dnsResults[0].port);
          
          console.log(`Running web scan using hostname: ${hostname}:${port}`);
          const response = await fetch(`http://192.168.0.11:5000/web_scan?ip=${targetId}&port=${port}&hostname=${encodeURIComponent(hostname)}`);
          const result = await response.json();
          
          console.log("Web scan API response:", result);
          
          // Refresh scan data to get updated web scan results
          await updateScanData(targetId);
        } catch (err) {
          console.error("Error running web scan:", err);
          setScanResults(prev => ({
            loading: false,
            error: "Error running web scan: " + err.message,
            data: [...prev.data]
          }));
        }
        break;
      }
      
      case "remoteTraceroute":
        try {
          const tracerouteData = await window.networkManager.fetchTracerouteData(data.id, true);
          if (tracerouteData && tracerouteData.hops && tracerouteData.hops.length > 0) {
            // Refresh scan data after traceroute completes
            await updateScanData(data.id);
          } else {
            setScanResults(prev => ({ ...prev, loading: false }));
          }
        } catch (err) {
          console.error("Error running remote traceroute:", err);
          setScanResults(prev => ({
            loading: false,
            error: "Error running remote traceroute.",
            data: [...prev.data]
          }));
        }
        break;
        
      case "bgpScan": {
        try {
          const response = await fetch(`http://192.168.0.11:5000/bgp_scan?target=${data.id}`);
          const result = await response.json();
          
          // Refresh scan data to get updated BGP scan results
          await updateScanData(data.id);
        } catch (err) {
          console.error("Error running BGP scan:", err);
          setScanResults(prev => ({
            loading: false,
            error: "Error running BGP scan",
            data: [...prev.data]
          }));
        }
        break;
      }
      
      case "submitExternalNetwork": {
        if (!payload) {
          console.error("No external network target provided.");
          setScanResults(prev => ({ ...prev, loading: false }));
          return;
        }
        
        const selectedTarget = payload;
        if (!selectedTarget.match(/^(?:\d{1,3}\.){3}\d{1,3}$/)) {
          alert("Please enter a valid IPv4 address.");
          setScanResults(prev => ({ ...prev, loading: false }));
          return;
        }
        
        try {
          const response = await fetch("http://192.168.0.11:5000/set_external_target", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ target: selectedTarget })
          });
          
          const result = await response.json();
          if (result.status === "success") {
            // Update the node's external network info
            selectedNode.userData.externalNetwork = result.target;
            setScanResults(prev => ({
              loading: false,
              error: null,
              data: [
                ...prev.data,
                {
                  type: "External Target Updated",
                  target: result.target,
                  timestamp: Date.now() / 1000
                }
              ]
            }));
          }
          
          await window.networkManager.fetchNetworkData();
        } catch (err) {
          console.error("Error updating external target:", err);
          setScanResults(prev => ({
            loading: false,
            error: "Error updating external target",
            data: [...prev.data]
          }));
        }
        break;
      }
      
      default:
        console.warn("Unhandled action:", action);
        setScanResults(prev => ({ ...prev, loading: false }));
    }
  };

  // If no node is selected, we render nothing (or you could render a placeholder)
  if (!selectedNode) return null;

  return (
    <>
      <DraggableInfoBox
        nodeData={selectedNode.userData}
        scanResults={scanResults}
        onAction={handleAction}
        targetScreenPos={targetScreenPos}
        onPositionChange={(pos) => setInfoBoxPosition(pos)}
      />
      <ConnectorLine 
        from={infoBoxPosition} 
        to={targetScreenPos} 
      />
    </>
  );
};

export default UIManager;
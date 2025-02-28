// ui.jsx
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
    infoBoxPosition,
    setInfoBoxPosition,
    targetScreenPos,
    setTargetScreenPos
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
      showInfo: (node) => {
        const ipRegex = /^(?:\d{1,3}\.){3}\d{1,3}$/;
        const data = node.userData;
        data.showScanButton = data.id && ipRegex.test(data.id) && data.type !== "ship";
        data.showTravelButton = data.type !== "ship";
        data.showWebScanButton = data.ports && data.ports.some((port) => port === 80 || port === 443);
        
        setSelectedNode(node);
        const pos = computeScreenPosition(node);
        setTargetScreenPos(pos);
        updateScanData(node.userData.id);
      },
      hideInfo: () => setSelectedNode(null),
      toggleNetworkNavigationHUD: () => {
        // Implement your toggle logic here.
        console.log("Toggling Network Navigation HUD");
      },
      updateScanResults: (results) => setScanResults(results),
      updateInfoBoxPosition: (pos) => setInfoBoxPosition(pos)
      // You can add more functions as needed to update other parts of your UIContext.
    };
  }, [setSelectedNode, setScanResults, setInfoBoxPosition, setTargetScreenPos]);

  // Update scan data for the target node
  const updateScanData = async (targetId) => {
    try {
      const scanData = await window.networkManager.fetchAndDisplayScanData(targetId);
      if (scanData.error) {
        setScanResults({ loading: false, error: scanData.error, data: [] });
      } else if (scanData.length === 0) {
        setScanResults({ loading: false, error: null, data: [] });
      } else {
        setScanResults({ loading: false, error: null, data: scanData });
      }
    } catch (err) {
      setScanResults({ loading: false, error: "Failed to fetch scan data.", data: [] });
    }
  };

  // Handle actions from the InfoBox (port scans, travel, etc.)
  const handleAction = async (action, payload) => {
    if (!selectedNode) return;
    const data = selectedNode.userData;
    // Immediately set a loading state for visual feedback
    setScanResults(prev => ({ ...prev, loading: true }));
    
    switch (action) {
      case "scanPorts":
        try {
          const response = await fetch(`http://192.168.0.11:5000/scan_ports?ip=${data.id}`);
          const result = await response.json();
          setScanResults(prev => ({
            loading: false,
            error: null,
            data: [
              ...prev.data,
              {
                type: "Port Scan",
                ports: result.ports,
                timestamp: Date.now() / 1000
              }
            ]
          }));

        // Update the node's userData for ports without re-setting selectedNode:
        selectedNode.userData = {
          ...selectedNode.userData,
          ports: result.ports,
          scanned_ports: true
        };

        window.nodesManager.updateNodes([selectedNode.userData], []);
        const updatedMesh = window.nodesManager.getNodeById(selectedNode.userData.id);
        setSelectedNode(updatedMesh);
        
        // Do not call setSelectedNode here – let the info box remain open.
      } catch (err) {
        console.error("Error scanning ports:", err);
      }
      break;
      case "travel": {
        const shipMesh = window.ship.getMesh();
        const distance = shipMesh.position.distanceTo(selectedNode.position);
        if (distance <= window.maxTravelDistance) {
          window.ship.travelTo(selectedNode.position);
        } else {
          console.log("Target is too far to travel.");
        }
        break;
      }
      case "webScan": {
        try {
          const port = data.ports.find(p => p === 80 || p === 443);
          const response = await fetch(`http://192.168.0.11:5000/web_scan?ip=${data.id}&port=${port}`);
          const result = await response.json();
          setScanResults(prev => ({
            loading: false,
            error: null,
            data: [
              ...prev.data,
              {
                type: "Web Scan",
                result: result,
                timestamp: Date.now() / 1000
              }
            ]
          }));
        } catch (err) {
          console.error("Error running web scan:", err);
        }
        break;
      }
      case "remoteTraceroute":
        try {
          const tracerouteData = await window.networkManager.fetchTracerouteData(data.id, true);
          if (tracerouteData && tracerouteData.hops && tracerouteData.hops.length > 0) {
            setScanResults(prev => ({
              loading: false,
              error: null,
              data: [
                ...prev.data,
                {
                  type: "Remote Traceroute",
                  hops: tracerouteData.hops,
                  target: tracerouteData.target,
                  timestamp: Date.now() / 1000
                }
              ]
            }));
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
          setScanResults(prev => ({
            loading: false,
            error: null,
            data: [
              ...prev.data,
              {
                type: "BGP Scan",
                data: result.data,
                timestamp: Date.now() / 1000
              }
            ]
          }));
        } catch (err) {
          console.error("Error running BGP scan:", err);
        }
        break;
      }
      case "bannerGrab": {
        try {
          const response = await fetch(`http://192.168.0.11:5000/banner_grab?ip=${data.parentId}&port=${data.port}`);
          const result = await response.json();
          setScanResults(prev => ({
            loading: false,
            error: null,
            data: [
              ...prev.data,
              {
                type: "Banner Grab",
                banner: result.banner,
                timestamp: Date.now() / 1000
              }
            ]
          }));
        } catch (err) {
          console.error("Error in banner grab:", err);
        }
        break;
      }
      case "cveLookup": {
        try {
          const response = await fetch(`http://192.168.0.11:5000/cve_lookup?service=${data.service}&version=${data.version}`);
          const result = await response.json();
          setScanResults(prev => ({
            loading: false,
            error: null,
            data: [
              ...prev.data,
              {
                type: "CVE Lookup",
                cve_data: result.cve_data,
                timestamp: Date.now() / 1000
              }
            ]
          }));
        } catch (err) {
          console.error("Error in CVE lookup:", err);
        }
        break;
      }
      case "reverseDNS": {
        try {
          const response = await fetch(`http://192.168.0.11:5000/reverse_dns?ip=${data.parentId}`);
          const result = await response.json();
          setScanResults(prev => ({
            loading: false,
            error: null,
            data: [
              ...prev.data,
              {
                type: "Reverse DNS",
                hostname: result.hostname,
                timestamp: Date.now() / 1000
              }
            ]
          }));
        } catch (err) {
          console.error("Error in reverse DNS:", err);
        }
        break;
      }
      case "sslInfo": {
        try {
          const response = await fetch(`http://192.168.0.11:5000/ssl_info?ip=${data.parentId}&port=${data.port}`);
          const result = await response.json();
          setScanResults(prev => ({
            loading: false,
            error: null,
            data: [
              ...prev.data,
              {
                type: "SSL Info",
                ssl_data: result.ssl_data,
                timestamp: Date.now() / 1000
              }
            ]
          }));
        } catch (err) {
          console.error("Error in SSL info:", err);
        }
        break;
      }
      case "submitExternalNetwork": {
        if (!payload) {
          console.error("No external network target provided.");
          return;
        }
        const selectedTarget = payload;
        if (!selectedTarget.match(/^(?:\d{1,3}\.){3}\d{1,3}$/)) {
          alert("Please enter a valid IPv4 address.");
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
        }
        break;
      }
      default:
        console.warn("Unhandled action:", action);
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

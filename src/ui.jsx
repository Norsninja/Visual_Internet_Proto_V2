// src/ui.jsx
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import * as THREE from 'three';
import InfoBox from './components/infobox.jsx';
import DraggableInfoBox from './components/DraggableInfoBox.jsx';
import ConnectorLine from './components/ConnectorLine.jsx';

export class UIManager {
  constructor(renderer) {
    this.renderer = renderer;
    // Create a container for the React InfoBox
    this.reactContainer = document.createElement("div");
    this.reactContainer.id = "uiContainer";
    Object.assign(this.reactContainer.style, {
      position: "fixed",
      backgroundColor: "rgba(0, 0, 0, 0.8)",
      color: "white",
      padding: "10px",
      borderRadius: "5px",
      minWidth: "300px",
      display: "none",
      zIndex: 2000
    });
    document.body.appendChild(this.reactContainer);
    this.reactRoot = createRoot(this.reactContainer);

    // store the currently selected node and its data.
    this.currentNode = null;
    this.currentData = null;
    // Scan results state: { loading: boolean, error: string|null, data: [] }
    this.scanResults = { loading: true, error: null, data: [] };
    this.infoBoxPosition = { x: 0, y: 0 };
    this.targetScreenPos = { x: 0, y: 0 };
  }

  async showInfo(node, event) {
    this.reactContainer.style.display = "block";
    this.currentNode = node;
    const data = node.userData;
    this.currentData = data;
    // new camera calculation
    const nodeWorldPos = new THREE.Vector3();
    node.getWorldPosition(nodeWorldPos);
    
    const screenPos = nodeWorldPos.clone().project(window.camera);
    
    // Determine which buttons should appear.
    const ipRegex = /^(?:\d{1,3}\.){3}\d{1,3}$/;
    const showScanButton = (data.id && data.id.match(ipRegex) && data.type !== "ship");
    const showTravelButton = (data.type !== "ship");
    let showWebScanButton = false;
    if (data.ports && data.ports.length > 0) {
      const webPorts = data.ports.filter(port => port === 80 || port === 443);
      showWebScanButton = webPorts.length > 0;
    }
    // Compute target node screen coordinates:
    const camera = window.cameraController.camera; camera.updateMatrixWorld();
    const nodePosition = new THREE.Vector3();
    node.getWorldPosition(nodePosition);
    nodePosition.project(camera);
    const canvasRect = this.renderer.domElement.getBoundingClientRect();
    // Convert normalized device coordinates (NDC) to screen pixels
    const targetScreenPos = {
      x: (screenPos.x * 0.5 + 0.5) * window.innerWidth,
      y: (1 - (screenPos.y * 0.5 + 0.5)) * window.innerHeight // Invert Y-axis
    };
    
    this.targetScreenPos = targetScreenPos;
    console.log("Projected Coordinates:", {  x: ((nodePosition.x + 1) / 2) * window.innerWidth,  y: ((-nodePosition.y + 1) / 2) * window.innerHeight });
    // Build props for the InfoBox
    const props = {
      nodeData: { ...data, showScanButton, showTravelButton, showWebScanButton },
      scanResults: this.scanResults,
      onAction: (action, payload) => this.handleAction(action, payload)
    };
    // Pass an onPositionChange callback to capture the info box's top-left position.
    this.reactRoot.render(
      <>
        <DraggableInfoBox
          nodeData={data}
          scanResults={this.scanResults}
          onAction={(action, payload) => this.handleAction(action, payload)}
          targetScreenPos={targetScreenPos}
          onPositionChange={(pos) => {
            this.infoBoxPosition = pos;
            // Instead of calling refreshInfoBox(), just re-render the connector line.
            // This update should not re-trigger onPositionChange in DraggableInfoBox.
            this.reactRoot.render(
              <>
                <DraggableInfoBox
                  nodeData={data}
                  scanResults={this.scanResults}
                  onAction={(action, payload) => this.handleAction(action, payload)}
                  targetScreenPos={targetScreenPos}
                  onPositionChange={(newPos) => {
                    this.infoBoxPosition = newPos;
                  }}
                />
                <ConnectorLine 
                  from={this.infoBoxPosition}
                  to={targetScreenPos}
                />
              </>
            );
        }}
        />
        <ConnectorLine 
          from={this.infoBoxPosition} 
          to={targetScreenPos}
        />
      </>
    );
    this.updateScanData(data.id);
  }

  async updateScanData(targetId) {
    try {
      const scanData = await window.networkManager.fetchAndDisplayScanData(targetId);
      if (scanData.error) {
        this.scanResults = { loading: false, error: scanData.error, data: [] };
      } else if (scanData.length === 0) {
        this.scanResults = { loading: false, error: null, data: [] };
      } else {
        this.scanResults = { loading: false, error: null, data: scanData };
      }
    } catch (err) {
      this.scanResults = { loading: false, error: "Failed to fetch scan data.", data: [] };
    }
    this.refreshInfoBox();
  }

  refreshInfoBox() {
    const data = this.currentData;
    if (!data) return;
    const ipRegex = /^(?:\d{1,3}\.){3}\d{1,3}$/;
    const showScanButton = (data.id && data.id.match(ipRegex) && data.type !== "ship");
    const showTravelButton = (data.type !== "ship");
    let showWebScanButton = false;
    if (data.ports && data.ports.length > 0) {
      const webPorts = data.ports.filter(port => port === 80 || port === 443);
      showWebScanButton = webPorts.length > 0;
    }
    const props = {
      nodeData: {
        ...data,
        showScanButton,
        showTravelButton,
        showWebScanButton,
      },
      scanResults: this.scanResults,
      onAction: (action, payload) => this.handleAction(action, payload),
      targetScreenPos: this.targetScreenPos,
      onPositionChange: (pos) => {
        this.infoBoxPosition = pos;
        this.refreshInfoBox();
      },
    };
    this.reactRoot.render(
      <>
        <DraggableInfoBox {...props} />
        <ConnectorLine 
          from={this.infoBoxPosition}
          to={this.targetScreenPos}
        />
      </>
    );
  }

  async handleAction(action, payload) {
    const data = this.currentData;
    const node = this.currentNode;
    // Set loading to true immediately so the UI shows feedback.
    this.scanResults = { ...this.scanResults, loading: true };
    this.refreshInfoBox();
    switch (action) {
      case "scanPorts":
        try {
          const response = await fetch(`http://192.168.0.11:5000/scan_ports?ip=${data.id}`);
          const result = await response.json();
          // Update scanResults with the port scan results.
          this.scanResults = {
            loading: false,
            error: null,
            data: [
              ...this.scanResults.data,
              {
              type: "Port Scan",
              ports: result.ports,
              timestamp: Date.now() / 1000
            }]
          };
          // Update node data and spawn child nodes.
          node.userData.ports = result.ports;
          node.userData.scanned_ports = true;
          window.nodesManager.updateNodes([node.userData], []);
          window.nodesManager.spawnChildNodes(node, result.ports);
        } catch (err) {
          console.error("Error scanning ports:", err);
        }
        break;
      case "travel":
        {
          const shipMesh = window.ship.getMesh();
          const distance = shipMesh.position.distanceTo(node.position);
          if (distance <= window.maxTravelDistance) {
            window.ship.travelTo(node.position);
            // Optionally update a status in scanResults
          } else {
            console.log("Target is too far to travel.");
          }
        }
        break;
      case "webScan":
        {
          try {
            const port = data.ports.find(p => p === 80 || p === 443);
            const response = await fetch(`http://192.168.0.11:5000/web_scan?ip=${data.id}&port=${port}`);
            const result = await response.json();
            this.scanResults = {
              loading: false,
              error: null,
              data: [
                ...this.scanResults.data,  
                {
                type: "Web Scan",
                result: result,
                timestamp: Date.now() / 1000
              }]
            };
          } catch (err) {
            console.error("Error running web scan:", err);
          }
        }
        break;
        case "remoteTraceroute":
          try {
            // Use the node's IP (data.id) as the target for the remote traceroute
            const tracerouteData = await window.networkManager.fetchTracerouteData(data.id, true);
            if (tracerouteData && tracerouteData.hops && tracerouteData.hops.length > 0) {
              // Append the new remote traceroute result to the existing scanResults
              this.scanResults = {
                loading: false,
                error: null,
                data: [
                  ...this.scanResults.data,
                  {
                    type: "Remote Traceroute",
                    hops: tracerouteData.hops,
                    target: tracerouteData.target,
                    timestamp: Date.now() / 1000
                  }
                ]
              };
            } else {
              // In case no hops are returned, clear the loading state without appending data
              this.scanResults = {
                ...this.scanResults,
                loading: false
              };
            }
          } catch (err) {
            console.error("Error running remote traceroute:", err);
            this.scanResults = {
              loading: false,
              error: "Error running remote traceroute.",
              data: [...this.scanResults.data]
            };
          }
          break;
        
      case "bgpScan":
        {
          try {
            const response = await fetch(`http://192.168.0.11:5000/bgp_scan?target=${data.id}`);
            const result = await response.json();
            this.scanResults = {
              loading: false,
              error: null,
              data: [
                ...this.scanResults.data,  
                {
                type: "BGP Scan",
                data: result.data,
                timestamp: Date.now() / 1000
              }]
            };
          } catch (err) {
            console.error("Error running BGP scan:", err);
          }
        }
        break;
      case "bannerGrab":
        {
          try {
            const response = await fetch(`http://192.168.0.11:5000/banner_grab?ip=${data.parentId}&port=${data.port}`);
            const result = await response.json();
            this.scanResults = {
              loading: false,
              error: null,
              data: [
                ...this.scanResults.data,  
                {
                type: "Banner Grab",
                banner: result.banner,
                timestamp: Date.now() / 1000
              }]
            };
          } catch (err) {
            console.error("Error in banner grab:", err);
          }
        }
        break;
      case "cveLookup":
        {
          try {
            const response = await fetch(`http://192.168.0.11:5000/cve_lookup?service=${data.service}&version=${data.version}`);
            const result = await response.json();
            this.scanResults = {
              loading: false,
              error: null,
              data: [
                ...this.scanResults.data,  
                {
                type: "CVE Lookup",
                cve_data: result.cve_data,
                timestamp: Date.now() / 1000
              }]
            };
          } catch (err) {
            console.error("Error in CVE lookup:", err);
          }
        }
        break;
      case "reverseDNS":
        {
          try {
            const response = await fetch(`http://192.168.0.11:5000/reverse_dns?ip=${data.parentId}`);
            const result = await response.json();
            this.scanResults = {
              loading: false,
              error: null,
              data: [
                ...this.scanResults.data,
                {
                type: "Reverse DNS",
                hostname: result.hostname,
                timestamp: Date.now() / 1000
              }]
            };
          } catch (err) {
            console.error("Error in reverse DNS:", err);
          }
        }
        break;
      case "sslInfo":
        {
          try {
            const response = await fetch(`http://192.168.0.11:5000/ssl_info?ip=${data.parentId}&port=${data.port}`);
            const result = await response.json();
            this.scanResults = {
              loading: false,
              error: null,
              data: [
                ...this.scanResults.data,
                {
                type: "SSL Info",
                ssl_data: result.ssl_data,
                timestamp: Date.now() / 1000
              }]
            };
          } catch (err) {
            console.error("Error in SSL info:", err);
          }
        }
        break;
      case "submitExternalNetwork":
        {
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
              this.currentData.externalNetwork = result.target;
              this.scanResults = {
                loading: false,
                error: null,
                data: [
                  ...this.scanResults.data,
                  {
                  type: "External Target Updated",
                  target: result.target,
                  timestamp: Date.now() / 1000
                }]
              };
            }
            await window.networkManager.fetchNetworkData();
          } catch (err) {
            console.error("Error updating external target:", err);
          }
        }
        break;
      default:
        console.warn("Unhandled action:", action);
    }
    // After any action, refresh the InfoBox to display new scan results or state.
    this.refreshInfoBox();
  }

  positionInfoBox(node) {
    if (!window.cameraController || !window.cameraController.camera) {
      console.error("Error: CameraController is missing or uninitialized.");
      return;
    }
    const camera = window.cameraController.camera;
    if (!node.position || !(node.position instanceof THREE.Vector3)) {
      console.error("Error: Node position is invalid or missing:", node);
      return;
    }
    const nodePosition = new THREE.Vector3();
    node.getWorldPosition(nodePosition);
    nodePosition.project(camera);
    const screenX = ((nodePosition.x + 1) / 2) * window.innerWidth;
    const screenY = ((-nodePosition.y + 1) / 2) * window.innerHeight;
    this.reactContainer.style.left = `${screenX + 20}px`;
    this.reactContainer.style.top = `${screenY - 20}px`;
  }

  addScannedOverlay(node) {
    // Prevent duplicate overlays.
    if (node.getObjectByName("scannedOverlay")) return;
    const nodeRadius = 3;
    const ringRadius = nodeRadius * 1.05;
    const tubeRadius = 0.1;
    const radialSegments = 16;
    const tubularSegments = 100;
    const geometry = new THREE.TorusGeometry(ringRadius, tubeRadius, radialSegments, tubularSegments);
    const material = new THREE.MeshBasicMaterial({
      color: 0xffff00,
      transparent: true,
      opacity: 0.8
    });
    const ring = new THREE.Mesh(geometry, material);
    ring.name = "scannedOverlay";
    ring.rotation.x = Math.PI / 2;
    node.add(ring);
  }

  updateTravelStatus(statusMessage) {
    console.log("Updating travel status:", statusMessage);
    // If desired, you could pass a status update into the InfoBox via state.
    if (statusMessage === "Arrived!" && window.selectedNode) {
      const origColor = window.selectedNode.userData.originalColor;
      if (origColor) {
        window.selectedNode.material.color.setHex(origColor);
      }
      window.selectedNode = null;
    }
  }

  hideInfo() {
    this.reactContainer.style.display = "none";
  }
}

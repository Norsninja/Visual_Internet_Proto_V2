// src/ui.js
import * as THREE from 'three';

export class UIManager {
  constructor() {
    this.infoBox = document.createElement("div");
    this.infoBox.id = "uiContainer";
    this.infoBox.style.position = "absolute";
    this.infoBox.style.backgroundColor = "rgba(0, 0, 0, 0.8)";
    this.infoBox.style.color = "white";
    this.infoBox.style.padding = "10px";
    this.infoBox.style.borderRadius = "5px";
    this.infoBox.style.display = "none";
    this.infoBox.addEventListener("mouseenter", (e) => e.stopPropagation());
    document.body.appendChild(this.infoBox);
  }
  
  showInfo(node, event) {
    this.infoBox.style.display = "block";
    const data = node.userData;
    const ipRegex = /^(?:\d{1,3}\.){3}\d{1,3}$/;
    let scanButtonHtml = (data.id && data.id.match(ipRegex) && data.type !== "ship")
    ? `<button id="portScanButton">Scan Ports</button>` : "";
    let travelButtonHtml = data.type !== "ship"
        ? `<button id="travelButton">Travel</button>` : "";

    // Add web scan button placeholder (only for network nodes that have been scanned and show web ports)
    let webScanButtonHtml = "";
    if (data.ports && data.ports.length > 0) {
      // Check if port 80 or 443 is open:
      const webPorts = data.ports.filter(port => port === 80 || port === 443);
      if (webPorts.length > 0) {
        webScanButtonHtml = `<button id="webScanButton">Run Web Scan</button>`;
      }
    }
    
    // Display basic info:
    this.infoBox.innerHTML = `
      <strong>${data.label || "Unknown"}</strong><br>
      IP: ${data.id || "N/A"}<br>
      MAC: ${data.mac || "N/A"}<br>
      Role: ${data.role || "N/A"}<br>
      ${scanButtonHtml}
      ${travelButtonHtml}
      ${webScanButtonHtml}
      <div id="scanResults"></div>
      <div id="tracerouteResults"></div>
      <div id="webScanResults"></div>
    `;
    if (node.userData.type === "router" && node.userData.open_external_port) {
      console.log("Router node detected with external port:", node.userData.open_external_port);
      // Append the change external network UI elements
      this.infoBox.innerHTML += `
        <br>
        <button id="changeExternalNetwork">Change External Network</button>
        <div id="externalNetworkSelector" style="display:none; margin-top:10px;">
          <select id="externalNetworkDropdown">
            <option value="8.8.8.8">Google DNS (8.8.8.8)</option>
            <option value="1.1.1.1">Cloudflare (1.1.1.1)</option>
            <option value="208.67.222.222">OpenDNS (208.67.222.222)</option>
            <option value="custom">Custom...</option>
          </select>
          <input id="customExternalNetwork" type="text" placeholder="Enter custom IP" style="display:none; margin-left:5px;" />
          <button id="submitExternalNetwork" style="margin-left:5px;">Submit</button>
        </div>
      `;
      if (node.userData.type === "router") {
        // Append a button to run remote traceroute for the router
        this.infoBox.innerHTML += `<br><button id="remoteTracerouteButton">Run Remote Traceroute</button>`;
        setTimeout(() => {
          const remoteTracerouteButton = document.getElementById("remoteTracerouteButton");
          remoteTracerouteButton.addEventListener("click", async () => {
            // Show a waiting message
            const tracerouteStatus = document.createElement("div");
            tracerouteStatus.id = "remoteTracerouteStatus";
            tracerouteStatus.innerHTML = `<em>Running remote traceroute, please wait...</em>`;
            this.infoBox.appendChild(tracerouteStatus);
            
            // Call the remote traceroute endpoint with the router's IP (node.userData.id)
            const tracerouteData = await window.networkManager.fetchTracerouteData(data.public_ip, true);
            
            // Remove the waiting message
            tracerouteStatus.remove();
            
            // Display the results in the info box
            if (tracerouteData && tracerouteData.hops && tracerouteData.hops.length > 0) {
              const hopsHtml = `<br><strong>Remote Traceroute Hops:</strong><br>${tracerouteData.hops.join(" → ")}`;
              this.infoBox.innerHTML += hopsHtml;
            } else {
              this.infoBox.innerHTML += `<br><strong>No hops returned.</strong>`;
            }
          });
        }, 50);
      }
      
      // Set up the event listener for showing/hiding the selector
      const changeBtn = this.infoBox.querySelector("#changeExternalNetwork");
      const selectorDiv = this.infoBox.querySelector("#externalNetworkSelector");
      changeBtn.addEventListener("click", () => {
        selectorDiv.style.display = selectorDiv.style.display === "none" ? "block" : "none";
      });

      // Listen for dropdown changes to reveal the custom input when needed
      const dropdown = this.infoBox.querySelector("#externalNetworkDropdown");
      const customInput = this.infoBox.querySelector("#customExternalNetwork");
      dropdown.addEventListener("change", () => {
        if (dropdown.value === "custom") {
          customInput.style.display = "inline-block";
        } else {
          customInput.style.display = "none";
        }
      });

    // Set up the submit button to send the new external target to the backend
    const submitBtn = this.infoBox.querySelector("#submitExternalNetwork");
    submitBtn.addEventListener("click", async () => {
      let selectedTarget = dropdown.value;
      if (selectedTarget === "custom") {
          selectedTarget = customInput.value;
      }
      
      // Validate the input (basic validation)
      if (!selectedTarget.match(/^(?:\d{1,3}\.){3}\d{1,3}$/)) {
          alert("Please enter a valid IPv4 address.");
          return;
      }
  
      // Show a waiting message
      const extStatus = document.createElement("div");
      extStatus.id = "externalNetworkStatus";
      extStatus.innerHTML = `<em>Updating external network, please wait...</em>`;
      this.infoBox.appendChild(extStatus);
  
      try {
          const response = await fetch("http://192.168.0.11:5000/set_external_target", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ target: selectedTarget })
          });
          const result = await response.json();
  
          // ✅ Force network data refresh after update
          console.log("Fetching updated network data...");
          await window.networkManager.fetchNetworkData();  
  
          // Show confirmation
          extStatus.innerHTML = `<strong>External network updated to ${result.target}.</strong>`;
      } catch (err) {
          extStatus.innerHTML = `<strong>Error updating external network.</strong>`;
          console.error("Error updating external target:", err);
      }
  });
  


    }
  // Display port scan results if available:
  if (data.ports && data.ports.length > 0) {
    const scanResultsDiv = document.getElementById("scanResults");
    scanResultsDiv.innerHTML = `<br><strong>Open Ports:</strong> ${data.ports.join(", ")}`;
  }

    
    // Add event listener for the web scan button if present:
    if (webScanButtonHtml) {
      setTimeout(() => {
        const webScanButton = document.getElementById("webScanButton");
        if (webScanButton) {
          webScanButton.addEventListener("click", async () => {
            webScanButton.disabled = true;
            webScanButton.innerText = "Running Web Scan...";
            try {
              // Use one of the web ports (80 or 443)
              const port = data.ports.find(p => p === 80 || p === 443);
              const response = await fetch(`http://192.168.0.11:5000/web_scan?ip=${data.id}&port=${port}`);
              const result = await response.json();
              const webScanResultsDiv = document.getElementById("webScanResults");
              webScanResultsDiv.innerHTML = `<br><strong>Web Scan Results:</strong><br>${JSON.stringify(result)}`;
            } catch (err) {
              console.error("Error running web scan:", err);
            } finally {
              webScanButton.disabled = false;
              webScanButton.innerText = "Run Web Scan";
            }
          });
        }
      }, 50);
    
    }
  
      // Check if the selected node is a "port moon"
      if (node.userData.port) {
          this.infoBox.innerHTML += `
              <br><strong>Advanced Port Scans:</strong><br>
              <button id="bannerGrabButton">Banner Grab</button>
              <button id="cveLookupButton">Check CVE</button>
              <button id="reverseDNSButton">Reverse DNS</button>
              <button id="sslInfoButton">SSL Info</button>
              <div id="advancedScanResults"></div>
          `;
  
          setTimeout(() => {
              const scanResultsDiv = this.infoBox.querySelector("#advancedScanResults");
  
              document.getElementById("bannerGrabButton").addEventListener("click", async () => {
                  const response = await fetch(`http://192.168.0.11:5000/banner_grab?ip=${data.parentId}&port=${data.port}`);
                  const result = await response.json();
                  scanResultsDiv.innerHTML += `<br><strong>Banner:</strong> ${result.banner}`;
              });
  
              document.getElementById("cveLookupButton").addEventListener("click", async () => {
                  const response = await fetch(`http://192.168.0.11:5000/cve_lookup?service=${data.service}&version=${data.version}`);
                  const result = await response.json();
                  scanResultsDiv.innerHTML += `<br><strong>CVE Info:</strong> ${JSON.stringify(result.cve_data)}`;
              });
  
              document.getElementById("reverseDNSButton").addEventListener("click", async () => {
                  const response = await fetch(`http://192.168.0.11:5000/reverse_dns?ip=${data.parentId}`);
                  const result = await response.json();
                  scanResultsDiv.innerHTML += `<br><strong>Hostname:</strong> ${result.hostname}`;
              });
  
              document.getElementById("sslInfoButton").addEventListener("click", async () => {
                  const response = await fetch(`http://192.168.0.11:5000/ssl_info?ip=${data.parentId}&port=${data.port}`);
                  const result = await response.json();
                  scanResultsDiv.innerHTML += `<br><strong>SSL Certificate:</strong> ${JSON.stringify(result.ssl_data)}`;
              });
          }, 50);
      }
  
      if (!window.cameraController || !window.cameraController.camera) {
          console.error("Error: CameraController is missing or uninitialized.");
          return;
      }
  
      const camera = window.cameraController.camera;
  
      if (!node.position || !(node.position instanceof THREE.Vector3)) {
          console.error("Error: Node position is invalid or missing:", node);
          return;
      }
  
      // Convert 3D world position to 2D screen coordinates
      const nodePosition = new THREE.Vector3();
      node.getWorldPosition(nodePosition);
      nodePosition.project(camera);
  
      const screenX = (nodePosition.x + 1) / 2 * window.innerWidth;
      const screenY = (-nodePosition.y + 1) / 2 * window.innerHeight;
  
      this.infoBox.style.left = `${screenX + 20}px`;
      this.infoBox.style.top = `${screenY - 20}px`;
  
      this.infoBox.style.display = "block";
      function addScannedOverlay(node) {
        // Prevent duplicate overlays
        if (node.getObjectByName("scannedOverlay")) return;
      
        // Assume node is a sphere with radius ~2 (adjust as needed)
        const nodeRadius = 3;
        // Create a torus geometry that forms a ring around the sphere
        const ringRadius = nodeRadius * 1.05; // slightly larger than the sphere
        const tubeRadius = 0.1;              // thickness of the ring
        const radialSegments = 16;
        const tubularSegments = 100;
        const geometry = new THREE.TorusGeometry(ringRadius, tubeRadius, radialSegments, tubularSegments);
      
        // Use a basic material with transparency so it blends nicely
        const material = new THREE.MeshBasicMaterial({
          color: 0xffff00, // Yellow overlay
          transparent: true,
          opacity: 0.8
        });
        const ring = new THREE.Mesh(geometry, material);
        ring.name = "scannedOverlay";
      
        // The default torus lies in the XY plane; rotate it so it wraps the sphere's equator (assumed to be in the XZ plane)
        ring.rotation.x = Math.PI / 2;
      
        // Optionally, adjust the ring's position if your sphere isn't perfectly centered
        // ring.position.set(0, 0, 0);
      
        // Add the ring overlay as a child of the node so it moves along with it
        node.add(ring);
      }
      
        
      if (scanButtonHtml) {
        setTimeout(() => {
          const portScanButton = document.getElementById("portScanButton");
          if (!portScanButton) {
            console.error("Port scan button not found after rendering!");
            return;
          }
      
          console.log("Port scan button found, adding event listener.");
      
          portScanButton.addEventListener("click", async () => {
            try {
              portScanButton.disabled = true;
              portScanButton.innerText = "Scanning...";
      
              if (window.eventsManager) {
                window.eventsManager.resetSelection(true);
              }
      
              console.log(`Fetching: http://192.168.0.11:5000/scan_ports?ip=${data.id}`);
      
              const response = await fetch(`http://192.168.0.11:5000/scan_ports?ip=${data.id}`);
              const result = await response.json();
      
              const scanResultsDiv = document.getElementById("scanResults");
              scanResultsDiv.innerHTML =
                `<br><strong>Open Ports:</strong> ${result.ports.length > 0 ? result.ports.join(", ") : "None found"}`;
      
              // Persist the ports and mark the node as scanned
              node.userData.ports = result.ports;
              node.userData.scanned = true;
      
              // Update the node data in the visual network.
              // Previously you passed an options object; now we pass an empty array for edges.
              window.nodesManager.updateNodes([node.userData], []);
      
              // Spawn child nodes for visual representation
              window.nodesManager.spawnChildNodes(node, result.ports);
            } catch (err) {
              console.error("Error scanning ports:", err);
            } finally {
              portScanButton.disabled = false;
              portScanButton.innerText = "Scan Ports";
            }
          });
        }, 100);
      }
      
  
      if (data.type === "external") {
        this.infoBox.innerHTML += `<button id="tracerouteButton">Run Traceroute</button>`;
        setTimeout(() => {
          document.getElementById("tracerouteButton").addEventListener("click", async () => {
            // Create and append a waiting message element:
            const tracerouteStatus = document.createElement("div");
            tracerouteStatus.id = "tracerouteStatus";
            tracerouteStatus.innerHTML = `<em>Running traceroute, please wait...</em>`;
            this.infoBox.appendChild(tracerouteStatus);
            
            // Fetch traceroute data
            const tracerouteData = await window.networkManager.fetchTracerouteData(data.id);
            
            // Remove the waiting message
            tracerouteStatus.remove();
            
            // If traceroute data is returned, display the hops
            if (tracerouteData && tracerouteData.hops && tracerouteData.hops.length > 0) {
              const hopsHtml = `<br><strong>Traceroute Hops:</strong><br>${tracerouteData.hops.join(" → ")}`;
              this.infoBox.innerHTML += hopsHtml;
      
              // ✅ Apply traceroute overlay to this node
              if (node.userData.id === data.id) {
                node.userData.tracerouted = true;
            }
              // window.overlayManager.updateTracerouteOverlay(node);
          }
          });
        }, 50);
      }
      
  
      if (travelButtonHtml) {
          setTimeout(() => {
              const travelButton = document.getElementById("travelButton");
              travelButton.addEventListener("click", () => {
                  console.log("Travel button clicked! Target:", node.position);
  
                  const shipMesh = window.ship.getMesh();
                  const distance = shipMesh.position.distanceTo(node.position);
  
                  if (distance <= window.maxTravelDistance) {
                      console.log("Traveling to:", node.position);
                      window.ship.travelTo(node.position);
                      this.infoBox.innerHTML += `<br><em>Traveling...</em>`;
                  } else {
                      console.log("Target too far, cannot travel.");
                      this.infoBox.innerHTML += `<br><em>Target is too far to travel.</em>`;
                  }
              });
          }, 50);
      }
  
  
  
    }
    
    updateTravelStatus(statusMessage) {
        console.log("Updating travel status:", statusMessage);
        
        if (this.infoBox.style.display === "block") {
            this.infoBox.innerHTML = this.infoBox.innerHTML.replace(/<br><em>.*?<\/em>/g, "");
            this.infoBox.innerHTML += `<br><em>${statusMessage}</em>`;
        }
    
        // Reset node color when travel completes
        if (statusMessage === "Arrived!" && window.selectedNode) {
            const origColor = window.selectedNode.userData.originalColor;
            if (origColor) {
                window.selectedNode.material.color.setHex(origColor);
            }
            window.selectedNode = null; // Reset selection
        }
    }
    
      
          
    hideInfo() {
      this.infoBox.style.display = "none";
    }
  }
  
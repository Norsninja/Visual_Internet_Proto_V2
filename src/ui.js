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
  async showInfo(node, event) {
      const data = node.userData;
      const ipRegex = /^(?:\d{1,3}\.){3}\d{1,3}$/;

      // Determine which buttons should appear
      const scanButtonHtml = (data.id && data.id.match(ipRegex) && data.type !== "ship")
        ? `<button id="portScanButton">Scan Ports</button>` : "";
      const travelButtonHtml = (data.type !== "ship")
        ? `<button id="travelButton">Travel</button>` : "";
      let webScanButtonHtml = "";
      if (data.ports && data.ports.length > 0) {
        const webPorts = data.ports.filter(port => port === 80 || port === 443);
        if (webPorts.length > 0) {
          webScanButtonHtml = `<button id="webScanButton">Run Web Scan</button>`;
        }
      }

      // Build the main HTML content
      let html = `
        <strong>${data.label || "Unknown"}</strong><br>
        IP: ${data.id || "N/A"}<br>
        MAC: ${data.mac || "N/A"}<br>
        Role: ${data.role || "N/A"}<br>
        ${scanButtonHtml}
        ${travelButtonHtml}
        ${webScanButtonHtml}
        <div id="scanResults">Loading scan data...</div>
        <div id="tracerouteResults"></div>
        <div id="webScanResults"></div>
      `;

      // For router nodes with an external port, add extra controls
      if (data.type === "router" && data.open_external_port) {
        html += this.generateRouterControls();
      }

      // For network/external nodes, add the BGP scan button and container
      if ((data.type === "network" || data.type === "external") && data.id) {
        html += `
          <button id="bgpScanButton">Run BGP Scan</button>
          <div id="bgpScanResults"></div>
        `;
      }

      // For port nodes, add advanced port scan options
      if (data.port) {
        html += `
          <br><strong>Advanced Port Scans:</strong><br>
          <button id="bannerGrabButton">Banner Grab</button>
          <button id="cveLookupButton">Check CVE</button>
          <button id="reverseDNSButton">Reverse DNS</button>
          <button id="sslInfoButton">SSL Info</button>
          <div id="advancedScanResults"></div>
        `;
      }

      // For external nodes, add a traceroute button
      if (data.type === "external") {
        html += `<button id="tracerouteButton">Run Remote Traceroute</button>`;
      }

      this.infoBox.innerHTML = html;

      // Bind event listeners in modular helper methods
      this.bindCommonEvents(node, data, { scanButtonHtml, travelButtonHtml, webScanButtonHtml });
      this.positionInfoBox(node);
      this.infoBox.style.display = "block";

      // ✅ Fetch scan data dynamically
      const scanData = await window.networkManager.fetchAndDisplayScanData(data.id);

      const scanResultsDiv = document.getElementById("scanResults");
      if (!scanResultsDiv) return;

      if (scanData.error) {
          scanResultsDiv.innerHTML = `<br><strong>Error fetching scan data:</strong> ${scanData.error}`;
          return;
      }

      if (scanData.length === 0) {
          scanResultsDiv.innerHTML = `<br><strong>No scans found.</strong>`;
          return;
      }

      // Format and display scan results
      let scanHtml = `<br><strong>Scan Results:</strong><br>`;
      scanData.forEach(scan => {
          scanHtml += `<div style="margin-top:5px; padding:5px; border:1px solid white;">`;
          scanHtml += `<strong>Type:</strong> ${scan.type}<br>`;
          if (scan.ports) scanHtml += `<strong>Ports:</strong> ${scan.ports.join(", ")}<br>`;
          if (scan.issuer) scanHtml += `<strong>SSL Issuer:</strong> ${scan.issuer}<br>`;
          if (scan.asn) scanHtml += `<strong>ASN:</strong> ${scan.asn} (${scan.holder || "Unknown"})<br>`;
          scanHtml += `<strong>Timestamp:</strong> ${new Date(scan.timestamp * 1000).toLocaleString()}<br>`;
          scanHtml += `</div>`;
      });

      scanResultsDiv.innerHTML = scanHtml;
  }


  generateRouterControls() {
    return `
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
      <br>
      <button id="remoteTracerouteButton">Run Remote Traceroute</button>
    `;
  }

  bindCommonEvents(node, data, buttons) {
    // Bind Port Scan button
    if (buttons.scanButtonHtml) {
      setTimeout(() => {
        const portScanButton = document.getElementById("portScanButton");
        if (!portScanButton) {
          console.error("Port scan button not found after rendering!");
          return;
        }
        portScanButton.addEventListener("click", async () => {
          portScanButton.disabled = true;
          portScanButton.innerText = "Scanning...";
          if (window.eventsManager) {
            window.eventsManager.resetSelection(true);
          }
          try {
            const response = await fetch(`http://192.168.0.11:5000/scan_ports?ip=${data.id}`);
            const result = await response.json();
            const scanResultsDiv = document.getElementById("scanResults");
            scanResultsDiv.innerHTML = `<br><strong>Open Ports:</strong> ${result.ports.length > 0 ? result.ports.join(", ") : "None found"}`;
            // Update node data and spawn child nodes
            node.userData.ports = result.ports;
            node.userData.scanned_ports = true;
            window.nodesManager.updateNodes([node.userData], []);
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

    // Bind Travel button
    if (buttons.travelButtonHtml) {
      setTimeout(() => {
        const travelButton = document.getElementById("travelButton");
        if (travelButton) {
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
        }
      }, 50);
    }

    // Bind Web Scan button
    if (buttons.webScanButtonHtml) {
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

    // Bind router-specific controls
    if (data.type === "router" && data.open_external_port) {
      this.bindRouterControls(data);
    }

    // Bind BGP scan for network/external nodes
    if ((data.type === "network" || data.type === "external") && data.id) {
      this.bindBGPScan(data);
    }

    // Bind Advanced Port Scans for port nodes
    if (data.port) {
      this.bindAdvancedPortScans(data);
    }

    // Bind traceroute for external nodes
    if (data.type === "external") {
      this.bindTraceroute(data);
    }
  }

  bindRouterControls(data) {
    // Bind remote traceroute button
    setTimeout(() => {
      const remoteTracerouteButton = document.getElementById("remoteTracerouteButton");
      if (remoteTracerouteButton) {
        remoteTracerouteButton.addEventListener("click", async () => {
          const tracerouteStatus = document.createElement("div");
          tracerouteStatus.id = "remoteTracerouteStatus";
          tracerouteStatus.innerHTML = `<em>Running remote traceroute, please wait...</em>`;
          this.infoBox.appendChild(tracerouteStatus);
          try {
            const tracerouteData = await window.networkManager.fetchTracerouteData(data.public_ip, true);
            tracerouteStatus.remove();
            if (tracerouteData && tracerouteData.hops && tracerouteData.hops.length > 0) {
              this.infoBox.innerHTML += `<br><strong>Remote Traceroute Hops:</strong><br>${tracerouteData.hops.join(" → ")}`;
            } else {
              this.infoBox.innerHTML += `<br><strong>No hops returned.</strong>`;
            }
          } catch (err) {
            tracerouteStatus.remove();
            console.error("Error running remote traceroute:", err);
          }
        });
      }
    }, 50);

    // Bind external network change controls
    setTimeout(() => {
      const changeBtn = document.getElementById("changeExternalNetwork");
      const selectorDiv = document.getElementById("externalNetworkSelector");
      if (changeBtn && selectorDiv) {
        changeBtn.addEventListener("click", () => {
          selectorDiv.style.display = selectorDiv.style.display === "none" ? "block" : "none";
        });
      }
      const dropdown = document.getElementById("externalNetworkDropdown");
      const customInput = document.getElementById("customExternalNetwork");
      if (dropdown && customInput) {
        dropdown.addEventListener("change", () => {
          customInput.style.display = dropdown.value === "custom" ? "inline-block" : "none";
        });
      }
      const submitBtn = document.getElementById("submitExternalNetwork");
      if (submitBtn && dropdown && customInput) {
        submitBtn.addEventListener("click", async () => {
          let selectedTarget = dropdown.value;
          if (selectedTarget === "custom") {
            selectedTarget = customInput.value;
          }
          // Basic IPv4 validation
          if (!selectedTarget.match(/^(?:\d{1,3}\.){3}\d{1,3}$/)) {
            alert("Please enter a valid IPv4 address.");
            return;
          }
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
            console.log("Fetching updated network data...");
            await window.networkManager.fetchNetworkData();
            extStatus.innerHTML = `<strong>External network updated to ${result.target}.</strong>`;
          } catch (err) {
            extStatus.innerHTML = `<strong>Error updating external network.</strong>`;
            console.error("Error updating external target:", err);
          }
        });
      }
    }, 50);
  }

  bindBGPScan(data) {
    setTimeout(() => {
      const bgpScanButton = document.getElementById("bgpScanButton");
      if (bgpScanButton) {
        bgpScanButton.addEventListener("click", async () => {
          bgpScanButton.disabled = true;
          bgpScanButton.innerText = "Scanning BGP...";
          try {
            const response = await fetch(`http://192.168.0.11:5000/bgp_scan?target=${data.id}`);
            const result = await response.json();
            const bgpScanResultsDiv = document.getElementById("bgpScanResults");
            if (result.error) {
              bgpScanResultsDiv.innerHTML = `<br><strong>BGP Scan Error:</strong> ${result.error}`;
            } else {
              bgpScanResultsDiv.innerHTML = `<br><strong>BGP Scan Results:</strong><br>
                ASN: ${JSON.stringify(result.data.asn)}<br>
                Prefixes: ${result.data.prefixes.join(", ")}<br>
                Peers: ${result.data.peers.join(", ")}`;
            }
          } catch (err) {
            console.error("Error running BGP scan:", err);
          } finally {
            bgpScanButton.disabled = false;
            bgpScanButton.innerText = "Run BGP Scan";
          }
        });
      }
    }, 50);
  }

  bindAdvancedPortScans(data) {
    setTimeout(() => {
      const advancedDiv = document.getElementById("advancedScanResults");
      const bannerGrabButton = document.getElementById("bannerGrabButton");
      const cveLookupButton = document.getElementById("cveLookupButton");
      const reverseDNSButton = document.getElementById("reverseDNSButton");
      const sslInfoButton = document.getElementById("sslInfoButton");

      if (bannerGrabButton) {
        bannerGrabButton.addEventListener("click", async () => {
          try {
            const response = await fetch(`http://192.168.0.11:5000/banner_grab?ip=${data.parentId}&port=${data.port}`);
            const result = await response.json();
            advancedDiv.innerHTML += `<br><strong>Banner:</strong> ${result.banner}`;
          } catch (err) {
            console.error("Error in banner grab:", err);
          }
        });
      }

      if (cveLookupButton) {
        cveLookupButton.addEventListener("click", async () => {
          try {
            const response = await fetch(`http://192.168.0.11:5000/cve_lookup?service=${data.service}&version=${data.version}`);
            const result = await response.json();
            advancedDiv.innerHTML += `<br><strong>CVE Info:</strong> ${JSON.stringify(result.cve_data)}`;
          } catch (err) {
            console.error("Error in CVE lookup:", err);
          }
        });
      }

      if (reverseDNSButton) {
        reverseDNSButton.addEventListener("click", async () => {
          try {
            const response = await fetch(`http://192.168.0.11:5000/reverse_dns?ip=${data.parentId}`);
            const result = await response.json();
            advancedDiv.innerHTML += `<br><strong>Hostname:</strong> ${result.hostname}`;
          } catch (err) {
            console.error("Error in reverse DNS:", err);
          }
        });
      }

      if (sslInfoButton) {
        sslInfoButton.addEventListener("click", async () => {
          try {
            const response = await fetch(`http://192.168.0.11:5000/ssl_info?ip=${data.parentId}&port=${data.port}`);
            const result = await response.json();
            advancedDiv.innerHTML += `<br><strong>SSL Certificate:</strong> ${JSON.stringify(result.ssl_data)}`;
          } catch (err) {
            console.error("Error in SSL info:", err);
          }
        });
      }
    }, 50);
  }

  bindTraceroute(data) {
    setTimeout(() => {
      const tracerouteButton = document.getElementById("tracerouteButton");
      if (tracerouteButton) {
        tracerouteButton.addEventListener("click", async () => {
          const tracerouteStatus = document.createElement("div");
          tracerouteStatus.id = "tracerouteStatus";
          tracerouteStatus.innerHTML = `<em>Running traceroute, please wait...</em>`;
          this.infoBox.appendChild(tracerouteStatus);
          try {
            const tracerouteData = await window.networkManager.fetchTracerouteData(data.id);
            tracerouteStatus.remove();
            if (tracerouteData && tracerouteData.hops && tracerouteData.hops.length > 0) {
              this.infoBox.innerHTML += `<br><strong>Traceroute Hops:</strong><br>${tracerouteData.hops.join(" → ")}`;
              // Mark node as tracerouted if needed
              data.tracerouted = true;
            }
          } catch (err) {
            tracerouteStatus.remove();
            console.error("Error running traceroute:", err);
          }
        });
      }
    }, 50);
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
    const screenX = (nodePosition.x + 1) / 2 * window.innerWidth;
    const screenY = (-nodePosition.y + 1) / 2 * window.innerHeight;
    this.infoBox.style.left = `${screenX + 20}px`;
    this.infoBox.style.top = `${screenY - 20}px`;
  }

  addScannedOverlay(node) {
    // Prevent duplicate overlays
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
      window.selectedNode = null;
    }
  }

  hideInfo() {
    this.infoBox.style.display = "none";
  }
}

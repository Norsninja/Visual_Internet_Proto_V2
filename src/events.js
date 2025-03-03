// src/events.js
import * as THREE from 'three';

export class EventsManager {
  constructor(camera, nodesManager, uiManager, ship) {
    this.camera = camera;
    this.nodesManager = nodesManager;
    // uiManager may be null—if so, we’ll fall back to window.uiManager
    this.uiManager = uiManager;
    this.ship = ship;
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.selectedNode = null;

    const canvasContainer = document.getElementById("threejs-container");
    if (canvasContainer) {
      canvasContainer.addEventListener("click", this.handleClick.bind(this), false);
    } else {
      // Fallback: attach to document if not found
      document.addEventListener("click", this.handleClick.bind(this), false);
    }
    document.addEventListener("keydown", this.handleKeyDown.bind(this), false);
  }
  handleKeyDown(event) {
    if (event.key.toLowerCase() === "v") {
      this.ship.switchView();
    }
    
    // Handle network map toggle on 'M' key
    if (event.key.toLowerCase() === "m") {
      // Check if networkMap already exists
      if (!window.networkMap) {
        console.log("Initializing network map...");
        
        // Create container element if it doesn't exist
        let mapContainer = document.getElementById('network-map-container');
        if (!mapContainer) {
          mapContainer = document.createElement('div');
          mapContainer.id = 'network-map-container';
          document.body.appendChild(mapContainer);
        }
        
        // Import and initialize NetworkMap
        import('./components/NetworkMap.js')
          .then(module => {
            const NetworkMap = module.NetworkMap;
            window.networkMap = new NetworkMap('network-map-container', (isVisible) => {
              console.log("Network map visibility changed:", isVisible);
              
              // Callback when map visibility changes
              // Pause Three.js rendering when map is visible to save resources
              if (isVisible) {
                // Store current animation frame ID and cancel it
                window.mapPreviousAnimationFrame = window.animationFrameId;
                if (window.animationFrameId) {
                  cancelAnimationFrame(window.animationFrameId);
                }
                
                // Hide Three.js container to avoid interaction conflicts
                const threejsContainer = document.getElementById('threejs-container');
                if (threejsContainer) {
                  threejsContainer.style.visibility = 'hidden';
                }
              } else {
                // Restore Three.js animation and visibility
                const threejsContainer = document.getElementById('threejs-container');
                if (threejsContainer) {
                  threejsContainer.style.visibility = 'visible';
                }
                
                // Resume animation loop
                if (window.animate) {
                  window.animationFrameId = requestAnimationFrame(window.animate);
                }
              }
            });
            
            // Toggle map after initialization
            window.networkMap.toggle();
          })
          .catch(error => {
            console.error("Error loading NetworkMap:", error);
          });
      } else {
        // Toggle existing map
        console.log("Toggling existing network map");
        window.networkMap.toggle();
      }
      
      // Prevent conflicts with other M key handlers
      event.preventDefault();
      event.stopPropagation();
    }
  }

  handleClick(event) {
    console.log("Click event detected:", event.target);
    
    // Check if clicking on UI elements
    const isUIClick = event.target.closest("#uiContainer") || 
                     event.target.closest("#react-ui-container");
    
    console.log("Is UI click:", isUIClick);
    
    // Prevent handling clicks on any UI elements (including the React container)
    if (isUIClick) {
      console.log("Click on UI element - ignoring");
      return;
    }
  
    this.mouse.set(
      (event.clientX / window.innerWidth) * 2 - 1,
      -(event.clientY / window.innerHeight) * 2 + 1
    );
  
    const nodesArray = this.nodesManager.getNodesArray();
    if (nodesArray.length === 0) {
      console.log("No nodes in array");
      return;
    }
  
    // Ensure node world matrices are updated
    nodesArray.forEach(node => node.updateMatrixWorld(true));
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(nodesArray);
  
    console.log("Intersections:", intersects.length);
    
    if (intersects.length > 0) {
      console.log("Node clicked:", intersects[0].object.userData.id);
      this.selectNode(intersects[0].object);
    } else {
      console.log("No node intersected - resetting selection");
      this.resetSelection();
    }
  }


  selectNode(node) {
    if (!node?.userData) return;
  
    if (this.selectedNode && this.selectedNode !== node) {
      this.restoreNodeColor(this.selectedNode);
    }
  
    this.selectedNode = node;
    if (!node.userData.originalColor) {
      node.userData.originalColor = node.material.color.getHex();
    }
  
    node.material.color.set(0xffffff);
  
    // Use the UI manager (if available) to update the React UI state
    const ui = this.uiManager || window.uiManager;
    if (ui && typeof ui.showInfo === "function") {
      // For child nodes (port moons), don't modify their parent relationship
      const isPortNode = node.name && node.name.includes('-port-');
      
      if (isPortNode) {
        // For port nodes, keep their parent relationship intact
        // but still show their info in the UI
        ui.showInfo(node, { preserveParenting: true });
      } else {
        ui.showInfo(node);
      }
    }
  }

  restoreNodeColor(node) {
    if (node?.userData?.originalColor !== undefined) {
      node.material.color.setHex(node.userData.originalColor);
    }
  }

  resetSelection() {
    console.log("resetSelection called");
    if (this.selectedNode) {
      console.log("Resetting selection for node:", this.selectedNode.userData.id);
      this.restoreNodeColor(this.selectedNode);
      this.selectedNode = null;
      
      // Get UI manager reference
      const ui = this.uiManager || window.uiManager;
      console.log("UI manager reference:", ui);
      
      if (ui && typeof ui.hideInfo === "function") {
        console.log("Calling hideInfo");
        ui.hideInfo();
      } else {
        console.warn("hideInfo not found or not a function:", ui?.hideInfo);
      }
    } else {
      console.log("No node selected to reset");
    }
  }
}

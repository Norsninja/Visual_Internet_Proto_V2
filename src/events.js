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

  handleClick(event) {
    // Prevent handling clicks on any UI elements (including the React container)
    if (event.target.closest("#uiContainer")) return;

    this.mouse.set(
      (event.clientX / window.innerWidth) * 2 - 1,
      -(event.clientY / window.innerHeight) * 2 + 1
    );

    const nodesArray = this.nodesManager.getNodesArray();
    if (nodesArray.length === 0) return;

    // Ensure node world matrices are updated
    nodesArray.forEach(node => node.updateMatrixWorld(true));
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(nodesArray);

    if (intersects.length > 0) {
      this.selectNode(intersects[0].object);
    } else {
      this.resetSelection();
    }
  }

  handleKeyDown(event) {
    if (event.key.toLowerCase() === "v") {
      this.ship.switchView();
    }
    if (event.key.toLowerCase() === "m") {
      // Try to use the provided uiManager or fallback to window.uiManager
      const ui = this.uiManager || window.uiManager;
      if (ui && typeof ui.toggleNetworkNavigationHUD === "function") {
        ui.toggleNetworkNavigationHUD();
      }
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
      ui.showInfo(node);
    }
  }

  restoreNodeColor(node) {
    if (node?.userData?.originalColor !== undefined) {
      node.material.color.setHex(node.userData.originalColor);
    }
  }

  resetSelection() {
    if (this.selectedNode) {
      this.restoreNodeColor(this.selectedNode);
      this.selectedNode = null;
      const ui = this.uiManager || window.uiManager;
      if (ui && typeof ui.hideInfo === "function") {
        ui.hideInfo();
      }
    }
  }
}

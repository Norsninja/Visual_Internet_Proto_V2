import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Tween, Easing } from '@tweenjs/tween.js';

export class Ship {
  constructor(tweenGroup) {
    this.tweenGroup = tweenGroup;
    this.shipContainer = new THREE.Group(); // Holds exterior and cockpit

    // Load the ship GLB model instead of creating a cone.
    this.shipExterior = this.loadShipModel();
    this.shipContainer.add(this.shipExterior);

    // Placeholder Cockpit (Invisible for now)
    this.cockpit = new THREE.Object3D();
    this.cockpit.position.set(0, 0, 0);
    this.shipContainer.add(this.cockpit);

    this.currentView = 'external';
    this.previousPosition = new THREE.Vector3();
    this.targetQuaternion = new THREE.Quaternion();
  }

  loadShipModel() {
    const loader = new GLTFLoader();
    const shipGroup = new THREE.Group(); // Placeholder group until model loads.
    // Adjust the path to point to your glb file.
    loader.load('model/ship.glb', (gltf) => {
      const shipModel = gltf.scene;
      shipModel.name = "Ship";
      // Optionally adjust the model scale and rotation:
      shipModel.scale.set(2, 2, 2);
      shipModel.rotation.set(0, Math.PI / 2, 0);
      // Clear out the placeholder and add the loaded model.
      shipGroup.clear();
      shipGroup.add(shipModel);
    }, undefined, (error) => {
      console.error("Error loading ship GLB:", error);
    });
    return shipGroup;
  }

  getMesh() {
    return this.shipContainer;
  }

  travelTo(target, duration = 2000) {
    // If target is an Object3D, compute its world position
    let targetPosition = target instanceof THREE.Object3D 
      ? target.getWorldPosition(new THREE.Vector3())
      : target;
  
    // Check if the target is a node (router or device) so we add an offset.
    if (target.userData && (target.userData.type === "router" || target.userData.type === "device")) {
      // Define an orbit radius (adjust as needed)
      const orbitRadius = 20;  
      // Choose an orbit angle (here, a random angle; you might want to use a stored angle for consistency)
      const orbitAngle = Math.random() * Math.PI * 2;
      // Compute the offset vector
      const offset = new THREE.Vector3(
        orbitRadius * Math.cos(orbitAngle),
        orbitRadius * Math.sin(orbitAngle),
        0  // Adjust Z offset if desired
      );
      // Add the offset to the target's center so that the ship travels to the orbit point
      targetPosition = targetPosition.clone().add(offset);
    }
  
    console.log("Ship is moving from:", this.shipContainer.position, "to", targetPosition);
    this.previousPosition.copy(this.shipContainer.position);
  
    // Determine a target quaternion so the ship faces its destination.
    const lookAtMatrix = new THREE.Matrix4();
    lookAtMatrix.lookAt(this.shipContainer.position, targetPosition, this.shipContainer.up);
    const targetQuaternion = new THREE.Quaternion().setFromRotationMatrix(lookAtMatrix);
  
    // Tween rotation first
    new Tween(this.shipContainer.quaternion, this.tweenGroup)
      .to({ 
        x: targetQuaternion.x, 
        y: targetQuaternion.y, 
        z: targetQuaternion.z, 
        w: targetQuaternion.w 
      }, duration / 2)
      .easing(Easing.Quadratic.Out)
      .onUpdate(() => this.shipContainer.updateMatrixWorld(true))
      .start();
  
    // Tween position with a slight delay so rotation starts first
    setTimeout(() => {
      new Tween(this.shipContainer.position, this.tweenGroup)
        .to({ 
          x: targetPosition.x, 
          y: targetPosition.y, 
          z: targetPosition.z 
        }, duration)
        .easing(Easing.Quadratic.Out)
        .onUpdate(() => this.shipContainer.updateMatrixWorld(true))
        .onComplete(() => {
          console.log("Ship arrived at:", this.shipContainer.position);
          if (window.uiManager) {
            window.uiManager.updateTravelStatus("Arrived!");
          }
          // If the target is a node, set the orbit based on its true center.
          if (target.userData && (target.userData.type === "router" || target.userData.type === "device")) {
            // Use the target's true center (without offset) as the orbit center.
            const nodeCenter = target instanceof THREE.Object3D
              ? target.getWorldPosition(new THREE.Vector3())
              : target;
            this.setOrbitAroundNode(nodeCenter);
          }
        })
        .start();
    }, duration / 2);
  }
  
  setOrbitAroundNode(nodePosition) {
    if (!nodePosition) {
      console.warn("No valid node position found for orbit.");
      return;
    }
    // Save the node's center as the orbit target.
    this.orbitTarget = nodePosition.clone();
    // Define the orbit radius; this should match the offset used in travelTo.
    this.orbitRadius = 20;
    // Set an initial orbit angle (could be random or fixed)
    this.orbitAngle = Math.random() * Math.PI * 2;
    
    // Immediately set the ship's position at the offset point.
    this.shipContainer.position.set(
      nodePosition.x + this.orbitRadius * Math.cos(this.orbitAngle),
      nodePosition.y + this.orbitRadius * Math.sin(this.orbitAngle),
      nodePosition.z  // Adjust if you want a Z offset
    );
  
    console.log("Ship placed in orbit at:", this.shipContainer.position);
  }
  
  switchView() {
    if (this.currentView === 'external') {
      this.enterCockpit();
    } else {
      this.exitCockpit();
    }
  }

  enterCockpit() {
    this.currentView = 'cockpit';
    console.log("Entering cockpit view");

    if (window.cameraController) {
      window.cameraController.camera.position.set(
        this.shipContainer.position.x,
        this.shipContainer.position.y,
        this.shipContainer.position.z
      );
      window.cameraController.controls.target.set(
        this.shipContainer.position.x,
        this.shipContainer.position.y,
        this.shipContainer.position.z + 1
      );
    }
  }

  exitCockpit() {
    this.currentView = 'external';
    console.log("Exiting cockpit view");

    if (window.cameraController) {
      window.cameraController.camera.position.set(
        this.shipContainer.position.x,
        this.shipContainer.position.y + 20,
        this.shipContainer.position.z + 50
      );
      window.cameraController.controls.target.copy(this.shipContainer.position);
    }
  }
}

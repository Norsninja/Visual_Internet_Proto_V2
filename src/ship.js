import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Tween, Easing } from '@tweenjs/tween.js';

export class Ship {
  constructor(tweenGroup) {
    this.tweenGroup = tweenGroup;
    this.shipContainer = new THREE.Group(); // Holds exterior and cockpit

    // Load the ship GLB model.
    this.shipExterior = this.loadShipModel();
    this.shipContainer.add(this.shipExterior);

    // Cockpit base.
    this.cockpit = new THREE.Object3D();
    this.cockpit.position.set(0, 0, 0);
    this.shipContainer.add(this.cockpit);

    // Create a dedicated cockpit mount for the camera.
    this.cockpitCameraMount = new THREE.Object3D();
    // Position at the desired cockpit location (e.g., 1 unit up).
    this.cockpitCameraMount.position.set(0, 5, 0);
    // Rotate the mount 180° so that its -Z (forward) aligns with the ship’s bow.
    this.cockpitCameraMount.rotation.y = Math.PI;
    this.cockpit.add(this.cockpitCameraMount);

    // Create separate containers for yaw (horizontal) and pitch (vertical).
    this.yawObject = new THREE.Object3D();
    this.pitchObject = new THREE.Object3D();
    // Nest pitch inside yaw.
    this.yawObject.add(this.pitchObject);
    // Attach the yaw (with pitch inside) to the cockpit mount.
    this.cockpitCameraMount.add(this.yawObject);

    // Flight control parameters.
    this.cockpitFlightSpeed = 0.04; // Adjust as needed.
    this.mouseSensitivity = 0.002;
    this.maxPitch = Math.PI / 2 - 0.1; // Clamp pitch (in radians)

    this.currentView = 'external';
  }

  loadShipModel() {
    const loader = new GLTFLoader();
    const shipGroup = new THREE.Group(); // Placeholder until model loads.
    loader.load('model/ship.glb', (gltf) => {
      const shipModel = gltf.scene;
      shipModel.name = "Ship";
      shipModel.scale.set(2, 2, 2);
      // Adjust rotation if needed so the external view shows the ship’s bow correctly.
      // For example, if the ship’s natural forward is -Z, you may not need extra rotation.
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

  // ---------------- Cockpit View and Controls ----------------

  switchView() {
    if (this.currentView === 'external') {
      this.enterCockpit();
    } else {
      this.exitCockpit();
    }
  }
  setShipOpacity(opacity) {
    // Traverse the shipExterior group and update materials.
    this.shipExterior.traverse((child) => {
      if (child.isMesh && child.material) {
        child.material.transparent = true;
        child.material.opacity = opacity;
      }
    });
  }
  
  enterCockpit() {
    this.currentView = 'cockpit';
    console.log("Entering cockpit view");

    if (window.cameraController) {
      const camera = window.cameraController.camera;
      if (camera.parent) camera.parent.remove(camera);
      // Attach camera to the pitch object so that its local -Z is used.
      this.pitchObject.add(camera);
      camera.position.set(0, 0, 0);
      camera.rotation.set(0, 0, 0);
      if (window.cameraController.controls) {
        window.cameraController.controls.enabled = false;
      }
    }
    this.setShipOpacity(0.2);
    document.body.requestPointerLock();

    // Set up mouse move handler to update yaw and pitch.
    this.mouseMoveHandler = (event) => {
      // Update horizontal (yaw) rotation.
      this.yawObject.rotation.y -= event.movementX * this.mouseSensitivity;
      // Update vertical (pitch) rotation.
      this.pitchObject.rotation.x -= event.movementY * this.mouseSensitivity;
      // Clamp pitch.
      this.pitchObject.rotation.x = Math.max(-this.maxPitch, Math.min(this.maxPitch, this.pitchObject.rotation.x));
    };
    document.addEventListener('mousemove', this.mouseMoveHandler, false);
  }

  exitCockpit() {
    this.currentView = 'external';
    console.log("Exiting cockpit view");
  
    if (window.cameraController) {
      const camera = window.cameraController.camera;
      // Remove the camera from its cockpit parent (e.g., from pitchObject)
      this.pitchObject.remove(camera);
      
      // Reparent the camera to the scene.
      // (Make sure your scene is globally accessible. In main.js, you can set window.scene = scene.)
      window.scene.add(camera);
      
      // Calculate the ship's world position.
      const shipWorldPos = new THREE.Vector3();
      this.shipContainer.getWorldPosition(shipWorldPos);
      
      // Position the camera relative to the ship.
      camera.position.copy(shipWorldPos).add(new THREE.Vector3(0, 20, 50));
      camera.rotation.set(0, 0, 0);
      
      // Re-enable OrbitControls and set its target to the ship's world position.
      if (window.cameraController.controls) {
        window.cameraController.controls.enabled = true;
        window.cameraController.controls.target.copy(shipWorldPos);
      }
    }
    this.setShipOpacity(1.0);    
    document.exitPointerLock();
    document.removeEventListener('mousemove', this.mouseMoveHandler, false);
  }
  
  

  // Use the yaw's forward vector for horizontal movement.
  updateCockpitControls(delta) {
    if (this.currentView !== 'cockpit') return;
    const moveDistance = this.cockpitFlightSpeed * delta;
    const camera = window.cameraController.camera;
  
    // Compute the movement vector based on the camera's orientation.
    let movement = new THREE.Vector3(0, 0, 0);
    
    // Get the camera's forward direction.
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.normalize();
  
    // Compute the right vector from the camera.
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion).normalize();
  
    // Accumulate movement contributions from key presses.
    if (window.keyStates) {
      if (window.keyStates['KeyW']) movement.add(forward);
      if (window.keyStates['KeyS']) movement.add(forward.clone().negate());
      if (window.keyStates['KeyA']) movement.add(right);
      if (window.keyStates['KeyD']) movement.add(right.clone().negate());
    }
  
    if (movement.length() > 0) {
      movement.normalize();
  
      // Move the ship along the computed movement vector.
      this.shipContainer.position.add(movement.clone().multiplyScalar(moveDistance));
  
      // To rotate the ship, compute a target orientation:
      // Imagine a point in front of the ship in the direction of movement.
      const desiredLookAt = new THREE.Vector3().copy(this.shipContainer.position).add(movement);
  
      // Create a temporary object to compute the target quaternion.
      const dummy = new THREE.Object3D();
      dummy.position.copy(this.shipContainer.position);
      dummy.lookAt(desiredLookAt);
      const targetQuaternion = dummy.quaternion.clone();
  
      // Smoothly interpolate (slerp) the ship's quaternion toward the target orientation.
      // Adjust the slerp factor (here 0.1) to control the turning speed.
      this.shipContainer.quaternion.slerp(targetQuaternion, 0.04);
    }
  }
  
  

  // ---------------- Other methods remain unchanged ----------------

  travelTo(target, duration = 2000) {
    // ... existing travelTo implementation ...
    let targetPosition = target instanceof THREE.Object3D 
      ? target.getWorldPosition(new THREE.Vector3())
      : target;
  
    if (target.userData && (target.userData.type === "router" || target.userData.type === "device")) {
      const orbitRadius = 20;  
      const orbitAngle = Math.random() * Math.PI * 2;
      const offset = new THREE.Vector3(
        orbitRadius * Math.cos(orbitAngle),
        orbitRadius * Math.sin(orbitAngle),
        0
      );
      targetPosition = targetPosition.clone().add(offset);
    }
  
    console.log("Ship is moving from:", this.shipContainer.position, "to", targetPosition);
  
    const lookAtMatrix = new THREE.Matrix4();
    lookAtMatrix.lookAt(this.shipContainer.position, targetPosition, this.shipContainer.up);
    const targetQuaternion = new THREE.Quaternion().setFromRotationMatrix(lookAtMatrix);
  
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
          if (target.userData && (target.userData.type === "router" || target.userData.type === "device")) {
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
    this.orbitTarget = nodePosition.clone();
    this.orbitRadius = 20;
    this.orbitAngle = Math.random() * Math.PI * 2;
    
    this.shipContainer.position.set(
      nodePosition.x + this.orbitRadius * Math.cos(this.orbitAngle),
      nodePosition.y + this.orbitRadius * Math.sin(this.orbitAngle),
      nodePosition.z
    );
  
    console.log("Ship placed in orbit at:", this.shipContainer.position);
  }
}

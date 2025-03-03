// ThreeCanvas.jsx
import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';

import { SceneManager } from '../scene.js';
import { CameraController } from '../camera.js';
import { Ship } from '../ship.js';
import { NodesManager } from '../nodes/nodes.js';
import { EdgesManager } from '../edges.js';
import { EventsManager } from '../events.js';
import { NetworkManager } from '../network.js';
import { TrafficMeter } from '../ui/traffic_meter.js';
import { Group } from '@tweenjs/tween.js';
// Import NetworkMap dynamically when needed (not immediately)

const ThreeCanvas = ({ onReady }) => {
  const containerRef = useRef();

  useEffect(() => {
    // Create Tween group and set global constants
    const tweenGroup = new Group();
    window.NODE_SCALE = 15;

    // Create the renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.domElement.style.position = "absolute";
    renderer.domElement.style.top = "0px";
    renderer.domElement.style.left = "0px";

    // Append renderer's canvas to our container
    const container = containerRef.current;
    container.appendChild(renderer.domElement);

    // --- Three.js Initialization ---
    // Create scene via SceneManager (assumes SceneManager sets up lighting and star field)
    const sceneManager = new SceneManager();
    const scene = sceneManager.scene;
    window.sceneManager = sceneManager;
    window.scene = scene;

    // Create ship, camera, and add to scene
    const ship = new Ship(tweenGroup);
    scene.add(ship.getMesh());
    window.ship = ship;

    const cameraController = new CameraController(renderer, ship.getMesh());
    window.cameraController = cameraController;
    window.camera = cameraController.camera;

    // Initialize game objects (nodes and edges)
    const nodesManager = new NodesManager(scene);
    const edgesManager = new EdgesManager(scene, (id) => nodesManager.getNodeById(id), nodesManager);
    if (!edgesManager.edgeRegistry) {
      console.warn("⚠️ edgesManager.edgeRegistry was not initialized. Fixing...");
      edgesManager.edgeRegistry = new Map();
    }
    window.nodesManager = nodesManager;
    window.edgesManager = edgesManager;

    // Set up events manager
    const eventsManager = new EventsManager(window.camera, nodesManager, null, ship);
    window.eventsManager = eventsManager;

    // Set up network manager
    const networkManager = new NetworkManager(nodesManager, edgesManager);
    window.networkManager = networkManager;
    networkManager.startPeriodicUpdates(10000);
    networkManager.startTrafficSensorUpdates(5000);
    edgesManager.pollTrafficRate();

    window.maxTravelDistance = 500;

    // Global key state manager
    window.keyStates = {};
    const handleKeyDown = (event) => {
      window.keyStates[event.code] = true;
    };
    const handleKeyUp = (event) => {
      window.keyStates[event.code] = false;
    };
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);

    // Expose renderer for the UI
    if (onReady) onReady({ renderer });

    // Modified animation loop - exposed globally for pausing/resuming
    const animate = (time) => {
      // Store animation frame ID globally for cancellation
      window.animationFrameId = requestAnimationFrame(animate);
      const delta = time * 0.001;

      // Compute network metrics (if needed for background animations)
      const nodesArray = nodesManager.getNodesArray();
      const totalNodes = nodesArray.length;
      const localNodes = nodesArray.filter(n => n.userData.type === "device").length;
      const externalNodes = nodesArray.filter(n => n.userData.type === "external").length;
      const trafficLevel = window.getTrafficLevel ? window.getTrafficLevel() : 0;
      const metrics = { trafficLevel, totalNodes, localNodes, externalNodes };

      if (sceneManager.animateBackground) {
        sceneManager.animateBackground(delta, metrics);
      }

      tweenGroup.update(time);
      cameraController.update();
      edgesManager.updateEdgePositions();
      edgesManager.updateTraffic();
      renderer.render(scene, window.camera);
      ship.updateCockpitControls(delta);
    };
    
    // Expose animation function globally
    window.animate = animate;
    
    // Start the animation loop
    animate(0);
    
    // Initialize TrafficMeter
    TrafficMeter();
    
    // Cleanup on unmount
    return () => {
      // Clean up event listeners
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
      
      // Remove renderer
      if (container && renderer.domElement) {
        container.removeChild(renderer.domElement);
      }
      
      // Dispose renderer
      renderer.dispose();
      
      // Cancel animation frame
      if (window.animationFrameId) {
        cancelAnimationFrame(window.animationFrameId);
      }
      
      // Clean up network map if it exists
      if (window.networkMap && typeof window.networkMap.destroy === 'function') {
        window.networkMap.destroy();
      }
    };
  }, [onReady]);

  return <div id="threejs-container" ref={containerRef} style={{ width: '100vw', height: '100vh' }} />;
};

export default ThreeCanvas;
// ThreeCanvas.jsx - Updated initialization code
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
import { cleanupCANodes } from '../nodes/CA_node_material.js';
import { RequestQueue } from '../nodes/request_queue.js';
import { MysteriousNodesManager } from '../mysteriousMaterial.js';
// Import NetworkMap dynamically when needed (not immediately)

const ThreeCanvas = ({ onReady }) => {
  const containerRef = useRef();

  useEffect(() => {
    // IMPORTANT: Initialize RequestQueue first to ensure it's available for all components
    if (!window.requestQueue) {
      window.requestQueue = new RequestQueue();
      console.log("✅ Request queue initialized from ThreeCanvas");
    }
    
    // Create Tween group and set global constants
    const tweenGroup = new Group();
    window.NODE_SCALE = 15;
    
    // Create the renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.domElement.style.position = "absolute";
    renderer.domElement.style.top = "0px";
    renderer.domElement.style.left = "0px";
    window.renderer = renderer;
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

    window.maxTravelDistance = 1000;

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
      window.animationFrameId = requestAnimationFrame(animate);
      const delta = time * 0.001;
      
      // Process ship controls FIRST for better responsiveness
      ship.updateCockpitControls(delta);
      
      // Then update camera
      cameraController.update();
      
      // Then update scene elements
      tweenGroup.update(time);
      
      // Use frame-skipping for heavy operations when framerate is low
      // Get FPS estimation (smooth over multiple frames)
      if (!window._lastFpsUpdate) window._lastFpsUpdate = time;
      if (!window._frameCount) window._frameCount = 0;
      if (!window._currentFps) window._currentFps = 60;
      
      window._frameCount++;
      const timeSinceLastFpsUpdate = time - window._lastFpsUpdate;
      
      if (timeSinceLastFpsUpdate > 1000) { // Update FPS calculation every second
        window._currentFps = window._frameCount / (timeSinceLastFpsUpdate / 1000);
        window._frameCount = 0;
        window._lastFpsUpdate = time;
      }
      
      // Adapt processing based on framerate
      const lowFramerate = window._currentFps < 30;
      
      // Stagger heavy updates across frames when framerate is low
      const frameIndex = window._frameCount % 3;
      
      if (!lowFramerate || frameIndex === 0) {
        edgesManager.updateEdgePositions();
      }
      
      if (!lowFramerate || frameIndex === 1) {
        edgesManager.updateTraffic();
      }
      
      if (!lowFramerate || frameIndex === 2) {
        if (window.caNodesManager && window.caNodesManager.update) {
          window.caNodesManager.update(time);
        }
      }
      // New: Update mysterious nodes
      if (!lowFramerate || frameIndex === 3) {
        if (window.mysteriousNodesManager && window.mysteriousNodesManager.update) {
          window.mysteriousNodesManager.update(scene, window.camera);
        }
      }      
      // Finally render
      renderer.render(scene, window.camera);
    };
    
    // Expose animation function globally
    window.animate = animate;
    
    // Start the animation loop
    animate(0);
    
    // Initialize TrafficMeter
    TrafficMeter();
    
    // After initialization, enable CA visualization by default
    if (typeof window.setCAVisualizationEnabled === 'function') {
      window.setCAVisualizationEnabled(true);
      console.log("CA visualization enabled by default");
    }
    
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
      cleanupCANodes();
      if (window.mysteriousNodesManager) {
        window.mysteriousNodesManager.nodes.forEach(node => {
          if (node.material && node.material.userData.isMysteriousMaterial) {
            node.material.userData.cubeRenderTarget.dispose();
          }
        });
      }
    };
  }, [onReady]);

  return <div id="threejs-container" ref={containerRef} style={{ width: '100vw', height: '100vh' }} />;
};

export default ThreeCanvas;
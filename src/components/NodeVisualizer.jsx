// components/NodeVisualizer.jsx
import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createCAMaterialForNode, updateCAMaterial } from '../nodes/CA_node_material.js';

const NodeVisualizer = ({ nodeId, nodeData, onClose }) => {
  const containerRef = useRef();
  const [isLoading, setIsLoading] = useState(true);
  const [fps, setFps] = useState(0);
  const [analysisComplete, setAnalysisComplete] = useState(false);
  const [caData, setCAData] = useState({
    cellCount: 0,
    activeCells: 0,
    density: 0,
    ruleType: ''
  });
  
  // Play computer sound effect
  const playComputerSound = (type) => {
    const sounds = {
      activate: new Audio('/sounds/computer_activate.mp3'),
      beep: new Audio('/sounds/computer_beep.mp3'),
      working: new Audio('/sounds/computer_working.mp3')
    };
    
    // Fallback if sounds aren't available
    try {
      if (sounds[type]) sounds[type].play();
    } catch (e) {
      console.log('Sound not available:', e);
    }
  };
  
  // Format ports for display
  const formatPorts = (ports) => {
    if (!ports || !ports.length) return 'None detected';
    
    // Group ports by common services
    const portGroups = {
      'Web Services': [80, 443, 8080, 8443],
      'Email': [25, 110, 143, 465, 587, 993, 995],
      'File Transfer': [20, 21, 22, 69, 115, 989, 990],
      'Database': [1433, 1521, 3306, 5432, 6379, 27017, 28017],
      'Remote Access': [22, 23, 3389, 5900]
    };
    
    const categorized = {};
    const uncategorized = [];
    
    ports.forEach(port => {
      let found = false;
      for (const [category, categoryPorts] of Object.entries(portGroups)) {
        if (categoryPorts.includes(parseInt(port))) {
          categorized[category] = categorized[category] || [];
          categorized[category].push(port);
          found = true;
          break;
        }
      }
      if (!found) uncategorized.push(port);
    });
    
    // Format the output
    let result = '';
    for (const [category, categoryPorts] of Object.entries(categorized)) {
      result += `${category}: ${categoryPorts.join(', ')}\n`;
    }
    
    if (uncategorized.length) {
      result += `Other: ${uncategorized.join(', ')}`;
    }
    
    return result;
  };
  
  useEffect(() => {
    // Play activation sound
    playComputerSound('activate');
    
    // Fake a scanning process
    setTimeout(() => {
      setAnalysisComplete(true);
      playComputerSound('beep');
    }, 2500);
    
    // Setup renderer, camera, scene
    const renderer = new THREE.WebGLRenderer({ 
      antialias: true,
      alpha: true 
    });
    
    // Use much larger dimensions - nearly full screen
    const width = Math.min(1200, window.innerWidth * 0.95);
    const height = Math.min(800, window.innerHeight * 0.85);
    renderer.setSize(width, height);
    renderer.setClearColor(0x000000, 0.2); // Slight transparency
    containerRef.current.appendChild(renderer.domElement);
    
    const camera = new THREE.PerspectiveCamera(60, width/height, 0.1, 100);
    camera.position.z = 5;
    
    const scene = new THREE.Scene();
    
    // Create a star field background
    const starCount = 1000;
    const starGeometry = new THREE.BufferGeometry();
    const starPositions = [];
    
    for (let i = 0; i < starCount; i++) {
      const x = (Math.random() - 0.5) * 100;
      const y = (Math.random() - 0.5) * 100;
      const z = (Math.random() - 0.5) * 100;
      starPositions.push(x, y, z);
    }
    
    starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
    const starMaterial = new THREE.PointsMaterial({ 
      color: 0xFFFFFF, 
      size: 0.5, 
      transparent: true,
      opacity: 0.8
    });
    const stars = new THREE.Points(starGeometry, starMaterial);
    scene.add(stars);
    
    // Set up OrbitControls for interactive rotation/zoom
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.rotateSpeed = 0.7;
    controls.zoomSpeed = 1.2;
    controls.panSpeed = 0.8;
    controls.minDistance = 3;
    controls.maxDistance = 20;
    
    // Add dramatic lighting
    const ambientLight = new THREE.AmbientLight(0x1a1a2e, 0.4);
    scene.add(ambientLight);
    
    const mainLight = new THREE.DirectionalLight(0x7070ff, 1);
    mainLight.position.set(5, 5, 5);
    scene.add(mainLight);
    
    const accentLight = new THREE.DirectionalLight(0xff5555, 0.5);
    accentLight.position.set(-5, 3, -5);
    scene.add(accentLight);
    
    // Add scanning effect light
    const scanLight = new THREE.PointLight(0x00ffff, 2, 10);
    scanLight.position.set(0, 0, 5);
    scene.add(scanLight);
    
    // Create a sphere with CA material
    const geometry = new THREE.SphereGeometry(2, 64, 64);
    let material, mesh;
    
    // Helper function to place node in the center of the scene
    const centerNode = () => {
      if (mesh) {
        mesh.position.set(0, 0, 0);
        controls.target.set(0, 0, 0);
        controls.update();
      }
    };
    
    // Create circular platform/base for the node
    const platformGeometry = new THREE.CylinderGeometry(3, 3, 0.1, 32);
    const platformMaterial = new THREE.MeshPhongMaterial({ 
      color: 0x1a1a3a, 
      emissive: 0x0a0a2a,
      specular: 0x111133,
      shininess: 30
    });
    const platform = new THREE.Mesh(platformGeometry, platformMaterial);
    platform.position.y = -2.5;
    scene.add(platform);
    
    // Add scanning rings that expand periodically
    const createScanRing = () => {
      const ringGeometry = new THREE.RingGeometry(0.1, 0.12, 32);
      const ringMaterial = new THREE.MeshBasicMaterial({ 
        color: 0x00ffff, 
        transparent: true, 
        opacity: 0.8,
        side: THREE.DoubleSide
      });
      
      const ring = new THREE.Mesh(ringGeometry, ringMaterial);
      ring.rotation.x = Math.PI / 2; // Make it horizontal
      ring.position.y = -2.45; // Just above platform
      scene.add(ring);
      
      // Animate the ring expanding
      const expandRing = () => {
        let scale = 0.1;
        let opacity = 1.0;
        
        const animate = () => {
          scale += 0.05;
          opacity -= 0.01;
          
          ring.scale.set(scale, scale, scale);
          ringMaterial.opacity = opacity;
          
          if (opacity > 0 && scale < 15) {
            requestAnimationFrame(animate);
          } else {
            scene.remove(ring);
            ringMaterial.dispose();
            ringGeometry.dispose();
            
            // Create a new ring after a delay
            if (Math.random() > 0.5) {
              setTimeout(createScanRing, Math.random() * 2000 + 1000);
            }
          }
        };
        
        animate();
      };
      
      expandRing();
    };
    
    // Start scan ring animation
    setTimeout(createScanRing, 500);
    
    async function setupMaterial() {
      setIsLoading(true);
      try {
        material = await createCAMaterialForNode(nodeId);
        mesh = new THREE.Mesh(geometry, material);
        scene.add(mesh);
        
        // Add subtle rotation
        mesh.rotation.y = Math.PI / 6;
        mesh.rotation.x = Math.PI / 12;
        
        centerNode();
        
        // Extract CA data from the material for display
        if (material.userData && material.userData.caData) {
          // Count active cells in the current state
          const cells = material.userData.caData.current;
          const totalCells = cells.length * cells[0].length;
          let activeCount = 0;
          
          for (let x = 0; x < cells.length; x++) {
            for (let y = 0; y < cells[0].length; y++) {
              if (cells[x][y] === 1) activeCount++;
            }
          }
          
          const density = (activeCount / totalCells * 100).toFixed(2);
          
          // Determine rule type
          let ruleType = 'Standard Life-like';
          if (material.userData.birthRules) {
            if (material.userData.birthRules.join(',') === '3' && 
                material.userData.survivalRules.join(',') === '2,3') {
              ruleType = 'Conway\'s Game of Life';
            } else if (material.userData.birthRules.join(',') === '3,6,7,8' && 
                      material.userData.survivalRules.join(',') === '3,4,6,7,8') {
              ruleType = 'Day & Night';
            } else if (material.userData.birthRules.join(',') === '1' && 
                      material.userData.survivalRules.join(',') === '1,2,3,4,5') {
              ruleType = 'Maze Generator';
            }
          }
          
          setCAData({
            cellCount: totalCells,
            activeCells: activeCount,
            density: density,
            ruleType: ruleType
          });
        }
      } catch (error) {
        console.error("Error creating CA material:", error);
      } finally {
        setIsLoading(false);
      }
    }
    
    setupMaterial();
    
    // Handle window resize
    const handleResize = () => {
      const width = Math.min(1200, window.innerWidth * 0.95);
      const height = Math.min(800, window.innerHeight * 0.85);
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    
    window.addEventListener('resize', handleResize);
    
    // Add keyboard controls for centering and resetting view
    const handleKeyDown = (event) => {
      // Reset view when 'R' is pressed
      if (event.key.toLowerCase() === 'r') {
        centerNode();
        camera.position.set(0, 0, 5);
        controls.update();
        playComputerSound('beep');
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    
    // Animation loop
    let requestId;
    let lastUpdate = performance.now();
    let frameCount = 0;
    let lastFpsUpdate = performance.now();
    let scanLightIntensity = 0;
    let scanDirection = 1;
    
    function animate(now) {
      requestId = requestAnimationFrame(animate);
      
      // FPS counter
      frameCount++;
      if (now - lastFpsUpdate > 1000) {
        setFps(Math.round(frameCount * 1000 / (now - lastFpsUpdate)));
        frameCount = 0;
        lastFpsUpdate = now;
      }
      
      // Update controls
      controls.update();
      
      // Rotate stars very slowly
      stars.rotation.y += 0.0001;
      
      // Pulsing scan light
      scanLightIntensity += 0.02 * scanDirection;
      if (scanLightIntensity > 1.5) {
        scanDirection = -1;
      } else if (scanLightIntensity < 0.5) {
        scanDirection = 1;
      }
      scanLight.intensity = scanLightIntensity;
      
      if (mesh && material) {
        // Update material at a controlled rate
        const delta = now - lastUpdate;
        
        if (delta > 100) { // Update texture 10 times per second
          if (material.userData && material.userData.caData) {
            updateCAMaterial(material, delta);
            lastUpdate = now;
          }
        }
      }
      
      renderer.render(scene, camera);
    }
    
    animate(performance.now());
    
    // Cleanup
    return () => {
      cancelAnimationFrame(requestId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', handleKeyDown);
      
      controls.dispose();
      
      scene.remove(mesh);
      if (material) material.dispose();
      if (geometry) geometry.dispose();
      renderer.dispose();
      
      if (containerRef.current && containerRef.current.contains(renderer.domElement)) {
        containerRef.current.removeChild(renderer.domElement);
      }
    };
  }, [nodeId]);
  
  // Format dates to be more readable
  const formatDate = (timestamp) => {
    if (!timestamp) return 'Unknown';
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };
  
  // Get scan results from the node data
  const getScanSummary = () => {
    if (!nodeData || !nodeData.scans || !nodeData.scans.length) {
      return 'No scan data available';
    }
    
    // Find the most recent scan of each type
    const scanTypes = {};
    nodeData.scans.forEach(scan => {
      if (!scanTypes[scan.type] || scan.timestamp > scanTypes[scan.type].timestamp) {
        scanTypes[scan.type] = scan;
      }
    });
    
    // Format the scan summary
    let summary = '';
    Object.entries(scanTypes).forEach(([type, scan]) => {
      summary += `• ${type.charAt(0).toUpperCase() + type.slice(1)} (${formatDate(scan.timestamp)})\n`;
    });
    
    return summary;
  };
  
  return (
    <div className="mainscreen-visualizer-overlay">
      <div className="mainscreen-visualizer-container">
        <div className="mainscreen-header">
          <div className="lcars-header-left">
            <div className="lcars-pill"></div>
            <div className="lcars-title">NODE ANALYSIS: {nodeId}</div>
          </div>
          
          <div className="lcars-header-right">
            <div className="lcars-pill"></div>
            <button className="mainscreen-close-btn" onClick={onClose}>
              Return to Main View
            </button>
          </div>
        </div>
        
        <div className="mainscreen-content-area">
          <div className="left-panel">
            <div className="lcars-section">
              <div className="lcars-section-header">Node Properties</div>
              <div className="lcars-data-item">
                <span className="lcars-label">Type:</span>
                <span className="lcars-value">{nodeData?.type || 'Unknown'}</span>
              </div>
              <div className="lcars-data-item">
                <span className="lcars-label">Status:</span>
                <span className="lcars-value status-scanned">Fully Scanned</span>
              </div>
              <div className="lcars-data-item">
                <span className="lcars-label">IP Address:</span>
                <span className="lcars-value">{nodeId}</span>
              </div>
              {nodeData?.os && (
                <div className="lcars-data-item">
                  <span className="lcars-label">Operating System:</span>
                  <span className="lcars-value">{nodeData.os}</span>
                </div>
              )}
              {nodeData?.hostname && (
                <div className="lcars-data-item">
                  <span className="lcars-label">Hostname:</span>
                  <span className="lcars-value">{nodeData.hostname}</span>
                </div>
              )}
            </div>
            
            <div className="lcars-section">
              <div className="lcars-section-header">Scan Summary</div>
              <div className="lcars-text-block">
                {getScanSummary()}
              </div>
            </div>
            
            <div className="lcars-section">
              <div className="lcars-section-header">Open Ports</div>
              <div className="lcars-text-block port-list">
                {nodeData?.ports ? formatPorts(nodeData.ports) : 'No port data available'}
              </div>
            </div>
          </div>
          
          <div className="visualization-main">
            {isLoading && (
              <div className="mainscreen-loading">
                <div className="scanner-beam"></div>
                <div className="loading-text">Initializing scan...</div>
              </div>
            )}
            <div ref={containerRef} className="mainscreen-canvas" />
          </div>
          
          <div className="right-panel">
            <div className="lcars-section">
              <div className="lcars-section-header">CA Pattern Analysis</div>
              <div className="lcars-data-item">
                <span className="lcars-label">Pattern Type:</span>
                <span className="lcars-value">{caData.ruleType}</span>
              </div>
              <div className="lcars-data-item">
                <span className="lcars-label">Grid Size:</span>
                <span className="lcars-value">{Math.sqrt(caData.cellCount)} × {Math.sqrt(caData.cellCount)}</span>
              </div>
              <div className="lcars-data-item">
                <span className="lcars-label">Active Cells:</span>
                <span className="lcars-value">{caData.activeCells}</span>
              </div>
              <div className="lcars-data-item">
                <span className="lcars-label">Cell Density:</span>
                <span className="lcars-value">{caData.density}%</span>
              </div>
              <div className="lcars-data-item">
                <span className="lcars-label">Frame Rate:</span>
                <span className="lcars-value">{fps} FPS</span>
              </div>
              <div className="lcars-data-item">
                <span className="lcars-label">Analysis:</span>
                <span className="lcars-value">
                  {analysisComplete ? 
                    'Complete' : 
                    <span className="scanning-text">In Progress<span className="dot-1">.</span><span className="dot-2">.</span><span className="dot-3">.</span></span>
                  }
                </span>
              </div>
            </div>
            
            <div className="lcars-section">
              <div className="lcars-section-header">Network Data</div>
              {nodeData?.asn && (
                <div className="lcars-data-item">
                  <span className="lcars-label">ASN:</span>
                  <span className="lcars-value">{nodeData.asn}</span>
                </div>
              )}
              {nodeData?.isp && (
                <div className="lcars-data-item">
                  <span className="lcars-label">ISP:</span>
                  <span className="lcars-value">{nodeData.isp}</span>
                </div>
              )}
              {nodeData?.tracerouted && (
                <div className="lcars-data-item">
                  <span className="lcars-label">Traceroute:</span>
                  <span className="lcars-value">Complete</span>
                </div>
              )}
              {nodeData?.geolocation && (
                <div className="lcars-data-item">
                  <span className="lcars-label">Location:</span>
                  <span className="lcars-value">
                    {nodeData.geolocation.city}, {nodeData.geolocation.country}
                  </span>
                </div>
              )}
            </div>
            
            <div className="lcars-controls">
              <div className="lcars-section-header">Controls</div>
              <div className="lcars-instruction">• Drag to rotate model</div>
              <div className="lcars-instruction">• Scroll to zoom in/out</div>
              <div className="lcars-instruction">• Right-click to pan view</div>
              <div className="lcars-instruction">• Press R to reset view</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NodeVisualizer;
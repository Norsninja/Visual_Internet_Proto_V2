import * as THREE from 'three';
import { createCANode } from './CA_node.js';

async function initScene() {
    // Create Scene
    const scene = new THREE.Scene();

    // Create Camera
    const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 5;

    // Create Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    // Add Lighting
    const light = new THREE.DirectionalLight(0xffffff, 0.2);
    light.position.set(5, 5, 5);
    scene.add(light);

    // Fetch and Add CA Node for 8.8.8.8
    console.log("Requesting CA Node for 8.8.8.8...");
    const node = await createCANode("72.129.14.168");
    scene.add(node);

    // Animation Loop
    function animate() {
        requestAnimationFrame(animate);
        node.rotation.y += 0.002;  // Slow rotation for visualization
        renderer.render(scene, camera);
    }

    animate();
}

// Initialize
initScene();

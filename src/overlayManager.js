import * as THREE from 'three';

export function addOverlays(node) {
    // Remove old overlays before adding new ones (avoids duplicates)
    removeOverlays(node);

    // Define torus overlay parameters
    const overlays = [
        {
            // This overlay represents port scans (blue)
            name: "portScanOverlay",
            radius: 25 * 1.5,  // Slightly larger than node for port scan
            tubeRadius: 0.1,
            color: 0x0000ff,  // blue for port scanned
            condition: node.userData.scanned_ports || (node.userData.ports && node.userData.ports.length > 0)
        },
        {
            // This overlay represents web scans (pink)
            name: "webScanOverlay",
            radius: 35 * 1.5,  // Adjust radius as needed so it doesn't overlap too much
            tubeRadius: 0.1,
            color: 0xff69b4,  // Pink for web scanned
            condition: node.userData.web_scanned
        },
        {
            // This overlay represents traceroute (green)
            name: "tracerouteOverlay",
            radius: 30 * 1.5,  // Larger than scanned overlay
            tubeRadius: 0.15,
            color: 0x00ff00,  // Green for tracerouted
            condition: node.userData.tracerouted
        },
        {
            // This overlay represents BGP (yellow)
            name: "bgpscanOverlay",
            radius: 40 * 1.5,  // Larger than scanned overlay
            tubeRadius: 0.15,
            color: 0xffff00,  // Yellow for BGP
            condition: node.userData.bgp_scanned
        }
    ];

    overlays.forEach(({ name, radius, tubeRadius, color, condition }) => {
        if (!condition) return; // Only add if condition is true

        const geometry = new THREE.TorusGeometry(radius, tubeRadius, 16, 100);
        const material = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: 0.8
        });

        const ring = new THREE.Mesh(geometry, material);
        ring.name = name;
        ring.rotation.x = Math.PI / 2; // Align with the equator

        // Add ring to node
        node.add(ring);
    });
}


// ✅ Function to remove both overlays before updating
export function removeOverlays(node) {
    ["portScanOverlay", "webScanOverlay", "tracerouteOverlay","bgpscanOverlay"].forEach(name => {
        const existingRing = node.getObjectByName(name);
        if (existingRing) node.remove(existingRing);
    });
}


// ✅ Function to update overlays dynamically
export function updateOverlays(node) {
    addOverlays(node); // Remove and re-add based on current state
}

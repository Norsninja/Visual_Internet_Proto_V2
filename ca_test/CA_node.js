import * as THREE from 'three';

// Cellular Automata Configuration
const CA_STATES = {
    INACTIVE: 0,
    ACTIVE: 1,
};

// ===========================
//  RELATIONSHIP-BASED PROBABILITY
// ===========================
function computeDynamicProbability(relationshipData) {
    if (!relationshipData) {
        return 0.5; // default probability if no data available
    }
    const diff = relationshipData.connected_to_count - relationshipData.traceroute_hop_count;
    let dynamicProb = 0.5 + diff * 0.05;
    return Math.max(0, Math.min(1, dynamicProb));
}

// ===========================
//  IP-BASED COLOR & SEEDING
// ===========================
function parseIPv4(ip) {
    const octets = ip.split('.').map(Number);
    if (octets.length !== 4 || octets.some(isNaN)) {
        console.error("Invalid IPv4 address:", ip);
        return null;
    }
    return octets;
}

/**
 * generatePaletteFromIP
 * 
 * This new version uses a less linear formula to spread out the hue
 * and uses broader ranges for saturation/lightness to ensure more
 * dramatic differences and stronger contrast.
 */
function generatePaletteFromIP(ip) {
    const octets = parseIPv4(ip);
    if (!octets) {
        return {
            baseHue: 0,
            background: 'hsl(0, 40%, 85%)',
            cellColor: 'hsl(180, 90%, 30%)',
            highlight: 'hsl(0, 100%, 50%)',
            baseSatBG: 40,
            baseLightBG: 85,
            baseHueCell: 180,
            baseSatCell: 90,
            baseLightCell: 30,
        };
    }
    const [o1, o2, o3, o4] = octets;
    // A scrambled hue for big variation:
    const baseHue = (o1 * 53 + o2 * 19 + o3 * 7 + o4 * 3) % 360;
    // Background: low saturation, high lightness for a pastel look.
    const baseSatBG = 30 + (o2 / 255) * 20;   // 30-50%
    const baseLightBG = 80 + (o3 / 255) * 15; // 80-95%
    // Cell color: opposite hue, high saturation, low lightness for high contrast.
    const baseHueCell = (baseHue + 180) % 360;
    const baseSatCell = 70 + (o4 / 255) * 30;  // 70-100%
    const baseLightCell = 20 + (o2 / 255) * 15; // 20-35%
    
    const highlightHue = (baseHueCell + 180) % 360;

    return {
        baseHue,
        background: `hsl(${baseHue}, ${baseSatBG}%, ${baseLightBG}%)`,
        cellColor:  `hsl(${baseHueCell}, ${baseSatCell}%, ${baseLightCell}%)`,
        highlight:  `hsl(${highlightHue}, 100%, 50%)`,
        baseSatBG,
        baseLightBG,
        baseHueCell,
        baseSatCell,
        baseLightCell,
    };
}

function ipToSeedProbability(ip) {
    const octets = parseIPv4(ip);
    if (!octets) return 0.5;
    // Just a simple approach
    const avg = (octets[1] + octets[2]) / 2;
    const norm = avg / 255;
    return 0.3 + 0.4 * norm;
}

// ===========================
//  CA TEXTURE CREATION
// ===========================
function createCATextureFromIP(ip) {
    const palette = generatePaletteFromIP(ip);
    const gridSize = 128;  // number of CA cells per row/column
    const cellSize = 4;    // pixel size for each cell
    // Create a canvas that’s larger than the grid so we can draw cell borders.
    const canvas = document.createElement('canvas');
    canvas.width = gridSize * cellSize;
    canvas.height = gridSize * cellSize;
    const ctx = canvas.getContext('2d');
    const seedProb = ipToSeedProbability(ip);

    // Create a grid with CA states
    function createGrid() {
        return new Array(gridSize).fill(0).map(() => new Array(gridSize).fill(CA_STATES.INACTIVE));
    }
    const caData = {
        current: createGrid(),
        next: createGrid()
    };

    // Initial random seeding
    for (let x = 0; x < gridSize; x++) {
        for (let y = 0; y < gridSize; y++) {
            caData.current[x][y] = Math.random() < seedProb ? CA_STATES.ACTIVE : CA_STATES.INACTIVE;
        }
    }

    // Re-draw the CA grid onto the canvas with optional hueShift.
    // Here we draw each cell as a square of size cellSize,
    // and for active cells we also draw a border using the highlight color.
    function updateTexture(hueShift = 0) {
        const hueBG = (palette.baseHue + hueShift) % 360;
        const hueCell = (palette.baseHueCell + hueShift) % 360;

        // Loop over grid cells
        for (let x = 0; x < gridSize; x++) {
            for (let y = 0; y < gridSize; y++) {
                const px = x * cellSize;
                const py = y * cellSize;
                if (caData.current[x][y] === CA_STATES.ACTIVE) {
                    ctx.fillStyle = `hsl(${hueCell}, ${palette.baseSatCell}%, ${palette.baseLightCell}%)`;
                    ctx.fillRect(px, py, cellSize, cellSize);
                    // Draw border for active cell to "amp" its visual effect:
                    ctx.strokeStyle = palette.highlight;
                    ctx.lineWidth = 1;
                    ctx.strokeRect(px, py, cellSize, cellSize);
                } else {
                    ctx.fillStyle = `hsl(${hueBG}, ${palette.baseSatBG}%, ${palette.baseLightBG}%)`;
                    ctx.fillRect(px, py, cellSize, cellSize);
                }
            }
        }
        if (texture) texture.needsUpdate = true;
    }

    let texture = new THREE.CanvasTexture(canvas);
    updateTexture(0);

    // Note: Removed or minimized emissive properties since we’re
    // now emphasizing cell borders via the texture.
    const material = new THREE.MeshStandardMaterial({
        map: texture,
        // emissive is not used now (or could be set to black)
        emissive: new THREE.Color(0x000000),
        emissiveIntensity: 0,
        roughness: 0.7,
        metalness: 0.3,
    });

    return { 
        material,
        caData,
        updateTexture,
        palette
    };
}

// ===========================
//  CA EVOLUTION (RULES)
// ===========================
function applyCARules(nodeMesh) {
    const { current, next } = nodeMesh.userData.caData;
    const size = current.length;
    const relationshipData = nodeMesh.userData.relationshipData;
    const dynamicProb = computeDynamicProbability(relationshipData);
    
    // Determine which rule set to use based on connected_to_count
    const ruleType = (relationshipData && relationshipData.connected_to_count >= 5) ? "highlife" : "conway";

    if (ruleType === "conway") {
        // Shift the survival range based on dynamicProb.
        const adjustment = Math.round((dynamicProb - 0.5) * 2);
        const survivalMin = Math.max(1, 2 + adjustment);
        const survivalMax = 3 + adjustment;
        for (let x = 0; x < size; x++) {
            for (let y = 0; y < size; y++) {
                let liveNeighbors = 0;
                for (let i = -1; i <= 1; i++) {
                    for (let j = -1; j <= 1; j++) {
                        if (i === 0 && j === 0) continue;
                        const nx = (x + i + size) % size;
                        const ny = (y + j + size) % size;
                        liveNeighbors += current[nx][ny];
                    }
                }
                if (current[x][y] === CA_STATES.ACTIVE) {
                    next[x][y] = (liveNeighbors >= survivalMin && liveNeighbors <= survivalMax)
                        ? CA_STATES.ACTIVE
                        : CA_STATES.INACTIVE;
                } else {
                    next[x][y] = (liveNeighbors === 3 || (liveNeighbors === 2 && Math.random() < dynamicProb))
                        ? CA_STATES.ACTIVE
                        : CA_STATES.INACTIVE;
                }
            }
        }
    } else {  // HighLife style if connected_to_count >= 5
        for (let x = 0; x < size; x++) {
            for (let y = 0; y < size; y++) {
                let liveNeighbors = 0;
                for (let i = -1; i <= 1; i++) {
                    for (let j = -1; j <= 1; j++) {
                        if (i === 0 && j === 0) continue;
                        const nx = (x + i + size) % size;
                        const ny = (y + j + size) % size;
                        liveNeighbors += current[nx][ny];
                    }
                }
                if (current[x][y] === CA_STATES.ACTIVE) {
                    next[x][y] = (liveNeighbors === 2 || liveNeighbors === 3) ? CA_STATES.ACTIVE : CA_STATES.INACTIVE;
                } else {
                    next[x][y] = (liveNeighbors === 3 || (liveNeighbors === 6 && Math.random() < dynamicProb))
                        ? CA_STATES.ACTIVE
                        : CA_STATES.INACTIVE;
                }
            }
        }
    }
    // Swap buffers.
    [nodeMesh.userData.caData.current, nodeMesh.userData.caData.next] = [next, current];
}

// ===========================
//  MAIN ENTRY: createCANode
// ===========================
export async function createCANode(targetIp) {
    const geometry = new THREE.SphereGeometry(2, 32, 32);
    const { material, caData, updateTexture, palette } = createCATextureFromIP(targetIp);
    const nodeMesh = new THREE.Mesh(geometry, material);
    console.log(`Initializing CA node for: ${targetIp}`);

    // Fetch scan data
    const scanData = await fetchScanData(targetIp);
    let hasWebPort = false;
    let asn = null;

    if (!scanData.error && Array.isArray(scanData)) {
        scanData.forEach(scan => {
            if (scan.type === 'portscan' && scan.ports) {
                const ports = scan.ports.toString().split(',').map(p => p.trim());
                if (ports.includes("80") || ports.includes("443")) {
                    hasWebPort = true;
                }
            }
            if (scan.type === 'bgpscan' && scan.asn) {
                asn = scan.asn;
            }
        });
    } else {
        console.warn(`No scan data found for ${targetIp}, using default settings.`);
    }

    // If no web port found, consider the node "barren"
    if (!hasWebPort) {
        caData.current.forEach(row => row.fill(CA_STATES.INACTIVE));
        console.log(`No web ports for ${targetIp}. CA simulation remains static.`);
    }

    console.log(`CA initialized for ${targetIp}.`);

    // Note: ASN emission adjustment is now replaced by our border effect,
    // so we are not adjusting emissive intensity here.
    if (asn) {
        console.log(`ASN ${asn} detected, using border accent instead of emissive effect.`);
    }
  
    // Fetch relationship data
    const relationshipData = await fetchRelationshipData(targetIp);
    nodeMesh.userData.relationshipData = relationshipData;
    if (relationshipData) {
        console.log(
            `Relationship data for ${targetIp}: connected_to_count=${relationshipData.connected_to_count}, traceroute_hop_count=${relationshipData.traceroute_hop_count}`
        );
    } else {
        console.log(`No relationship data for ${targetIp}. Using default CA rules.`);
    }

    // Store data in userData
    nodeMesh.userData.caData = caData;
    nodeMesh.userData.updateTexture = updateTexture;
    nodeMesh.userData.hueShift = 0;
    nodeMesh.userData.baseHue = palette.baseHue;

    // CA simulation step
    const SIMULATION_STEP = 100;
    let lastUpdate = performance.now();

    function updateCA(now) {
        const deltaTime = now - lastUpdate;
        if (hasWebPort && deltaTime >= SIMULATION_STEP) {
            // Apply CA rules
            applyCARules(nodeMesh);

            // Animate hue shift over time (e.g., 0.01 degrees per ms)
            const hueSpeed = 0.01;
            nodeMesh.userData.hueShift += (deltaTime * hueSpeed);

            // Redraw texture with the new hue shift (which also draws borders)
            nodeMesh.userData.updateTexture(nodeMesh.userData.hueShift);
            lastUpdate = now;
        }
        requestAnimationFrame(updateCA);
    }
    requestAnimationFrame(updateCA);

    return nodeMesh;
}

// Caching expiration (e.g., 1 hour)
const CACHE_EXPIRATION = 3600000;
const scanCache = {};

// ===========================
//  API-FETCHING LOGIC
// ===========================
async function fetchScanData(targetIp) {
    const now = Date.now();
    if (scanCache[targetIp] && (now - scanCache[targetIp].timestamp < CACHE_EXPIRATION)) {
        console.log(`Using cached scan data for ${targetIp}`);
        return scanCache[targetIp].data;
    }
    const stored = localStorage.getItem(`scanData_${targetIp}`);
    if (stored) {
        try {
            const parsed = JSON.parse(stored);
            if (now - parsed.timestamp < CACHE_EXPIRATION) {
                scanCache[targetIp] = { timestamp: parsed.timestamp, data: parsed.data };
                console.log(`Using localStorage scan data for ${targetIp}`);
                return parsed.data;
            }
        } catch (e) {
            console.error("Error parsing localStorage data:", e);
        }
    }
    const endpoint = 'http://192.168.0.11:5000';
    const apiUrl = `${endpoint}/get_scan_data?target_ip=${targetIp}`;
    console.log("Fetching scan data from:", apiUrl);
    try {
        const response = await fetch(apiUrl);
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
        const result = await response.json();
        console.log("Scan Data Received:", result);
        if (result.error) {
            console.error("Error in API response:", result.error);
            return { error: result.error };
        }
        const scans = result.scans || [];
        scanCache[targetIp] = { timestamp: now, data: scans };
        localStorage.setItem(`scanData_${targetIp}`, JSON.stringify({ timestamp: now, data: scans }));
        return scans;
    } catch (error) {
        console.error("Error fetching scan data:", error);
        return { error: "Failed to fetch scan data." };
    }
}

async function fetchRelationshipData(targetIp) {
    const now = Date.now();
    const cacheKey = `relationship_${targetIp}`;
    if (scanCache[cacheKey] && (now - scanCache[cacheKey].timestamp < CACHE_EXPIRATION)) {
        console.log(`Using cached relationship data for ${targetIp}`);
        return scanCache[cacheKey].data;
    }
    const stored = localStorage.getItem(`relationshipData_${targetIp}`);
    if (stored) {
        try {
            const parsed = JSON.parse(stored);
            if (now - parsed.timestamp < CACHE_EXPIRATION) {
                scanCache[cacheKey] = { timestamp: parsed.timestamp, data: parsed.data };
                console.log(`Using localStorage relationship data for ${targetIp}`);
                return parsed.data;
            }
        } catch (e) {
            console.error("Error parsing localStorage relationship data:", e);
        }
    }
    const endpoint = 'http://192.168.0.11:5000';
    const apiUrl = `${endpoint}/relationship_counts?target_ip=${targetIp}`;
    console.log("Fetching relationship data from:", apiUrl);
    try {
        const response = await fetch(apiUrl);
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
        const result = await response.json();
        console.log("Relationship Data Received:", result);
        if (result.error) {
            console.error("Error in API relationship response:", result.error);
            console.log(`Failed to fetch relationship data for ${targetIp}`);
            return null;
        }
        scanCache[cacheKey] = { timestamp: now, data: result };
        localStorage.setItem(`relationshipData_${targetIp}`, JSON.stringify({ timestamp: now, data: result }));
        return result;
    } catch (error) {
        console.error("Error fetching relationship data:", error);
        console.log(`Failed to fetch relationship data for ${targetIp}`);
        return null;
    }
}

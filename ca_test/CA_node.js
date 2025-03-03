import * as THREE from 'three';

// ===========================
//  API-FETCHING LOGIC
// ===========================
async function fetchNodeGenes(targetIp) {
    const endpoint = 'http://192.168.0.11:5000';
    const apiUrl = `${endpoint}/node_genes?node_id=${targetIp}`;
    
    try {
        const response = await fetch(apiUrl);
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
        const result = await response.json();
        console.log(`Received genes for ${targetIp}:`, result.genes);
        return result.genes;
    } catch (error) {
        console.error("Error fetching node genes:", error);
        return null;
    }
}
async function fetchGeneticallyRelatedNodes(targetIp) {
    const endpoint = 'http://192.168.0.11:5000';
    const apiUrl = `${endpoint}/node_genes/related?node_id=${targetIp}`;
    
    try {
        const response = await fetch(apiUrl);
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
        const result = await response.json();
        
        console.log(`Genetically related nodes for ${targetIp}:`, result);
        return result.related_nodes || [];
    } catch (error) {
        console.error("Error fetching genetically related nodes:", error);
        return [];
    }
}
const CACHE_EXPIRATION = 3600000;
const relationshipCache = {};

async function fetchRelationshipData(targetIp) {
    const now = Date.now();
    const cacheKey = `relationship_${targetIp}`;
    if (relationshipCache[cacheKey] && (now - relationshipCache[cacheKey].timestamp < CACHE_EXPIRATION)) {
        console.log(`Using cached relationship data for ${targetIp}`);
        return relationshipCache[cacheKey].data;
    }
    const stored = localStorage.getItem(`relationshipData_${targetIp}`);
    if (stored) {
        try {
            const parsed = JSON.parse(stored);
            if (now - parsed.timestamp < CACHE_EXPIRATION) {
                relationshipCache[cacheKey] = { timestamp: parsed.timestamp, data: parsed.data };
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
        relationshipCache[cacheKey] = { timestamp: now, data: result };
        localStorage.setItem(`relationshipData_${targetIp}`, JSON.stringify({ timestamp: now, data: result }));
        return result;
    } catch (error) {
        console.error("Error fetching relationship data:", error);
        console.log(`Failed to fetch relationship data for ${targetIp}`);
        return null;
    }
}
async function triggerGeneEvolution(sourceId, targetId, interactionType = "CONNECTED_TO") {
    const endpoint = 'http://192.168.0.11:5000';
    const apiUrl = `${endpoint}/node_genes/evolve`;
    
    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                source_id: sourceId,
                target_id: targetId,
                interaction_type: interactionType
            })
        });
        
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
        const result = await response.json();
        
        console.log(`Evolution between ${sourceId} and ${targetId}:`, result);
        
        if (result.success) {
            // Update node genes locally
            const sourceNode = findNodeById(sourceId);
            const targetNode = findNodeById(targetId);
            
            if (sourceNode) {
                sourceNode.userData.genes = result.source.genes;
                console.log(`Updated genes for ${sourceId}`);
            }
            
            if (targetNode) {
                targetNode.userData.genes = result.target.genes;
                console.log(`Updated genes for ${targetId}`);
            }
            
            return true;
        }
        
        return false;
    } catch (error) {
        console.error("Error triggering gene evolution:", error);
        return false;
    }
}

// Helper function to find a node in the scene
function findNodeById(id) {
    // This would need to be implemented based on how your nodes are stored
    // For example, if all your nodes are in a global array:
    return window.networkNodes.find(node => node.userData.targetIp === id);
}
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
//  MAIN ENTRY: createCANode
// ===========================
export async function createCANode(targetIp) {
    const geometry = new THREE.SphereGeometry(2, 32, 32);
    console.log(`Initializing CA node for: ${targetIp}`);

    // Fetch genetic data from backend
    const genes = await fetchNodeGenes(targetIp);
    
    let material, caData, updateTexture;
    
    if (genes) {
        console.log(`Using genetic data for ${targetIp}`);
        
        // Create CA system based on genes
        const result = createGeneticCA(
            targetIp,
            genes.ca_rules.birth,
            genes.ca_rules.survival,
            genes.ca_rules.neighbors,
            genes.visual.hue_base,
            genes.visual.pattern_type,
            genes.visual.texture_density
        );
        
        material = result.material;
        caData = result.caData;
        updateTexture = result.updateTexture;
    } else {
        // Fallback to original method if gene fetch fails
        console.log(`Falling back to local generation for ${targetIp}`);
        const result = createCATextureFromIP(targetIp);
        material = result.material;
        caData = result.caData;
        updateTexture = result.updateTexture;
    }
    
    const nodeMesh = new THREE.Mesh(geometry, material);
    
    // Fetch relationship data (still needed for visualizing connections)
    const relationshipData = await fetchRelationshipData(targetIp);
    nodeMesh.userData.relationshipData = relationshipData;
    
    // Store data in userData
    nodeMesh.userData.caData = caData;
    nodeMesh.userData.updateTexture = updateTexture;
    nodeMesh.userData.genes = genes;
    nodeMesh.userData.targetIp = targetIp;
    nodeMesh.userData.hueShift = 0;
    nodeMesh.userData.accumulatedTime = 0;
    
    // Set evolution parameters from genes
    nodeMesh.userData.evolutionSpeed = genes ? genes.behavior.evolution_speed : 1.0;
    
    // CA simulation step
    let lastTime = performance.now();

    function updateCA(now) {
        const deltaTime = now - lastTime;
        lastTime = now;
        
        // Use the gene-based evolution instead of the old applyCARules
        updateCANode(nodeMesh, deltaTime);
        
        requestAnimationFrame(updateCA);
    }
    requestAnimationFrame(updateCA);

    return nodeMesh;
}

function createGeneticCA(targetIp, birthRules, survivalRules, neighborhoodType, hueBase, patternType, textureDensity) {
    // Create a canvas for the CA texture
    const gridSize = 128;
    const cellSize = 4;
    const canvas = document.createElement('canvas');
    canvas.width = gridSize * cellSize;
    canvas.height = gridSize * cellSize;
    const ctx = canvas.getContext('2d');
    
    // Create grid with CA states
    function createGrid() {
        return new Array(gridSize).fill(0).map(() => new Array(gridSize).fill(0));
    }
    
    const caData = {
        current: createGrid(),
        next: createGrid()
    };
    
    // Setup initial pattern based on patternType
    initializePattern(caData.current, patternType, textureDensity, targetIp);
    
    // Create the texture and material
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.MeshStandardMaterial({
        map: texture,
        emissive: new THREE.Color(`hsl(${hueBase}, 100%, 50%)`),
        emissiveIntensity: 0.2,
        roughness: 0.7,
        metalness: 0.3
    });
    
    // Function to update the texture based on CA state
    function updateTexture(hueShift = 0) {
        const hueBG = (hueBase + hueShift) % 360;
        const hueCell = (hueBase + 180 + hueShift) % 360;
        
        // Draw cells
        for (let x = 0; x < gridSize; x++) {
            for (let y = 0; y < gridSize; y++) {
                const px = x * cellSize;
                const py = y * cellSize;
                if (caData.current[x][y] === 1) {
                    ctx.fillStyle = `hsl(${hueCell}, 90%, 30%)`;
                    ctx.fillRect(px, py, cellSize, cellSize);
                    
                    // Draw border for active cells
                    ctx.strokeStyle = `hsl(${(hueCell + 60) % 360}, 100%, 50%)`;
                    ctx.lineWidth = 1;
                    ctx.strokeRect(px, py, cellSize, cellSize);
                } else {
                    ctx.fillStyle = `hsl(${hueBG}, 40%, 85%)`;
                    ctx.fillRect(px, py, cellSize, cellSize);
                }
            }
        }
        
        texture.needsUpdate = true;
    }
    
    // Initial draw
    updateTexture(0);
    
    return { material, caData, updateTexture };
}
function createDatabasePattern(grid, size, density) {
    // Clear grid
    for (let x = 0; x < size; x++) {
        for (let y = 0; y < size; y++) {
            grid[x][y] = 0;
        }
    }
    
    // Create a dense core
    const center = Math.floor(size / 2);
    const coreSize = Math.floor(size * 0.3);
    
    for (let x = center - coreSize; x <= center + coreSize; x++) {
        for (let y = center - coreSize; y <= center + coreSize; y++) {
            if (x >= 0 && x < size && y >= 0 && y < size) {
                // Higher probability near the center
                const dx = x - center;
                const dy = y - center;
                const dist = Math.sqrt(dx*dx + dy*dy);
                const prob = density * (1 - dist / (coreSize * 1.5));
                if (Math.random() < prob) {
                    grid[x][y] = 1;
                }
            }
        }
    }
    
    // Add some structured elements (database rows)
    const rowSpacing = Math.floor(size / 20);
    for (let y = center - coreSize; y <= center + coreSize; y += rowSpacing) {
        for (let x = center - coreSize; x <= center + coreSize; x++) {
            if (x >= 0 && x < size && y >= 0 && y < size) {
                if (Math.random() < density * 1.5) {
                    grid[x][y] = 1;
                }
            }
        }
    }
}
function createExternalPattern(grid, size, density) {
    // Clear grid
    for (let x = 0; x < size; x++) {
        for (let y = 0; y < size; y++) {
            grid[x][y] = 0;
        }
    }
    
    // Create scattered islands
    const numIslands = Math.floor(10 * density);
    
    for (let i = 0; i < numIslands; i++) {
        const centerX = Math.floor(Math.random() * size);
        const centerY = Math.floor(Math.random() * size);
        const islandSize = Math.floor(Math.random() * size * 0.1) + 5;
        
        for (let x = centerX - islandSize; x <= centerX + islandSize; x++) {
            for (let y = centerY - islandSize; y <= centerY + islandSize; y++) {
                if (x >= 0 && x < size && y >= 0 && y < size) {
                    const dx = x - centerX;
                    const dy = y - centerY;
                    const dist = Math.sqrt(dx*dx + dy*dy);
                    if (dist < islandSize && Math.random() < density) {
                        grid[x][y] = 1;
                    }
                }
            }
        }
    }
}
function createWebPattern(grid, size, density) {
    // Clear grid
    for (let x = 0; x < size; x++) {
        for (let y = 0; y < size; y++) {
            grid[x][y] = 0;
        }
    }
    
    // Create a grid-like pattern
    const spacing = Math.floor(size / 12);
    
    // Horizontal lines
    for (let y = spacing; y < size; y += spacing) {
        for (let x = 0; x < size; x++) {
            if (Math.random() < density * 1.5) { // Increase density by 50%
                grid[x][y] = 1;
            }
        }
    }
    
    // Vertical lines
    for (let x = spacing; x < size; x += spacing) {
        for (let y = 0; y < size; y++) {
            if (Math.random() < density * 1.5) { // Increase density by 50%
                grid[x][y] = 1;
            }
        }
    }
    
    // Add more noise for web patterns
    for (let x = 0; x < size; x++) {
        for (let y = 0; y < size; y++) {
            if (grid[x][y] === 0 && Math.random() < density * 0.2) { // Double the noise
                grid[x][y] = 1;
            }
        }
    }
    
    // Ensure some minimum active cells
    let activeCellCount = 0;
    for (let x = 0; x < size; x++) {
        for (let y = 0; y < size; y++) {
            if (grid[x][y] === 1) {
                activeCellCount++;
            }
        }
    }
    
    const minActiveCell = Math.floor(size * size * 0.05); // At least 5% of cells should be active
    if (activeCellCount < minActiveCell) {
        console.log(`Adding more cells to reach minimum threshold (${activeCellCount}/${minActiveCell})`);
        while (activeCellCount < minActiveCell) {
            const x = Math.floor(Math.random() * size);
            const y = Math.floor(Math.random() * size);
            if (grid[x][y] === 0) {
                grid[x][y] = 1;
                activeCellCount++;
            }
        }
    }
}

function createASNPattern(grid, size, density) {
    // Clear grid
    for (let x = 0; x < size; x++) {
        for (let y = 0; y < size; y++) {
            grid[x][y] = 0;
        }
    }
    
    // Create a network-like structure
    const numNodes = Math.floor(20 * density);
    const nodes = [];
    
    // Create random nodes
    for (let i = 0; i < numNodes; i++) {
        nodes.push({
            x: Math.floor(Math.random() * size),
            y: Math.floor(Math.random() * size)
        });
    }
    
    // Make each node a small active area
    for (const node of nodes) {
        const nodeSize = Math.floor(Math.random() * 5) + 3;
        
        for (let x = node.x - nodeSize; x <= node.x + nodeSize; x++) {
            for (let y = node.y - nodeSize; y <= node.y + nodeSize; y++) {
                if (x >= 0 && x < size && y >= 0 && y < size) {
                    const dx = x - node.x;
                    const dy = y - node.y;
                    const dist = Math.sqrt(dx*dx + dy*dy);
                    if (dist < nodeSize) {
                        grid[x][y] = 1;
                    }
                }
            }
        }
    }
    
    // Connect nodes with lines
    for (let i = 0; i < nodes.length; i++) {
        const node1 = nodes[i];
        
        // Connect to several random nodes
        const connections = Math.floor(Math.random() * 3) + 1;
        for (let c = 0; c < connections; c++) {
            const j = Math.floor(Math.random() * nodes.length);
            if (i !== j) {
                const node2 = nodes[j];
                
                // Draw a line between nodes
                const steps = Math.floor(Math.sqrt(
                    Math.pow(node1.x - node2.x, 2) + 
                    Math.pow(node1.y - node2.y, 2)
                ));
                
                for (let s = 0; s <= steps; s++) {
                    const x = Math.floor(node1.x + (node2.x - node1.x) * (s / steps));
                    const y = Math.floor(node1.y + (node2.y - node1.y) * (s / steps));
                    
                    if (x >= 0 && x < size && y >= 0 && y < size) {
                        grid[x][y] = 1;
                    }
                }
            }
        }
    }
}
// Pattern creator functions for different node types
function createRouterPattern(grid, size, density) {
    // Clear grid
    for (let x = 0; x < size; x++) {
        for (let y = 0; y < size; y++) {
            grid[x][y] = 0;
        }
    }
    
    // Create a central core
    const center = Math.floor(size / 2);
    const coreSize = Math.floor(size * 0.15);
    
    for (let x = center - coreSize; x <= center + coreSize; x++) {
        for (let y = center - coreSize; y <= center + coreSize; y++) {
            if (x >= 0 && x < size && y >= 0 && y < size) {
                grid[x][y] = 1;
            }
        }
    }
    
    // Create radiating lines
    const numLines = 8;
    const angleStep = (2 * Math.PI) / numLines;
    
    for (let i = 0; i < numLines; i++) {
        const angle = i * angleStep;
        const length = Math.floor(size * 0.4);
        
        for (let r = coreSize; r < length; r++) {
            const x = Math.floor(center + r * Math.cos(angle));
            const y = Math.floor(center + r * Math.sin(angle));
            
            if (x >= 0 && x < size && y >= 0 && y < size) {
                grid[x][y] = 1;
            }
        }
    }
}
async function createCANodeFromGenes(targetIp) {
    // Fetch genes from our backend
    const genes = await fetchNodeGenes(targetIp);
    
    if (!genes) {
        console.error(`Failed to fetch genes for ${targetIp}, using fallback node`);
    }
    
    const geometry = new THREE.SphereGeometry(2, 32, 32);
    
    // Extract CA rules from genes
    const birthRules = genes.ca_rules.birth;
    const survivalRules = genes.ca_rules.survival;
    const neighborhoodType = genes.ca_rules.neighbors;
    
    // Extract visual properties
    const hueBase = genes.visual.hue_base;
    const patternType = genes.visual.pattern_type;
    const textureDensity = genes.visual.texture_density;
    
    // Extract behavior properties
    const evolutionSpeed = genes.behavior.evolution_speed;
    const mutationRate = genes.behavior.mutation_rate;
    
    // Create CA system based on these genes
    const { material, caData, updateTexture } = createGeneticCA(
        targetIp, 
        birthRules, 
        survivalRules, 
        neighborhoodType,
        hueBase,
        patternType,
        textureDensity
    );
    
    const nodeMesh = new THREE.Mesh(geometry, material);
    
    // Store gene data and CA system in userData
    nodeMesh.userData = {
        caData,
        updateTexture,
        genes,
        targetIp,
        evolutionSpeed
    };
    
    return nodeMesh;
}

function initializePattern(grid, patternType, density, ip) {
    const size = grid.length;
    
    switch (patternType) {
        case "router_pattern":
            // Create a central core with radiating patterns
            createRouterPattern(grid, size, density);
            break;
        
        case "web_pattern":
            // Create a grid-like pattern with connections
            createWebPattern(grid, size, density);
            break;
        
        case "database_pattern":
            // Create a dense, stable core pattern
            createDatabasePattern(grid, size, density);
            break;
        
        case "external_pattern":
            // Create scattered islands of activity
            createExternalPattern(grid, size, density);
            break;
        
        case "asn_pattern":
            // Create a network-like pattern
            createASNPattern(grid, size, density);
            break;
            
        default:
            // Default random seeding
            for (let x = 0; x < size; x++) {
                for (let y = 0; y < size; y++) {
                    grid[x][y] = Math.random() < density ? 1 : 0;
                }
            }
    }
}
// ===========================
//  CA EVOLUTION (RULES)
// ===========================

function applyGeneBasedEvolution(nodeMesh) {
    const { current, next } = nodeMesh.userData.caData;
    const size = current.length;
    const genes = nodeMesh.userData.genes;
    
    // Default rules if no genes
    const birthRules = genes ? genes.ca_rules.birth : [3];
    const survivalRules = genes ? genes.ca_rules.survival : [2, 3];
    const useVonNeumann = genes ? genes.ca_rules.neighbors === "von_neumann" : false;
    
    for (let x = 0; x < size; x++) {
        for (let y = 0; y < size; y++) {
            let liveNeighbors = 0;
            
            // Count neighbors based on neighborhood type
            if (useVonNeumann) {
                // Von Neumann neighborhood (4 adjacent cells)
                const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];
                for (const [dx, dy] of directions) {
                    const nx = (x + dx + size) % size;
                    const ny = (y + dy + size) % size;
                    liveNeighbors += current[nx][ny];
                }
            } else {
                // Moore neighborhood (8 surrounding cells)
                for (let i = -1; i <= 1; i++) {
                    for (let j = -1; j <= 1; j++) {
                        if (i === 0 && j === 0) continue;
                        const nx = (x + i + size) % size;
                        const ny = (y + j + size) % size;
                        liveNeighbors += current[nx][ny];
                    }
                }
            }
            
            // Apply birth and survival rules
            if (current[x][y] === 1) {
                // Cell is alive - check survival rules
                next[x][y] = survivalRules.some(rule => rule === liveNeighbors) ? 1 : 0;
            } else {
                // Cell is dead - check birth rules
                next[x][y] = birthRules.some(rule => rule === liveNeighbors) ? 1 : 0;
            }
        }
    }
    
    // Swap buffers
    [nodeMesh.userData.caData.current, nodeMesh.userData.caData.next] = [next, current];
}
// Main update function for CA simulation
function updateCANode(nodeMesh, deltaTime) {
    const evolutionSpeed = nodeMesh.userData.evolutionSpeed || 1.0;
    nodeMesh.userData.accumulatedTime = (nodeMesh.userData.accumulatedTime || 0) + deltaTime;
    
    // Determine update interval based on evolution speed
    const updateInterval = 100 / evolutionSpeed;
    
    if (nodeMesh.userData.accumulatedTime >= updateInterval) {
        // Apply CA rules
        applyGeneBasedEvolution(nodeMesh);
        
        // Update hue shift
        nodeMesh.userData.hueShift = (nodeMesh.userData.hueShift || 0) + 0.5;
        
        // Redraw texture
        nodeMesh.userData.updateTexture(nodeMesh.userData.hueShift);
        
        // Reset accumulated time
        nodeMesh.userData.accumulatedTime = 0;
    }
}

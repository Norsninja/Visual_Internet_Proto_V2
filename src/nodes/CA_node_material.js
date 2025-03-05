// CA_node_material.js - FIXED VERSION
// Extracted and optimized from CA_node.js for use in network visualization

import * as THREE from 'three';
import { RequestQueue } from './request_queue.js';
// ===========================
//  CACHE MANAGEMENT
// ===========================
const geneCache = {};
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
window.caVisualizationEnabled = false;

// Global CA nodes manager to handle updates
if (!window.caNodesManager) {
    window.caNodesManager = {
        nodes: [],
        initialized: false,
        lastUpdate: performance.now(),
        
        registerNode(node) {
            // Avoid duplicates
            if (!this.nodes.includes(node)) {
                this.nodes.push(node);
            }
            
            // Start update loop if not already running
            if (!this.initialized) {
                this.initialized = true;
                // requestAnimationFrame(this.update.bind(this));
            }
        },
        
        unregisterNode(node) {
            const index = this.nodes.indexOf(node);
            if (index !== -1) {
                this.nodes.splice(index, 1);
            }
        },
        
        update(currentTime) {
            const deltaTime = currentTime - this.lastUpdate;
            this.lastUpdate = currentTime;
            
            // Only update CA materials if visualization is enabled
            if (window.caVisualizationEnabled) {
                for (const node of this.nodes) {
                    if (node.material && node.material.userData.caData) {
                        updateCAMaterial(node.material, deltaTime);
                    }
                }
            }
            
            // requestAnimationFrame(this.update.bind(this));
        }
    };
}

// Function to toggle CA visualization state
export function setCAVisualizationEnabled(enabled) {
    window.caVisualizationEnabled = enabled;
    console.log(`CA Visualization ${enabled ? 'Enabled' : 'Disabled'}`);
    
    // Optional: When enabling after being disabled, refresh all textures
    if (enabled) {
        for (const node of window.caNodesManager.nodes) {
            if (node.material && node.material.userData.caData) {
                // Force texture update
                node.material.userData.updateTexture(node.material.userData.hueShift || 0);
            }
        }
    }
}

// ===========================
//  API-FETCHING LOGIC
// ===========================
// Ensure we have a requestQueue - FIXED VERSION
function ensureRequestQueue() {
    if (!window.requestQueue) {
        console.warn("Request queue not found on window, creating a new one");
        window.requestQueue = new RequestQueue();
        console.log("✅ Request queue initialized from CA_node_material.js");
    }
    return window.requestQueue;
}

async function fetchNodeGenes(nodeId) {
    console.log(`🚨🚨🚨 CALLED fetchNodeGenes for ${nodeId}`);
    
    // Check cache first
    const now = Date.now();
    if (geneCache[nodeId] && now - geneCache[nodeId].timestamp < CACHE_DURATION) {
        console.log(`Using cached genes for ${nodeId}`);
        return geneCache[nodeId].genes;
    }
    
    const endpoint = 'http://192.168.0.11:5000';
    const apiUrl = `${endpoint}/node_genes?node_id=${nodeId}`;
    
    console.log(`🔍 Making direct API call to: ${apiUrl}`);
    
    try {
        // Direct fetch approach for debugging
        const response = await fetch(apiUrl);
        console.log(`Fetch response status: ${response.status}`);
        
        if (!response.ok) {
            throw new Error(`Request failed with status ${response.status}`);
        }
        
        const result = await response.json();
        console.log(`Got result from API:`, result);
        
        if (!result.genes) {
            console.warn(`Response missing genes data for ${nodeId}:`, result);
            return null;
        }
        
        // Cache the result
        geneCache[nodeId] = {
            genes: result.genes,
            timestamp: now
        };
        
        console.log(`Received genes for ${nodeId}:`, result.genes);
        return result.genes;
    } catch (error) {
        console.error(`Error in fetchNodeGenes for ${nodeId}:`, error);
        return null;
    }
}

// ===========================
//  IP-BASED COLOR & SEEDING
// ===========================
function parseIPv4(ip) {
    // Handle non-IP identifiers gracefully
    if (!ip || typeof ip !== 'string' || !ip.includes('.')) {
        console.warn("Invalid IPv4 format, using fallback:", ip);
        return [127, 0, 0, 1]; // Fallback to localhost IP octets
    }

    const octets = ip.split('.').map(Number);
    if (octets.length !== 4 || octets.some(isNaN)) {
        console.warn("Invalid IPv4 address format:", ip);
        return [127, 0, 0, 1]; // Fallback
    }
    return octets;
}

function generatePaletteFromIP(ip) {
    const octets = parseIPv4(ip);
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
    // Create a canvas that's larger than the grid so we can draw cell borders.
    const canvas = document.createElement('canvas');
    canvas.width = gridSize * cellSize;
    canvas.height = gridSize * cellSize;
    const ctx = canvas.getContext('2d');
    const seedProb = ipToSeedProbability(ip);

    // Create a grid with CA states
    function createGrid() {
        return new Array(gridSize).fill(0).map(() => new Array(gridSize).fill(0));
    }
    
    const caData = {
        current: createGrid(),
        next: createGrid(),
        lastUpdate: performance.now(),
        accumulatedTime: 0,
        hueShift: 0
    };

    // Initial random seeding
    for (let x = 0; x < gridSize; x++) {
        for (let y = 0; y < gridSize; y++) {
            caData.current[x][y] = Math.random() < seedProb ? 1 : 0;
        }
    }

    // Re-draw the CA grid onto the canvas with optional hueShift
    function updateTexture(hueShift = 0) {
        const hueBG = (palette.baseHue + hueShift) % 360;
        const hueCell = (palette.baseHueCell + hueShift) % 360;

        // Loop over grid cells
        for (let x = 0; x < gridSize; x++) {
            for (let y = 0; y < gridSize; y++) {
                const px = x * cellSize;
                const py = y * cellSize;
                if (caData.current[x][y] === 1) {
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
        texture.needsUpdate = true;
    }

    let texture = new THREE.CanvasTexture(canvas);
    updateTexture(0);

    const material = new THREE.MeshStandardMaterial({
        map: texture,
        emissive: new THREE.Color(0x000000),
        emissiveIntensity: 0,
        roughness: 0.7,
        metalness: 0.3,
    });

    // Store CA data and functions in material userData for animation updates
    material.userData = {
        caData,
        updateTexture,
        palette,
        evolutionSpeed: 1.0,
        hueShift: 0
    };

    return material;
}

function createGeneticCAMaterial(nodeId, genes) {
    // Create a canvas for the CA texture
    const gridSize = 128;
    const cellSize = 4;
    const canvas = document.createElement('canvas');
    canvas.width = gridSize * cellSize;
    canvas.height = gridSize * cellSize;
    const ctx = canvas.getContext('2d');
    
    // Extract parameters from genes or use defaults
    const birthRules = genes ? genes.ca_rules.birth : [3];
    const survivalRules = genes ? genes.ca_rules.survival : [2, 3];
    const useVonNeumann = genes ? genes.ca_rules.neighbors === "von_neumann" : false;
    const hueBase = genes ? genes.visual.hue_base : Math.floor(Math.random() * 360);
    const patternType = genes ? genes.visual.pattern_type : "random";
    const textureDensity = genes ? genes.visual.texture_density : 0.5;
    
    // Create grid with CA states
    function createGrid() {
        return new Array(gridSize).fill(0).map(() => new Array(gridSize).fill(0));
    }
    
    const caData = {
        current: createGrid(),
        next: createGrid(),
        lastUpdate: performance.now(),
        accumulatedTime: 0,
        hueShift: 0
    };
    
    // Setup initial pattern based on patternType
    initializePattern(caData.current, patternType, textureDensity, nodeId);
    
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
    
    // Store CA data and functions in material userData for animation updates
    material.userData = {
        caData,
        updateTexture,
        birthRules,
        survivalRules,
        useVonNeumann,
        evolutionSpeed: genes ? genes.behavior.evolution_speed : 1.0,
        hueShift: 0,
        genes
    };
    
    return material;
}

// ===========================
//  PATTERN INITIALIZATION
// ===========================
function initializePattern(grid, patternType, density, nodeId) {
    const size = grid.length;
    
    switch (patternType) {
        case "router_pattern":
            createRouterPattern(grid, size, density);
            break;
        case "web_pattern":
            createWebPattern(grid, size, density);
            break;
        case "database_pattern":
            createDatabasePattern(grid, size, density);
            break;
        case "external_pattern":
            createExternalPattern(grid, size, density);
            break;
        case "asn_pattern":
            createASNPattern(grid, size, density);
            break;
        case "gateway_pattern":
            createGatewayPattern(grid, size, density);
            break;
        case "load_balancer_pattern":
            createLoadBalancerPattern(grid, size, density);
            break;
        case "database_cluster_pattern":
            createDatabaseClusterPattern(grid, size, density);
            break;
        case "cdn_pattern":
            createCDNPattern(grid, size, density);
            break;
        case "iot_pattern":
            createIoTPattern(grid, size, density);
            break;
        case "glider_factory":
            createGliderFactoryPattern(grid, size, density);
            break;
        case "oscillator":
            createOscillatorPattern(grid, size, density);
            break;
        case "stable_core":
            createStableCorePattern(grid, size, density);
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
//  PATTERN CREATION FUNCTIONS
// ===========================
function createOscillatorPattern(grid, size, density) {
    // Clear grid
    for (let x = 0; x < size; x++) {
        for (let y = 0; y < size; y++) {
            grid[x][y] = 0;
        }
    }
    
    // Classic oscillators from Conway's Game of Life
    const center = Math.floor(size / 2);
    
    // Blinker (period 2 oscillator)
    if (density < 0.33) {
        // Vertical blinker
        grid[center][center - 1] = 1;
        grid[center][center] = 1;
        grid[center][center + 1] = 1;
    } 
    // Toad (period 2 oscillator)
    else if (density < 0.66) {
        grid[center][center] = 1;
        grid[center][center + 1] = 1;
        grid[center][center + 2] = 1;
        grid[center + 1][center - 1] = 1;
        grid[center + 1][center] = 1;
        grid[center + 1][center + 1] = 1;
    } 
    // Beacon (period 2 oscillator)
    else {
        // Top left square
        grid[center - 1][center - 1] = 1;
        grid[center - 1][center] = 1;
        grid[center][center - 1] = 1;
        
        // Bottom right square
        grid[center + 1][center + 1] = 1;
        grid[center + 1][center] = 1;
        grid[center][center + 1] = 1;
    }
}
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

// Add other specialized patterns from genes.js
function createGatewayPattern(grid, size, density) {
    createRouterPattern(grid, size, density);
    // Enhance with more complex patterns
    const center = Math.floor(size / 2);
    
    // Add some denser regions
    for (let i = 0; i < 4; i++) {
        const regionX = Math.floor(Math.random() * size * 0.6) + size * 0.2;
        const regionY = Math.floor(Math.random() * size * 0.6) + size * 0.2;
        const regionSize = Math.floor(size * 0.15);
        
        for (let x = regionX - regionSize; x <= regionX + regionSize; x++) {
            for (let y = regionY - regionSize; y <= regionY + regionSize; y++) {
                if (x >= 0 && x < size && y >= 0 && y < size) {
                    const dx = x - regionX;
                    const dy = y - regionY;
                    const dist = Math.sqrt(dx*dx + dy*dy);
                    if (dist < regionSize && Math.random() < density * 1.2) {
                        grid[x][y] = 1;
                    }
                }
            }
        }
    }
}

function createLoadBalancerPattern(grid, size, density) {
    // Clear grid
    for (let x = 0; x < size; x++) {
        for (let y = 0; y < size; y++) {
            grid[x][y] = 0;
        }
    }
    
    // Create central distribution point
    const center = Math.floor(size / 2);
    const coreSize = Math.floor(size * 0.1);
    
    for (let x = center - coreSize; x <= center + coreSize; x++) {
        for (let y = center - coreSize; y <= center + coreSize; y++) {
            if (x >= 0 && x < size && y >= 0 && y < size) {
                grid[x][y] = 1;
            }
        }
    }
    
    // Create connected nodes in a distributed pattern
    const numNodes = Math.floor(5 + 5 * density);
    
    for (let i = 0; i < numNodes; i++) {
        const angle = (2 * Math.PI * i) / numNodes;
        const distance = Math.floor(size * 0.3);
        const nodeX = center + Math.cos(angle) * distance;
        const nodeY = center + Math.sin(angle) * distance;
        const nodeSize = Math.floor(size * 0.05) + 2;
        
        // Create node
        for (let x = nodeX - nodeSize; x <= nodeX + nodeSize; x++) {
            for (let y = nodeY - nodeSize; y <= nodeY + nodeSize; y++) {
                if (x >= 0 && x < size && y >= 0 && y < size) {
                    const dx = x - nodeX;
                    const dy = y - nodeY;
                    const dist = Math.sqrt(dx*dx + dy*dy);
                    if (dist < nodeSize) {
                        grid[x][y] = 1;
                    }
                }
            }
        }
        
        // Connect to center
        const steps = Math.floor(distance);
        for (let s = 0; s <= steps; s += 2) {
            const x = Math.floor(center + (nodeX - center) * (s / steps));
            const y = Math.floor(center + (nodeY - center) * (s / steps));
            
            if (x >= 0 && x < size && y >= 0 && y < size) {
                grid[x][y] = 1;
            }
        }
    }
}

function createDatabaseClusterPattern(grid, size, density) {
    // Start with a basic database pattern
    createDatabasePattern(grid, size, density);
    
    // Add connections between database nodes
    const center = Math.floor(size / 2);
    const nodePositions = [];
    
    // Create satellites
    for (let i = 0; i < 3; i++) {
        const angle = (2 * Math.PI * i) / 3;
        const distance = Math.floor(size * 0.25);
        const nodeX = center + Math.cos(angle) * distance;
        const nodeY = center + Math.sin(angle) * distance;
        
        nodePositions.push({ x: nodeX, y: nodeY });
        
        // Create smaller database pattern at this position
        const nodeSize = Math.floor(size * 0.1);
        for (let x = nodeX - nodeSize; x <= nodeX + nodeSize; x++) {
            for (let y = nodeY - nodeSize; y <= nodeY + nodeSize; y++) {
                if (x >= 0 && x < size && y >= 0 && y < size) {
                    const dx = x - nodeX;
                    const dy = y - nodeY;
                    const dist = Math.sqrt(dx*dx + dy*dy);
                    if (dist < nodeSize && Math.random() < density) {
                        grid[x][y] = 1;
                    }
                }
            }
        }
    }
    
    // Connect all nodes in a mesh
    for (let i = 0; i < nodePositions.length; i++) {
        for (let j = i + 1; j < nodePositions.length; j++) {
            const node1 = nodePositions[i];
            const node2 = nodePositions[j];
            
            // Draw connecting line
            const steps = Math.floor(Math.sqrt(
                Math.pow(node1.x - node2.x, 2) + 
                Math.pow(node1.y - node2.y, 2)
            ));
            
            for (let s = 0; s <= steps; s += 2) {
                const x = Math.floor(node1.x + (node2.x - node1.x) * (s / steps));
                const y = Math.floor(node1.y + (node2.y - node1.y) * (s / steps));
                
                if (x >= 0 && x < size && y >= 0 && y < size) {
                    grid[x][y] = 1;
                }
            }
        }
    }
}

function createCDNPattern(grid, size, density) {
    // Implement other pattern functions (createCDNPattern, createIoTPattern, etc.)
    // as they are in your original file...
    // I'm omitting them for brevity in this example
    
    // Clear grid
    for (let x = 0; x < size; x++) {
        for (let y = 0; y < size; y++) {
            grid[x][y] = 0;
        }
    }
    
    // Create distributed edge nodes
    const numNodes = 10;
    const edgeDistance = Math.floor(size * 0.4);
    const center = Math.floor(size / 2);
    
    // Create central source
    const sourceSize = Math.floor(size * 0.1);
    for (let x = center - sourceSize; x <= center + sourceSize; x++) {
        for (let y = center - sourceSize; y <= center + sourceSize; y++) {
            if (x >= 0 && x < size && y >= 0 && y < size) {
                const dx = x - center;
                const dy = y - center;
                const dist = Math.sqrt(dx*dx + dy*dy);
                if (dist < sourceSize) {
                    grid[x][y] = 1;
                }
            }
        }
    }
    
    // Create edge nodes
    for (let i = 0; i < numNodes; i++) {
        const angle = (2 * Math.PI * i) / numNodes;
        const nodeX = center + Math.cos(angle) * edgeDistance;
        const nodeY = center + Math.sin(angle) * edgeDistance;
        const nodeSize = Math.floor(size * 0.05) + 2;
        
        // Create node
        for (let x = nodeX - nodeSize; x <= nodeX + nodeSize; x++) {
            for (let y = nodeY - nodeSize; y <= nodeY + nodeSize; y++) {
                if (x >= 0 && x < size && y >= 0 && y < size) {
                    const dx = x - nodeX;
                    const dy = y - nodeY;
                    const dist = Math.sqrt(dx*dx + dy*dy);
                    if (dist < nodeSize && Math.random() < density * 1.2) {
                        grid[x][y] = 1;
                    }
                }
            }
        }
        
        // Connect to center
        const steps = Math.floor(edgeDistance);
        for (let s = 0; s <= steps; s += 3) {
            const x = Math.floor(center + (nodeX - center) * (s / steps));
            const y = Math.floor(center + (nodeY - center) * (s / steps));
            
            if (x >= 0 && x < size && y >= 0 && y < size && Math.random() < 0.7) {
                grid[x][y] = 1;
            }
        }
    }
}

function createIoTPattern(grid, size, density) {
    // Clear grid
    for (let x = 0; x < size; x++) {
        for (let y = 0; y < size; y++) {
            grid[x][y] = 0;
        }
    }
    
    // Create small, isolated patterns
    const numDevices = Math.floor(15 * density);
    
    for (let i = 0; i < numDevices; i++) {
        const deviceX = Math.floor(Math.random() * size);
        const deviceY = Math.floor(Math.random() * size);
        const deviceSize = Math.floor(Math.random() * 3) + 2;
        
        for (let x = deviceX - deviceSize; x <= deviceX + deviceSize; x++) {
            for (let y = deviceY - deviceSize; y <= deviceY + deviceSize; y++) {
                if (x >= 0 && x < size && y >= 0 && y < size) {
                    const dx = x - deviceX;
                    const dy = y - deviceY;
                    const dist = Math.sqrt(dx*dx + dy*dy);
                    if (dist < deviceSize) {
                        grid[x][y] = 1;
                    }
                }
            }
        }
    }
    
    // Add a few connection paths
    const center = Math.floor(size / 2);
    const hubSize = Math.floor(size * 0.05);
    
    // Create hub
    for (let x = center - hubSize; x <= center + hubSize; x++) {
        for (let y = center - hubSize; y <= center + hubSize; y++) {
            if (x >= 0 && x < size && y >= 0 && y < size) {
                const dx = x - center;
                const dy = y - center;
                const dist = Math.sqrt(dx*dx + dy*dy);
                if (dist < hubSize) {
                    grid[x][y] = 1;
                }
            }
        }
    }
}

// Implementation of createGliderFactoryPattern, createOscillatorPattern, 
// and createStableCorePattern would go here (removed for brevity)

// ===========================
//  CA EVOLUTION (RULES)
// ===========================
function applyGeneBasedEvolution(material) {
    const userData = material.userData;
    const caData = userData.caData;
    const { current, next } = caData;
    const size = current.length;
    
    // Get rules from userData
    const birthRules = userData.birthRules || [3];
    const survivalRules = userData.survivalRules || [2, 3];
    const useVonNeumann = userData.useVonNeumann || false;
    
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
                next[x][y] = survivalRules.includes(liveNeighbors) ? 1 : 0;
            } else {
                // Cell is dead - check birth rules
                next[x][y] = birthRules.includes(liveNeighbors) ? 1 : 0;
            }
        }
    }
    
    // Swap buffers
    [caData.current, caData.next] = [next, current];
}

// Main update function for CA material animation
export function updateCAMaterial(material, deltaTime) {
    const userData = material.userData;
    
    // Accumulate time
    userData.accumulatedTime = (userData.accumulatedTime || 0) + deltaTime;
    
    // Determine update interval based on evolution speed
    const evolutionSpeed = userData.evolutionSpeed || 1.0;
    
    // Increase the update interval to reduce CPU load (300ms instead of 100ms)
    const updateInterval = 300 / evolutionSpeed;
    
    if (userData.accumulatedTime >= updateInterval) {
        // Apply CA rules
        applyGeneBasedEvolution(material);
        
        // Update hue shift
        userData.hueShift = (userData.hueShift || 0) + 0.5;
        
        // Redraw texture
        userData.updateTexture(userData.hueShift);
        
        // Reset accumulated time
        userData.accumulatedTime = 0;
    }
}
window.updateCAMaterial = updateCAMaterial;
// ===========================
//  MAIN EXPORTED FUNCTIONS
// ===========================
export async function createCAMaterialForNode(nodeId) {
    console.log(`🔥🔥🔥 Creating CA material for node: ${nodeId}`);
    
    try {
        console.log(`BEFORE fetchNodeGenes call for ${nodeId}`);
        const genes = await fetchNodeGenes(nodeId);
        console.log(`AFTER fetchNodeGenes call for ${nodeId} - Got genes:`, !!genes);
        
        let material;
        
        if (genes) {
            console.log(`Using genetic data for ${nodeId}`);
            
            // Create material with genes
            material = createGeneticCAMaterial(nodeId, genes);
            
        } else {
            console.log(`Falling back to IP-based generation for ${nodeId}`);
            
            // Fallback to IP-based method if gene fetch fails
            material = createCATextureFromIP(nodeId);
        }
        
        return material;
    } catch (error) {
        console.error(`ERROR in createCAMaterialForNode for ${nodeId}:`, error);
        // Failsafe return a basic material
        return createCATextureFromIP(nodeId);
    }
}

// Function to integrate with the node mesh system
export async function updateNodeToCAMaterial(mesh) {
    console.log("⚠️⚠️⚠️ CALLED updateNodeToCAMaterial for", mesh.userData.id);
    
    // TEMPORARY: Reset flags for debugging
    console.log("Previous flags:", {
        caProcessing: mesh.userData.caProcessing,
        caEnabled: mesh.userData.caEnabled
    });
    
    // Force reset for debugging
    mesh.userData.caProcessing = false;
    mesh.userData.caEnabled = false;
    
    if (mesh.userData.caProcessing || mesh.userData.caEnabled) {
      console.log("EARLY RETURN - Already processing or enabled");
      return; // Already processing or has CA material
    }
    
    const nodeId = mesh.userData.id;
    if (!nodeId) {
      console.error("EARLY RETURN - Node has no ID, cannot apply CA material");
      return;
    }
    
    console.log(`💥💥💥 ABOUT TO CREATE CA MATERIAL for ${nodeId}`);
    mesh.userData.caProcessing = true;
    
    try {
      // Create CA material
      console.log("BEFORE createCAMaterialForNode call");
      const material = await createCAMaterialForNode(nodeId);
      console.log("AFTER createCAMaterialForNode call - Got material:", !!material);
      
      // Initialize the material's texture before replacing
      if (mesh.material) {
        const oldMaterial = mesh.material;
        
        // Clear any material properties that might be preserved
        if (oldMaterial.color) oldMaterial.color.set("#FFFFFF");
        if (oldMaterial.emissive) oldMaterial.emissive.set("#000000");
        oldMaterial.emissiveIntensity = 0;
        
        // Force material disposal
        mesh.material = null;
        oldMaterial.dispose();
      }
      
      // Replace the material
      mesh.material = material;
      console.log(`Material replacement for ${nodeId}:`, {
        material: mesh.material,
        hasCAData: mesh.material.userData.caData !== undefined,
        textureExists: mesh.material.map !== undefined
      });
      window.caNodesManager.registerNode(mesh);
      
      // Update node status flags
      mesh.userData.caEnabled = true;
      mesh.userData.caProcessing = false;
            
      console.log(`✅ Node ${nodeId} successfully converted to CA material and registered for updates`);
    } catch (error) {
      console.error(`Failed to update node ${nodeId} to CA material:`, error);
      mesh.userData.caProcessing = false;
      return false;      
    }
}
// Add a function to force clear a material's color properties
export function clearMaterialColors(material) {
    if (!material) return;
    
    if (material.color) material.color.set("#FFFFFF");
    if (material.emissive) material.emissive.set("#000000");
    material.emissiveIntensity = 0;
    material.needsUpdate = true;
}
// Clean up CA nodes that have been removed from the scene
export function cleanupCANodes() {
    if (window.caNodesManager) {
        // Filter out nodes that no longer exist in the scene
        window.caNodesManager.nodes = window.caNodesManager.nodes.filter(node => {
            if (!node.parent) {
                // Node is no longer in the scene
                return false;
            }
            return true;
        });
    }
}

// Modification function for our integration
export function modifyCreateNodeMesh(originalCreateNodeMesh) {
    return async function createNodeMeshWithCA(nodeState) {
        // If node is fully scanned, pre-create the CA material
        let caMaterial = null;
        
        if (nodeState.fully_scanned) {
            try {
                console.log(`Pre-creating CA material for fully scanned node ${nodeState.id}`);
                caMaterial = await createCAMaterialForNode(nodeState.id);
            } catch (error) {
                console.error(`Error pre-creating CA material for ${nodeState.id}:`, error);
                // Continue with normal creation if CA material fails
            }
        }
        
        // Call original function to create basic mesh
        const mesh = await originalCreateNodeMesh(nodeState);
        
        // Replace material if we successfully created a CA material
        if (caMaterial) {
            if (mesh.material) {
                mesh.material.dispose();
            }
            
            mesh.material = caMaterial;
            mesh.userData.caEnabled = true;
            
            // Register for updates
            window.caNodesManager.registerNode(mesh);
            
            console.log(`Applied CA material to node ${nodeState.id}`);
        }
        
        return mesh;
    };
}
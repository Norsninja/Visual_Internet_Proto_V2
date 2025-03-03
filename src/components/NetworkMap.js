// NetworkMap.js - Updated with explicit D3 import
import * as d3 from "d3"; // or your chosen CDN URL
console.log("Imported d3:", d3);
import './NetworkMap.css';



export class NetworkMap {
  constructor(containerId, toggleCallback) {
    // Check if D3 is loaded
    if (!d3) {
      console.error("D3.js is not available. Please ensure it's properly imported.");
      return;
    }
    
    console.log("NetworkMap initialized with D3:", d3.version);
    
    // Get or create container
    this.container = document.getElementById(containerId);
    if (!this.container) {
      console.log(`Creating container with ID: ${containerId}`);
      this.container = document.createElement('div');
      this.container.id = containerId;
      this.container.style.position = 'absolute';
      this.container.style.top = '0';
      this.container.style.left = '0';
      this.container.style.width = '100vw';
      this.container.style.height = '100vh';
      this.container.style.zIndex = '1000';
      this.container.style.display = 'none';
      document.body.appendChild(this.container);
    }
    
    this.toggleCallback = toggleCallback;
    this.simulation = null;
    this.visible = false;
    this.data = null;
    this.svg = null;
    this.nodes = null;
    this.links = null;
    this.texts = null;
    this.zoomContainer = null;
    
    // Initialize but don't create the visualization yet
    this.initialize();
    
    // Handle ESC key to close map
    this.escHandler = (e) => {
      if (e.key === 'Escape' && this.visible) {
        this.toggle();
      }
    };
    
    document.addEventListener('keydown', this.escHandler);
  }
  
  initialize() {
    // Make sure we have a container
    if (!this.container) {
      console.error("Cannot initialize: container not available");
      return;
    }
    
    console.log("Initializing NetworkMap");
    
    // Create the SVG element
    this.svg = d3.create('svg')
      .attr('width', '100%')
      .attr('height', '100%')
      .style('background', 'rgba(0, 0, 0, 0.9)');
      
    // Add zoom container
    this.zoomContainer = this.svg.append('g')
      .attr('id', 'zoom-container');
      
    // Add zoom behavior
    this.svg.call(d3.zoom()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        this.zoomContainer.attr('transform', event.transform);
      })
    );
    
    // Add close button
    this.svg.append('g')
      .attr('class', 'close-button')
      .attr('transform', 'translate(20, 20)')
      .style('cursor', 'pointer')
      .on('click', () => this.toggle())
      .append('circle')
      .attr('r', 15)
      .attr('fill', 'rgba(255, 255, 255, 0.2)');
      
    this.svg.select('.close-button')
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .style('fill', 'white')
      .style('font-size', '20px')
      .style('font-family', 'Arial')
      .text('×');
      
    // Add legend
    this.svg.append('g')
      .attr('class', 'legend')
      .attr('transform', 'translate(20, 60)');
      
    this.createLegend();
      
    // Append to container
    this.container.appendChild(this.svg.node());
    
    // Add help panel
    const helpPanel = document.createElement('div');
    helpPanel.className = 'help-panel';
    helpPanel.innerHTML = `
      <h3>Network Map Navigation</h3>
      <ul>
        <li>Click and drag to pan</li>
        <li>Mouse wheel to zoom</li>
        <li>Click a node to select and travel to it</li>
        <li>Press ESC or click × to close</li>
      </ul>
    `;
    this.container.appendChild(helpPanel);
    
    console.log("NetworkMap initialization complete");
  }
  
  createLegend() {
    const legend = this.svg.select('.legend');
    
    const items = [
      { color: '#FFD700', label: 'ASN Nodes' },
      { color: '#0099FF', label: 'Local Network' },
      { color: '#ff4d4d', label: 'External Network' },
      { color: '#ff69b4', label: 'Web Nodes' }
    ];
    
    items.forEach((item, i) => {
      const g = legend.append('g')
        .attr('transform', `translate(0, ${i * 25})`);
        
      g.append('circle')
        .attr('r', 6)
        .attr('fill', item.color);
        
      g.append('text')
        .attr('x', 15)
        .attr('dy', '0.35em')
        .style('fill', 'white')
        .style('font-size', '12px')
        .text(item.label);
    });
  }
  
  async fetchData() {
    try {
      console.log("Fetching network data...");
      const response = await fetch('http://192.168.0.11:5000/network');
      this.data = await response.json();
      console.log("Network map data loaded:", this.data);
      return this.data;
    } catch (error) {
      console.error('Error fetching network data:', error);
      return null;
    }
  }
  
  async toggle() {
    console.log("Toggling network map visibility", this.visible ? "off" : "on");
    this.visible = !this.visible;
    
    if (this.visible) {
      // Show map
      this.container.style.display = 'block';
      
      // Fetch data if not already loaded
      if (!this.data) {
        await this.fetchData();
      }
      
      // Create or update visualization
      this.createVisualization();
      
      // Notify parent component
      if (this.toggleCallback) {
        this.toggleCallback(true);
      }
    } else {
      // Hide map
      this.container.style.display = 'none';
      
      // Notify parent component
      if (this.toggleCallback) {
        this.toggleCallback(false);
      }
    }
  }
  
  createVisualization() {
    console.log("Creating network visualization");
    if (!this.data || !this.data.nodes || !this.data.edges) {
      console.error('No valid data for visualization');
      
      // Show error message in the map
      this.zoomContainer.selectAll('*').remove();
      this.zoomContainer.append('text')
        .attr('x', this.container.clientWidth / 2)
        .attr('y', this.container.clientHeight / 2)
        .attr('text-anchor', 'middle')
        .style('fill', 'white')
        .style('font-size', '24px')
        .text('Error: No network data available');
      
      return;
    }
    
    console.log(`Creating visualization with ${this.data.nodes.length} nodes and ${this.data.edges.length} edges`);
    
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    
    // Clear previous visualization
    this.zoomContainer.selectAll('*').remove();
    
    // Stop previous simulation
    if (this.simulation) {
      this.simulation.stop();
    }
    
    // Deep clone the data to avoid modifying the original
    const nodes = JSON.parse(JSON.stringify(this.data.nodes));
    const edges = JSON.parse(JSON.stringify(this.data.edges));
    
    // Process edge data for D3
    edges.forEach(edge => {
      // Ensure source and target references nodes by id
      if (typeof edge.source !== 'string' && edge.source.id) {
        edge.source = edge.source.id;
      }
      if (typeof edge.target !== 'string' && edge.target.id) {
        edge.target = edge.target.id;
      }
    });
    
    // Create simulation
    this.simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(edges).id(d => d.id).distance(80))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .alphaDecay(0.028); // Slower decay for more movement
      
    // Create links
    this.links = this.zoomContainer.selectAll('line')
      .data(edges)
      .enter().append('line')
      .attr('stroke', 'rgba(255, 255, 255, 0.5)')
      .attr('stroke-width', 1);
      
    // Create nodes
    this.nodes = this.zoomContainer.selectAll('circle')
      .data(nodes)
      .enter().append('circle')
      .attr('r', d => {
        // Size nodes by type
        if (d.id && d.id.startsWith('AS')) return 12;
        if (d.type === 'router') return 14;
        if (d.layer === 'web') return 6;
        return 8;
      })
      .attr('fill', d => {
        // Color nodes by type
        if (d.id && d.id.startsWith('AS')) return '#FFD700'; // ASN
        if (d.layer === 'web') return '#ff69b4'; // Web
        if (d.type === 'external') return '#ff4d4d'; // External
        return d.color || '#0099FF'; // Default or specified color
      })
      .attr('stroke', d => d.scanned_ports ? '#00FF00' : 'none') // Green outline for scanned nodes
      .attr('stroke-width', 2)
      .style('cursor', 'pointer')
      .on('click', (event, d) => this.handleNodeClick(d))
      .call(this.drag(this.simulation));
      
    // Add labels
    this.texts = this.zoomContainer.selectAll('text')
      .data(nodes)
      .enter().append('text')
      .attr('dx', 10)
      .attr('dy', '.35em')
      .style('fill', 'white')
      .style('font-size', '12px')
      .style('pointer-events', 'none')
      .text(d => {
        // Show appropriate label based on node type
        if (d.label) return d.label.substring(0, 20); // Truncate long labels
        if (d.id && d.id.length > 20) return d.id.substring(0, 20) + '...';
        return d.id;
      });
      
    // Update positions on simulation tick
    this.simulation.on('tick', () => {
      this.links
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y);
        
      this.nodes
        .attr('cx', d => d.x)
        .attr('cy', d => d.y);
        
      this.texts
        .attr('x', d => d.x)
        .attr('y', d => d.y);
    });
    
    console.log("Visualization creation complete, simulation started");
  }
  
  handleNodeClick(node) {
    console.log('Node clicked:', node);
    
    // Find the node in the 3D visualization
    if (window.nodesManager) {
      const threejsNode = window.nodesManager.getNodeById(node.id);
      if (threejsNode) {
        // Hide the 2D map
        this.toggle();
        
        // Select the node in the 3D view
        if (window.eventsManager && window.eventsManager.selectNode) {
          window.eventsManager.selectNode(threejsNode);
        }
        
        // Move ship to the node (if it exists)
        if (window.ship && window.ship.travelTo) {
          window.ship.travelTo(threejsNode);
        }
      } else {
        console.warn(`Could not find 3D node with ID: ${node.id}`);
      }
    } else {
      console.warn('nodesManager not available, cannot find 3D node');
    }
  }
  
  drag(simulation) {
    function dragStarted(event, d) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event, d) {
      d.fx = event.x;
      d.fy = event.y;
    }

    function dragEnded(event, d) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }

    return d3.drag()
      .on('start', dragStarted)
      .on('drag', dragged)
      .on('end', dragEnded);
  }
  
  update() {
    // Refresh the data and update the visualization
    this.fetchData().then(() => {
      if (this.visible) {
        this.createVisualization();
      }
    });
  }
  
  destroy() {
    console.log("Destroying NetworkMap");
    // Clean up resources when the component is destroyed
    if (this.simulation) {
      this.simulation.stop();
    }
    
    // Remove event listeners
    document.removeEventListener('keydown', this.escHandler);
    
    // Remove DOM elements
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
  }
}
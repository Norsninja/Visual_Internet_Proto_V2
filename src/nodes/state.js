// state.js (new file or inline within nodes.js)
export class GraphState {
    constructor() {
      this.nodes = new Map(); // node id => node state
    }
  
    addOrUpdateNode(nodeData) {
      const existing = this.nodes.get(nodeData.id) || {};
      // Merge the new data with any existing state (including position if already set)
      this.nodes.set(nodeData.id, { ...existing, ...nodeData });
    }
  
    getNode(id) {
      return this.nodes.get(id);
    }
  
    getAllNodes() {
      return Array.from(this.nodes.values());
    }
  }
  
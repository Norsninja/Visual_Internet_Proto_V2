// components/UIContext.jsx
import React, { createContext, useState, useRef, useContext } from 'react';

export const UIContext = createContext();

// Add this custom hook for easier context consumption
export const useUI = () => {
  return useContext(UIContext);
};

export const UIProvider = ({ children }) => {
  const [selectedNode, setSelectedNode] = useState(null);
  const [scanResults, setScanResults] = useState({ loading: false, error: null, data: [] });
  const [advancedResults, setAdvancedResults] = useState({ loading: false, error: null, data: [] });
  const [infoBoxPosition, setInfoBoxPosition] = useState({ x: 0, y: 0 });
  const [targetScreenPos, setTargetScreenPos] = useState({ x: 0, y: 0 });
  const [showNetworkMap, setShowNetworkMap] = useState(false);
  const [scanCooldown, setScanCooldown] = useState(false);
  
  // Add state for node visualization
  const [visualizedNodeId, setVisualizedNodeId] = useState(null);

  // Function to toggle network map
  const toggleNetworkMap = () => {
    setShowNetworkMap(!showNetworkMap);
  };

  // Cooldown function for scan operations
  const activateScanCooldown = (duration = 5000) => {
    setScanCooldown(true);
    setTimeout(() => setScanCooldown(false), duration);
  };

  // Create a ref to expose context to window
  const contextRef = useRef();
  const contextValue = {
    selectedNode,
    setSelectedNode,
    scanResults,
    setScanResults,
    advancedResults,
    setAdvancedResults,
    infoBoxPosition,
    setInfoBoxPosition,
    targetScreenPos,
    setTargetScreenPos,
    showNetworkMap,
    setShowNetworkMap,
    toggleNetworkMap,
    scanCooldownActive: scanCooldown,
    activateScanCooldown,
    // Add visualization state and functions
    visualizedNodeId,
    setVisualizedNodeId
  };

  // Expose context to window for global access
  contextRef.current = contextValue;
  if (typeof window !== 'undefined') {
    window.UI_CONTEXT_REF = contextRef;
    window.uiContext = contextValue;
  }

  return (
    <UIContext.Provider value={contextValue}>
      {children}
    </UIContext.Provider>
  );
};
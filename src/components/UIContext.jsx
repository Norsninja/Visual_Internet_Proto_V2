// UIContext.jsx
import React, { createContext, useState, useContext, useCallback } from 'react';

export const UIContext = createContext();

export const UIProvider = ({ children }) => {
  const [selectedNode, setSelectedNode] = useState(null);
  const [scanResults, setScanResults] = useState({
    loading: true,
    error: null,
    data: [],
  });
  const [advancedResults, setAdvancedResults] = useState({
    loading: false,
    error: null,
    data: [],
  });
  const [infoBoxPosition, setInfoBoxPosition] = useState({ x: 0, y: 0 });
  const [targetScreenPos, setTargetScreenPos] = useState({ x: 0, y: 0 });
  
  // Add scan cooldown state
  const [scanCooldownActive, setScanCooldownActive] = useState(false);
  const [scanCooldownTimeoutId, setScanCooldownTimeoutId] = useState(null);

  // Function to activate scan cooldown
  const activateScanCooldown = useCallback((duration = 5000) => {
    setScanCooldownActive(true);
    
    // Clear any existing timeout
    if (scanCooldownTimeoutId) {
      clearTimeout(scanCooldownTimeoutId);
    }
    
    // Set new timeout
    const timeoutId = setTimeout(() => {
      setScanCooldownActive(false);
    }, duration);
    
    setScanCooldownTimeoutId(timeoutId);
  }, [scanCooldownTimeoutId]);

  // Function to cancel scan cooldown (if needed)
  const cancelScanCooldown = useCallback(() => {
    if (scanCooldownTimeoutId) {
      clearTimeout(scanCooldownTimeoutId);
      setScanCooldownTimeoutId(null);
    }
    setScanCooldownActive(false);
  }, [scanCooldownTimeoutId]);

  return (
    <UIContext.Provider
      value={{
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
        scanCooldownActive,
        activateScanCooldown,
        cancelScanCooldown
      }}
    >
      {children}
    </UIContext.Provider>
  );
};

export const useUI = () => useContext(UIContext);
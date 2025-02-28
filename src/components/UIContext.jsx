// UIContext.js
import React, { createContext, useState, useContext } from 'react';

export const UIContext = createContext();

export const UIProvider = ({ children }) => {
  const [selectedNode, setSelectedNode] = useState(null);
  const [scanResults, setScanResults] = useState({
    loading: true,
    error: null,
    data: [],
  });
  const [infoBoxPosition, setInfoBoxPosition] = useState({ x: 0, y: 0 });
  const [targetScreenPos, setTargetScreenPos] = useState({ x: 0, y: 0 });

  return (
    <UIContext.Provider
      value={{
        selectedNode,
        setSelectedNode,
        scanResults,
        setScanResults,
        infoBoxPosition,
        setInfoBoxPosition,
        targetScreenPos,
        setTargetScreenPos,
      }}
    >
      {children}
    </UIContext.Provider>
  );
};

export const useUI = () => useContext(UIContext);

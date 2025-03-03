// src/components/DraggableInfoBox.jsx
import React, { useState, useRef, useEffect } from 'react';
import Draggable from 'react-draggable';
import InfoBox from './infobox.jsx';
import WebNodeInfoBox from './WebNodeInfoBox.jsx';
import AsnInfoBox from './AsnInfoBox.jsx';

const DraggableInfoBox = ({ nodeData, scanResults, onAction, targetScreenPos, onPositionChange }) => {
  const [position, setPosition] = useState({
    x: targetScreenPos ? targetScreenPos.x + 20 : 50,
    y: targetScreenPos ? targetScreenPos.y - 20 : 100
  });
  const nodeRef = useRef(null);

  // Update initial position when targetScreenPos changes
  useEffect(() => {
    if (targetScreenPos) {
      setPosition({
        x: targetScreenPos.x + 20,
        y: targetScreenPos.y - 20
      });
    }
  }, [targetScreenPos]);

  const handleDrag = (e, data) => {
    setPosition({ x: data.x, y: data.y });
  };

  const handleStop = (e, data) => {
    setPosition({ x: data.x, y: data.y });
    if (nodeRef.current && onPositionChange) {
      const rect = nodeRef.current.getBoundingClientRect();
      onPositionChange({ x: rect.left, y: rect.top });
    }
  };
  
  // Determine node type
  const isWebNode = nodeData.layer === 'web';
  const isAsnNode = nodeData.id && typeof nodeData.id === 'string' && nodeData.id.startsWith('AS');
  
  // Get the node's color or use a default value
  const nodeColor = nodeData.color || (nodeData.type === "external" ? "red" : "#0099FF");

  const styles = {
    infoBox: {
      position: "absolute",
      zIndex: 1000,
      backgroundColor: "rgba(0, 0, 0, 0.8)",
      color: "white",
      padding: "10px",
      borderRadius: "12px",
      border: `2px solid ${nodeColor}`, // Apply dynamic border color
      boxShadow: `0 0 15px ${nodeColor}80`, // Add a soft glow effect
      transition: "all 0.3s ease",
    },
  };

  return (
    <Draggable 
      nodeRef={nodeRef} 
      position={position} 
      onDrag={(e, data) => setPosition({ x: data.x, y: data.y })} 
      onStop={(e, data) => onPositionChange && onPositionChange({ x: data.x, y: data.y })}
    >
      <div style={styles.infoBox} ref={nodeRef}>
        {isWebNode ? (
          <WebNodeInfoBox 
            nodeData={nodeData} 
            scanResults={scanResults} 
            onAction={onAction} 
          />
        ) : isAsnNode ? (
          <AsnInfoBox 
            nodeData={nodeData} 
            scanResults={scanResults} 
            onAction={onAction} 
          />
        ) : (
          <InfoBox 
            nodeData={nodeData} 
            scanResults={scanResults} 
            onAction={onAction} 
          />
        )}
      </div>
    </Draggable>
  );
};

export default DraggableInfoBox;
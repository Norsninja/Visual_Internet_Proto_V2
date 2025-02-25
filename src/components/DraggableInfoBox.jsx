// src/components/DraggableInfoBox.jsx
import React, { useState, useRef, useEffect } from 'react';
import Draggable from 'react-draggable';
import InfoBox from './infobox.jsx';

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

  return (
    <Draggable 
      nodeRef={nodeRef} 
      position={position} 
      onDrag={handleDrag} 
      onStop={handleStop}
    >
      <div style={styles.infoBox} ref={nodeRef}>
        <InfoBox nodeData={nodeData} scanResults={scanResults} onAction={onAction} />
      </div>
    </Draggable>
  );
};

const styles = {
  infoBox: {
    position: "absolute",
    zIndex: 1000,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    color: "white",
    padding: "10px",
    borderRadius: "5px",
    border: "1px solid red" // Debug border; remove when satisfied
  },
};

export default DraggableInfoBox;

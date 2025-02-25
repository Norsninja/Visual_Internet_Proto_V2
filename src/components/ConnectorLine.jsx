// src/components/ConnectorLine.jsx
import React from 'react';

const ConnectorLine = ({ from, to }) => {
  // from: { x, y } position on the info box (e.g., top-left)
  // to: { x, y } position of the node on screen
  const lineStyle = {
    position: "absolute",
    top: 0,
    left: 0,
    pointerEvents: "none", // allow clicks to pass through
    zIndex: 999,
  };

  return (
    <svg style={lineStyle} width={window.innerWidth} height={window.innerHeight}>
      <line 
        x1={from.x} 
        y1={from.y} 
        x2={to.x} 
        y2={to.y} 
        stroke="white" 
        strokeWidth="2"
      />
    </svg>
  );
};

export default ConnectorLine;

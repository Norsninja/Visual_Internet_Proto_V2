import React from 'react';
import { baseStyles, createNodeStyles } from './basestyles';

const WebNodeInfoBox = ({ nodeData, scanResults, onAction }) => {
  // Extract content from nodeData
  const title = nodeData.title || "Website";
  const url = nodeData.url || nodeData.id;
  const protocol = url.startsWith('https') ? 'HTTPS' : 'HTTP';
  const protocolColor = protocol === 'HTTPS' ? '#4CAF50' : '#FF9800';
  const hostIp = nodeData.parentId || '';
  
  // Get web-specific styles
  const nodeStyles = createNodeStyles("web");
  
  // Add component-specific styles
  const styles = {
    ...baseStyles,
    ...nodeStyles,
    urlBar: {
      background: "rgba(0, 0, 0, 0.3)",
      padding: "8px 12px",
      borderRadius: "6px",
      fontFamily: "monospace",
      marginTop: "12px",
      marginBottom: "12px",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    },
    protocol: {
      color: protocolColor,
      fontWeight: "bold",
    },
    domain: {
      fontWeight: "normal",
    },
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}>{title}</h2>
        <div style={styles.urlBar}>
          <span style={styles.protocol}>{protocol}://</span>
          <span style={styles.domain}>{url.replace(/^https?:\/\//, '')}</span>
        </div>
      </div>

      <div style={styles.section}>
        {hostIp && (
          <div style={styles.dataItem}>
            <span style={styles.dataLabel}>Host IP:</span>
            <span style={styles.dataValue}>{hostIp}</span>
          </div>
        )}
        <div style={styles.dataItem}>
          <span style={styles.dataLabel}>Full URL:</span>
          <span style={styles.dataValue} title={url}>{url}</span>
        </div>
      </div>

      <div style={styles.actionsContainer}>
        <button 
          style={styles.actionButton} 
          onClick={() => onAction("travel")}
        >
          Travel
        </button>
      </div>
    </div>
  );
};

export default WebNodeInfoBox;
// AsnInfoBox.jsx
import React from 'react';
import { baseStyles, createNodeStyles } from './basestyles';

const AsnInfoBox = ({ nodeData, scanResults, onAction }) => {
  // Extract data from nodeData or scanResults
  const asnNumber = nodeData.asn || nodeData.id.replace("AS", "");
  const holder = nodeData.holder || "Unknown";
  
  // Find BGP scan data
  const bgpScanData = scanResults.data.find(scan => scan.type === "bgpscan") || {};
  
  // Get prefixes and peers from either nodeData or bgpScanData
  const prefixes = nodeData.prefixes || bgpScanData.prefixes || [];
  const peers = nodeData.peers || bgpScanData.peers || [];
  
  // Get ASN-specific styles
  const nodeStyles = createNodeStyles("asn");
  
  // Component-specific styles
  const styles = {
    ...baseStyles,
    ...nodeStyles,
    prefixItem: {
      padding: "6px 10px",
      margin: "4px 0",
      background: "rgba(255, 215, 0, 0.1)",
      borderRadius: "4px", 
      fontFamily: "monospace",
      fontSize: "0.9em",
    },
    prefixList: {
      maxHeight: "150px",
      overflowY: "auto",
      padding: "8px",
      background: "rgba(0, 0, 0, 0.2)",
      borderRadius: "6px",
    },
    peerItem: {
      padding: "5px 8px",
      background: "rgba(255, 215, 0, 0.1)",
      borderRadius: "4px",
      margin: "3px",
      fontSize: "0.9em",
    },
    peersList: {
      display: "flex",
      flexWrap: "wrap",
      gap: "4px",
      maxHeight: "120px",
      overflowY: "auto",
      padding: "8px",
      background: "rgba(0, 0, 0, 0.2)",
      borderRadius: "6px",
    },
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}>AS{asnNumber}</h2>
        <p style={styles.subtitle}>{holder}</p>
      </div>

      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>BGP Information</h3>
        
        <h4 style={styles.sectionTitle}>Announced Prefixes</h4>
        {prefixes && prefixes.length > 0 ? (
          <div style={styles.prefixList}>
            {prefixes.slice(0, 10).map((prefix, index) => (
              <div key={index} style={styles.prefixItem}>{prefix}</div>
            ))}
            {prefixes.length > 10 && (
              <div style={{...styles.prefixItem, opacity: 0.6, fontStyle: 'italic'}}>
                +{prefixes.length - 10} more...
              </div>
            )}
          </div>
        ) : (
          <p style={styles.emptyMessage}>No prefix data available</p>
        )}
        
        <h4 style={styles.sectionTitle}>BGP Peers</h4>
        {peers && peers.length > 0 ? (
          <div style={styles.peersList}>
            {peers.slice(0, 8).map((peer, index) => (
              <div key={index} style={styles.peerItem}>AS{peer}</div>
            ))}
            {peers.length > 8 && (
              <div style={{...styles.peerItem, opacity: 0.6, fontStyle: 'italic'}}>
                +{peers.length - 8} more...
              </div>
            )}
          </div>
        ) : (
          <p style={styles.emptyMessage}>No peer data available</p>
        )}
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

export default AsnInfoBox;
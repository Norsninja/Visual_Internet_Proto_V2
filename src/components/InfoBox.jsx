// InfoBox.jsx
import React from 'react';
import RouterControls from './RouterControls';
import AdvancedScanResults from './AdvancedScanResults';
// Import the UI context to access the scan cooldown state
import { useUI } from './UIContext.jsx';

const InfoBox = ({ nodeData, scanResults, onAction }) => {
  const {
    label = "Unknown",
    id = "N/A",
    mac = "N/A",
    role = "N/A",
    externalNetwork = "",
    showScanButton,
    showTravelButton,
    showWebScanButton,
    type,
    open_external_port,
    port,
    color = "#ffffff",
    advancedResults = [] // Extract advanced results directly from nodeData
  } = nodeData;
  
  // Get the global scan cooldown state
  const { scanCooldownActive } = useUI();
  const SERVICE_PORT_MAPPINGS = {
    "web": [80, 443, 8080, 8443, 8000, 8888],
    "mail": [25, 465, 587, 110, 995, 143, 993],
    "ftp": [20, 21],
    "ssh": [22],
    "telnet": [23],
    "dns": [53],
    "dhcp": [67, 68],
    "tftp": [69],
    "http": [80, 8080, 8000, 8888],
    "https": [443, 8443],
    "smb": [445],
    "database": [1433, 1521, 3306, 5432, 6379, 27017, 9200, 7474],
    "rdp": [3389],
    "ipfs": [4001, 5001, 8080],
    "blockchain": [8333, 8332, 30303, 30304],
    "tor": [9001, 9030, 9050, 9051],
    "iot_mqtt": [1883, 8883],
    "iot_coap": [5683, 5684],
    "p2p": [6881, 6882, 6883, 6889, 6969],
    "industrial": [502, 102, 20000]  // Modbus, S7, DNP3
  };
  
  // Extract any advanced scan results for DNS lookups
  const dnsResults = [];

  // First try to get DNS results from advancedResults prop if it exists
  if (advancedResults && Array.isArray(advancedResults)) {
    advancedResults.forEach(result => {
      if (result.scan_type === 'reverseDNS' && 
          (parseInt(result.port) === 80 || parseInt(result.port) === 443) &&
          result.results && result.results.includes('.')) {
        dnsResults.push(result);
      }
    });
  }

  // If no results found yet, try extracting from scan results
  if (dnsResults.length === 0 && scanResults && scanResults.data && Array.isArray(scanResults.data)) {
    scanResults.data.forEach(scan => {
      if (scan.advanced && Array.isArray(scan.advanced)) {
        scan.advanced.forEach(advResult => {
          if (advResult.scan_type === 'reverseDNS' && 
              (parseInt(advResult.port) === 80 || parseInt(advResult.port) === 443) &&
              advResult.results && advResult.results.includes('.')) {
            dnsResults.push(advResult);
          }
        });
      }
    });
  }

  // For debugging
  console.log("Extracted DNS results:", dnsResults);
  // Add this inside the InfoBox component at the top
  console.log("InfoBox rendering with nodeData:", {
    id: nodeData.id,
    type: nodeData.type,
    showScanButton: nodeData.showScanButton
  });
  // Check if we have DNS results to enable web scan button
  const hasDnsResults = dnsResults.length > 0;
  
  // Function to identify services from ports
  const identifyServices = (ports) => {
    if (!ports || !Array.isArray(ports)) return {};
    
    const portServices = {};
    
    ports.forEach(port => {
      const portNum = parseInt(port);
      const services = [];
      for (const [service, servicePorts] of Object.entries(SERVICE_PORT_MAPPINGS)) {
        if (servicePorts.includes(portNum)) {
          services.push(service);
        }
      }
      portServices[port] = services.length ? services : ["unknown"];
    });
    
    return portServices;
  };

  // Add console logging to help debug router recognition
  if (type === "router") {
    console.log("Router node detected:", { 
      id, 
      hasOpenExternalPort: !!open_external_port,
      externalNetwork 
    });
  }

  return (
    <div style={{ ...styles.container, border: `2px solid ${color}` }} onMouseEnter={(e) => e.stopPropagation()}>
      <div style={styles.header}>
        <h2 style={styles.title}>{label}</h2>
        <div style={styles.basicInfo}>
          <p><strong>IP:</strong> {id}</p>
          {mac !== "N/A" && <p><strong>MAC:</strong> {mac}</p>}
          {role !== "N/A" && <p><strong>Role:</strong> {role}</p>}
          {externalNetwork && <p><strong>External Target:</strong> {externalNetwork}</p>}
        </div>
      </div>

      <div style={styles.actionPanel}>
        {showScanButton && (
          <button
            style={{ ...styles.actionButton, opacity: scanCooldownActive ? 0.5 : 1 }}
            onClick={() => onAction("scanPorts")}
            disabled={scanCooldownActive}
          >
            {scanCooldownActive ? "Cooldown..." : "Scan Ports"}
          </button>
        )}
        {nodeData.fully_scanned && (
          <button
            className="info-box-button view-ca-button"
            onClick={() => onAction('visualizeNode', nodeData.id)}
          >
            <span className="button-icon">🔍</span> View CA Simulation
          </button>
        )}        
        {showTravelButton && (
          <button style={styles.actionButton} onClick={() => onAction("travel")}>
            Travel
          </button>
        )}
        
        {hasDnsResults && (
          <button 
            style={{ ...styles.actionButton, opacity: scanCooldownActive ? 0.5 : 1 }}
            onClick={() => onAction("webScan")} 
            disabled={scanCooldownActive}
          >
            {scanCooldownActive ? "Cooldown..." : "Web Scan"}
          </button>
        )}

        
        {type === "external" && (
          <button
            style={{ ...styles.actionButton, opacity: scanCooldownActive ? 0.5 : 1 }}
            onClick={() => onAction("remoteTraceroute")}
            disabled={scanCooldownActive}
          >
            {scanCooldownActive ? "Cooldown..." : "Traceroute"}
          </button>
        )}
        
        {(type === "network" || type === "external") && id && (
          <button
            style={{ ...styles.actionButton, opacity: scanCooldownActive ? 0.5 : 1 }}
            onClick={() => onAction("bgpScan")}
            disabled={scanCooldownActive}
          >
            {scanCooldownActive ? "Cooldown..." : "BGP Scan"}
          </button>
        )}
      </div>

      {/* Router Controls with proper container */}
      {type === "router" && (
        <div style={styles.sectionContainer}>
          <RouterControls onAction={onAction} externalNetwork={externalNetwork} />
        </div>
      )}

      {port && (
        <div style={styles.sectionContainer}>
          <AdvancedScanResults 
            advancedResults={advancedResults} 
            loading={scanResults.loading}
            onAction={onAction} 
            nodeData={nodeData}
            scanCooldownActive={scanCooldownActive}
          />
        </div>
      )}

      <div style={styles.resultsContainer}>
        <h3 style={styles.resultsTitle}>Scan Results</h3>
        <div style={styles.resultsScroll}>
          {scanResults.loading ? (
            <p style={styles.statusMessage}>Loading scan data...</p>
          ) : scanResults.error ? (
            <p style={styles.error}><strong>Error:</strong> {scanResults.error}</p>
          ) : scanResults.data.length === 0 ? (
            <p style={styles.statusMessage}><strong>No scans found.</strong></p>
          ) : (
            scanResults.data.map((scan, index) => (
              <div key={index} style={styles.scanResult}>
                <p><strong>Type:</strong> {scan.type}</p>
                
                {/* Port scan results */}
                {scan.ports && (
                  <div>
                    <p><strong>Ports:</strong> {scan.ports.join(", ")}</p>
                    {scan.ports.length > 0 && (
                      <div style={styles.servicesList}>
                        <p><strong>Detected Services:</strong></p>
                        {Object.entries(identifyServices(scan.ports))
                          .filter(([_, services]) => services.some(s => s !== "unknown"))
                          .map(([port, services]) => (
                            <p key={port} style={styles.serviceItem}>
                              • Port {port}: <span style={styles.serviceLabel}>{services.join(", ")}</span>
                            </p>
                          ))}
                      </div>
                    )}
                  </div>
                )}
                
               
                {/* BGP scan results */}
                {scan.asn && <p><strong>ASN:</strong> {scan.asn} ({scan.holder || "Unknown"})</p>}
                
                {/* Web scan results */}
                {scan.type === "webscan" && (
                  <div style={styles.webScanResults}>
                    {scan.url && <p><strong>URL:</strong> {scan.url}</p>}
                    {scan.status_code && <p><strong>Status:</strong> {scan.status_code}</p>}
                    {scan.server && <p><strong>Server:</strong> {scan.server}</p>}
                    {scan.title && scan.title !== "Unknown" && <p><strong>Title:</strong> {scan.title}</p>}
                    {scan.description && scan.description !== "Unknown" && (
                      <p><strong>Description:</strong> {scan.description}</p>
                    )}
                    {scan.content_type && <p><strong>Content Type:</strong> {scan.content_type}</p>}
                  </div>
                )}
                
                <p><strong>Timestamp:</strong> {new Date(scan.timestamp * 1000).toLocaleString()}</p>
                
                {/* Generic result field display */}
                {scan.result && (
                  <div style={styles.detailsContainer}>
                    <strong>Details:</strong>
                    <div style={styles.jsonData}>
                      {JSON.stringify(scan.result, null, 2)}
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

const styles = {
  container: {
    background: "rgba(0, 0, 0, 0.7)",
    backdropFilter: "blur(10px)",
    borderRadius: "12px",
    color: "white",
    padding: "15px",
    boxShadow: "0 4px 20px rgba(0, 0, 0, 0.3)",
    transition: "all 0.3s ease",
    maxWidth: "450px", // Fixed maximum width
    width: "100%",
    maxHeight: "85vh", // Maximum height relative to viewport
    display: "flex",
    flexDirection: "column",
    overflowX: "hidden",
  },
  header: {
    marginBottom: "15px",
  },
  title: {
    margin: "0 0 10px",
    fontSize: "1.4em",
    fontWeight: "bold",
    borderBottom: "1px solid rgba(255, 255, 255, 0.2)",
    paddingBottom: "5px",
  },
  basicInfo: {
    fontSize: "0.9em",
  },
  actionPanel: {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
    marginBottom: "15px",
  },
  actionButton: {
    background: "linear-gradient(135deg, #1e5799, #2989d8)",
    border: "none",
    padding: "8px 12px",
    color: "white",
    fontSize: "0.85em",
    fontWeight: "bold",
    borderRadius: "6px",
    cursor: "pointer",
    transition: "background 0.3s ease",
    flex: "1 0 auto",
    minWidth: "90px",
    textAlign: "center",
  },
  sectionContainer: {
    marginBottom: "15px",
    background: "rgba(255, 255, 255, 0.05)",
    borderRadius: "8px",
    padding: "10px",
  },
  resultsContainer: {
    display: "flex",
    flexDirection: "column",
    background: "rgba(255, 255, 255, 0.05)",
    borderRadius: "8px",
    marginTop: "auto", // Push to bottom when space allows
    flex: "1 1 auto",
    minHeight: "150px",
    maxHeight: "40vh",
  },
  resultsTitle: {
    fontSize: "1.1em",
    margin: "10px",
    borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
    paddingBottom: "5px",
  },
  resultsScroll: {
    overflowY: "auto",
    padding: "0 10px 10px 10px",
    maxHeight: "calc(40vh - 50px)", // Account for title
    scrollbarWidth: "thin",
    scrollbarColor: "rgba(255, 255, 255, 0.3) rgba(0, 0, 0, 0.2)",
  },
  webScanResults: {
    background: "rgba(255, 105, 180, 0.1)",
    padding: "8px",
    borderRadius: "4px",
    marginTop: "5px",
    borderLeft: "2px solid #FF69B4",
  },
  scanResult: {
    padding: "10px",
    marginBottom: "8px",
    background: "rgba(0, 0, 0, 0.3)",
    borderRadius: "6px",
    fontSize: "0.9em",
  },
  detailsContainer: {
    marginTop: "5px",
  },
  jsonData: {
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    background: "rgba(0, 0, 0, 0.3)",
    padding: "8px",
    borderRadius: "4px",
    marginTop: "5px",
    maxHeight: "100px",
    overflowY: "auto",
    fontSize: "0.85em",
    fontFamily: "monospace",
  },
  statusMessage: {
    padding: "10px",
    textAlign: "center",
    fontStyle: "italic",
  },
  servicesList: {
    marginTop: "5px",
    paddingLeft: "10px",
    fontSize: "0.9em",
    background: "rgba(41, 137, 216, 0.1)",
    borderRadius: "4px",
    padding: "8px",
    borderLeft: "2px solid #2989d8",
  },
  serviceItem: {
    margin: "2px 0",
    paddingLeft: "5px",
  },
  serviceLabel: {
    color: "#4CAF50",
    fontWeight: "bold",
  },
  error: {
    color: "#ff4d4d",
    fontWeight: "bold",
    padding: "10px",
  }
};

export default InfoBox;
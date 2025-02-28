import React from 'react';
import RouterControls from './RouterControls';

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
    color = "#ffffff"
  } = nodeData;

  return (
    <div style={{ ...styles.container, border: `2px solid ${color}` }} onMouseEnter={(e) => e.stopPropagation()}>
      <h2 style={styles.title}>{label}</h2>
      <p><strong>IP:</strong> {id}</p>
      <p><strong>MAC:</strong> {mac}</p>
      <p><strong>Role:</strong> {role}</p>
      {externalNetwork && <p><strong>External Target:</strong> {externalNetwork}</p>}

      <div style={styles.buttonGroup}>
        {showScanButton && (
          <button style={styles.fullWidthButton} onClick={() => onAction("scanPorts")}>Scan Ports</button>
        )}
        {showTravelButton && (
          <button style={styles.fullWidthButton} onClick={() => onAction("travel")}>Travel</button>
        )}
        {showWebScanButton && (
          <button style={styles.fullWidthButton} onClick={() => onAction("webScan")}>Run Web Scan</button>
        )}
      </div>

      {type === "router" && open_external_port && (
        <RouterControls onAction={onAction} externalNetwork={externalNetwork} />
      )}

      {(type === "network" || type === "external") && id && (
        <div style={styles.section}>
          <button style={styles.fullWidthButton} onClick={() => onAction("bgpScan")}>Run BGP Scan</button>
          <div id="bgpScanResults"></div>
        </div>
      )}

      {port && (
        <div style={styles.section}>
          <h3>Advanced Port Scans</h3>
          <div style={styles.buttonGroup}>
            <button style={styles.fullWidthButton} onClick={() => onAction("bannerGrab")}>Banner Grab</button>
            <button style={styles.fullWidthButton} onClick={() => onAction("cveLookup")}>Check CVE</button>
            <button style={styles.fullWidthButton} onClick={() => onAction("reverseDNS")}>Reverse DNS</button>
            <button style={styles.fullWidthButton} onClick={() => onAction("sslInfo")}>SSL Info</button>
          </div>
          <div id="advancedScanResults"></div>
        </div>
      )}

      {type === "external" && (
        <button style={styles.fullWidthButton} onClick={() => onAction("remoteTraceroute")}>
          Run Remote Traceroute
        </button>
      )}

      <div id="scanResults" style={styles.scanResults}>
        {scanResults.loading ? (
          <p>Loading scan data...</p>
        ) : scanResults.error ? (
          <p style={styles.error}><strong>Error:</strong> {scanResults.error}</p>
        ) : scanResults.data.length === 0 ? (
          <p><strong>No scans found.</strong></p>
        ) : (
          scanResults.data.map((scan, index) => (
            <div key={index} style={styles.scanResult}>
              <p><strong>Type:</strong> {scan.type}</p>
              {scan.ports && <p><strong>Ports:</strong> {scan.ports.join(", ")}</p>}
              {scan.issuer && <p><strong>SSL Issuer:</strong> {scan.issuer}</p>}
              {scan.asn && <p><strong>ASN:</strong> {scan.asn} ({scan.holder || "Unknown"})</p>}
              <p><strong>Timestamp:</strong> {new Date(scan.timestamp * 1000).toLocaleString()}</p>
              {scan.result && <p><strong>Details:</strong> {JSON.stringify(scan.result)}</p>}
            </div>
          ))
        )}
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
  },
  title: {
    margin: "0 0 10px",
    fontSize: "1.4em",
    fontWeight: "bold",
    borderBottom: "1px solid rgba(255, 255, 255, 0.2)",
    paddingBottom: "5px",
  },
  section: {
    marginTop: "15px",
    padding: "10px",
    background: "rgba(255, 255, 255, 0.1)",
    borderRadius: "8px",
  },
  scanResults: {
    marginTop: "15px",
    padding: "10px",
    background: "rgba(255, 255, 255, 0.1)",
    borderRadius: "8px",
  },
  scanResult: {
    padding: "10px",
    borderBottom: "1px solid rgba(255, 255, 255, 0.2)",
  },
  buttonGroup: {
    display: "flex",
    flexWrap: "wrap",
    gap: "10px",
    marginTop: "10px",
  },
  fullWidthButton: {
    background: "linear-gradient(135deg, #1e5799, #2989d8)",
    border: "none",
    padding: "10px 12px",
    color: "white",
    fontSize: "0.9em",
    fontWeight: "bold",
    borderRadius: "6px",
    cursor: "pointer",
    transition: "background 0.3s ease",
    width: "100%",
    textAlign: "center"
  },
  error: {
    color: "#ff4d4d",
    fontWeight: "bold",
  }
};

export default InfoBox;

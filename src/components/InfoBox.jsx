// src/components/InfoBox.jsx
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
    port
  } = nodeData;

  return (
    <div style={styles.container} onMouseEnter={(e) => e.stopPropagation()}>
      <strong>{label}</strong>
      <br />
      IP: {id}
      <br />
      MAC: {mac}
      <br />
      Role: {role}
      <br />
      {externalNetwork && (
        <>
          External Target: {externalNetwork}
          <br />
        </>
      )}
      {showScanButton && (
        <button onClick={() => onAction("scanPorts")}>Scan Ports</button>
      )}
      {showTravelButton && (
        <button onClick={() => onAction("travel")}>Travel</button>
      )}
      {showWebScanButton && (
        <button onClick={() => onAction("webScan")}>Run Web Scan</button>
      )}
      {type === "router" && open_external_port && (
        <RouterControls onAction={onAction} externalNetwork={externalNetwork} />
      )}
      {(type === "network" || type === "external") && id && (
        <div className="bgp-scan-section" style={styles.section}>
          <button onClick={() => onAction("bgpScan")}>Run BGP Scan</button>
          <div id="bgpScanResults"></div>
        </div>
      )}
      {port && (
        <div className="advanced-port-scans" style={styles.section}>
          <strong>Advanced Port Scans:</strong>
          <br />
          <button onClick={() => onAction("bannerGrab")}>Banner Grab</button>
          <button onClick={() => onAction("cveLookup")}>Check CVE</button>
          <button onClick={() => onAction("reverseDNS")}>Reverse DNS</button>
          <button onClick={() => onAction("sslInfo")}>SSL Info</button>
          <div id="advancedScanResults"></div>
        </div>
      )}
      {type === "external" && (
        <button onClick={() => onAction("remoteTraceroute")}>
          Run Remote Traceroute
        </button>
      )}
      {/* Scan results container */}
      <div id="scanResults" style={styles.scanResults}>
        {scanResults.loading ? (
          "Loading scan data..."
        ) : scanResults.error ? (
          <strong>Error: {scanResults.error}</strong>
        ) : scanResults.data.length === 0 ? (
          <strong>No scans found.</strong>
        ) : (
          scanResults.data.map((scan, index) => (
            <div key={index} style={styles.scanResult}>
              <strong>Type:</strong> {scan.type}
              <br />
              {scan.ports && (
                <>
                  <strong>Ports:</strong> {scan.ports.join(", ")}
                  <br />
                </>
              )}
              {scan.issuer && (
                <>
                  <strong>SSL Issuer:</strong> {scan.issuer}
                  <br />
                </>
              )}
              {scan.asn && (
                <>
                  <strong>ASN:</strong> {scan.asn} ({scan.holder || "Unknown"})
                  <br />
                </>
              )}
              <strong>Timestamp:</strong>{" "}
              {new Date(scan.timestamp * 1000).toLocaleString()}
              <br />
              {/* If you store detailed info under scan.result, render it here */}
              {scan.result && (
                <>
                  <strong>Details:</strong> {JSON.stringify(scan.result)}
                  <br />
                </>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

const styles = {
  container: {
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    color: "white",
    padding: "10px",
    borderRadius: "5px",
  },
  section: {
    marginTop: "10px",
  },
  scanResults: {
    marginTop: "10px",
  },
  scanResult: {
    marginTop: "5px",
    padding: "5px",
    border: "1px solid white",
  },
};

export default InfoBox;

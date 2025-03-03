// AdvancedScanResults.jsx
import React, { useState, useEffect } from 'react';

/**
 * Component for displaying advanced port scan results
 * @param {Object} props
 * @param {Object} props.advancedResults - Object containing advanced scan results
 * @param {Function} props.onAction - Function to handle scan actions
 * @param {Object} props.nodeData - Data for the selected node
 * @param {Boolean} props.scanCooldownActive - Whether scan cooldown is active
 * @param {Boolean} props.loading - Whether data is currently loading
 */
const AdvancedScanResults = ({ advancedResults, onAction, nodeData, scanCooldownActive, loading }) => {
  const [activeTab, setActiveTab] = useState(null);
  const [prevPort, setPrevPort] = useState(null);

  // Organize results by scan type for the current port
  const resultsByType = {};
  if (advancedResults && Array.isArray(advancedResults)) {
    advancedResults.forEach((result) => {
      // Make sure port comparison is done with numbers, not strings
      if (parseInt(result.port, 10) === parseInt(nodeData.port, 10)) {
        resultsByType[result.scan_type] = result.results;
        
        // For debugging
        console.log(`Found ${result.scan_type} result for port ${result.port}:`, result.results);
      }
    });
  }

  // Reset the active tab when node changes
  useEffect(() => {
    // Reset the active tab when node changes or when new results arrive
    if ((!activeTab || nodeData.port !== prevPort) && 
        advancedResults && Array.isArray(advancedResults)) {
      
      setPrevPort(nodeData.port);
      
      // Find available scan types for this port
      const availableTypes = advancedResults
        .filter(result => parseInt(result.port, 10) === parseInt(nodeData.port, 10))
        .map(result => result.scan_type);
      
      if (availableTypes.length > 0) {
        setActiveTab(availableTypes[0]);
        console.log(`Auto-selected scan type: ${availableTypes[0]}`);
      } else {
        setActiveTab(null);
      }
    }
  }, [advancedResults, nodeData.port, activeTab, prevPort]);  


// Update the renderTabContent function to better handle the data formats

const renderTabContent = () => {
    if (loading) {
      return <p>Loading scan data...</p>;
    }
    
    if (!activeTab || !resultsByType[activeTab]) {
      return <p>No results available for {activeTab || 'selected scan'}. Run the scan first.</p>;
    }
  
    const resultData = resultsByType[activeTab];
    console.log(`Displaying ${activeTab} data:`, resultData); // For debugging
  
    let content;
    // Render based on the type of scan
    switch (activeTab) {
      case 'bannerGrab':
        content = (
          <div style={styles.contentContainer}>
            <h4>Banner Grab Results</h4>
            <pre style={styles.preformatted}>
              {typeof resultData === 'string' ? resultData : JSON.stringify(resultData, null, 2)}
            </pre>
          </div>
        );
        break;
        
      case 'reverseDNS':
        content = (
          <div style={styles.contentContainer}>
            <h4>Reverse DNS Lookup</h4>
            <p>
              <strong>Hostname:</strong> {typeof resultData === 'string' ? resultData : (resultData?.hostname || 'Unknown')}
            </p>
          </div>
        );
        break;
        
      case 'sslInfo':
        content = (
          <div style={styles.contentContainer}>
            <h4>SSL Certificate Info</h4>
            {typeof resultData === 'string' ? (
              <p>{resultData}</p>
            ) : (
              <>
                <p><strong>Issuer:</strong> {resultData.issuer || 'Unknown'}</p>
                <p><strong>Valid From:</strong> {resultData.notBefore || 'N/A'}</p>
                <p><strong>Valid To:</strong> {resultData.notAfter || 'N/A'}</p>
              </>
            )}
          </div>
        );
        break;
        
      case 'cveLookup':
        content = (
          <div style={styles.contentContainer}>
            <h4>CVE Lookup Results</h4>
            {typeof resultData === 'string' ? (
              <p>{resultData}</p>
            ) : (resultData && resultData.vulnerabilities && resultData.vulnerabilities.length > 0 ? (
              <ul style={styles.cveList}>
                {resultData.vulnerabilities.map((cve, idx) => (
                  <li key={idx} style={styles.cveItem}>
                    <strong>{cve.cve?.id || 'Unknown CVE'}</strong>
                    <p>{cve.cve?.description?.description_data[0]?.value || 'No description available'}</p>
                    <span className="severity">
                      Severity: {cve.impact?.baseMetricV2?.severity || 'N/A'}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p>No vulnerabilities found or data format not recognized.</p>
            ))}
          </div>
        );
        break;
        
      default:
        content = <p>Select a scan type to see results.</p>;
    }
  
    // Add a refresh button to re-run the scan if needed
    return (
      <>
        {content}
        <div style={{ marginTop: '10px', textAlign: 'right' }}>
          <button
            onClick={() => onAction(activeTab)}
            style={{
              padding: '6px 10px',
              fontSize: '0.8em',
              cursor: 'pointer'
            }}
          >
            Refresh Scan
          </button>
        </div>
      </>
    );
  };
  

  const handleScanClick = (scanType) => {
    setActiveTab(scanType);
    // Only trigger the scan action if there's no result already.
    if (!resultsByType[scanType]) {
      onAction(scanType);
    }
  };
  // Check if this is a web port (80 or 443)
  const portNumber = parseInt(nodeData.port, 10);
  const isWebPort = portNumber === 80 || portNumber === 443; 
  // Check which scan types have results
  const hasBannerResult = Boolean(resultsByType['bannerGrab']);
  const hasCveResult = Boolean(resultsByType['cveLookup']);
  const hasDnsResult = Boolean(resultsByType['reverseDNS']);
  const hasSslResult = Boolean(resultsByType['sslInfo']);
  console.log(`Port ${portNumber} is web port: ${isWebPort}, has DNS result: ${hasDnsResult}`);
  return (
    <div style={styles.container}>
      <h3>Advanced Port Scans</h3>
      
      <div style={styles.tabBar}>
        <button 
          style={{
            ...styles.tabButton,
            ...(activeTab === 'bannerGrab' ? styles.activeTab : {}),
            ...(hasBannerResult ? styles.hasResultsTab : {}),
            opacity: scanCooldownActive ? 0.5 : 1
          }}
          onClick={() => handleScanClick('bannerGrab')}
          disabled={scanCooldownActive}
        >
          {scanCooldownActive ? 'Cooldown...' : 'Banner'}
        </button>
        
        <button 
          style={{
            ...styles.tabButton,
            ...(activeTab === 'cveLookup' ? styles.activeTab : {}),
            ...(hasCveResult ? styles.hasResultsTab : {}),
            opacity: scanCooldownActive ? 0.5 : 1
          }}
          onClick={() => handleScanClick('cveLookup')}
          disabled={scanCooldownActive}
        >
          {scanCooldownActive ? 'Cooldown...' : 'CVE'}
        </button>
        
        <button 
          style={{
            ...styles.tabButton,
            ...(activeTab === 'reverseDNS' ? styles.activeTab : {}),
            ...(hasDnsResult ? styles.hasResultsTab : {}),
            opacity: scanCooldownActive ? 0.5 : 1
          }}
          onClick={() => handleScanClick('reverseDNS')}
          disabled={scanCooldownActive}
        >
          {scanCooldownActive ? 'Cooldown...' : 'DNS'}
        </button>
        
        <button 
          style={{
            ...styles.tabButton,
            ...(activeTab === 'sslInfo' ? styles.activeTab : {}),
            ...(hasSslResult ? styles.hasResultsTab : {}),
            opacity: scanCooldownActive ? 0.5 : 1
          }}
          onClick={() => handleScanClick('sslInfo')}
          disabled={scanCooldownActive}
        >
          {scanCooldownActive ? 'Cooldown...' : 'SSL'}
        </button>
      </div>
      
      <div style={styles.tabContent}>
        {renderTabContent()}
      </div>
    </div>
  );
};

const styles = {
  container: {
    marginTop: '15px',
    padding: '15px',
    background: 'rgba(255, 255, 255, 0.1)',
    borderRadius: '8px',
  },
  tabBar: {
    display: 'flex',
    borderBottom: '1px solid rgba(255, 255, 255, 0.2)',
    marginBottom: '15px',
  },
  tabButton: {
    background: 'transparent',
    border: 'none',
    color: 'white',
    padding: '8px 12px',
    margin: '0 4px',
    cursor: 'pointer',
    borderTopLeftRadius: '6px',
    borderTopRightRadius: '6px',
    fontSize: '0.9em',
    fontWeight: 'bold',
    flex: 1,
    textAlign: 'center',
    transition: 'all 0.2s ease'
  },
  activeTab: {
    background: 'rgba(255, 255, 255, 0.15)',
    borderBottom: '2px solid #4d90fe'
  },
  hasResultsTab: {
    borderBottom: '2px solid #4CAF50'
  },
  tabContent: {
    minHeight: '150px',
    padding: '10px',
    background: 'rgba(0, 0, 0, 0.3)',
    borderRadius: '6px',
  },
  contentContainer: {
    padding: '10px',
  },
  preformatted: {
    background: 'rgba(0, 0, 0, 0.4)',
    padding: '10px',
    borderRadius: '4px',
    fontFamily: 'monospace',
    fontSize: '0.9em',
    overflow: 'auto',
    maxHeight: '200px',
    wordBreak: 'break-all',
    whiteSpace: 'pre-wrap'
  },
  cveList: {
    listStyle: 'none',
    padding: '0',
    margin: '0',
    maxHeight: '200px',
    overflow: 'auto',
  },
  cveItem: {
    padding: '8px',
    margin: '5px 0',
    background: 'rgba(0, 0, 0, 0.4)',
    borderRadius: '4px',
    borderLeft: '3px solid #e74c3c'
  }
};

export default AdvancedScanResults;
import React, { useState, useEffect } from 'react';

const RouterControls = ({ onAction, externalNetwork }) => {
  // Log when the component mounts and renders to help debug
  useEffect(() => {
    console.log("RouterControls mounted with externalNetwork:", externalNetwork);
  }, [externalNetwork]);

  const [showSelector, setShowSelector] = useState(false);
  const [selectedValue, setSelectedValue] = useState("8.8.8.8");
  const [customValue, setCustomValue] = useState("");

  // Set initial value based on current externalNetwork if available
  useEffect(() => {
    if (externalNetwork) {
      if (["8.8.8.8", "1.1.1.1", "208.67.222.222"].includes(externalNetwork)) {
        setSelectedValue(externalNetwork);
      } else {
        setSelectedValue("custom");
        setCustomValue(externalNetwork);
      }
    }
  }, [externalNetwork]);

  const toggleSelector = () => {
    console.log("Toggle selector called, current state:", showSelector);
    setShowSelector(!showSelector);
  };

  const handleDropdownChange = (e) => {
    setSelectedValue(e.target.value);
  };

  const handleCustomChange = (e) => {
    setCustomValue(e.target.value);
  };

  const handleSubmit = () => {
    const target = selectedValue === "custom" ? customValue : selectedValue;
    console.log("Submitting external network:", target);
    onAction("submitExternalNetwork", target);
    // Close the selector after submission
    setShowSelector(false);
  };

  const handleRemoteTraceroute = () => {
    onAction("remoteTraceroute");
  };

  return (
    <div style={styles.container}>
      <button style={styles.button} onClick={toggleSelector}>
        {showSelector ? "Cancel" : "Change External Network"}
      </button>
      
      {showSelector && (
        <div style={styles.selectorContainer}>
          <select 
            style={styles.select} 
            onChange={handleDropdownChange} 
            value={selectedValue}
          >
            <option value="8.8.8.8">Google DNS (8.8.8.8)</option>
            <option value="1.1.1.1">Cloudflare (1.1.1.1)</option>
            <option value="208.67.222.222">OpenDNS (208.67.222.222)</option>
            <option value="custom">Custom...</option>
          </select>
          
          {selectedValue === "custom" && (
            <input
              type="text"
              placeholder="Enter custom IP"
              style={styles.input}
              value={customValue}
              onChange={handleCustomChange}
            />
          )}
          
          <button style={styles.button} onClick={handleSubmit}>Submit</button>
        </div>
      )}
      
      <button style={styles.button} onClick={handleRemoteTraceroute}>
        Run Remote Traceroute
      </button>
    </div>
  );
};

const styles = {
  container: {
    marginTop: "15px",
    padding: "12px",
    borderRadius: "12px",
    background: "rgba(255, 255, 255, 0.1)",
    backdropFilter: "blur(10px)",
    boxShadow: "0 4px 20px rgba(0, 0, 0, 0.3)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "10px",
  },
  selectorContainer: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    width: "100%",
    alignItems: "center",
  },
  select: {
    width: "100%",
    padding: "8px",
    borderRadius: "6px",
    border: "none",
    background: "rgba(255, 255, 255, 0.2)",
    color: "white",
    fontSize: "0.9em",
  },
  input: {
    width: "calc(100% - 10px)",
    padding: "8px",
    borderRadius: "6px",
    border: "none",
    background: "rgba(255, 255, 255, 0.2)",
    color: "white",
    fontSize: "0.9em",
    textAlign: "center",
  },
  button: {
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
    textAlign: "center",
  },
};

export default RouterControls;
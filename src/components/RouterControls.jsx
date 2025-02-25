// src/components/RouterControls.jsx
import React, { useState } from 'react';

const RouterControls = ({ onAction, externalNetwork }) => {
  const [showSelector, setShowSelector] = useState(false);
  const [selectedValue, setSelectedValue] = useState("8.8.8.8");
  const [customValue, setCustomValue] = useState("");

  const toggleSelector = () => {
    setShowSelector(!showSelector);
  };

  const handleDropdownChange = (e) => {
    setSelectedValue(e.target.value);
  };

  const handleCustomChange = (e) => {
    setCustomValue(e.target.value);
  };

  const handleSubmit = () => {
    // Use custom input if "custom" is selected, otherwise use the preset value.
    const target = selectedValue === "custom" ? customValue : selectedValue;
    onAction("submitExternalNetwork", target);
  };

  const handleRemoteTraceroute = () => {
    onAction("remoteTraceroute");
  };

  return (
    <div className="router-controls" style={styles.container}>
      <button onClick={toggleSelector}>Change External Network</button>
      {showSelector && (
        <div id="externalNetworkSelector" style={{ marginTop: "10px" }}>
          <select onChange={handleDropdownChange} value={selectedValue}>
            <option value="8.8.8.8">Google DNS (8.8.8.8)</option>
            <option value="1.1.1.1">Cloudflare (1.1.1.1)</option>
            <option value="208.67.222.222">OpenDNS (208.67.222.222)</option>
            <option value="custom">Custom...</option>
          </select>
          {selectedValue === "custom" && (
            <input
              type="text"
              placeholder="Enter custom IP"
              style={{ marginLeft: "5px" }}
              value={customValue}
              onChange={handleCustomChange}
            />
          )}
          <button onClick={handleSubmit} style={{ marginLeft: "5px" }}>
            Submit
          </button>
        </div>
      )}
      <br />
      <button onClick={handleRemoteTraceroute}>Run Remote Traceroute</button>
    </div>
  );
};

const styles = {
  container: {
    marginTop: "10px",
    padding: "5px",
    border: "1px solid #ccc",
    borderRadius: "3px",
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
};

export default RouterControls;

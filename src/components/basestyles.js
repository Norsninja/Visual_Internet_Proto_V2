// baseStyles.js
export const baseStyles = {
    container: {
      background: "rgba(0, 0, 0, 0.85)",
      backdropFilter: "blur(10px)",
      borderRadius: "12px",
      color: "white",
      padding: "16px",
      boxShadow: "0 4px 20px rgba(0, 0, 0, 0.5)",
      width: "100%",
      maxWidth: "400px",
      fontFamily: "'Arial', sans-serif",
    },
    header: {
      marginBottom: "16px",
      borderBottom: "1px solid rgba(255, 255, 255, 0.15)",
      paddingBottom: "12px",
    },
    title: {
      margin: "0 0 8px 0",
      fontSize: "1.5em",
      fontWeight: "bold",
    },
    subtitle: {
      margin: "0",
      fontSize: "1em",
      opacity: 0.8,
    },
    section: {
      marginBottom: "16px",
    },
    sectionTitle: {
      fontSize: "1.1em",
      margin: "0 0 10px 0",
      fontWeight: "bold",
    },
    dataItem: {
      padding: "8px 12px",
      background: "rgba(255, 255, 255, 0.07)",
      borderRadius: "4px",
      margin: "6px 0",
      display: "flex",
      justifyContent: "space-between",
    },
    dataLabel: {
      fontWeight: "normal",
      color: "rgba(255, 255, 255, 0.6)",
    },
    dataValue: {
      fontWeight: "500",
      maxWidth: "250px",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    },
    actionsContainer: {
      display: "flex",
      gap: "8px",
      marginTop: "16px",
    },
    actionButton: {
      border: "none",
      padding: "10px 0",
      fontWeight: "600",
      borderRadius: "6px",
      cursor: "pointer",
      transition: "all 0.2s ease",
      flex: "1",
      fontSize: "0.9em",
    },
    emptyMessage: {
      textAlign: "center",
      padding: "12px 8px",
      fontStyle: "italic",
      opacity: 0.6,
      background: "rgba(0, 0, 0, 0.2)",
      borderRadius: "6px",
    },
  };
  
  // You could also add a function to help create node-specific styles
  export const createNodeStyles = (nodeType) => {
    const borderColor = nodeType === "web" ? "#ff69b4" : 
                        nodeType === "asn" ? "#FFD700" : 
                        nodeType === "external" ? "#ff4d4d" : "#0099FF";
    
    const titleColor = borderColor;
    
    const buttonGradient = nodeType === "web" ? "linear-gradient(135deg, #ff2f92, #ff69b4)" :
                           nodeType === "asn" ? "linear-gradient(135deg, #B8860B, #FFD700)" :
                           nodeType === "external" ? "linear-gradient(135deg, #d32f2f, #ff4d4d)" :
                           "linear-gradient(135deg, #0277bd, #0099FF)";
    
    const buttonTextColor = nodeType === "asn" ? "black" : "white";
    
    return {
      container: {
        ...baseStyles.container,
        borderLeft: `4px solid ${borderColor}`,
      },
      title: {
        ...baseStyles.title,
        color: titleColor,
      },
      actionButton: {
        ...baseStyles.actionButton,
        background: buttonGradient,
        color: buttonTextColor,
      }
    };
  };
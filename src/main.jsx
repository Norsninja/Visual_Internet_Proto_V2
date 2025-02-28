// main.js
import React from 'react';
import { createRoot } from 'react-dom/client';
import { UIProvider } from './components/UIContext.jsx';
import UIManager from './ui.jsx';
import ThreeCanvas from './components/ThreeCanvas.jsx';

// Create a container for the React app
const appContainer = document.createElement('div');
appContainer.id = 'app-root';
document.body.appendChild(appContainer);

// Define the App component that includes ThreeCanvas and UIManager
const App = () => {
  return (
    <UIProvider>
      <div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
        {/* Render canvas with a lower z-index */}
        <div id= "threejs-container" style={{ position: 'absolute', top: 0, left: 0, zIndex: 1, width: '100%', height: '100%' }}>
          <ThreeCanvas />
        </div>
        {/* Render UI overlay on top.
            Note the pointerEvents style: setting it to "none" lets mouse events fall through. */}
        <div
          id="react-ui-container"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            zIndex: 2,
            width: '100%',
            height: '100%',
            pointerEvents: 'none'
          }}
        >
          {/* If your UI components need to be interactive, wrap them in a container with pointerEvents: 'auto' */}
          <div style={{ pointerEvents: 'auto' }}>
            <UIManager />
          </div>
        </div>
      </div>
    </UIProvider>
  );
};

// Render the App
const reactRoot = createRoot(appContainer);
reactRoot.render(<App />);

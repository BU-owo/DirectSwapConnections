/**
 * Entry Point - React Application
 * Initializes React app with error boundary, global styling, and hash-based routing.
 * Mounts the App component to the DOM root element.
 */
import React from "react";
// Root entry point for React 18+
import { createRoot } from "react-dom/client";
// HashRouter enables client-side routing using URL hash (e.g., /#/browse)
import { HashRouter } from "react-router-dom";
// Main app component with routing and layout
import App from "./App";
// Error boundary to catch React component errors gracefully
import ErrorBoundary from "./components/ErrorBoundary";
// Global styles for the entire application
import "../styles.css";
// React-specific style overrides
import "./react-overrides.css";

// Create React root and mount the application
createRoot(document.getElementById("root")).render(
  // StrictMode enables additional development checks for component issues
  <React.StrictMode>
    {/* Error boundary wraps entire app to catch and display errors */}
    <ErrorBoundary>
      {/* Hash-based routing for client-side navigation */}
      <HashRouter>
        {/* Main app component with all routes */}
        <App />
      </HashRouter>
    </ErrorBoundary>
  </React.StrictMode>
);

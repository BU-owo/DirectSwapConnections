/**
 * Error Boundary Component
 * Catches React component errors and displays a user-friendly error page instead of crashing.
 * Uses React's Error Boundary lifecycle methods to gracefully handle runtime exceptions.
 */
import React, { Component } from "react";

/**
 * Error Boundary - catches errors in child components
 * Prevents entire app from crashing when a component throws an error.
 * Logs errors to console for debugging while showing user-friendly UI.
 */
export default class ErrorBoundary extends Component {
  /**
   * Constructor - initializes state for error tracking
   * @param {Object} props - React component props
   */
  constructor(props) {
    super(props);
    // State to track whether error has occurred
    this.state = {
      // Flag indicating an error has been caught
      hasError: false,
      // Error message to display to user
      message: "",
    };
  }

  /**
   * Static lifecycle method called when an error is thrown by a child component.
   * Updates state to trigger error UI rendering.
   * @param {Error} error - The error that was thrown
   * @returns {Object} New state object
   */
  static getDerivedStateFromError(error) {
    // Return new state to render error UI
    return {
      // Mark that an error occurred
      hasError: true,
      // Extract error message or use default
      message: error?.message || "Unexpected runtime error",
    };
  }

  /**
   * Lifecycle method called after an error has been thrown by a child component.
   * Used for side effects like logging to error reporting service.
   * @param {Error} error - The error that was thrown
   */
  componentDidCatch(error) {
    // Log error to browser console for developer debugging
    console.error("App runtime error:", error);
  }

  /**
   * Render method - shows error UI or children based on state
   * @returns {React.ReactElement} Error page or child components
   */
  render() {
    // If no error occurred, render children normally
    if (!this.state.hasError) return this.props.children;

    // Error occurred - render user-friendly error page
    return (
      <div style={{ minHeight: "100vh", background: "#fff", color: "#1a1a1a", padding: "2rem" }}>
        {/* Error heading in red */}
        <h1 style={{ marginBottom: "0.75rem", color: "#990000" }}>Application failed to load</h1>

        {/* Explanation text */}
        <p style={{ marginBottom: "0.5rem" }}>
          A runtime error prevented the page from rendering.
        </p>

        {/* Error message in monospace font for technical clarity */}
        <p style={{ fontFamily: "monospace", background: "#f8f8f8", padding: "0.65rem", borderRadius: "8px" }}>
          {/* Display the error message extracted in getDerivedStateFromError */}
          {this.state.message}
        </p>

        {/* Helper text directing user to console for more details */}
        <p style={{ marginTop: "1rem" }}>Open the browser console for full details.</p>
      </div>
    );
  }
}

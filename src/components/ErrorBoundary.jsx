import React, { Component } from "react";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      message: error?.message || "Unexpected runtime error",
    };
  }

  componentDidCatch(error) {
    console.error("App runtime error:", error);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div style={{ minHeight: "100vh", background: "#fff", color: "#1a1a1a", padding: "2rem" }}>
        <h1 style={{ marginBottom: "0.75rem", color: "#990000" }}>Application failed to load</h1>
        <p style={{ marginBottom: "0.5rem" }}>
          A runtime error prevented the page from rendering.
        </p>
        <p style={{ fontFamily: "monospace", background: "#f8f8f8", padding: "0.65rem", borderRadius: "8px" }}>
          {this.state.message}
        </p>
        <p style={{ marginTop: "1rem" }}>Open the browser console for full details.</p>
      </div>
    );
  }
}

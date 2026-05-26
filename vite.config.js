/**
 * Vite Configuration
 * Build and dev server configuration for the React + Vite project.
 * Configures base path, dev server port, and build output settings.
 */
import { defineConfig } from "vite";

/**
 * Vite configuration export
 * @param {Object} config - Vite config object
 * @param {string} config.mode - Build mode (development/production)
 */
export default defineConfig(({ mode }) => ({
  // Base public path for the application
  // "/" means app is served from root (works with custom domain terrierhousing.com)
  // Use "./" for subpath deployments (e.g., "/app/" would need base: "/app/")
  base: "/",

  // Development server configuration
  server: {
    // Port for dev server (localhost:4173)
    // Use npm run dev to start server on this port
    port: 4173,
  },
}));

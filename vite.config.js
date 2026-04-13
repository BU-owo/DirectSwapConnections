import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
  // GitHub Pages serves this repo from /DirectSwapConnections/ in production.
  base: mode === "production" ? "/DirectSwapConnections/" : "/",
  server: {
    port: 4173,
  },
}));

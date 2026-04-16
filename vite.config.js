import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
  // Custom domain terrierhousing.com — serve from root in production.
  base: "/",
  server: {
    port: 4173,
  },
}));

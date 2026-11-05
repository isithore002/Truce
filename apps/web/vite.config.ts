import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// The browser talks to the API on the same origin; Vite forwards /api and /healthz to the Node server.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:8787",
      "/healthz": "http://127.0.0.1:8787",
    },
  },
  test: { environment: "node" },
});

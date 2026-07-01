import path from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // The service mounts its API under /api (see services/rfq/src/index.ts), so the
      // path passes through unchanged — dev and production share the same URL layout.
      "/api": {
        target: "http://localhost:3901",
        changeOrigin: true,
      },
    },
  },
})

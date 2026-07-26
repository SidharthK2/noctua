import path from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, loadEnv } from "vite"

export default defineConfig(({ mode }) => {
  // Absolute public URL of the deployment (e.g. the Railway URL), consumed by the OG/SEO tags
  // in index.html. Unset → empty string, leaving relative /og-image.png paths that most
  // scrapers ignore — set it before building for production.
  const appUrl = (loadEnv(mode, __dirname, "VITE_").VITE_APP_URL ?? "").replace(/\/+$/, "")

  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: "html-app-url",
        transformIndexHtml: (html: string) => html.replaceAll("%VITE_APP_URL%", appUrl),
      },
    ],
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
  }
})

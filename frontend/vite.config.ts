// frontend/vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },

      // ✅ ADD THESE so Swagger "Try it out" works on :5173
      "/v1": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
      "/verify": { target: "http://127.0.0.1:8000", changeOrigin: true },
      "/verify/tree": { target: "http://127.0.0.1:8000", changeOrigin: true },
      "/receipt": { target: "http://127.0.0.1:8000", changeOrigin: true },
      "/health": { target: "http://127.0.0.1:8000", changeOrigin: true },
      "/version": { target: "http://127.0.0.1:8000", changeOrigin: true },
      "/propose": { target: "http://127.0.0.1:8000", changeOrigin: true },
      "/sign": { target: "http://127.0.0.1:8000", changeOrigin: true },
      "/proof": { target: "http://127.0.0.1:8000", changeOrigin: true },
      "/anchor": { target: "http://127.0.0.1:8000", changeOrigin: true },

      // you already have these:
      "/openapi.json": { target: "http://127.0.0.1:8000", changeOrigin: true },
      "/docs": { target: "http://127.0.0.1:8000", changeOrigin: true },
      "/redoc": { target: "http://127.0.0.1:8000", changeOrigin: true },
    },
  },
});
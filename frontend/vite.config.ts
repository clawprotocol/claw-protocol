// frontend/vite.config.ts
/// <reference types="vitest/config" />
import { execSync } from "node:child_process";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Build/deploy discriminator baked into caches whose entries must never survive a code deploy
// (e.g. the paid Pro safe-display memo). Changes every commit so a new build can never replay a
// stale repair output produced by older code. Falls back to a build timestamp outside a git repo.
function resolvePaidProCacheBuildId(): string {
  try {
    const sha = execSync("git rev-parse --short HEAD", {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
    if (sha) return sha;
  } catch {
    // not a git checkout (e.g. tarball deploy) — fall through to timestamp
  }
  return `t${Date.now()}`;
}

export default defineConfig({
  define: {
    __PAID_PRO_CACHE_BUILD_ID__: JSON.stringify(resolvePaidProCacheBuildId()),
  },
  plugins: [react()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
  server: {
    // Allow any host in dev (Railway preview, LAN, localhost). Set VITE_DEV_ALLOWED_HOST to restrict.
    allowedHosts: process.env.VITE_DEV_ALLOWED_HOST
      ? [process.env.VITE_DEV_ALLOWED_HOST]
      : true,
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
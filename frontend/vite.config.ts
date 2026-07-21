// frontend/vite.config.ts
/// <reference types="vitest/config" />
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import {
  PAID_PRO_PIPELINE_LONG_INCLUDE,
  PAID_PRO_PIPELINE_LONG_TEST_TIMEOUT_MS,
} from "./vitest.paidProPipelineLong.config";
import { resolveFrontendBuildIdentity } from "./src/lib/frontendBuildMeta";

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

function resolveGitCommitFull(): string {
  const fromEnv =
    process.env.RAILWAY_GIT_COMMIT_SHA?.trim() ||
    process.env.RAILWAY_GIT_COMMIT?.trim() ||
    "";
  if (fromEnv) return fromEnv;
  try {
    return execSync("git rev-parse HEAD", {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    return "";
  }
}

function resolveGitCommitShort(fullSha: string): string {
  const fromEnv = process.env.RAILWAY_GIT_COMMIT?.trim();
  if (fromEnv && fromEnv.length <= 12) return fromEnv;
  if (fullSha.length >= 7) return fullSha.slice(0, 7);
  try {
    return execSync("git rev-parse --short HEAD", {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    return fullSha.slice(0, 7);
  }
}

function emitFrontendVersionJsonPlugin(outDir: string): Plugin {
  return {
    name: "emit-frontend-version-json",
    closeBundle() {
      const identity = resolveFrontendBuildIdentity(process.env, {
        gitCommit: resolveGitCommitFull(),
        gitCommitShort: resolveGitCommitShort(resolveGitCommitFull()),
        buildTimestamp: new Date().toISOString(),
      });
      writeFileSync(resolvePath(outDir, "version.json"), `${JSON.stringify(identity, null, 2)}\n`);
    },
  };
}

const frontendBuildIdentity = resolveFrontendBuildIdentity(process.env, {
  gitCommit: resolveGitCommitFull(),
  gitCommitShort: resolveGitCommitShort(resolveGitCommitFull()),
  buildTimestamp: new Date().toISOString(),
});

export default defineConfig({
  define: {
    __PAID_PRO_CACHE_BUILD_ID__: JSON.stringify(resolvePaidProCacheBuildId()),
    __FRONTEND_BUILD_IDENTITY__: JSON.stringify(frontendBuildIdentity),
  },
  plugins: [react(), emitFrontendVersionJsonPlugin("dist")],
  test: {
    projects: [
      {
        test: {
          name: "default",
          include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
          exclude: [...PAID_PRO_PIPELINE_LONG_INCLUDE],
          environment: "node",
        },
      },
      {
        test: {
          name: "paid-pro-pipeline-long",
          include: [...PAID_PRO_PIPELINE_LONG_INCLUDE],
          environment: "node",
          testTimeout: PAID_PRO_PIPELINE_LONG_TEST_TIMEOUT_MS,
        },
      },
    ],
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
      /**
       * Backend receipt verify is POST /verify and POST /verify/tree only.
       * GET /verify/:agreementId is the SPA public agreement verification route
       * (see agreementPublicVerifyPath) — must not proxy to FastAPI.
       */
      "/verify": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
        bypass(req) {
          const url = req.url ?? "";
          if (req.method === "GET" && /^\/verify\/[^/?]+/.test(url)) {
            return url;
          }
          return undefined;
        },
      },
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
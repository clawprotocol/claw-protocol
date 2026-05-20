/**
 * Public (build-time) env accessors — safe for browser bundles.
 *
 * Never import server secrets here. Server-only vars live in backend `os.getenv` only.
 * @see docs/ENVIRONMENT.md
 */

import { getApiBase, isProductionApiMisconfigured, resolveApiBase } from "../lib/clawApi";

/** Preferred public API origin at build time (`VITE_CLAW_API_BASE` or legacy `VITE_API_BASE`). */
export function readPublicApiBaseEnv(): string {
  return getApiBase();
}

export function readResolvedApiBase(): string {
  return resolveApiBase();
}

export function readPrivacyInboxEnv(): string {
  return String(import.meta.env.VITE_LAWDOG_PRIVACY_EMAIL ?? "").trim();
}

export function isProdBuild(): boolean {
  return Boolean(import.meta.env.PROD);
}

export { isProductionApiMisconfigured };

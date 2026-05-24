/**
 * Lightweight API reachability probe for split-origin deploys (static SPA + external API).
 * Same-origin production builds skip probing — the page and API share fate.
 */

import { apiUrl, getApiBase, getLawDogApiBase, isProductionApiMisconfigured } from "./clawApi";

export type ApiReachabilityState = "unknown" | "ok" | "unavailable" | "misconfigured";

let state: ApiReachabilityState = "unknown";
let lastCheckedAt = 0;
const listeners = new Set<() => void>();

const CHECK_INTERVAL_MS = 45_000;

function notify(): void {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      /* ignore */
    }
  });
}

export function getApiReachabilityState(): ApiReachabilityState {
  return state;
}

export function subscribeApiReachability(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function shouldProbeApi(): boolean {
  if (typeof window === "undefined") return false;
  if (isProductionApiMisconfigured()) return false;
  const explicit = getApiBase();
  if (import.meta.env.PROD && !explicit) return false;
  return Boolean(getLawDogApiBase());
}

export async function probeApiHealth(force = false): Promise<ApiReachabilityState> {
  if (!shouldProbeApi()) {
    state = isProductionApiMisconfigured() ? "misconfigured" : "ok";
    notify();
    return state;
  }
  const now = Date.now();
  if (!force && state === "ok" && now - lastCheckedAt < CHECK_INTERVAL_MS) {
    return state;
  }
  try {
    const res = await fetch(apiUrl("/health"), {
      method: "GET",
      credentials: "omit",
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (res.ok) {
      state = "ok";
    } else {
      state = "unavailable";
    }
  } catch {
    state = "unavailable";
  }
  lastCheckedAt = now;
  notify();
  return state;
}

export function startApiReachabilityPolling(): void {
  if (!shouldProbeApi()) {
    state = isProductionApiMisconfigured() ? "misconfigured" : "ok";
    notify();
    return;
  }
  void probeApiHealth(true);
  window.setInterval(() => {
    void probeApiHealth(false);
  }, CHECK_INTERVAL_MS);
}

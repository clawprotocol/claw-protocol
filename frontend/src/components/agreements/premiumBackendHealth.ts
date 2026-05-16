import { apiUrl } from "../../lib/clawApi";

export type PremiumBackendHealthResult = {
  ok: boolean;
  latencyMs: number;
  status?: number;
};

/** Lightweight reachability check before user-triggered Pro retry after network failure. */
export async function preflightPremiumBackendHealth(
  signal?: AbortSignal,
): Promise<PremiumBackendHealthResult> {
  const started = Date.now();
  try {
    const res = await fetch(apiUrl("/health"), {
      method: "GET",
      cache: "no-store",
      signal,
    });
    const latencyMs = Date.now() - started;
    if (import.meta.env.MODE !== "test" && import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.info("[premium-backend-preflight]", { ok: res.ok, status: res.status, latencyMs });
    }
    return { ok: res.ok, latencyMs, status: res.status };
  } catch {
    const latencyMs = Date.now() - started;
    if (import.meta.env.MODE !== "test" && import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.info("[premium-backend-preflight]", { ok: false, latencyMs });
    }
    return { ok: false, latencyMs };
  }
}

/** Wait until browser reports online, or timeout. */
export function waitForBrowserOnline(timeoutMs: number): Promise<boolean> {
  if (typeof navigator === "undefined") return Promise.resolve(true);
  if (navigator.onLine) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      window.removeEventListener("online", onOnline);
      resolve(false);
    }, timeoutMs);
    const onOnline = () => {
      window.clearTimeout(timer);
      window.removeEventListener("online", onOnline);
      resolve(true);
    };
    window.addEventListener("online", onOnline);
  });
}

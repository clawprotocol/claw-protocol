import { logProductEvent } from "./productEvents";

const SEEN = "claw_exp_seen_";

export function logExperimentExposureOnce(experimentKey: string, variant: string): void {
  if (typeof window === "undefined") return;
  try {
    const k = SEEN + experimentKey;
    if (sessionStorage.getItem(k)) return;
    sessionStorage.setItem(k, variant);
    logProductEvent("experiment_exposure", { experimentKey, variant });
  } catch {
    /* ignore */
  }
}

export function resetExposureForTests(key?: string): void {
  if (typeof window === "undefined") return;
  try {
    if (key) sessionStorage.removeItem(SEEN + key);
    else {
      for (let i = sessionStorage.length - 1; i >= 0; i--) {
        const k = sessionStorage.key(i);
        if (k?.startsWith(SEEN)) sessionStorage.removeItem(k);
      }
    }
  } catch {
    /* ignore */
  }
}

export function exposureWasLogged(key: string): boolean {
  if (typeof window === "undefined") return false;
  try {
      return Boolean(sessionStorage.getItem(SEEN + key));
  } catch {
    return false;
  }
}

/**
 * Local/e2e Playwright auth session bridge (see e2e/helpers/rcE2eAuthBridge.ts).
 *
 * Allowed only in Vite DEV or MODE=test — never on production builds / public hosts.
 */
import type { Session } from "@supabase/supabase-js";
import { isPublicProductionHostname } from "../launch/devPaymentBypass";

export const E2E_AUTH_SESSION_KEY = "claw_e2e_auth_session_v1";

export function readE2eAuthSessionForDev(): Session | null {
  const isDevOrTest = Boolean(import.meta.env?.DEV || import.meta.env?.MODE === "test");
  if (!isDevOrTest) return null;
  if (typeof window !== "undefined") {
    try {
      if (isPublicProductionHostname(window.location.hostname)) return null;
    } catch {
      /* ignore */
    }
  }
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(E2E_AUTH_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Session;
    return parsed?.user ? parsed : null;
  } catch {
    return null;
  }
}

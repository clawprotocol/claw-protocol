/**
 * Dev-only Playwright auth session bridge (see e2e/helpers/rcE2eAuthBridge.ts).
 */
import type { Session } from "@supabase/supabase-js";

export const E2E_AUTH_SESSION_KEY = "claw_e2e_auth_session_v1";

export function readE2eAuthSessionForDev(): Session | null {
  if (!import.meta.env.DEV) return null;
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

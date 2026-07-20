import type { AccessTier } from "../../access/types";

const CHECKOUT_GRANT_KEY = "claw_advanced_full_draft_checkout_ok_v1";

export function tierAllowsAdvancedFullDraftReveal(tier: AccessTier): boolean {
  return tier === "premium" || tier === "admin";
}

/**
 * Session fallback after create-flow advanced checkout (placeholder agreement id).
 * Prefer `tierAllowsAdvancedFullDraftReveal` from access; this covers stub checkout before tier syncs.
 */
export function markAdvancedFullDraftCheckoutGranted(): void {
  try {
    sessionStorage.setItem(CHECKOUT_GRANT_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

export function clearAdvancedFullDraftCheckoutGranted(): void {
  try {
    sessionStorage.removeItem(CHECKOUT_GRANT_KEY);
  } catch {
    /* ignore */
  }
}

export function peekAdvancedFullDraftCheckoutGrant(): boolean {
  try {
    return sessionStorage.getItem(CHECKOUT_GRANT_KEY) != null;
  } catch {
    return false;
  }
}

export function consumeAdvancedFullDraftCheckoutGrant(): boolean {
  try {
    if (!sessionStorage.getItem(CHECKOUT_GRANT_KEY)) return false;
    sessionStorage.removeItem(CHECKOUT_GRANT_KEY);
    return true;
  } catch {
    return false;
  }
}

/** Placeholder agreement id for checkout before a workspace row exists. */
export const CREATE_FLOW_CHECKOUT_AGREEMENT_ID = "__claw_create_checkout__";

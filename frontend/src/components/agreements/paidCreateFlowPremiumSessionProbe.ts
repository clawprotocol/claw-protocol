/**
 * Minimal premium checkout / completion session reads for create-flow entitlement probes.
 * Inlined storage keys — must not import premiumCompletionStorage (heavy import graph).
 */

const PREMIUM_COMPLETION_SNAPSHOT_KEY = "claw_premium_completion_snapshot_v1";
const PAID_PREMIUM_COMPLETION_SESSION_KEY = "claw_paid_premium_completion_session_v1";

function hasPremiumCheckoutReturnInUrl(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const u = new URL(window.location.href);
    if (u.searchParams.get("premiumCompletion") === "1") return true;
  } catch {
    /* ignore */
  }
  return false;
}

function hasStoredPaidPremiumCompletionSession(): boolean {
  if (typeof sessionStorage === "undefined") return false;
  try {
    const raw = sessionStorage.getItem(PAID_PREMIUM_COMPLETION_SESSION_KEY);
    if (raw === "1") return true;
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { v?: number; source?: string; markedAt?: number };
    return (
      parsed?.v === 1 &&
      (parsed.source === "settled_checkout" || parsed.source === "qa_bypass") &&
      typeof parsed.markedAt === "number" &&
      Number.isFinite(parsed.markedAt)
    );
  } catch {
    return false;
  }
}

export function hasPaidPremiumCompletionSessionForCreateProbe(): boolean {
  return hasPremiumCheckoutReturnInUrl() || hasStoredPaidPremiumCompletionSession();
}

export function readPremiumCompletionSnapshotPremiumAcceptedForCreateProbe(): boolean {
  if (typeof sessionStorage === "undefined") return false;
  try {
    const raw = sessionStorage.getItem(PREMIUM_COMPLETION_SNAPSHOT_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { premiumAccepted?: boolean };
    return parsed?.premiumAccepted === true;
  } catch {
    return false;
  }
}

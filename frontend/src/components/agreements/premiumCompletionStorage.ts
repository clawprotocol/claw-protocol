import type { ParsedDraftShape } from "./intakeSmartDefaults";
import type { PremiumRecipientCandidate } from "./premiumCompletionPipeline";
import type { PremiumAgreementReview } from "./premiumAgreementReviewTypes";
import type { PremiumFinalizeAudit } from "./premiumFinalizeAuditTypes";
import type { PremiumReviewRoute } from "./premiumReviewRouteTypes";
import { clearPremiumPartyNamesHandoff } from "./premiumPartyNamesHandoff";
import { clearPremiumForkUserSendMode } from "./premiumSendForkDefaults";

const KEY = "claw_premium_completion_snapshot_v1";

/** Set after the user dismisses the post-checkout success overlay (review-first path continues on-page). */
const REVEAL_DISMISSED_KEY = "claw_premium_post_checkout_reveal_dismissed_v1";

/**
 * "0" = paid agreement ready but user has not finished document review yet (hide recipient/send dominance).
 * "1" or missing = legacy / released — recipient & send surfaces may show.
 */
const RECIPIENTS_SURFACE_KEY = "claw_premium_recipients_surface_released_v1";

/** Survives refresh; paired with session snapshot — cleared only after successful send. */
export const PREMIUM_COMPLETION_DONE_LS_KEY = "claw_premium_completed";

export type PremiumCompletionSnapshot = {
  savedAt: number;
  premiumDraft: ParsedDraftShape;
  premiumParties: { name: string; role: string }[];
  recipientCandidates: PremiumRecipientCandidate[];
  /**
   * Plain-text paper body captured at completion (read-only premium view prefers this + draft rebuild
   * over a stale thin `agreementDocumentText` buffer).
   */
  premiumReadonlyPlainText?: string;
  /** Authoritative winner from dual-track/similarity-gated premium pipeline. */
  premiumWinningBodyText?: string;
  /** Post–full-draft light review; optional. */
  premiumReview?: PremiumAgreementReview | null;
  /** Deal-specific finalize audit; optional. */
  premiumFinalizeAudit?: PremiumFinalizeAudit | null;
  /** Decision layer recommendation; optional. */
  premiumReviewRoute?: PremiumReviewRoute | null;
  /** Binds snapshot to tab session + intake (stale if mismatch). */
  agreementGenerationId?: string;
  /** Fingerprint of raw intake when this snapshot was written. */
  intakeTextFingerprint?: string;
  /** Pipeline source at completion (for paid Pro quality UI). */
  premiumPipelineRenderSource?: string;
};

export function persistPremiumCompletionSnapshot(snap: Omit<PremiumCompletionSnapshot, "savedAt">): void {
  try {
    sessionStorage.removeItem(REVEAL_DISMISSED_KEY);
    sessionStorage.setItem(RECIPIENTS_SURFACE_KEY, "0");
    const payload: PremiumCompletionSnapshot = { ...snap, savedAt: Date.now() };
    sessionStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

export function readPremiumCompletionSnapshot(): PremiumCompletionSnapshot | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PremiumCompletionSnapshot;
  } catch {
    return null;
  }
}

export function clearPremiumCompletionSnapshot(): void {
  try {
    sessionStorage.removeItem(KEY);
    sessionStorage.removeItem(REVEAL_DISMISSED_KEY);
    sessionStorage.removeItem(RECIPIENTS_SURFACE_KEY);
  } catch {
    /* ignore */
  }
}

export function markPremiumPostCheckoutRevealDismissed(): void {
  try {
    sessionStorage.setItem(REVEAL_DISMISSED_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function peekPremiumPostCheckoutRevealDismissed(): boolean {
  try {
    return sessionStorage.getItem(REVEAL_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function markPremiumRecipientsSurfaceReleased(): void {
  try {
    sessionStorage.setItem(RECIPIENTS_SURFACE_KEY, "1");
  } catch {
    /* ignore */
  }
}

/** False only while key is explicitly "0" (fresh paid snapshot). Missing or "1" => treat as released (legacy sessions). */
export function peekPremiumRecipientsSurfaceReleased(): boolean {
  try {
    const v = sessionStorage.getItem(RECIPIENTS_SURFACE_KEY);
    if (v === "0") return false;
    return true;
  } catch {
    return true;
  }
}

export function markPremiumCompletionDoneInLocalStorage(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(PREMIUM_COMPLETION_DONE_LS_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function peekPremiumCompletionDoneInLocalStorage(): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    return localStorage.getItem(PREMIUM_COMPLETION_DONE_LS_KEY) === "1";
  } catch {
    return false;
  }
}

export function clearPremiumCompletionDoneInLocalStorage(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(PREMIUM_COMPLETION_DONE_LS_KEY);
  } catch {
    /* ignore */
  }
}

/** Call only after send/hydrate-to-send pipeline succeeds — not on refresh or navigation. */
export function clearPremiumCompletionStateAfterSend(): void {
  clearPremiumCompletionSnapshot();
  clearPremiumCompletionDoneInLocalStorage();
  clearPremiumForkUserSendMode();
  clearPremiumPartyNamesHandoff();
}

/**
 * Removes `premiumCompletion=1` from the URL so the post-checkout effect does not re-enter on dependency churn
 * after an abort, dismiss, or successful completion.
 */
export function stripPremiumCompletionQueryParam(): void {
  if (typeof window === "undefined") return;
  try {
    const u = new URL(window.location.href);
    if (u.searchParams.get("premiumCompletion") !== "1") return;
    u.searchParams.delete("premiumCompletion");
    const qs = u.searchParams.toString();
    window.history.replaceState(window.history.state, "", qs ? `${u.pathname}?${qs}` : u.pathname);
  } catch {
    /* ignore */
  }
}

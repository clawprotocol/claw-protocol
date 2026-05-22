import type { ParsedDraftShape } from "./intakeSmartDefaults";
import type { PremiumRecipientCandidate } from "./premiumCompletionPipeline";
import type { PremiumAgreementReview } from "./premiumAgreementReviewTypes";
import type { PremiumFinalizeAudit } from "./premiumFinalizeAuditTypes";
import type { PremiumReviewRoute } from "./premiumReviewRouteTypes";
import type { MaterialMissingItem } from "./proAgreementCompleteness";
import { clearPremiumPartyNamesHandoff } from "./premiumPartyNamesHandoff";
import { clearPremiumForkUserSendMode } from "./premiumSendForkDefaults";
import {
  clearPaidProStarterSignatureSendFromCreateFlow,
  clearPremiumSendIntent,
} from "../../launch/simpleProduct/premiumSendIntent";

const KEY = "claw_premium_completion_snapshot_v1";

/**
 * Session flag: user completed LawDog Pro checkout (Stripe return or equivalent) and must not see
 * unpaid starter/checkout upsells until Pro generation succeeds or they explicitly continue on starter.
 */
const PAID_PREMIUM_COMPLETION_SESSION_KEY = "claw_paid_premium_completion_session_v1";

export function markPaidPremiumCompletionSession(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(PAID_PREMIUM_COMPLETION_SESSION_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function clearPaidPremiumCompletionSession(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(PAID_PREMIUM_COMPLETION_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

/** True while `premiumCompletion=1` is in the URL or the paid-return session marker is set. */
export function hasPaidPremiumCompletionSession(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const u = new URL(window.location.href);
    if (u.searchParams.get("premiumCompletion") === "1") return true;
  } catch {
    /* ignore */
  }
  if (typeof sessionStorage === "undefined") return false;
  try {
    return sessionStorage.getItem(PAID_PREMIUM_COMPLETION_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

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
  /** Resolver tier at persist (e.g. `server_full_document_text`), distinct from pipeline source strings. */
  premiumRenderResolveSource?: string;
  /** True once the paid pipeline committed an accepted Pro document into this snapshot. */
  premiumAccepted?: boolean;
  /** Set when the server used a non-model structured fallback (LawDog Pro checkout still valid). */
  serverGenerationDegraded?: { code: string; message: string } | null;
  /** Structured Ask LawDog material questions (not shown in agreement body). */
  materialMissingItems?: MaterialMissingItem[];
  /** Review UX mode — source_comparison disables AI advisory + guided completion. */
  review_mode?: "source_comparison" | "generated_agreement_review";
  /** Plain text extracted from uploaded PDF/DOCX/txt for source comparison. */
  uploadedSourceDocumentText?: string | null;
  /** Malformed/empty pipeline failure — distinct from advisory material gaps. */
  structuralCatastrophic?: boolean;
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

/** Reset recipient rail until user explicitly continues from guided final review. */
export function resetPremiumRecipientsSurfaceForFinalReview(): void {
  try {
    sessionStorage.setItem(RECIPIENTS_SURFACE_KEY, "0");
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
  clearPremiumSendIntent();
  clearPaidProStarterSignatureSendFromCreateFlow();
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

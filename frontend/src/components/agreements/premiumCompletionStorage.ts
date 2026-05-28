import type { ParsedDraftShape } from "./intakeSmartDefaults";
import type { PremiumRecipientCandidate } from "./premiumCompletionPipeline";
import type {
  AgreementIntelligence,
  AgreementValidationResult,
  PremiumFinalizationResult,
} from "./premiumFullDraftApi";
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
import { clearAcceptedPremiumCanonicalCorpus } from "./acceptedPremiumCanonicalCorpus";

const KEY = "claw_premium_completion_snapshot_v1";

/**
 * Session flag: user completed LawDog Pro checkout (Stripe return or equivalent) and must not see
 * unpaid starter/checkout upsells until Pro generation succeeds or they explicitly continue on starter.
 */
const PAID_PREMIUM_COMPLETION_SESSION_KEY = "claw_paid_premium_completion_session_v1";

export type PaidPremiumCompletionSessionSource = "settled_checkout" | "qa_bypass";

export type PaidPremiumCompletionSessionMarker = {
  v: 1;
  source: PaidPremiumCompletionSessionSource;
  markedAt: number;
};

export function markPaidPremiumCompletionSession(options?: { source?: PaidPremiumCompletionSessionSource }): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    const marker: PaidPremiumCompletionSessionMarker = {
      v: 1,
      source: options?.source ?? "settled_checkout",
      markedAt: Date.now(),
    };
    sessionStorage.setItem(PAID_PREMIUM_COMPLETION_SESSION_KEY, JSON.stringify(marker));
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

export function hasPremiumCheckoutReturnInUrl(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const u = new URL(window.location.href);
    if (u.searchParams.get("premiumCompletion") === "1") return true;
  } catch {
    /* ignore */
  }
  return false;
}

export function hasStoredPaidPremiumCompletionSession(): boolean {
  if (typeof sessionStorage === "undefined") return false;
  try {
    const raw = sessionStorage.getItem(PAID_PREMIUM_COMPLETION_SESSION_KEY);
    if (raw === "1") return true;
    if (!raw) return false;
    const parsed = JSON.parse(raw) as Partial<PaidPremiumCompletionSessionMarker>;
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

export function readPaidPremiumCompletionSessionMarker(): PaidPremiumCompletionSessionMarker | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(PAID_PREMIUM_COMPLETION_SESSION_KEY);
    if (raw === "1") return { v: 1, source: "settled_checkout", markedAt: 0 };
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PaidPremiumCompletionSessionMarker>;
    if (
      parsed?.v !== 1 ||
      (parsed.source !== "settled_checkout" && parsed.source !== "qa_bypass") ||
      typeof parsed.markedAt !== "number" ||
      !Number.isFinite(parsed.markedAt)
    ) {
      return null;
    }
    return parsed as PaidPremiumCompletionSessionMarker;
  } catch {
    return null;
  }
}

/** True while `premiumCompletion=1` is in the URL or the paid-return session marker is set. */
export function hasPaidPremiumCompletionSession(): boolean {
  return hasPremiumCheckoutReturnInUrl() || hasStoredPaidPremiumCompletionSession();
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
  /** Immutable accepted Pro corpus — display/copy/final review/VS01 must match this after acceptance. */
  acceptedPremiumCanonicalText?: string;
  acceptedPremiumCanonicalHash?: string;
  acceptedPremiumCanonicalPipelineSource?: string;
  /** Product-level alias: the paid Pro lifecycle source of truth after server_full_draft acceptance. */
  paidProSourceOfTruthText?: string;
  paidProSourceOfTruthHash?: string;
  paidProSourceOfTruthAcceptedAt?: number;
  paidProSourceOfTruthSource?: "server_full_draft";
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
  /** First-stage OpenAI semantic extraction. Passive routing input. */
  agreementIntelligence?: AgreementIntelligence | null;
  /** Deterministic draft validation result. Passive routing input. */
  agreementValidation?: AgreementValidationResult | null;
  /** Explicit Phase 4 premium finalization result, written only when the route is called. */
  premiumFinalization?: PremiumFinalizationResult | null;
  /** Idempotency guard for the last premium finalization input. */
  premiumFinalizationInputSignature?: string | null;
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
  clearAcceptedPremiumCanonicalCorpus();
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

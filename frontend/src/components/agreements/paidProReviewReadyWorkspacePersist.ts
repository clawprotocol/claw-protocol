/**
 * Persist one workspace agreement row when authenticated Genesis/Pro review-ready
 * generation completes — before signer setup, review sharing, or signature prep.
 *
 * Hard rule: never POST /draft or consume Genesis allowance until the review body
 * is visibly paint-ready from the immutable review-session authority hash.
 */

import {
  canPersistFromPaidProReviewSessionAuthority,
  bindPaidProReviewSessionAuthorityAgreementId,
  resolvePaidProReviewSessionAuthorityPersistPlain,
  hasPaidProReviewSessionAuthority,
} from "./paidProReviewSessionAuthority";
import { hashPaidProCorpus } from "./paidProSourceOfTruthState";
import {
  resolvePaidProFirstReviewVisibleDisplayPlain,
} from "./paidProFirstReviewDisplayAuthority";
import { hasPaidProSourceOfTruth, getPaidProSourceOfTruthText } from "./paidProSourceOfTruth";

const REVIEW_BODY_PAINT_MIN_LEN = 1001;

export type ReviewReadyWorkspacePersistResult =
  | { ok: true; agreementId: string; created: boolean }
  | {
      ok: false;
      reason:
        | "not_required"
        | "persist_failed"
        | "review_body_not_visibly_paint_ready"
        | "persist_hash_diverges_from_authority"
        | "missing_review_session_authority";
    };

export function shouldRequireWorkspacePersistOnReviewReady(args: {
  canonicalReviewEntered: boolean;
  hasReviewAgreementId: boolean;
  /** Paid/Genesis create path (skips free-starter submit latch). */
  skipFreeStarterCreateSubmit: boolean;
}): boolean {
  if (!args.canonicalReviewEntered) return false;
  if (args.hasReviewAgreementId) return false;
  if (!args.skipFreeStarterCreateSubmit) return false;
  return true;
}

/**
 * Auto-persist effect historically bailed once authoritative UI committed — but paid/Genesis
 * corpus only becomes persistable after that commit. Allow the effect for entitled create.
 */
export function shouldRunAutoPersistAfterAuthoritativeCommit(args: {
  authoritativePremiumUiCommitted: boolean;
  skipFreeStarterCreateSubmit: boolean;
}): boolean {
  if (!args.authoritativePremiumUiCommitted) return true;
  return Boolean(args.skipFreeStarterCreateSubmit);
}

export type ReviewReadyPersistFailureUiPlan = {
  premiumPersistedFlowActive: false;
  premiumSendPathUnlocked: false;
  proFullDraftQualityRetry: true;
  /** Do not leave the shell presenting a saved/generated agreement. */
  presentAsSavedAgreement: false;
};

export function planReviewReadyPersistFailureUi(): ReviewReadyPersistFailureUiPlan {
  return {
    premiumPersistedFlowActive: false,
    premiumSendPathUnlocked: false,
    proFullDraftQualityRetry: true,
    presentAsSavedAgreement: false,
  };
}

/**
 * Visible first-review paint readiness from the same authority that will be persisted.
 * Empty / awaiting_display_authority shells must never reach POST /draft.
 */
export function isPaidProReviewBodyVisiblyPaintReady(args?: {
  agreementId?: string | null;
  persistCorpusPlain?: string | null;
}): { ready: boolean; reason: string; paintHash: string | null; authorityHash: string | null } {
  const authorityGate = canPersistFromPaidProReviewSessionAuthority({
    persistCorpusPlain: args?.persistCorpusPlain,
    visiblePaintReady: true,
  });
  if (!authorityGate.ok) {
    return {
      ready: false,
      reason: authorityGate.reason,
      paintHash: null,
      authorityHash: null,
    };
  }
  const paint = resolvePaidProFirstReviewVisibleDisplayPlain({
    agreementId: args?.agreementId ?? authorityGate.authority.agreementId ?? "",
    paidProActive: true,
    premiumPaidDocumentSurface: true,
    premiumCheckoutCompleted: true,
    acceptedCanonicalPlain: authorityGate.authority.corpusPlain,
  });
  const sotLen = hasPaidProSourceOfTruth() ? getPaidProSourceOfTruthText().trim().length : 0;
  if (
    paint.plain.length < REVIEW_BODY_PAINT_MIN_LEN &&
    sotLen < REVIEW_BODY_PAINT_MIN_LEN
  ) {
    return {
      ready: false,
      reason: "review_body_not_visibly_paint_ready",
      paintHash: paint.plain ? hashPaidProCorpus(paint.plain) : null,
      authorityHash: authorityGate.authority.hash,
    };
  }
  const paintHash = hashPaidProCorpus(paint.plain.trim() || authorityGate.authority.corpusPlain);
  if (paintHash !== authorityGate.authority.hash) {
    return {
      ready: false,
      reason: `persist_hash_diverges_from_authority:${paintHash}!=${authorityGate.authority.hash}`,
      paintHash,
      authorityHash: authorityGate.authority.hash,
    };
  }
  return {
    ready: true,
    reason: "ok",
    paintHash,
    authorityHash: authorityGate.authority.hash,
  };
}

/**
 * Await workspace row creation after canonical review entry. Dedupes via existing id.
 * Callers must treat `ok: false` as a hard failure for review-ready presentation.
 */
export async function persistWorkspaceAgreementAfterReviewReady(args: {
  canonicalReviewEntered: boolean;
  existingAgreementId?: string | null;
  skipFreeStarterCreateSubmit: boolean;
  ensurePersist: () => Promise<string | null>;
  /** Optional competing candidate — rejected when it diverges from authority. */
  persistCorpusPlain?: string | null;
  agreementIdForPaintCheck?: string | null;
}): Promise<ReviewReadyWorkspacePersistResult> {
  const existing = String(args.existingAgreementId ?? "").trim();
  if (existing) {
    bindPaidProReviewSessionAuthorityAgreementId(existing);
    return { ok: true, agreementId: existing, created: false };
  }
  if (
    !shouldRequireWorkspacePersistOnReviewReady({
      canonicalReviewEntered: args.canonicalReviewEntered,
      hasReviewAgreementId: false,
      skipFreeStarterCreateSubmit: args.skipFreeStarterCreateSubmit,
    })
  ) {
    return { ok: false, reason: "not_required" };
  }

  const persistPlain =
    (args.persistCorpusPlain || "").trim() ||
    resolvePaidProReviewSessionAuthorityPersistPlain();

  if (hasPaidProReviewSessionAuthority() || args.canonicalReviewEntered) {
    const paintReady = isPaidProReviewBodyVisiblyPaintReady({
      agreementId: args.agreementIdForPaintCheck,
      persistCorpusPlain: persistPlain || undefined,
    });
    if (!paintReady.ready) {
      const reason =
        paintReady.reason.startsWith("persist_hash_diverges")
          ? ("persist_hash_diverges_from_authority" as const)
          : paintReady.reason === "missing_review_session_authority"
            ? ("missing_review_session_authority" as const)
            : ("review_body_not_visibly_paint_ready" as const);
      if (typeof import.meta !== "undefined" && import.meta.env?.MODE !== "test") {
        // eslint-disable-next-line no-console
        console.warn("[paid-pro-review-ready-persist-blocked]", {
          reason: paintReady.reason,
          paintHash: paintReady.paintHash,
          authorityHash: paintReady.authorityHash,
        });
      }
      return { ok: false, reason };
    }
  }

  const id = String((await args.ensurePersist()) ?? "").trim();
  if (!id) return { ok: false, reason: "persist_failed" };
  bindPaidProReviewSessionAuthorityAgreementId(id);
  return { ok: true, agreementId: id, created: true };
}

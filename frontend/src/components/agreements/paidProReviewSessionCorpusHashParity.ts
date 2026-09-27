/**
 * Post-freeze review render hash parity — depends on SoT parity audit; keep out of session state leaf.
 */

import { auditPaidProReviewRenderSotParity } from "./paidProReviewSotParity";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import {
  fingerprintPaidReviewSessionCorpusBody,
  isPaidReviewSessionCorpusInvariantTestMode,
  readPaidReviewSessionCorpusInvariantSession,
  resolvePaidReviewSessionCorpusInvariantSessionId,
  writePaidReviewSessionCorpusInvariantSession,
} from "./paidProReviewSessionCorpusInvariantState";

/**
 * After freeze: review display hash must match latched canonical SoT hash for the session lifetime.
 * Reuses paid-pro-review-sot-parity allowances for signer-field-only hydration deltas.
 */
export type PaidReviewSessionCorpusFailureDiagnostic = {
  /** Fingerprints from `fingerprintPaidReviewSessionCorpusBody`, not `hashPaidProCorpus`. */
  sourceOfTruthHash: string | null;
  sourceOfTruthLength: number;
  signingSnapshotHash: string | null;
  signingSnapshotLength: number;
  hasAuthoritativeSigningSnapshot: boolean;
  sourceOfTruthDisplayOnly: boolean;
  postFinalizeHydrationLocked: boolean;
  signerExecutionOverlayNecessary: boolean;
};

export function assertPaidReviewSessionReviewCorpusHashParity(args: {
  reviewSessionId?: string | null;
  reviewPlain: string;
  surface: string;
  intakeText?: string | null;
  draft?: ParsedDraftShape | null;
  failureDiagnostic?: PaidReviewSessionCorpusFailureDiagnostic | null;
}): void {
  const sessionId = resolvePaidReviewSessionCorpusInvariantSessionId(args.reviewSessionId);
  const session = readPaidReviewSessionCorpusInvariantSession(sessionId);
  const canonicalHash = session?.latchedCanonicalSoTHash;
  if (!canonicalHash || !session) return;

  const review = (args.reviewPlain || "").trim();
  if (review.length < 80) return;
  const reviewHash = fingerprintPaidReviewSessionCorpusBody(review);

  const parity = auditPaidProReviewRenderSotParity({
    reviewPlain: review,
    surface: args.surface,
    intakeText: args.intakeText ?? null,
    draft: args.draft ?? null,
  });

  const matchesCanonical =
    reviewHash === canonicalHash ||
    parity.reviewHash === canonicalHash ||
    parity.canonicalHash === reviewHash ||
    parity.invariantOk;

  if (reviewHash && !matchesCanonical) {
    const payload = paidReviewSessionCorpusFailurePayload({
      reviewSessionId: sessionId,
      surface: args.surface,
      latchedCanonicalSoTHash: canonicalHash,
      reviewPlainHash: reviewHash,
      reviewPlainLength: review.length,
      latchedReviewDisplayHash: session.latchedReviewDisplayHash ?? null,
      parity,
      failureDiagnostic: args.failureDiagnostic,
      message:
        "paid review display corpus hash diverged from latched canonical SoT hash for this review session",
    });
    const msg = `[paid-review-session-corpus-hash-invariant] ${payload.message} session=${sessionId} surface=${args.surface} diagnostic=${JSON.stringify(payload)}`;
    if (isPaidReviewSessionCorpusInvariantTestMode()) {
      throw new Error(msg);
    }
    // eslint-disable-next-line no-console
    console.error("[paid-review-session-corpus-hash-invariant]", payload);
    if (typeof import.meta !== "undefined" && import.meta.env?.DEV) {
      throw new Error(msg);
    }
    return;
  }

  if (!session.latchedReviewDisplayHash) {
    session.latchedReviewDisplayHash = reviewHash;
    writePaidReviewSessionCorpusInvariantSession(sessionId, session);
    if (!isPaidReviewSessionCorpusInvariantTestMode()) {
      // eslint-disable-next-line no-console
      console.info("[paid-review-session-corpus-hash-invariant]", {
        ok: true,
        reviewSessionId: sessionId,
        surface: args.surface,
        latchedCanonicalSoTHash: canonicalHash,
        reviewHash,
        event: "first_review_render_latched",
      });
    }
    return;
  }

  if (session.latchedReviewDisplayHash !== reviewHash && !parity.invariantOk) {
    const payload = paidReviewSessionCorpusFailurePayload({
      reviewSessionId: sessionId,
      surface: args.surface,
      latchedCanonicalSoTHash: canonicalHash,
      reviewPlainHash: reviewHash,
      reviewPlainLength: review.length,
      latchedReviewDisplayHash: session.latchedReviewDisplayHash,
      parity,
      failureDiagnostic: args.failureDiagnostic,
      message: "paid review display hash changed after initial post-freeze render for this session",
    });
    const msg = `[paid-review-session-corpus-hash-invariant] ${payload.message} session=${sessionId} diagnostic=${JSON.stringify(payload)}`;
    if (isPaidReviewSessionCorpusInvariantTestMode()) {
      throw new Error(msg);
    }
    // eslint-disable-next-line no-console
    console.error("[paid-review-session-corpus-hash-invariant]", payload);
    if (typeof import.meta !== "undefined" && import.meta.env?.DEV) {
      throw new Error(msg);
    }
    return;
  }

  if (!isPaidReviewSessionCorpusInvariantTestMode() && args.surface === "paid_pro_review_render_plain") {
    // eslint-disable-next-line no-console
    console.info("[paid-review-session-corpus-hash-invariant]", {
      ok: true,
      reviewSessionId: sessionId,
      surface: args.surface,
      latchedCanonicalSoTHash: canonicalHash,
      reviewHash,
    });
  }
}

function paidReviewSessionCorpusFailurePayload(args: {
  reviewSessionId: string;
  surface: string;
  latchedCanonicalSoTHash: string;
  reviewPlainHash: string;
  reviewPlainLength: number;
  latchedReviewDisplayHash: string | null;
  parity: {
    invariantOk: boolean;
    signerFieldOnlyDelta: boolean;
    blankSignerLinesRemaining: number;
    canonicalHash: string | null;
    reviewHash: string;
  };
  failureDiagnostic?: PaidReviewSessionCorpusFailureDiagnostic | null;
  message: string;
}) {
  const diagnostic = args.failureDiagnostic;
  return {
    ok: false as const,
    reviewSessionId: args.reviewSessionId,
    surface: args.surface,
    latchedCanonicalSoTHash: args.latchedCanonicalSoTHash,
    latchedCanonicalSoTLength: lengthFromReviewSessionFingerprint(args.latchedCanonicalSoTHash),
    reviewPlainHash: args.reviewPlainHash,
    reviewPlainLength: args.reviewPlainLength,
    sourceOfTruthHash: diagnostic?.sourceOfTruthHash ?? null,
    sourceOfTruthLength: diagnostic?.sourceOfTruthLength ?? 0,
    signingSnapshotHash: diagnostic?.signingSnapshotHash ?? null,
    signingSnapshotLength: diagnostic?.signingSnapshotLength ?? 0,
    latchedReviewDisplayHash: args.latchedReviewDisplayHash,
    hasAuthoritativeSigningSnapshot: diagnostic?.hasAuthoritativeSigningSnapshot ?? null,
    sourceOfTruthDisplayOnly: diagnostic?.sourceOfTruthDisplayOnly ?? null,
    postFinalizeHydrationLocked: diagnostic?.postFinalizeHydrationLocked ?? null,
    signerExecutionOverlayNecessary: diagnostic?.signerExecutionOverlayNecessary ?? null,
    parityInvariantOk: args.parity.invariantOk,
    paritySignerFieldOnlyDelta: args.parity.signerFieldOnlyDelta,
    parityBlankSignerLinesRemaining: args.parity.blankSignerLinesRemaining,
    parityCanonicalHash: args.parity.canonicalHash,
    parityReviewHash: args.parity.reviewHash,
    message: args.message,
  };
}

function lengthFromReviewSessionFingerprint(hash: string): number | null {
  const match = /^(\d+):/.exec(hash);
  return match ? Number(match[1]) : null;
}

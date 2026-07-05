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
export function assertPaidReviewSessionReviewCorpusHashParity(args: {
  reviewSessionId?: string | null;
  reviewPlain: string;
  surface: string;
  intakeText?: string | null;
  draft?: ParsedDraftShape | null;
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
    const payload = {
      ok: false,
      reviewSessionId: sessionId,
      surface: args.surface,
      latchedCanonicalSoTHash: canonicalHash,
      reviewHash,
      parityInvariantOk: parity.invariantOk,
      message:
        "paid review display corpus hash diverged from latched canonical SoT hash for this review session",
    };
    const msg = `[paid-review-session-corpus-hash-invariant] ${payload.message} session=${sessionId} surface=${args.surface}`;
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
    const payload = {
      ok: false,
      reviewSessionId: sessionId,
      surface: args.surface,
      latchedReviewDisplayHash: session.latchedReviewDisplayHash,
      reviewHash,
      message: "paid review display hash changed after initial post-freeze render for this session",
    };
    const msg = `[paid-review-session-corpus-hash-invariant] ${payload.message} session=${sessionId}`;
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

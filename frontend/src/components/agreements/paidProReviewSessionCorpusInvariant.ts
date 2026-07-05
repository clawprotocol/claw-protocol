/**
 * Paid review session invariants:
 * 1. canonical-corpus-freeze requires prior ensurePremiumCompletion (premium generation path).
 * 2. After freeze, every review render display hash matches the latched canonical SoT hash
 *    for the lifetime of that review session.
 */

import { getOrInitSessionAgreementGenerationId } from "../../lib/agreementGenerationId";
import { fingerprintAgreementBody } from "./guidedDealCompletion/guidedSigningPacketVersion";
import { auditPaidProReviewRenderSotParity } from "./paidProReviewSotParity";
import type { ParsedDraftShape } from "./intakeSmartDefaults";

export type PaidReviewSessionCorpusInvariantRecord = {
  premiumGenerationMarked: boolean;
  premiumGenerationSource: string | null;
  /** hashPaidProCorpus / fingerprint of canonical SoT plain at freeze. */
  latchedCanonicalSoTHash: string | null;
  /** First successful review render hash after latch — must match all subsequent renders. */
  latchedReviewDisplayHash: string | null;
};

const PAID_CANONICAL_FREEZE_SOURCES = new Set([
  "server_full_document_text",
  "server_full_draft",
  "canonical_working_draft",
  "snapshot_server_full_draft",
]);

const sessions = new Map<string, PaidReviewSessionCorpusInvariantRecord>();

function isTestMode(): boolean {
  return typeof import.meta !== "undefined" && import.meta.env?.MODE === "test";
}

function resolveReviewSessionId(reviewSessionId?: string | null): string {
  const id = (reviewSessionId ?? "").trim();
  return id || getOrInitSessionAgreementGenerationId();
}

function readOrCreateSession(sessionId: string): PaidReviewSessionCorpusInvariantRecord {
  const existing = sessions.get(sessionId);
  if (existing) return existing;
  const created: PaidReviewSessionCorpusInvariantRecord = {
    premiumGenerationMarked: false,
    premiumGenerationSource: null,
    latchedCanonicalSoTHash: null,
    latchedReviewDisplayHash: null,
  };
  sessions.set(sessionId, created);
  return created;
}

export function isPaidProCanonicalFreezeSource(source: string | null | undefined): boolean {
  const s = (source ?? "").trim();
  if (!s) return false;
  if (s === "free_starter") return false;
  return PAID_CANONICAL_FREEZE_SOURCES.has(s) || /server_full|premium|paid_pro/i.test(s);
}

/** Record that this review session invoked ensurePremiumCompletion (GPT-5.5 premium path). */
export function markPaidReviewSessionPremiumGeneration(
  reviewSessionId: string | null | undefined,
  source = "ensure_premium_completion",
): void {
  const sessionId = resolveReviewSessionId(reviewSessionId);
  const session = readOrCreateSession(sessionId);
  session.premiumGenerationMarked = true;
  session.premiumGenerationSource = source;
  sessions.set(sessionId, session);
}

/** Latch canonical SoT hash at freeze — baseline for review-session display parity. */
export function latchPaidReviewSessionCanonicalSoTHash(args: {
  reviewSessionId?: string | null;
  canonicalPlain: string;
}): void {
  const plain = (args.canonicalPlain || "").trim();
  if (plain.length < 80) return;
  const sessionId = resolveReviewSessionId(args.reviewSessionId);
  const session = readOrCreateSession(sessionId);
  session.latchedCanonicalSoTHash = fingerprintAgreementBody(plain);
  sessions.set(sessionId, session);
}

export function readPaidReviewSessionCorpusInvariant(
  reviewSessionId?: string | null,
): PaidReviewSessionCorpusInvariantRecord | null {
  const sessionId = resolveReviewSessionId(reviewSessionId);
  return sessions.get(sessionId) ?? null;
}

export function verifyPaidReviewSessionPremiumGenerationBeforeCanonicalFreeze(args: {
  reviewSessionId?: string | null;
  source: string;
  tier?: string | null;
}): boolean {
  if ((args.tier ?? "").trim() === "starter") return true;
  if (!isPaidProCanonicalFreezeSource(args.source)) return true;
  const sessionId = resolveReviewSessionId(args.reviewSessionId);
  const session = sessions.get(sessionId);
  if (session?.premiumGenerationMarked) {
    if (!isTestMode()) {
      // eslint-disable-next-line no-console
      console.info("[paid-review-session-generation-invariant]", {
        ok: true,
        reviewSessionId: sessionId,
        source: args.source,
        premiumGenerationSource: session.premiumGenerationSource,
      });
    }
    return true;
  }
  const payload = {
    ok: false,
    reviewSessionId: sessionId,
    source: args.source,
    tier: args.tier ?? null,
    message:
      "canonical-corpus-freeze reached without ensurePremiumCompletion premium generation for this review session",
  };
  // eslint-disable-next-line no-console
  console.error("[paid-review-session-generation-invariant]", payload);
  return false;
}

export function assertPaidReviewSessionPremiumGenerationBeforeCanonicalFreeze(args: {
  reviewSessionId?: string | null;
  source: string;
  tier?: string | null;
}): void {
  if (verifyPaidReviewSessionPremiumGenerationBeforeCanonicalFreeze(args)) return;
  const sessionId = resolveReviewSessionId(args.reviewSessionId);
  const msg = `[paid-review-session-generation-invariant] canonical-corpus-freeze reached without ensurePremiumCompletion premium generation for this review session session=${sessionId} source=${args.source}`;
  if (isTestMode()) {
    throw new Error(msg);
  }
  if (typeof import.meta !== "undefined" && import.meta.env?.DEV) {
    throw new Error(msg);
  }
}

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
  const sessionId = resolveReviewSessionId(args.reviewSessionId);
  const session = sessions.get(sessionId);
  const canonicalHash = session?.latchedCanonicalSoTHash;
  if (!canonicalHash) return;

  const review = (args.reviewPlain || "").trim();
  if (review.length < 80) return;
  const reviewHash = fingerprintAgreementBody(review);

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
    if (isTestMode()) {
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
    sessions.set(sessionId, session);
    if (!isTestMode()) {
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
    if (isTestMode()) {
      throw new Error(msg);
    }
    // eslint-disable-next-line no-console
    console.error("[paid-review-session-corpus-hash-invariant]", payload);
    if (typeof import.meta !== "undefined" && import.meta.env?.DEV) {
      throw new Error(msg);
    }
    return;
  }

  if (!isTestMode() && args.surface === "paid_pro_review_render_plain") {
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

export function resetPaidReviewSessionCorpusInvariantForTests(): void {
  sessions.clear();
}

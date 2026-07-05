/**
 * Leaf session state for paid review corpus invariants — no imports from SoT/render/parity modules.
 */

import { getOrInitSessionAgreementGenerationId } from "../../lib/agreementGenerationId";
import { fingerprintAgreementBody } from "./guidedDealCompletion/guidedSigningPacketVersion";

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

export function readPaidReviewSessionCorpusInvariantSession(
  reviewSessionId?: string | null,
): PaidReviewSessionCorpusInvariantRecord | null {
  const sessionId = resolveReviewSessionId(reviewSessionId);
  return sessions.get(sessionId) ?? null;
}

export function writePaidReviewSessionCorpusInvariantSession(
  sessionId: string,
  session: PaidReviewSessionCorpusInvariantRecord,
): void {
  sessions.set(sessionId, session);
}

export function resolvePaidReviewSessionCorpusInvariantSessionId(
  reviewSessionId?: string | null,
): string {
  return resolveReviewSessionId(reviewSessionId);
}

export function fingerprintPaidReviewSessionCorpusBody(plain: string): string {
  return fingerprintAgreementBody(plain);
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
  return readPaidReviewSessionCorpusInvariantSession(reviewSessionId);
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

export function resetPaidReviewSessionCorpusInvariantForTests(): void {
  sessions.clear();
}

export function isPaidReviewSessionCorpusInvariantTestMode(): boolean {
  return isTestMode();
}

/**
 * Immutable paid Pro / Genesis review-session authority.
 *
 * Created exactly once when a server-authoritative snapshot is accepted into SoT.
 * Router, visible review shell, signer prep, and workspace persist must all consume
 * this same record — never a competing longer/shorter pipeline candidate.
 */

import { hashPaidProCorpus } from "./paidProSourceOfTruthState";
import { PAID_PRO_AUTHORITY_MIN_LEN } from "./paidProAuthorityConstants";

export const PAID_PRO_REVIEW_SESSION_AUTHORITY_SOURCE = "review_session_authority";

export type PaidProReviewSessionAuthorityRecord = {
  /** Exact accepted server-authoritative plain. */
  corpusPlain: string;
  /** hashPaidProCorpus(corpusPlain). */
  hash: string;
  /** Freeze / acceptance source (e.g. server_full_document_text). */
  source: string;
  /** Integrity accepted at establish time. */
  integrityOk: boolean;
  /** Optional workspace agreement id once persist succeeds. */
  agreementId: string | null;
  reviewSessionId: string | null;
  establishedAt: number;
};

let activeAuthority: PaidProReviewSessionAuthorityRecord | null = null;

export function clearPaidProReviewSessionAuthorityForTests(): void {
  activeAuthority = null;
}

export function readPaidProReviewSessionAuthority(): PaidProReviewSessionAuthorityRecord | null {
  return activeAuthority;
}

export function hasPaidProReviewSessionAuthority(): boolean {
  const a = activeAuthority;
  return Boolean(a && a.integrityOk && a.corpusPlain.trim().length >= PAID_PRO_AUTHORITY_MIN_LEN);
}

/**
 * Establish immutable review-session authority. First integrity-valid accept wins;
 * later calls with a different hash are rejected (one-authority rule).
 */
export function establishPaidProReviewSessionAuthority(args: {
  corpusPlain: string;
  source: string;
  integrityOk?: boolean;
  reviewSessionId?: string | null;
  agreementId?: string | null;
}): PaidProReviewSessionAuthorityRecord {
  const corpusPlain = (args.corpusPlain || "").trim();
  const hash = hashPaidProCorpus(corpusPlain);
  const integrityOk = args.integrityOk !== false && corpusPlain.length >= PAID_PRO_AUTHORITY_MIN_LEN;
  if (!integrityOk) {
    throw new Error(
      `[paid-pro-review-session-authority-blocked] integrity_or_length_failed len=${corpusPlain.length}`,
    );
  }
  if (activeAuthority) {
    if (activeAuthority.hash === hash) {
      return activeAuthority;
    }
    throw new Error(
      `[paid-pro-review-session-authority-blocked] one_authority_violation existing=${activeAuthority.hash} incoming=${hash}`,
    );
  }
  activeAuthority = {
    corpusPlain,
    hash,
    source: (args.source || "server_full_document_text").trim() || "server_full_document_text",
    integrityOk: true,
    agreementId: (args.agreementId || "").trim() || null,
    reviewSessionId: (args.reviewSessionId || "").trim() || null,
    establishedAt: Date.now(),
  };
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE !== "test") {
    // eslint-disable-next-line no-console
    console.info("[paid-pro-review-session-authority]", {
      phase: "established",
      hash: activeAuthority.hash,
      len: activeAuthority.corpusPlain.length,
      source: activeAuthority.source,
      agreementId: activeAuthority.agreementId,
    });
  }
  return activeAuthority;
}

/** Attach workspace agreement id without changing corpus/hash. */
export function bindPaidProReviewSessionAuthorityAgreementId(agreementId: string): void {
  const id = (agreementId || "").trim();
  if (!id || !activeAuthority) return;
  activeAuthority = { ...activeAuthority, agreementId: id };
}

export function resolvePaidProReviewSessionAuthorityPaintPlain(): {
  plain: string;
  hash: string;
  source: string;
} | null {
  if (!hasPaidProReviewSessionAuthority() || !activeAuthority) return null;
  return {
    plain: activeAuthority.corpusPlain,
    hash: activeAuthority.hash,
    source: PAID_PRO_REVIEW_SESSION_AUTHORITY_SOURCE,
  };
}

/**
 * Persist is allowed only when the review body is visibly paint-ready from the
 * exact accepted authority hash (never a competing candidate).
 */
export function canPersistFromPaidProReviewSessionAuthority(args?: {
  /** Hash of the corpus that would be POSTed. Must match authority. */
  persistCorpusPlain?: string | null;
  /** When false, paint path is empty / awaiting — block persist. */
  visiblePaintReady?: boolean;
}): { ok: true; authority: PaidProReviewSessionAuthorityRecord } | { ok: false; reason: string } {
  if (!hasPaidProReviewSessionAuthority() || !activeAuthority) {
    return { ok: false, reason: "missing_review_session_authority" };
  }
  if (args?.visiblePaintReady === false) {
    return { ok: false, reason: "review_body_not_visibly_paint_ready" };
  }
  const persistPlain = (args?.persistCorpusPlain || "").trim();
  if (persistPlain) {
    const persistHash = hashPaidProCorpus(persistPlain);
    if (persistHash !== activeAuthority.hash) {
      return {
        ok: false,
        reason: `persist_hash_diverges_from_authority:${persistHash}!=${activeAuthority.hash}`,
      };
    }
  }
  return { ok: true, authority: activeAuthority };
}

/** Prefer authority corpus for workspace POST purpose/body. */
export function resolvePaidProReviewSessionAuthorityPersistPlain(): string {
  if (!hasPaidProReviewSessionAuthority() || !activeAuthority) return "";
  return activeAuthority.corpusPlain;
}

/**
 * True when first-review paint must use session authority / SoT and must not
 * blank for missing agreementId / verified GET.
 */
export function isPaidProReviewSessionAuthorityPaintSufficient(): boolean {
  return hasPaidProReviewSessionAuthority();
}

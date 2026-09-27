/**
 * Painted sequential persist Review for Continue-to-signature-links preflight.
 *
 * Live fail: persistCanonicalReviewSnapshot scanned the shorter
 * review_session_authority corpus and false-fired skipped_top_level_section_integers
 * before any POST. The painted canonical_plain_forced / paint-plain Review was
 * already sequential 1..N. Persist must scan (and POST) that painted Review.
 *
 * Does not change Review-paint SoT pickers. Latches what the visible shell already painted.
 */

import { hashPaidProCorpus } from "./paidProSourceOfTruthState";

const PAINTED_PERSIST_REVIEW_MIN_LEN = 500;

export type PaintedSequentialPersistReviewLatch = {
  paintedPlain: string;
  paintedHash: string;
  authorityPlain: string;
  authorityHash: string;
};

let latch: PaintedSequentialPersistReviewLatch | null = null;

export function clearPaintedSequentialPersistReviewForTests(): void {
  latch = null;
}

export function latchPaintedSequentialPersistReview(args: {
  paintedPlain: string;
  authorityPlain?: string | null;
}): PaintedSequentialPersistReviewLatch | null {
  const paintedPlain = (args.paintedPlain || "").trim();
  if (paintedPlain.length < PAINTED_PERSIST_REVIEW_MIN_LEN) return latch;
  const authorityPlain = (args.authorityPlain || "").trim();
  latch = {
    paintedPlain,
    paintedHash: hashPaidProCorpus(paintedPlain),
    authorityPlain,
    authorityHash: authorityPlain ? hashPaidProCorpus(authorityPlain) : "",
  };
  return latch;
}

export function readPaintedSequentialPersistReviewPlain(): string {
  return latch?.paintedPlain ?? "";
}

export function readPaintedSequentialPersistReviewForCorpus(corpusPlain: string): string {
  if (!latch) return "";
  const corpus = (corpusPlain || "").trim();
  if (!corpus) return "";
  const corpusHash = hashPaidProCorpus(corpus);
  if (corpusHash === latch.paintedHash) return latch.paintedPlain;
  if (latch.authorityHash && corpusHash === latch.authorityHash) return latch.paintedPlain;
  return "";
}

/**
 * Client persist / Continue-to-signature-links skip preflight corpus.
 * Prefers the painted sequential persist Review over a shorter authority payload.
 */
export function resolvePersistReviewPlainForClientPreflight(args: {
  corpusPlain: string;
  paintedPersistPlain?: string | null;
}): string {
  const painted = (args.paintedPersistPlain || "").trim();
  if (painted.length >= PAINTED_PERSIST_REVIEW_MIN_LEN) return painted;
  const fromLatch = readPaintedSequentialPersistReviewForCorpus(args.corpusPlain);
  if (fromLatch.length >= PAINTED_PERSIST_REVIEW_MIN_LEN) return fromLatch;
  return (args.corpusPlain || "").trim();
}

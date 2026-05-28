/**
 * Simple Pro Final Review — authoritative post-guided body only; never shortened preview when final review is active.
 */

import { GUIDED_MIN_AUTHORITATIVE_BODY_LEN } from "./guidedDealCompletion/guidedCompletionRenderAuthority";
import { readCanonicalAgreementCorpusForSurface } from "./canonicalAgreementSnapshot";
import { getPaidProDocumentForSurface, hasPaidProSourceOfTruth } from "./paidProSourceOfTruth";

/** Final review requires a full Pro agreement — not a signature-only fragment. */
export const GUIDED_FINAL_REVIEW_MIN_CORPUS_LEN = 1500;

export type SimpleProFinalReviewCorpusSource =
  | "authoritative_hydrated"
  | "last_known_good"
  | "agreement_document"
  | "picker_authoritative"
  | "rendered_preview";

export type SimpleProFinalReviewCorpusResolution = {
  plainText: string;
  source: SimpleProFinalReviewCorpusSource;
  authoritativeLen: number;
  renderedLen: number;
  overriddenPreview: boolean;
  appliedAnswerCount: number;
  /** True when a full authoritative body existed but display corpus is too short. */
  corpusBlocked?: boolean;
  /** True when display recovered from the frozen authoritative snapshot. */
  corpusRecovered?: boolean;
};

/** Refuse preview fallback when rendered body is >5% shorter than authoritative. */
const MATERIAL_SHORTER_RATIO = 0.95;

function norm(s?: string | null): string {
  return (s || "").trim();
}

function pickLongestAuthoritative(candidates: { plain: string; source: SimpleProFinalReviewCorpusSource }[]): {
  plain: string;
  source: SimpleProFinalReviewCorpusSource;
} {
  let best = candidates[0] ?? { plain: "", source: "authoritative_hydrated" as const };
  for (const c of candidates) {
    if (c.plain.length > best.plain.length) best = c;
  }
  return best;
}

export function resolveSimpleProFinalReviewCorpus(args: {
  authoritativePlain: string;
  renderedPreviewPlain?: string | null;
  pickerPlain?: string | null;
  agreementDocumentPlain?: string | null;
  appliedAnswerCount?: number;
  /** When true, never use renderedAgreementPreview even if other sources are empty. */
  finalReviewAuthorityOnly?: boolean;
  /** Pre–signer-identity snapshot for recovery when patched body shrank. */
  recoveryAuthoritativePlain?: string | null;
  /** Immutable pinned signer-applied body — never compete with picker/server length. */
  pinnedFinalizedSignerPlain?: string | null;
}): SimpleProFinalReviewCorpusResolution {
  const canonical = readCanonicalAgreementCorpusForSurface("review", { tier: "pro" });
  if (canonical) {
    return {
      plainText: canonical.canonicalText,
      source: "authoritative_hydrated",
      authoritativeLen: canonical.len,
      renderedLen: norm(args.renderedPreviewPlain).length,
      overriddenPreview: false,
      appliedAnswerCount: args.appliedAnswerCount ?? 0,
    };
  }
  const paidPro = getPaidProDocumentForSurface("review");
  if (paidPro) {
    return {
      plainText: paidPro.text,
      source: "authoritative_hydrated",
      authoritativeLen: paidPro.text.length,
      renderedLen: norm(args.renderedPreviewPlain).length,
      overriddenPreview: false,
      appliedAnswerCount: args.appliedAnswerCount ?? 0,
    };
  }
  const pinned = norm(args.pinnedFinalizedSignerPlain);
  if (pinned.length >= GUIDED_FINAL_REVIEW_MIN_CORPUS_LEN) {
    return {
      plainText: pinned,
      source: "authoritative_hydrated",
      authoritativeLen: pinned.length,
      renderedLen: norm(args.renderedPreviewPlain).length,
      overriddenPreview: false,
      appliedAnswerCount: args.appliedAnswerCount ?? 0,
    };
  }
  const authoritative = norm(args.authoritativePlain);
  const rendered = norm(args.renderedPreviewPlain);
  const picker = norm(args.pickerPlain);
  const adt = norm(args.agreementDocumentPlain);
  const authorityOnly = Boolean(args.finalReviewAuthorityOnly);
  const recovery = norm(args.recoveryAuthoritativePlain);

  const authCandidates: { plain: string; source: SimpleProFinalReviewCorpusSource }[] = [];
  if (authoritative.length > 0) {
    authCandidates.push({ plain: authoritative, source: "authoritative_hydrated" });
  }
  /** Final review must not swap signer-applied corpus for longer stale server/picker drafts. */
  if (!authorityOnly) {
    if (picker.length >= GUIDED_MIN_AUTHORITATIVE_BODY_LEN) {
      authCandidates.push({ plain: picker, source: "picker_authoritative" });
    }
    if (adt.length >= GUIDED_MIN_AUTHORITATIVE_BODY_LEN) {
      authCandidates.push({ plain: adt, source: "agreement_document" });
    }
  }

  const picked = authorityOnly
    ? authCandidates[0] ?? { plain: authoritative, source: "authoritative_hydrated" as const }
    : pickLongestAuthoritative(
        authCandidates.length ? authCandidates : [{ plain: authoritative, source: "authoritative_hydrated" }],
      );

  let plainText = picked.plain;
  let source = picked.source;
  const renderedLen = rendered.length;

  const authoritativeLen = Math.max(
    authoritative.length,
    picker.length,
    adt.length,
    plainText.length,
  );

  let overriddenPreview = false;
  let corpusRecovered = false;

  if (
    plainText.length >= GUIDED_MIN_AUTHORITATIVE_BODY_LEN &&
    renderedLen >= 400 &&
    renderedLen < plainText.length * MATERIAL_SHORTER_RATIO
  ) {
    overriddenPreview = true;
    logSimpleFinalReviewAuthoritativeOverride({
      authoritativeLen: plainText.length,
      renderedLen,
      refusedPreviewFallback: authorityOnly,
    });
  }

  if (!authorityOnly && !hasPaidProSourceOfTruth()) {
    if (
      plainText.length < GUIDED_MIN_AUTHORITATIVE_BODY_LEN &&
      rendered.length >= GUIDED_MIN_AUTHORITATIVE_BODY_LEN &&
      rendered.length > plainText.length &&
      rendered.length >= GUIDED_FINAL_REVIEW_MIN_CORPUS_LEN
    ) {
      plainText = rendered;
      source = "rendered_preview";
    }
  } else if (
    renderedLen > 0 &&
    plainText.length > 0 &&
    renderedLen < plainText.length
  ) {
    overriddenPreview = true;
  }

  const recoveryFull = recovery.length >= GUIDED_FINAL_REVIEW_MIN_CORPUS_LEN;
  const recoveryAuthoritativeFull = recovery.length >= 3000;

  if (
    authorityOnly &&
    plainText.length < 1000 &&
    recoveryAuthoritativeFull
  ) {
    logGuidedFinalReviewCorpusRecovered({
      displayLenBefore: plainText.length,
      recoveredLen: recovery.length,
    });
    plainText = recovery;
    source = "last_known_good";
    overriddenPreview = true;
    corpusRecovered = true;
  }

  if (
    authorityOnly &&
    plainText.length > 0 &&
    plainText.length < GUIDED_FINAL_REVIEW_MIN_CORPUS_LEN &&
    recoveryFull
  ) {
    logGuidedFinalReviewCorpusBlocked({
      displayLen: plainText.length,
      recoveryLen: recovery.length,
      authoritativeLen,
    });
    logFinalReviewAuthoritativeRenderBlocked({ reason: "shrunken_authoritative_body" });
    return {
      plainText: "",
      source: picked.source,
      authoritativeLen: Math.max(authoritativeLen, recovery.length),
      renderedLen,
      overriddenPreview: false,
      appliedAnswerCount: args.appliedAnswerCount ?? 0,
      corpusBlocked: true,
    };
  }

  if (authorityOnly && plainText.length < GUIDED_FINAL_REVIEW_MIN_CORPUS_LEN) {
    logFinalReviewAuthoritativeRenderBlocked({ reason: "empty_authoritative_body" });
    return {
      plainText: "",
      source: picked.source,
      authoritativeLen: 0,
      renderedLen,
      overriddenPreview: false,
      appliedAnswerCount: args.appliedAnswerCount ?? 0,
    };
  }

  if (authorityOnly && plainText.length < GUIDED_MIN_AUTHORITATIVE_BODY_LEN) {
    logFinalReviewAuthoritativeRenderBlocked({ reason: "empty_authoritative_body" });
    return {
      plainText: "",
      source: picked.source,
      authoritativeLen: 0,
      renderedLen,
      overriddenPreview: false,
      appliedAnswerCount: args.appliedAnswerCount ?? 0,
    };
  }

  const resolution: SimpleProFinalReviewCorpusResolution = {
    plainText,
    source,
    authoritativeLen,
    renderedLen,
    overriddenPreview,
    appliedAnswerCount: args.appliedAnswerCount ?? 0,
    corpusRecovered,
  };

  logFinalReviewAuthoritativeRender({
    authoritativeLen: resolution.authoritativeLen,
    renderedLen: resolution.renderedLen,
    source: resolution.source,
    displayLen: resolution.plainText.length,
    authorityOnly,
    blockedEmpty: authorityOnly && resolution.plainText.length < GUIDED_MIN_AUTHORITATIVE_BODY_LEN,
  });

  return resolution;
}

export function logFinalReviewAuthoritativeRenderBlocked(payload: { reason: string }): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[final-review-authoritative-render-blocked]", payload);
}

export function logSimpleFinalReviewAuthoritativeOverride(payload: {
  authoritativeLen: number;
  renderedLen: number;
  refusedPreviewFallback?: boolean;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[simple-final-review-authoritative-override]", payload);
}

export function logGuidedFinalReviewCorpusRecovered(payload: {
  displayLenBefore: number;
  recoveredLen: number;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[guided-final-review-corpus-recovered]", payload);
}

export function logGuidedFinalReviewCorpusBlocked(payload: {
  displayLen: number;
  recoveryLen: number;
  authoritativeLen: number;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[guided-final-review-corpus-blocked]", payload);
}

export function logFinalReviewAuthoritativeRender(payload: {
  authoritativeLen: number;
  renderedLen: number;
  source: SimpleProFinalReviewCorpusSource;
  displayLen: number;
  authorityOnly: boolean;
  blockedEmpty?: boolean;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  if (payload.blockedEmpty) return;
  // eslint-disable-next-line no-console
  console.info("[final-review-authoritative-render]", payload);
}

/**
 * Simple Pro Final Review — authoritative post-guided body only; never shortened preview when final review is active.
 */

import { GUIDED_MIN_AUTHORITATIVE_BODY_LEN } from "./guidedDealCompletion/guidedCompletionRenderAuthority";

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
}): SimpleProFinalReviewCorpusResolution {
  const authoritative = norm(args.authoritativePlain);
  const rendered = norm(args.renderedPreviewPlain);
  const picker = norm(args.pickerPlain);
  const adt = norm(args.agreementDocumentPlain);
  const authorityOnly = Boolean(args.finalReviewAuthorityOnly);

  const authCandidates: { plain: string; source: SimpleProFinalReviewCorpusSource }[] = [];
  if (authoritative.length > 0) {
    authCandidates.push({ plain: authoritative, source: "authoritative_hydrated" });
  }
  if (picker.length >= GUIDED_MIN_AUTHORITATIVE_BODY_LEN) {
    authCandidates.push({ plain: picker, source: "picker_authoritative" });
  }
  if (adt.length >= GUIDED_MIN_AUTHORITATIVE_BODY_LEN) {
    authCandidates.push({ plain: adt, source: "agreement_document" });
  }

  const picked = pickLongestAuthoritative(
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

  if (!authorityOnly) {
    if (
      plainText.length < GUIDED_MIN_AUTHORITATIVE_BODY_LEN &&
      rendered.length >= GUIDED_MIN_AUTHORITATIVE_BODY_LEN &&
      rendered.length > plainText.length
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

  const resolution: SimpleProFinalReviewCorpusResolution = {
    plainText,
    source,
    authoritativeLen,
    renderedLen,
    overriddenPreview,
    appliedAnswerCount: args.appliedAnswerCount ?? 0,
  };

  logFinalReviewAuthoritativeRender({
    authoritativeLen: resolution.authoritativeLen,
    renderedLen: resolution.renderedLen,
    source: resolution.source,
    displayLen: resolution.plainText.length,
    authorityOnly,
  });

  return resolution;
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

export function logFinalReviewAuthoritativeRender(payload: {
  authoritativeLen: number;
  renderedLen: number;
  source: SimpleProFinalReviewCorpusSource;
  displayLen: number;
  authorityOnly: boolean;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[final-review-authoritative-render]", payload);
}

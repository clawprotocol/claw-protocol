/**
 * Simple Pro Final Review — always prefer authoritative post-guided body over shortened preview.
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

const MATERIAL_SHORTER_RATIO = 0.85;

export function resolveSimpleProFinalReviewCorpus(args: {
  authoritativePlain: string;
  renderedPreviewPlain?: string | null;
  pickerPlain?: string | null;
  agreementDocumentPlain?: string | null;
  appliedAnswerCount?: number;
}): SimpleProFinalReviewCorpusResolution {
  const authoritative = (args.authoritativePlain || "").trim();
  const rendered = (args.renderedPreviewPlain || "").trim();
  const picker = (args.pickerPlain || "").trim();
  const adt = (args.agreementDocumentPlain || "").trim();

  const authoritativeLen = Math.max(
    authoritative.length,
    picker.length >= GUIDED_MIN_AUTHORITATIVE_BODY_LEN ? picker.length : 0,
    adt.length >= GUIDED_MIN_AUTHORITATIVE_BODY_LEN ? adt.length : 0,
  );

  let plainText = authoritative;
  let source: SimpleProFinalReviewCorpusSource = "authoritative_hydrated";

  if (!plainText || plainText.length < GUIDED_MIN_AUTHORITATIVE_BODY_LEN) {
    if (picker.length >= GUIDED_MIN_AUTHORITATIVE_BODY_LEN) {
      plainText = picker;
      source = "picker_authoritative";
    } else if (adt.length >= GUIDED_MIN_AUTHORITATIVE_BODY_LEN) {
      plainText = adt;
      source = "agreement_document";
    }
  }

  let overriddenPreview = false;
  const renderedLen = rendered.length;

  if (
    plainText.length >= GUIDED_MIN_AUTHORITATIVE_BODY_LEN &&
    renderedLen >= 400 &&
    renderedLen < plainText.length * MATERIAL_SHORTER_RATIO
  ) {
    overriddenPreview = true;
    logSimpleFinalReviewAuthoritativeOverride({
      authoritativeLen: plainText.length,
      renderedLen,
    });
  } else if (
    plainText.length < GUIDED_MIN_AUTHORITATIVE_BODY_LEN &&
    rendered.length >= GUIDED_MIN_AUTHORITATIVE_BODY_LEN &&
    rendered.length > plainText.length
  ) {
    plainText = rendered;
    source = "rendered_preview";
  }

  return {
    plainText,
    source,
    authoritativeLen,
    renderedLen,
    overriddenPreview,
    appliedAnswerCount: args.appliedAnswerCount ?? 0,
  };
}

export function logSimpleFinalReviewAuthoritativeOverride(payload: {
  authoritativeLen: number;
  renderedLen: number;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[simple-final-review-authoritative-override]", payload);
}

/**
 * Paid Pro first-review document presentation — canonical plain fallback when HTML is empty.
 */

import { htmlToPlainText } from "../../agreement/externalAiHandoff";
import { PAID_PRO_AUTHORITY_MIN_LEN } from "./paidProAgreementAuthority";
import { hasPaidProSourceOfTruth } from "./paidProSourceOfTruth";
import { auditPaidProReviewRenderSotParity } from "./paidProReviewSotParity";

export type PaidProFirstReviewDocumentRenderMode = "html" | "canonical_plain" | "html_fallback" | "empty";

export type PaidProFirstReviewDocumentPresentation = {
  mode: PaidProFirstReviewDocumentRenderMode;
  agreementHtml: string;
  paidReviewPlain: string;
  htmlLen: number;
  plainLen: number;
  htmlVisibleTextLen: number;
  renderedVisibleTextLen: number;
  blockedBlankWithCanonical: boolean;
};

export function resolvePaidProFirstReviewDocumentPresentation(args: {
  agreementHtml: string;
  paidReviewPlain: string;
  canonicalPaidProReview: boolean;
  minLen?: number;
}): PaidProFirstReviewDocumentPresentation {
  const min = args.minLen ?? PAID_PRO_AUTHORITY_MIN_LEN;
  const plain = (args.paidReviewPlain || "").trim();
  const html = (args.agreementHtml || "").trim();
  const htmlVisibleTextLen = html ? htmlToPlainText(html).trim().length : 0;
  const hasCanonicalPlain = Boolean(args.canonicalPaidProReview && plain.length >= min);
  const htmlHasVisibleBody = htmlVisibleTextLen >= Math.min(min, Math.max(200, Math.floor(plain.length * 0.2)));

  let blockedBlankWithCanonical = false;
  let mode: PaidProFirstReviewDocumentRenderMode = "empty";

  if (hasCanonicalPlain && html.length >= min && htmlHasVisibleBody) {
    mode = "html";
  } else if (hasCanonicalPlain) {
    if (html.length >= min && !htmlHasVisibleBody) {
      blockedBlankWithCanonical = true;
    }
    mode = "canonical_plain";
  } else if (html.length > 0 && htmlHasVisibleBody) {
    mode = "html_fallback";
  } else if (html.length > 0) {
    mode = "html_fallback";
  }

  const renderedVisibleTextLen =
    mode === "canonical_plain" ? plain.length : mode === "empty" ? 0 : htmlVisibleTextLen;

  if (blockedBlankWithCanonical) {
    logPaidProReviewBlankRenderBlocked({
      canonicalLen: plain.length,
      htmlLen: html.length,
      htmlVisibleTextLen,
    });
  }

  return {
    mode,
    agreementHtml: html,
    paidReviewPlain: plain,
    htmlLen: html.length,
    plainLen: plain.length,
    htmlVisibleTextLen,
    renderedVisibleTextLen,
    blockedBlankWithCanonical,
  };
}

export function logPaidProReviewBlankRenderBlocked(payload: {
  canonicalLen: number;
  htmlLen: number;
  htmlVisibleTextLen: number;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.warn("[paid-pro-review-blank-render-blocked]", payload);
}

export function logPaidProReviewRenderSource(payload: {
  hasCanonicalCorpus: boolean;
  canonicalLen: number;
  htmlLen: number;
  plainLen: number;
  renderedVisibleTextLen: number;
  renderMode: PaidProFirstReviewDocumentRenderMode;
  selectedTrack: string | null;
  signaturePreparationRequested: boolean;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[paid-pro-review-render-source]", payload);
}

let lastRenderSourceFingerprint = "";

export function logPaidProReviewRenderSourceOnce(
  payload: Parameters<typeof logPaidProReviewRenderSource>[0],
): void {
  const fp = JSON.stringify(payload);
  if (fp === lastRenderSourceFingerprint) return;
  lastRenderSourceFingerprint = fp;
  logPaidProReviewRenderSource(payload);
}

export function resetPaidProFirstReviewRenderGuardForTests(): void {
  lastRenderSourceFingerprint = "";
}

export function auditPaidProFirstReviewVisibleCorpus(args: {
  paidReviewPlain: string;
  presentation: PaidProFirstReviewDocumentPresentation;
}): void {
  if (!hasPaidProSourceOfTruth()) return;
  const plain = args.paidReviewPlain.trim();
  if (plain.length < PAID_PRO_AUTHORITY_MIN_LEN) return;
  auditPaidProReviewRenderSotParity({
    reviewPlain: plain,
    surface: "paid_pro_first_review_visible",
  });
  if (args.presentation.renderedVisibleTextLen <= 0 && plain.length >= PAID_PRO_AUTHORITY_MIN_LEN) {
    logPaidProReviewBlankRenderBlocked({
      canonicalLen: plain.length,
      htmlLen: args.presentation.htmlLen,
      htmlVisibleTextLen: args.presentation.htmlVisibleTextLen,
    });
  }
}

/**
 * Paid Pro first-review document presentation — DOM-visible text guard + canonical plain fallback.
 */

import { htmlToPlainText } from "../../agreement/externalAiHandoff";
import { PAID_PRO_AUTHORITY_MIN_LEN } from "./paidProAgreementAuthority";
import { getPaidProSourceOfTruthText, hasPaidProSourceOfTruth } from "./paidProSourceOfTruth";
import { auditPaidProReviewRenderSotParity } from "./paidProReviewSotParity";

/** Minimum DOM-visible text required before trusting HTML over canonical plain on first review. */
export const PAID_PRO_REVIEW_VISIBLE_TEXT_MIN = 1000;

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
  fallbackApplied: boolean;
  hardInvariantForced?: boolean;
};

export function resolveEffectivePaidProReviewPlain(args: {
  paidReviewPlain: string;
  canonicalPaidProReview: boolean;
}): string {
  const fromProp = (args.paidReviewPlain || "").trim();
  if (fromProp.length >= PAID_PRO_AUTHORITY_MIN_LEN) return fromProp;
  if (args.canonicalPaidProReview && hasPaidProSourceOfTruth()) {
    return getPaidProSourceOfTruthText().trim();
  }
  return fromProp;
}

export function splitCanonicalPlainIntoBlocks(plain: string): string[] {
  return (plain || "")
    .replace(/\r\n/g, "\n")
    .trim()
    .split(/\n\n+/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0);
}

function stripHiddenMarkupForVisibleEstimate(html: string): string {
  let s = html;
  s = s.replace(/<script[\s\S]*?<\/script>/gi, " ");
  s = s.replace(/<style[\s\S]*?<\/style>/gi, " ");
  s = s.replace(/<[^>]*\bhidden\b[^>]*>[\s\S]*?<\/[a-z][^>]*>/gi, " ");
  s = s.replace(/<[^>]*aria-hidden=["']true["'][^>]*>[\s\S]*?<\/[a-z][^>]*>/gi, " ");
  s = s.replace(
    /<([a-z][a-z0-9]*)[^>]*style=["'][^"']*display\s*:\s*none[^"']*["'][^>]*>[\s\S]*?<\/\1>/gi,
    " ",
  );
  s = s.replace(
    /<([a-z][a-z0-9]*)[^>]*style=["'][^"']*visibility\s*:\s*hidden[^"']*["'][^>]*>[\s\S]*?<\/\1>/gi,
    " ",
  );
  return s;
}

/** Estimate text a user would see — hidden markup stripped first (jsdom-safe), then DOM innerText. */
export function measureHtmlDomVisibleTextLen(html: string): number {
  const raw = (html || "").trim();
  if (!raw) return 0;
  const stripped = stripHiddenMarkupForVisibleEstimate(raw);
  const staticVisible = htmlToPlainText(stripped).replace(/\s+/g, " ").trim();
  if (staticVisible.length > 0) return staticVisible.length;
  if (typeof document === "undefined") return 0;
  const host = document.createElement("div");
  host.innerHTML = stripped;
  host.style.cssText =
    "position:fixed;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;pointer-events:none;";
  document.body.appendChild(host);
  try {
    return (host.innerText || host.textContent || "").replace(/\s+/g, " ").trim().length;
  } finally {
    document.body.removeChild(host);
  }
}

export function measureElementVisibleTextLen(element: HTMLElement | null): number {
  if (!element) return 0;
  const inner = (element.innerText || element.textContent || "").replace(/\s+/g, " ").trim();
  return inner.length;
}

export function resolvePaidProFirstReviewDocumentPresentation(args: {
  agreementHtml: string;
  paidReviewPlain: string;
  canonicalPaidProReview: boolean;
  minLen?: number;
  visibleTextMin?: number;
}): PaidProFirstReviewDocumentPresentation {
  const min = args.minLen ?? PAID_PRO_AUTHORITY_MIN_LEN;
  const visibleMin = args.visibleTextMin ?? PAID_PRO_REVIEW_VISIBLE_TEXT_MIN;
  const plain = (args.paidReviewPlain || "").trim();
  const html = (args.agreementHtml || "").trim();
  const htmlVisibleTextLen = measureHtmlDomVisibleTextLen(html);
  const hasCanonicalPlain = Boolean(args.canonicalPaidProReview && plain.length >= min);
  const htmlVisibleThreshold =
    plain.length >= visibleMin ? visibleMin : Math.min(min, Math.max(200, Math.floor(plain.length * 0.2)));
  const htmlHasVisibleBody = htmlVisibleTextLen >= htmlVisibleThreshold;

  let blockedBlankWithCanonical = false;
  let fallbackApplied = false;
  let mode: PaidProFirstReviewDocumentRenderMode = "empty";

  if (hasCanonicalPlain && htmlHasVisibleBody && html.length >= Math.min(min, 200)) {
    mode = "html";
  } else if (hasCanonicalPlain) {
    if (html.length > 0 && !htmlHasVisibleBody) {
      blockedBlankWithCanonical = true;
      fallbackApplied = true;
    }
    mode = "canonical_plain";
  } else if (html.length > 0 && htmlHasVisibleBody) {
    mode = "html_fallback";
  } else if (html.length > 0) {
    mode = "html_fallback";
  }

  const renderedVisibleTextLen =
    mode === "canonical_plain" ? plain.length : mode === "empty" ? 0 : htmlVisibleTextLen;

  if (blockedBlankWithCanonical || fallbackApplied) {
    logPaidProReviewBlankRenderBlocked({
      canonicalLen: plain.length,
      htmlLen: html.length,
      htmlVisibleTextLen,
    });
    logPaidProReviewVisibleRenderGuard({
      canonicalLen: plain.length,
      htmlLen: html.length,
      visibleTextLen: htmlVisibleTextLen,
      renderMode: mode,
      fallbackApplied: true,
    });
  }

  return enforcePaidProFirstReviewHardRenderInvariant({
    mode,
    agreementHtml: html,
    paidReviewPlain: plain,
    htmlLen: html.length,
    plainLen: plain.length,
    htmlVisibleTextLen,
    renderedVisibleTextLen,
    blockedBlankWithCanonical,
    fallbackApplied,
  });
}

/** Production failsafe: never keep hollow HTML when canonical plain exceeds visible threshold. */
export function enforcePaidProFirstReviewHardRenderInvariant(
  presentation: PaidProFirstReviewDocumentPresentation,
): PaidProFirstReviewDocumentPresentation {
  const visibleMin = PAID_PRO_REVIEW_VISIBLE_TEXT_MIN;
  const needsForce =
    presentation.plainLen >= visibleMin &&
    presentation.mode === "html" &&
    presentation.htmlVisibleTextLen < visibleMin;

  if (!needsForce) {
    return { ...presentation, hardInvariantForced: false };
  }

  logPaidProReviewBlankRenderBlocked({
    canonicalLen: presentation.plainLen,
    htmlLen: presentation.htmlLen,
    htmlVisibleTextLen: presentation.htmlVisibleTextLen,
  });
  logPaidProReviewVisibleRenderGuard({
    canonicalLen: presentation.plainLen,
    htmlLen: presentation.htmlLen,
    visibleTextLen: presentation.htmlVisibleTextLen,
    renderMode: "canonical_plain",
    fallbackApplied: true,
  });

  return {
    ...presentation,
    mode: "canonical_plain",
    fallbackApplied: true,
    blockedBlankWithCanonical: true,
    renderedVisibleTextLen: presentation.plainLen,
    hardInvariantForced: true,
  };
}

export function shouldRenderPaidProFirstReviewDiagnostics(args: {
  canonicalPaidProReview: boolean;
}): boolean {
  return Boolean(args.canonicalPaidProReview) || hasPaidProSourceOfTruth();
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

export function logPaidProReviewVisibleRenderGuard(payload: {
  canonicalLen: number;
  htmlLen: number;
  visibleTextLen: number;
  renderMode: PaidProFirstReviewDocumentRenderMode;
  fallbackApplied: boolean;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[paid-pro-review-visible-render-guard]", payload);
}

let lastVisibleRenderGuardFingerprint = "";

export function logPaidProReviewVisibleRenderGuardOnce(
  payload: Parameters<typeof logPaidProReviewVisibleRenderGuard>[0],
): void {
  const fp = JSON.stringify(payload);
  if (fp === lastVisibleRenderGuardFingerprint) return;
  lastVisibleRenderGuardFingerprint = fp;
  logPaidProReviewVisibleRenderGuard(payload);
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
  lastVisibleRenderGuardFingerprint = "";
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

export function shouldForcePaidProCanonicalPlainFallback(args: {
  canonicalPaidProReview: boolean;
  paidReviewPlain: string;
  measuredVisibleTextLen: number;
  visibleTextMin?: number;
}): boolean {
  const visibleMin = args.visibleTextMin ?? PAID_PRO_REVIEW_VISIBLE_TEXT_MIN;
  const plainLen = (args.paidReviewPlain || "").trim().length;
  return (
    Boolean(args.canonicalPaidProReview) &&
    plainLen >= visibleMin &&
    args.measuredVisibleTextLen < visibleMin
  );
}

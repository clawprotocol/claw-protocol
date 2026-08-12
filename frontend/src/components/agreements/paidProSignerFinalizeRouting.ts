/**
 * Paid Pro signer-finalize → review-decision routing guards (Test216A).
 * Signer metadata finalize must never bridge to VS01 / e-sign until the user explicitly
 * chooses Prepare signature links on the review-decision surface.
 */

/** Intake must not invoke these from finalizePaidProSignerMetadataAndOpenReviewDecision. */
export const PAID_PRO_SIGNER_FINALIZE_FORBIDDEN_ROUTE_MARKERS = [
  "continueGuidedFinalReviewToSigning",
  "handleProSendForSignature",
  "enterGuidedSignatureTrackRoute",
  "send-flow-vs01-bridge",
  "agreement-to-vs01-esign-route",
] as const;

export const PAID_PRO_SIGNER_DETAILS_FINALIZE_REASON = "paid_pro_signer_details_complete";

/** Sticky CTA after snapshot — scroll to inline review/send choices only. */
export const PAID_PRO_REVIEW_DECISION_SCROLL_CTA = "Choose next step below";

export const PAID_PRO_REVIEW_DECISION_SCROLL_REASON = "paid_pro_review_decision_scroll_to_choices";

/** Legacy reason that incorrectly routed to VS01 from sticky — must not be used. */
export const PAID_PRO_REVIEW_DECISION_LEGACY_PREPARE_REASON = "paid_pro_review_decision_prepare_signing";

export function isPaidProSignerDetailsFinalizeReason(reason: string | null | undefined): boolean {
  return (reason || "").trim() === PAID_PRO_SIGNER_DETAILS_FINALIZE_REASON;
}

export function isPaidProReviewDecisionScrollReason(reason: string | null | undefined): boolean {
  return (reason || "").trim() === PAID_PRO_REVIEW_DECISION_SCROLL_REASON;
}

export function isPaidProReviewDecisionLegacyPrepareReason(reason: string | null | undefined): boolean {
  return (reason || "").trim() === PAID_PRO_REVIEW_DECISION_LEGACY_PREPARE_REASON;
}

export function scrollPaidProReviewDecisionIntoView(): void {
  if (typeof window === "undefined") return;
  window.requestAnimationFrame(() => {
    document
      .getElementById("simple-pro-final-review-actions")
      ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });
}

/** Source-level assertion helper for regression tests. */
export function paidProSignerFinalizeBlockContainsForbiddenRoutes(source: string): string[] {
  // Prefer the useCallback definition — the earlier `...DecisionRef` declaration shares a prefix.
  const start = source.indexOf(
    "const finalizePaidProSignerMetadataAndOpenReviewDecision = React.useCallback",
  );
  if (start < 0) return PAID_PRO_SIGNER_FINALIZE_FORBIDDEN_ROUTE_MARKERS.slice();
  const end = source.indexOf("const continueGuidedFinalReviewToSigning", start);
  const block = source.slice(start, end > start ? end : start + 3500);
  // Ignore comment-only mentions of forbidden markers (routing docs in nearby comments).
  const codeOnly = block
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
  return PAID_PRO_SIGNER_FINALIZE_FORBIDDEN_ROUTE_MARKERS.filter((marker) => codeOnly.includes(marker));
}

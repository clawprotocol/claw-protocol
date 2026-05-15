/** Dev / QA: `localStorage.lawdogReviewFlowDiag = "1"` enables [review-link-cta-state] / [review-approval-status] logs. */
function reviewFlowDiagEnabled(): boolean {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return false;
  return (
    Boolean(typeof import.meta !== "undefined" && import.meta.env?.DEV) ||
    (typeof window !== "undefined" && window.localStorage?.getItem("lawdogReviewFlowDiag") === "1")
  );
}

export function logReviewLinkCtaState(payload: Record<string, unknown>): void {
  if (!reviewFlowDiagEnabled()) return;
  // eslint-disable-next-line no-console
  console.info("[review-link-cta-state]", payload);
}

export function logReviewApprovalStatus(payload: Record<string, unknown>): void {
  if (!reviewFlowDiagEnabled()) return;
  // eslint-disable-next-line no-console
  console.info("[review-approval-status]", payload);
}

export function logReviewLinkRowOpen(payload: Record<string, unknown>): void {
  if (!reviewFlowDiagEnabled()) return;
  // eslint-disable-next-line no-console
  console.info("[review-link-row-open]", payload);
}

export function logRecipientReviewTokenResolved(payload: Record<string, unknown>): void {
  if (!reviewFlowDiagEnabled()) return;
  // eslint-disable-next-line no-console
  console.info("[recipient-review-token-resolved]", payload);
}

export function logReviewStateSource(payload: Record<string, unknown>): void {
  if (!reviewFlowDiagEnabled()) return;
  // eslint-disable-next-line no-console
  console.info("[review-state-source]", payload);
}

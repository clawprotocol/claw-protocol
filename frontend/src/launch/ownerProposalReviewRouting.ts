/** Owner-facing route for reviewing recipient-proposed wording changes (not generic done/send). */
export function buildOwnerProposalReviewPath(agreementId: string): string {
  return `/app/review-changes/${encodeURIComponent(String(agreementId || "").trim())}`;
}

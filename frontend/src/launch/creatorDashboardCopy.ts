export const CREATOR_PREPARE_SIGNATURE_LINKS_LABEL = "Prepare signature links";

export const CREATOR_NEXT_ACTION_PREPARE_SIGNATURE_LINKS = "Prepare signature links";

export const CREATOR_OPEN_REVIEW_LINK_PAGE_LABEL = "Open review link page";

export const CREATOR_REVIEWS_COMPLETE_PILL = "Reviews complete";

export const CREATOR_ALL_REVIEWERS_APPROVED_HELPER =
  "All reviewers approved. Prepare signature links when you're ready. Nothing is signed until signature links are prepared and completed.";

export const CREATOR_ALL_REVIEWERS_APPROVED_HELPER_EXTENDED =
  "Both parties approved the draft. Prepare signature links when you're ready. Nothing is signed until each signer completes their signature.";

export const REVIEW_LINK_READY_ALL_APPROVED_TITLE = "All reviewers approved";

export const REVIEW_LINK_READY_ALL_APPROVED_BODY =
  "All reviewers approved. Prepare signature links when you're ready. Nothing is signed until signature links are prepared and completed.";

export const REVIEW_LINK_READY_BACK_TO_DASHBOARD_LABEL = "Back to dashboard";

let lastCreatorDashboardStatusLogKey = "";

export function logCreatorDashboardAgreementStatusLoaded(payload: {
  agreementId: string;
  approvedCount: number;
  partyCount: number;
  nextAction: string;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  const key = JSON.stringify(payload);
  if (key === lastCreatorDashboardStatusLogKey) return;
  lastCreatorDashboardStatusLogKey = key;
  const id = payload.agreementId.trim();
  // eslint-disable-next-line no-console
  console.info("[creator-dashboard-agreement-status-loaded]", {
    agreementIdShort: id.length <= 12 ? id : `${id.slice(0, 8)}…`,
    approvedCount: payload.approvedCount,
    partyCount: payload.partyCount,
    nextAction: payload.nextAction,
  });
}

let lastReviewLinkReadyAllApprovedLogKey = "";

export function logReviewLinkReadyAllApproved(payload: {
  agreementId: string;
  approvedCount: number;
  partyCount: number;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  const key = JSON.stringify(payload);
  if (key === lastReviewLinkReadyAllApprovedLogKey) return;
  lastReviewLinkReadyAllApprovedLogKey = key;
  const id = payload.agreementId.trim();
  // eslint-disable-next-line no-console
  console.info("[review-link-ready-all-approved]", {
    agreementIdShort: id.length <= 12 ? id : `${id.slice(0, 8)}…`,
    approvedCount: payload.approvedCount,
    partyCount: payload.partyCount,
  });
}

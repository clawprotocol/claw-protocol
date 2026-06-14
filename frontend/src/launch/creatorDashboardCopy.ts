export const CREATOR_PREPARE_SIGNATURE_LINKS_LABEL = "Prepare and send signing links";

export const CREATOR_NEXT_ACTION_PREPARE_SIGNATURE_LINKS = "Prepare and send signing links";

export const CREATOR_NEXT_ACTION_OPEN_AGREEMENT_WORKSPACE = "Open agreement workspace";

export const CREATOR_OPEN_REVIEW_LINK_PAGE_LABEL = "Open review link page";

export const CREATOR_TRACK_REVIEW_STATUS_LABEL = "Track review status";

export const CREATOR_VIEW_AGREEMENT_LABEL = "View agreement";

export const CREATOR_MANAGE_RECIPIENTS_LABEL = "Manage recipients";

export const CREATOR_REVIEWS_APPROVED_PILL = "Reviews approved";

export const CREATOR_WAITING_ON_REVIEWER_PILL = "Waiting on reviewer";

export const CREATOR_SIGNATURE_LINKS_LOCKED_HELPER =
  "Signature links unlock after all parties approve.";

export const CREATOR_PREPARE_SIGNATURE_LINKS_BLOCKED_NOTICE =
  "Signature links are available after all parties approve the review.";

export const CREATOR_PREPARE_BRIDGE_FAILED_NOTICE =
  "We couldn't open signature prep from the dashboard. Use Open review link page and tap Prepare signature links there.";

/** @deprecated Use CREATOR_REVIEWS_APPROVED_PILL */
export const CREATOR_REVIEWS_COMPLETE_PILL = CREATOR_REVIEWS_APPROVED_PILL;

export const CREATOR_ALL_REVIEWERS_APPROVED_HELPER =
  "Everyone approved this draft. Review field placement, then LawDog sends signing links to all parties.";

export const CREATOR_ALL_REVIEWERS_APPROVED_HELPER_EXTENDED =
  "Everyone approved this draft. Review field placement, then LawDog sends signing links to all parties.";

export const REVIEW_LINK_READY_ALL_APPROVED_TITLE = "All reviewers approved";

export const REVIEW_LINK_READY_ALL_APPROVED_BODY =
  "All reviewers approved. Review field placement, then LawDog sends signing links to all parties. Nothing is signed until everyone completes signing.";

export const REVIEW_LINK_READY_BACK_TO_DASHBOARD_LABEL = "Back to dashboard";

export function logDashboardWhatsNextCtaClick(payload: {
  agreementId: string;
  action: string;
  targetRoute: string;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[dashboard-whats-next-cta-click]", payload);
}

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

let lastCreatorDashboardPrepareClickLogKey = "";

export function logCreatorDashboardPrepareClick(payload: {
  agreementId: string;
  hasDraft: boolean;
  hasSnapshot: boolean;
  reviewApprovedCount: number;
  partyCount: number;
  reviewSource: string;
  usedCachedReviewRows: boolean;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  const key = JSON.stringify(payload);
  if (key === lastCreatorDashboardPrepareClickLogKey) return;
  lastCreatorDashboardPrepareClickLogKey = key;
  const id = payload.agreementId.trim();
  // eslint-disable-next-line no-console
  console.info("[creator-dashboard-prepare-click]", {
    agreementIdShort: id.length <= 12 ? id : `${id.slice(0, 8)}…`,
    hasDraft: payload.hasDraft,
    hasSnapshot: payload.hasSnapshot,
    reviewApprovedCount: payload.reviewApprovedCount,
    partyCount: payload.partyCount,
    reviewSource: payload.reviewSource,
    usedCachedReviewRows: payload.usedCachedReviewRows,
  });
}

let lastCreatorDashboardPrepareBridgeResultLogKey = "";

export function logCreatorDashboardPrepareBridgeNavigateStart(payload: {
  agreementId: string;
  pathname: string;
  search: string;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  const id = payload.agreementId.trim();
  // eslint-disable-next-line no-console
  console.info("[creator-dashboard-prepare-bridge-navigate-start]", {
    agreementIdShort: id.length <= 12 ? id : `${id.slice(0, 8)}…`,
    pathname: payload.pathname,
    search: payload.search,
  });
}

let lastCreatorDashboardPrepareQueryCleanupLogKey = "";

export function logCreatorDashboardPrepareQueryCleanup(payload: {
  agreementId: string;
  pathnameBefore: string;
  searchBefore: string;
  cleanPath: string | null;
  skippedReason: string | null;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  const key = JSON.stringify(payload);
  if (key === lastCreatorDashboardPrepareQueryCleanupLogKey) return;
  lastCreatorDashboardPrepareQueryCleanupLogKey = key;
  const id = payload.agreementId.trim();
  // eslint-disable-next-line no-console
  console.info("[creator-dashboard-prepare-query-cleanup]", {
    agreementIdShort: id.length <= 12 ? id : `${id.slice(0, 8)}…`,
    pathnameBefore: payload.pathnameBefore,
    searchBefore: payload.searchBefore,
    cleanPath: payload.cleanPath,
    skippedReason: payload.skippedReason,
  });
}

export function logCreatorDashboardPrepareBridgeResult(payload: {
  agreementId: string;
  navigated: boolean;
  destination: string | null;
  bridgeAttempted: boolean;
  blockReason: string | null;
  vs01RouteAttempted: boolean;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  const key = JSON.stringify(payload);
  if (key === lastCreatorDashboardPrepareBridgeResultLogKey) return;
  lastCreatorDashboardPrepareBridgeResultLogKey = key;
  const id = payload.agreementId.trim();
  // eslint-disable-next-line no-console
  console.info("[creator-dashboard-prepare-bridge-result]", {
    agreementIdShort: id.length <= 12 ? id : `${id.slice(0, 8)}…`,
    navigated: payload.navigated,
    destination: payload.destination,
    bridgeAttempted: payload.bridgeAttempted,
    blockReason: payload.blockReason,
    vs01RouteAttempted: payload.vs01RouteAttempted,
  });
}

let lastCreatorDashboardPrepareNavigationBlockedLogKey = "";

export function logCreatorReviewCompletePrepareClick(payload: {
  agreementId: string;
  hasDraft: boolean;
  allReviewsComplete: boolean;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  const id = payload.agreementId.trim();
  // eslint-disable-next-line no-console
  console.info("[creator-review-complete-prepare-click]", {
    agreementIdShort: id.length <= 12 ? id : `${id.slice(0, 8)}…`,
    hasDraft: payload.hasDraft,
    allReviewsComplete: payload.allReviewsComplete,
  });
}

export function logCreatorDashboardPrepareNavigationBlocked(payload: {
  agreementId: string;
  reason: string;
  reviewApprovedCount: number;
  partyCount: number;
  allApproved: boolean;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  const key = JSON.stringify(payload);
  if (key === lastCreatorDashboardPrepareNavigationBlockedLogKey) return;
  lastCreatorDashboardPrepareNavigationBlockedLogKey = key;
  const id = payload.agreementId.trim();
  // eslint-disable-next-line no-console
  console.info("[creator-dashboard-prepare-navigation-blocked]", {
    agreementIdShort: id.length <= 12 ? id : `${id.slice(0, 8)}…`,
    reason: payload.reason,
    reviewApprovedCount: payload.reviewApprovedCount,
    partyCount: payload.partyCount,
    allApproved: payload.allApproved,
  });
}

/** @deprecated Use logCreatorDashboardPrepareClick */
export function logCreatorDashboardPrepareSignatureClick(payload: {
  agreementId: string;
  hasDraft: boolean;
  hasSnapshot: boolean;
  reviewApprovedCount: number;
  partyCount: number;
  bridgeResult: boolean | null;
  destination: string | null;
}): void {
  logCreatorDashboardPrepareClick({
    agreementId: payload.agreementId,
    hasDraft: payload.hasDraft,
    hasSnapshot: payload.hasSnapshot,
    reviewApprovedCount: payload.reviewApprovedCount,
    partyCount: payload.partyCount,
    reviewSource: "legacy",
    usedCachedReviewRows: false,
  });
  if (payload.bridgeResult !== null || payload.destination) {
    logCreatorDashboardPrepareBridgeResult({
      agreementId: payload.agreementId,
      navigated: Boolean(payload.destination),
      destination: payload.destination,
      bridgeAttempted: payload.bridgeResult !== null,
      blockReason: payload.bridgeResult === false ? "vs01_bridge_failed" : null,
      vs01RouteAttempted: payload.bridgeResult !== null,
    });
  }
}

let lastCreatorDashboardReviewGateLogKey = "";

export function logCreatorDashboardReviewGate(payload: {
  agreementId: string;
  requiredPartyCount: number;
  approvedCount: number;
  allApproved: boolean;
  partyStatuses: readonly { displayName: string; statusLabel: string }[];
  prepareSignatureLinksVisible: boolean;
  prepareSignatureLinksEnabled: boolean;
  source: string;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  const key = JSON.stringify(payload);
  if (key === lastCreatorDashboardReviewGateLogKey) return;
  lastCreatorDashboardReviewGateLogKey = key;
  const id = payload.agreementId.trim();
  // eslint-disable-next-line no-console
  console.info("[creator-dashboard-review-gate]", {
    agreementIdShort: id.length <= 12 ? id : `${id.slice(0, 8)}…`,
    requiredPartyCount: payload.requiredPartyCount,
    approvedCount: payload.approvedCount,
    allApproved: payload.allApproved,
    partyStatuses: payload.partyStatuses,
    prepareSignatureLinksVisible: payload.prepareSignatureLinksVisible,
    prepareSignatureLinksEnabled: payload.prepareSignatureLinksEnabled,
    source: payload.source,
  });
}

let lastDashboardInitialStateLogKeys = new Set<string>();

export function logDashboardInitialState(payload: {
  agreementId: string;
  approvedCount: number;
  requiredPartyCount: number;
  allApproved: boolean;
  statusPill: string;
  source: string;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  const id = payload.agreementId.trim();
  if (lastDashboardInitialStateLogKeys.has(id)) return;
  lastDashboardInitialStateLogKeys.add(id);
  // eslint-disable-next-line no-console
  console.info("[dashboard-initial-state]", {
    agreementIdShort: id.length <= 12 ? id : `${id.slice(0, 8)}…`,
    approvedCount: payload.approvedCount,
    requiredPartyCount: payload.requiredPartyCount,
    allApproved: payload.allApproved,
    statusPill: payload.statusPill,
    source: payload.source,
  });
}

let lastDashboardPostReviewGateStateLogKeys = new Set<string>();

export function logDashboardPostReviewGateState(payload: {
  agreementId: string;
  approvedCount: number;
  requiredPartyCount: number;
  allApproved: boolean;
  statusPill: string | null;
  source: string;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  const id = payload.agreementId.trim();
  const key = `${id}:${payload.approvedCount}:${payload.requiredPartyCount}:${payload.allApproved}:${payload.statusPill}:${payload.source}`;
  if (lastDashboardPostReviewGateStateLogKeys.has(key)) return;
  lastDashboardPostReviewGateStateLogKeys.add(key);
  // eslint-disable-next-line no-console
  console.info("[dashboard-post-review-gate-state]", {
    agreementIdShort: id.length <= 12 ? id : `${id.slice(0, 8)}…`,
    approvedCount: payload.approvedCount,
    requiredPartyCount: payload.requiredPartyCount,
    allApproved: payload.allApproved,
    statusPill: payload.statusPill,
    source: payload.source,
  });
}

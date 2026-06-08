import type { WorkspaceIndexAgreement } from "../agreement/agreementWorkspaceApi";
import {
  countOwnerReviewPartyApproved,
  type OwnerReviewPartyStatusRow,
} from "./simpleProduct/ownerReviewPartyStatusChecklist";

export type CreatorDashboardReviewGateSource = "draft_parties" | "pending_hydration" | "no_review_activity";

export type CreatorDashboardReviewPartyStatus = {
  displayName: string;
  statusLabel: string;
  status: OwnerReviewPartyStatusRow["status"];
};

export type CreatorDashboardReviewGate = {
  requiredPartyCount: number;
  approvedCount: number;
  allRequiredReviewPartiesApproved: boolean;
  partyStatuses: readonly CreatorDashboardReviewPartyStatus[];
  source: CreatorDashboardReviewGateSource;
  /** False until draft party rows hydrate — UI must not render review counts/CTAs from index. */
  authoritative: boolean;
};

/** Agreements in an active review/signing-prep path need draft party rows before review UI renders. */
export function creatorDashboardNeedsAuthoritativeReviewHydration(
  row: WorkspaceIndexAgreement,
): boolean {
  if (row.completed_signed) return false;
  if (row.has_server_signing_lock) return true;
  if (row.all_reviewers_approved) return true;
  if (row.review_sent_at) return true;
  if (row.reviewer_approved) return true;
  if ((row.review_approvals_completed ?? 0) > 0) return true;
  return false;
}

/**
 * Single authoritative review-completion calculation.
 * Never derives requiredPartyCount from approvedCount.
 * Index summaries are not used for rendered review UI — only pending hydration or draft parties.
 */
export function resolveCreatorDashboardReviewGate(
  row: WorkspaceIndexAgreement,
  reviewRows: readonly OwnerReviewPartyStatusRow[],
): CreatorDashboardReviewGate {
  if (reviewRows.length > 0) {
    const approvedCount = countOwnerReviewPartyApproved(reviewRows);
    const requiredPartyCount = reviewRows.length;
    return {
      requiredPartyCount,
      approvedCount,
      allRequiredReviewPartiesApproved:
        approvedCount === requiredPartyCount &&
        reviewRows.every((partyRow) => partyRow.status === "approved"),
      partyStatuses: reviewRows.map((partyRow) => ({
        displayName: partyRow.displayName,
        statusLabel: partyRow.statusLabel,
        status: partyRow.status,
      })),
      source: "draft_parties",
      authoritative: true,
    };
  }

  if (creatorDashboardNeedsAuthoritativeReviewHydration(row)) {
    return {
      requiredPartyCount: 0,
      approvedCount: 0,
      allRequiredReviewPartiesApproved: false,
      partyStatuses: [],
      source: "pending_hydration",
      authoritative: false,
    };
  }

  return {
    requiredPartyCount: 0,
    approvedCount: 0,
    allRequiredReviewPartiesApproved: false,
    partyStatuses: [],
    source: "no_review_activity",
    authoritative: true,
  };
}

export function formatCreatorReviewProgressLabel(gate: CreatorDashboardReviewGate): string | null {
  if (!gate.authoritative || gate.requiredPartyCount <= 0) return null;
  return `${gate.approvedCount} of ${gate.requiredPartyCount} approved`;
}

export function creatorDashboardWaitingOnReviewer(gate: CreatorDashboardReviewGate): boolean {
  if (!gate.authoritative) return false;
  return gate.approvedCount > 0 && !gate.allRequiredReviewPartiesApproved;
}

export function creatorDashboardReviewHydrationPending(
  row: WorkspaceIndexAgreement,
  reviewRows: readonly OwnerReviewPartyStatusRow[],
): boolean {
  return (
    creatorDashboardNeedsAuthoritativeReviewHydration(row) &&
    resolveCreatorDashboardReviewGate(row, reviewRows).source === "pending_hydration"
  );
}

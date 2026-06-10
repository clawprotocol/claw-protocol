import type { AgreementDraft } from "../agreement/agreementTypes";
import type { WorkspaceIndexAgreement } from "../agreement/agreementWorkspaceApi";
import { computeReviewApprovalStatus } from "../components/agreements/draftRecipientReviewSignals";
import {
  countOwnerReviewPartyApproved,
  deriveOwnerReviewPartyStatusRows,
  type OwnerReviewPartyStatusRow,
} from "./simpleProduct/ownerReviewPartyStatusChecklist";
import { readSimpleDoneReviewRecipientLinks } from "./simpleProduct/simpleDoneReviewRecipientLinks";

export type CreatorDashboardReviewGateSource =
  | "draft_parties"
  | "pending_hydration"
  | "no_review_activity"
  | "workspace_index_summary";

function resolveRequiredPartyCountFromIndex(
  row: WorkspaceIndexAgreement,
  reviewRowCount: number,
): number {
  return Math.max(reviewRowCount, row.review_approvals_required ?? 0, row.party_count ?? 0, 1);
}

/** Workspace index is authoritative for review completion when server marks all reviewers approved. */
function reviewGateFromWorkspaceIndexSummary(
  row: WorkspaceIndexAgreement,
  reviewRows: readonly OwnerReviewPartyStatusRow[],
  source: Extract<CreatorDashboardReviewGateSource, "draft_parties" | "pending_hydration" | "workspace_index_summary">,
): CreatorDashboardReviewGate {
  const requiredPartyCount = resolveRequiredPartyCountFromIndex(row, reviewRows.length);
  return {
    requiredPartyCount,
    approvedCount: requiredPartyCount,
    allRequiredReviewPartiesApproved: true,
    partyStatuses: reviewRows.map((partyRow) => ({
      displayName: partyRow.displayName,
      statusLabel: partyRow.statusLabel,
      status: partyRow.status,
    })),
    source,
    authoritative: true,
  };
}

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
  /** Open recipient proposals block signature-prep advancement. */
  hasOpenChangeRequests?: boolean;
};

export type ResolveCreatorDashboardReviewGateOptions = {
  draft?: AgreementDraft | null;
  mintedReviewerLinkCount?: number;
};

function reviewGateFromDraftApprovalAggregate(
  row: WorkspaceIndexAgreement,
  draft: AgreementDraft,
  reviewRows: readonly OwnerReviewPartyStatusRow[],
  mintedReviewerLinkCount?: number,
): CreatorDashboardReviewGate {
  const agg = computeReviewApprovalStatus(draft, {
    mintedReviewerLinkCount:
      mintedReviewerLinkCount ?? readSimpleDoneReviewRecipientLinks(row.id)?.recipients.length ?? 0,
  });
  const displayRows =
    reviewRows.length > 0 ? reviewRows : deriveOwnerReviewPartyStatusRows(draft);
  const displayApproved = countOwnerReviewPartyApproved(displayRows);
  const displayRequired = displayRows.length;
  let requiredPartyCount = agg.requiredReviewerCount;
  let approvedCount = agg.approvedReviewerCount;
  let allRequiredReviewPartiesApproved = agg.allReviewersApproved && !agg.hasOpenChangeRequests;
  if (
    !allRequiredReviewPartiesApproved &&
    displayRequired > requiredPartyCount &&
    displayApproved < displayRequired
  ) {
    requiredPartyCount = displayRequired;
    approvedCount = displayApproved;
    allRequiredReviewPartiesApproved = false;
  }
  if (!allRequiredReviewPartiesApproved && row.all_reviewers_approved && !agg.hasOpenChangeRequests) {
    requiredPartyCount = Math.max(requiredPartyCount, displayRequired, resolveRequiredPartyCountFromIndex(row, displayRequired));
    approvedCount = requiredPartyCount;
    allRequiredReviewPartiesApproved = true;
  }
  return {
    requiredPartyCount,
    approvedCount,
    allRequiredReviewPartiesApproved,
    hasOpenChangeRequests: agg.hasOpenChangeRequests,
    partyStatuses: displayRows.map((partyRow) => ({
      displayName: partyRow.displayName,
      statusLabel: partyRow.statusLabel,
      status: partyRow.status,
    })),
    source: "draft_parties",
    authoritative: true,
  };
}

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
  options?: ResolveCreatorDashboardReviewGateOptions,
): CreatorDashboardReviewGate {
  const draft = options?.draft ?? null;
  if (draft) {
    return reviewGateFromDraftApprovalAggregate(row, draft, reviewRows, options?.mintedReviewerLinkCount);
  }

  if (reviewRows.length > 0) {
    const approvedCount = countOwnerReviewPartyApproved(reviewRows);
    const requiredPartyCount = reviewRows.length;
    const allRequiredReviewPartiesApproved =
      approvedCount === requiredPartyCount &&
      reviewRows.every((partyRow) => partyRow.status === "approved");
    if (!allRequiredReviewPartiesApproved && row.all_reviewers_approved) {
      return reviewGateFromWorkspaceIndexSummary(row, reviewRows, "draft_parties");
    }
    return {
      requiredPartyCount,
      approvedCount,
      allRequiredReviewPartiesApproved,
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
    if (row.all_reviewers_approved) {
      return reviewGateFromWorkspaceIndexSummary(row, reviewRows, "workspace_index_summary");
    }
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

/** Lifecycle status using draft-backed review gate when index is stale. */
export function deriveCreatorDashboardEffectiveStatus(
  row: WorkspaceIndexAgreement,
  reviewGate: CreatorDashboardReviewGate,
  indexStatus: import("./creatorDashboardPresentation").CreatorDashboardStatus,
): import("./creatorDashboardPresentation").CreatorDashboardStatus {
  if (indexStatus === "completed" || indexStatus === "signing_in_progress") return indexStatus;
  if (reviewGate.hasOpenChangeRequests) return "in_review";
  if (reviewGate.allRequiredReviewPartiesApproved || row.all_reviewers_approved === true) {
    return "ready_for_signing";
  }
  if (row.review_sent_at || reviewGate.approvedCount > 0) return "in_review";
  return indexStatus;
}

export function creatorDashboardReviewHydrationPending(
  row: WorkspaceIndexAgreement,
  reviewRows: readonly OwnerReviewPartyStatusRow[],
  draft?: AgreementDraft | null,
): boolean {
  if (draft) return false;
  return (
    creatorDashboardNeedsAuthoritativeReviewHydration(row) &&
    resolveCreatorDashboardReviewGate(row, reviewRows).source === "pending_hydration"
  );
}

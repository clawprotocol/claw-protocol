import type { AgreementDraft } from "../agreement/agreementTypes";
import type { WorkspaceIndexAgreement } from "../agreement/agreementWorkspaceApi";
import { resolveAllReviewPartiesApproved } from "../agreement/recipientApprovedWaitingPresentation";
import {
  deriveRequiredReviewerPartyStatusRows,
  countOwnerReviewPartyApproved,
  type OwnerReviewPartyStatusRow,
} from "./simpleProduct/ownerReviewPartyStatusChecklist";
import {
  deriveCreatorDashboardEffectiveStatus,
  formatCreatorReviewProgressLabel,
  resolveCreatorDashboardReviewGate,
  creatorDashboardWaitingOnReviewer,
  type CreatorDashboardReviewGate,
} from "./creatorDashboardReviewGate";
import { isAgreementCompletedForDashboard } from "./creatorDashboardAgreementCompletion";
import {
  creatorDashboardHasPartialSigningProgress,
  formatCreatorSigningProgressLabel,
  resolveCreatorSigningProgressSnapshot,
  type CreatorSigningProgressSnapshot,
} from "./creatorDashboardSigningProgress";
import {
  isAgreementPacketPrepared,
} from "../vs01/vs01WorkspaceSigningStatus";
import {
  CREATOR_PREPARE_SIGNATURE_LINKS_LABEL,
  CREATOR_REVIEWS_APPROVED_PILL,
  CREATOR_WAITING_ON_REVIEWER_PILL,
  CREATOR_NEXT_ACTION_OPEN_AGREEMENT_WORKSPACE,
  CREATOR_TRACK_REVIEW_STATUS_LABEL,
  CREATOR_OPEN_REVIEW_LINK_PAGE_LABEL,
  CREATOR_MANAGE_RECIPIENTS_LABEL,
} from "./creatorDashboardCopy";
import {
  creatorDashboardFocusAgreementPath,
  creatorDashboardCompletedProofPath,
  creatorDashboardUsesManualReviewLinkPage,
} from "./creatorDashboardReviewLinkRouting";

export type CreatorDashboardStatus =
  | "draft"
  | "in_review"
  | "review_approved"
  | "ready_for_signing"
  | "signing_in_progress"
  | "completed";

export type CreatorDashboardMetricKey = "drafts" | "in_review" | "ready_for_signing" | "completed";

export type CreatorDashboardActionKind = "navigate" | "focus_review_status" | "manage_recipients";

export type CreatorDashboardAction = {
  label: string;
  path: string;
  emphasis: "primary" | "secondary";
  kind?: CreatorDashboardActionKind;
};

export const CREATOR_DASHBOARD_STATUS_LABEL: Record<CreatorDashboardStatus, string> = {
  draft: "Draft",
  in_review: "In Review",
  review_approved: "Review Approved",
  ready_for_signing: "Ready for Signing",
  signing_in_progress: "Signing In Progress",
  completed: "Completed",
};

export function resolveCreatorDashboardGreetingName(): string {
  if (typeof localStorage === "undefined") return "there";
  try {
    const stored =
      localStorage.getItem("claw_creator_display_name")?.trim() ||
      localStorage.getItem("claw_user_display_name")?.trim() ||
      "";
    return stored || "there";
  } catch {
    return "there";
  }
}

export function resolveCreatorGreetingHeadline(now = new Date()): string {
  const hour = now.getHours();
  const salutation = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const name = resolveCreatorDashboardGreetingName();
  return `${salutation}, ${name}`;
}

export function deriveCreatorDashboardStatus(row: WorkspaceIndexAgreement): CreatorDashboardStatus {
  if (isAgreementCompletedForDashboard(row)) return "completed";
  if (row.has_server_signing_lock || isAgreementPacketPrepared(row.id)) return "signing_in_progress";
  if (row.all_reviewers_approved) return "ready_for_signing";
  const required = Math.max(row.review_approvals_required ?? 0, row.party_count ?? 0);
  const done = row.review_approvals_completed ?? 0;
  if (required > 0 && done >= required && row.all_reviewers_approved) return "ready_for_signing";
  if (row.reviewer_approved && done > 0 && (required <= 0 || done < required)) return "in_review";
  if (row.review_sent_at) return "in_review";
  return "draft";
}

export function creatorDashboardMetricKeyForStatus(status: CreatorDashboardStatus): CreatorDashboardMetricKey | null {
  switch (status) {
    case "draft":
      return "drafts";
    case "in_review":
    case "review_approved":
      return "in_review";
    case "ready_for_signing":
    case "signing_in_progress":
      return "ready_for_signing";
    case "completed":
      return "completed";
    default:
      return null;
  }
}

export function countCreatorDashboardMetrics(rows: readonly WorkspaceIndexAgreement[]): Record<
  CreatorDashboardMetricKey,
  number
> {
  const counts: Record<CreatorDashboardMetricKey, number> = {
    drafts: 0,
    in_review: 0,
    ready_for_signing: 0,
    completed: 0,
  };
  for (const row of rows) {
    const key = creatorDashboardMetricKeyForStatus(deriveCreatorDashboardStatus(row));
    if (key) counts[key] += 1;
  }
  return counts;
}

export function creatorDashboardPrimaryAction(
  row: WorkspaceIndexAgreement,
  options?: { manualReviewLinkPage?: boolean },
): CreatorDashboardAction {
  const id = encodeURIComponent(row.id);
  const manualReviewLinkPage = options?.manualReviewLinkPage ?? creatorDashboardUsesManualReviewLinkPage();
  const status = deriveCreatorDashboardStatus(row);
  switch (status) {
    case "completed":
      return {
        label: CREATOR_NEXT_ACTION_OPEN_AGREEMENT_WORKSPACE,
        path: creatorDashboardCompletedProofPath(row.id),
        emphasis: "primary",
      };
    case "signing_in_progress":
      return { label: "View signing status", path: `/app/send/${id}`, emphasis: "primary" };
    case "ready_for_signing":
    case "review_approved":
      return { label: CREATOR_PREPARE_SIGNATURE_LINKS_LABEL, path: "/app", emphasis: "primary" };
    case "in_review":
      if (manualReviewLinkPage) {
        return {
          label: CREATOR_TRACK_REVIEW_STATUS_LABEL,
          path: creatorDashboardFocusAgreementPath(row.id),
          emphasis: "primary",
          kind: "focus_review_status",
        };
      }
      if (Boolean((row.review_sent_at || "").trim())) {
        return {
          label: CREATOR_MANAGE_RECIPIENTS_LABEL,
          path: creatorDashboardFocusAgreementPath(row.id),
          emphasis: "primary",
          kind: "manage_recipients",
        };
      }
      return {
        label: CREATOR_TRACK_REVIEW_STATUS_LABEL,
        path: creatorDashboardFocusAgreementPath(row.id),
        emphasis: "primary",
        kind: "focus_review_status",
      };
    case "draft":
    default:
      return { label: "Continue Editing", path: `/app/send/${id}`, emphasis: "secondary" };
  }
}

export type CreatorDashboardSupplementalAction = {
  label: string;
  path: string;
  testIdSuffix: string;
};

/** Secondary row actions on dashboard agreement cards — does not replace primary CTA. */
export function creatorDashboardSupplementalActions(
  row: WorkspaceIndexAgreement,
  options?: { manualReviewLinkPage?: boolean },
): CreatorDashboardSupplementalAction[] {
  const id = encodeURIComponent(row.id);
  const manualReviewLinkPage = options?.manualReviewLinkPage ?? creatorDashboardUsesManualReviewLinkPage();
  const status = deriveCreatorDashboardStatus(row);
  const out: CreatorDashboardSupplementalAction[] = [];

  if (status === "in_review") {
    if (manualReviewLinkPage) {
      out.push({
        label: CREATOR_OPEN_REVIEW_LINK_PAGE_LABEL,
        path: creatorDashboardFocusAgreementPath(row.id),
        testIdSuffix: "open-review-link",
      });
    }
    return out;
  }

  if (status === "completed" || status === "signing_in_progress") {
    out.push({
      label: "Open workspace",
      path: creatorDashboardCompletedProofPath(row.id),
      testIdSuffix: "open-workspace",
    });
  }

  if (status === "draft" && manualReviewLinkPage) {
    out.push({ label: "Continue review", path: `/app/send/${id}`, testIdSuffix: "continue-review" });
  }
  if (status === "signing_in_progress") {
    out.push({
      label: "Open signing packet",
      path: `/app/send/${id}`,
      testIdSuffix: "open-signing-packet",
    });
  }
  if (status === "completed") {
    out.push({
      label: "Download final",
      path: creatorDashboardCompletedProofPath(row.id),
      testIdSuffix: "download-final",
    });
  }
  return out;
}

export function creatorDashboardShowsReviewPanel(status: CreatorDashboardStatus): boolean {
  return status === "in_review" || status === "ready_for_signing" || status === "review_approved";
}

export function creatorDashboardReviewRowsFromDraft(
  draft: AgreementDraft | null | undefined,
): OwnerReviewPartyStatusRow[] {
  return deriveRequiredReviewerPartyStatusRows(draft);
}

/** Prefer fresh draft party rows; fall back to dashboard-hydrated rows when draft lags approvals. */
export function resolveEffectiveCreatorDashboardReviewRows(
  draft: AgreementDraft | null | undefined,
  cachedRows: readonly OwnerReviewPartyStatusRow[],
): OwnerReviewPartyStatusRow[] {
  const fromDraft = creatorDashboardReviewRowsFromDraft(draft);
  if (fromDraft.length === 0) return [...cachedRows];
  if (cachedRows.length === 0) return fromDraft;
  const draftApproved = countOwnerReviewPartyApproved(fromDraft);
  const cachedApproved = countOwnerReviewPartyApproved(cachedRows);
  if (draftApproved >= cachedApproved) return fromDraft;
  return [...cachedRows];
}

export function creatorDashboardAllPartiesApproved(
  row: WorkspaceIndexAgreement,
  reviewRows: readonly OwnerReviewPartyStatusRow[],
): boolean {
  return resolveCreatorDashboardReviewGate(row, reviewRows).allRequiredReviewPartiesApproved;
}

export function formatCreatorDashboardUpdated(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "Updated recently";
  const diffMs = Date.now() - t;
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "Updated just now";
  if (mins < 60) return `Updated ${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Updated ${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 14) return `Updated ${days}d ago`;
  return `Updated ${new Date(iso).toLocaleDateString()}`;
}

export function displayCreatorAgreementTitle(title: string): string {
  const t = (title || "").trim();
  if (t.length <= 2) return "Untitled agreement";
  return t;
}

export function sortCreatorDashboardRows(
  rows: readonly WorkspaceIndexAgreement[],
): WorkspaceIndexAgreement[] {
  return [...rows].sort((a, b) => {
    const ta = new Date(a.updated_at).getTime();
    const tb = new Date(b.updated_at).getTime();
    return (Number.isNaN(tb) ? 0 : tb) - (Number.isNaN(ta) ? 0 : ta);
  });
}

export function deriveCreatorSigningStatusLabel(
  row: WorkspaceIndexAgreement,
  serverProgress?: CreatorSigningProgressSnapshot | null,
): string {
  if (isAgreementCompletedForDashboard(row)) return "Fully signed";
  const progress = resolveCreatorSigningProgressSnapshot(row, serverProgress ?? null);
  if (progress?.partiallySigned || progress?.fullySigned) {
    return formatCreatorSigningProgressLabel(progress);
  }
  if (row.has_server_signing_lock || isAgreementPacketPrepared(row.id)) return "Signature links ready";
  return "Signature links not prepared yet";
}

export function deriveCreatorNextActionLabel(
  row: WorkspaceIndexAgreement,
  reviewGate: CreatorDashboardReviewGate,
): string {
  const status = deriveCreatorDashboardStatus(row);
  if (status === "completed") return CREATOR_NEXT_ACTION_OPEN_AGREEMENT_WORKSPACE;
  if (status === "signing_in_progress") return "View signing status";
  if (reviewGate.allRequiredReviewPartiesApproved) return CREATOR_PREPARE_SIGNATURE_LINKS_LABEL;
  if (creatorDashboardWaitingOnReviewer(reviewGate)) return "Wait for remaining reviewer approval";
  return creatorDashboardPrimaryAction(row).label;
}

export function deriveCreatorReviewProgressLabel(
  row: WorkspaceIndexAgreement,
  reviewRows: readonly OwnerReviewPartyStatusRow[],
): string | null {
  return formatCreatorReviewProgressLabel(resolveCreatorDashboardReviewGate(row, reviewRows));
}

export function countCreatorReviewApproved(
  row: WorkspaceIndexAgreement,
  reviewRows: readonly OwnerReviewPartyStatusRow[],
): number {
  return resolveCreatorDashboardReviewGate(row, reviewRows).approvedCount;
}

export function deriveCreatorDashboardStatusPillFromGate(
  row: WorkspaceIndexAgreement,
  reviewGate: CreatorDashboardReviewGate,
  serverProgress?: CreatorSigningProgressSnapshot | null,
): string | null {
  const effectiveStatus = deriveCreatorDashboardEffectiveStatus(
    row,
    reviewGate,
    deriveCreatorDashboardStatus(row),
  );
  if (effectiveStatus === "ready_for_signing" || effectiveStatus === "review_approved") {
    return CREATOR_DASHBOARD_STATUS_LABEL.ready_for_signing;
  }
  if (effectiveStatus === "signing_in_progress") {
    if (creatorDashboardHasPartialSigningProgress(row, serverProgress)) {
      return "Partially Signed";
    }
    return CREATOR_DASHBOARD_STATUS_LABEL.signing_in_progress;
  }
  if (!reviewGate.authoritative) return null;
  if (reviewGate.hasOpenChangeRequests) return CREATOR_DASHBOARD_STATUS_LABEL.in_review;
  if (reviewGate.allRequiredReviewPartiesApproved) return CREATOR_REVIEWS_APPROVED_PILL;
  if (creatorDashboardWaitingOnReviewer(reviewGate)) return CREATOR_WAITING_ON_REVIEWER_PILL;
  return CREATOR_DASHBOARD_STATUS_LABEL[effectiveStatus];
}

export function creatorDashboardShouldPrepareSignatureLinks(
  row: WorkspaceIndexAgreement,
  reviewGate: CreatorDashboardReviewGate,
): boolean {
  const effectiveStatus = deriveCreatorDashboardEffectiveStatus(
    row,
    reviewGate,
    deriveCreatorDashboardStatus(row),
  );
  if (effectiveStatus === "signing_in_progress" || effectiveStatus === "completed") return false;
  return effectiveStatus === "ready_for_signing" && reviewGate.allRequiredReviewPartiesApproved;
}

/** Workspace-index snapshot for diagnostics only — never used for rendered review UI. */
export function resolveCreatorDashboardIndexPreviewForDiagnostics(row: WorkspaceIndexAgreement): {
  approvedCount: number;
  requiredPartyCount: number;
  allApproved: boolean;
  statusPill: string;
} {
  const requiredPartyCount = Math.max(row.party_count ?? 0, row.review_approvals_required ?? 0, 1);
  return {
    approvedCount: row.review_approvals_completed ?? 0,
    requiredPartyCount,
    allApproved: Boolean(row.all_reviewers_approved),
    statusPill: CREATOR_DASHBOARD_STATUS_LABEL[deriveCreatorDashboardStatus(row)],
  };
}

/** Legacy /app/done bookmark — redirect to canonical signature-prep when all reviews approved and unsigned. */
export function shouldCreatorRedirectPreSignatureDoneToDashboard(args: {
  signed: boolean | null;
  signingLockActive: boolean;
  draft: AgreementDraft | null | undefined;
}): boolean {
  if (args.signed === true) return false;
  if (args.signingLockActive) return false;
  return resolveAllReviewPartiesApproved(args.draft);
}

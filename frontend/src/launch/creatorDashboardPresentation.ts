import type { AgreementDraft } from "../agreement/agreementTypes";
import type { WorkspaceIndexAgreement } from "../agreement/agreementWorkspaceApi";
import { resolveAllReviewPartiesApproved } from "../agreement/recipientApprovedWaitingPresentation";
import {
  deriveOwnerReviewPartyStatusRows,
  countOwnerReviewPartyApproved,
  type OwnerReviewPartyStatusRow,
} from "./simpleProduct/ownerReviewPartyStatusChecklist";
import {
  formatCreatorReviewProgressLabel,
  resolveCreatorDashboardReviewGate,
  creatorDashboardWaitingOnReviewer,
  type CreatorDashboardReviewGate,
} from "./creatorDashboardReviewGate";
import {
  isAgreementFullySignedLocal,
  isAgreementPacketPrepared,
} from "../vs01/vs01WorkspaceSigningStatus";
import {
  CREATOR_PREPARE_SIGNATURE_LINKS_LABEL,
  CREATOR_REVIEWS_APPROVED_PILL,
  CREATOR_WAITING_ON_REVIEWER_PILL,
  CREATOR_NEXT_ACTION_OPEN_AGREEMENT_WORKSPACE,
} from "./creatorDashboardCopy";

export type CreatorDashboardStatus =
  | "draft"
  | "in_review"
  | "review_approved"
  | "ready_for_signing"
  | "signing_in_progress"
  | "completed";

export type CreatorDashboardMetricKey = "drafts" | "in_review" | "ready_for_signing" | "completed";

export type CreatorDashboardAction = {
  label: string;
  path: string;
  emphasis: "primary" | "secondary";
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
  if (row.completed_signed || isAgreementFullySignedLocal(row.id)) return "completed";
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
): CreatorDashboardAction {
  const id = encodeURIComponent(row.id);
  const status = deriveCreatorDashboardStatus(row);
  switch (status) {
    case "completed":
      return {
        label: CREATOR_NEXT_ACTION_OPEN_AGREEMENT_WORKSPACE,
        path: `/app/done/${id}`,
        emphasis: "primary",
      };
    case "signing_in_progress":
      return { label: "View Signing Status", path: `/app/send/${id}`, emphasis: "primary" };
    case "ready_for_signing":
    case "review_approved":
      return { label: CREATOR_PREPARE_SIGNATURE_LINKS_LABEL, path: "/app", emphasis: "primary" };
    case "in_review":
      return { label: "View Review Status", path: `/app/done/${id}`, emphasis: "secondary" };
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
): CreatorDashboardSupplementalAction[] {
  const id = encodeURIComponent(row.id);
  const status = deriveCreatorDashboardStatus(row);
  const out: CreatorDashboardSupplementalAction[] = [
    { label: "Open workspace", path: `/app/done/${id}`, testIdSuffix: "open-workspace" },
  ];
  if (status === "draft" || status === "in_review") {
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
      path: `/app/done/${id}`,
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
  return deriveOwnerReviewPartyStatusRows(draft);
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

export function deriveCreatorSigningStatusLabel(row: WorkspaceIndexAgreement): string {
  if (row.completed_signed || isAgreementFullySignedLocal(row.id)) return "Fully signed";
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
): string | null {
  if (!reviewGate.authoritative) return null;
  if (reviewGate.allRequiredReviewPartiesApproved) return CREATOR_REVIEWS_APPROVED_PILL;
  if (creatorDashboardWaitingOnReviewer(reviewGate)) return CREATOR_WAITING_ON_REVIEWER_PILL;
  return CREATOR_DASHBOARD_STATUS_LABEL[deriveCreatorDashboardStatus(row)];
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

/** Creator proof/done page should not replace the dashboard before signing completes. */
export function shouldCreatorRedirectPreSignatureDoneToDashboard(args: {
  signed: boolean | null;
  signingLockActive: boolean;
  draft: AgreementDraft | null | undefined;
  isPaidProReviewDonePath: boolean;
  confirmedSend?: boolean;
}): boolean {
  if (args.isPaidProReviewDonePath) return false;
  if (args.confirmedSend) return false;
  if (args.signed === true) return false;
  if (args.signingLockActive) return false;
  return resolveAllReviewPartiesApproved(args.draft);
}

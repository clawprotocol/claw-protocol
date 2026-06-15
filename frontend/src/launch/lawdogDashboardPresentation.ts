import type { WorkspaceIndexAgreement } from "../agreement/agreementWorkspaceApi";
import {
  deriveCreatorDashboardStatus,
  type CreatorDashboardStatus,
} from "./creatorDashboardPresentation";
import {
  isAgreementPartiallySignedLocal,
} from "../vs01/vs01WorkspaceSigningStatus";

/** Product-facing agreement status labels for LawDog Dashboard v1. */
export type LawdogProductStatus =
  | "draft"
  | "review"
  | "signature_prep"
  | "sent"
  | "partially_signed"
  | "signed"
  | "archived";

export const LAWDOG_PRODUCT_STATUS_LABEL: Record<LawdogProductStatus, string> = {
  draft: "Draft",
  review: "Review",
  signature_prep: "Signature Prep",
  sent: "Sent",
  partially_signed: "Partially Signed",
  signed: "Signed",
  archived: "Archived",
};

export type LawdogDashboardKpis = {
  /** Non-archived agreements in the workspace (replaces opaque "created" count). */
  activeAgreements: number;
  /** Agreements waiting on external review approvals. */
  awaitingReview: number;
  /** Reviews complete; owner can prepare signature links. */
  readyForSignature: number;
  /** Fully signed agreements. */
  completedAgreements: number;
};

/** @deprecated Legacy KPI — kept for migration references only. */
export const LAWDOG_LEGAL_FEES_SAVED_PER_SIGNED_USD = 2_500;

export function deriveLawdogProductStatus(
  row: WorkspaceIndexAgreement,
  progress?: import("../vs01/vs01WorkspaceSigningStatus").SigningProgressSnapshot | null,
): LawdogProductStatus {
  if (row.workspace_archived_at) return "archived";
  const internal = deriveCreatorDashboardStatus(row);
  if (internal === "completed") return "signed";
  if (internal === "signing_in_progress") {
    if (progress?.partiallySigned) return "partially_signed";
    if (isAgreementPartiallySignedLocal(row.id)) return "partially_signed";
    return "sent";
  }
  if (internal === "ready_for_signing" || internal === "review_approved") {
    return "signature_prep";
  }
  if (internal === "in_review") return "review";
  return "draft";
}

export function lawdogAgreementTypeLabel(_row: WorkspaceIndexAgreement): string {
  return "Pro Agreement";
}

export function formatLawdogDashboardDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function resolveLawdogAgreementCreatedAt(row: WorkspaceIndexAgreement): string {
  return row.created_at ?? row.updated_at;
}

export function countLawdogDashboardKpis(rows: readonly WorkspaceIndexAgreement[]): LawdogDashboardKpis {
  let awaitingReview = 0;
  let readyForSignature = 0;
  let completedAgreements = 0;
  let activeAgreements = 0;

  for (const row of rows) {
    if (row.workspace_archived_at) continue;
    activeAgreements += 1;
    const internal = deriveCreatorDashboardStatus(row);
    if (internal === "completed") {
      completedAgreements += 1;
      continue;
    }
    if (internal === "ready_for_signing" || internal === "review_approved") {
      readyForSignature += 1;
      continue;
    }
    if (internal === "in_review") awaitingReview += 1;
  }

  return {
    activeAgreements,
    awaitingReview,
    readyForSignature,
    completedAgreements,
  };
}

export function lawdogAgreementNeedsAttention(
  row: WorkspaceIndexAgreement,
  internalStatus: CreatorDashboardStatus,
): boolean {
  if (row.workspace_archived_at) return false;
  return (
    internalStatus === "in_review" ||
    internalStatus === "ready_for_signing" ||
    internalStatus === "review_approved" ||
    internalStatus === "signing_in_progress" ||
    internalStatus === "completed"
  );
}

export function formatLawdogKpiCurrency(usd: number): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(usd);
}

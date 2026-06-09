import type { WorkspaceIndexAgreement } from "../agreement/agreementWorkspaceApi";
import {
  deriveCreatorDashboardStatus,
  type CreatorDashboardStatus,
} from "./creatorDashboardPresentation";
import {
  isAgreementFullySignedLocal,
} from "../vs01/vs01WorkspaceSigningStatus";
import { readSigningPacketStatus } from "../vs01/vs01SigningPacketStatusStore";

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
  agreementsCreated: number;
  agreementsSent: number;
  agreementsSigned: number;
  estimatedLegalFeesSavedUsd: number;
};

/** Default per-agreement legal fee savings estimate for KPI display. */
export const LAWDOG_LEGAL_FEES_SAVED_PER_SIGNED_USD = 2_500;

export function isAgreementPartiallySignedLocal(agreementId: string): boolean {
  if (isAgreementFullySignedLocal(agreementId)) return false;
  const snap = readSigningPacketStatus(agreementId);
  if (!snap) return false;
  const values = Object.values(snap.bySignerKey);
  if (values.length === 0) return false;
  const signedCount = values.filter((status) => status === "signed").length;
  return signedCount > 0 && signedCount < values.length;
}

export function deriveLawdogProductStatus(row: WorkspaceIndexAgreement): LawdogProductStatus {
  if (row.workspace_archived_at) return "archived";
  const internal = deriveCreatorDashboardStatus(row);
  if (internal === "completed") return "signed";
  if (internal === "signing_in_progress") {
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
  let agreementsSent = 0;
  let agreementsSigned = 0;
  for (const row of rows) {
    const status = deriveLawdogProductStatus(row);
    if (status === "sent" || status === "partially_signed" || status === "signed") {
      agreementsSent += 1;
    }
    if (status === "signed") agreementsSigned += 1;
  }
  return {
    agreementsCreated: rows.length,
    agreementsSent,
    agreementsSigned,
    estimatedLegalFeesSavedUsd: agreementsSigned * LAWDOG_LEGAL_FEES_SAVED_PER_SIGNED_USD,
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

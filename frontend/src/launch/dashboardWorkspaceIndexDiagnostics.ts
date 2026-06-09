import type { WorkspaceIndexAgreement } from "../agreement/agreementWorkspaceApi";
import {
  deriveCreatorDashboardStatus,
  deriveCreatorSigningStatusLabel,
} from "./creatorDashboardPresentation";
import { resolveCreatorDashboardReviewGate } from "./creatorDashboardReviewGate";

export type DashboardWorkspaceIndexRowDiagnostic = {
  agreementId: string;
  source: "workspace_index";
  reviewStatus: string;
  signingStatus: string;
  skipped: boolean;
  skippedReason: string | null;
};

let lastRowLogKeys = new Set<string>();

export function resetDashboardWorkspaceIndexRowLogsForTests(): void {
  lastRowLogKeys = new Set();
}

export function buildDashboardWorkspaceIndexRowDiagnostic(
  row: WorkspaceIndexAgreement,
  reviewRows: readonly { statusLabel: string }[] = [],
): DashboardWorkspaceIndexRowDiagnostic {
  const reviewGate = resolveCreatorDashboardReviewGate(row, reviewRows as never);
  const lifecycle = deriveCreatorDashboardStatus(row);
  let reviewStatus = lifecycle;
  if (reviewGate.allRequiredReviewPartiesApproved) reviewStatus = "review_approved";
  else if (lifecycle === "in_review") reviewStatus = "in_review";
  else if (lifecycle === "draft") reviewStatus = "draft";
  return {
    agreementId: row.id,
    source: "workspace_index",
    reviewStatus,
    signingStatus: deriveCreatorSigningStatusLabel(row),
    skipped: false,
    skippedReason: null,
  };
}

export function logDashboardWorkspaceIndexRow(
  payload: DashboardWorkspaceIndexRowDiagnostic,
): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  const key = JSON.stringify(payload);
  if (lastRowLogKeys.has(key)) return;
  lastRowLogKeys.add(key);
  // eslint-disable-next-line no-console
  console.info("[dashboard-workspace-index-row]", payload);
}

export function logDashboardWorkspaceIndexSkippedRow(payload: {
  agreementId: string;
  skippedReason: string;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  const diagnostic: DashboardWorkspaceIndexRowDiagnostic = {
    agreementId: payload.agreementId,
    source: "workspace_index",
    reviewStatus: "unknown",
    signingStatus: "unknown",
    skipped: true,
    skippedReason: payload.skippedReason,
  };
  const key = JSON.stringify(diagnostic);
  if (lastRowLogKeys.has(key)) return;
  lastRowLogKeys.add(key);
  // eslint-disable-next-line no-console
  console.info("[dashboard-workspace-index-row]", diagnostic);
}

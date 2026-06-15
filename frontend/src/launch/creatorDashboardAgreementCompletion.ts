import type { WorkspaceIndexAgreement } from "../agreement/agreementWorkspaceApi";
import { fetchAgreementAuditSignedFlag } from "../agreement/agreementWorkspaceApi";
import {
  isAgreementFullySignedLocal,
  isAgreementPacketPrepared,
} from "../vs01/vs01WorkspaceSigningStatus";
import { creatorDashboardCompletedProofPath } from "./creatorDashboardReviewLinkRouting";

/** Canonical dashboard completion: server index flag or local VS01 packet snapshot. */
export function isAgreementCompletedForDashboard(
  row: Pick<WorkspaceIndexAgreement, "id" | "completed_signed">,
): boolean {
  if (row.completed_signed) return true;
  return isAgreementFullySignedLocal(row.id);
}

export function mergeWorkspaceAgreementCompletion(
  row: WorkspaceIndexAgreement,
  auditSigned?: boolean,
): WorkspaceIndexAgreement {
  if (isAgreementCompletedForDashboard(row)) return row;
  if (!auditSigned) return row;
  return { ...row, completed_signed: true };
}

/** Rows that may be fully signed on the server before workspace-index refreshes. */
export function workspaceRowNeedsCompletionAuditHydration(row: WorkspaceIndexAgreement): boolean {
  if (isAgreementCompletedForDashboard(row)) return false;
  return (
    row.has_server_signing_lock ||
    isAgreementPacketPrepared(row.id) ||
    row.all_reviewers_approved === true
  );
}

/** Redirect `/app/send/:id` to completed proof when signing finished locally or in draft audit. */
export async function resolveCompletedAgreementRoute(agreementId: string): Promise<string | null> {
  const id = agreementId.trim();
  if (!id) return null;
  if (isAgreementCompletedForDashboard({ id, completed_signed: false })) {
    return creatorDashboardCompletedProofPath(id);
  }
  const auditSigned = await fetchAgreementAuditSignedFlag(id);
  if (auditSigned) return creatorDashboardCompletedProofPath(id);
  return null;
}

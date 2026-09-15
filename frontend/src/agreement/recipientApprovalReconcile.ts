import type { AgreementDraft } from "./agreementTypes";
import { auditHasRecipientApprovalForParticipant, auditHasRecipientApprovalForRevision } from "./participantModel";

export type RecipientApprovePostResult = {
  ok: boolean;
  error?: string;
  status?: number;
};

/** Network or 5xx: the POST may have committed even though the client did not see success. */
export function recipientApprovalPostIsAmbiguous(result: RecipientApprovePostResult): boolean {
  if (result.ok) return false;
  if (result.error === "network") return true;
  const status = result.status ?? 0;
  return status >= 500 || status === 0;
}

export function recipientApprovalRecordedOnIntendedRevision(
  audit: AgreementDraft["audit_log"] | undefined,
  args: {
    participantId?: string | null;
    snapshotId?: string | null;
    digest?: string | null;
  },
): boolean {
  const participantId = String(args.participantId || "").trim();
  const snapshotId = String(args.snapshotId || "").trim();
  const digest = String(args.digest || "").trim();
  if (participantId && snapshotId && digest) {
    return auditHasRecipientApprovalForRevision(audit, { participantId, snapshotId, digest });
  }
  return auditHasRecipientApprovalForParticipant(audit, participantId);
}

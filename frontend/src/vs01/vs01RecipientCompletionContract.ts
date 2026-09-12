import {
  ESIGN_CONSENT_ACTION,
  ESIGN_CONSENT_INTENT_STATEMENT,
  ESIGN_CONSENT_INTENT_VERSION,
} from "../compliance/disclosureCopy";
import type { Vs01RecipientPlacedField } from "./types";

export { ESIGN_CONSENT_ACTION, ESIGN_CONSENT_INTENT_STATEMENT, ESIGN_CONSENT_INTENT_VERSION };

export const RECIPIENT_COMPLETION_RETRY_MESSAGE =
  "We couldn't record your signature. Your entries are still here — try Agree and sign again.";
export const RECIPIENT_COMPLETION_FATAL_MESSAGE =
  "This signing link is invalid or expired. Ask the sender for a new link.";

export const FATAL_RECIPIENT_COMPLETION_CODES = new Set([
  "signing_token_required",
  "invalid_token",
  "recipient_token_required",
  "token_expired",
  "expired",
  "revoked",
  "superseded",
  "invite_superseded",
  "party_mismatch",
  "role_mismatch",
  "packet_cancelled",
  "packet_superseded",
  "wrong_party",
  "packet_revision_mismatch",
  "document_mismatch",
  "owner_cannot_complete_other_signer",
  "field_page_mismatch",
  "field_type_mismatch",
  "locked_field_authority_missing",
]);

export type Vs01ConsentIntent = {
  accepted: true;
  intent_version: typeof ESIGN_CONSENT_INTENT_VERSION;
  intent_statement: string;
  action: typeof ESIGN_CONSENT_ACTION;
};

export type Vs01AssignedFieldEvidence = {
  field_id: string;
  field_type: string;
  value: string;
  page_index?: number;
};

export type Vs01CompletionStatus = {
  status?: string;
  agreement_id?: string;
  signed_at?: string;
  signature_artifact_digest?: string;
  consent_artifact_digest?: string;
  signer_role_id?: string;
  participant_id?: string;
  document_id?: string;
  document_hash?: string;
  packet_revision?: string;
  event_id?: string;
  already_signed?: boolean;
  fully_executed?: boolean;
};

const CONFIRMED_COMPLETION_STATUSES = new Set(["completed", "already_signed", "fully_executed"]);

export function confirmRecipientCompletionResponse(args: {
  agreementId: string;
  documentId: string;
  signerRoleId: string;
  participantId?: string;
  packetRevision?: string;
  completion?: Vs01CompletionStatus | null;
}): boolean {
  const completion = args.completion;
  if (!completion) return false;
  const status = String(completion.status || "").trim().toLowerCase();
  if (!CONFIRMED_COMPLETION_STATUSES.has(status) && completion.already_signed !== true) {
    return false;
  }
  if (!completion.agreement_id || completion.agreement_id !== args.agreementId) return false;
  if (!completion.document_id || completion.document_id !== args.documentId) return false;
  if (!completion.signer_role_id || completion.signer_role_id !== args.signerRoleId) return false;
  if (args.participantId) {
    if (!completion.participant_id || completion.participant_id !== args.participantId) return false;
  }
  if (args.packetRevision) {
    if (!completion.packet_revision || completion.packet_revision !== args.packetRevision) return false;
  }
  return true;
}

export function confirmDraftedCeremonyCompletion(args: {
  agreementId: string;
  participantId: string;
  lockedVersionId?: string;
  response: {
    ok?: boolean;
    agreement_id?: string;
    participant_id?: string;
    locked_version_id?: string;
    signed_at?: string;
    status?: string;
  };
}): boolean {
  const response = args.response;
  if (!response.ok) return false;
  const status = String(response.status || "").trim().toLowerCase();
  if (status && !CONFIRMED_COMPLETION_STATUSES.has(status)) return false;
  if (!response.agreement_id || response.agreement_id !== args.agreementId) return false;
  if (!response.participant_id || response.participant_id !== args.participantId) return false;
  if (!response.signed_at) return false;
  if (args.lockedVersionId && response.locked_version_id && response.locked_version_id !== args.lockedVersionId) {
    return false;
  }
  return true;
}

export type Vs01UploadedPdfReceiptPointer = {
  receipt_id?: string;
  receipt_hash_sha256?: string;
};

export function versionedRecipientConsentIntent(): Vs01ConsentIntent {
  return {
    accepted: true,
    intent_version: ESIGN_CONSENT_INTENT_VERSION,
    intent_statement: ESIGN_CONSENT_INTENT_STATEMENT,
    action: ESIGN_CONSENT_ACTION,
  };
}

export function assignedFieldsFromRecipient(
  fields: readonly Vs01RecipientPlacedField[] | undefined,
  signerRoleId: string,
): Vs01AssignedFieldEvidence[] {
  const role = signerRoleId.trim();
  return (fields ?? [])
    .filter((field) => {
      const assigned = (field.assignedSignerRoleId ?? "").trim();
      return !role || !assigned || assigned === role;
    })
    .filter((field) => ["signature", "initials", "date"].includes(field.type))
    .map((field) => ({
      field_id: field.id,
      field_type: field.type,
      value: (field.value ?? "").trim(),
      page_index: field.page,
    }));
}

export function parseCompletionDetail(detail: unknown): { code: string; message: string } {
  if (typeof detail === "string") {
    return { code: detail, message: detail };
  }
  if (detail && typeof detail === "object") {
    const rec = detail as { code?: unknown; message?: unknown };
    const code = typeof rec.code === "string" ? rec.code.trim() : "";
    const message = typeof rec.message === "string" ? rec.message.trim() : "";
    return { code, message: message || code };
  }
  return { code: "", message: "" };
}

export function recipientCompletionIsRetryable(status: number, code: string): boolean {
  if (code === "network" || code === "network_retryable") return true;
  if (code === "completion_confirmation_mismatch") return true;
  if (status === 503) return true;
  return status >= 500;
}

export function recipientCompletionIsFatal(code: string): boolean {
  return FATAL_RECIPIENT_COMPLETION_CODES.has(code);
}

export function recipientCompletionUserMessage(status: number, code: string, fallback?: string): string {
  if (recipientCompletionIsRetryable(status, code)) return RECIPIENT_COMPLETION_RETRY_MESSAGE;
  if (recipientCompletionIsFatal(code)) return RECIPIENT_COMPLETION_FATAL_MESSAGE;
  if (fallback && fallback.trim()) return fallback.trim();
  return RECIPIENT_COMPLETION_FATAL_MESSAGE;
}

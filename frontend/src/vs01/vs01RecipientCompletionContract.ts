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

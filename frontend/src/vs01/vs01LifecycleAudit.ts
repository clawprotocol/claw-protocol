/** Metadata-only VS01 lifecycle events (no document body or PII). */

export type Vs01LifecycleEventType =
  | "vs01_prepare_started"
  | "vs01_prepare_field_added"
  | "vs01_prepare_field_removed"
  | "vs01_prepare_completed"
  | "vs01_packet_sent_or_links_created"
  | "vs01_signer_opened"
  | "vs01_signer_completed"
  | "vs01_packet_fully_signed";

export type Vs01LifecycleAuditPayload = {
  event: Vs01LifecycleEventType;
  agreementId?: string | null;
  documentId?: string | null;
  signerRoleId?: string | null;
  partyIndex?: number | null;
  fieldType?: string | null;
  timestamp?: string;
};

function diagEnabled(): boolean {
  return typeof import.meta !== "undefined" && import.meta.env?.MODE !== "test";
}

export function logVs01LifecycleEvent(payload: Vs01LifecycleAuditPayload): void {
  if (!diagEnabled()) return;
  const row = {
    ...payload,
    timestamp: payload.timestamp ?? new Date().toISOString(),
    agreementIdShort: payload.agreementId?.trim().slice(0, 16) ?? null,
    documentIdShort: payload.documentId?.trim().slice(0, 16) ?? null,
    signerRoleIdShort: payload.signerRoleId?.trim().slice(0, 16) ?? null,
  };
  // eslint-disable-next-line no-console
  console.info(`[${payload.event}]`, row);
}

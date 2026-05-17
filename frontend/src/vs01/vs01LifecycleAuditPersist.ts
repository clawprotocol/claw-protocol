import type { Vs01LifecycleAuditPayload, Vs01LifecycleEventType } from "./vs01LifecycleAudit";

/** Row shape for future Supabase `vs01_lifecycle_events` table — metadata only. */
export type Vs01LifecyclePersistRow = {
  agreement_id: string | null;
  document_id: string | null;
  event_type: Vs01LifecycleEventType;
  signer_role_id: string | null;
  party_index: number | null;
  field_type: string | null;
  status: string | null;
  timestamp: string;
};

export type Vs01LifecycleAuditSink = {
  record: (row: Vs01LifecyclePersistRow) => void;
};

const consoleSink: Vs01LifecycleAuditSink = {
  record(row) {
    if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
    // eslint-disable-next-line no-console
    console.info(`[${row.event_type}]`, {
      agreement_id: row.agreement_id?.slice(0, 16) ?? null,
      document_id: row.document_id?.slice(0, 16) ?? null,
      signer_role_id: row.signer_role_id?.slice(0, 16) ?? null,
      party_index: row.party_index,
      field_type: row.field_type,
      status: row.status,
      timestamp: row.timestamp,
    });
  },
};

let activeSink: Vs01LifecycleAuditSink = consoleSink;

export function setVs01LifecycleAuditSink(sink: Vs01LifecycleAuditSink | null): void {
  activeSink = sink ?? consoleSink;
}

export function toVs01LifecyclePersistRow(
  payload: Vs01LifecycleAuditPayload,
  status?: string | null,
): Vs01LifecyclePersistRow {
  return {
    agreement_id: payload.agreementId?.trim() || null,
    document_id: payload.documentId?.trim() || null,
    event_type: payload.event,
    signer_role_id: payload.signerRoleId?.trim() || null,
    party_index: payload.partyIndex ?? null,
    field_type: payload.fieldType?.trim() || null,
    status: status ?? payload.status ?? null,
    timestamp: payload.timestamp ?? new Date().toISOString(),
  };
}

export function persistVs01LifecycleEvent(
  payload: Vs01LifecycleAuditPayload,
  status?: string | null,
): Vs01LifecyclePersistRow {
  const row = toVs01LifecyclePersistRow(payload, status);
  activeSink.record(row);
  return row;
}

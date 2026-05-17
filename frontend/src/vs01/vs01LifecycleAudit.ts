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
  /** Optional status for persistence row (e.g. waiting, signed). */
  status?: string | null;
  timestamp?: string;
};

import { persistVs01LifecycleEvent } from "./vs01LifecycleAuditPersist";

export { persistVs01LifecycleEvent, type Vs01LifecyclePersistRow } from "./vs01LifecycleAuditPersist";

export function logVs01LifecycleEvent(payload: Vs01LifecycleAuditPayload): void {
  persistVs01LifecycleEvent(payload, payload.status ?? null);
}

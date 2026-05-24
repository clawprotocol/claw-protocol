/** Metadata-only VS01 lifecycle events (no document body or PII). */

import { trackAgreementFunnelEvent } from "../tracking/agreementFunnelAnalytics";
import { persistVs01LifecycleEvent } from "./vs01LifecycleAuditPersist";

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

export { persistVs01LifecycleEvent, type Vs01LifecyclePersistRow } from "./vs01LifecycleAuditPersist";

function vs01LifecycleStage(event: Vs01LifecycleEventType): string {
  if (event.startsWith("vs01_prepare_")) return "prepare";
  if (event === "vs01_packet_sent_or_links_created") return "handoff";
  if (event === "vs01_packet_fully_signed") return "done";
  return "sign";
}

export function logVs01LifecycleEvent(payload: Vs01LifecycleAuditPayload): void {
  persistVs01LifecycleEvent(payload, payload.status ?? null);
  trackAgreementFunnelEvent(
    payload.event,
    {
      surface: "vs01_lifecycle",
      flow: "vs01",
      vs01_stage: vs01LifecycleStage(payload.event),
      field_type: payload.fieldType ?? null,
      party_index: payload.partyIndex ?? null,
      signer_role_id: payload.signerRoleId ? payload.signerRoleId.slice(0, 16) : null,
      status: payload.status ?? null,
    },
    { agreementId: payload.agreementId?.trim() || undefined },
  );
}

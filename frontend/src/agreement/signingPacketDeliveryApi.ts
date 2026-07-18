import { clawAgreementHeaders } from "./agreementOrgHeaders";
import { resolveApiBase } from "../lib/clawApi";

export type SigningPacketDeliveryAggregateStatus =
  | "delivered"
  | "partially_delivered"
  | "failed"
  | "already_delivered"
  | "reconciliation_required"
  | "delivery_disabled";

export type SigningPacketDeliveryRecipientOutcomeV1 = {
  signer_record_id: string;
  party_id: string;
  signer_name: string | null;
  state: string;
  delivery_identity: string;
  failure_code: string | null;
  provider_message_id?: string | null;
  attempt_count?: number;
  token_jti_fp?: string | null;
  token_exp?: number | null;
};

export type SigningPacketDeliveryStatusV1 = {
  ok: boolean;
  aggregate_status: SigningPacketDeliveryAggregateStatus;
  recipients: SigningPacketDeliveryRecipientOutcomeV1[];
  authority: {
    document_id: string;
    accepted_version_id: string;
    accepted_corpus_sha256: string;
    packet_revision: string;
    frozen_authority_material_hash: string;
    locked_version_id: string;
  } | null;
  last_attempt_at?: string | null;
};

const CACHE_PREFIX = "claw_signing_packet_delivery_v1:";
const confirmedByAgreement = new Map<string, SigningPacketDeliveryStatusV1>();

const base = () => resolveApiBase().replace(/\/$/, "");

const AGGREGATE_STATUSES: ReadonlySet<string> = new Set([
  "delivered",
  "partially_delivered",
  "failed",
  "already_delivered",
  "reconciliation_required",
  "delivery_disabled",
]);

function errorDetail(raw: unknown, fallback: string): string {
  if (!raw || typeof raw !== "object" || !("detail" in raw)) return fallback;
  const detail = (raw as { detail?: unknown }).detail;
  if (typeof detail === "string" && detail.trim()) return detail;
  if (detail && typeof detail === "object" && "code" in detail) {
    return String((detail as { code?: unknown }).code ?? fallback);
  }
  return fallback;
}

export function normalizeSigningPacketDeliveryStatus(
  raw: unknown,
): SigningPacketDeliveryStatusV1 | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as SigningPacketDeliveryStatusV1;
  if (!AGGREGATE_STATUSES.has(String(record.aggregate_status || ""))) return null;
  if (!Array.isArray(record.recipients)) return null;
  for (const recipient of record.recipients) {
    if (!recipient || typeof recipient !== "object") return null;
    if (!recipient.signer_record_id?.trim() || !recipient.delivery_identity?.trim()) return null;
    if ("token" in recipient || "signing_url" in recipient) return null;
  }
  return {
    ok: Boolean(record.ok),
    aggregate_status: record.aggregate_status,
    recipients: record.recipients,
    authority: record.authority ?? null,
    last_attempt_at: record.last_attempt_at ?? null,
  };
}

export function cacheConfirmedSigningPacketDelivery(
  status: SigningPacketDeliveryStatusV1,
  agreementId: string,
): void {
  const id = agreementId.trim();
  if (!id) return;
  confirmedByAgreement.set(id, status);
  try {
    sessionStorage.setItem(`${CACHE_PREFIX}${id}`, JSON.stringify(status));
  } catch {
    // ignore storage failures
  }
}

export function readCachedSigningPacketDelivery(
  agreementId: string,
): SigningPacketDeliveryStatusV1 | null {
  const id = agreementId.trim();
  if (!id) return null;
  const memory = confirmedByAgreement.get(id);
  if (memory) return memory;
  try {
    const raw = sessionStorage.getItem(`${CACHE_PREFIX}${id}`);
    if (!raw) return null;
    return normalizeSigningPacketDeliveryStatus(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

export function signingPacketDeliveryUserMessage(
  status: SigningPacketDeliveryStatusV1 | null | undefined,
): string {
  switch (status?.aggregate_status) {
    case "delivered":
    case "already_delivered":
      return "Signing invitations were sent to all recipients.";
    case "partially_delivered":
      return "Some signing invitations were sent. Review delivery status for remaining recipients.";
    case "failed":
      return "Signing invitations could not be sent. Review delivery status and try again later.";
    case "reconciliation_required":
      return "Signing invitation delivery needs operator review before retrying.";
    case "delivery_disabled":
    default:
      return "Signing packet is activated. Invitation delivery is not enabled yet in this environment.";
  }
}

export function signingPacketDeliveryClaimsSent(
  status: SigningPacketDeliveryStatusV1 | null | undefined,
): boolean {
  return status?.aggregate_status === "delivered" || status?.aggregate_status === "already_delivered";
}

export async function deliverSigningPacketInvites(
  agreementId: string,
  candidate: { documentId: string },
): Promise<SigningPacketDeliveryStatusV1> {
  const id = agreementId.trim();
  const documentId = candidate.documentId.trim();
  if (!id) throw new Error("signing_packet_delivery_missing_agreement_id");
  if (!documentId) throw new Error("signing_packet_delivery_missing_document_id");
  const response = await fetch(
    `${base()}/api/agreements/${encodeURIComponent(id)}/signing-packet/deliver`,
    {
      method: "POST",
      headers: clawAgreementHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ document_id: documentId }),
    },
  );
  const raw = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(errorDetail(raw, `signing_packet_delivery_http_${response.status}`));
  }
  const confirmed = normalizeSigningPacketDeliveryStatus(raw);
  if (!confirmed) throw new Error("signing_packet_delivery_malformed_response");
  cacheConfirmedSigningPacketDelivery(confirmed, id);
  return confirmed;
}

export async function fetchSigningPacketDeliveryStatus(
  agreementId: string,
): Promise<SigningPacketDeliveryStatusV1 | null> {
  const id = agreementId.trim();
  if (!id) return null;
  const response = await fetch(
    `${base()}/api/agreements/${encodeURIComponent(id)}/signing-packet/delivery`,
    { headers: clawAgreementHeaders() },
  );
  if (response.status === 404) return null;
  const raw = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(errorDetail(raw, `signing_packet_delivery_http_${response.status}`));
  }
  return normalizeSigningPacketDeliveryStatus(raw);
}

export function clearSigningPacketDeliveryForTests(): void {
  confirmedByAgreement.clear();
}

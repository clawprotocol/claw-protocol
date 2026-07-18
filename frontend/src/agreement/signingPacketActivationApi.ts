import type { Vs01CanonicalPacketPortableV1 } from "../vs01/vs01CanonicalPacketSeed";
import { clawAgreementHeaders } from "./agreementOrgHeaders";
import { resolveApiBase } from "../lib/clawApi";

export type SigningPacketActivationMetadataV1 = {
  v: 1;
  packet_state: "active";
  document_id: string;
  packet_revision: string;
  activated_at: string;
  accepted_version_id: string;
  accepted_corpus_sha256: string;
  frozen_authority_material_hash: string;
  signing_lock: {
    locked_version_id: string;
    content_sha256: string;
    accepted_corpus_sha256: string;
  };
};

const CACHE_PREFIX = "claw_signing_packet_activation_v1:";
const confirmedByAgreement = new Map<string, SigningPacketActivationMetadataV1>();

const base = () => resolveApiBase().replace(/\/$/, "");

function errorDetail(raw: unknown, fallback: string): string {
  if (!raw || typeof raw !== "object" || !("detail" in raw)) return fallback;
  const detail = (raw as { detail?: unknown }).detail;
  if (typeof detail === "string" && detail.trim()) return detail;
  if (detail && typeof detail === "object" && "code" in detail) {
    return String((detail as { code?: unknown }).code ?? fallback);
  }
  return fallback;
}

export function normalizeSigningPacketActivation(
  raw: unknown,
  agreementId: string,
): SigningPacketActivationMetadataV1 | null {
  if (!raw || typeof raw !== "object") return null;
  const activation = (raw as { activation?: unknown }).activation;
  if (!activation || typeof activation !== "object") return null;
  const record = activation as SigningPacketActivationMetadataV1;
  if (
    record.v !== 1 ||
    record.packet_state !== "active" ||
    !record.document_id?.trim() ||
    !record.packet_revision?.trim() ||
    !record.activated_at?.trim() ||
    !record.accepted_version_id?.startsWith("av_") ||
    !/^[a-f0-9]{64}$/i.test(record.accepted_corpus_sha256 || "") ||
    "portable" in (record as object)
  ) {
    return null;
  }
  if (agreementId.trim() && record.document_id && !record.document_id.trim()) return null;
  return record;
}

export function cacheConfirmedSigningPacketActivation(
  activation: SigningPacketActivationMetadataV1,
  agreementId: string,
): void {
  const id = agreementId.trim();
  if (!id) return;
  confirmedByAgreement.set(id, activation);
  try {
    sessionStorage.setItem(`${CACHE_PREFIX}${id}`, JSON.stringify(activation));
  } catch {
    // ignore storage failures
  }
}

export function clearCachedSigningPacketActivation(agreementId: string): void {
  const id = agreementId.trim();
  if (!id) return;
  confirmedByAgreement.delete(id);
  try {
    sessionStorage.removeItem(`${CACHE_PREFIX}${id}`);
  } catch {
    // ignore storage failures
  }
}

export function readCachedSigningPacketActivation(
  agreementId: string,
): SigningPacketActivationMetadataV1 | null {
  const id = agreementId.trim();
  if (!id) return null;
  const memory = confirmedByAgreement.get(id);
  if (memory) return memory;
  try {
    const raw = sessionStorage.getItem(`${CACHE_PREFIX}${id}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    const normalized = normalizeSigningPacketActivation({ activation: parsed }, id);
    if (normalized) confirmedByAgreement.set(id, normalized);
    return normalized;
  } catch {
    return null;
  }
}

export async function persistSigningPacketActivation(
  agreementId: string,
  candidate: {
    documentId: string;
    portablePacket: Vs01CanonicalPacketPortableV1;
  },
): Promise<SigningPacketActivationMetadataV1> {
  const id = agreementId.trim();
  const documentId = candidate.documentId.trim();
  if (!id) throw new Error("signing_packet_activation_missing_agreement_id");
  if (!documentId) throw new Error("signing_packet_activation_missing_document_id");
  const response = await fetch(
    `${base()}/api/agreements/${encodeURIComponent(id)}/signing-packet/activate`,
    {
      method: "POST",
      headers: clawAgreementHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        document_id: documentId,
        portable_packet: candidate.portablePacket,
      }),
    },
  );
  const raw = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(errorDetail(raw, `signing_packet_activation_http_${response.status}`));
  }
  const confirmed = normalizeSigningPacketActivation(raw, id);
  if (!confirmed?.activated_at) {
    throw new Error("signing_packet_activation_malformed_response");
  }
  if (confirmed.document_id !== documentId) {
    throw new Error("signing_packet_activation_backend_binding_mismatch");
  }
  cacheConfirmedSigningPacketActivation(confirmed, id);
  return confirmed;
}

export async function fetchSigningPacketActivation(
  agreementId: string,
): Promise<SigningPacketActivationMetadataV1 | null> {
  const id = agreementId.trim();
  if (!id) return null;
  const response = await fetch(
    `${base()}/api/agreements/${encodeURIComponent(id)}/signing-packet/activation`,
    { headers: clawAgreementHeaders() },
  );
  if (response.status === 404) return null;
  const raw = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(errorDetail(raw, `signing_packet_activation_http_${response.status}`));
  }
  const confirmed = normalizeSigningPacketActivation(raw, id);
  if (!confirmed?.activated_at) throw new Error("signing_packet_activation_malformed_response");
  return confirmed;
}

/** Reloads backend truth first; browser cache can never override absence or change. */
export async function loadSigningPacketActivation(
  agreementId: string,
): Promise<SigningPacketActivationMetadataV1 | null> {
  const id = agreementId.trim();
  if (!id) return null;
  const backend = await fetchSigningPacketActivation(id);
  if (!backend) {
    clearCachedSigningPacketActivation(id);
    return null;
  }
  cacheConfirmedSigningPacketActivation(backend, id);
  return backend;
}

export function clearSigningPacketActivationForTests(): void {
  confirmedByAgreement.clear();
}

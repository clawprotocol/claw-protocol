import { clawAgreementHeaders } from "./agreementOrgHeaders";
import { resolveApiBase } from "../lib/clawApi";
import {
  cacheConfirmedFrozenSigningAuthority,
  clearCachedFrozenSigningAuthority,
  normalizeFrozenSigningAuthority,
  type FrozenSigningAuthoritySnapshotV1,
} from "../components/agreements/frozenSigningAuthoritySnapshot";

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

export async function persistFrozenSigningAuthority(
  agreementId: string,
  candidate: FrozenSigningAuthoritySnapshotV1,
): Promise<FrozenSigningAuthoritySnapshotV1> {
  const id = agreementId.trim();
  if (!id) throw new Error("frozen_signing_authority_missing_agreement_id");
  const response = await fetch(
    `${base()}/api/agreements/${encodeURIComponent(id)}/frozen-signing-authority`,
    {
      method: "POST",
      headers: clawAgreementHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ snapshot: candidate }),
    },
  );
  const raw = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(errorDetail(raw, `frozen_signing_authority_http_${response.status}`));
  }
  const confirmed = normalizeFrozenSigningAuthority(raw, id);
  if (!confirmed?.frozenAt) throw new Error("frozen_signing_authority_malformed_response");
  if (
    confirmed.acceptedVersionId !== candidate.acceptedVersionId ||
    confirmed.acceptedCorpusSha256 !== candidate.acceptedCorpusSha256
  ) {
    throw new Error("frozen_signing_authority_backend_binding_mismatch");
  }
  return confirmed;
}

export async function fetchFrozenSigningAuthority(
  agreementId: string,
): Promise<FrozenSigningAuthoritySnapshotV1 | null> {
  const id = agreementId.trim();
  if (!id) return null;
  const response = await fetch(
    `${base()}/api/agreements/${encodeURIComponent(id)}/frozen-signing-authority`,
    { headers: clawAgreementHeaders() },
  );
  if (response.status === 404) return null;
  const raw = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(errorDetail(raw, `frozen_signing_authority_http_${response.status}`));
  }
  const confirmed = normalizeFrozenSigningAuthority(raw, id);
  if (!confirmed?.frozenAt) throw new Error("frozen_signing_authority_malformed_response");
  return confirmed;
}

/** Reloads backend truth first; a stale browser cache can never override absence or change. */
export async function loadFrozenSigningAuthority(
  agreementId: string,
): Promise<FrozenSigningAuthoritySnapshotV1 | null> {
  const id = agreementId.trim();
  if (!id) return null;
  const backend = await fetchFrozenSigningAuthority(id);
  if (!backend) {
    clearCachedFrozenSigningAuthority(id);
    return null;
  }
  cacheConfirmedFrozenSigningAuthority(backend);
  return backend;
}

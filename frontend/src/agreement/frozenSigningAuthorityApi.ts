import { clawAgreementHeaders } from "./agreementOrgHeaders";
import { resolveApiBase } from "../lib/clawApi";
import type { FrozenSigningAuthoritySnapshotV1 } from "../components/agreements/frozenSigningAuthoritySnapshot";

const base = () => resolveApiBase().replace(/\/$/, "");

export async function fetchFrozenSigningAuthorityFromBackend(
  agreementId: string,
): Promise<FrozenSigningAuthoritySnapshotV1 | null> {
  const id = agreementId.trim();
  if (!id) return null;
  try {
    const res = await fetch(
      `${base()}/api/agreements/${encodeURIComponent(id)}/frozen-signing-authority`,
      { headers: clawAgreementHeaders() },
    );
    if (res.status === 404) return null;
    if (!res.ok) return null;
    const j = (await res.json().catch(() => ({}))) as { snapshot?: FrozenSigningAuthoritySnapshotV1 };
    const snap = j.snapshot;
    if (!snap || snap.version !== 1) return null;
    return snap;
  } catch {
    return null;
  }
}

export type PersistFrozenSigningAuthorityResult =
  | { ok: true }
  | { ok: false; code: string; status?: number };

export async function persistFrozenSigningAuthorityToBackend(
  agreementId: string,
  snapshot: FrozenSigningAuthoritySnapshotV1,
): Promise<boolean> {
  const result = await persistFrozenSigningAuthorityToBackendDetailed(agreementId, snapshot);
  return result.ok;
}

export async function persistFrozenSigningAuthorityToBackendDetailed(
  agreementId: string,
  snapshot: FrozenSigningAuthoritySnapshotV1,
): Promise<PersistFrozenSigningAuthorityResult> {
  const id = agreementId.trim();
  if (!id) return { ok: false, code: "missing_agreement_id" };
  try {
    const res = await fetch(
      `${base()}/api/agreements/${encodeURIComponent(id)}/frozen-signing-authority`,
      {
        method: "POST",
        headers: clawAgreementHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ snapshot, packet_state: "draft" }),
      },
    );
    if (res.ok) return { ok: true };
    let code = `http_${res.status}`;
    try {
      const j = (await res.json()) as { detail?: { code?: string } | string };
      if (typeof j.detail === "object" && j.detail?.code) code = String(j.detail.code);
      else if (typeof j.detail === "string" && j.detail.trim()) code = j.detail.trim();
    } catch {
      /* keep status code */
    }
    return { ok: false, code, status: res.status };
  } catch {
    return { ok: false, code: "network_error" };
  }
}

export type SigningStatusCountsBackend = {
  legal_party_count: number;
  signer_count: number;
  required_signer_count: number;
  invitation_count: number;
  required_action_count: number;
};

export async function fetchFrozenSigningStatusCountsFromBackend(
  agreementId: string,
): Promise<SigningStatusCountsBackend | null> {
  const id = agreementId.trim();
  if (!id) return null;
  try {
    const res = await fetch(
      `${base()}/api/agreements/${encodeURIComponent(id)}/frozen-signing-authority`,
      { headers: clawAgreementHeaders() },
    );
    if (!res.ok) return null;
    const j = (await res.json().catch(() => ({}))) as {
      status_counts?: SigningStatusCountsBackend;
    };
    return j.status_counts ?? null;
  } catch {
    return null;
  }
}

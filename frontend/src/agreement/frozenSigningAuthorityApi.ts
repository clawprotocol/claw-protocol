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

export async function persistFrozenSigningAuthorityToBackend(
  agreementId: string,
  snapshot: FrozenSigningAuthoritySnapshotV1,
): Promise<boolean> {
  const id = agreementId.trim();
  if (!id) return false;
  try {
    const res = await fetch(
      `${base()}/api/agreements/${encodeURIComponent(id)}/frozen-signing-authority`,
      {
        method: "POST",
        headers: clawAgreementHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ snapshot, packet_state: "draft" }),
      },
    );
    return res.ok;
  } catch {
    return false;
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

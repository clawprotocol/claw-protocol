/**
 * Phase 3C — durable backend fetch for signing packet + frozen authority state.
 */

import { clawAgreementHeaders } from "./agreementOrgHeaders";
import { resolveApiBase } from "../lib/clawApi";
import type { FrozenSigningAuthoritySnapshotV1 } from "../components/agreements/frozenSigningAuthoritySnapshot";
import type { Vs01CanonicalPacketPortableV1 } from "../vs01/vs01CanonicalPacketSeed";
import type { PacketLifecycleState } from "../components/agreements/signingAuthorityLifecycle";

const base = () => resolveApiBase().replace(/\/$/, "");

export type DurableSigningPacketRecord = {
  documentId: string;
  packetRevision: string;
  packetState: PacketLifecycleState;
  portable: Vs01CanonicalPacketPortableV1;
  frozenCorpusHash?: string;
  storedAt?: string;
};

export type DurableSigningStateFromBackend = {
  agreementId: string;
  agreementTitle: string;
  frozenSnapshot: FrozenSigningAuthoritySnapshotV1 | null;
  packet: DurableSigningPacketRecord | null;
};

function isPortablePacket(value: unknown): value is Vs01CanonicalPacketPortableV1 {
  if (!value || typeof value !== "object") return false;
  const p = value as Vs01CanonicalPacketPortableV1;
  return (
    p.v === 1 &&
    Boolean(p.seed?.documentId?.trim()) &&
    Boolean(p.seed?.agreementId?.trim()) &&
    Array.isArray(p.fields) &&
    Array.isArray(p.roles)
  );
}

export async function fetchDurableSigningStateFromBackend(
  agreementId: string,
): Promise<DurableSigningStateFromBackend | null> {
  const id = agreementId.trim();
  if (!id) return null;
  try {
    const [draftRes, frozenRes] = await Promise.all([
      fetch(`${base()}/api/agreements/${encodeURIComponent(id)}`, {
        headers: clawAgreementHeaders(),
      }),
      fetch(`${base()}/api/agreements/${encodeURIComponent(id)}/frozen-signing-authority`, {
        headers: clawAgreementHeaders(),
      }),
    ]);

    if (!draftRes.ok) return null;

    const draftJson = (await draftRes.json().catch(() => ({}))) as {
      draft?: Record<string, unknown>;
    };
    const rawDraft = draftJson.draft ?? {};
    const title = String(rawDraft.title ?? "").trim() || "Agreement";

    let frozenSnapshot: FrozenSigningAuthoritySnapshotV1 | null = null;
    if (frozenRes.ok) {
      const frozenJson = (await frozenRes.json().catch(() => ({}))) as {
        snapshot?: FrozenSigningAuthoritySnapshotV1;
      };
      if (frozenJson.snapshot?.version === 1) {
        frozenSnapshot = frozenJson.snapshot;
      }
    }

    const stored = rawDraft.vs01_signing_packet_v1;
    let packet: DurableSigningPacketRecord | null = null;
    if (stored && typeof stored === "object") {
      const rec = stored as Record<string, unknown>;
      const portable = rec.portable;
      if (isPortablePacket(portable)) {
        packet = {
          documentId: String(rec.document_id ?? portable.seed.documentId ?? "").trim(),
          packetRevision: String(rec.packet_revision ?? "").trim(),
          packetState: (String(rec.packet_state ?? "active").trim().toLowerCase() ||
            "active") as PacketLifecycleState,
          portable,
          frozenCorpusHash: String(rec.frozen_corpus_hash ?? "").trim() || undefined,
          storedAt: String(rec.stored_at ?? "").trim() || undefined,
        };
      }
    }

    return { agreementId: id, agreementTitle: title, frozenSnapshot, packet };
  } catch {
    return null;
  }
}

export async function postSigningPacketCancelBackend(
  agreementId: string,
  reason?: string,
): Promise<{ ok: boolean; packetState?: string }> {
  const id = agreementId.trim();
  if (!id) return { ok: false };
  try {
    const res = await fetch(`${base()}/api/agreements/${encodeURIComponent(id)}/signing-packet/cancel`, {
      method: "POST",
      headers: clawAgreementHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ reason: reason ?? "" }),
    });
    if (!res.ok) return { ok: false };
    const j = (await res.json().catch(() => ({}))) as { packet_state?: string };
    return { ok: true, packetState: j.packet_state };
  } catch {
    return { ok: false };
  }
}

export async function postSigningPacketReissueBackend(args: {
  agreementId: string;
  packetRevision: string;
  documentId: string;
  portablePacket: Record<string, unknown>;
  frozenSigningAuthority: Record<string, unknown>;
}): Promise<{ ok: boolean; packetState?: string; supersededRevision?: string | null }> {
  const id = args.agreementId.trim();
  if (!id) return { ok: false };
  try {
    const res = await fetch(`${base()}/api/agreements/${encodeURIComponent(id)}/signing-packet/reissue`, {
      method: "POST",
      headers: clawAgreementHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        packet_revision: args.packetRevision,
        document_id: args.documentId,
        portable_packet: args.portablePacket,
        frozen_signing_authority: args.frozenSigningAuthority,
      }),
    });
    if (!res.ok) return { ok: false };
    const j = (await res.json().catch(() => ({}))) as {
      packet_state?: string;
      superseded_revision?: string | null;
    };
    return {
      ok: true,
      packetState: j.packet_state,
      supersededRevision: j.superseded_revision ?? null,
    };
  } catch {
    return { ok: false };
  }
}

// Re-export frozen authority helpers for convenience
export {
  fetchFrozenSigningAuthorityFromBackend,
  fetchFrozenSigningStatusCountsFromBackend,
  persistFrozenSigningAuthorityToBackend,
} from "./frozenSigningAuthorityApi";

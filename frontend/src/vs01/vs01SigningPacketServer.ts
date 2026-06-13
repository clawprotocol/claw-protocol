/**
 * Server-backed VS01 signing packet — cross-browser recipient hydration (test346).
 */

import { apiUrl } from "../lib/clawApi";
import type { Vs01CanonicalPacketPortableV1 } from "./vs01CanonicalPacketSeed";

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

/** Recipient: load prepared packet without creator browser storage. */
export type FetchPublicVs01SigningPacketResult =
  | { ok: true; portable: Vs01CanonicalPacketPortableV1 }
  | { ok: false; reason: "not_found" | "invite_superseded"; message?: string };

export async function fetchPublicVs01SigningPacket(args: {
  agreementId: string;
  documentId: string;
  packetRevision?: string | null;
  recipientEmail?: string | null;
  participantId?: string | null;
}): Promise<FetchPublicVs01SigningPacketResult> {
  const agreementId = args.agreementId.trim();
  const documentId = args.documentId.trim();
  if (!agreementId || !documentId) return { ok: false, reason: "not_found" };
  const params = new URLSearchParams({ document_id: documentId });
  const rev = (args.packetRevision ?? "").trim();
  if (rev) params.set("packet_revision", rev);
  const email = (args.recipientEmail ?? "").trim();
  const pid = (args.participantId ?? "").trim();
  if (email) params.set("recipient_email", email);
  if (pid) params.set("participant_id", pid);
  try {
    const res = await fetch(
      apiUrl(`/api/agreements/public/${encodeURIComponent(agreementId)}/vs01-signing-packet?${params}`),
      { method: "GET" },
    );
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { detail?: { code?: string; message?: string } | string };
      const detail = j.detail;
      if (
        res.status === 403 &&
        detail &&
        typeof detail === "object" &&
        detail.code === "invite_superseded"
      ) {
        return {
          ok: false,
          reason: "invite_superseded",
          message:
            typeof detail.message === "string"
              ? detail.message
              : "This invite was replaced. Ask the sender for the latest link.",
        };
      }
      return { ok: false, reason: "not_found" };
    }
    const j = (await res.json().catch(() => ({}))) as { portable?: unknown };
    return isPortablePacket(j.portable)
      ? { ok: true, portable: j.portable }
      : { ok: false, reason: "not_found" };
  } catch {
    return { ok: false, reason: "not_found" };
  }
}

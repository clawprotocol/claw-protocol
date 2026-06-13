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
export async function fetchPublicVs01SigningPacket(args: {
  agreementId: string;
  documentId: string;
  packetRevision?: string | null;
}): Promise<Vs01CanonicalPacketPortableV1 | null> {
  const agreementId = args.agreementId.trim();
  const documentId = args.documentId.trim();
  if (!agreementId || !documentId) return null;
  const params = new URLSearchParams({ document_id: documentId });
  const rev = (args.packetRevision ?? "").trim();
  if (rev) params.set("packet_revision", rev);
  try {
    const res = await fetch(
      apiUrl(`/api/agreements/public/${encodeURIComponent(agreementId)}/vs01-signing-packet?${params}`),
      { method: "GET" },
    );
    if (!res.ok) return null;
    const j = (await res.json().catch(() => ({}))) as { portable?: unknown };
    return isPortablePacket(j.portable) ? j.portable : null;
  } catch {
    return null;
  }
}

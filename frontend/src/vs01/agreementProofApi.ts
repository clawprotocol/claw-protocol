import type { ExecutionPacket, ExecutionPacketProof } from "./executionPacket";
import { computeAgreementReceiptHashes } from "./executionPacket";

const ANCHOR_NETWORK: string =
  (import.meta as unknown as { env?: { VITE_CLAW_ANCHOR_NETWORK?: string } }).env
    ?.VITE_CLAW_ANCHOR_NETWORK || "bitcoin-testnet";

export async function registerFinalizedAgreementReceipt(
  apiBase: string,
  agreementId: string,
  packet: ExecutionPacket
): Promise<{ ok: boolean; proof?: ExecutionPacketProof; error?: string }> {
  const hashes = await computeAgreementReceiptHashes(packet);
  const body = {
    finalized_version_id: packet.finalizedVersionId,
    finalized_at: packet.finalizedAt,
    content_sha256: hashes.content_sha256,
    execution_packet_sha256: hashes.execution_packet_sha256,
    parties_sha256: hashes.parties_sha256,
    signer_count: hashes.signer_count,
    anchor_network: ANCHOR_NETWORK,
    execution_packet: packet,
  };
  const res = await fetch(
    `${apiBase.replace(/\/$/, "")}/api/agreements/${encodeURIComponent(agreementId)}/finalized-receipt`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) {
    const text = await res.text();
    return { ok: false, error: text || res.statusText };
  }
  const data = (await res.json()) as { proof?: ExecutionPacketProof };
  return { ok: true, proof: data.proof };
}

export async function fetchAgreementProofStatus(
  apiBase: string,
  agreementId: string
): Promise<ExecutionPacketProof | null> {
  const res = await fetch(
    `${apiBase.replace(/\/$/, "")}/api/agreements/${encodeURIComponent(agreementId)}/proof-status`
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { proof?: ExecutionPacketProof | null };
  return data.proof ?? null;
}

export function clawDefaultAnchorCadenceSummaryText(): string {
  return "Bitcoin ~144 blocks/day equiv. · Dogecoin ~1440 blocks/day equiv.";
}

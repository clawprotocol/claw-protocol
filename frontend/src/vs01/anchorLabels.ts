import type { ExecutionPacketProof } from "./executionPacket";

/**
 * Simple, proof-oriented copy. Bitcoin = canonical anchor; Dogecoin = mirror (launch pairing), not proof source.
 * Does not imply legal finality.
 */
export function userFacingAnchorHeadline(proof: ExecutionPacketProof): string {
  const phase = (proof.anchor_aggregate_phase || "").toLowerCase();
  if (phase === "fully_anchored") return "Fully anchored";
  const net = (proof.anchor_network || "").toLowerCase();
  const st = proof.anchor_status;
  if (st === "anchored") {
    if (net.startsWith("dogecoin")) return "Mirrored to Dogecoin";
    if (net.startsWith("bitcoin")) return "Anchored to Bitcoin";
    return "Anchored on-chain";
  }
  if (st === "anchoring") return "Anchoring (awaiting confirmations)";
  if (st === "batched") return "Included in batch";
  if (st === "failed") return "Anchor step failed";
  return "Recorded — queued for batch";
}

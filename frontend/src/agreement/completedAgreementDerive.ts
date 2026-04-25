import type { AgreementVersionBundle } from "./agreementVersionStore";
import { userFacingAnchorHeadline } from "../vs01/anchorLabels";
import type { ExecutionPacket, ExecutionPacketProof } from "../vs01/executionPacket";

/** Short proof line for summary cards (truthful, no invented completion). */
export function proofSummaryLine(proof: ExecutionPacketProof | null | undefined): string {
  if (!proof) return "Proof details loading…";
  const receipt = proof.receipt_id ? "On record" : "Record pending";
  const anchor = userFacingAnchorHeadline(proof);
  return `${receipt} · ${anchor}`;
}

export function deriveFinalVersionDisplay(args: {
  vb: AgreementVersionBundle | null;
  packet: ExecutionPacket | null;
}): {
  finalVersionId: string;
  versionLabel: string;
  finalizedAtLabel: string | null;
} {
  const { vb, packet } = args;
  const fromPacket = packet?.finalizedVersionId?.trim() || "";
  const fromLock = vb?.signingLock?.lockedVersionId?.trim() || "";
  const finalVersionId = fromPacket || fromLock || "";

  let versionLabel = "—";
  if (vb && finalVersionId) {
    const ord = vb.versions.findIndex((v) => v.id === finalVersionId) + 1;
    versionLabel = ord > 0 ? `v${ord}` : `${finalVersionId.slice(0, 8)}…`;
  } else if (finalVersionId) {
    versionLabel = `${finalVersionId.slice(0, 8)}…`;
  }

  let finalizedAtLabel: string | null = null;
  if (packet?.finalizedAt) {
    const d = new Date(packet.finalizedAt);
    finalizedAtLabel = Number.isNaN(d.getTime()) ? packet.finalizedAt : d.toLocaleString();
  } else if (vb?.signingLock?.lockedAt) {
    finalizedAtLabel = new Date(vb.signingLock.lockedAt).toLocaleString();
  } else if (vb && finalVersionId) {
    const rec = vb.versions.find((v) => v.id === finalVersionId);
    if (rec?.created_at) finalizedAtLabel = new Date(rec.created_at).toLocaleString();
  }

  return { finalVersionId: finalVersionId || "—", versionLabel, finalizedAtLabel };
}

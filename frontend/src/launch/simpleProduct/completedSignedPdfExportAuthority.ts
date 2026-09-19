/**
 * Completed signed PDF export authority.
 * Export is allowed only after every persisted required party has signed and a
 * bound completion receipt matches accepted snapshot / lock / packet.
 */
import {
  completionProgressFromPersistedParticipants,
  type AcceptedCompletionReceipt,
} from "./acceptedSigningCompletionAuthority";
import type { PersistedSigningParty } from "./acceptedSigningPreparationAuthority";

function trim(value: unknown): string {
  return String(value || "").trim();
}

function digest(value: unknown): string {
  return trim(value).toLowerCase();
}

function idsDisagree(values: readonly string[]): boolean {
  const present = values.map(trim).filter(Boolean);
  return present.length >= 2 && new Set(present).size > 1;
}

function digestsDisagree(values: readonly string[]): boolean {
  const present = values.map(digest).filter(Boolean);
  return present.length >= 2 && new Set(present).size > 1;
}

export type CompletedSignedPdfExport =
  | {
      ok: true;
      requiredParticipantIds: string[];
      receiptId: string;
      acceptedSnapshotId: string;
      acceptedDigest: string;
      lockedVersionId: string;
    }
  | { ok: false; reason: string };

export function evaluateCompletedSignedPdfExport(args: {
  parties: readonly PersistedSigningParty[];
  signedParticipantIds: readonly string[];
  receiptBound: boolean;
  receiptId?: string | null;
  acceptedSnapshotId: string;
  acceptedDigest: string;
  lockSnapshotId: string;
  lockDigest: string;
  lockVersionId: string;
  packetSnapshotId: string;
  packetDigest: string;
  packetCorpus?: string | null;
  unsignedHistoricalPaper?: boolean;
}): CompletedSignedPdfExport {
  if (args.unsignedHistoricalPaper) {
    return { ok: false, reason: "historical_unsigned_paper" };
  }
  const progress = completionProgressFromPersistedParticipants({
    parties: args.parties,
    signedParticipantIds: args.signedParticipantIds,
  });
  if (progress.requiredCount === 0) return { ok: false, reason: "missing_required_signers" };
  if (!progress.complete) return { ok: false, reason: "incomplete_required_signatures" };
  if (!args.receiptBound || !trim(args.receiptId)) {
    return { ok: false, reason: "unbound_receipt" };
  }
  if (
    idsDisagree([args.acceptedSnapshotId, args.lockSnapshotId, args.packetSnapshotId]) ||
    digestsDisagree([args.acceptedDigest, args.lockDigest, args.packetDigest])
  ) {
    return { ok: false, reason: "snapshot_digest_mismatch" };
  }
  const acceptedId = trim(args.acceptedSnapshotId);
  const acceptedDigest = digest(args.acceptedDigest);
  const lockVersionId = trim(args.lockVersionId);
  if (!acceptedId || acceptedDigest.length !== 64 || !lockVersionId) {
    return { ok: false, reason: "snapshot_digest_mismatch" };
  }
  const corpus = String(args.packetCorpus || "").trim();
  if (corpus && corpus.length < 80) {
    return { ok: false, reason: "incomplete_packet" };
  }
  return {
    ok: true,
    requiredParticipantIds: progress.requiredParticipantIds,
    receiptId: trim(args.receiptId),
    acceptedSnapshotId: acceptedId,
    acceptedDigest,
    lockedVersionId: lockVersionId,
  };
}

export function evaluateCompletedSignedPdfReceiptGate(
  receipt: AcceptedCompletionReceipt,
  receiptId: string | null | undefined,
): { ok: true } | { ok: false; reason: string } {
  if (!receipt.ok) return receipt;
  if (!trim(receiptId)) return { ok: false, reason: "unbound_receipt" };
  return { ok: true };
}

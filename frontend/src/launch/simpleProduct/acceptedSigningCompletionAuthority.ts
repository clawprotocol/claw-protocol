/**
 * Accepted-packet signing completion and receipt authority.
 * Required signers and completion counts come from persisted durable party IDs.
 * Token party, snapshot/digest, and replay are fail-closed. Name, email, and
 * list position are not authority.
 */
import type { AgreementParty } from "../../agreement/agreementTypes";
import {
  requiredSignersFromPersistedParties,
  type AcceptedSigningParticipant,
  type PersistedSigningParty,
} from "./acceptedSigningPreparationAuthority";

const SYNTHETIC_PARTY_ID = /^party_\d+$/i;
const SYNTHETIC_HASH_PARTY_ID = /^party_[0-9a-f]+:[0-9a-f]+$/i;

function trim(value: unknown): string {
  return String(value || "").trim();
}

function digest(value: unknown): string {
  return trim(value).toLowerCase();
}

function isDurablePersistedPartyId(id: string | null | undefined): id is string {
  const value = trim(id);
  if (!value || value.startsWith("legacy_")) return false;
  if (SYNTHETIC_PARTY_ID.test(value)) return false;
  if (SYNTHETIC_HASH_PARTY_ID.test(value)) return false;
  return true;
}

export function requiredCompletionParticipants(
  parties: readonly PersistedSigningParty[],
): AcceptedSigningParticipant[] {
  return requiredSignersFromPersistedParties(parties);
}

/** Production pending/complete rows: persisted durable IDs first; role===signer is legacy only. */
export function requiredSignerPartiesFromDraft(
  parties: readonly AgreementParty[] | null | undefined,
): AgreementParty[] {
  const rows = Array.isArray(parties) ? parties : [];
  const persisted = requiredSignersFromPersistedParties(rows);
  if (persisted.length > 0) {
    const byId = new Map(rows.map((party) => [trim(party.id), party]));
    return persisted
      .map((row) => byId.get(row.partyId))
      .filter((party): party is AgreementParty => Boolean(party));
  }
  return rows.filter((party) => trim(party.role).toLowerCase() === "signer");
}

export function completionProgressFromPersistedParticipants(args: {
  parties: readonly PersistedSigningParty[];
  signedParticipantIds: readonly string[];
}): {
  requiredCount: number;
  signedCount: number;
  complete: boolean;
  requiredParticipantIds: string[];
  signedRequiredIds: string[];
} {
  const required = requiredCompletionParticipants(args.parties);
  const signedSet = new Set((args.signedParticipantIds || []).map(trim).filter(Boolean));
  const requiredParticipantIds = required.map((row) => row.partyId);
  const signedRequiredIds = requiredParticipantIds.filter((id) => signedSet.has(id));
  return {
    requiredCount: required.length,
    signedCount: signedRequiredIds.length,
    complete: required.length > 0 && signedRequiredIds.length === required.length,
    requiredParticipantIds,
    signedRequiredIds,
  };
}

export type AcceptedSignatureAttempt =
  | { ok: true; participantId: string }
  | { ok: false; reason: string };

export type AcceptedCompletionReceipt =
  | { ok: true; requiredParticipantIds: string[] }
  | { ok: false; reason: string };

function authorityIdsDisagree(values: readonly string[]): boolean {
  const present = values.map(trim).filter(Boolean);
  return present.length >= 2 && new Set(present).size > 1;
}

function authorityDigestsDisagree(values: readonly string[]): boolean {
  const present = values.map(digest).filter(Boolean);
  return present.length >= 2 && new Set(present).size > 1;
}

export function evaluateAcceptedSignatureAttempt(args: {
  tokenMode: string;
  tokenPartyId: string;
  targetPartyId: string;
  signedParticipantIds: readonly string[];
  requiredParticipantIds: readonly string[];
  agreementId: string;
  tokenAgreementId?: string | null;
  acceptedSnapshotId?: string | null;
  acceptedDigest?: string | null;
  lockSnapshotId?: string | null;
  lockDigest?: string | null;
  packetSnapshotId?: string | null;
  packetDigest?: string | null;
  packetCorpus?: string | null;
}): AcceptedSignatureAttempt {
  const mode = trim(args.tokenMode).toLowerCase();
  if (mode !== "sign") return { ok: false, reason: "review_token_cannot_sign" };

  const tokenPartyId = trim(args.tokenPartyId);
  const targetPartyId = trim(args.targetPartyId);
  if (!isDurablePersistedPartyId(tokenPartyId) || !isDurablePersistedPartyId(targetPartyId)) {
    return { ok: false, reason: "missing_durable_participant_id" };
  }
  if (tokenPartyId !== targetPartyId) {
    return { ok: false, reason: "token_cannot_sign_other_party" };
  }

  const agreementId = trim(args.agreementId);
  const tokenAgreementId = trim(args.tokenAgreementId);
  if (!agreementId) return { ok: false, reason: "wrong_agreement" };
  if (tokenAgreementId && tokenAgreementId !== agreementId) {
    return { ok: false, reason: "wrong_agreement" };
  }

  const required = (args.requiredParticipantIds || []).map(trim).filter(isDurablePersistedPartyId);
  if (required.length === 0) return { ok: false, reason: "missing_required_signers" };
  if (!required.includes(targetPartyId)) {
    return { ok: false, reason: "token_cannot_sign_other_party" };
  }
  if ((args.signedParticipantIds || []).map(trim).includes(targetPartyId)) {
    return { ok: false, reason: "sign_token_replay" };
  }

  if (
    authorityIdsDisagree([
      String(args.acceptedSnapshotId || ""),
      String(args.lockSnapshotId || ""),
      String(args.packetSnapshotId || ""),
    ]) ||
    authorityDigestsDisagree([
      String(args.acceptedDigest || ""),
      String(args.lockDigest || ""),
      String(args.packetDigest || ""),
    ])
  ) {
    return { ok: false, reason: "snapshot_digest_mismatch" };
  }

  const corpus = String(args.packetCorpus || "").trim();
  if (corpus) {
    if (corpus.length < 400) return { ok: false, reason: "incomplete_packet" };
    if (!/IN WITNESS WHEREOF/i.test(corpus)) return { ok: false, reason: "missing_signature_block" };
    if (!/^By\s*:/im.test(corpus)) return { ok: false, reason: "missing_by_structure" };
  }

  return { ok: true, participantId: targetPartyId };
}

export function evaluateAcceptedCompletionReceipt(args: {
  parties: readonly PersistedSigningParty[];
  signedParticipantIds: readonly string[];
  acceptedSnapshotId: string;
  acceptedDigest: string;
  lockSnapshotId: string;
  lockDigest: string;
  packetSnapshotId: string;
  packetDigest: string;
}): AcceptedCompletionReceipt {
  const progress = completionProgressFromPersistedParticipants({
    parties: args.parties,
    signedParticipantIds: args.signedParticipantIds,
  });
  if (progress.requiredCount === 0) return { ok: false, reason: "missing_required_signers" };
  if (!progress.complete) return { ok: false, reason: "receipt_before_all_required" };
  if (
    authorityIdsDisagree([args.acceptedSnapshotId, args.lockSnapshotId, args.packetSnapshotId]) ||
    authorityDigestsDisagree([args.acceptedDigest, args.lockDigest, args.packetDigest])
  ) {
    return { ok: false, reason: "snapshot_digest_mismatch" };
  }
  const acceptedId = trim(args.acceptedSnapshotId);
  const acceptedDigest = digest(args.acceptedDigest);
  if (!acceptedId || acceptedDigest.length !== 64) {
    return { ok: false, reason: "snapshot_digest_mismatch" };
  }
  return { ok: true, requiredParticipantIds: progress.requiredParticipantIds };
}

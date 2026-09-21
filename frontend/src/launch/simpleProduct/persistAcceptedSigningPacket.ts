/**
 * Bind a signing packet to the current accepted revision after lock-and-mint.
 * Uses persisted parties and the accepted snapshot only — not review-link count or local cache.
 */
import { fetchAgreementDraft } from "../../agreement/agreementWorkspaceApi";
import { postSigningLinksSent } from "../../agreement/agreementWorkspaceApi";
import { fetchCanonicalReviewSnapshot } from "../../agreement/canonicalReviewSnapshotApi";
import { fingerprintAgreementBody } from "../../components/agreements/guidedDealCompletion/guidedSigningPacketVersion";
import type { FrozenSigningAuthoritySnapshotV1 } from "../../components/agreements/frozenSigningAuthoritySnapshot";
import { sealPortablePacketEnvelopeProvenance } from "../../vs01/vs01SigningEnvelopeProvenance";
import type { Vs01CanonicalPacketPortableV1 } from "../../vs01/vs01CanonicalPacketSeed";
import type { Vs01PrepareSigningRole } from "../../vs01/vs01SignerFieldAssignment";
import {
  evaluateAcceptedSigningPreparation,
  shouldReuseAcceptedSigningAuthority,
  type AcceptedSigningParticipant,
} from "./acceptedSigningPreparationAuthority";

export function shouldOpenSenderFirstProfessionalSign(args: {
  mintAllRequiredSignTokens: boolean;
  persistedParties: ReadonlyArray<{ name?: string; role?: string }>;
}): boolean {
  if (args.mintAllRequiredSignTokens) return false;
  const commercial = (args.persistedParties || []).filter((party) => {
    if (String(party.name || "").trim().length < 2) return false;
    const role = String(party.role || "").trim().toLowerCase();
    return role !== "owner" && role !== "sender" && role !== "reviewer" && role !== "viewer";
  });
  return commercial.length === 0;
}

function rolesFromParticipants(
  participants: readonly AcceptedSigningParticipant[],
): Vs01PrepareSigningRole[] {
  return participants.map((row, index) => ({
    roleId: `role_${row.partyId}`,
    partyIndex: index,
    partyId: row.partyId,
    entityName: row.legalEntity,
    partyName: row.legalEntity,
    roleLabel: row.role || row.legalEntity,
    signerName: row.signerName,
    signerEmail: row.email,
    isEntityParty: true,
    requiresSignature: true,
    vs01CounterpartyId: index === 0 ? null : row.partyId,
    kind: index === 0 ? "owner" : "counterparty",
  }));
}

function frozenFromParticipants(args: {
  agreementId: string;
  corpusHash: string;
  participants: readonly AcceptedSigningParticipant[];
}): FrozenSigningAuthoritySnapshotV1 {
  const parties = args.participants.map((row, index) => ({
    agreementPartyId: row.partyId,
    legalEntityName: row.legalEntity,
    agreementRole: row.role,
    canonicalOrder: index,
  }));
  const signers = args.participants.map((row, index) => ({
    signerRecordId: `signer_${row.partyId}`,
    agreementPartyId: row.partyId,
    signerName: row.signerName,
    signerEmail: row.email,
    signingOrder: index,
    requiresSignature: true,
    requiresInitials: false,
  }));
  return {
    version: 1,
    agreementId: args.agreementId,
    agreementSessionId: `accepted_${args.agreementId}`,
    frozenCorpusHash: args.corpusHash,
    frozenAt: new Date().toISOString(),
    parties,
    signers,
    recipients: signers.map((signer) => ({
      recipientRecordId: `rcpt_${signer.agreementPartyId}`,
      agreementPartyId: signer.agreementPartyId,
      signerRecordId: signer.signerRecordId,
      recipientType: "signer" as const,
      email: signer.signerEmail,
    })),
    execution: {
      partyOrder: parties.map((party) => party.agreementPartyId),
      signerOrder: signers.map((signer) => signer.signerRecordId),
      executionBlockHash: args.corpusHash,
    },
    packetState: "draft",
    requiredActions: signers.map((signer) => ({
      actionId: `sign_${signer.agreementPartyId}`,
      signerRecordId: signer.signerRecordId,
      agreementPartyId: signer.agreementPartyId,
      type: "signature" as const,
      fieldId: `sig_${signer.agreementPartyId}`,
      required: true,
    })),
  };
}

export async function persistAcceptedSigningPacket(args: {
  agreementId: string;
}): Promise<{ ok: true; snapshotId: string; digest: string } | { ok: false; reason: string }> {
  const id = String(args.agreementId || "").trim();
  if (!id) return { ok: false, reason: "missing_agreement_id" };
  const server = await fetchAgreementDraft(id);
  if (!server.ok || !server.draft) return { ok: false, reason: "missing_draft" };
  const fetched = await fetchCanonicalReviewSnapshot({ agreementId: id });
  if (!fetched.ok) return { ok: false, reason: fetched.code || "accepted_get_missing" };
  const acceptedGet = {
    agreement_id: String(fetched.snapshot.agreement_id || id).trim(),
    snapshot_id: String(fetched.snapshot.snapshot_id || "").trim(),
    corpus_sha256: String(fetched.snapshot.corpus_sha256 || "").trim(),
    corpus_plain: String(fetched.snapshot.corpus_plain || ""),
    corpus_length: Number(
      fetched.snapshot.corpus_length || String(fetched.snapshot.corpus_plain || "").trim().length,
    ),
    status: String(fetched.status || fetched.snapshot.status || ""),
  };
  const prepared = evaluateAcceptedSigningPreparation({
    requestedAgreementId: id,
    persistedParties: server.draft.parties || [],
    acceptedGet,
  });
  if (!prepared.ok) return { ok: false, reason: prepared.reason };

  const existingPacket = (server.draft as { vs01_signing_packet_v1?: { accepted_review_snapshot_id?: string; accepted_review_snapshot_digest?: string } })
    .vs01_signing_packet_v1;
  if (
    existingPacket &&
    shouldReuseAcceptedSigningAuthority({
      previousSnapshotId: String(existingPacket.accepted_review_snapshot_id || ""),
      previousDigest: String(existingPacket.accepted_review_snapshot_digest || ""),
      nextSnapshotId: prepared.snapshotId,
      nextDigest: prepared.digest,
    })
  ) {
    return { ok: true, snapshotId: prepared.snapshotId, digest: prepared.digest };
  }

  const corpusHash = fingerprintAgreementBody(prepared.corpus);
  const roles = rolesFromParticipants(prepared.participants);
  const documentId = `accepted_pkt_${id}`;
  const portable: Vs01CanonicalPacketPortableV1 = {
    v: 1,
    seed: {
      v: 1,
      documentId,
      agreementId: id,
      corpusPlain: prepared.corpus,
      corpusHash,
      savedAt: new Date().toISOString(),
    },
    fields: [],
    roles,
    pageCount: 1,
    witnessPageIndex: 0,
    initialsPolicy: { enabled: false, bodyPagesOnly: true },
    fieldCount: 0,
  };
  let sealed: Vs01CanonicalPacketPortableV1;
  try {
    sealed = await sealPortablePacketEnvelopeProvenance({
      documentId,
      portable,
      roles,
    });
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error && err.message.trim() ? err.message : "envelope_seal_failed",
    };
  }
  const frozen = frozenFromParticipants({
    agreementId: id,
    corpusHash,
    participants: prepared.participants,
  });
  const sent = await postSigningLinksSent(id, {
    packet_revision: `accepted_${prepared.snapshotId}`,
    document_id: documentId,
    portable_packet: sealed as unknown as Record<string, unknown>,
    frozen_signing_authority: frozen as unknown as Record<string, unknown>,
    targets: [],
    accepted_review_snapshot_id: prepared.snapshotId,
    accepted_review_snapshot_digest: prepared.digest,
  });
  if (!sent.ok) return { ok: false, reason: sent.skip_reason || "packet_persist_failed" };
  return { ok: true, snapshotId: prepared.snapshotId, digest: prepared.digest };
}

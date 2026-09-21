/**
 * Accepted-agreement signing preparation.
 * Required signers come from persisted parties and durable IDs.
 * Review-link count, array position, synthetic IDs, and a fixed >=3 rule are not authority.
 */
import { evaluateCreateResumeSnapshotAuthority } from "../../components/agreements/paidCreateResumeHydration";
import type { AgreementDraft } from "../../agreement/agreementTypes";

const SYNTHETIC_PARTY_ID = /^party_\d+$/i;
const SYNTHETIC_HASH_PARTY_ID = /^party_[0-9a-f]+:[0-9a-f]+$/i;

function isDurablePersistedPartyId(id: string | null | undefined): id is string {
  const value = String(id || "").trim();
  if (!value || value.startsWith("legacy_")) return false;
  if (SYNTHETIC_PARTY_ID.test(value)) return false;
  if (SYNTHETIC_HASH_PARTY_ID.test(value)) return false;
  return true;
}

function normalizeWorkflowRole(role: string | null | undefined): string {
  const value = String(role || "").trim().toLowerCase();
  if (value === "owner" || value === "sender" || value === "landlord") return "owner";
  if (value === "signer" || value === "signatory") return "signer";
  if (value === "reviewer") return "reviewer";
  if (["viewer", "counterparty", "fyi", "copy", "read_only", "readonly"].includes(value)) {
    return "viewer";
  }
  return value || "party";
}

export type PersistedSigningParty = {
  id?: string;
  name?: string;
  role?: string;
  email?: string;
  signerName?: string;
  signer_name?: string;
  requiresSignature?: boolean;
};

export type AcceptedSigningSnapshot = {
  agreement_id: string;
  snapshot_id: string;
  corpus_sha256: string;
  corpus_plain: string;
  corpus_length: number;
  status: string;
};

export type AcceptedSigningParticipant = {
  partyId: string;
  legalEntity: string;
  role: string;
  signerName: string;
  email: string;
};

export type AcceptedSigningPreparation =
  | {
      ok: true;
      requiredParticipantIds: string[];
      participants: AcceptedSigningParticipant[];
      snapshotId: string;
      digest: string;
      corpus: string;
    }
  | { ok: false; reason: string };

function partySignerName(party: PersistedSigningParty): string {
  return String(party.signerName || party.signer_name || "").trim();
}

function partyEmail(party: PersistedSigningParty): string {
  return String(party.email || "").trim();
}

export function draftFromPersistedSigningParties(
  parties: readonly PersistedSigningParty[],
  agreementId = "ag-signing",
): AgreementDraft {
  return {
    id: agreementId,
    title: "Accepted signing preparation",
    jurisdiction: "TX",
    parties: parties.map((party, index) => ({
      id: String(party.id || "").trim() || undefined,
      name: String(party.name || "").trim(),
      role: String(party.role || "").trim() || "party",
      email: partyEmail(party),
      signerName: partySignerName(party),
      requiresSignature: party.requiresSignature,
      partyIndex: index,
    })),
    purpose: "signing preparation",
    payment_terms: "",
    duration: "",
    due_date: null,
    effective_date: null,
    created_at: "2026-09-18T00:00:00.000Z",
    updated_at: "2026-09-18T00:00:00.000Z",
    versions: [{ version: 1, created_at: "2026-09-18T00:00:00.000Z" }],
    audit_log: [],
  };
}

/** Required signers are persisted parties with durable IDs that still require a signature. */
export function requiredSignersFromPersistedParties(
  parties: readonly PersistedSigningParty[],
): AcceptedSigningParticipant[] {
  const out: AcceptedSigningParticipant[] = [];
  const seen = new Set<string>();
  for (const party of parties) {
    if (normalizeWorkflowRole(party.role) === "viewer") continue;
    if (party.requiresSignature === false) continue;
    const id = String(party.id || "").trim();
    if (!isDurablePersistedPartyId(id) || seen.has(id)) continue;
    seen.add(id);
    out.push({
      partyId: id,
      legalEntity: String(party.name || "").trim(),
      role: String(party.role || "").trim(),
      signerName: partySignerName(party),
      email: partyEmail(party),
    });
  }
  return out;
}

export function persistedPartiesReadyForAcceptedSigning(
  parties: readonly PersistedSigningParty[] | null | undefined,
): boolean {
  const required = requiredSignersFromPersistedParties(parties || []);
  if (required.length === 0) return false;
  return required.every(
    (row) =>
      isDurablePersistedPartyId(row.partyId) &&
      row.legalEntity.length >= 2 &&
      row.signerName.length >= 2 &&
      /@/.test(row.email),
  );
}

export function evaluateAcceptedSigningPreparation(args: {
  requestedAgreementId: string;
  persistedParties: readonly PersistedSigningParty[];
  acceptedGet: AcceptedSigningSnapshot | null;
  expectedDigest?: string | null;
  reviewLinkCount?: number;
  reviewLinkPartyIds?: readonly string[];
}): AcceptedSigningPreparation {
  void args.reviewLinkCount;
  void args.reviewLinkPartyIds;
  const requested = String(args.requestedAgreementId || "").trim();
  if (!requested) return { ok: false, reason: "missing_agreement_id" };
  if (!args.acceptedGet) return { ok: false, reason: "accepted_get_missing" };
  const snapshot = {
    ...args.acceptedGet,
    corpus_plain: String(args.acceptedGet.corpus_plain || "").trim(),
  };
  snapshot.corpus_length = snapshot.corpus_plain.length;
  const evaluated = evaluateCreateResumeSnapshotAuthority({
    requestedAgreementId: requested,
    snapshot,
    expectedDigest: args.expectedDigest ?? snapshot.corpus_sha256,
  });
  if (!evaluated.ok) return { ok: false, reason: evaluated.code };

  const named = (args.persistedParties || []).filter((party) => String(party.name || "").trim().length >= 2);
  if (named.length === 0) return { ok: false, reason: "missing_persisted_parties" };

  for (const party of named) {
    if (party.requiresSignature === false) continue;
    const id = String(party.id || "").trim();
    if (!isDurablePersistedPartyId(id)) {
      return { ok: false, reason: "synthetic_or_missing_participant_id" };
    }
    if (partySignerName(party).length < 2 || !/@/.test(partyEmail(party))) {
      return { ok: false, reason: "missing_signer_metadata" };
    }
  }

  const participants = requiredSignersFromPersistedParties(named);
  if (participants.length === 0) return { ok: false, reason: "missing_required_signers" };
  if (participants.length !== named.filter((party) => party.requiresSignature !== false).length) {
    return { ok: false, reason: "synthetic_or_missing_participant_id" };
  }
  if (String(args.acceptedGet.corpus_plain || "").trim().length < 400) {
    return { ok: false, reason: "incomplete_packet_corpus" };
  }
  return {
    ok: true,
    requiredParticipantIds: participants.map((row) => row.partyId),
    participants,
    snapshotId: evaluated.authority.snapshotId,
    digest: evaluated.authority.digest,
    corpus: evaluated.authority.corpus,
  };
}

export function shouldReuseAcceptedSigningAuthority(args: {
  previousSnapshotId: string;
  previousDigest: string;
  nextSnapshotId: string;
  nextDigest: string;
}): boolean {
  const prevId = String(args.previousSnapshotId || "").trim();
  const nextId = String(args.nextSnapshotId || "").trim();
  const prevDigest = String(args.previousDigest || "").trim().toLowerCase();
  const nextDigest = String(args.nextDigest || "").trim().toLowerCase();
  return Boolean(prevId && nextId && prevId === nextId && prevDigest && prevDigest === nextDigest);
}

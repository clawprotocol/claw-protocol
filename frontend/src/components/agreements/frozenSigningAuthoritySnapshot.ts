/**
 * Phase 3A candidate/confirmed record for backend-owned frozen signing authority.
 * Candidate construction never establishes authority; only a confirmed backend response is cached.
 */

import type { AcceptedCorpusAuthority } from "../../agreement/acceptedCorpusAuthority";
import { sha256Hex } from "../../utils/agreements/hash";
import type { AuthoritativeSigningSnapshot } from "./authoritativeSigningSnapshot";
import { readSignerExecutionAuthority } from "./signerExecutionAuthority";

export type FrozenSigningAuthorityPartyV1 = {
  agreementPartyId: string;
  legalEntityName: string;
  agreementRole: string;
  canonicalOrder: number;
};

export type FrozenSigningAuthoritySignerV1 = {
  signerRecordId: string;
  agreementPartyId: string;
  signerName: string;
  signerTitle: string | null;
  signerEmail: string;
  signingOrder: number;
};

export type FrozenSigningAuthorityExecutionV1 = {
  partyOrder: string[];
  signerOrder: string[];
  executionPartyHash: string;
};

export type FrozenSigningAuthoritySnapshotV1 = {
  version: 1;
  agreementId: string;
  acceptedVersionId: string;
  acceptedCorpusSha256: string;
  frozenAt?: string;
  parties: FrozenSigningAuthorityPartyV1[];
  signers: FrozenSigningAuthoritySignerV1[];
  execution: FrozenSigningAuthorityExecutionV1;
};

export type FrozenSigningAuthorityPersistenceBoundary = {
  activateSession(session: number): void;
  ensure(
    session: number,
    candidateKey: string,
    persist: () => Promise<FrozenSigningAuthoritySnapshotV1>,
    callbacks?: {
      onConfirmed?: (snapshot: FrozenSigningAuthoritySnapshotV1) => void;
      onRejected?: (error: unknown) => void;
    },
  ): Promise<FrozenSigningAuthoritySnapshotV1>;
};

const CACHE_PREFIX = "claw_frozen_signing_authority_v1:";
let confirmedByAgreement = new Map<string, FrozenSigningAuthoritySnapshotV1>();

function normalizedName(value: string | null | undefined): string {
  return String(value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

export function createFrozenSigningAuthorityPersistenceBoundary(
  initialSession = 0,
): FrozenSigningAuthorityPersistenceBoundary {
  let activeSession = initialSession;
  let currentKey = "";
  let currentPromise: Promise<FrozenSigningAuthoritySnapshotV1> | null = null;
  let confirmed: FrozenSigningAuthoritySnapshotV1 | null = null;

  const activateSession = (session: number) => {
    if (session === activeSession) return;
    activeSession = session;
    currentKey = "";
    currentPromise = null;
    confirmed = null;
  };

  return {
    activateSession,
    ensure(session, candidateKey, persist, callbacks) {
      activateSession(session);
      if (candidateKey === currentKey && confirmed) return Promise.resolve(confirmed);
      if (candidateKey === currentKey && currentPromise) return currentPromise;

      currentKey = candidateKey;
      confirmed = null;
      const tracked = Promise.resolve()
        .then(persist)
        .then(
          (snapshot) => {
            if (
              activeSession !== session ||
              currentKey !== candidateKey ||
              currentPromise !== tracked
            ) {
              throw new Error("frozen_signing_authority_stale_review_session");
            }
            confirmed = snapshot;
            callbacks?.onConfirmed?.(snapshot);
            return snapshot;
          },
          (error: unknown) => {
            if (
              activeSession === session &&
              currentKey === candidateKey &&
              currentPromise === tracked
            ) {
              callbacks?.onRejected?.(error);
            }
            throw error;
          },
        )
        .finally(() => {
          if (
            activeSession === session &&
            currentKey === candidateKey &&
            currentPromise === tracked
          ) {
            currentPromise = null;
          }
        });
      currentPromise = tracked;
      tracked.catch(() => undefined);
      return tracked;
    },
  };
}

export async function buildFrozenSigningAuthorityCandidate(args: {
  acceptedAuthority: AcceptedCorpusAuthority;
  authoritativeSnapshot: AuthoritativeSigningSnapshot;
  intakeText?: string | null;
}): Promise<FrozenSigningAuthoritySnapshotV1> {
  const { acceptedAuthority, authoritativeSnapshot } = args;
  if (
    !acceptedAuthority.agreement_id.trim() ||
    !acceptedAuthority.version_id.startsWith("av_") ||
    !/^[a-f0-9]{64}$/.test(acceptedAuthority.corpus_sha256) ||
    acceptedAuthority.authority_state !== "accepted"
  ) {
    throw new Error("frozen_signing_authority_accepted_version_required");
  }
  const manifest = [...authoritativeSnapshot.partyManifest.parties].sort(
    (a, b) => a.index - b.index,
  );
  const acceptedParties = acceptedAuthority.legal_parties ?? [];
  const parties: FrozenSigningAuthorityPartyV1[] = acceptedParties.map((party, index) => ({
    agreementPartyId: party.agreement_party_id,
    legalEntityName: party.legal_entity_name,
    agreementRole: party.agreement_role,
    canonicalOrder: index,
  }));
  if (parties.length < 2) throw new Error("frozen_signing_authority_legal_parties_required");
  if (
    manifest.length !== parties.length ||
    parties.some(
      (party, index) =>
        normalizedName(party.legalEntityName) !== normalizedName(manifest[index]?.partyName),
    )
  ) {
    throw new Error("frozen_signing_authority_legal_party_mismatch");
  }

  const signatureEntries = authoritativeSnapshot.signatureBlockModel.entries;
  const partyOrderById = new Map(
    parties.map((party) => [party.agreementPartyId, party.canonicalOrder] as const),
  );
  const executionRecords = (readSignerExecutionAuthority(args.intakeText)?.records ?? [])
    .filter((record) => record.isSigningParty)
    .sort(
      (a, b) =>
        (a.signingOrder ?? Number.MAX_SAFE_INTEGER) -
          (b.signingOrder ?? Number.MAX_SAFE_INTEGER) ||
        (partyOrderById.get(a.agreementPartyId) ?? Number.MAX_SAFE_INTEGER) -
          (partyOrderById.get(b.agreementPartyId) ?? Number.MAX_SAFE_INTEGER) ||
        a.signerRecordId.localeCompare(b.signerRecordId),
    );
  let signers: FrozenSigningAuthoritySignerV1[];
  if (executionRecords.length) {
    signers = executionRecords.map((record, signingOrder) => {
      if (!partyOrderById.has(record.agreementPartyId)) {
        throw new Error("frozen_signing_authority_unknown_signer_party");
      }
      const signerName = String(record.signerName ?? "").trim();
      const signerEmail = String(record.signerEmail ?? "").trim();
      if (!record.signerRecordId.trim() || !signerName || !signerEmail.includes("@")) {
        throw new Error("frozen_signing_authority_finalized_signer_required");
      }
      return {
        signerRecordId: record.signerRecordId.trim(),
        agreementPartyId: record.agreementPartyId,
        signerName,
        signerTitle: String(record.signerTitle ?? "").trim() || null,
        signerEmail,
        signingOrder,
      };
    });
  } else {
    signers = parties.flatMap((party, index) => {
      const manifestParty = manifest[index];
      const signatureEntry =
        signatureEntries.find(
          (entry) => normalizedName(entry.partyName) === normalizedName(party.legalEntityName),
        ) ?? signatureEntries[index];
      const signerName = String(
        manifestParty?.signerName ??
          authoritativeSnapshot.signerMetadata.partySignerNames[index] ??
          signatureEntry?.signerName ??
          "",
      ).trim();
      const signerTitle =
        String(
          manifestParty?.signerTitle ??
            authoritativeSnapshot.signerMetadata.partySignerTitles[index] ??
            signatureEntry?.title ??
            "",
        ).trim() || null;
      const signerEmail = String(
        manifestParty?.email ??
          signatureEntry?.email ??
          (index === 0
            ? authoritativeSnapshot.signerMetadata.recipient1Email
            : index === 1
              ? authoritativeSnapshot.signerMetadata.recipient2Email
              : authoritativeSnapshot.signerMetadata.extraPartyReviewEmails[index - 2]) ??
          "",
      ).trim();
      if (!signerName && !signerEmail) return [];
      if (!signerName || !signerEmail.includes("@") || !signatureEntry) {
        throw new Error("frozen_signing_authority_finalized_signer_required");
      }
      return [{
        signerRecordId: `signer:${party.agreementPartyId}:0`,
        agreementPartyId: party.agreementPartyId,
        signerName,
        signerTitle,
        signerEmail,
        signingOrder: signatureEntry.signingOrder,
      }];
    });
    signers.sort((a, b) => a.signingOrder - b.signingOrder);
    signers = signers.map((signer, signingOrder) => ({ ...signer, signingOrder }));
  }
  if (!signers.length) throw new Error("frozen_signing_authority_finalized_signers_required");

  const partyOrder = parties.map((party) => party.agreementPartyId);
  return {
    version: 1,
    agreementId: acceptedAuthority.agreement_id,
    acceptedVersionId: acceptedAuthority.version_id,
    acceptedCorpusSha256: acceptedAuthority.corpus_sha256,
    parties,
    signers,
    execution: {
      partyOrder,
      signerOrder: signers.map((signer) => signer.signerRecordId),
      executionPartyHash: await sha256Hex(JSON.stringify(partyOrder)),
    },
  };
}

export function normalizeFrozenSigningAuthority(
  raw: unknown,
  expectedAgreementId?: string,
): FrozenSigningAuthoritySnapshotV1 | null {
  if (!raw || typeof raw !== "object") return null;
  const outer = raw as Record<string, unknown>;
  const value =
    outer.snapshot && typeof outer.snapshot === "object"
      ? (outer.snapshot as FrozenSigningAuthoritySnapshotV1)
      : (outer as FrozenSigningAuthoritySnapshotV1);
  if (
    value.version !== 1 ||
    !value.agreementId?.trim() ||
    !value.acceptedVersionId?.startsWith("av_") ||
    !/^[a-f0-9]{64}$/.test(value.acceptedCorpusSha256 ?? "") ||
    !Array.isArray(value.parties) ||
    !Array.isArray(value.signers) ||
    !value.execution ||
    !Array.isArray(value.execution.partyOrder) ||
    !Array.isArray(value.execution.signerOrder) ||
    !/^[a-f0-9]{64}$/.test(value.execution.executionPartyHash ?? "")
  ) {
    return null;
  }
  if (
    value.parties.some(
      (party, index) =>
        !party ||
        typeof party !== "object" ||
        !party.agreementPartyId?.trim() ||
        !party.legalEntityName?.trim() ||
        !party.agreementRole?.trim() ||
        party.canonicalOrder !== index,
    ) ||
    value.signers.some(
      (signer) =>
        !signer ||
        typeof signer !== "object" ||
        !signer.signerRecordId?.trim() ||
        !signer.agreementPartyId?.trim() ||
        !signer.signerName?.trim() ||
        !signer.signerEmail?.includes("@") ||
        !Number.isInteger(signer.signingOrder),
    )
  ) {
    return null;
  }
  if (expectedAgreementId?.trim() && value.agreementId !== expectedAgreementId.trim()) return null;
  return value;
}

export function cacheConfirmedFrozenSigningAuthority(
  snapshot: FrozenSigningAuthoritySnapshotV1,
): void {
  const confirmed = normalizeFrozenSigningAuthority(snapshot, snapshot.agreementId);
  if (!confirmed || !confirmed.frozenAt) {
    throw new Error("frozen_signing_authority_unconfirmed_response");
  }
  confirmedByAgreement.set(confirmed.agreementId, confirmed);
  try {
    sessionStorage.setItem(`${CACHE_PREFIX}${confirmed.agreementId}`, JSON.stringify(confirmed));
  } catch {
    // Backend persistence remains authoritative.
  }
}

export function readCachedFrozenSigningAuthority(
  agreementId: string,
): FrozenSigningAuthoritySnapshotV1 | null {
  const id = agreementId.trim();
  if (!id) return null;
  const memory = confirmedByAgreement.get(id);
  if (memory) return memory;
  try {
    const raw = sessionStorage.getItem(`${CACHE_PREFIX}${id}`);
    const confirmed = raw ? normalizeFrozenSigningAuthority(JSON.parse(raw), id) : null;
    if (!confirmed?.frozenAt) return null;
    confirmedByAgreement.set(id, confirmed);
    return confirmed;
  } catch {
    return null;
  }
}

export function clearCachedFrozenSigningAuthority(agreementId: string): void {
  const id = agreementId.trim();
  if (!id) return;
  confirmedByAgreement.delete(id);
  try {
    sessionStorage.removeItem(`${CACHE_PREFIX}${id}`);
  } catch {
    // Best effort cache cleanup.
  }
}

export function clearFrozenSigningAuthorityForTests(): void {
  confirmedByAgreement = new Map();
  if (typeof sessionStorage === "undefined") return;
  const keys: string[] = [];
  for (let index = 0; index < sessionStorage.length; index += 1) {
    const key = sessionStorage.key(index);
    if (key?.startsWith(CACHE_PREFIX)) keys.push(key);
  }
  for (const key of keys) sessionStorage.removeItem(key);
}

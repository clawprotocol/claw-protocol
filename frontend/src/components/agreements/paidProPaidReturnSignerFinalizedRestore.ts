/**
 * Paid-return remount restore — #135 kept Continue after an in-session latch.
 * Hard refresh of `/app/create?checkout_session_id=…` drops that latch and the
 * module-level signing snapshot, so first-review paints Add signer details even
 * when persist already has accept + frozen-signing-authority + two authorized signers.
 *
 * Last-good: reload frozen authority, reinstall the in-memory snapshot, pin the
 * latch. No new signing architecture, no draft POST, no frozen POST, no mail.
 */

import { looksLikeEmail } from "./recipientEmailValidation";
import {
  adoptFrozenSigningAuthoritySnapshotForCurrentSession,
  loadFrozenSigningAuthority,
  type FrozenSigningAuthoritySnapshotV1,
} from "./frozenSigningAuthoritySnapshot";
import {
  hasAuthoritativeSigningSnapshot,
  installAuthoritativeSigningSnapshotFromPersist,
  type AuthoritativeSigningSnapshot,
} from "./authoritativeSigningSnapshot";
import {
  authorityPartiesToLiveSignerMetadataUi,
  authorityPartiesToRecipientMetadata,
  buildCanonicalFinalPartyManifestFromAuthority,
  hashPaidProSignerMetadataAuthority,
  type LiveSignerMetadataUiState,
  type PaidProSignerMetadataParty,
} from "./paidProSignerMetadataAuthority";
import { hashPaidProCorpus } from "./paidProSourceOfTruth";

export const PAID_RETURN_SIGNER_FINALIZED_RESTORE_REASON =
  "paid_return_remount_persist_finalized_signers" as const;

export function persistHasTwoAuthorizedSigners(
  frozen: FrozenSigningAuthoritySnapshotV1 | null | undefined,
): boolean {
  if (!frozen || frozen.parties.length < 2 || frozen.signers.length < 2) return false;
  const authorized = frozen.signers.filter(
    (s) =>
      s.requiresSignature !== false &&
      looksLikeEmail(s.signerEmail) &&
      (s.signerName || "").trim().length >= 2,
  );
  return authorized.length >= 2;
}

/**
 * First failing predicate on the live paid-return remount path:
 * in-memory snapshot + React latch are both false after refresh, so
 * `paidProSignerMetadataFinalized` rewinds to unsigned first-review.
 */
export function shouldRestoreFinalizedSignerStateOnPaidReturnRemount(args: {
  hasAuthoritativeSigningSnapshot: boolean;
  signerMetadataFinalizedLatch: boolean;
  persistAccepted: boolean;
  frozenHasTwoAuthorizedSigners: boolean;
}): boolean {
  if (args.hasAuthoritativeSigningSnapshot || args.signerMetadataFinalizedLatch) return false;
  return args.persistAccepted && args.frozenHasTwoAuthorizedSigners;
}

export function frozenSigningAuthorityToAuthorityParties(
  frozen: FrozenSigningAuthoritySnapshotV1,
): PaidProSignerMetadataParty[] {
  return [...frozen.parties]
    .sort((a, b) => a.canonicalOrder - b.canonicalOrder)
    .map((party, partyIndex) => {
      const signer =
        frozen.signers.find((s) => s.agreementPartyId === party.agreementPartyId) ?? null;
      return {
        partyIndex,
        partyLegalName: party.legalEntityName.trim(),
        signerEmail: (signer?.signerEmail ?? "").trim(),
        signerName: (signer?.signerName ?? "").trim(),
        signerTitle: (signer?.signerTitle ?? "").trim(),
        partyAddress: "",
      };
    });
}

export function buildAuthoritativeSigningSnapshotFromFrozenPersist(args: {
  corpus: string;
  frozen: FrozenSigningAuthoritySnapshotV1;
}): AuthoritativeSigningSnapshot | null {
  const corpus = (args.corpus || "").trim();
  if (!corpus) return null;
  const parties = frozenSigningAuthorityToAuthorityParties(args.frozen);
  if (parties.length < 2) return null;
  const signerMetadata = authorityPartiesToRecipientMetadata(parties);
  const authority = {
    parties,
    source: "authoritative_snapshot" as const,
    hash: hashPaidProSignerMetadataAuthority(parties),
    updatedAt: Date.parse(args.frozen.frozenAt) || Date.now(),
  };
  return {
    corpus,
    signerMetadata,
    recipientMetadata: { ...signerMetadata },
    partyManifest: buildCanonicalFinalPartyManifestFromAuthority(authority),
    signatureBlockModel: { signFirst: true, entries: [] },
    source: "paid_pro_signer_metadata_finalize",
    hash: args.frozen.frozenCorpusHash || hashPaidProCorpus(corpus),
    frozenAt: Date.parse(args.frozen.frozenAt) || Date.now(),
  };
}

export type PaidReturnSignerFinalizedRestoreResult =
  | {
      ok: true;
      reason: typeof PAID_RETURN_SIGNER_FINALIZED_RESTORE_REASON;
      ui: LiveSignerMetadataUiState;
    }
  | { ok: false; reason: string };

export async function restoreFinalizedSignerStateFromPaidReturnPersist(args: {
  agreementId: string;
  persistAccepted: boolean;
  corpus: string;
  signerMetadataFinalizedLatch?: boolean;
}): Promise<PaidReturnSignerFinalizedRestoreResult> {
  const agreementId = (args.agreementId || "").trim();
  const corpus = (args.corpus || "").trim();
  if (!agreementId || !corpus) {
    return { ok: false, reason: "missing_agreement_or_corpus" };
  }
  if (hasAuthoritativeSigningSnapshot()) {
    return { ok: false, reason: "in_memory_snapshot_present" };
  }
  const frozen = await loadFrozenSigningAuthority({
    agreementId,
    expectedVersion: 1,
  });
  if (
    !shouldRestoreFinalizedSignerStateOnPaidReturnRemount({
      hasAuthoritativeSigningSnapshot: false,
      signerMetadataFinalizedLatch: Boolean(args.signerMetadataFinalizedLatch),
      persistAccepted: args.persistAccepted,
      frozenHasTwoAuthorizedSigners: persistHasTwoAuthorizedSigners(frozen),
    })
  ) {
    return { ok: false, reason: "persist_not_finalized" };
  }
  const built = buildAuthoritativeSigningSnapshotFromFrozenPersist({
    corpus,
    frozen: frozen!,
  });
  if (!built) return { ok: false, reason: "snapshot_rebuild_failed" };
  adoptFrozenSigningAuthoritySnapshotForCurrentSession(frozen!);
  installAuthoritativeSigningSnapshotFromPersist(built);
  if (!hasAuthoritativeSigningSnapshot()) {
    return { ok: false, reason: "snapshot_install_failed" };
  }
  return {
    ok: true,
    reason: PAID_RETURN_SIGNER_FINALIZED_RESTORE_REASON,
    ui: authorityPartiesToLiveSignerMetadataUi(frozenSigningAuthorityToAuthorityParties(frozen!)),
  };
}

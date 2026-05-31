/**
 * Authoritative signer hydration for paid Pro review and signing surfaces.
 * Review and VS01 must share the same signer-applied corpus from the signing snapshot.
 */

import { manifestToCanonicalPartyIdentities } from "./guidedDealCompletion/canonicalFinalPartyManifest";
import { corpusSignatureBlocksHaveRequiredByLines } from "./guidedDealCompletion/signatureRegion";
import type { CanonicalPartyIdentity } from "./guidedDealCompletion/signerPartyIdentity";
import {
  applySignerPartyIdentityToAuthoritativeAgreement,
  rebuildSignatureBlocksWithPartyIdentities,
} from "./guidedDealCompletion/signerPartyIdentity";
import type { PaidProSignerMetadataAuthority } from "./paidProSignerMetadataAuthority";
import { authorityPartiesToCanonicalPartyIdentities } from "./paidProSignerMetadataAuthority";
import {
  getAuthoritativeSigningSnapshot,
  type AuthoritativeSigningSnapshot,
  type AuthoritativeSigningSnapshotRecipientMetadata,
} from "./authoritativeSigningSnapshot";
import {
  buildLivePaidProSignerMetadataAuthority,
  hashPaidProSignerMetadataAuthority,
  recipientMetadataToAuthorityParties,
  type LiveSignerMetadataUiState,
} from "./paidProSignerMetadataAuthority";

export type HydratedAuthoritativeSigningCorpusResult = {
  corpus: string;
  identities: CanonicalPartyIdentity[];
  signaturePolishCount: number;
  rejected: boolean;
  rejectReason?: "corpus_shrink";
};

export function resolveAuthoritativeSignerIdentitiesFromSnapshot(
  snapshot: AuthoritativeSigningSnapshot,
): CanonicalPartyIdentity[] {
  return manifestToCanonicalPartyIdentities(snapshot.partyManifest);
}

export function buildHydratedAuthoritativeSigningCorpus(args: {
  rawCorpus: string;
  identities: readonly CanonicalPartyIdentity[];
  intakeRaw: string;
  surface: string;
}): HydratedAuthoritativeSigningCorpusResult {
  const raw = (args.rawCorpus || "").trim();
  const identityApply = applySignerPartyIdentityToAuthoritativeAgreement(
    raw,
    args.identities,
    args.intakeRaw,
  );
  const corpus = identityApply.rejected ? raw : identityApply.text;
  const signerCount = args.identities.filter((id) => id.partyDisplayName.trim()).length;
  const hasFilledBlocks = corpusSignatureBlocksHaveRequiredByLines(corpus, Math.max(2, signerCount));
  logAuthoritativeSignerHydration({
    surface: args.surface,
    rawLen: raw.length,
    hydratedLen: corpus.length,
    signaturePolishCount: identityApply.signaturePolishCount,
    signerCount,
    hasFilledBlocks,
    rejected: Boolean(identityApply.rejected),
    rejectReason: identityApply.rejectReason ?? null,
  });
  logSignatureBlockSource({
    surface: args.surface,
    source: identityApply.rejected ? "raw_corpus_reject" : "signer_identity_apply",
    hasFilledBlocks,
    signerCount,
  });
  if (identityApply.rejected) {
    logSignerHydrationMismatch({
      surface: args.surface,
      reason: "corpus_shrink_rejected",
      rawLen: raw.length,
      afterLen: corpus.length,
    });
  }
  return {
    corpus,
    identities: [...args.identities],
    signaturePolishCount: identityApply.signaturePolishCount,
    rejected: Boolean(identityApply.rejected),
    rejectReason: identityApply.rejectReason,
  };
}

/**
 * Hydrate signing corpus from consumed signer metadata authority and repair missing execution blocks.
 */
export function buildHydratedAuthoritativeSigningCorpusFromAuthority(args: {
  rawCorpus: string;
  authority: PaidProSignerMetadataAuthority;
  intakeRaw: string;
  surface: string;
}): HydratedAuthoritativeSigningCorpusResult {
  const identities = authorityPartiesToCanonicalPartyIdentities(args.authority.parties);
  let result = buildHydratedAuthoritativeSigningCorpus({
    rawCorpus: args.rawCorpus,
    identities,
    intakeRaw: args.intakeRaw,
    surface: args.surface,
  });
  const signerCount = Math.max(2, identities.filter((id) => id.partyDisplayName.trim()).length);
  const hasBlocks = corpusSignatureBlocksHaveRequiredByLines(result.corpus, signerCount);
  const hasPopulatedNames = (() => {
    const tail = result.corpus.slice(Math.floor(result.corpus.length * 0.72));
    return (tail.match(/^name\s*:\s*(?!_{4,})(?!\s*$).+/gim) || []).length >= signerCount;
  })();
  if (!result.rejected && (!hasBlocks || !hasPopulatedNames)) {
    const rebuilt = rebuildSignatureBlocksWithPartyIdentities(result.corpus, identities);
    if (rebuilt.count > 0) {
      result = {
        ...result,
        corpus: rebuilt.text,
        signaturePolishCount: result.signaturePolishCount + rebuilt.count,
      };
      logSignatureBlockSource({
        surface: args.surface,
        source: "authority_signature_block_rebuild",
        hasFilledBlocks: corpusSignatureBlocksHaveRequiredByLines(rebuilt.text, signerCount),
        signerCount,
      });
    } else if (typeof import.meta !== "undefined" && import.meta.env?.DEV) {
      logSignerHydrationMismatch({
        surface: args.surface,
        reason: "post_finalize_missing_signature_block",
        rawLen: result.corpus.length,
        afterLen: rebuilt.text.length,
      });
    }
  }
  return result;
}

export function fingerprintSignerMetadataState(
  meta: AuthoritativeSigningSnapshotRecipientMetadata,
): string {
  const parties = recipientMetadataToAuthorityParties(meta);
  return hashPaidProSignerMetadataAuthority(parties);
}

/** Drift fingerprint from live UI state (all five signer authority fields). */
export function fingerprintLiveSignerMetadataUi(ui: LiveSignerMetadataUiState): string {
  return buildLivePaidProSignerMetadataAuthority(ui).hash;
}

export function signerMetadataDriftedFromSnapshot(
  snapshot: AuthoritativeSigningSnapshot,
  current: AuthoritativeSigningSnapshotRecipientMetadata,
): boolean {
  return fingerprintSignerMetadataState(snapshot.signerMetadata) !== fingerprintSignerMetadataState(current);
}

export function logSnapshotSignerState(payload: {
  partyCount: number;
  signerNames: readonly string[];
  emails: readonly string[];
  corpusHasFilledSignatureBlocks: boolean;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  if (typeof import.meta === "undefined" || !import.meta.env?.DEV) return;
  // eslint-disable-next-line no-console
  console.info("[snapshot-signer-state]", payload);
}

export function logAuthoritativeSignerHydration(payload: {
  surface: string;
  rawLen: number;
  hydratedLen: number;
  signaturePolishCount: number;
  signerCount: number;
  hasFilledBlocks: boolean;
  rejected: boolean;
  rejectReason: string | null;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  if (typeof import.meta === "undefined" || !import.meta.env?.DEV) return;
  // eslint-disable-next-line no-console
  console.info("[authoritative-signer-hydration]", payload);
}

export function logSignatureBlockSource(payload: {
  surface: string;
  source: string;
  hasFilledBlocks: boolean;
  signerCount: number;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  if (typeof import.meta === "undefined" || !import.meta.env?.DEV) return;
  // eslint-disable-next-line no-console
  console.info("[signature-block-source]", payload);
}

export function logSignerHydrationMismatch(payload: {
  surface: string;
  reason: string;
  rawLen: number;
  afterLen: number;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  if (typeof import.meta === "undefined" || !import.meta.env?.DEV) return;
  // eslint-disable-next-line no-console
  console.warn("[signer-hydration-mismatch]", payload);
}

/** Read identities from snapshot when finalized; otherwise null. */
export function readAuthoritativeSignerIdentitiesForSurfaces(): CanonicalPartyIdentity[] | null {
  const snap = getAuthoritativeSigningSnapshot();
  if (!snap) return null;
  return resolveAuthoritativeSignerIdentitiesFromSnapshot(snap);
}

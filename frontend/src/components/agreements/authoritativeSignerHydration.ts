/**
 * Authoritative signer hydration for paid Pro review and signing surfaces.
 * Review and VS01 must share the same signer-applied corpus from the signing snapshot.
 */

import { manifestToCanonicalPartyIdentities } from "./guidedDealCompletion/canonicalFinalPartyManifest";
import { corpusSignatureBlocksHaveRequiredByLines } from "./guidedDealCompletion/signatureRegion";
import type { CanonicalPartyIdentity } from "./guidedDealCompletion/signerPartyIdentity";
import {
  applySignerPartyIdentityToAuthoritativeAgreement,
} from "./guidedDealCompletion/signerPartyIdentity";
import {
  getAuthoritativeSigningSnapshot,
  type AuthoritativeSigningSnapshot,
  type AuthoritativeSigningSnapshotRecipientMetadata,
} from "./authoritativeSigningSnapshot";
import { fingerprintAgreementBody } from "./guidedDealCompletion/guidedSigningPacketVersion";

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

export function fingerprintSignerMetadataState(
  meta: AuthoritativeSigningSnapshotRecipientMetadata,
): string {
  return fingerprintAgreementBody(
    JSON.stringify({
      names: meta.partySignerNames,
      titles: meta.partySignerTitles,
      r1: meta.recipient1Email,
      r2: meta.recipient2Email,
      extra: meta.extraPartyReviewEmails,
    }),
  );
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

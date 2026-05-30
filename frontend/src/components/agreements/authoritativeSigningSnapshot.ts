/**
 * Hard post-signer-metadata authority boundary.
 *
 * After the user completes signer details and clicks the green CTA, exactly one immutable
 * {@link AuthoritativeSigningSnapshot} is created. Review, decision, and VS01 surfaces must
 * consume only that snapshot until the user explicitly chooses signing preparation.
 */

import type { CanonicalFinalPartyManifest } from "./guidedDealCompletion/canonicalFinalPartyManifest";
import type { CanonicalSignerManifest } from "./guidedDealCompletion/guidedReviewSigningContinuity";
import { fingerprintAgreementBody } from "./guidedDealCompletion/guidedSigningPacketVersion";
import { hashPaidProCorpus } from "./paidProSourceOfTruth";

export type PaidProSigningAuthorityPhase =
  | "SIGNER_METADATA_EDIT"
  | "SIGNER_METADATA_FINALIZED"
  | "SIGNING_PREPARATION_REQUESTED";

export type AuthoritativeSigningSnapshotRecipientMetadata = {
  partySignerNames: readonly string[];
  partySignerTitles: readonly string[];
  recipient1Name: string;
  recipient2Name: string;
  recipient1Email: string;
  recipient2Email: string;
  extraPartyReviewEmails: readonly string[];
};

export type AuthoritativeSigningSnapshot = {
  corpus: string;
  signerMetadata: AuthoritativeSigningSnapshotRecipientMetadata;
  recipientMetadata: AuthoritativeSigningSnapshotRecipientMetadata;
  partyManifest: CanonicalFinalPartyManifest;
  signatureBlockModel: CanonicalSignerManifest;
  source: "paid_pro_signer_metadata_finalize";
  hash: string;
  frozenAt: number;
};

let authoritativeSigningSnapshot: AuthoritativeSigningSnapshot | null = null;
let authorityPhase: PaidProSigningAuthorityPhase = "SIGNER_METADATA_EDIT";

export function getPaidProSigningAuthorityPhase(): PaidProSigningAuthorityPhase {
  return authorityPhase;
}

export function hasAuthoritativeSigningSnapshot(): boolean {
  return Boolean(authoritativeSigningSnapshot?.corpus?.trim());
}

export function getAuthoritativeSigningSnapshot(): AuthoritativeSigningSnapshot | null {
  return authoritativeSigningSnapshot;
}

export function readAuthoritativeSigningCorpus(): string {
  return authoritativeSigningSnapshot?.corpus?.trim() ?? "";
}

export function readAuthoritativeSigningSnapshotHash(): string | null {
  return authoritativeSigningSnapshot?.hash ?? null;
}

/** True after snapshot creation until cleared or signing preparation is explicitly requested. */
export function isPostSignerMetadataFreezeActive(args?: {
  signaturePreparationRequested?: boolean;
}): boolean {
  if (!hasAuthoritativeSigningSnapshot()) return false;
  if (args?.signaturePreparationRequested) return false;
  return true;
}

export function clearAuthoritativeSigningSnapshot(): void {
  authoritativeSigningSnapshot = null;
  authorityPhase = "SIGNER_METADATA_EDIT";
}

export type CreateAuthoritativeSigningSnapshotArgs = {
  corpus: string;
  signerMetadata: AuthoritativeSigningSnapshotRecipientMetadata;
  partyManifest: CanonicalFinalPartyManifest;
  signatureBlockModel: CanonicalSignerManifest;
};

/**
 * Creates exactly one immutable signing snapshot at the signer-metadata-finalized boundary.
 * Subsequent calls return the existing snapshot (idempotent).
 */
export function createAuthoritativeSigningSnapshot(
  args: CreateAuthoritativeSigningSnapshotArgs,
): AuthoritativeSigningSnapshot {
  if (authoritativeSigningSnapshot) {
    logSnapshotConsumed({ reason: "create_called_after_freeze", hash: authoritativeSigningSnapshot.hash });
    return authoritativeSigningSnapshot;
  }
  const corpus = (args.corpus || "").trim();
  const hash = hashPaidProCorpus(corpus);
  const frozenAt = Date.now();
  authoritativeSigningSnapshot = {
    corpus,
    signerMetadata: { ...args.signerMetadata },
    recipientMetadata: { ...args.signerMetadata },
    partyManifest: args.partyManifest,
    signatureBlockModel: args.signatureBlockModel,
    source: "paid_pro_signer_metadata_finalize",
    hash,
    frozenAt,
  };
  authorityPhase = "SIGNER_METADATA_FINALIZED";
  logAuthorityBoundary({
    phase: authorityPhase,
    hash,
    corpusLen: corpus.length,
  });
  logSnapshotCreated({
    hash,
    corpusLen: corpus.length,
    partyCount: args.partyManifest.parties.length,
    frozenAt,
  });
  return authoritativeSigningSnapshot;
}

export function markSigningPreparationRequested(): void {
  if (authorityPhase === "SIGNER_METADATA_FINALIZED" || hasAuthoritativeSigningSnapshot()) {
    authorityPhase = "SIGNING_PREPARATION_REQUESTED";
    logAuthorityBoundary({
      phase: authorityPhase,
      hash: authoritativeSigningSnapshot?.hash ?? null,
      corpusLen: authoritativeSigningSnapshot?.corpus.length ?? 0,
    });
  }
}

export function logAuthorityBoundary(payload: {
  phase: PaidProSigningAuthorityPhase;
  hash: string | null;
  corpusLen: number;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  if (typeof import.meta === "undefined" || !import.meta.env?.DEV) return;
  // eslint-disable-next-line no-console
  console.info("[authority-boundary]", payload);
}

export function logSnapshotCreated(payload: {
  hash: string;
  corpusLen: number;
  partyCount: number;
  frozenAt: number;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  if (typeof import.meta === "undefined" || !import.meta.env?.DEV) return;
  // eslint-disable-next-line no-console
  console.info("[snapshot-created]", payload);
}

export function logSnapshotConsumed(payload: { reason: string; hash: string | null }): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  if (typeof import.meta === "undefined" || !import.meta.env?.DEV) return;
  // eslint-disable-next-line no-console
  console.info("[snapshot-consumed]", payload);
}

export function logIllegalPostFreezeMutation(payload: {
  path: string;
  detail?: string;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  if (typeof import.meta === "undefined" || !import.meta.env?.DEV) return;
  // eslint-disable-next-line no-console
  console.warn("[illegal-postfreeze-mutation]", payload);
}

export function logIllegalPostFreezePreviewFallback(payload: {
  path: string;
  previewLen?: number;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  if (typeof import.meta === "undefined" || !import.meta.env?.DEV) return;
  // eslint-disable-next-line no-console
  console.warn("[illegal-postfreeze-preview-fallback]", payload);
}

export function logIllegalDirectEsignRoute(payload: {
  path: string;
  reason: string;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  if (typeof import.meta === "undefined" || !import.meta.env?.DEV) return;
  // eslint-disable-next-line no-console
  console.warn("[illegal-direct-esign-route]", payload);
}

/** Fingerprint for invariant tests — stable across review → signing when snapshot is authoritative. */
export function fingerprintSigningSnapshot(snapshot: AuthoritativeSigningSnapshot): string {
  const meta = JSON.stringify({
    signerNames: snapshot.signerMetadata.partySignerNames,
    emails: [
      snapshot.signerMetadata.recipient1Email,
      snapshot.signerMetadata.recipient2Email,
      ...snapshot.signerMetadata.extraPartyReviewEmails,
    ],
    titles: snapshot.signerMetadata.partySignerTitles,
    parties: snapshot.partyManifest.parties.map((p) => ({
      name: p.partyName,
      signer: p.signerName,
      email: p.email,
      title: p.signerTitle,
    })),
  });
  return fingerprintAgreementBody(`${snapshot.hash}\n${meta}`);
}

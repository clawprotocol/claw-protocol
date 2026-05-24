/**
 * Single guided Pro → VS01 signing handoff payload.
 * Must be the frozen signer-applied corpus — never stale draft_authoritative / server_full_document_text.
 */

import { fingerprintAgreementBody } from "./guidedSigningPacketVersion";
import type { CanonicalSignerManifest } from "./guidedReviewSigningContinuity";
import type { GuidedSignatureTrackCorpusSource } from "./guidedFinalReviewToSigning";

export type GuidedVs01SigningHandoffSource =
  | "finalized_signer_applied_guided_corpus"
  | "finalized_signing_corpus"
  | "accepted_review"
  | "canonical_working_draft";

export type GuidedVs01SigningHandoff = {
  corpusText: string;
  corpusHash: string;
  source: GuidedVs01SigningHandoffSource;
  signerMetadata: CanonicalSignerManifest | null;
  recipientEmails: string[];
  finalizedAt: string;
  signatureRebuilt?: boolean;
};

export const GUIDED_VS01_HANDOFF_ALLOWED_SOURCES = new Set<GuidedVs01SigningHandoffSource>([
  "finalized_signer_applied_guided_corpus",
  "finalized_signing_corpus",
  "accepted_review",
  "canonical_working_draft",
]);

export const GUIDED_VS01_HANDOFF_BLOCKED_USER_MESSAGE =
  "Final signing version is still being prepared. Please try again.";

export function mapTrackCorpusSourceToHandoffSource(
  source: GuidedSignatureTrackCorpusSource,
): GuidedVs01SigningHandoffSource {
  if (source === "finalized_signing_corpus") return "finalized_signing_corpus";
  if (source === "accepted_review") return "accepted_review";
  return "finalized_signer_applied_guided_corpus";
}

export function buildGuidedVs01SigningHandoff(args: {
  corpusText: string;
  source: GuidedSignatureTrackCorpusSource | GuidedVs01SigningHandoffSource;
  signerMetadata?: CanonicalSignerManifest | null;
  recipientEmails?: readonly string[];
  signatureRebuilt?: boolean;
  finalizedAt?: string;
}): GuidedVs01SigningHandoff {
  const corpusText = (args.corpusText || "").trim();
  const source =
    args.source === "finalized_signing_corpus" ||
    args.source === "accepted_review" ||
    args.source === "canonical_working_draft" ||
    args.source === "finalized_signer_applied_guided_corpus"
      ? args.source
      : mapTrackCorpusSourceToHandoffSource(args.source);
  return {
    corpusText,
    corpusHash: fingerprintAgreementBody(corpusText),
    source,
    signerMetadata: args.signerMetadata ?? null,
    recipientEmails: [...(args.recipientEmails ?? [])].map((e) => e.trim()).filter(Boolean),
    finalizedAt: args.finalizedAt ?? new Date().toISOString(),
    signatureRebuilt: Boolean(args.signatureRebuilt),
  };
}

export function logGuidedVs01SigningHandoff(payload: GuidedVs01SigningHandoff): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[guided-vs01-signing-handoff]", {
    source: payload.source,
    len: payload.corpusText.length,
    hash: payload.corpusHash,
    signatureRebuilt: payload.signatureRebuilt ?? false,
    recipientCount: payload.recipientEmails.length,
    finalizedAt: payload.finalizedAt,
  });
}

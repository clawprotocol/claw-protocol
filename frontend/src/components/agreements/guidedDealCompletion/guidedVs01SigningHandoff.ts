/**
 * Single guided Pro → VS01 signing handoff payload.
 * Must be the frozen signer-applied corpus — never stale draft_authoritative / server_full_document_text.
 */

import { fingerprintAgreementBody } from "./guidedSigningPacketVersion";
import { GUIDED_FINAL_REVIEW_MIN_CORPUS_LEN } from "../simpleProFinalReviewCorpus";
import type { CanonicalSignerManifest } from "./guidedReviewSigningContinuity";
import type { GuidedSignatureTrackCorpusSource } from "./guidedFinalReviewToSigning";
import {
  corpusHasVisibleSignatureExecutionLines,
  corpusSignatureBlocksHaveRequiredByLines,
} from "./signatureRegion";

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

export const GUIDED_PRO_VS01_BRIDGE_MIN_CORPUS_LEN = 1500;

export type GuidedProVs01BridgeCorpusAssert = {
  ok: boolean;
  reason?: string;
  diagnostics: Record<string, unknown>;
};

/** Hard gate before VS01 bridge persistence — block with diagnostics, not empty witness rebuild. */
export function assertGuidedProVs01BridgeCorpusReady(
  handoff: GuidedVs01SigningHandoff | null | undefined,
): GuidedProVs01BridgeCorpusAssert {
  const corpusText = (handoff?.corpusText ?? "").trim();
  const source = handoff?.source ?? "none";
  const diagnostics: Record<string, unknown> = {
    bodyLen: corpusText.length,
    source,
    hash: handoff?.corpusHash ?? null,
    signatureRebuilt: handoff?.signatureRebuilt ?? false,
  };
  if (corpusText.length < GUIDED_PRO_VS01_BRIDGE_MIN_CORPUS_LEN) {
    return { ok: false, reason: "corpus_too_short", diagnostics };
  }
  if (source !== "finalized_signer_applied_guided_corpus") {
    return { ok: false, reason: "corpus_source_not_finalized_signer_applied", diagnostics };
  }
  if (!/\bIN WITNESS WHEREOF\b/i.test(corpusText)) {
    return { ok: false, reason: "missing_witness_block", diagnostics };
  }
  if (!/\b(?:By|Signature)\s*:\s*_{2,}/im.test(corpusText)) {
    return { ok: false, reason: "missing_by_or_signature_lines", diagnostics };
  }
  if (!corpusHasVisibleSignatureExecutionLines(corpusText)) {
    return { ok: false, reason: "missing_visible_signature_execution", diagnostics };
  }
  if (!corpusSignatureBlocksHaveRequiredByLines(corpusText, 2)) {
    return { ok: false, reason: "missing_required_by_lines", diagnostics };
  }
  if (corpusText.length < GUIDED_FINAL_REVIEW_MIN_CORPUS_LEN) {
    return { ok: false, reason: "below_guided_final_review_min", diagnostics };
  }
  return { ok: true, diagnostics };
}

export function logGuidedProVs01BridgeCorpusBlocked(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.warn("[guided-pro-vs01-bridge-corpus-blocked]", payload);
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

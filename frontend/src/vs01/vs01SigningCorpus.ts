/**
 * VS01 signing packet: authoritative corpus gate, witness-block repair, and seed gating.
 */

import type { AgreementDraft } from "../agreement/agreementTypes";
import type { AgreementVs01BridgeSession } from "../launch/simpleProduct/agreementToVs01SigningBridge";
import {
  pickAuthoritativePlainForSendHandoff,
  SEND_HANDOFF_AUTHORITATIVE_MIN_LEN,
} from "../components/agreements/sendHandoffAuthoritativeCorpus";
import { GUIDED_FINAL_REVIEW_MIN_CORPUS_LEN } from "../components/agreements/simpleProFinalReviewCorpus";
import { stripStaleExecutionPlacementCorpusCopy } from "../components/agreements/guidedDealCompletion/guidedCorpusLineRepairs";
import {
  corpusHasVisibleSignatureExecutionLines,
  corpusSignatureBlocksHaveRequiredByLines,
} from "../components/agreements/guidedDealCompletion/signatureRegion";
import {
  isIndividualPartyName,
  rebuildSignatureBlocksWithPartyIdentities,
  type CanonicalPartyIdentity,
} from "../components/agreements/guidedDealCompletion/signerPartyIdentity";
import { fingerprintAgreementBody } from "../components/agreements/guidedDealCompletion/guidedSigningPacketVersion";
import type { GuidedVs01SigningHandoff } from "../components/agreements/guidedDealCompletion/guidedVs01SigningHandoff";
import {
  GUIDED_VS01_HANDOFF_ALLOWED_SOURCES,
  GUIDED_VS01_HANDOFF_BLOCKED_USER_MESSAGE,
} from "../components/agreements/guidedDealCompletion/guidedVs01SigningHandoff";

export const VS01_SIGNING_CORPUS_MIN_LEN = GUIDED_FINAL_REVIEW_MIN_CORPUS_LEN;
/** Preferred final guided Pro corpus length (test59 / full premium snapshot). */
export const VS01_CORPUS_PREFERRED_MIN_LEN = 2500;
/** Short preview / starter bodies must never drive guided Pro VS01 seeding. */
export const VS01_SIGNING_CORPUS_MAX_PREVIEW_LEN = 1200;
/** Reserved initials band at PDF/page layout (px). */
export const VS01_INITIALS_RESERVED_BAND_MIN_PX = 220;

export const VS01_CORPUS_GATE_USER_MESSAGE =
  "Preparing the final agreement for signing. Please wait a moment.";

export { GUIDED_VS01_HANDOFF_BLOCKED_USER_MESSAGE } from "../components/agreements/guidedDealCompletion/guidedVs01SigningHandoff";

export const VS01_BLOCKED_PREVIEW_SOURCES = new Set([
  "rendered_preview",
  "live_generated_preview",
  "starter_fallback",
  "rendered_preview_fallback",
]);

export type FinalVs01CorpusSource =
  | "handoff_corpus"
  | "finalized_signer_applied_guided_corpus"
  | "premium_pipeline"
  | "hydrated_premium"
  | "draft_authoritative"
  | "last_known_good"
  | "finalized_signing"
  | "accepted_review"
  | "canonical_working_draft"
  | "rebuilt_witness_block"
  | "blocked_short_preview";

/** @deprecated Use FinalVs01CorpusSource */
export type Vs01SigningCorpusSource = FinalVs01CorpusSource;

export type FinalVs01CorpusResolution = {
  corpus: string;
  source: FinalVs01CorpusSource;
  len: number;
  hash: string;
  matchesFreeHash: boolean;
  /** @deprecated Use matchesFreeHash */
  isFreeHashMatch: boolean;
  hasWitnessBlock: boolean;
  hasBySignatureLines: boolean;
  /** @deprecated Use hasBySignatureLines */
  hasByOrSignatureLines: boolean;
  signerCount: number;
  allowed: boolean;
  blockReason?: string;
  premiumInProgress: boolean;
  premiumComplete: boolean;
  userMessage?: string;
};

/** @deprecated Use FinalVs01CorpusResolution */
export type Vs01SigningCorpusResolution = FinalVs01CorpusResolution;

function shouldLogVs01Corpus(): boolean {
  return typeof import.meta === "undefined" || import.meta.env?.MODE !== "test";
}

export function logVs01CorpusGate(payload: Record<string, unknown>): void {
  if (!shouldLogVs01Corpus()) return;
  // eslint-disable-next-line no-console
  console.info("[vs01-corpus-gate]", payload);
}

export function logVs01CorpusGateBlocked(payload: Record<string, unknown>): void {
  if (!shouldLogVs01Corpus()) return;
  // eslint-disable-next-line no-console
  console.warn("[vs01-corpus-gate-blocked]", payload);
}

export function logVs01CorpusGateRebuiltWitness(payload: Record<string, unknown>): void {
  if (!shouldLogVs01Corpus()) return;
  // eslint-disable-next-line no-console
  console.info("[vs01-corpus-gate-rebuilt-witness]", payload);
}

export function logVs01CorpusGateSelectedFinal(payload: Record<string, unknown>): void {
  if (!shouldLogVs01Corpus()) return;
  // eslint-disable-next-line no-console
  console.info("[vs01-corpus-gate-selected-final]", payload);
}

/** @deprecated */
export function logVs01SigningCorpusSource(payload: Record<string, unknown>): void {
  logVs01CorpusGate({ ...payload, legacyTag: "vs01-signing-corpus-source" });
}

/** @deprecated */
export function logVs01SigningCorpusRebuilt(payload: Record<string, unknown>): void {
  logVs01CorpusGateRebuiltWitness(payload);
}

/** @deprecated */
export function logVs01SigningCorpusBlocked(payload: Record<string, unknown>): void {
  logVs01CorpusGateBlocked(payload);
}

export function pickDraftSigningCorpusPlain(draft: AgreementDraft | null | undefined): string {
  return pickAuthoritativePlainForSendHandoff(draft)?.text ?? "";
}

export function identitiesFromBridgeSession(bridge: AgreementVs01BridgeSession): CanonicalPartyIdentity[] {
  const out: CanonicalPartyIdentity[] = [
    {
      index: 0,
      partyDisplayName: bridge.creatorName.trim() || "Client",
      email: bridge.creatorEmail.trim(),
      representativeName: bridge.creatorSignerName?.trim() || null,
      title: bridge.creatorSignerTitle?.trim() || null,
      blockHeading: "CLIENT",
      isIndividual: isIndividualPartyName(bridge.creatorName),
    },
  ];
  for (const [i, cp] of bridge.counterparties.entries()) {
    const name = cp.name.trim() || `Party ${i + 2}`;
    out.push({
      index: i + 1,
      partyDisplayName: name,
      email: cp.email.trim(),
      representativeName: cp.signerName?.trim() || null,
      title: cp.signerTitle?.trim() || null,
      blockHeading: i === 0 ? "SERVICE PROVIDER" : `PARTY ${i + 2}`,
      isIndividual: isIndividualPartyName(name),
    });
  }
  return out;
}

export function ensureVs01SigningCorpusWitnessBlock(args: {
  corpus: string;
  bridge: AgreementVs01BridgeSession | null;
  signerCount: number;
}): { corpus: string; rebuilt: boolean; beforeLen: number; afterLen: number } {
  const beforeLen = args.corpus.trim().length;
  let out = stripStaleExecutionPlacementCorpusCopy(args.corpus.trim()).text;
  const signerCount = Math.max(1, args.signerCount);
  if (
    beforeLen >= VS01_SIGNING_CORPUS_MIN_LEN &&
    corpusHasVisibleSignatureExecutionLines(out) &&
    corpusSignatureBlocksHaveRequiredByLines(out, signerCount)
  ) {
    return { corpus: out, rebuilt: false, beforeLen, afterLen: out.length };
  }
  if (
    args.bridge &&
    signerCount >= 2 &&
    !corpusSignatureBlocksHaveRequiredByLines(out, signerCount)
  ) {
    const identities = identitiesFromBridgeSession(args.bridge);
    if (identities.length >= 2) {
      const rebuilt = rebuildSignatureBlocksWithPartyIdentities(out, identities);
      out = stripStaleExecutionPlacementCorpusCopy(rebuilt.text).text;
      return {
        corpus: out,
        rebuilt: true,
        beforeLen,
        afterLen: out.length,
      };
    }
  }
  return { corpus: out, rebuilt: false, beforeLen, afterLen: out.length };
}

export type ResolveFinalVs01CorpusOrBlockArgs = {
  agreementCorpusText?: string | null;
  /** Frozen guided Pro handoff — wins over draft_authoritative / server_full_document_text. */
  guidedSigningHandoff?: GuidedVs01SigningHandoff | null;
  draft?: AgreementDraft | null;
  bridge?: AgreementVs01BridgeSession | null;
  guidedPro?: boolean;
  freeBaselinePlain?: string | null;
  premiumPipelinePlain?: string | null;
  hydratedPremiumPlain?: string | null;
  lastKnownGoodPlain?: string | null;
  finalizedSigningPlain?: string | null;
  acceptedReviewPlain?: string | null;
  renderedPreviewPlain?: string | null;
  renderedPreviewSource?: string | null;
  premiumInProgress?: boolean;
  premiumComplete?: boolean;
  signatureRebuilt?: boolean;
};

function mapHandoffSourceToFinalSource(
  source: GuidedVs01SigningHandoff["source"],
): FinalVs01CorpusSource {
  switch (source) {
    case "finalized_signer_applied_guided_corpus":
      return "finalized_signer_applied_guided_corpus";
    case "canonical_working_draft":
      return "canonical_working_draft";
    case "accepted_review":
      return "accepted_review";
    default:
      return "finalized_signing";
  }
}

function buildCorpusGateBlockedLogPayload(args: {
  resolution: Pick<
    FinalVs01CorpusResolution,
    "allowed" | "source" | "len" | "hash" | "hasWitnessBlock" | "hasBySignatureLines" | "blockReason"
  >;
  guidedSigningHandoff?: GuidedVs01SigningHandoff | null;
  draftPlain?: string;
  expectedHash?: string;
  signatureRebuilt?: boolean;
}): Record<string, unknown> {
  const handoff = args.guidedSigningHandoff;
  const draftPlain = (args.draftPlain ?? "").trim();
  const staleAuthoritativeSource =
    handoff &&
    draftPlain.length > 0 &&
    handoff.corpusHash !== fingerprintAgreementBody(draftPlain) &&
    draftPlain.length > handoff.corpusText.length
      ? "draft_authoritative"
      : null;
  return {
    allowed: args.resolution.allowed,
    source: args.resolution.source,
    len: args.resolution.len,
    hash: args.resolution.hash,
    missingWitnessBlock: !args.resolution.hasWitnessBlock,
    missingByOrSignatureLines: !args.resolution.hasBySignatureLines,
    hasFinalizedGuidedHash: Boolean(handoff?.corpusHash),
    expectedHash: args.expectedHash ?? handoff?.corpusHash ?? null,
    actualHash: args.resolution.hash,
    staleAuthoritativeSource,
    reason: args.resolution.blockReason ?? null,
    signatureRebuilt: args.signatureRebuilt ?? handoff?.signatureRebuilt ?? false,
  };
}

type CorpusCandidate = { text: string; source: FinalVs01CorpusSource };

/**
 * Single authoritative VS01 corpus resolver for paid/guided Pro signing.
 * Never selects rendered_preview / free-hash / short preview when final premium corpus exists.
 */
export function resolveFinalVs01CorpusOrBlock(
  args: ResolveFinalVs01CorpusOrBlockArgs,
): FinalVs01CorpusResolution {
  const guidedPro = args.guidedPro !== false;
  const premiumInProgress = Boolean(args.premiumInProgress);
  const premiumComplete = Boolean(args.premiumComplete);
  const signerCount = Math.max(
    2,
    1 + (args.bridge?.counterparties?.length ?? args.draft?.parties?.length ?? 1),
  );

  const handoff = args.guidedSigningHandoff;
  const handoffTrusted =
    handoff &&
    GUIDED_VS01_HANDOFF_ALLOWED_SOURCES.has(handoff.source) &&
    handoff.corpusText.trim().length >= VS01_SIGNING_CORPUS_MIN_LEN;

  const draftPlain = pickDraftSigningCorpusPlain(args.draft ?? null);
  const previewSource = (args.renderedPreviewSource ?? "rendered_preview").trim();
  const previewPlain = (args.renderedPreviewPlain ?? "").trim();
  const candidates: CorpusCandidate[] = [];
  const push = (text: string | null | undefined, source: FinalVs01CorpusSource) => {
    const t = (text ?? "").trim();
    if (t.length > 0) candidates.push({ text: t, source });
  };

  let best: CorpusCandidate = { text: "", source: "blocked_short_preview" };

  if (handoffTrusted) {
    best = {
      text: handoff!.corpusText.trim(),
      source: mapHandoffSourceToFinalSource(handoff!.source),
    };
  } else {
    push(args.agreementCorpusText, "handoff_corpus");
    push(args.premiumPipelinePlain, "premium_pipeline");
    push(args.hydratedPremiumPlain, "hydrated_premium");
    if (!guidedPro) {
      push(draftPlain, "draft_authoritative");
    }
    push(args.lastKnownGoodPlain, "last_known_good");
    push(args.finalizedSigningPlain, "finalized_signing");
    push(args.acceptedReviewPlain, "accepted_review");

    if (previewPlain.length > 0 && !guidedPro) {
      push(previewPlain, "handoff_corpus");
    }

    if (guidedPro) {
      const handoffPlain = (args.agreementCorpusText ?? "").trim();
      if (handoffPlain.length >= VS01_SIGNING_CORPUS_MIN_LEN) {
        push(handoffPlain, "handoff_corpus");
      }
      push(args.finalizedSigningPlain, "finalized_signing");
      push(args.acceptedReviewPlain, "accepted_review");
      push(args.premiumPipelinePlain, "premium_pipeline");
      push(args.hydratedPremiumPlain, "hydrated_premium");
      push(args.lastKnownGoodPlain, "last_known_good");
    }

    const sorted = [...candidates].sort((a, b) => {
      const priority = (source: FinalVs01CorpusSource): number => {
        if (source === "handoff_corpus") return 0;
        if (source === "finalized_signer_applied_guided_corpus") return 1;
        if (source === "finalized_signing") return 2;
        if (source === "accepted_review") return 3;
        if (source === "canonical_working_draft") return 4;
        if (source === "premium_pipeline" || source === "hydrated_premium") return 5;
        if (source === "draft_authoritative") return 9;
        return 6;
      };
      const byPriority = priority(a.source) - priority(b.source);
      if (byPriority !== 0) return byPriority;
      return b.text.length - a.text.length;
    });
    best = sorted[0] ?? best;

    if (
      guidedPro &&
      best.text.length > 0 &&
      best.text.length <= VS01_SIGNING_CORPUS_MAX_PREVIEW_LEN
    ) {
      const longer = candidates.find((c) => c.text.length >= VS01_SIGNING_CORPUS_MIN_LEN);
      if (longer) best = longer;
    }
  }

  const witness = ensureVs01SigningCorpusWitnessBlock({
    corpus: best.text,
    bridge: handoffTrusted ? null : args.bridge ?? null,
    signerCount,
  });
  const corpus = witness.corpus;
  let source: FinalVs01CorpusSource = witness.rebuilt ? "rebuilt_witness_block" : best.source;
  if (witness.rebuilt) {
    logVs01CorpusGateRebuiltWitness({
      reason: "missing_witness_or_by_lines",
      beforeLen: witness.beforeLen,
      afterLen: witness.afterLen,
      hasWitnessBlock: corpusHasVisibleSignatureExecutionLines(corpus),
      handoffTrusted,
    });
  }

  const hash = fingerprintAgreementBody(corpus);
  const freeHash = (args.freeBaselinePlain ?? "").trim()
    ? fingerprintAgreementBody(args.freeBaselinePlain!)
    : "";
  const matchesFreeHash = Boolean(freeHash && hash === freeHash);
  const hasWitnessBlock = corpusHasVisibleSignatureExecutionLines(corpus);
  const hasBySignatureLines = corpusSignatureBlocksHaveRequiredByLines(corpus, signerCount);

  const previewRejected =
    guidedPro &&
    previewPlain.length > 0 &&
    (VS01_BLOCKED_PREVIEW_SOURCES.has(previewSource) ||
      previewSource === "live_generated_preview") &&
    corpus.length > 0 &&
    previewPlain.length >= corpus.length * 0.95 &&
    previewPlain.length <= VS01_SIGNING_CORPUS_MAX_PREVIEW_LEN;

  let allowed = false;
  let blockReason: string | undefined;
  if (premiumInProgress) {
    blockReason = "premium_corpus_in_progress";
  } else if (!corpus.trim()) {
    blockReason = "empty_corpus";
  } else if (guidedPro && corpus.length < VS01_SIGNING_CORPUS_MIN_LEN) {
    blockReason = "corpus_too_short_for_guided_pro";
  } else if (guidedPro && matchesFreeHash) {
    blockReason = "free_basic_hash_match";
  } else if (guidedPro && previewRejected) {
    blockReason = "rendered_preview_stale";
  } else if (!hasWitnessBlock) {
    blockReason = "missing_witness_block";
  } else if (!hasBySignatureLines) {
    blockReason = "missing_by_or_signature_lines";
  } else if (guidedPro && handoffTrusted && witness.rebuilt) {
    blockReason = "finalized_corpus_witness_rebuild_rejected";
  } else if (guidedPro && handoffTrusted && source === "rebuilt_witness_block") {
    blockReason = "finalized_corpus_replaced_by_witness_rebuild";
  } else if (!guidedPro && corpus.length < SEND_HANDOFF_AUTHORITATIVE_MIN_LEN) {
    blockReason = "corpus_below_send_handoff_min";
  } else {
    allowed = true;
  }

  const resolution: FinalVs01CorpusResolution = {
    corpus,
    source,
    len: corpus.length,
    hash,
    matchesFreeHash,
    isFreeHashMatch: matchesFreeHash,
    hasWitnessBlock,
    hasBySignatureLines,
    hasByOrSignatureLines: hasBySignatureLines,
    signerCount,
    allowed,
    blockReason,
    premiumInProgress,
    premiumComplete,
    userMessage: allowed
      ? undefined
      : handoffTrusted
        ? GUIDED_VS01_HANDOFF_BLOCKED_USER_MESSAGE
        : VS01_CORPUS_GATE_USER_MESSAGE,
  };

  const gatePayload = buildCorpusGateBlockedLogPayload({
    resolution,
    guidedSigningHandoff: handoff ?? null,
    draftPlain,
    expectedHash: handoff?.corpusHash,
    signatureRebuilt: args.signatureRebuilt ?? handoff?.signatureRebuilt,
  });

  if (allowed) {
    logVs01CorpusGate(gatePayload);
    logVs01CorpusGateSelectedFinal({
      ...gatePayload,
      preferredLenMet: resolution.len >= VS01_CORPUS_PREFERRED_MIN_LEN,
    });
  } else {
    logVs01CorpusGateBlocked(gatePayload);
  }

  return resolution;
}

/** Bridge / VS01 handoff entry — delegates to {@link resolveFinalVs01CorpusOrBlock}. */
export function resolveVs01SigningCorpusForHandoff(
  args: ResolveFinalVs01CorpusOrBlockArgs,
): FinalVs01CorpusResolution {
  return resolveFinalVs01CorpusOrBlock(args);
}

export function isVs01CorpusGateReadyForSigning(
  resolution: Pick<FinalVs01CorpusResolution, "allowed" | "len" | "premiumInProgress">,
): boolean {
  return resolution.allowed && !resolution.premiumInProgress && resolution.len >= VS01_SIGNING_CORPUS_MIN_LEN;
}

/** Longest paid Pro corpus candidate; skips free-hash bodies under final-review min length. */
export function pickBestPaidProAuthoritativeCorpusPlain(
  candidates: readonly (string | null | undefined)[],
  freeBaselinePlain?: string | null,
): string {
  const freeHash = (freeBaselinePlain ?? "").trim()
    ? fingerprintAgreementBody(freeBaselinePlain!)
    : "";
  let best = "";
  for (const raw of candidates) {
    const t = (raw ?? "").trim();
    if (!t) continue;
    if (freeHash && fingerprintAgreementBody(t) === freeHash && t.length < VS01_SIGNING_CORPUS_MIN_LEN) {
      continue;
    }
    if (t.length > best.length) best = t;
  }
  return best;
}

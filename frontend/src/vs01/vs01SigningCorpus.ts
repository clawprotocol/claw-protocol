/**
 * VS01 signing packet: authoritative corpus gate, witness-block repair, and seed gating.
 */

import type { AgreementDraft } from "../agreement/agreementTypes";
import type { AgreementVs01BridgeSession } from "../launch/simpleProduct/agreementToVs01SigningBridge";
import { SEND_HANDOFF_AUTHORITATIVE_MIN_LEN } from "../components/agreements/paidProAuthorityConstants";
import { pickAuthoritativePlainForSendHandoff } from "../components/agreements/sendHandoffAuthoritativeCorpus";
import { GUIDED_FINAL_REVIEW_MIN_CORPUS_LEN } from "../components/agreements/simpleProFinalReviewCorpus";
import { stripStaleExecutionPlacementCorpusCopy } from "../components/agreements/guidedDealCompletion/guidedCorpusLineRepairs";
import {
  corpusHasWitnessBlock,
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
import { applyProCorpusIntegrity } from "../components/agreements/proCorpusIntegrity";
import {
  AUTHORITATIVE_BODY_PRESERVE_DOWNGRADE_RATIO,
  pickAuthoritativeSigningHandoffCorpus,
} from "../components/agreements/authoritativeHandoffCorpusResolver";
import { resolvePremiumSignaturePreviewMode } from "../components/agreements/premiumAgreementDocumentHtml";
import { consumeAuthoritativeSignerCount } from "../components/agreements/signerCountAuthority";
import { readConsumedPaidProSignerMetadataAuthority } from "../components/agreements/paidProSignerMetadataAuthority";
import {
  getAcceptedPremiumCanonicalCorpus,
  getAcceptedPremiumCorpusForVs01Signing,
} from "../components/agreements/acceptedPremiumCanonicalCorpus";
import { readCanonicalAgreementCorpusForSurface } from "../components/agreements/canonicalAgreementSnapshot";
import { getAuthoritativeSigningSnapshot } from "../components/agreements/authoritativeSigningSnapshot";
import { getPaidProDocumentForSurface } from "../components/agreements/paidProSourceOfTruth";
import { requireAuthoritativeCorpusForSurface } from "../components/agreements/authoritativeAgreementDocument";
import { logLawdogOutputPathMap } from "../components/agreements/lawdogOutputPathMap";
import {
  resolvePaidProVs01CheckPhase,
  shouldRunPaidProVs01CorpusChecks,
  type PaidProVs01CheckPhase,
} from "../components/agreements/paidProVs01PhaseGuard";

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
  | "paidProSourceOfTruth"
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
  requiresSignatureBlock: boolean;
  requiresWitness: boolean;
  witnessReason: string | null;
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
  /** Accepted paid Pro snapshot — wins over short handoff/starter when materially longer. */
  acceptedAuthoritativePlain?: string | null;
  premiumAccepted?: boolean;
  premiumPipelineRenderSource?: string | null;
  intakeText?: string | null;
  /** When true, decorative HTML signature cards satisfy witness gate for long accepted Pro bodies. */
  allowDecorativeEsignCardMode?: boolean;
  /** Override phase for tests; otherwise derived from premium/signing state. */
  vs01CheckPhase?: PaidProVs01CheckPhase;
  signaturePreparationRequested?: boolean;
  prepareSignatureLinksRequested?: boolean;
};

export type Vs01WitnessRequirement = {
  requiresWitness: boolean;
  witnessReason: string | null;
};

function resolveVs01AuthoritativeSignerCount(
  args: ResolveFinalVs01CorpusOrBlockArgs,
  corpusPlain?: string | null,
): number {
  const consumerCount = Math.max(
    args.draft?.parties?.length ?? 0,
    args.bridge?.counterparties?.length ?? 0,
  );
  const manifestPartyCount =
    readConsumedPaidProSignerMetadataAuthority()?.parties?.filter(
      (p) => String(p.partyLegalName ?? "").trim().length >= 2,
    ).length ?? 0;
  return consumeAuthoritativeSignerCount(
    "vs01_corpus_gate",
    {
      intakeText: args.intakeText,
      draftParties: args.draft?.parties,
      corpusPlain,
      manifestPartyCount,
    },
    Math.max(consumerCount, manifestPartyCount),
  );
}

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
    | "allowed"
    | "source"
    | "len"
    | "hash"
    | "hasWitnessBlock"
    | "hasBySignatureLines"
    | "requiresSignatureBlock"
    | "requiresWitness"
    | "witnessReason"
    | "blockReason"
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
    missingWitnessBlock: args.resolution.requiresWitness && !args.resolution.hasWitnessBlock,
    requiresSignatureBlock: args.resolution.requiresSignatureBlock,
    requiresWitness: args.resolution.requiresWitness,
    witnessReason: args.resolution.witnessReason,
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

export function resolveVs01WitnessRequirement(args: {
  corpusText?: string | null;
  intakeText?: string | null;
  draft?: AgreementDraft | null;
}): Vs01WitnessRequirement {
  const text = `${args.intakeText ?? ""}\n${args.corpusText ?? ""}`.toLowerCase();
  if (/\b(?:must|shall|required|requires?|need(?:s|ed)?)\s+(?:be\s+)?(?:witnessed|notari[sz]ed)\b/.test(text)) {
    return { requiresWitness: true, witnessReason: "explicit_witness_or_notary_requirement" };
  }
  if (/\b(?:witness|notary|notari[sz]ation)\s+(?:is\s+)?(?:required|needed|mandatory)\b/.test(text)) {
    return { requiresWitness: true, witnessReason: "explicit_witness_or_notary_requirement" };
  }
  const family = String((args.draft as { agreement_family?: string | null } | null)?.agreement_family ?? "").toLowerCase();
  if (/\b(deed|will|power_of_attorney|power-of-attorney)\b/.test(family)) {
    return { requiresWitness: true, witnessReason: `agreement_family:${family}` };
  }
  return { requiresWitness: false, witnessReason: null };
}

function logVs01Eligibility(payload: {
  requiresSignatureBlock: boolean;
  requiresWitness: boolean;
  witnessReason: string | null;
  allowed: boolean;
}): void {
  if (!shouldLogVs01Corpus()) return;
  // eslint-disable-next-line no-console
  console.info("[vs01-eligibility]", payload);
}

/**
 * Single authoritative VS01 corpus resolver for paid/guided Pro signing.
 * Never selects rendered_preview / free-hash / short preview when final premium corpus exists.
 */
/** Explicit prepare-signature corpus (unit tests / VS01 model) — do not defer gate when anchors are present. */
function resolveExplicitVs01AgreementCorpus(
  args: ResolveFinalVs01CorpusOrBlockArgs,
  signerCount: number,
  premiumInProgress: boolean,
  premiumComplete: boolean,
): FinalVs01CorpusResolution | null {
  const corpus = (args.agreementCorpusText ?? "").replace(/\r\n/g, "\n").trim();
  if (corpus.length < VS01_SIGNING_CORPUS_MIN_LEN) return null;

  const witnessRequirement = resolveVs01WitnessRequirement({
    corpusText: corpus,
    intakeText: args.intakeText,
    draft: args.draft ?? null,
  });
  const hasWitnessBlock = corpusHasWitnessBlock(corpus);
  const hasSignatureBlock = corpusHasVisibleSignatureExecutionLines(corpus);
  const hasBySignatureLines = corpusSignatureBlocksHaveRequiredByLines(corpus, signerCount);
  if (
    !hasSignatureBlock ||
    (witnessRequirement.requiresWitness && !hasWitnessBlock) ||
    !hasBySignatureLines
  ) {
    return null;
  }

  const hash = fingerprintAgreementBody(corpus);
  const allowed = !premiumInProgress;
  return {
    corpus,
    source: "handoff_corpus",
    len: corpus.length,
    hash,
    matchesFreeHash: false,
    isFreeHashMatch: false,
    hasWitnessBlock,
    requiresSignatureBlock: true,
    requiresWitness: witnessRequirement.requiresWitness,
    witnessReason: witnessRequirement.witnessReason,
    hasBySignatureLines,
    hasByOrSignatureLines: hasBySignatureLines,
    signerCount,
    allowed,
    blockReason: allowed ? undefined : "premium_corpus_in_progress",
    premiumInProgress,
    premiumComplete,
    userMessage: allowed ? undefined : VS01_CORPUS_GATE_USER_MESSAGE,
  };
}

function buildDeferredVs01Resolution(args: {
  premiumInProgress: boolean;
  premiumComplete: boolean;
  signerCount: number;
  blockReason: string;
}): FinalVs01CorpusResolution {
  return {
    corpus: "",
    source: "paidProSourceOfTruth",
    len: 0,
    hash: "",
    matchesFreeHash: false,
    isFreeHashMatch: false,
    hasWitnessBlock: false,
    requiresSignatureBlock: true,
    requiresWitness: false,
    witnessReason: null,
    hasBySignatureLines: false,
    hasByOrSignatureLines: false,
    signerCount: args.signerCount,
    allowed: false,
    blockReason: args.blockReason,
    premiumInProgress: args.premiumInProgress,
    premiumComplete: args.premiumComplete,
  };
}

export function resolveFinalVs01CorpusOrBlock(
  args: ResolveFinalVs01CorpusOrBlockArgs,
): FinalVs01CorpusResolution {
  const guidedPro = args.guidedPro !== false;
  const premiumInProgress = Boolean(args.premiumInProgress);
  const premiumComplete = Boolean(args.premiumComplete);
  const signerCount = resolveVs01AuthoritativeSignerCount(
    args,
    args.finalizedSigningPlain ?? args.acceptedReviewPlain ?? args.agreementCorpusText,
  );
  const signingSnapshot = getAuthoritativeSigningSnapshot();
  const handoffCorpusLen = (args.guidedSigningHandoff?.corpusText ?? "").trim().length;
  const vs01Phase =
    args.vs01CheckPhase ??
    resolvePaidProVs01CheckPhase({
      premiumCorpusInProgress: premiumInProgress,
      paidProAuthoritative: guidedPro && Boolean(args.premiumAccepted || args.acceptedAuthoritativePlain?.trim()),
      hasAuthoritativeSigningSnapshot: Boolean(signingSnapshot?.corpus?.trim()),
      guidedSigningHandoffActive: handoffCorpusLen >= GUIDED_FINAL_REVIEW_MIN_CORPUS_LEN,
      signaturePreparationRequested: args.signaturePreparationRequested,
      prepareSignatureLinksRequested: args.prepareSignatureLinksRequested,
    });
  if (!shouldRunPaidProVs01CorpusChecks(vs01Phase)) {
    const explicit = resolveExplicitVs01AgreementCorpus(
      args,
      signerCount,
      premiumInProgress,
      premiumComplete,
    );
    if (explicit) {
      logVs01CorpusGateSelectedFinal({
        source: explicit.source,
        len: explicit.len,
        hash: explicit.hash,
        allowed: explicit.allowed,
        skippedRebuild: true,
        skippedIntegrityRepair: true,
      });
      return explicit;
    }
    return buildDeferredVs01Resolution({
      premiumInProgress,
      premiumComplete,
      signerCount,
      blockReason: `vs01_checks_deferred:${vs01Phase}`,
    });
  }
  const snapshotCorpus = signingSnapshot?.corpus?.trim() ?? "";
  if (guidedPro && snapshotCorpus.length >= VS01_SIGNING_CORPUS_MIN_LEN) {
    const hash = fingerprintAgreementBody(snapshotCorpus);
    const witnessRequirement = resolveVs01WitnessRequirement({
      corpusText: snapshotCorpus,
      intakeText: args.intakeText,
      draft: args.draft ?? null,
    });
    const hasWitnessBlock = corpusHasWitnessBlock(snapshotCorpus);
    const hasSignatureBlock = corpusHasVisibleSignatureExecutionLines(snapshotCorpus);
    const hasBySignatureLines = corpusSignatureBlocksHaveRequiredByLines(snapshotCorpus, signerCount);
    const allowed =
      !premiumInProgress &&
      hasSignatureBlock &&
      (!witnessRequirement.requiresWitness || hasWitnessBlock) &&
      hasBySignatureLines;
    return {
      corpus: snapshotCorpus,
      source: "finalized_signing",
      len: snapshotCorpus.length,
      hash,
      matchesFreeHash: false,
      isFreeHashMatch: false,
      hasWitnessBlock,
      requiresSignatureBlock: true,
      requiresWitness: witnessRequirement.requiresWitness,
      witnessReason: witnessRequirement.witnessReason,
      hasBySignatureLines,
      hasByOrSignatureLines: hasBySignatureLines,
      signerCount,
      allowed,
      blockReason: allowed ? undefined : "authoritative_signing_snapshot_not_ready",
      premiumInProgress,
      premiumComplete,
      userMessage: allowed ? undefined : VS01_CORPUS_GATE_USER_MESSAGE,
    };
  }

  const canonical = guidedPro
    ? readCanonicalAgreementCorpusForSurface("vs01", { tier: "pro" })
    : readCanonicalAgreementCorpusForSurface("vs01");
  if (canonical) {
    const corpus = canonical.canonicalText;
    const witnessRequirement = resolveVs01WitnessRequirement({
      corpusText: corpus,
      intakeText: args.intakeText,
      draft: args.draft ?? null,
    });
    const hasWitnessBlock = corpusHasWitnessBlock(corpus);
    const hasSignatureBlock = corpusHasVisibleSignatureExecutionLines(corpus);
    const hasBySignatureLines = corpusSignatureBlocksHaveRequiredByLines(corpus, signerCount);
    const allowed =
      !premiumInProgress &&
      corpus.length >= VS01_SIGNING_CORPUS_MIN_LEN &&
      hasSignatureBlock &&
      (!witnessRequirement.requiresWitness || hasWitnessBlock) &&
      hasBySignatureLines;
    logVs01Eligibility({
      requiresSignatureBlock: true,
      requiresWitness: witnessRequirement.requiresWitness,
      witnessReason: witnessRequirement.witnessReason,
      allowed,
    });
    return {
      corpus,
      source: "paidProSourceOfTruth",
      len: corpus.length,
      hash: canonical.hash,
      matchesFreeHash: false,
      isFreeHashMatch: false,
      hasWitnessBlock,
      requiresSignatureBlock: true,
      requiresWitness: witnessRequirement.requiresWitness,
      witnessReason: witnessRequirement.witnessReason,
      hasBySignatureLines,
      hasByOrSignatureLines: hasBySignatureLines,
      signerCount,
      allowed,
      blockReason: allowed
        ? undefined
        : !hasSignatureBlock
          ? "missing_signature_block"
          : witnessRequirement.requiresWitness && !hasWitnessBlock
            ? "missing_witness_block"
            : !hasBySignatureLines
              ? "missing_by_or_signature_lines"
              : "canonical_corpus_not_ready_for_vs01",
      premiumInProgress,
      premiumComplete,
      userMessage: allowed ? undefined : VS01_CORPUS_GATE_USER_MESSAGE,
    };
  }

  const handoff = args.guidedSigningHandoff;
  const paidProVs01 = getPaidProDocumentForSurface("vs01", { draft: (args.draft ?? null) as never });
  const acceptedCanonical = getAcceptedPremiumCanonicalCorpus();
  const acceptedAuthoritative = paidProVs01?.text ?? (
    acceptedCanonical
      ? getAcceptedPremiumCorpusForVs01Signing({ draft: (args.draft ?? null) as never }).trim()
      : (args.acceptedAuthoritativePlain ?? "").trim()
  );
  if ((paidProVs01 || args.premiumAccepted) && acceptedAuthoritative.length >= VS01_SIGNING_CORPUS_MIN_LEN) {
    const hash = fingerprintAgreementBody(acceptedAuthoritative);
    const witnessRequirement = resolveVs01WitnessRequirement({
      corpusText: acceptedAuthoritative,
      intakeText: args.intakeText,
      draft: args.draft ?? null,
    });
    const hasWitnessBlock = corpusHasWitnessBlock(acceptedAuthoritative);
    const hasSignatureBlock = corpusHasVisibleSignatureExecutionLines(acceptedAuthoritative);
    const hasBySignatureLines = corpusSignatureBlocksHaveRequiredByLines(acceptedAuthoritative, signerCount);
    const allowed =
      hasSignatureBlock &&
      (!witnessRequirement.requiresWitness || hasWitnessBlock) &&
      hasBySignatureLines;
    logVs01Eligibility({
      requiresSignatureBlock: true,
      requiresWitness: witnessRequirement.requiresWitness,
      witnessReason: witnessRequirement.witnessReason,
      allowed,
    });
    const resolution: FinalVs01CorpusResolution = {
      corpus: acceptedAuthoritative,
      source: paidProVs01 ? "paidProSourceOfTruth" : "premium_pipeline",
      len: acceptedAuthoritative.length,
      hash,
      matchesFreeHash: false,
      isFreeHashMatch: false,
      hasWitnessBlock,
      requiresSignatureBlock: true,
      requiresWitness: witnessRequirement.requiresWitness,
      witnessReason: witnessRequirement.witnessReason,
      hasBySignatureLines,
      hasByOrSignatureLines: hasBySignatureLines,
      signerCount,
      allowed,
      blockReason: allowed
        ? undefined
        : !hasSignatureBlock
          ? "missing_signature_block"
          : witnessRequirement.requiresWitness && !hasWitnessBlock
            ? "missing_witness_block"
            : "accepted_paid_pro_missing_execution_block",
      premiumInProgress,
      premiumComplete,
      userMessage: allowed ? undefined : VS01_CORPUS_GATE_USER_MESSAGE,
    };
    logVs01CorpusGateSelectedFinal({
      source: resolution.source,
      len: resolution.len,
      hash: resolution.hash,
      allowed: resolution.allowed,
      skippedRebuild: true,
      skippedIntegrityRepair: true,
    });
    return resolution;
  }
  if (args.premiumAccepted) {
    requireAuthoritativeCorpusForSurface({
      surface: "vs01_signing",
      source: "vs01_signing_corpus",
      renderedText: acceptedAuthoritative,
      paidProAccepted: true,
      minLen: VS01_SIGNING_CORPUS_MIN_LEN,
    });
    return {
      corpus: "",
      source: "blocked_short_preview",
      len: 0,
      hash: "",
      matchesFreeHash: false,
      isFreeHashMatch: false,
      hasWitnessBlock: false,
      requiresSignatureBlock: true,
      requiresWitness: false,
      witnessReason: null,
      hasBySignatureLines: false,
      hasByOrSignatureLines: false,
      signerCount,
      allowed: false,
      blockReason: "authoritative_corpus_unavailable",
      premiumInProgress,
      premiumComplete: false,
      userMessage: VS01_CORPUS_GATE_USER_MESSAGE,
    };
  }
  const handoffTrusted =
    handoff &&
    GUIDED_VS01_HANDOFF_ALLOWED_SOURCES.has(handoff.source) &&
    handoff.corpusText.trim().length >= VS01_SIGNING_CORPUS_MIN_LEN &&
    !(
      acceptedAuthoritative.length >= VS01_SIGNING_CORPUS_MIN_LEN &&
      handoff.corpusText.trim().length < acceptedAuthoritative.length * AUTHORITATIVE_BODY_PRESERVE_DOWNGRADE_RATIO
    );

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
    if (acceptedAuthoritative.length >= VS01_SIGNING_CORPUS_MIN_LEN) {
      push(acceptedAuthoritative, "premium_pipeline");
    }
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
    const picked = pickAuthoritativeSigningHandoffCorpus({
      candidates,
      acceptedAuthoritativeBody: acceptedAuthoritative,
      premiumAccepted: args.premiumAccepted,
      pipelineSource: args.premiumPipelineRenderSource,
    });
    if (picked.text.length > 0) {
      const mappedSource: FinalVs01CorpusSource =
        picked.source === "accepted_server_full_draft" || picked.source === "server_full_draft"
          ? "premium_pipeline"
          : (picked.source as FinalVs01CorpusSource);
      best = { text: picked.text, source: mappedSource };
    } else {
      best = sorted[0] ?? best;
    }

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
  const bestWitnessRequirement = resolveVs01WitnessRequirement({
    corpusText: best.text,
    intakeText: args.intakeText,
    draft: args.draft ?? null,
  });
  const bestSignatureIntact =
    corpusHasVisibleSignatureExecutionLines(best.text) &&
    corpusSignatureBlocksHaveRequiredByLines(best.text, signerCount) &&
    (!bestWitnessRequirement.requiresWitness || corpusHasWitnessBlock(best.text));
  const handoffFrozenIntact =
    handoffTrusted &&
    !witness.rebuilt &&
    corpusHasVisibleSignatureExecutionLines(best.text) &&
    corpusSignatureBlocksHaveRequiredByLines(best.text, signerCount);
  const integrity = handoffFrozenIntact
    ? { text: best.text, repairs: [] as string[] }
    : bestSignatureIntact
    ? { text: best.text, repairs: [] as string[] }
    : applyProCorpusIntegrity(witness.corpus, {
        canonicalPartyNames: args.bridge
          ? [args.bridge.creatorName, ...args.bridge.counterparties.map((cp) => cp.name)].filter(Boolean)
          : (args.draft?.parties ?? []).map((party) => String(party?.name ?? "")).filter(Boolean),
        surface: "vs01_signing_corpus",
      });
  const corpus = integrity.text;
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
  const witnessRequirement = resolveVs01WitnessRequirement({
    corpusText: corpus,
    intakeText: args.intakeText,
    draft: args.draft ?? null,
  });
  const hasWitnessBlock = corpusHasWitnessBlock(corpus);
  const hasSignatureBlock = corpusHasVisibleSignatureExecutionLines(corpus);
  const hasBySignatureLines = corpusSignatureBlocksHaveRequiredByLines(corpus, signerCount);
  const signaturePreview = resolvePremiumSignaturePreviewMode(corpus, signerCount);
  const decorativeEsignValid =
    Boolean(args.allowDecorativeEsignCardMode) &&
    signaturePreview.mode === "decorative_fallback_signature_card" &&
    corpus.length >= VS01_SIGNING_CORPUS_MIN_LEN &&
    acceptedAuthoritative.length >= VS01_SIGNING_CORPUS_MIN_LEN;

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
  } else if (!hasSignatureBlock && !decorativeEsignValid) {
    blockReason = "missing_signature_block";
  } else if (witnessRequirement.requiresWitness && !hasWitnessBlock && !decorativeEsignValid) {
    blockReason = "missing_witness_block";
  } else if (!hasBySignatureLines && !decorativeEsignValid) {
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

  logVs01Eligibility({
    requiresSignatureBlock: true,
    requiresWitness: witnessRequirement.requiresWitness,
    witnessReason: witnessRequirement.witnessReason,
    allowed,
  });

  const resolution: FinalVs01CorpusResolution = {
    corpus,
    source,
    len: corpus.length,
    hash,
    matchesFreeHash,
    isFreeHashMatch: matchesFreeHash,
    hasWitnessBlock,
    requiresSignatureBlock: true,
    requiresWitness: witnessRequirement.requiresWitness,
    witnessReason: witnessRequirement.witnessReason,
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

  logLawdogOutputPathMap({
    stage: "vs01_signing",
    source,
    text: corpus,
    canMutateBody: false,
    canRejectBody: true,
    canFallback: false,
    reason: allowed ? "vs01_authoritative_corpus_allowed" : blockReason ?? "vs01_blocked",
  });

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

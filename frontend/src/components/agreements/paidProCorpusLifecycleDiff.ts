/**
 * Paid Pro corpus lifecycle diff — hash drift audit between freeze, signer finalize, and review render.
 * DEV/QA telemetry only; does not mutate corpus bytes.
 */

import { countPaidProExecutionBlocks } from "./paidProExecutionBlockAuthority";
import { fingerprintAgreementBody } from "./guidedDealCompletion/guidedSigningPacketVersion";
import { countWitnessExecutionSections } from "./paidProSignerSigningCorpusHygiene";
import {
  isPostFreezeAuthorizedSignerOverlayDrift,
  isSignatureRegionOnlyCorpusShrink,
} from "./paidProPostFreezeCorpusInvariant";
import { preparePaidProReviewDisplayPlain, preparePaidProFrozenDisplayPlain } from "./paidProFlattenedDocumentNormalize";
import { shouldUsePaidProSourceOfTruthDisplayOnly } from "./paidProAuthoritativeRenderGate";
import { isPaidProPostFinalizeHydratedCorpusLocked } from "./paidProSignerMetadataCommitPolicy";
import { classifyPaidProNormalizedSurfaceDiff } from "./paidProNormalizedSurfaceDiff";
import { normalizeCorpusForCopyCompare } from "./qa/paidProCorpusIntegrity/paidProCorpusIntegrityMetrics";
import { hashPaidProCorpus } from "./paidProSourceOfTruth";
import { paidProPerfTraceEnabled } from "./paidProPerfLogging";

export type PaidProCorpusLifecycleStage =
  | "canonical_freeze"
  | "signer_finalize"
  | "review_render"
  | "review_link_generation";

const REVIEW_LINK_GENERATION_ALLOWED_CLASSIFICATIONS = new Set<PaidProCorpusLifecycleDiffClassification>([
  "identical",
  "signer_metadata_only",
]);

export type PaidProCorpusLifecycleDiffClassification =
  | "signer_metadata_only"
  | "display_normalization_only"
  | "execution_block_hydration_only"
  | "notice_contact_hydration_only"
  | "whitespace_or_line_width_only"
  | "substantive_clause_change"
  | "unknown"
  | "identical";

export type PaidProCorpusLifecycleDiffPayload = {
  fromStage: PaidProCorpusLifecycleStage;
  toStage: PaidProCorpusLifecycleStage;
  fromHash: string;
  toHash: string;
  lenDelta: number;
  classification: PaidProCorpusLifecycleDiffClassification;
  changedExecutionBlockOnly: boolean;
  changedSignerMetadataOnly: boolean;
  substantiveClauseDelta: boolean;
  executionBlockCountBefore: number;
  executionBlockCountAfter: number;
  witnessCountBefore: number;
  witnessCountAfter: number;
};

const checkpoints = new Map<PaidProCorpusLifecycleStage, { text: string; hash: string }>();
const loggedDiffKeys = new Set<string>();
let lastAuditForTests: PaidProCorpusLifecycleDiffPayload | null = null;

const PRESERVE_REVIEW_SCROLL_CLASSIFICATIONS = new Set<PaidProCorpusLifecycleDiffClassification>([
  "signer_metadata_only",
  "execution_block_hydration_only",
  "notice_contact_hydration_only",
  "display_normalization_only",
  "whitespace_or_line_width_only",
  "identical",
]);

function trimCorpus(text: string): string {
  return (text || "").trim();
}

function clauseBodyBeforeWitness(text: string): string {
  const idx = text.search(/\bIN WITNESS WHEREOF\b/i);
  return idx >= 0 ? text.slice(0, idx).trimEnd() : text.trimEnd();
}

function collapseSignatureLineWidthNoise(text: string): string {
  return text.replace(/_{2,}/g, "___");
}

function isNoticeContactHydrationOnlyDelta(before: string, after: string): boolean {
  const witnessBefore = before.search(/\bIN WITNESS WHEREOF\b/i);
  const witnessAfter = after.search(/\bIN WITNESS WHEREOF\b/i);
  if (witnessBefore < 0 || witnessAfter < 0) return false;
  const tailBefore = before.slice(witnessBefore).trimEnd();
  const tailAfter = after.slice(witnessAfter).trimEnd();
  if (tailBefore !== tailAfter) return false;
  const headBefore = before.slice(0, witnessBefore);
  const headAfter = after.slice(0, witnessAfter);
  if (headBefore === headAfter) return false;
  return /\bNotices\b/i.test(headBefore) && /\bNotices\b/i.test(headAfter);
}

export function classifyPaidProCorpusLifecycleDiff(
  beforeText: string,
  afterText: string,
): PaidProCorpusLifecycleDiffClassification {
  const before = (beforeText || "").replace(/\r\n/g, "\n");
  const after = (afterText || "").replace(/\r\n/g, "\n");
  if (before === after) return "identical";

  if (shouldUsePaidProSourceOfTruthDisplayOnly() || isPaidProPostFinalizeHydratedCorpusLocked()) {
    const frozenBefore = preparePaidProFrozenDisplayPlain(before).text.trim();
    const frozenAfter = preparePaidProFrozenDisplayPlain(after).text.trim();
    if (frozenBefore === frozenAfter) return "display_normalization_only";
  }

  if (!isPaidProPostFinalizeHydratedCorpusLocked()) {
    const displayPreparedBefore = preparePaidProReviewDisplayPlain(before).text.trim();
    const displayPreparedAfter = preparePaidProReviewDisplayPlain(after).text.trim();
    if (displayPreparedBefore === displayPreparedAfter) {
      return "display_normalization_only";
    }
  }

  const normalizedSurface = classifyPaidProNormalizedSurfaceDiff(before, after);
  if (normalizedSurface === "whitespace_only") return "whitespace_or_line_width_only";
  if (normalizedSurface === "signature_line_width_only") return "whitespace_or_line_width_only";
  if (normalizedSurface === "display_markup_only") return "display_normalization_only";

  const clauseBefore = clauseBodyBeforeWitness(before);
  const clauseAfter = clauseBodyBeforeWitness(after);
  if (
    normalizeCorpusForCopyCompare(clauseBefore) !== normalizeCorpusForCopyCompare(clauseAfter)
  ) {
    if (isNoticeContactHydrationOnlyDelta(before, after)) {
      return "notice_contact_hydration_only";
    }
    return "substantive_clause_change";
  }

  if (isPostFreezeAuthorizedSignerOverlayDrift(before, after)) {
    return "signer_metadata_only";
  }
  if (isSignatureRegionOnlyCorpusShrink(before, after)) {
    return "signer_metadata_only";
  }

  const witnessBefore = before.search(/\bIN WITNESS WHEREOF\b/i);
  const witnessAfter = after.search(/\bIN WITNESS WHEREOF\b/i);
  if (witnessBefore >= 0 && witnessAfter >= 0) {
    const headBefore = before.slice(0, witnessBefore).trimEnd();
    const headAfter = after.slice(0, witnessAfter).trimEnd();
    if (headBefore === headAfter) {
      const execBefore = countPaidProExecutionBlocks(before);
      const execAfter = countPaidProExecutionBlocks(after);
      if (execBefore === execAfter && execBefore <= 1) {
        return "signer_metadata_only";
      }
      if (execBefore === execAfter) {
        return "execution_block_hydration_only";
      }
    }
  }

  if (
    normalizeCorpusForCopyCompare(collapseSignatureLineWidthNoise(before)) ===
    normalizeCorpusForCopyCompare(collapseSignatureLineWidthNoise(after))
  ) {
    return "whitespace_or_line_width_only";
  }

  return "unknown";
}

export function buildPaidProCorpusLifecycleDiffPayload(args: {
  fromStage: PaidProCorpusLifecycleStage;
  toStage: PaidProCorpusLifecycleStage;
  beforeText: string;
  afterText: string;
}): PaidProCorpusLifecycleDiffPayload {
  const before = trimCorpus(args.beforeText);
  const after = trimCorpus(args.afterText);
  const classification = classifyPaidProCorpusLifecycleDiff(before, after);
  const executionBlockCountBefore = countPaidProExecutionBlocks(before);
  const executionBlockCountAfter = countPaidProExecutionBlocks(after);
  const witnessCountBefore = countWitnessExecutionSections(before);
  const witnessCountAfter = countWitnessExecutionSections(after);
  const clauseDelta =
    classification === "substantive_clause_change" ||
    normalizeCorpusForCopyCompare(clauseBodyBeforeWitness(before)) !==
      normalizeCorpusForCopyCompare(clauseBodyBeforeWitness(after));

  return {
    fromStage: args.fromStage,
    toStage: args.toStage,
    fromHash: before.length >= 80 ? hashPaidProCorpus(before) : fingerprintAgreementBody(before),
    toHash: after.length >= 80 ? hashPaidProCorpus(after) : fingerprintAgreementBody(after),
    lenDelta: after.length - before.length,
    classification,
    changedExecutionBlockOnly:
      classification === "execution_block_hydration_only" ||
      (executionBlockCountBefore === executionBlockCountAfter &&
        witnessCountBefore === witnessCountAfter &&
        classification === "signer_metadata_only"),
    changedSignerMetadataOnly:
      classification === "signer_metadata_only" ||
      classification === "whitespace_or_line_width_only",
    substantiveClauseDelta: clauseDelta,
    executionBlockCountBefore,
    executionBlockCountAfter,
    witnessCountBefore,
    witnessCountAfter,
  };
}

export function recordPaidProCorpusLifecycleCheckpoint(
  stage: PaidProCorpusLifecycleStage,
  text: string,
): void {
  const t = trimCorpus(text);
  if (t.length < 200) return;
  checkpoints.set(stage, {
    text: t,
    hash: t.length >= 80 ? hashPaidProCorpus(t) : fingerprintAgreementBody(t),
  });
}

export function readPaidProCorpusLifecycleCheckpoint(
  stage: PaidProCorpusLifecycleStage,
): { text: string; hash: string } | null {
  const row = checkpoints.get(stage);
  return row ? { ...row } : null;
}

export function logPaidProCorpusLifecycleDiff(payload: PaidProCorpusLifecycleDiffPayload): void {
  lastAuditForTests = payload;
  if (!paidProPerfTraceEnabled() && !(typeof import.meta !== "undefined" && import.meta.env?.DEV)) {
    return;
  }
  if (payload.classification === "identical") return;
  const dedupeKey = `${payload.fromStage}|${payload.toStage}|${payload.fromHash}|${payload.toHash}|${payload.classification}`;
  if (loggedDiffKeys.has(dedupeKey)) return;
  loggedDiffKeys.add(dedupeKey);
  // eslint-disable-next-line no-console
  console.info("[paid-pro-corpus-diff]", payload);
}

export function auditPaidProCorpusLifecycleTransition(args: {
  fromStage: PaidProCorpusLifecycleStage;
  toStage: PaidProCorpusLifecycleStage;
  beforeText: string;
  afterText: string;
}): PaidProCorpusLifecycleDiffPayload {
  const payload = buildPaidProCorpusLifecycleDiffPayload(args);
  logPaidProCorpusLifecycleDiff(payload);
  return payload;
}

export function auditPaidProCorpusLifecycleFromCheckpoint(args: {
  fromStage: PaidProCorpusLifecycleStage;
  toStage: PaidProCorpusLifecycleStage;
  afterText: string;
}): PaidProCorpusLifecycleDiffPayload | null {
  const from = checkpoints.get(args.fromStage);
  if (!from) return null;
  const payload = auditPaidProCorpusLifecycleTransition({
    fromStage: args.fromStage,
    toStage: args.toStage,
    beforeText: from.text,
    afterText: args.afterText,
  });
  checkpoints.set(args.toStage, {
    text: trimCorpus(args.afterText),
    hash: payload.toHash,
  });
  return payload;
}

export function auditPaidProSignerFinalizeCorpus(finalizedText: string): PaidProCorpusLifecycleDiffPayload | null {
  const freeze = checkpoints.get("canonical_freeze");
  const beforeText = freeze?.text ?? "";
  if (!beforeText) {
    recordPaidProCorpusLifecycleCheckpoint("signer_finalize", finalizedText);
    return null;
  }
  return auditPaidProCorpusLifecycleFromCheckpoint({
    fromStage: "canonical_freeze",
    toStage: "signer_finalize",
    afterText: finalizedText,
  });
}

export function auditPaidProReviewRenderCorpus(renderedText: string): PaidProCorpusLifecycleDiffPayload | null {
  const fromStage: PaidProCorpusLifecycleStage = checkpoints.has("signer_finalize")
    ? "signer_finalize"
    : "canonical_freeze";
  const from = checkpoints.get(fromStage);
  if (!from) return null;
  const beforeDisplay = shouldUsePaidProSourceOfTruthDisplayOnly()
    ? preparePaidProFrozenDisplayPlain(from.text).text
    : from.text;
  const payload = auditPaidProCorpusLifecycleTransition({
    fromStage,
    toStage: "review_render",
    beforeText: beforeDisplay,
    afterText: renderedText,
  });
  checkpoints.set("review_render", {
    text: trimCorpus(renderedText),
    hash: payload.toHash,
  });
  return payload;
}

export function auditPaidProReviewLinkGenerationCorpus(
  linkGenerationText: string,
): PaidProCorpusLifecycleDiffPayload | null {
  const freeze = checkpoints.get("canonical_freeze");
  if (!freeze) {
    recordPaidProCorpusLifecycleCheckpoint("review_link_generation", linkGenerationText);
    return null;
  }
  const payload = auditPaidProCorpusLifecycleFromCheckpoint({
    fromStage: "canonical_freeze",
    toStage: "review_link_generation",
    afterText: linkGenerationText,
  });
  if (
    payload &&
    !REVIEW_LINK_GENERATION_ALLOWED_CLASSIFICATIONS.has(payload.classification)
  ) {
    // eslint-disable-next-line no-console
    console.error("[paid-pro-review-link-generation-corpus-invariant]", payload);
  }
  return payload;
}

export function shouldPreservePaidProReviewScrollForClassification(
  classification: PaidProCorpusLifecycleDiffClassification | null | undefined,
): boolean {
  if (!classification) return false;
  return PRESERVE_REVIEW_SCROLL_CLASSIFICATIONS.has(classification);
}

export function assertPaidProSignerFinalizeNoSubstantiveClauseDrift(
  beforeText: string,
  afterText: string,
): void {
  const payload = buildPaidProCorpusLifecycleDiffPayload({
    fromStage: "canonical_freeze",
    toStage: "signer_finalize",
    beforeText,
    afterText,
  });
  if (payload.substantiveClauseDelta) {
    throw new Error(
      `[paid-pro-signer-finalize-substantive-drift] classification=${payload.classification} fromHash=${payload.fromHash} toHash=${payload.toHash}`,
    );
  }
  if (payload.executionBlockCountAfter !== 1) {
    throw new Error(
      `[paid-pro-signer-finalize-execution-block-count] count=${payload.executionBlockCountAfter}`,
    );
  }
}

export function readLastPaidProCorpusLifecycleDiffForTests(): PaidProCorpusLifecycleDiffPayload | null {
  return lastAuditForTests;
}

export function resetPaidProCorpusLifecycleDiffForTests(): void {
  checkpoints.clear();
  loggedDiffKeys.clear();
  lastAuditForTests = null;
}

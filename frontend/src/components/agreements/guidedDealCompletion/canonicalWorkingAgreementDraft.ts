/**
 * Canonical working agreement draft — progressive guided merges accumulate here during Q&A.
 * Final review and signing must accept this body when guided answers + signers are complete.
 */

import type { GuidedCompletionSession } from "./types";
import { isGuidedCompletionComplete } from "./guidedCompletionEngine";
import { listGuidedAnsweredVariableIds } from "./guidedAnswerApplyOrchestration";
import { GUIDED_FINAL_REVIEW_MIN_CORPUS_LEN } from "../simpleProFinalReviewCorpus";
import { pickBestAuthoritativeCorpusPlain } from "./guidedFinalReviewApplyReadiness";
import {
  mergeAllGuidedAnswersIntoCorpus,
  stripMisplacedGuidedClausesBeforeSignature,
  normalizeGuidedCorpusSectionFormatting,
} from "./guidedSectionAwareMerge";
import { normalizeGuidedProCorpusStructure } from "./guidedCanonicalCorpusNormalizer";
import { scanFatalPartyPlaceholdersAfterManifestApply, type CanonicalFinalPartyManifest } from "./canonicalFinalPartyManifest";

export const CANONICAL_WORKING_DRAFT_SOURCE = "canonical_working_draft" as const;

export type CanonicalWorkingDraftResolution = {
  body: string;
  len: number;
  source: typeof CANONICAL_WORKING_DRAFT_SOURCE | "none";
};

export function pickCanonicalWorkingAgreementDraft(
  candidates: readonly (string | null | undefined)[],
): CanonicalWorkingDraftResolution {
  const body = pickBestAuthoritativeCorpusPlain(candidates);
  return {
    body,
    len: body.length,
    source: body.length >= 500 ? CANONICAL_WORKING_DRAFT_SOURCE : "none",
  };
}

export function isCanonicalWorkingDraftReadyForFinalization(args: {
  bodyLen: number;
  guidedSession: GuidedCompletionSession | null | undefined;
  signersComplete: boolean;
  minLen?: number;
}): boolean {
  const minLen = args.minLen ?? GUIDED_FINAL_REVIEW_MIN_CORPUS_LEN;
  if (args.bodyLen < minLen) return false;
  if (!args.signersComplete) return false;
  const session = args.guidedSession;
  if (!session) return false;
  const answeredCount = listGuidedAnsweredVariableIds(session).length;
  const frozenCount = session.frozenTotalQuestions ?? session.queue.length;
  const sessionComplete =
    isGuidedCompletionComplete(session) ||
    (answeredCount > 0 && frozenCount > 0 && answeredCount >= frozenCount);
  if (!sessionComplete) return false;
  if (answeredCount < 1) return false;
  return true;
}

/** Normalize + merge guided answers into the working draft (validation runs in finalizer). */
export function prepareCanonicalWorkingDraftForFinalization(args: {
  body: string;
  guidedSession: GuidedCompletionSession | null | undefined;
}): { body: string; repairs: string[] } {
  let out = (args.body || "").trim();
  const repairs: string[] = [];
  const stripped = stripMisplacedGuidedClausesBeforeSignature(out);
  out = stripped.text;
  repairs.push(...stripped.repairs);
  const formatted = normalizeGuidedCorpusSectionFormatting(out);
  out = formatted.text;
  repairs.push(...formatted.repairs);
  const merged = mergeAllGuidedAnswersIntoCorpus(out, args.guidedSession);
  out = merged.body;
  repairs.push(...merged.repairs);
  const structured = normalizeGuidedProCorpusStructure(out);
  out = structured.text;
  repairs.push(...structured.repairs.map((r) => `structure:${r}`));
  logCanonicalWorkingDraftNormalization({ repairs: repairs.length, bodyLen: out.length });
  return { body: out, repairs };
}

export function canonicalWorkingDraftHasFatalPlaceholders(args: {
  body: string;
  manifest: CanonicalFinalPartyManifest;
}): boolean {
  const scan = scanFatalPartyPlaceholdersAfterManifestApply({
    body: args.body,
    manifest: args.manifest,
  });
  return !scan.ok;
}

export function logCanonicalWorkingDraftNormalization(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[guided-corpus-normalization]", payload);
}

export function logCanonicalWorkingDraftAccepted(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[guided-authoritative-preview-sync]", payload);
}

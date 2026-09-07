/**
 * Entitled Pro N≥3 Create → Pro Review settle (or bounded fail-closed).
 * Never leave Preparing/Structuring up when generate never fired.
 */

import { shortIntakeFingerprint } from "../../lib/agreementGenerationId";
import {
  namedIntakeContractingParties,
  upsertLabeledPartyRows,
} from "./intakeContractingPartyEditor";
import { resolveDeclaredExplicitPartyCount } from "./partySlotIdentityNormalize";

/** Overlay may stay this long only when premium-full-draft / generate HTTP has actually started. */
export const CREATE_FLOW_PIPELINE_NO_CORPUS_FAILSAFE_MS = 120_000;
/** Generating UI with no generate request — fail-closed well before the live 151s hang. */
export const CREATE_FLOW_GENERATING_WITHOUT_PIPELINE_FAILSAFE_MS = 15_000;

export function mergePartyPrepIntoCreateSubmitText(
  rawSubmit: string,
  partyRows: readonly string[],
): string {
  const named = namedIntakeContractingParties(partyRows);
  if (named.length < 2) return String(rawSubmit || "");
  return upsertLabeledPartyRows(rawSubmit, named);
}

/** Declared 3/4-party dumps must open that many party-prep slots (not only 2). */
export function resolvePartyPrepSlotCount(intakeText: string, extractedCount: number): number {
  const declared = resolveDeclaredExplicitPartyCount(intakeText) ?? 0;
  return Math.min(4, Math.max(2, extractedCount, declared >= 3 ? declared : 2));
}

/**
 * Home/create full-screen prepare overlay must drop once party-prep / fail-closed is the real UI.
 * Do not use bare `!draft` — that keeps "Preparing your review screen" forever after a capability block.
 */
export function shouldDismissHomeCreateTransitionForIntakeRecovery(input: {
  isGenerating: boolean;
  intakeClarification?: unknown;
  emptyAuthorityPrepFailSafe?: boolean;
  createFlowPhase?: string;
  homeAutoGenerateConsumed?: boolean;
}): boolean {
  if (input.isGenerating) return false;
  if (input.emptyAuthorityPrepFailSafe) return true;
  if (input.intakeClarification) return true;
  return Boolean(
    input.homeAutoGenerateConsumed && input.createFlowPhase === "capturing_input",
  );
}

/**
 * Skip entitled rewrite only when the accepted snapshot is the SAME intake.
 * A new N-party create after a prior Pro review must still fire generate.
 */
export function shouldSkipEntitledRewriteForMatchingAcceptedSnapshot(input: {
  incomingIntake: string;
  snapshotIntakeFingerprint?: string | null;
  hasMatchingAcceptedAuthority: boolean;
}): boolean {
  if (!input.hasMatchingAcceptedAuthority) return false;
  const incoming = String(input.incomingIntake || "").trim();
  if (!incoming) return true;
  const snapFp = String(input.snapshotIntakeFingerprint || "").trim();
  if (!snapFp) return false;
  return snapFp === shortIntakeFingerprint(incoming);
}

export function shouldFailClosedGeneratingWithoutPipeline(input: {
  isGenerating: boolean;
  generatePipelineInFlight: boolean;
  hasAuthoritativeReviewBody: boolean;
  preparingStartedAtMs: number | null;
  nowMs: number;
  timeoutMs?: number;
}): boolean {
  if (input.hasAuthoritativeReviewBody) return false;
  if (!input.isGenerating) return false;
  if (input.generatePipelineInFlight) return false;
  if (input.preparingStartedAtMs == null) return false;
  return (
    input.nowMs - input.preparingStartedAtMs >=
    (input.timeoutMs ?? CREATE_FLOW_GENERATING_WITHOUT_PIPELINE_FAILSAFE_MS)
  );
}

export function shouldFailClosedInFlightPipelineWithoutCorpus(input: {
  generatePipelineInFlight: boolean;
  hasAuthoritativeReviewBody: boolean;
  preparingStartedAtMs: number | null;
  nowMs: number;
  timeoutMs?: number;
}): boolean {
  if (input.hasAuthoritativeReviewBody) return false;
  if (!input.generatePipelineInFlight) return false;
  if (input.preparingStartedAtMs == null) return false;
  return (
    input.nowMs - input.preparingStartedAtMs >=
    (input.timeoutMs ?? CREATE_FLOW_PIPELINE_NO_CORPUS_FAILSAFE_MS)
  );
}

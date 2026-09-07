/**
 * Entitled Pro N≥3 Create → Pro Review settle (or bounded fail-closed).
 * Never leave Preparing/Structuring up when generate never fired.
 */

import { shortIntakeFingerprint } from "../../lib/agreementGenerationId";
import { evaluateIntentionalCreateDraftSubmit } from "./agreementIntakeCapabilityGate";
import { extractListedSigningPartyNames } from "./agreementIntakeClarification";
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

/** How many legal names Create must have for this dump (declared 3/4, otherwise 2). */
export function requiredCreatePartyNameCount(intakeText: string): number {
  const declared = resolveDeclaredExplicitPartyCount(intakeText) ?? 0;
  if (declared >= 3) return Math.min(4, declared);
  return 2;
}

/** Named party-prep rows plus labeled / between-clause names already in the submit text. */
export function countFilledCreatePartyNames(
  intakeText: string,
  partyRows: readonly string[] = [],
): number {
  const fromRows = namedIntakeContractingParties(partyRows).length;
  const fromIntake = extractListedSigningPartyNames(intakeText).length;
  return Math.max(fromRows, fromIntake);
}

/** True when party-prep rows (or merged labeled lines) satisfy the declared party count. */
export function hasFilledPartyPrepForDeclaredCreate(
  intakeText: string,
  partyRows: readonly string[] = [],
): boolean {
  const merged = mergePartyPrepIntoCreateSubmitText(intakeText, partyRows);
  return countFilledCreatePartyNames(merged, partyRows) >= requiredCreatePartyNameCount(merged);
}

/**
 * Filled N≥3 (or ordinary 2-party) Create must invoke premium-full-draft / generate.
 * Empty / invalid names stay on the capability fail-closed path.
 */
export function shouldInvokePremiumGenerateAfterPartyPrepCreate(input: {
  mergedIntake: string;
  partyRows?: readonly string[];
}): boolean {
  const rows = input.partyRows ?? [];
  const merged = mergePartyPrepIntoCreateSubmitText(input.mergedIntake, rows);
  if (evaluateIntentionalCreateDraftSubmit(merged).action !== "proceed") return false;
  return hasFilledPartyPrepForDeclaredCreate(merged, rows);
}

export const CREATE_FLOW_PREPARATION_FAILSAFE_GENERIC_MESSAGE =
  "We couldn't prepare the review. Try again.";

/** Party-names copy only when names are truly missing — not after filled party-prep. */
export function resolveCreateFlowPreparationFailsafeMessage(input: {
  intakeText: string;
  partyRows?: readonly string[];
}): string {
  if (hasFilledPartyPrepForDeclaredCreate(input.intakeText, input.partyRows ?? [])) {
    return CREATE_FLOW_PREPARATION_FAILSAFE_GENERIC_MESSAGE;
  }
  return "We couldn't prepare the review. Add the party names and try again.";
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
  /**
   * Intentional Create after party-prep rows were filled and merged.
   * Leftover 2-party freeze/SoT must not skip generate unless this intake already settled.
   */
  partyPrepCreateReady?: boolean;
}): boolean {
  if (!input.hasMatchingAcceptedAuthority) return false;
  const incoming = String(input.incomingIntake || "").trim();
  const snapFp = String(input.snapshotIntakeFingerprint || "").trim();
  if (input.partyPrepCreateReady) {
    if (!incoming || !snapFp) return false;
    return snapFp === shortIntakeFingerprint(incoming);
  }
  if (!incoming) return true;
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

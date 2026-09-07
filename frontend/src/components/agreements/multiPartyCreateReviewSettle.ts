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
import { labeledPartyLegalEntities } from "./labeledPartyBlockParse";
import { resolveDeclaredExplicitPartyCount } from "./partySlotIdentityNormalize";

/** Matches GUIDED_FINAL_REVIEW_MIN_CORPUS_LEN — inlined to avoid pipeline import cycles. */
const SETTLE_PRO_REVIEW_MIN_CORPUS_LEN = 1500;

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

/** 503 / empty generate — not the persist-save footer, and not infinite Preparing. */
export const CREATE_FLOW_GENERATE_FAILED_CLEAR_MESSAGE =
  "We couldn't finish the Pro review. Your details are still here — tap Try again.";

const SERVER_FULL_DRAFT_SETTLE_SOURCES = new Set([
  "server_full_draft",
  "server_full_draft_retry",
  "server_full_draft_degraded",
  "snapshot_server_full_draft",
]);

/**
 * premium-full-draft 200 (or degraded 200-class) with a usable corpus must settle Review.
 * Do not require SoT/committed/GET — first-create N≥3 was fail-closing on success.
 */
export function shouldSettleProReviewAfterPremiumFullDraft(input: {
  winningPremiumBodyText?: string | null;
  premiumRenderSource?: string | null;
  staleIntakeOrGeneration?: boolean;
}): boolean {
  if (input.staleIntakeOrGeneration) return false;
  const body = String(input.winningPremiumBodyText || "").trim();
  if (body.length < SETTLE_PRO_REVIEW_MIN_CORPUS_LEN) return false;
  return SERVER_FULL_DRAFT_SETTLE_SOURCES.has(String(input.premiumRenderSource || "").trim());
}

/** Fail-close only when generate produced no usable Review corpus. */
export function shouldFailCloseCreateAfterPremiumFullDraft(input: {
  winningPremiumBodyText?: string | null;
  premiumRenderSource?: string | null;
  staleIntakeOrGeneration?: boolean;
}): boolean {
  return !shouldSettleProReviewAfterPremiumFullDraft(input);
}

export type CreatePipelineRejectOrGateInput = {
  winningPremiumBodyText?: string | null;
  premiumRenderSource?: string | null;
  staleIntakeOrGeneration?: boolean;
  proIntentGateMessage?: string | null;
  founderDetailsGateMessage?: string | null;
};

/**
 * Existing pipeline reject/gate decision (placeholder-reject / paid-corpus reject /
 * intent or founder gate). Do not invent a second SoT — this only reads the result.
 */
export function isCreatePipelineRejectOrGateDecision(
  result: CreatePipelineRejectOrGateInput | null | undefined,
): boolean {
  if (!result) return false;
  const source = String(result.premiumRenderSource || "").trim();
  if (source === "rejected_paid_corpus") return true;
  return Boolean(result.proIntentGateMessage || result.founderDetailsGateMessage);
}

/**
 * After reject/gate: fail-closed unless the same settle helper says the corpus is
 * commercially usable (ordinary 2-party dump must still reach Review).
 */
export function shouldFailClosedCreateAfterRejectOrGate(
  result: CreatePipelineRejectOrGateInput | null | undefined,
): boolean {
  if (!isCreatePipelineRejectOrGateDecision(result)) return false;
  return !shouldSettleProReviewAfterPremiumFullDraft(result ?? {});
}

/**
 * Home/Generating overlays must drop once reject/gate is terminal — even if
 * `isGenerating` is still stale (same class of miss as helper-true / overlay-never-clears).
 */
export function shouldDismissCreateOverlaysAfterRejectOrGate(input: {
  rejectOrGateBlocked?: boolean;
  corpusCommerciallyUsable?: boolean;
  hardError?: string | null;
  emptyAuthorityPrepFailSafe?: boolean;
}): boolean {
  if (input.corpusCommerciallyUsable) return true;
  if (input.emptyAuthorityPrepFailSafe) return true;
  if (input.hardError) return true;
  return Boolean(input.rejectOrGateBlocked);
}

/**
 * Party-prep + labeled Party N names for the generate request.
 * Leftover 2-party draft rows must not silently drop declared party 3/4.
 */
export function resolvePartiesForPremiumGenerateRequest(input: {
  intakeText: string;
  partyRows?: readonly string[];
  draftPartyNames?: readonly string[];
}): string[] {
  const merged = mergePartyPrepIntoCreateSubmitText(input.intakeText, input.partyRows ?? []);
  const required = requiredCreatePartyNameCount(merged);
  const fromRows = namedIntakeContractingParties(input.partyRows ?? []);
  const fromLabeled = labeledPartyLegalEntities(merged)
    .map((n) => n.replace(/\s+/g, " ").trim())
    .filter((n) => n.length >= 2);
  const fromDraft = (input.draftPartyNames ?? [])
    .map((n) => String(n || "").replace(/\s+/g, " ").trim())
    .filter((n) => n.length >= 2);
  const declared = [fromRows, fromLabeled].reduce(
    (best, cur) => (cur.length > best.length ? cur : best),
    [] as string[],
  );
  if (declared.length >= required || declared.length >= 3) {
    return declared.slice(0, 4);
  }
  if (fromDraft.length >= required) return fromDraft.slice(0, 4);
  if (declared.length >= 2) return declared.slice(0, 4);
  return fromDraft.slice(0, 4);
}

export function overlayDeclaredPartiesOnDraft<T extends { parties?: { name: string; role: string; id?: string; email?: string }[] }>(
  draft: T,
  partyNames: readonly string[],
): T {
  const names = partyNames.map((n) => n.replace(/\s+/g, " ").trim()).filter((n) => n.length >= 2).slice(0, 4);
  if (names.length < 2) return draft;
  const prior = draft.parties ?? [];
  return {
    ...draft,
    parties: names.map((name, i) => ({
      ...(prior[i] ?? {}),
      name,
      role: prior[i]?.role || "party",
    })),
  };
}

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
  hardError?: string | null;
  rejectOrGateBlocked?: boolean;
}): boolean {
  if (
    shouldDismissCreateOverlaysAfterRejectOrGate({
      rejectOrGateBlocked: input.rejectOrGateBlocked,
      hardError: input.hardError,
      emptyAuthorityPrepFailSafe: input.emptyAuthorityPrepFailSafe,
    })
  ) {
    return true;
  }
  if (input.isGenerating) return false;
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

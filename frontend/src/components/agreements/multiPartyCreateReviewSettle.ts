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
  /** Terminal `vs01-corpus-gate-blocked` with no selected-final (dump→create). */
  vs01CorpusGateBlocked?: boolean;
  vs01CorpusGateAllowed?: boolean;
  vs01SelectedFinal?: boolean;
  vs01BlockReason?: string | null;
};

/** Known in-progress / prepare-deferred reasons — empty is NOT one of these. */
export function isVs01CorpusGateNonTerminalBlockReason(
  reason: string | null | undefined,
): boolean {
  const r = String(reason || "").trim();
  if (!r) return false;
  if (r === "premium_corpus_in_progress") return true;
  if (r === "deferred_until_prepare_signature_links") return true;
  return r.startsWith("vs01_checks_deferred");
}

export type Vs01CorpusGateBlockedInput = {
  allowed?: boolean | null;
  blockReason?: string | null;
  selectedFinal?: boolean | null;
  /**
   * After generate has completed / premium is not in-progress, empty (and
   * first-review deferred) reasons are terminal for overlay dismiss.
   */
  generateComplete?: boolean | null;
  premiumInProgress?: boolean | null;
};

/**
 * `vs01-corpus-gate-blocked` with no selected-final — the live Northline/too_much miss.
 * Only known in-progress / prepare-deferred reasons stay non-terminal.
 * Empty `blockReason` is terminal once generate is done (the #207 hole:
 * `if (!r) return true` kept live `vs01-corpus-gate-blocked` non-terminal).
 *
 * #209: leftover `premium_corpus_in_progress` after generate HTTP completed is
 * terminal. Live too_much kept `premiumPostCheckoutPhase=processing`, so the
 * render-time gate stayed `premium_corpus_in_progress` while
 * `premium-authority-candidate-rejected-shorter-than-accepted` churned and
 * overlays never dismissed.
 */
export function isVs01CorpusGateBlockedWithoutSelectedFinal(
  input: Vs01CorpusGateBlockedInput,
): boolean {
  if (input.selectedFinal || input.allowed) return false;
  const reason = String(input.blockReason || "").trim();
  if (reason === "deferred_until_prepare_signature_links") return false;
  const generateDone =
    input.generateComplete === true || input.premiumInProgress === false;
  if (reason === "premium_corpus_in_progress") {
    return generateDone;
  }
  if (reason.startsWith("vs01_checks_deferred") && !generateDone) return false;
  return true;
}

/** Attach a VS01 gate resolution onto the create reject/gate input (#206 overlay path). */
export function withCreatePipelineVs01CorpusGate<T extends CreatePipelineRejectOrGateInput>(
  result: T,
  gate: {
    allowed?: boolean | null;
    blockReason?: string | null;
    premiumInProgress?: boolean | null;
    premiumComplete?: boolean | null;
  },
): T & {
  vs01CorpusGateAllowed: boolean;
  vs01SelectedFinal: boolean;
  vs01BlockReason: string | null;
  vs01CorpusGateBlocked: boolean;
} {
  const allowed = Boolean(gate.allowed);
  const blockReason = gate.blockReason ?? null;
  return {
    ...result,
    vs01CorpusGateAllowed: allowed,
    vs01SelectedFinal: allowed,
    vs01BlockReason: blockReason,
    vs01CorpusGateBlocked: isVs01CorpusGateBlockedWithoutSelectedFinal({
      allowed,
      blockReason,
      selectedFinal: allowed,
      premiumInProgress: gate.premiumInProgress,
      generateComplete: gate.premiumComplete === true || gate.premiumInProgress === false,
    }),
  };
}

/**
 * Existing pipeline reject/gate decision (placeholder-reject / paid-corpus reject /
 * intent or founder gate / vs01-corpus-gate-blocked with no selected-final).
 * Do not invent a second SoT — this only reads the result.
 */
export function isCreatePipelineRejectOrGateDecision(
  result: CreatePipelineRejectOrGateInput | null | undefined,
): boolean {
  if (!result) return false;
  if (
    result.vs01CorpusGateBlocked ||
    isVs01CorpusGateBlockedWithoutSelectedFinal({
      allowed: result.vs01CorpusGateAllowed,
      blockReason: result.vs01BlockReason,
      selectedFinal: result.vs01SelectedFinal,
    })
  ) {
    return true;
  }
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

export type PostGenerateAuthorityChurnOverlayDecision = {
  dismissOverlays: boolean;
  settleReview: boolean;
  failClosed: boolean;
};

/**
 * After generate completes, shorter-than-accepted authority churn +
 * `vs01-corpus-gate-blocked` must not keep Generating / `preparing_review` sticky.
 * Settle Review when a commercially usable corpus (including the latched accepted
 * body the guard already returns) exists; otherwise fail-closed. No second SoT.
 */
export function resolvePostGenerateAuthorityChurnOverlayDecision(input: {
  generateComplete?: boolean;
  shorterThanAcceptedChurn?: boolean;
  vs01GateBlockedWithoutSelectedFinal?: boolean;
  corpusCommerciallyUsable?: boolean;
}): PostGenerateAuthorityChurnOverlayDecision {
  if (!input.generateComplete) {
    return { dismissOverlays: false, settleReview: false, failClosed: false };
  }
  const terminalChurn =
    Boolean(input.shorterThanAcceptedChurn) &&
    Boolean(input.vs01GateBlockedWithoutSelectedFinal);
  if (!terminalChurn) {
    return { dismissOverlays: false, settleReview: false, failClosed: false };
  }
  if (input.corpusCommerciallyUsable) {
    return { dismissOverlays: true, settleReview: true, failClosed: false };
  }
  return { dismissOverlays: true, settleReview: false, failClosed: true };
}

/**
 * Ordinary coherent 2-party dumps that already name both parties must not stop
 * at party-prep (Still needed / Create) when the corpus/gate path should settle
 * or fail-close. N≥3 unnamed dumps still use party-prep.
 */
export function shouldSkipPartyPrepForOrdinaryNamedTwoParty(input: {
  intakeText: string;
  partyRows?: readonly string[];
  generateComplete?: boolean;
  corpusCommerciallyUsable?: boolean;
  vs01GateBlockedWithoutSelectedFinal?: boolean;
}): boolean {
  const intake = String(input.intakeText || "");
  if (requiredCreatePartyNameCount(intake) > 2) return false;
  if (countFilledCreatePartyNames(intake, input.partyRows ?? []) < 2) return false;
  if (input.corpusCommerciallyUsable) return true;
  if (input.generateComplete && input.vs01GateBlockedWithoutSelectedFinal) return true;
  return Boolean(input.generateComplete);
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

/** Leftover paint must not suppress fail-closed unless VS01 selected a final corpus. */
export function hasAuthoritativeCreateReviewBodyForPrepFailsafe(input: {
  leftoverBody?: boolean;
  vs01SelectedFinal?: boolean;
}): boolean {
  return Boolean(input.leftoverBody && input.vs01SelectedFinal);
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

/**
 * TEST515 — Single authoritative first paid create → review route.
 *
 * Post-checkout (first-time) and dashboard create (returning) must both:
 * 1. Run validatePaidProOutput (via isPaidProFinishedAgreement) before canonical entry
 * 2. Enter review only through planEnterCanonicalPaidProReviewFlow / enterCanonicalPaidProReviewFlow
 * 3. Never commit pipeline validation markers when professional validation rejected
 */

import { CreateUiStage } from "./createUiStage";
import type { CreateFlowProductionPhase } from "./createFlowTypes";
import { GUIDED_FINAL_REVIEW_MIN_CORPUS_LEN } from "./simpleProFinalReviewCorpus";
import { isAuthoritativePremiumPipelineRenderSource } from "./premiumRenderSourceResolver";
import { hasPaidProPipelineValidationForCorpus } from "./paidProPostAcceptanceValidatorCache";
import {
  planEnterCanonicalPaidProReviewFlow,
  type CanonicalPaidProReviewFlowPlan,
  type EnterCanonicalPaidProReviewFlowArgs,
  type PlanFinalizeCanonicalPaidProPipelineSuccessArgs,
  planFinalizeCanonicalPaidProPipelineSuccess,
} from "./enterCanonicalPaidProReviewFlow";
import { validatePaidProOutput, isPaidProFinishedAgreement } from "./paidProCorpusAcceptance";
import { resolveAgreementIntentContract } from "./agreementIntentContract";
import type { ParsedDraftShape } from "./intakeSmartDefaults";

export type FirstPaidCreatePipelineGateArgs = {
  corpusPlain: string;
  pipelineSource: string;
  intakeText: string;
  draft?: ParsedDraftShape | null;
  agreementValidation?: import("./premiumFullDraftApi").AgreementValidationResult | null;
  serverGenerationDegraded?: boolean;
};

export type FirstPaidCreatePipelineGateResult = {
  validationOk: boolean;
  validationReasons: string[];
  finishedAgreementOk: boolean;
  finishedAgreementReasons: string[];
  canEnterCanonicalReview: boolean;
  blockedReason?: string;
  canonicalPlan: CanonicalPaidProReviewFlowPlan;
  corpusPlain: string;
};

/** Professional validation must have passed before canonical review entry. */
export function hasValidatedCorpusForFirstPaidCreateReview(args: {
  corpusPlain: string;
  pipelineSource: string;
}): boolean {
  const body = args.corpusPlain.trim();
  const source = (args.pipelineSource || "server_full_draft").trim();
  if (body.length < GUIDED_FINAL_REVIEW_MIN_CORPUS_LEN) return false;
  if (!isAuthoritativePremiumPipelineRenderSource(source)) return false;
  return hasPaidProPipelineValidationForCorpus({ text: body, source });
}

/**
 * Gate canonical first-paid review entry — validation cache must match corpus (set by validatePaidProOutput).
 */
export function gateFirstPaidCreateCanonicalReviewEntry(
  args: EnterCanonicalPaidProReviewFlowArgs,
): CanonicalPaidProReviewFlowPlan {
  const plan = planEnterCanonicalPaidProReviewFlow(args);
  if (!plan.shouldApply) return plan;
  if (
    !hasValidatedCorpusForFirstPaidCreateReview({
      corpusPlain: plan.corpusPlain,
      pipelineSource: plan.pipelineSource,
    })
  ) {
    return {
      ...plan,
      shouldApply: false,
      blockedReason: "validation_not_latched_for_corpus",
    };
  }
  return plan;
}

/** Shared pipeline gate for entitled rewrite and post-checkout apply — one validation surface. */
export function evaluateFirstPaidCreatePipelineGate(
  args: FirstPaidCreatePipelineGateArgs & PlanFinalizeCanonicalPaidProPipelineSuccessArgs,
): FirstPaidCreatePipelineGateResult {
  const corpusPlain = (args.corpusPlain || "").trim();
  const pipelineSource = (args.pipelineSource || "server_full_draft").trim();
  const intakeText = (args.intakeText || "").trim();
  const contract = resolveAgreementIntentContract(intakeText);
  const validation = validatePaidProOutput({
    text: corpusPlain,
    rawIntake: intakeText,
    intentContract: contract,
    draft: args.draft ?? null,
    premiumPipelineSource: pipelineSource,
    agreementValidation: args.agreementValidation ?? null,
  });
  const finished = isPaidProFinishedAgreement({
    text: corpusPlain,
    rawIntake: intakeText,
    readonlyRenderSource: "server_full_document_text",
    pipelineSource,
    stale: false,
    intentContract: contract,
    draft: args.draft ?? null,
    qualityRetryActive: false,
    serverGenerationDegraded: Boolean(args.serverGenerationDegraded),
  });
  const finalize = planFinalizeCanonicalPaidProPipelineSuccess({
    ...args,
    corpusPlain,
    pipelineSource,
    intakeText,
    draft: args.draft ?? null,
  });
  const validationLatched = hasValidatedCorpusForFirstPaidCreateReview({
    corpusPlain: finalize.corpusPlain,
    pipelineSource,
  });
  const canEnter =
    validation.ok &&
    finished.ok &&
    finalize.canEnterCanonicalReview &&
    validationLatched &&
    hasValidatedCorpusForFirstPaidCreateReview({
      corpusPlain: finalize.corpusPlain,
      pipelineSource,
    });
  let blockedReason = finalize.blockedReason;
  if (!validation.ok) blockedReason = "professional_validation_rejected";
  else if (!finished.ok) blockedReason = "finished_agreement_gate_failed";
  else if (!validationLatched) blockedReason = "validation_not_latched_for_corpus";

  const canonicalPlan = gateFirstPaidCreateCanonicalReviewEntry({
    ...args,
    source: args.source,
    corpusPlain: finalize.corpusPlain,
    pipelineSource,
    draft: args.draft ?? null,
    intakeText,
  });

  return {
    validationOk: validation.ok,
    validationReasons: validation.reasons,
    finishedAgreementOk: finished.ok,
    finishedAgreementReasons: finished.reasons,
    canEnterCanonicalReview: canEnter && canonicalPlan.shouldApply,
    blockedReason,
    canonicalPlan,
    corpusPlain: finalize.corpusPlain,
  };
}

/** Terminal review phase when pipeline validation failed — recovery, never content-ready. */
export type PaidProCreateValidationFailureTerminalPlan = {
  proFullDraftQualityRetry: true;
  createFlowPhase: CreateFlowProductionPhase;
  displayPhase: "review";
  createUiStage: typeof CreateUiStage.DRAFT;
  premiumPersistedFlowActive: false;
  premiumSendPathUnlocked: false;
  agreementDocumentPlain: "";
  clearPipelineRefs: true;
};

export function planPaidProCreateValidationFailureTerminal(): PaidProCreateValidationFailureTerminalPlan {
  return {
    proFullDraftQualityRetry: true,
    createFlowPhase: "draft_ready_for_review",
    displayPhase: "review",
    createUiStage: CreateUiStage.DRAFT,
    premiumPersistedFlowActive: false,
    premiumSendPathUnlocked: false,
    agreementDocumentPlain: "",
    clearPipelineRefs: true,
  };
}

export const FIRST_PAID_CREATE_CANONICAL_ROUTE_HELPER = "evaluateFirstPaidCreatePipelineGate";

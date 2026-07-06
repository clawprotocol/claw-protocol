/**
 * Canonical Dashboard → Create route for logged-in paid LawDog users.
 *
 * Login → Dashboard → Create → Describe → Create draft → Generating → Review (validated corpus)
 * → Prepare signatures → signer setup → signature links → completed proof.
 *
 * One route marker, one pipeline gate, one review entry — not founder/guided/returning bootstrap paths.
 */

import { CreateUiStage } from "./createUiStage";
import type { CreateFlowProductionPhase } from "./createFlowTypes";
import {
  DASHBOARD_PAID_CREATE_ROUTE_SOURCE,
  isDashboardPaidCreateRouteActive,
} from "../../launch/paidDashboardCreateContext";
import {
  evaluateFirstPaidCreatePipelineGate,
  gateFirstPaidCreateCanonicalReviewEntry,
  hasValidatedCorpusForFirstPaidCreateReview,
  planPaidProCreateValidationFailureTerminal,
  type FirstPaidCreatePipelineGateArgs,
  type FirstPaidCreatePipelineGateResult,
} from "./paidProFirstPaidCreateFlowRoute";
import {
  planEnterCanonicalPaidProReviewFlow,
  type CanonicalPaidProReviewEntrySource,
  type EnterCanonicalPaidProReviewFlowArgs,
} from "./enterCanonicalPaidProReviewFlow";
import {
  resolveReturningPaidCreateEligible,
  type ResolveReturningPaidCreateEligibleInput,
  type ReturningPaidCreateSubmitBootstrapPlan,
} from "./returningPaidCreateBootstrap";
import { readAcceptedPipelineReviewCorpusPlain } from "./paidProAcceptedPipelineReviewCorpus";
import { PAID_PRO_AUTHORITY_MIN_LEN } from "./paidProAuthorityConstants";
import { resolveAuthoritativeSignerCount } from "./signerCountAuthority";
import type { ParsedDraftShape } from "./intakeSmartDefaults";

export { DASHBOARD_PAID_CREATE_ROUTE_SOURCE, isDashboardPaidCreateRouteActive };

export const DASHBOARD_PAID_CREATE_CANONICAL_SOURCE: CanonicalPaidProReviewEntrySource =
  "dashboard_paid_create";

export type DashboardPaidCreateScreen =
  | "dashboard"
  | "create_intake"
  | "generating"
  | "review_recovery"
  | "review_validated"
  | "prepare_signatures"
  | "signer_setup"
  | "signature_links"
  | "completed_proof";

/** Route authorization — entitlement only, not document readiness. */
export function resolveDashboardPaidCreateRouteAuthorization(
  input: ResolveReturningPaidCreateEligibleInput = {},
): boolean {
  if (!isDashboardPaidCreateRouteActive()) return false;
  return resolveReturningPaidCreateEligible(input);
}

/** Fresh dashboard create submit — never the generic returning-paid bootstrap. */
export function planDashboardPaidCreateSubmitBootstrap(
  input: ResolveReturningPaidCreateEligibleInput,
): ReturningPaidCreateSubmitBootstrapPlan | null {
  if (!isDashboardPaidCreateRouteActive()) return null;
  if (!resolveDashboardPaidCreateRouteAuthorization(input)) return null;
  return {
    markProIntent: true,
    markProEntitlementSource: "entitled_rewrite",
    premiumPersistedFlowActive: true,
    premiumSendPathUnlocked: true,
    premiumPostCheckoutPhase: "processing",
    createFlowPhase: "generating_draft",
    displayPhase: "generating_draft",
  };
}

export function resolveDashboardPaidCreateCanonicalReviewSource(): CanonicalPaidProReviewEntrySource {
  if (isDashboardPaidCreateRouteActive()) return DASHBOARD_PAID_CREATE_CANONICAL_SOURCE;
  return "returning_paid_create";
}

/** Review document mount — validated corpus required on dashboard route. */
export function hasDashboardPaidCreateValidatedReviewCorpus(): boolean {
  if (!isDashboardPaidCreateRouteActive()) return false;
  const plain = readAcceptedPipelineReviewCorpusPlain();
  if (plain.length < PAID_PRO_AUTHORITY_MIN_LEN) return false;
  return hasValidatedCorpusForFirstPaidCreateReview({
    corpusPlain: plain,
    pipelineSource: "server_full_draft",
  });
}

export type DashboardPaidCreateReviewShellInput = {
  createUiStage: (typeof CreateUiStage)[keyof typeof CreateUiStage];
  displayPhase: string;
  createFlowPhase?: CreateFlowProductionPhase;
  premiumPostCheckoutPhase?: string | null;
  proFullDraftQualityRetry?: boolean;
};

/**
 * Dashboard route review chrome — generating/recovery allowed; review content only after validation latch.
 */
export function computeDashboardPaidCreateReviewShellReady(
  input: DashboardPaidCreateReviewShellInput,
): boolean {
  if (!isDashboardPaidCreateRouteActive()) return false;
  if (input.createUiStage === CreateUiStage.RECIPIENTS) return true;
  if (
    input.displayPhase === "generating_draft" ||
    input.createFlowPhase === "generating_draft" ||
    input.premiumPostCheckoutPhase === "processing"
  ) {
    return true;
  }
  if (input.proFullDraftQualityRetry) return true;
  if (
    input.displayPhase === "review" ||
    input.createFlowPhase === "draft_ready_for_review"
  ) {
    return hasDashboardPaidCreateValidatedReviewCorpus();
  }
  return false;
}

/** Validation failure — recovery before blank review on dashboard route. */
export type DashboardPaidCreateValidationFailurePlan = {
  proFullDraftQualityRetry: true;
  createFlowPhase: CreateFlowProductionPhase;
  displayPhase: "generating_draft";
  createUiStage: typeof CreateUiStage.DRAFT;
  premiumPersistedFlowActive: false;
  premiumSendPathUnlocked: false;
  agreementDocumentPlain: "";
  clearPipelineRefs: true;
};

export function planDashboardPaidCreateValidationFailureTerminal(): DashboardPaidCreateValidationFailurePlan {
  const base = planPaidProCreateValidationFailureTerminal();
  return {
    ...base,
    displayPhase: "generating_draft",
    createFlowPhase: "generating_draft",
  };
}

export function evaluateDashboardPaidCreatePipelineGate(
  args: FirstPaidCreatePipelineGateArgs &
    EnterCanonicalPaidProReviewFlowArgs,
): FirstPaidCreatePipelineGateResult {
  return evaluateFirstPaidCreatePipelineGate({
    ...args,
    source: DASHBOARD_PAID_CREATE_CANONICAL_SOURCE,
  });
}

export function gateDashboardPaidCreateCanonicalReviewEntry(
  args: EnterCanonicalPaidProReviewFlowArgs,
) {
  return gateFirstPaidCreateCanonicalReviewEntry({
    ...args,
    source: isDashboardPaidCreateRouteActive()
      ? DASHBOARD_PAID_CREATE_CANONICAL_SOURCE
      : args.source,
  });
}

export type ResolveDashboardPaidCreateScreenInput = {
  onDashboard?: boolean;
  createUiStage: (typeof CreateUiStage)[keyof typeof CreateUiStage];
  displayPhase: string;
  createFlowPhase?: CreateFlowProductionPhase;
  premiumPostCheckoutPhase?: string | null;
  proFullDraftQualityRetry?: boolean;
  premiumSendPathUnlocked?: boolean;
  signatureLinksSent?: boolean;
  completedProof?: boolean;
  intakeText?: string;
  draft?: ParsedDraftShape | null;
};

export function resolveDashboardPaidCreateScreen(
  input: ResolveDashboardPaidCreateScreenInput,
): DashboardPaidCreateScreen {
  if (input.onDashboard) return "dashboard";
  if (input.completedProof) return "completed_proof";
  if (input.signatureLinksSent && input.createUiStage === CreateUiStage.RECIPIENTS) {
    return "signature_links";
  }
  if (input.createUiStage === CreateUiStage.RECIPIENTS) {
    if (input.premiumSendPathUnlocked) return "signer_setup";
    return "prepare_signatures";
  }
  if (input.proFullDraftQualityRetry && !hasDashboardPaidCreateValidatedReviewCorpus()) {
    return "review_recovery";
  }
  if (
    input.displayPhase === "generating_draft" ||
    input.createFlowPhase === "generating_draft" ||
    input.premiumPostCheckoutPhase === "processing"
  ) {
    return "generating";
  }
  if (
    (input.displayPhase === "review" || input.createFlowPhase === "draft_ready_for_review") &&
    hasDashboardPaidCreateValidatedReviewCorpus()
  ) {
    return "review_validated";
  }
  if (input.displayPhase === "intake" || input.createFlowPhase === "capturing_input") {
    return "create_intake";
  }
  return "create_intake";
}

export const DASHBOARD_PAID_CREATE_SCREEN_SEQUENCE: readonly DashboardPaidCreateScreen[] = [
  "dashboard",
  "create_intake",
  "generating",
  "review_validated",
  "prepare_signatures",
  "signer_setup",
  "signature_links",
  "completed_proof",
] as const;

export function simulateDashboardPaidCreateScreenSequence(args: {
  intakeText: string;
  draft: ParsedDraftShape;
  acceptedCorpusPlain: string;
  pipelineSource?: string;
  recipientCandidates: Array<{ name?: string; email?: string; role?: string }>;
}): DashboardPaidCreateScreen[] {
  const screens: DashboardPaidCreateScreen[] = ["dashboard"];
  screens.push("create_intake");
  screens.push("generating");

  const pipelineSource = args.pipelineSource ?? "server_full_draft";
  const corpusPlain = args.acceptedCorpusPlain.trim();
  const validationLatched = hasValidatedCorpusForFirstPaidCreateReview({
    corpusPlain,
    pipelineSource,
  });
  const gate = validationLatched
    ? {
        canEnterCanonicalReview: true,
        corpusPlain,
      }
    : evaluateDashboardPaidCreatePipelineGate({
        source: DASHBOARD_PAID_CREATE_CANONICAL_SOURCE,
        corpusPlain,
        pipelineSource,
        intakeText: args.intakeText,
        draft: args.draft,
        recipientCandidates: args.recipientCandidates,
      });

  if (!gate.canEnterCanonicalReview) {
    screens.push("review_recovery");
    return screens;
  }

  const plan = planEnterCanonicalPaidProReviewFlow({
    source: DASHBOARD_PAID_CREATE_CANONICAL_SOURCE,
    corpusPlain: gate.corpusPlain,
    pipelineSource: args.pipelineSource ?? "server_full_draft",
    draft: args.draft,
    intakeText: args.intakeText,
    recipientCandidates: args.recipientCandidates,
    respectAlreadyOpened: false,
  });
  if (!plan.shouldApply) {
    screens.push("review_recovery");
    return screens;
  }

  screens.push("review_validated");
  const signerCount = resolveAuthoritativeSignerCount({
    intakeText: args.intakeText,
    draftParties: args.draft.parties,
    corpusPlain: args.acceptedCorpusPlain,
  }).count;
  if (signerCount >= 2) {
    screens.push("prepare_signatures");
    screens.push("signer_setup");
    screens.push("signature_links");
  }
  screens.push("completed_proof");
  return screens;
}

export const DASHBOARD_PAID_CREATE_ROUTE_HELPER = "evaluateDashboardPaidCreatePipelineGate";

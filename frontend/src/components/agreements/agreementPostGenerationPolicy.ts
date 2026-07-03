export type PostGenerationFlowContext = "wizard_details" | "simple_home_review" | "intake_create_review";

export function shouldUseCanonicalPostGenerationFlow(input: {
  context: PostGenerationFlowContext | null;
  hasDraft: boolean;
  isReviewPhase: boolean;
  suppressed?: boolean;
}): boolean {
  if (input.suppressed || !input.context || !input.hasDraft || !input.isReviewPhase) return false;
  return true;
}

export function resolveWizardDetailsPostGenerationContext(input: {
  embeddedInCard: boolean;
  section: string;
  isWorkspace: boolean;
}): PostGenerationFlowContext | null {
  if (input.embeddedInCard && input.section === "details" && input.isWorkspace) {
    return "wizard_details";
  }
  return null;
}

export function resolveSimpleHomeReviewPostGenerationContext(input: {
  section: string;
  simpleFlowPhase: string;
  canonicalUnpaidSendShell: boolean;
  sendShellTierGatePending: boolean;
}): PostGenerationFlowContext | null {
  if (input.section !== "simpleHomeReview") return null;
  if (input.simpleFlowPhase !== "review") return null;
  if (input.canonicalUnpaidSendShell || input.sendShellTierGatePending) return null;
  return "simple_home_review";
}

export function resolveIntakeCreateReviewPostGenerationContext(input: {
  isFreeStreamlineDraftReview: boolean;
  productionDraftPrimaryReviewSurface: boolean;
  createUiStage: string;
  createFlowPhase: string;
  hasDraft: boolean;
  paidProAuthoritative: boolean;
  premiumPaidDocumentSurface: boolean;
  premiumPersistedFlowActive: boolean;
  showPrimaryGuidedCompletion?: boolean;
}): PostGenerationFlowContext | null {
  if (!input.hasDraft || input.createUiStage !== "DRAFT") return null;
  if (input.paidProAuthoritative || input.premiumPaidDocumentSurface || input.premiumPersistedFlowActive) {
    return null;
  }
  if (input.showPrimaryGuidedCompletion) return null;
  if (input.createFlowPhase !== "draft_ready_for_review") return null;
  if (input.isFreeStreamlineDraftReview || input.productionDraftPrimaryReviewSurface) {
    return "intake_create_review";
  }
  return null;
}

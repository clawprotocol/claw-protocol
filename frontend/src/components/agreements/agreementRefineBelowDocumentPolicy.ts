import { CreateUiStage } from "./createUiStage";

/**
 * The large “Refine this draft” (persisted /refine) block and the free-tier Pro upsell
 * share the same parent shell (production create, draft review, below the document).
 */
export function isBelowDocumentRefineSectionParentEligible(input: {
  createProductionTwoPane: boolean;
  createUiStage: CreateUiStage;
  hasDraft: boolean;
  productionDraftPrimaryReviewSurface: boolean;
  showFinalizeYourAgreement: boolean;
}): boolean {
  return (
    input.createProductionTwoPane &&
    input.createUiStage === CreateUiStage.DRAFT &&
    input.hasDraft &&
    input.productionDraftPrimaryReviewSurface &&
    !input.showFinalizeYourAgreement
  );
}

/**
 * Large persisted refine textarea: tier/checkout entitlement **and** the Pro deliverable
 * review surface — never on free starter tease, even with a session grant, so we never
 * show “Refine this draft” + /refine for unpaid paths.
 *
 * `AgreementBuilderIntake` also applies a fail-safe: `isFreeStarterReviewSurface` (see
 * that file) forces this off on unpaid/starter document review, including when
 * `premiumPaidDocumentSurface` misfires (e.g. `draftHasFullDraftExpansion` with
 * `showUpgradeToFullDraftOnReview` false).
 */
export function shouldShowPersistedRefineTextareaBox(
  parentEligible: boolean,
  /** Tier Pro / server billing / post-checkout grant — not body-marker-only. */
  entitledToBelowDocumentPersistedRefine: boolean,
  /** `premiumPaidDocumentSurface` in Intake: full pro review, not upgrade-tease starter. */
  premiumPaidDocumentSurface: boolean,
): boolean {
  return parentEligible && entitledToBelowDocumentPersistedRefine && premiumPaidDocumentSurface;
}

/**
 * Replaces the free “refine” affordance: show when the parent section is active but
 * the user is not on the Pro deliverable surface (free starter, upgrade nudge, etc.).
 */
export function shouldShowStarterProRefineUpsellCard(
  parentEligible: boolean,
  premiumPaidDocumentSurface: boolean,
  suppressIntakePremiumUpsell: boolean,
): boolean {
  if (suppressIntakePremiumUpsell) return false;
  return parentEligible && !premiumPaidDocumentSurface;
}

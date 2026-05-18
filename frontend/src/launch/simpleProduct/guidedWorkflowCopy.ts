/**
 * Calm, control-first copy for homepage → preparation → free review → Pro continuation.
 * User-visible strings only — keep console logs separate.
 */

export const HOME_CREATE_TRANSITION_HEADING = "Preparing your agreement";
export const HOME_CREATE_TRANSITION_STEPS = [
  "Structuring key terms",
  "Organizing responsibilities",
  "Preparing your review screen",
] as const;
export const HOME_CREATE_TRANSITION_REASSURANCE =
  "Nothing is sent, signed, or shared automatically.";

export const REVIEW_AHA_HEADING = "Your agreement is ready";
export const REVIEW_AHA_SUBHEAD = "Review and edit everything before sending or signing.";
export const REVIEW_AHA_CHIP = "Draft ready to review";
export const REVIEW_AHA_REASSURANCE =
  "Nothing is sent, signed, or shared until you choose the next step.";

export const DRAFT_LOADING_PREPARING = "Preparing your agreement…";
export const DRAFT_LOADING_STRUCTURING = "Structuring key terms…";
export const DRAFT_LOADING_REVIEW_SCREEN = "Preparing review screen…";
export const DRAFT_LOADING_KEEPING = "Keeping your details intact…";

export const STARTER_DOCUMENT_EDIT_WORDING_LABEL = "Edit wording";
export const STARTER_DOCUMENT_DONE_EDITING_LABEL = "Done editing";

export function logHomeCreateTransitionShown(): void {
  console.info("[home-create-transition-shown]");
}

export function logStarterReviewDocumentRendered(): void {
  console.info("[starter-review-document-rendered]");
}

export function logProContinuationCardVisible(): void {
  console.info("[pro-continuation-card-visible]");
}

/** Stale user-facing strings that must not appear on primary funnel surfaces. */
export const STALE_FUNNEL_UI_STRINGS: readonly string[] = [
  "Generating structured agreement",
  "AI parse",
  "parse failed",
  "generation failed",
  "See how it works",
  "STARTER DRAFT",
  "Make this agreement easier to approve",
] as const;

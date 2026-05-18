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
  "Nothing is sent or signed until you choose the next step.";

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

export function logProConversionCardVisible(): void {
  console.info("[pro-conversion-card-visible]");
}

/** @deprecated Use {@link logProConversionCardVisible} */
export function logProContinuationCardVisible(): void {
  logProConversionCardVisible();
}

export function logProConversionPrimaryClick(source: string): void {
  console.info("[pro-conversion-primary-click]", { source });
}

export function logProConversionEditFreeClick(source: string): void {
  console.info("[pro-conversion-edit-free-click]", { source });
}

export function logProConversionKeepFreeClick(source: string): void {
  console.info("[pro-conversion-keep-free-click]", { source });
}

export type FreeDraftCopyTextSource = "starter_review_preview";

export function logFreeDraftCopyText(payload: {
  source: FreeDraftCopyTextSource;
  textLen: number;
}): void {
  console.info("[free-draft-copy-text]", payload);
}

export const FREE_REVIEW_OUTSIDE_HELPER =
  "Initial draft generated from your notes. Review and edit before sharing.";

export function logFreeReviewKeepReviewing(agreementIdShort: string, source: string): void {
  console.info("[free-review-keep-reviewing]", { agreementIdShort, source });
}

export function logFreeSendGatedToPro(source: string): void {
  console.info("[free-send-gated-to-pro]", { source });
}

export type HomeAutoGenerateSkipReason = "draft_exists" | "already_consumed" | "phase_ready";

export function logHomeAutoGenerateSkipped(reason: HomeAutoGenerateSkipReason): void {
  console.info("[home-auto-generate-skipped]", { reason });
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

/**
 * Pro transformation perception copy — review → upgrade (not checkout trust).
 * Calm, operational; no hype or full-draft exposure.
 */

/** Upgrade confidence heading — future tense; user has not paid yet. */
export const PRO_CAN_TIGHTEN_HEADING = "What Pro can tighten";

/** @deprecated Use {@link PRO_CAN_TIGHTEN_HEADING} */
export const PRO_CAN_IMPROVE_HEADING = PRO_CAN_TIGHTEN_HEADING;

/** @deprecated Use {@link PRO_CAN_TIGHTEN_HEADING} */
export const PRO_IMPROVED_HEADING = PRO_CAN_TIGHTEN_HEADING;

export const PRO_CAN_TIGHTEN_BULLETS: readonly string[] = [
  "Full party names and cleaner opening language",
  "Stronger business protections",
  "Review, send, signing, and proof workflow",
  "Cleaner signature and approval flow",
] as const;

/** @deprecated Use {@link PRO_CAN_TIGHTEN_BULLETS} */
export const PRO_IMPROVED_BULLETS = PRO_CAN_TIGHTEN_BULLETS;

export const PRO_CAN_TIGHTEN_FOOTNOTE =
  "You review the Pro version before anything is sent or signed.";

/** Stale pre-payment copy — must not appear inside free draft document body. */
export const STALE_PRO_IMPROVED_SECTION_LABEL = "Pro improved this section";

/** Stale fake-sample upgrade teaser strings — must not appear in user-facing surfaces. */
export const STALE_PRO_TRANSFORMATION_PREVIEW_STRINGS: readonly string[] = [
  "Example upgrade preview",
  "Example Upgrade Preview",
  "Preview only — your Pro agreement unlocks after upgrade.",
  "Acme Widgets LLC",
  "Beta Supply Inc.",
] as const;

/** Compressed checkout sidebar — replaces long “LawDog Pro helps” bullet list. */
export const CHECKOUT_PRO_CONTEXT_TITLE = "Pro for this agreement";

export const CHECKOUT_PRO_CONTEXT_LINES: readonly string[] = [
  "Clearer structure and stronger protections for this draft.",
  "Tracked signatures and proof you can review before anything goes out.",
] as const;

export const CHECKOUT_PRO_CONTEXT_COMPLETING_LABEL = "Completing";

/** Warmer payment microcopy (checkout card form). */
export const CHECKOUT_CARD_PROCESSING_LINE = "Payments are processed securely.";
export const CHECKOUT_CARD_ACTIVATION_LINE = "Your plan activates after payment succeeds.";

/** Stale long-form checkout help bullets — must not return to primary surfaces. */
export const STALE_CHECKOUT_PRO_HELPS_BULLETS: readonly string[] = [
  "make the agreement easier for the other side to approve",
  "prepare the agreement for review, sending, and signing",
  "organize responsibilities clearly",
  "strengthen important business terms",
] as const;

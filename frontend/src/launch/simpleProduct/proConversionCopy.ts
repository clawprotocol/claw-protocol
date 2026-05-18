/**
 * Unified Pro conversion copy — create → review → checkout.
 * Calm, control-first framing; avoid fear / crippleware language.
 */

export const PRO_CTA_CONTINUE = "Continue with Pro";
export const PRO_CTA_KEEP_FREE_DRAFT = "Keep free draft";

export const PRO_UPGRADE_CARD_HEADING = "Make this agreement easier to approve";
export const PRO_UPGRADE_CARD_BODY =
  "Your draft is a good start. LawDog Pro helps turn it into a cleaner, easier-to-review version before you share, send, or sign.";

export const PRO_UPGRADE_CAN_HELP_HEADING = "LawDog Pro can also help with";
export const PRO_UPGRADE_CAN_HELP_BULLETS: readonly string[] = [
  "clearer exit and notice terms",
  "negotiation-ready wording",
  "responsibilities organized by party",
  "review links, tracked changes, and e-signing",
  "a proof record when the agreement is finished",
] as const;

export const PRO_UPGRADE_REASSURANCE = "You review everything before anything is shared.";

export const CHECKOUT_TITLE = "Continue with Pro";
export const CHECKOUT_SUBTITLE =
  "Upgrade this agreement into a professional version. Review it before anything is shared, sent, or signed.";

export const CHECKOUT_PRO_HELPS_INTRO = "LawDog Pro helps:";
export const CHECKOUT_PRO_HELPS_BULLETS: readonly string[] = [
  "make the agreement easier for the other side to approve",
  "organize responsibilities clearly",
  "prepare the agreement for review, sending, and signing",
  "strengthen important business terms",
] as const;

export const CHECKOUT_CTA = "Unlock collaboration + send";
export const CHECKOUT_FOOTER = "Secured checkout · Draft saved · Review before anything moves";

export const DRAFT_LOADING_STRUCTURING = "Structuring your agreement…";
export const DRAFT_LOADING_TURNING = "Turning your notes into a draft…";
export const DRAFT_LOADING_KEEPING = "Keeping your details intact…";

export const EARN_HERO_TITLE = "Earn with LawDog";
export const EARN_HERO_SUBHEAD = "Share LawDog. Earn when people upgrade.";
export const EARN_CTA_START = "Start earning";
export const EARN_BENEFIT_CARDS: readonly { title: string; body: string }[] = [
  {
    title: "Subscribers unlock affiliate access",
    body: "Paid LawDog subscribers can create a referral link and start sharing right away.",
  },
  {
    title: "Doginal holders get early access",
    body: "Doginal Dog holders and approved partners may request early access during private beta.",
  },
  {
    title: "Monthly payouts",
    body: "Earn when people upgrade. Payouts run monthly when you meet the minimum balance.",
  },
] as const;
export const EARN_EARLY_ACCESS_NOTE =
  "Subscribers unlock affiliate access instantly. Doginal Dog holders and approved partners may request early access.";

/** Stale CTA / fear-copy strings that must not appear in primary conversion surfaces. */
export const STALE_PRO_CONVERSION_STRINGS: readonly string[] = [
  "Unlock professional send",
  "Continue to complete version",
  "Upgrade to send",
  "What your current draft doesn't cover",
  "What your current draft doesn",
  "Upgrade and strengthen draft",
] as const;

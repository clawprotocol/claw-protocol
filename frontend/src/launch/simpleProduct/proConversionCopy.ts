/**
 * Unified Pro conversion copy — create → review → checkout.
 * Calm, control-first framing; avoid fear / crippleware language.
 */

import {
  DRAFT_LOADING_KEEPING,
  DRAFT_LOADING_PREPARING,
  DRAFT_LOADING_REVIEW_SCREEN,
  DRAFT_LOADING_STRUCTURING,
} from "./guidedWorkflowCopy";

export { DRAFT_LOADING_KEEPING, DRAFT_LOADING_PREPARING, DRAFT_LOADING_REVIEW_SCREEN, DRAFT_LOADING_STRUCTURING };

/** @deprecated Use {@link DRAFT_LOADING_PREPARING} */
export const DRAFT_LOADING_TURNING = DRAFT_LOADING_REVIEW_SCREEN;

export const PRO_CTA_CONTINUE = "Continue with Pro";
export const PRO_CTA_KEEP_FREE_DRAFT = "Keep free draft";
export const PRO_CTA_EDIT_FREE_DRAFT = "Edit free draft";

/** @deprecated Use {@link PRO_CTA_EDIT_FREE_DRAFT} */
export const PRO_CTA_EDIT_THIS_DRAFT = PRO_CTA_EDIT_FREE_DRAFT;

export const PRO_UPGRADE_CARD_HEADING = "Ready to move this from draft to deal?";
export const PRO_UPGRADE_CARD_BODY =
  "Free gives you the draft. Pro unlocks review, signing, and saving this same agreement — you approve every step before anything goes out.";

export const PRO_UPGRADE_FREE_COLUMN_LABEL = "Free";
export const PRO_UPGRADE_FREE_BULLETS: readonly string[] = [
  "Simple 1–2 party draft",
  "Copy/edit wording",
  "No review workflow",
  "No signature/proof record workflow",
] as const;

export const PRO_UPGRADE_FREE_COLUMN_HELPER = "Free is for simple 1–2 party drafts.";

export const FREE_PRO_TIER_FREE_SUMMARY = PRO_UPGRADE_FREE_COLUMN_HELPER;
export const FREE_PRO_TIER_PRO_SUMMARY =
  "Pro is review, signing, and saving this agreement. Multi-party and advanced deals also need Pro.";

export const FREE_DRAFT_COPY_TEXT_LABEL = "Copy text";
export const FREE_DRAFT_COPY_TEXT_COPIED = "Copied";
export const FREE_DRAFT_COPY_TEXT_FAILED = "Couldn't copy — try selecting text manually.";

export const PRO_UPGRADE_PRO_COLUMN_LABEL = "Pro";
export const PRO_UPGRADE_PRO_BULLETS: readonly string[] = [
  "Multi-party and advanced agreements",
  "Review links and requested changes",
  "Signer setup and signature links",
  "Completed agreement and proof record",
] as const;

export const PRO_UPGRADE_BRIDGE_LINE =
  "Continue with Pro to review with the other party, sign, and save the record.";

/** @deprecated Use {@link PRO_UPGRADE_PRO_BULLETS} */
export const PRO_UPGRADE_CAN_HELP_BULLETS = PRO_UPGRADE_PRO_BULLETS;

export const PRO_UPGRADE_CAN_HELP_HEADING = "LawDog Pro can also help with";
export const PRO_UPGRADE_REASSURANCE = "You review everything before anything is shared.";

export const CHECKOUT_TITLE = "Continue with Pro";
export const CHECKOUT_COMPLEX_AGREEMENT_TITLE = "Build the full Pro agreement";
export const CHECKOUT_SUBTITLE =
  "Upgrade this draft into a Pro agreement. You'll review and edit it before anything is sent or signed.";
export const CHECKOUT_COMPLEX_AGREEMENT_SUBTITLE =
  "Your prompt includes advanced deal structure. Pro preserves the full agreement logic — all parties, signer roles, revenue-share terms, review workflow, signature blocks, and proof records.";

export const CHECKOUT_COMPLEX_AGREEMENT_BULLETS: readonly string[] = [
  "Preserve all legal parties and signer roles",
  "Support revenue-share and multi-provider payment terms",
  "Prepare review and signature workflows",
  "Generate clean signature blocks and proof records",
  "Approve every step before anything is sent or signed",
] as const;

export const CHECKOUT_FREE_PRO_EXPLAINER_LINES: readonly string[] = [
  FREE_PRO_TIER_FREE_SUMMARY,
  FREE_PRO_TIER_PRO_SUMMARY,
  "Nothing is sent or signed until you approve it.",
] as const;

export const CHECKOUT_PRO_HELPS_INTRO = "LawDog Pro helps:";
export const CHECKOUT_PRO_HELPS_BULLETS: readonly string[] = [
  "make the agreement easier for the other side to approve",
  "organize responsibilities clearly",
  "prepare the agreement for review, sending, and signing",
  "strengthen important business terms",
] as const;

/** @deprecated Prefer {@link CHECKOUT_CTA} from checkoutTrustCopy.ts */
export const CHECKOUT_CTA_LEGACY = "Unlock collaboration + send";

export {
  CHECKOUT_CTA,
  CHECKOUT_CTA_ACTIVE_KEY,
  CHECKOUT_CTA_ALL_VARIANT_STRINGS,
  CHECKOUT_CTA_VARIANTS,
  resolveCheckoutCta,
} from "./checkoutTrustCopy";
export type { CheckoutCtaVariantKey } from "./checkoutTrustCopy";
export { CHECKOUT_CREATE_FLOW_FOOTER as CHECKOUT_FOOTER } from "./checkoutTrustCopy";

export const EARN_HERO_TITLE = "Genesis Dogs Partner Access";
export const EARN_HERO_SUBHEAD =
  "Help launch LawDog. Share useful agreement workflows. Earn when people upgrade.";
export const EARN_CTA_START = "Request partner access";
export const EARN_CTA_BACK = "Back to dashboard";
export const EARN_BENEFIT_CARDS: readonly { title: string; body: string }[] = [
  {
    title: "Paid subscribers",
    body: "Paid LawDog subscribers can unlock referral access from their account.",
  },
  {
    title: "Genesis Dogs & early partners",
    body: "Genesis Dogs and approved early partners may request early affiliate access during private launch.",
  },
  {
    title: "Monthly payouts",
    body: "Payouts run monthly when minimum balance and compliance requirements are met.",
  },
] as const;
export const EARN_BEHAVIOR_NOTE =
  "Share responsibly. No spam, no legal advice claims, no guaranteed outcomes.";
export const EARN_PAYOUT_NOTE =
  "Payouts run monthly when minimum balance and compliance requirements are met.";
export const EARN_ACCESS_NOTE =
  "Paid LawDog subscribers can unlock referral access from their account. Genesis Dogs may receive early access during launch.";

/** @deprecated Use {@link EARN_ACCESS_NOTE} */
export const EARN_EARLY_ACCESS_NOTE = EARN_ACCESS_NOTE;

/** Stale Earn page strings — must not return to primary partner surfaces. */
export const STALE_EARN_PARTNER_STRINGS: readonly string[] = [
  "Earn with LawDog",
  "Doginal Dog holders",
  "Doginal holders get early access",
  "Subscribers unlock affiliate access instantly",
  "Start earning",
] as const;

/** Stale CTA / fear-copy strings that must not appear in primary conversion surfaces. */
export const STALE_PRO_CONVERSION_STRINGS: readonly string[] = [
  "Unlock professional send",
  "Continue to complete version",
  "Upgrade to send",
  "What your current draft doesn't cover",
  "What your current draft doesn",
  "Upgrade and strengthen draft",
  "Make this agreement easier to approve",
  "Continue to collaboration + signing",
  "Unlock collaboration + send",
  "simplified starter preview",
  "Ready to share or sign?",
  "Still finishing your Pro agreement",
  "Copy or download your text",
  "download your text",
] as const;

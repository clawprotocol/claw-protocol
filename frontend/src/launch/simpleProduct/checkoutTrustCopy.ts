/**
 * Pro checkout trust / conversion copy (universal — not agreement-specific).
 * Calm enterprise tone — no hype, fake metrics, or fear-based language.
 */

/** Safe CTA variants for checkout experiments (single source of truth). */
export const CHECKOUT_CTA_VARIANTS = {
  continue_pro: "Continue with Pro",
  unlock_pro: "Unlock Pro Agreement",
  secure_review: "Continue to Secure Review",
  upgrade_pro_review: "Upgrade to Pro Review",
} as const;

export type CheckoutCtaVariantKey = keyof typeof CHECKOUT_CTA_VARIANTS;

/** Active checkout CTA key — change for A/B tests without hunting literals. */
export const CHECKOUT_CTA_ACTIVE_KEY: CheckoutCtaVariantKey = "continue_pro";

export const CHECKOUT_CTA = CHECKOUT_CTA_VARIANTS[CHECKOUT_CTA_ACTIVE_KEY];

export function resolveCheckoutCta(key: CheckoutCtaVariantKey = CHECKOUT_CTA_ACTIVE_KEY): string {
  return CHECKOUT_CTA_VARIANTS[key];
}

/** @deprecated Use {@link CHECKOUT_CTA_VARIANTS.continue_pro} */
export const CHECKOUT_CTA_CONTINUE_PRO = CHECKOUT_CTA_VARIANTS.continue_pro;

/** @deprecated Use {@link CHECKOUT_CTA_VARIANTS.unlock_pro} */
export const CHECKOUT_CTA_UNLOCK_PRO = CHECKOUT_CTA_VARIANTS.unlock_pro;

/** Primary reassurance above payment — keep as the editable-until-approve anchor. */
export const CHECKOUT_SECURE_MICROCOPY =
  "Secure checkout. Your agreement stays editable until you approve and send it.";

export const CHECKOUT_TRUST_STRIP_ITEMS: readonly string[] = [
  "Cancel anytime",
  "30-day money-back guarantee",
  "Human support available",
  "Nothing sends without your approval",
] as const;

/** Muted lifecycle cue — payment unlocks Pro; does not send or sign. */
export const CHECKOUT_WORKFLOW_STEPS: readonly string[] = [
  "Draft",
  "Review",
  "Send",
  "Sign",
  "Proof",
] as const;

export const CHECKOUT_WORKFLOW_PAYMENT_NOTE =
  "Pro unlocks your workflow — payment does not send or sign anything.";

export const CHECKOUT_WHY_BUSINESSES_HEADING = "Why businesses use LawDog";

/** Non-overlapping with secure microcopy + trust strip (no duplicate send/editable lines). */
export const CHECKOUT_WHY_BUSINESSES_BULLETS: readonly string[] = [
  "Secure checkout and tracked signing flow",
  "Human support available when needed",
  "Built for modern business workflows",
] as const;

export const CHECKOUT_PROOF_VERIFICATION_LINE =
  "Tracked signatures and verification records included with Pro.";

export const CHECKOUT_PROOF_VERIFICATION_SUBLINE =
  "Agreement history and signing activity remain reviewable.";

export const CHECKOUT_AFTER_PAYMENT_LABEL = "After payment";

export const CHECKOUT_AFTER_PAYMENT_STEPS: readonly string[] = [
  "Review your upgraded agreement",
  "Edit or revise anything you want",
  "Send for review or signature only when you approve it",
] as const;

export const CHECKOUT_ANNUAL_RENEWAL_COPY =
  "Annual plan renews automatically until canceled. Cancel anytime from your account settings.";

export const CHECKOUT_ANNUAL_WORKFLOW_LABEL = "Best for ongoing agreement workflows";

export const CHECKOUT_USED_FOR_LINE =
  "Used for business agreements, vendor workflows, client approvals, and operational coordination.";

export const CHECKOUT_DRAFT_SAVED_LINE = "Draft saved. You can return before sending.";

export const CHECKOUT_SUPPORT_EMAIL = "support@lawdog.me";

export const CHECKOUT_HUMAN_SUPPORT_LINE = `Questions? Human support is available at ${CHECKOUT_SUPPORT_EMAIL}.`;

/** Legal only — send/sign control lives in secure microcopy + trust strip. */
export const CHECKOUT_LEGAL_DISCLAIMER =
  "LawDog is software, not a law firm. Not legal advice.";

/** @deprecated Removed from panel — use trust strip + secure microcopy instead. */
export const CHECKOUT_SECURE_PAYMENT_LINE = "Secure payment processing.";

/** @deprecated Removed from panel — duplicates trust strip. */
export const CHECKOUT_NO_SEND_UNTIL_CONFIRM_LINE =
  "No agreement is sent, signed, or shared until you confirm.";

/** All registered CTA variant strings — for stale-string guards in tests. */
export const CHECKOUT_CTA_ALL_VARIANT_STRINGS: readonly string[] = Object.values(CHECKOUT_CTA_VARIANTS);

export function logCheckoutTrustCopyRendered(surface: string): void {
  if (import.meta.env.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[checkout-trust-copy-rendered]", { surface, ctaKey: CHECKOUT_CTA_ACTIVE_KEY });
}

/**
 * Pro checkout trust / conversion copy (universal — not agreement-specific).
 * Calm enterprise tone — compact cluster only at checkout (no stacked panels).
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

export const CHECKOUT_SECURE_MICROCOPY =
  "Secure checkout. Your agreement stays editable until you approve and send it.";

export const CHECKOUT_TRUST_STRIP_ITEMS: readonly string[] = [
  "Cancel anytime",
  "30-day money-back guarantee",
  "Human support available",
  "Nothing sends without your approval",
] as const;

export const CHECKOUT_AFTER_PAYMENT_LINE =
  "After payment, review and edit your agreement before sending or signing.";

export const CHECKOUT_SUPPORT_EMAIL = "support@lawdog.me";

export const CHECKOUT_HUMAN_SUPPORT_LINE = `Questions? Human support is available at ${CHECKOUT_SUPPORT_EMAIL}.`;

export const CHECKOUT_LEGAL_DISCLAIMER =
  "LawDog is software, not a law firm. Not legal advice.";

export const CHECKOUT_FOOTER_DRAFT_SAVED = "Secured checkout · Draft saved";

/** Page footer for create-flow checkout (legal sits separately). */
export const CHECKOUT_CREATE_FLOW_FOOTER = CHECKOUT_FOOTER_DRAFT_SAVED;

export const CHECKOUT_ANNUAL_WORKFLOW_LABEL = "Best for ongoing agreement workflows";

/** @deprecated Not rendered on checkout — pricing only. */
export const CHECKOUT_USED_FOR_LINE =
  "Used for business agreements, vendor workflows, client approvals, and operational coordination.";

/** @deprecated Removed from checkout panel. */
export const CHECKOUT_AFTER_PAYMENT_STEPS: readonly string[] = [
  "Review your upgraded agreement",
  "Edit or revise anything you want",
  "Send for review or signature only when you approve it",
] as const;

/** @deprecated Removed from checkout panel. */
export const CHECKOUT_WORKFLOW_STEPS: readonly string[] = [
  "Draft",
  "Review",
  "Send",
  "Sign",
  "Proof",
] as const;

/** All registered CTA variant strings — for stale-string guards in tests. */
export const CHECKOUT_CTA_ALL_VARIANT_STRINGS: readonly string[] = Object.values(CHECKOUT_CTA_VARIANTS);

export function logCheckoutTrustCopyRendered(surface: string): void {
  if (import.meta.env.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[checkout-trust-copy-rendered]", { surface, ctaKey: CHECKOUT_CTA_ACTIVE_KEY });
}

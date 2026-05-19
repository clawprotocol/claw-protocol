/**
 * Pro checkout trust / conversion copy (universal — not agreement-specific).
 */

export const CHECKOUT_CTA_UNLOCK_PRO = "Unlock Pro Agreement";
export const CHECKOUT_CTA_CONTINUE_PRO = "Continue with Pro";

/** Primary CTA on create-flow Pro checkout (no send/sign implication). */
export const CHECKOUT_CTA = CHECKOUT_CTA_UNLOCK_PRO;

export const CHECKOUT_SECURE_MICROCOPY =
  "Secure checkout. Your agreement stays editable until you approve and send it.";

export const CHECKOUT_TRUST_STRIP_ITEMS: readonly string[] = [
  "Cancel anytime",
  "30-day money-back guarantee",
  "Human support available",
  "Nothing sends without your approval",
] as const;

export const CHECKOUT_AFTER_PAYMENT_STEPS: readonly string[] = [
  "Review your upgraded agreement",
  "Make any edits you want",
  "Send only when ready",
] as const;

export const CHECKOUT_ANNUAL_RENEWAL_COPY =
  "Annual plan renews automatically until canceled. Cancel anytime from your account settings.";

export const CHECKOUT_SUPPORT_EMAIL = "support@lawdog.me";

export const CHECKOUT_HUMAN_SUPPORT_LINE = `Questions? Human support is available at ${CHECKOUT_SUPPORT_EMAIL}.`;

export const CHECKOUT_LEGAL_DISCLAIMER =
  "LawDog is software, not a law firm. Not legal advice. Nothing is sent, signed, or shared until you confirm.";

export function logCheckoutTrustCopyRendered(surface: string): void {
  if (import.meta.env.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[checkout-trust-copy-rendered]", { surface });
}

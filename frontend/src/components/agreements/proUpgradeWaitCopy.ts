/**
 * @deprecated Prefer {@link ../../lib/premiumPostCheckoutReturnUx} — re-exports for legacy imports.
 */
export {
  PREMIUM_PRO_WAIT_REASSURANCE as PRO_UPGRADE_WAIT_REASSURANCE,
  PREMIUM_PRO_WAIT_ROTATING_LINES as PRO_UPGRADE_WAIT_ROTATING_LINES,
} from "../../lib/premiumPostCheckoutReturnUx";

export const PRO_UPGRADE_WAIT_MODAL_TITLE = "Building your Pro agreement…";
export const PRO_UPGRADE_WAIT_MODAL_BODY =
  "Using your original deal terms. You can refine details after it appears.";

/** @deprecated Use resolvePremiumProWaitModalView("soft_wait") */
export const PREMIUM_POST_CHECKOUT_EXTENDED_WAIT_TITLE = "Still building — this one has real meat.";
export const PREMIUM_POST_CHECKOUT_EXTENDED_WAIT_BODY =
  "Your Pro agreement is taking a bit longer than usual.";

export const PRO_UPGRADE_WAIT_COPY_BAN_SUBSTR = [
  "legal advice",
  "legal counsel",
  "hurry",
  "asap",
  "immediately",
  "hurry up",
] as const;

/**
 * Calm, slightly witty, non-legal-advice copy for the post–paid-to-Pro generation wait.
 * (Proof-first, tool-not-lawyer posture; user stays in control.)
 */

export const PRO_UPGRADE_WAIT_MODAL_TITLE = "Building your Pro agreement…";
export const PRO_UPGRADE_WAIT_MODAL_BODY =
  "Using your original deal terms. You can refine details after it appears.";

export const PRO_UPGRADE_WAIT_ROTATING_LINES: readonly string[] = [
  "Tightening scope, payment, and key dates in line with your intake…",
  "Reconciling parties, titles, and governing law…",
  "Strengthening the operative clauses the parties care about most…",
  "Almost there — nothing is sent until you say so.",
] as const;

export const PRO_UPGRADE_WAIT_REASSURANCE = "Nothing is sent until you confirm.";

/** After ~30s on the post-checkout wait — calm acknowledgment that full draft can take up to ~1 minute. */
export const PREMIUM_POST_CHECKOUT_EXTENDED_WAIT_TITLE = "Still building your Pro agreement…";
export const PREMIUM_POST_CHECKOUT_EXTENDED_WAIT_BODY =
  "This can take up to a minute. Nothing is sent until you confirm.";

/** For tests: disallowed in this surface (and related strings). */
export const PRO_UPGRADE_WAIT_COPY_BAN_SUBSTR = ["legal advice", "legal counsel", "hurry", "asap", "immediately", "hurry up"];

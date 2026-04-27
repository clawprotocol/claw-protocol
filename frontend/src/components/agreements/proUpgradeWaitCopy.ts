/**
 * Calm, slightly witty, non-legal-advice copy for the post–paid-to-Pro generation wait.
 * (Proof-first, tool-not-lawyer posture; user stays in control.)
 */

export const PRO_UPGRADE_WAIT_MODAL_TITLE = "Upgrading your agreement…";
export const PRO_UPGRADE_WAIT_MODAL_BODY =
  "LawDog is turning the starter draft into a fuller business agreement.";

export const PRO_UPGRADE_WAIT_ROTATING_LINES: readonly string[] = [
  "Adding stronger payment and ownership language…",
  "Checking scope, dates, and governing law…",
  "Teaching the boilerplate to sit, stay, and heel…",
  "Almost there — nothing is sent until you say so.",
] as const;

export const PRO_UPGRADE_WAIT_REASSURANCE =
  "This usually takes a few seconds. You stay in control before anything is sent.";

/** For tests: disallowed in this surface (and related strings). */
export const PRO_UPGRADE_WAIT_COPY_BAN_SUBSTR = ["legal advice", "legal counsel", "hurry", "asap", "immediately", "hurry up"];

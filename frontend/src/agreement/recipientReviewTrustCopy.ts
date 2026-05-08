/**
 * Recipient-facing signing / record copy — plain language, no protocol or chain jargon.
 * LawDog-branded where needed; not legal advice (disclosures live elsewhere).
 */

/** Shell + landing hero (Vs01 header + in-card title). */
export const RECIPIENT_PUBLIC_HERO_TITLE = "Review agreement";
export const RECIPIENT_PUBLIC_HERO_SUBTITLE =
  "Read the draft. Nothing changes until you choose what to send.";
/** @deprecated Prefer {@link RECIPIENT_PUBLIC_HERO_SUBTITLE} only (no duplicate line under title). */
export const RECIPIENT_LANDING_INTRO_ONE_LINE = RECIPIENT_PUBLIC_HERO_SUBTITLE;

export const RECIPIENT_REVIEW_TRUST_NOTHING_CHANGES = "Nothing changes until accepted.";

/** After all signers complete (recipient ceremony view). */
export const RECIPIENT_SIGN_FULLY_EXECUTED_HEADLINE =
  "Fully signed. Your agreement record is available.";

/** After this recipient signs; others may still be pending. */
export const RECIPIENT_SIGN_ONE_DONE_HEADLINE = "Signed. Confirmation saved.";

/** Short line under the celebrate state — trustworthy, non-technical. */
export const RECIPIENT_SIGN_RECORD_SUBLINE =
  "LawDog keeps a dated copy of what was signed. You can review it here when you need to. Not legal advice.";

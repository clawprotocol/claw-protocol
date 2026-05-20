/**
 * Recipient-facing signing / record copy — plain language, no protocol or chain jargon.
 * LawDog-branded where needed; not legal advice (disclosures live elsewhere).
 */

/** Shell + landing hero (Vs01 header + in-card title). */
export const RECIPIENT_PUBLIC_HERO_TITLE = "Review agreement";
export const RECIPIENT_PUBLIC_HERO_SUBTITLE =
  "Someone shared a draft with you. Read it at your pace — nothing is sent or binding until you choose a next step.";
/** @deprecated Prefer {@link RECIPIENT_PUBLIC_HERO_SUBTITLE} only (no duplicate line under title). */
export const RECIPIENT_LANDING_INTRO_ONE_LINE = RECIPIENT_PUBLIC_HERO_SUBTITLE;

export const RECIPIENT_REVIEW_TRUST_NOTHING_CHANGES = "Nothing changes until you accept or sign.";

export const RECIPIENT_REVIEW_TRUST_PRIVATE_LINK =
  "Private link — only people with this URL can open this draft.";

/** One-line inviter context under the hero (landing + active review). */
export function formatRecipientInviterContextLine(inviterDisplayName: string): string {
  const name = (inviterDisplayName || "").trim() || "the sender";
  return `From ${name} · review before anything is final`;
}

/** After all signers complete (recipient ceremony view). */
export const RECIPIENT_SIGN_FULLY_EXECUTED_HEADLINE =
  "Fully signed. Your agreement record is available.";

/** After this recipient signs; others may still be pending. */
export const RECIPIENT_SIGN_ONE_DONE_HEADLINE = "Signed. Confirmation saved.";

/** Short line under the celebrate state — trustworthy, non-technical. */
export const RECIPIENT_SIGN_RECORD_SUBLINE =
  "LawDog keeps a dated copy of what was signed. You can review it here when you need to. Not legal advice.";

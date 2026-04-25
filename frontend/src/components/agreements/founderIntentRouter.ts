/**
 * Premium founder / equity / vesting intent: require an explicit professional title, not a generic "AGREEMENT" shell.
 */

export const REQUIRED_FOUNDER_PREMIUM_TITLES = [
  "Founder Vesting Agreement",
  "Founders Agreement",
  "Equity Vesting Agreement",
] as const;

/** Intake should trigger the founder-vesting title gate. */
const FOUNDER_EQUITY_INTENT = new RegExp(
  [
    "\\b(founder|founders?|vesting|equit(y|ies?)|startup|60\\s*\\/\\s*40|40\\s*\\/\\s*60)\\b",
  ].join(""),
  "i",
);

export function isFounderEquityVestingIntent(intakeText: string | null | undefined): boolean {
  return FOUNDER_EQUITY_INTENT.test((intakeText || "").replace(/\r\n/g, "\n").trim());
}

const REQUIRED_LOWER: readonly string[] = [
  "founder vesting agreement",
  "founders agreement",
  "equity vesting agreement",
];

/**
 * True if the resolved title + first portion of the document show one of the required display titles.
 * Not used when `isFounderEquityVestingIntent` is false (treated as N/A in callers).
 */
export function hasRequiredFounderPremiumTitle(resolvedTitle: string, documentText: string | null | undefined): boolean {
  const head = (documentText || "").replace(/\r\n/g, "\n").trim().slice(0, 14_000);
  const t = (resolvedTitle || "").trim();
  const hay = `${t}\n${head}`.toLowerCase();
  for (const frag of REQUIRED_LOWER) {
    if (hay.includes(frag)) return true;
  }
  return false;
}

/**
 * First markdown/plain non-empty line as fallback when the API did not return `title` (rare).
 */
export function getResolvedTitleForFounderGating(apiTitle: string | null | undefined, documentText: string | null | undefined): string {
  const fromApi = (apiTitle || "").trim();
  if (fromApi) return fromApi;
  for (const line of (documentText || "").replace(/\r\n/g, "\n").split("\n")) {
    const s = line.replace(/^\s*#+\s*/, "").trim();
    if (s.length >= 2) return s;
  }
  return "";
}

/**
 * For a single follow-up model call: reinforce allowed titles on the first page.
 */
export function buildFounderTitleRetryIntake(intake: string): string {
  const base = (intake || "").replace(/\r\n/g, "\n").trim();
  const hint = [
    "",
    "— LawDog Pro requirement —",
    "The agreement must display, as the first-page headline or H1, exactly one of:",
    '"Founder Vesting Agreement", "Founders Agreement", or "Equity Vesting Agreement" (spelling and wording as given).',
    "Do not use a generic one-word document title (for example, only the word 'AGREEMENT' alone).",
  ].join("\n");
  if (!base) return hint.trim();
  return `${base}\n\n${hint}`;
}

export const FOUNDER_AGREEMENT_DETAILS_USER_MESSAGE = "Need 2 details to complete founder agreement";

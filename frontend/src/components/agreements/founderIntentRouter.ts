/**
 * Premium founder / equity / vesting intent: require an explicit professional title, not a generic "AGREEMENT" shell.
 */

export const REQUIRED_FOUNDER_PREMIUM_TITLES = [
  "Founder Vesting Agreement",
  "Founders Agreement",
  "Equity Vesting Agreement",
] as const;

/** Commercial advisor / referral / intro deals must not route to founder vesting. */
const ADVISOR_REFERRAL_COMMERCIAL_EXCLUDE =
  /\b(?:growth\s+advisor|referral\s+agreement|referral\s+fee|referral\s+partner|revenue\s+share|commission|introduc(?:e|es|ing)|channel\s+partner|finder'?s?\s+fee|consulting\s+advisor|advisory\s+agreement|board\s+advisor)\b/i;

/** Contractor / developer commercial deals — not cap-table founder vesting. */
const CONTRACTOR_DEVELOPER_EXCLUDE =
  /\b(?:contractor\s+agreement|independent\s+contractor|developer|work\s+product|1099)\b/i;

/**
 * Commercial services / freelance design deals often say "startup" as the client type.
 * That must not route to founder equity vesting unless strict cap-table cues exist.
 */
const COMMERCIAL_SERVICES_EXCLUDE =
  /\b(?:services?\s+agreement|freelance|flat\s+fee|product\s+designer|ui\s+design|mobile\s+app\s+ui|design\s+services|wireframes?|deliverables?|paid\s+50%|portfolio)\b/i;

/** “Founder-friendly” tone — not an equity vesting request. */
const FOUNDER_FRIENDLY_TONE = /\bfounder[-\s]?friendly\b/i;

/** Strong founder-cap-table signals (not generic "founder" in "growth advisor for founders"). */
const FOUNDER_EQUITY_STRICT =
  /\b(?:founder\s+vesting|founders?\s+agreement|equity\s+vesting|cap\s+table|60\s*\/\s*40|40\s*\/\s*60|cliff|vesting\s+schedule|startup\s+equity|reprice|seed\s+round)\b/i;

/**
 * Weaker founder cues — only used when commercial exclusions do not apply.
 * Bare "startup" is NOT enough (PixelForge-style client descriptions); require
 * founder/vesting/equity language.
 */
const FOUNDER_EQUITY_INTENT = /\b(?:founders?|vesting|equit(?:y|ies))\b/i;

export function isFounderEquityVestingIntent(intakeText: string | null | undefined): boolean {
  const t = (intakeText || "").replace(/\r\n/g, "\n").trim();
  if (!t) return false;
  if (ADVISOR_REFERRAL_COMMERCIAL_EXCLUDE.test(t) && !FOUNDER_EQUITY_STRICT.test(t)) {
    return false;
  }
  if (CONTRACTOR_DEVELOPER_EXCLUDE.test(t) && !FOUNDER_EQUITY_STRICT.test(t)) {
    return false;
  }
  if (COMMERCIAL_SERVICES_EXCLUDE.test(t) && !FOUNDER_EQUITY_STRICT.test(t)) {
    return false;
  }
  if (FOUNDER_FRIENDLY_TONE.test(t) && !FOUNDER_EQUITY_STRICT.test(t)) {
    return false;
  }
  if (FOUNDER_EQUITY_STRICT.test(t)) return true;
  if (/\b(?:referral|revenue\s+share|growth\s+advisor)\b/i.test(t)) return false;
  return FOUNDER_EQUITY_INTENT.test(t);
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

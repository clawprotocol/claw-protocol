/**
 * Extract material commercial protective terms from messy intake prose.
 * These terms are commonly dropped by narrow schema-based parsing but are
 * essential for commercial agreements (referral, services, partnerships).
 *
 * Categories:
 * - exclusivity: exclusive territory, metro exclusivity, exclusivity if volume threshold
 * - noPoach: no-poach, no-hire, non-solicit staff/employees/techs
 * - noCircumvent: no-direct-contact, non-circumvent, no-bypass, anti-bypass
 * - clawback: clawback, chargeback offset, recoup commission
 * - protectedAccounts: house accounts, pre-existing clients, protected accounts
 */

export type CommercialProtectiveTerms = {
  exclusivity: boolean;
  exclusivityText: string;
  noPoach: boolean;
  noPoachText: string;
  noCircumvent: boolean;
  noCircumventText: string;
  clawback: boolean;
  clawbackText: string;
  protectedAccounts: boolean;
  protectedAccountsText: string;
  /** Summary bullet points for additional_terms injection. */
  summaryBullets: string[];
};

const NOISE_TERMS = /\b(?:dog|cat|pet|truck|teal|blue|red|green|color|colour|loves?|hates?|cute|adorable)\b/gi;

function stripNoise(text: string): string {
  return text.replace(NOISE_TERMS, "").replace(/\s{2,}/g, " ").trim();
}

function extractClauseText(text: string, patterns: RegExp[], maxLen = 160): string {
  const t = stripNoise(text);
  for (const p of patterns) {
    const m = t.match(p);
    if (m) {
      const start = m.index ?? 0;
      const end = Math.min(start + maxLen, t.length);
      let slice = t.slice(start, end);
      const sentEnd = slice.search(/[.!?]\s+[A-Z]/);
      if (sentEnd > 20) slice = slice.slice(0, sentEnd + 1);
      else if (slice.length > maxLen - 20) {
        const comma = slice.lastIndexOf(",");
        if (comma > 40) slice = slice.slice(0, comma);
      }
      return slice.trim();
    }
  }
  return "";
}

const EXCLUSIVITY_PATTERNS = [
  /\b(?:metro|territory|regional|geographic|area)\s+exclusiv(?:e|ity)\b[^.!?]{0,120}/i,
  /\bexclusiv(?:e|ity)\s+(?:only\s+)?(?:if|when|while)\b[^.!?]{0,120}/i,
  /\bexclusiv(?:e|ity)\s+(?:zone|area|rights?)\b[^.!?]{0,80}/i,
  /\b(?:exclusiv(?:e|ity))\b[^.!?]{0,100}/i,
];

const NO_POACH_PATTERNS = [
  /\bno[-\s]?poach(?:ing)?\b[^.!?]{0,100}/i,
  /\bno[-\s]?hire?\b[^.!?]{0,80}/i,
  /\bnon[-\s]?solicit(?:ation)?\s+(?:of\s+)?(?:staff|employees?|techs?|workers?|contractors?)\b[^.!?]{0,100}/i,
  /\bnon[-\s]?solicit\b[^.!?]{0,80}/i,
  /\bdon['']?t\s+(?:hire|poach|recruit)\b[^.!?]{0,80}/i,
];

const NO_CIRCUMVENT_PATTERNS = [
  /\bno[-\s]?direct[-\s]?contact\b[^.!?]{0,100}/i,
  /\bnon[-\s]?circumvent(?:ion)?\b[^.!?]{0,100}/i,
  /\banti[-\s]?bypass\b[^.!?]{0,80}/i,
  /\bno[-\s]?bypass(?:ing)?\b[^.!?]{0,80}/i,
  /\bno\s+(?:direct\s+)?(?:contact(?:ing)?|dealing)\s+with\s+(?:our\s+)?clients?\b[^.!?]{0,100}/i,
];

const CLAWBACK_PATTERNS = [
  /\b(?:\d{1,3}[-\s]?day\s+)?clawback\b[^.!?]{0,120}/i,
  /\bclawback\s+(?:on|for|if)\b[^.!?]{0,120}/i,
  /\bchargeback(?:s)?\s+(?:offset|deduct|recoup)\b[^.!?]{0,100}/i,
  /\b(?:cancel(?:lation)?|refund|chargeback)s?\s+(?:come|comes|offset|deduct)s?\s+(?:out|from)\s+(?:un)?paid\s+commission/i,
  /\brecoup\s+commission\b[^.!?]{0,80}/i,
  /\boffset(?:ting)?\s+(?:against\s+)?(?:un)?paid\s+commission/i,
];

const PROTECTED_ACCOUNTS_PATTERNS = [
  /\bhouse\s+accounts?\b[^.!?]{0,80}/i,
  /\bpre[-\s]?existing\s+clients?\b[^.!?]{0,80}/i,
  /\blast[-\s]?year(?:['']?s?)?\s+clients?\b[^.!?]{0,80}/i,
  /\bprotected\s+accounts?\b[^.!?]{0,80}/i,
  /\bexclude\s+(?:house\s+accounts?|existing\s+clients?)\b[^.!?]{0,100}/i,
  /\bno\s+commission\s+on\s+(?:house|pre-existing|existing|prior)\b[^.!?]{0,100}/i,
];

/**
 * Extract material commercial protective terms from raw intake text.
 * Returns signal flags and extracted clause text for each category.
 */
export function extractCommercialProtectiveTerms(intake: string): CommercialProtectiveTerms {
  const t = (intake || "").trim();
  if (!t) {
    return {
      exclusivity: false,
      exclusivityText: "",
      noPoach: false,
      noPoachText: "",
      noCircumvent: false,
      noCircumventText: "",
      clawback: false,
      clawbackText: "",
      protectedAccounts: false,
      protectedAccountsText: "",
      summaryBullets: [],
    };
  }

  const exclusivityText = extractClauseText(t, EXCLUSIVITY_PATTERNS);
  const noPoachText = extractClauseText(t, NO_POACH_PATTERNS);
  const noCircumventText = extractClauseText(t, NO_CIRCUMVENT_PATTERNS);
  const clawbackText = extractClauseText(t, CLAWBACK_PATTERNS);
  const protectedAccountsText = extractClauseText(t, PROTECTED_ACCOUNTS_PATTERNS);

  const summaryBullets: string[] = [];

  if (exclusivityText) {
    summaryBullets.push(formatBullet("Exclusivity", exclusivityText));
  }
  if (noPoachText || noCircumventText) {
    const combo = noPoachText || noCircumventText;
    if (/no-poach|non-solicit/i.test(combo)) {
      summaryBullets.push(formatBullet("Non-solicit / no-poach", combo));
    } else {
      summaryBullets.push(formatBullet("Protective covenant", combo));
    }
  }
  if (noCircumventText && noPoachText && noCircumventText !== noPoachText) {
    summaryBullets.push(formatBullet("Non-circumvent", noCircumventText));
  }
  if (clawbackText) {
    summaryBullets.push(formatBullet("Clawback", clawbackText));
  }
  if (protectedAccountsText) {
    summaryBullets.push(formatBullet("Protected accounts", protectedAccountsText));
  }

  return {
    exclusivity: Boolean(exclusivityText),
    exclusivityText,
    noPoach: Boolean(noPoachText),
    noPoachText,
    noCircumvent: Boolean(noCircumventText),
    noCircumventText,
    clawback: Boolean(clawbackText),
    clawbackText,
    protectedAccounts: Boolean(protectedAccountsText),
    protectedAccountsText,
    summaryBullets,
  };
}

function formatBullet(label: string, text: string): string {
  const clean = text
    .replace(/^[,;:\s]+/, "")
    .replace(/[,;:\s]+$/, "")
    .trim();
  if (clean.length <= 60) return `${label}: ${clean}`;
  const short = clean.slice(0, 55).replace(/\s+\S*$/, "").trim();
  return `${label}: ${short}…`;
}

/**
 * Check if intake text contains material commercial protective terms that
 * should be explicitly preserved in the starter agreement body.
 */
export function intakeContainsCommercialProtectiveTerms(intake: string): boolean {
  const terms = extractCommercialProtectiveTerms(intake);
  return terms.exclusivity || terms.noPoach || terms.noCircumvent || terms.clawback || terms.protectedAccounts;
}

/**
 * Build additional_terms text block from extracted commercial protective terms.
 * Returns empty string if no protective terms were found.
 */
export function buildCommercialProtectiveTermsBlock(intake: string): string {
  const terms = extractCommercialProtectiveTerms(intake);
  if (!terms.summaryBullets.length) return "";
  return terms.summaryBullets.map((b) => `- ${b}`).join("\n");
}

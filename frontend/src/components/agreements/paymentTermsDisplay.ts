/**
 * Display-only normalization for `payment_terms` strings.
 *
 * - `normalizeStarterPaymentTermsForDisplay`: free/basic (starter) review — hides weak AI fragments.
 * - `normalizePaymentTermsForDisplay`: light shaping for non-starter surfaces (net/monthly, empty).
 */

const PLACEHOLDER_TOKEN = /^(ding|y|n\/a|na|tbd|test|none|nil|--|---|\.|n\/a\.)$/i;

/** Head words with no schedule body — common broken partials. */
const INCOMPLETE_HEAD = /^(due|net|pay|payment|invoice|billable|compensation|fee)([\s.:;,\-]*)$/i;

const PREPOSITION_TAIL = /^(on|by|before|after|within)\s*$/i;

/** Polished starter fallbacks when extraction is unusable (starter tier only). */
export const STARTER_PAYMENT_FALLBACK_COMPENSATION = "Compensation terms to be finalized in review.";
export const STARTER_PAYMENT_FALLBACK_PAYMENT = "Payment terms: To be agreed between the parties.";
export const STARTER_PAYMENT_FALLBACK_COMMERCIAL = "Commercial terms to be confirmed before signing.";

function looksLikeIsoDateOnly(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function isLikelyGarbageFragment(s: string): boolean {
  if (PLACEHOLDER_TOKEN.test(s)) return true;
  if (INCOMPLETE_HEAD.test(s)) return true;
  if (PREPOSITION_TAIL.test(s)) return true;
  if (looksLikeIsoDateOnly(s)) return true;
  if (/^\d{1,3}$/.test(s)) return true;
  if (s.length <= 4 && /^[a-z0-9./\-]{1,4}$/i.test(s)) return true;
  if (s.length < 10 && !/[a-z]{4,}/i.test(s) && /^[\d\s\-–—/.:]+$/i.test(s)) return true;
  return false;
}

function meaningfulLetterCount(s: string): number {
  return (s.match(/[a-z]/gi) || []).length;
}

function firstWordLetters(s: string): string {
  const m = s.match(/^([a-zA-Z]+)/);
  return m ? m[1] : "";
}

/** Clipped mid-sentence tail (e.g. "s if sales targets are hit"). */
function startsLikeClippedSentenceFragment(trimmed: string): boolean {
  if (!trimmed.length) return false;
  if (/^[A-Z]/.test(trimmed[0])) return false;
  const fw = firstWordLetters(trimmed);
  if (fw.length <= 1 && /^[a-z]/.test(trimmed)) return true;
  if (fw.length === 2 && /^[a-z]{2}$/.test(fw)) {
    const rest = trimmed.slice(fw.length).trimStart();
    return /^(if|as|when|unless|where|once)\b/i.test(rest);
  }
  return false;
}

function hasLeadingStrayPunctuation(trimmed: string): boolean {
  return /^[,;:\-–—.]+/.test(trimmed);
}

/**
 * True when starter UI should not show the raw string (fragments, clipped extraction, etc.).
 */
export function isWeakStarterPaymentTermsForDisplay(t: string): boolean {
  const s = t.trim();
  if (!s) return true;
  if (isLikelyGarbageFragment(s)) return true;
  if (hasLeadingStrayPunctuation(s)) return true;
  if (startsLikeClippedSentenceFragment(s)) return true;
  if (meaningfulLetterCount(s) < 8 && !/\$/.test(s)) return true;
  return false;
}

/**
 * Deterministic copy when `isWeakStarterPaymentTermsForDisplay` fires — uses hints from the raw fragment when present.
 */
export function pickStarterPaymentTermsFallback(rawForHints: string): string {
  const x = rawForHints.trim().toLowerCase();
  if (/^\d+$/.test(x)) {
    return STARTER_PAYMENT_FALLBACK_PAYMENT;
  }
  if (
    /compensat|commission|bonus|equity|salary|earn|payout|milestone|target|revenue|sales\s+target|royalt/.test(x)
  ) {
    return STARTER_PAYMENT_FALLBACK_COMPENSATION;
  }
  if (/invoice|\bnet\b|net\s*\d|deposit|retainer|\bfee\b|payment|payable|bill|usd|\$|\bdue\b/.test(x)) {
    return STARTER_PAYMENT_FALLBACK_PAYMENT;
  }
  return STARTER_PAYMENT_FALLBACK_COMMERCIAL;
}

function normalizeNetTerms(s: string): string | null {
  const net = s.match(/^net\s*(\d{1,3})\s*\.?$/i);
  if (net) {
    const n = net[1];
    return `Payment due within ${n} days of invoice.`;
  }
  const days = s.match(/^(\d{1,3})\s*days?\s*\.?$/i);
  if (days) {
    return `Payment due within ${days[1]} days of invoice.`;
  }
  return null;
}

function normalizeMonthlyFirst(s: string): string | null {
  if (!/monthly|each month|per month/i.test(s)) return null;
  if (/\b1st\b|first of each month|1\s+of\s+each\s+month/i.test(s)) {
    return "Monthly fee due on the 1st of each month.";
  }
  return null;
}

/**
 * Starter / basic review: replace weak `payment_terms` with polished fallbacks; pass through substantive lines.
 */
export function normalizeStarterPaymentTermsForDisplay(raw: string | null | undefined): string {
  const t = (raw || "").trim().replace(/\s+/g, " ");
  if (!t) return STARTER_PAYMENT_FALLBACK_PAYMENT;
  const lower = t.toLowerCase();
  if (lower === "ding" || lower === "y" || lower === "n/a" || lower === "na" || lower === "tbd" || lower === "test") {
    return STARTER_PAYMENT_FALLBACK_PAYMENT;
  }

  const netLine = normalizeNetTerms(t);
  if (netLine) return netLine;

  const monthlyLine = normalizeMonthlyFirst(t);
  if (monthlyLine) return monthlyLine;

  if (isWeakStarterPaymentTermsForDisplay(t)) {
    return pickStarterPaymentTermsFallback(t);
  }

  if (t.length <= 4 && /^[a-z]{1,4}$/i.test(t)) {
    return pickStarterPaymentTermsFallback(t);
  }

  return t;
}

/**
 * Non-starter surfaces: keep net/monthly normalization and placeholder cleanup only (no fragment heuristics).
 */
export function normalizePaymentTermsForDisplay(raw: string | null | undefined): string {
  const t = (raw || "").trim().replace(/\s+/g, " ");
  if (!t) return "To be agreed between the parties.";
  const lower = t.toLowerCase();
  if (lower === "ding" || lower === "y" || lower === "n/a" || lower === "na" || lower === "tbd" || lower === "test") {
    return "To be agreed between the parties.";
  }

  const netLine = normalizeNetTerms(t);
  if (netLine) return netLine;

  const monthlyLine = normalizeMonthlyFirst(t);
  if (monthlyLine) return monthlyLine;

  if (isLikelyGarbageFragment(t)) {
    return "Compensation as agreed in writing by the parties.";
  }

  if (t.length <= 4 && /^[a-z]{1,4}$/i.test(t)) {
    return "To be agreed between the parties.";
  }

  if (t.length < 8 && !/\$/.test(t) && !/\d{2,}/.test(t)) {
    return "Compensation as agreed in writing by the parties.";
  }

  return t;
}

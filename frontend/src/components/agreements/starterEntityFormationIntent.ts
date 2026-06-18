/**
 * Explicit LLC / entity formation intent — party legal names ending in "LLC" are NOT sufficient.
 */

const EXPLICIT_FORMATION_INTENT_RE =
  /\b(?:operating\s+agreement|llc\s+operating\s+agreement|articles?\s+of\s+organization|certificate\s+of\s+formation|company\s+formation|form(?:ation)?\s+of\s+(?:an?\s+)?(?:llc|limited\s+liability\s+company)|create\s+(?:an?\s+)?(?:llc|limited\s+liability\s+company)|organiz(?:e|ing)\s+(?:an?\s+)?(?:llc|limited\s+liability\s+company|company)|member[-\s]?managed|manager[-\s]?managed|managing\s+member|membership\s+interests?|capital\s+accounts?|capital\s+contributions?)\b/i;

const FORMATION_OWNERSHIP_CONTEXT_RE =
  /\b(?:members?\s*:|ownership\s*:|cap\s*table|equity\s+split|members?\s+of\s+(?:the\s+)?(?:llc|limited\s+liability\s+company)|(?:equity|membership)\s+units?)\b/i;

/** True only when intake explicitly requests entity formation / operating agreement governance. */
export function hasExplicitEntityFormationIntent(rawIntake: string | null | undefined): boolean {
  const t = (rawIntake || "").replace(/\s+/g, " ").trim();
  if (!t) return false;
  if (EXPLICIT_FORMATION_INTENT_RE.test(t)) return true;
  if (/\bllc\b/i.test(t) && FORMATION_OWNERSHIP_CONTEXT_RE.test(t)) return true;
  return false;
}

/** Commercial / services contract titles that must never route to LLC formation shells. */
export function hasExplicitCommercialContractIntent(rawIntake: string | null | undefined): boolean {
  const low = (rawIntake || "").toLowerCase();
  if (!low) return false;
  if (
    /\b(?:tripartite|tri[-\s]?party|three[-\s]?party|3[-\s]?party)\b/.test(low) &&
    /\b(?:software|development|revenue|services?|maintenance|sharing)\b/.test(low) &&
    /\bagreement\b/.test(low)
  ) {
    return true;
  }
  if (/\bsoftware\s+development\b/.test(low) && /\b(?:revenue\s+sharing|revenue\s+share)\b/.test(low)) {
    return true;
  }
  if (/\brevenue\s+sharing\s+agreement\b/.test(low)) return true;
  if (/\bsoftware\s+development\s+and\s+revenue\s+sharing\s+agreement\b/.test(low)) return true;
  if (/\b(?:services?|consulting|development|implementation|integration|maintenance)\s+agreement\b/.test(low)) {
    return true;
  }
  if (/\b(?:lease|purchase|employment|nda|non[-\s]?disclosure|referral|partnership|collaboration)\s+agreement\b/.test(low)) {
    return true;
  }
  return false;
}

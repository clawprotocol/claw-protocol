/**
 * Universal gating so auto-filled recipient / party rows never show intake prose,
 * role fragments, or agreement-request language as if they were legal names.
 */
const COMPANY_ENTITY_SUFFIX =
  /\b(?:LLC|L\.L\.C\.|Inc\.?|Incorporated|Corp\.?|Corporation|Ltd\.?|Limited|LLP|PLLC|PC|P\.C\.|LP|L\.P\.|GmbH|S\.A\.|SARL|BV|NV)\b/i;

const PLACEHOLDER_NAME_HINT =
  /\bparty\s*a\b|\bparty\s*b\b|edit\s+in\s+review|placeholder|to\s+be\s+(?:listed|finalized|added)|\(name\s+in\s+review\)/i;

const FIRST_PERSON =
  /\b(i\s*'?m|i\s+am|i\s+need|i\s+want|i\s+run|i\s+hired|i\s+engaged|we\s+need|we\s+want|i'm\s+a|i\s+was|we\s+are|my\s+company|our\s+team)\b/i;

const AGREEMENT_REQUEST_LANGUAGE =
  /\b(need\s+an\s+agreement|agreement\s+with\s+a?\s*client|two\s+parties|describe\s+your|something\s+in\s+writing|freelance\s+designer|contracting\s+agreement\s+between|help\s+me\s+(?:draft|write|create)|writing\s+an\s+agreement|get\s+an\s+agreement)\b/i;

const PROMPT_VERB_PHRASES =
  /\b(need|want|seeking|looking\s+for|create\s+(?:a|an)\s+agreement|draft\s+(?:a|an)?|build\s+an?\s+agreement|hire\s+a|hiring\s+a)\b/i;

const GENERIC_ROLE_AS_SOLE_NAME =
  /^(?:client|party|vendor|company|business|homeowner|tenant|landlord|consultant|contractor|provider|customer|signer|recipient)$/i;

/** True when the string looks like narrative / request text, not a displayable party name. */
export function isProsePollutedPartyName(name: string): boolean {
  const t = (name || "").replace(/\s+/g, " ").trim();
  if (!t) return true;
  if (PLACEHOLDER_NAME_HINT.test(t)) return true;
  if (/\$/.test(t)) return true;
  if (/\bthey\s+pay\b/i.test(t)) return true;
  if (/\b\d+(?:\.\d+)?\s*k\b/i.test(t) && !COMPANY_ENTITY_SUFFIX.test(t)) return true;
  if (/^(?:(?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+)?(?:days?|weeks?|months?|years?)$/i.test(t)) return true;
  if (/^(?:daily|weekly|monthly|yearly|annually|hourly)$/i.test(t)) return true;
  if (FIRST_PERSON.test(t)) return true;
  if (AGREEMENT_REQUEST_LANGUAGE.test(t)) return true;
  if (PROMPT_VERB_PHRASES.test(t)) return true;

  const words = t.split(/\s+/).filter(Boolean);
  if (words.length === 1 && GENERIC_ROLE_AS_SOLE_NAME.test(t)) return true;

  if (words.length > 4 && !COMPANY_ENTITY_SUFFIX.test(t)) return true;

  const punct = (t.match(/[.,;:!?'"()[\]{}_\-/\\]/g) || []).length;
  const letters = (t.match(/[A-Za-z]/g) || []).length;
  if (t.length > 24 && letters > 0 && punct / letters > 0.22) return true;
  if ((t.match(/,/g) || []).length >= 3) return true;
  if (/[!?]{2,}/.test(t)) return true;

  return false;
}

/**
 * Names trusted for auto-population from structured draft, snapshots, or LLM parse
 * (modal / session handoff can use a slightly looser path in mergePremiumRecipientDisplayName).
 */
export function isHighConfidencePartyNameForAutoPopulation(name: string): boolean {
  const t = (name || "").replace(/\s+/g, " ").trim();
  if (t.length < 2 || t.length > 200) return false;
  if (PLACEHOLDER_NAME_HINT.test(t)) return false;
  if (isProsePollutedPartyName(t)) return false;
  return true;
}

const ROLE_ONLY_SIGNER_NAME_RE =
  /^(?:the\s+)?(?:client|service provider|party\s*[ab]|party\s*\d+)$/i;

/** Role labels the visitor should type over — never seed as a first-Pro signer name. */
export function isRoleOnlyPlaceholderSignerName(name: string): boolean {
  return ROLE_ONLY_SIGNER_NAME_RE.test((name || "").replace(/\s+/g, " ").trim());
}

/**
 * Draft party display names that may prefill a first-Pro signer slot.
 * Real people / entities only (Mike, Red Mesa LLC). Not Client / Service Provider / Party A,
 * not dump sentences, not money or term fragments.
 */
export function isSeedableSignerNameFromDraftParty(name: string): boolean {
  const t = (name || "").replace(/\s+/g, " ").trim();
  if (!t) return false;
  if (isRoleOnlyPlaceholderSignerName(t)) return false;
  return isHighConfidencePartyNameForAutoPopulation(t);
}

export function getSafeFallbackPartyLabels(agreementFamily?: string | null): [string, string] {
  switch (agreementFamily) {
    case "independent_contractor_agreement":
    case "consulting_agreement":
    case "services_agreement":
      return ["Service Provider", "Client"];
    default:
      return ["Party A", "Party B"];
  }
}

export function coercePartyNameForRecipientAutoFill(
  raw: string,
  partySlot: 0 | 1,
  agreementFamily?: string | null,
): string {
  const t = (raw || "").trim().slice(0, 280);
  if (isHighConfidencePartyNameForAutoPopulation(t)) return t;
  const [a, b] = getSafeFallbackPartyLabels(agreementFamily);
  return partySlot === 0 ? a : b;
}

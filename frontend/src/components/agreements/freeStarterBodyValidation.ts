/**
 * Free Starter Generated Body Validation
 *
 * Core validation for free starter drafts — prevents hollow/incomplete bodies
 * from being displayed to users. A free draft body is invalid when:
 *
 * 1. Dump named parties → body must have those names (not role placeholders)
 * 2. Dump had payment/term/law → body must have real content (not empty sections)
 * 3. Dump omitted tenets → body must NOT have hollow headings for those tenets
 *
 * When validation fails after retries, the user sees missing-tenet questions
 * or is redirected to Pro — never a hollow free page.
 */

import { scoreFiveTenets, type FiveTenetDraftInput, type FiveTenetScore } from "./proAgreementFiveTenets";
import type { ParsedDraftShape } from "./intakeSmartDefaults";

export type FreeStarterBodyValidationResult = {
  valid: boolean;
  reasons: string[];
  intakeScore: FiveTenetScore;
  bodyScore: FiveTenetScore;
  hollowSections: string[];
  missingNamedParties: string[];
  rolePlaceholderParties: boolean;
};

const ROLE_PLACEHOLDER_PATTERNS = [
  /^client$/i,
  /^service provider$/i,
  /^the client$/i,
  /^the service provider$/i,
  /^the developer$/i,
  /^the consultant$/i,
  /^the contractor$/i,
  /^the company$/i,
  /^party\s*[a-z]$/i,
  /^contractor$/i,
  /^consultant$/i,
  /^provider$/i,
  /^developer$/i,
];

const HOLLOW_PAYMENT_PATTERNS = [
  /^\s*\d+\.?\s*Payment Terms\s*$/im,
  /Payment Terms\s*\n\s*\n/i,
  /Payment Terms\s*\n\s*(?:\d+\.|$)/i,
  /Payment\s+is\s+due\s+upon\s+completion\s+of\s+services\.?\s*$/i,
  /Compensation\s+as\s+agreed\s+by\s+the\s+parties\.?\s*$/i,
];

const HOLLOW_TERM_PATTERNS = [
  /^\s*\d+\.?\s*(?:Services )?Term(?: and Effective Date)?\s*$/im,
  /Term(?: and Effective Date)?\s*\n\s*\n/i,
  /Term(?: and Effective Date)?\s*\n\s*(?:\d+\.|$)/i,
  /^(?:Term|Duration):\s*(?:\[Not yet specified\]|TBD|N\/A|—|-)\s*$/im,
  /Effective Date:\s*upon full execution by (?:both|all) parties\.?\s*$/i,
];

const HOLLOW_LAW_PATTERNS = [
  /^\s*\d+\.?\s*Governing Law\s*$/im,
  /Governing Law\s*\n\s*\n/i,
  /Governing Law\s*\n\s*(?:\d+\.|$)/i,
  /^Governing Law:\s*(?:\[Not yet specified\]|TBD|N\/A|—|-)\s*$/im,
  /governed by the laws of\s*(?:\[|\()?(?:State|Jurisdiction|TBD|N\/A)(?:\]|\))?/i,
];

const CONCRETE_PAYMENT_INDICATORS = [
  /\$[\d,]+(?:\.\d{2})?/,
  /€[\d,]+(?:\.\d{2})?/,
  /£[\d,]+(?:\.\d{2})?/,
  /\b\d+(?:,\d{3})*(?:\.\d+)?\s*(?:dollars?|usd|eur|gbp)\b/i,
  /\bper\s+(?:hour|day|week|month|year|project|milestone)\b/i,
  /\b\d+\s*%/,
  /\b(?:free|no\s+(?:charge|cost|payment|fee)|gratis|pro\s+bono)\b/i,
  /\b(?:mutual\s+benefit|in-?kind|barter|trade)\b/i,
  /\b(?:rev(?:enue)?\s+share|split|50\/50|equal\s+split)\b/i,
];

const CONCRETE_TERM_INDICATORS = [
  /\b\d+\s*(?:day|week|month|year)s?\b/i,
  /\b(?:perpetual|indefinite|ongoing|until\s+terminated)\b/i,
  /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2},?\s*\d{4}/i,
  /\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/,
];

const CONCRETE_LAW_INDICATORS = [
  /\b(?:california|texas|new\s+york|delaware|florida|illinois|pennsylvania|ohio|georgia|north\s+carolina|michigan|arizona|washington|colorado|massachusetts|virginia|new\s+jersey|tennessee|oregon|nevada|minnesota|wisconsin|maryland|indiana|missouri|wyoming|new\s+mexico|utah|idaho|kansas|nebraska|south\s+dakota|north\s+dakota|montana|louisiana|arkansas|mississippi|alabama|kentucky|maine|vermont|new\s+hampshire|rhode\s+island|connecticut|iowa|west\s+virginia|hawaii|alaska|south\s+carolina|oklahoma)\b/i,
  /\blaws?\s+of\s+(?:the\s+state\s+of\s+)?[A-Z][a-z]+/,
  /\b(?:CA|TX|NY|DE|FL|IL|PA|OH|GA|NC|MI|AZ|WA|CO|MA|VA|NJ|TN|OR|NV|MN|WI|MD|IN|MO|WY|NM|UT|ID|KS|NE|SD|ND|MT|LA|AR|MS|AL|KY|ME|VT|NH|RI|CT|IA|WV|HI|AK|SC|OK)\s+law\b/,
];

function isRolePlaceholderName(name: string): boolean {
  const trimmed = (name || "").trim();
  if (!trimmed) return true;
  return ROLE_PLACEHOLDER_PATTERNS.some((p) => p.test(trimmed));
}

function extractPartyNamesFromIntake(intakeText: string): string[] {
  const names: string[] = [];
  const betweenMatch = intakeText.match(
    /\bbetween\s+([A-Z][A-Za-z0-9&.'\-\s]+?)(?:\s+\([^)]+\))?\s+and\s+([A-Z][A-Za-z0-9&.'\-\s]+?)(?:\s+\([^)]+\))?(?:\.|,|;|\s+for\s|\s+to\s|$)/i
  );
  if (betweenMatch) {
    const p1 = betweenMatch[1].trim().replace(/[.,;]$/, "");
    const p2 = betweenMatch[2].trim().replace(/[.,;]$/, "");
    if (p1 && !isRolePlaceholderName(p1)) names.push(p1);
    if (p2 && !isRolePlaceholderName(p2)) names.push(p2);
  }
  const llcMatches = intakeText.match(
    /\b([A-Z][A-Za-z0-9&.'\-\s]+?\s+(?:LLC|L\.L\.C\.|Inc\.?|Incorporated|Corp\.?|Corporation|Ltd\.?|Limited|LP|L\.P\.|LLP|PLLC|GmbH|PLC|SA|S\.A\.|AG|KG))\b/g
  );
  if (llcMatches) {
    for (const m of llcMatches) {
      const cleaned = m.trim();
      if (cleaned && !isRolePlaceholderName(cleaned) && !names.includes(cleaned)) {
        names.push(cleaned);
      }
    }
  }
  const colonMatches = intakeText.match(
    /\b(?:Client|Provider|Consultant|Contractor|Party\s*[AB12]):\s*([A-Z][A-Za-z0-9&.'\-\s]+?)(?:\.|,|;|\n|$)/gi
  );
  if (colonMatches) {
    for (const m of colonMatches) {
      const nameMatch = m.match(/:\s*([A-Z][A-Za-z0-9&.'\-\s]+?)(?:\.|,|;|\n|$)/i);
      if (nameMatch?.[1]) {
        const cleaned = nameMatch[1].trim().replace(/[.,;]$/, "");
        if (cleaned && !isRolePlaceholderName(cleaned) && !names.includes(cleaned)) {
          names.push(cleaned);
        }
      }
    }
  }
  return names.slice(0, 4);
}

function extractPartyNamesFromBody(bodyText: string): string[] {
  const names: string[] = [];
  const openingMatch = bodyText.match(
    /(?:This Agreement|Agreement)\s+(?:\([^)]+\)\s+)?is\s+(?:entered\s+into\s+)?(?:by\s+and\s+)?between\s+([A-Z][A-Za-z0-9&.'\-\s]+?)(?:\s+\([^)]+\))?\s+and\s+([A-Z][A-Za-z0-9&.'\-\s]+?)(?:\s+\([^)]+\))?(?:\.|,|;|\s+for|\s+regarding|$)/i
  );
  if (openingMatch) {
    const p1 = openingMatch[1].trim().replace(/[.,;]$/, "");
    const p2 = openingMatch[2].trim().replace(/[.,;]$/, "");
    if (p1) names.push(p1);
    if (p2) names.push(p2);
  }
  return names;
}

function bodyHasConcretePayment(bodyText: string): boolean {
  return CONCRETE_PAYMENT_INDICATORS.some((p) => p.test(bodyText));
}

function bodyHasConcreteTerm(bodyText: string): boolean {
  return CONCRETE_TERM_INDICATORS.some((p) => p.test(bodyText));
}

function bodyHasConcreteLaw(bodyText: string): boolean {
  return CONCRETE_LAW_INDICATORS.some((p) => p.test(bodyText));
}

function detectHollowSections(bodyText: string, intakeScore: FiveTenetScore): string[] {
  const hollow: string[] = [];
  const hasPaymentHeading = /\d+\.?\s*Payment Terms/i.test(bodyText);
  const hasTermHeading = /\d+\.?\s*(?:Services )?Term(?: and Effective Date)?/i.test(bodyText);
  const hasLawHeading = /\d+\.?\s*Governing Law/i.test(bodyText);
  if (hasPaymentHeading) {
    const isHollowPayment =
      HOLLOW_PAYMENT_PATTERNS.some((p) => p.test(bodyText)) &&
      !bodyHasConcretePayment(bodyText);
    if (isHollowPayment) {
      if (!intakeScore.payment) {
        hollow.push("payment_heading_without_intake_facts");
      } else {
        hollow.push("payment_heading_empty_body");
      }
    }
  }
  if (hasTermHeading) {
    const isHollowTerm =
      HOLLOW_TERM_PATTERNS.some((p) => p.test(bodyText)) &&
      !bodyHasConcreteTerm(bodyText);
    if (isHollowTerm) {
      if (!intakeScore.term) {
        hollow.push("term_heading_without_intake_facts");
      } else {
        hollow.push("term_heading_empty_body");
      }
    }
  }
  if (hasLawHeading) {
    const isHollowLaw =
      HOLLOW_LAW_PATTERNS.some((p) => p.test(bodyText)) &&
      !bodyHasConcreteLaw(bodyText);
    if (isHollowLaw) {
      if (!intakeScore.governingLaw) {
        hollow.push("governing_law_heading_without_intake_facts");
      } else {
        hollow.push("governing_law_heading_empty_body");
      }
    }
  }
  return hollow;
}

function detectRolePlaceholderParties(bodyText: string, intakeScore: FiveTenetScore): boolean {
  if (!intakeScore.parties) {
    const bodyParties = extractPartyNamesFromBody(bodyText);
    if (bodyParties.length >= 2) {
      const allRolePlaceholders = bodyParties.every(isRolePlaceholderName);
      if (allRolePlaceholders) {
        return true;
      }
    }
    if (/\bbetween\s+(?:Client|Service Provider|Party\s*A)\s+(?:\([^)]+\)\s+)?and\s+(?:Service Provider|Client|Party\s*B)/i.test(bodyText)) {
      return true;
    }
    if (/\bby\s+and\s+between[:\s]*\n?\s*Client\s+\([^)]+\)\s+and\s+Service Provider\b/i.test(bodyText)) {
      return true;
    }
    if (/\bbetween[:\s]*\n?\s*Client\s+\([^)]+\)\s+and\s+Service Provider\b/i.test(bodyText)) {
      return true;
    }
  }
  return false;
}

function detectMissingNamedParties(
  bodyText: string,
  intakeText: string,
  intakeScore: FiveTenetScore
): string[] {
  if (!intakeScore.parties) return [];
  const intakeNames = extractPartyNamesFromIntake(intakeText);
  if (intakeNames.length === 0) return [];
  const bodyLower = bodyText.toLowerCase();
  const missing: string[] = [];
  for (const name of intakeNames) {
    const nameLower = name.toLowerCase();
    const nameWords = nameLower.split(/\s+/).filter((w) => w.length >= 3);
    const allWordsPresent = nameWords.every((w) => bodyLower.includes(w));
    if (!allWordsPresent && !bodyLower.includes(nameLower)) {
      missing.push(name);
    }
  }
  return missing;
}

/**
 * Validate a generated free starter body against the intake.
 *
 * Returns valid=true only when:
 * - If intake named parties, body has those names (not role placeholders)
 * - If intake had payment/term/law, body has real content
 * - No hollow section headings for tenets the intake omitted
 */
export function validateFreeStarterGeneratedBody(
  bodyText: string,
  intakeText: string,
  draft?: FiveTenetDraftInput | null
): FreeStarterBodyValidationResult {
  const reasons: string[] = [];
  const body = (bodyText || "").trim();
  const intake = (intakeText || "").trim();
  if (!body) {
    return {
      valid: false,
      reasons: ["empty_body"],
      intakeScore: scoreFiveTenets(intake, draft),
      bodyScore: scoreFiveTenets("", null),
      hollowSections: [],
      missingNamedParties: [],
      rolePlaceholderParties: false,
    };
  }
  const intakeScore = scoreFiveTenets(intake, draft);
  const bodyScore = scoreFiveTenets(body, null);
  const hollowSections = detectHollowSections(body, intakeScore);
  const rolePlaceholderParties = detectRolePlaceholderParties(body, intakeScore);
  const missingNamedParties = detectMissingNamedParties(body, intake, intakeScore);
  if (hollowSections.length > 0) {
    reasons.push(...hollowSections.map((h) => `hollow:${h}`));
  }
  if (rolePlaceholderParties) {
    reasons.push("role_placeholder_parties_no_intake_names");
  }
  if (missingNamedParties.length > 0) {
    reasons.push(`missing_intake_parties:${missingNamedParties.join(",")}`);
  }
  const valid = reasons.length === 0;
  return {
    valid,
    reasons,
    intakeScore,
    bodyScore,
    hollowSections,
    missingNamedParties,
    rolePlaceholderParties,
  };
}

/**
 * Check if a free starter body should be rejected and retried or redirected.
 *
 * Returns true if the body is too hollow to display on free tier.
 */
export function shouldRejectFreeStarterBody(
  bodyText: string,
  intakeText: string,
  draft?: ParsedDraftShape | null
): { reject: boolean; reasons: string[]; validation: FreeStarterBodyValidationResult } {
  const draftInput: FiveTenetDraftInput | null = draft
    ? {
        title: draft.title,
        parties: (draft.parties || []).map((p) => ({ name: p.name })),
        purpose: draft.purpose,
        payment_terms: draft.payment_terms,
        duration: draft.duration,
        due_date: draft.due_date,
        effective_date: draft.effective_date,
        jurisdiction: draft.jurisdiction,
        payment: draft.payment ? { amount: draft.payment.amount } : null,
      }
    : null;
  const validation = validateFreeStarterGeneratedBody(bodyText, intakeText, draftInput);
  return {
    reject: !validation.valid,
    reasons: validation.reasons,
    validation,
  };
}

export function logFreeStarterBodyValidation(payload: {
  stage: string;
  valid: boolean;
  reasons: string[];
  intakeTenets: FiveTenetScore;
  bodyLen: number;
  retryCount?: number;
}): void {
  if (import.meta.env.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[free-starter-body-validation]", payload);
}

import { isInventedNoFeePayment, isPaymentSemanticallySafe } from "./paymentSemanticGuard";

/**
 * Five Tenets of a Complete Pro Agreement.
 *
 * A Pro agreement is considered "complete" and ready for immediate render
 * (skipping ask-before-draft questions) if all five tenets are present:
 * 1. Parties (2–4 named)
 * 2. Scope / what the deal is
 * 3. Payment / consideration
 * 4. Term / duration
 * 5. Governing law
 */

export type FiveTenetScore = {
  parties: boolean;
  scope: boolean;
  payment: boolean;
  term: boolean;
  governingLaw: boolean;
  score: number;
  isComplete: boolean;
  missingTenets: string[];
};

/** Parsed free/paid draft fields used to score tenets (not dump regex alone). */
export type FiveTenetDraftInput = {
  title?: string | null;
  parties?: Array<{ name?: string | null } | string> | null;
  purpose?: string | null;
  payment_terms?: string | null;
  duration?: string | null;
  due_date?: string | null;
  effective_date?: string | null;
  jurisdiction?: string | null;
  payment?: { amount?: number | string | null; valid?: boolean } | null;
};

const PLACEHOLDER_DURATION_RE = /^(as stated in the agreement body\.?|tbd|n\/?a|to be determined|—|-)$/i;
const DEFAULT_EFFECTIVE_RE = /upon full execution/i;
const PLACEHOLDER_JURISDICTION_RE = /^(tbd|n\/?a|to be determined|unknown|\(empty\)|—|-)$/i;

const PARTY_NAME_PATTERNS = [
  /\b(?:LLC|L\.L\.C\.|Inc\.?|Incorporated|Corp\.?|Corporation|Ltd\.?|Limited|LP|L\.P\.|LLP|PLLC|GmbH|PLC|SA|S\.A\.|AG|KG)\b/i,
  /\b[A-Z][a-z]+\s+(?:and\s+)?[A-Z][a-z]+\b/,
  /\b(?:Party\s*[AB12]|Contractor|Consultant|Provider|Client|Vendor|Customer|Licensor|Licensee|Lender|Borrower)\s*:\s*\w/i,
];

const GENERIC_ROLE_TOKENS = [
  "service provider",
  "the developer",
  "the consultant",
  "the contractor",
  "the client",
  "the company",
  "party a",
  "party b",
];

const ROLE_TOKEN_ONLY_RE =
  /^(?:Service\s+Provider|the\s+Developer|the\s+Consultant|the\s+Contractor|the\s+Client|the\s+Company|Client|Provider|Contractor|Consultant|Developer)\s+(?:will|agrees?|shall|provides?|is|are)\b/i;

const SCOPE_PATTERNS = [
  /\b(?:services?|work|project|deliverables?|scope|develop|build|create|design|provide|maintain|consult|advise)\b/i,
  /\b(?:website|app|software|marketing|consulting|maintenance|support|implementation)\b/i,
  /\b(?:NDA|confidentiality|non-?disclosure|license|lease|loan|settlement)\b/i,
  /\b(?:commission|rep|sales|referral|affiliate|partnership|joint\s+venture)\b/i,
  /\b(?:subscription|saas|platform|api|terms)\b/i,
  /\b(?:creator|influencer|sponsorship|brand|content|posts?|stories)\b/i,
  /\b(?:promissory|lender|borrower|principal|interest|repay)\b/i,
  /\b(?:exclusive|exclusivity|non-?solicit|no-?poach|clawback)\b/i,
  /\b(?:investment|real\s+estate|commercial|revenue\s+share)\b/i,
  /\b(?:job|of\s+the\s+job)\b/i,
];

const PAYMENT_PATTERNS = [
  /\$[\d,]+(?:\.\d+)?/,
  /€[\d,]+(?:\.\d+)?/,
  /£[\d,]+(?:\.\d+)?/,
  /\b\d+(?:,\d{3})*(?:\.\d+)?\s*(?:dollars?|usd|eur|gbp)\b/i,
  /\b(?:payment|fee|compensation|salary|hourly|monthly|annual|retainer|commission|royalty)\b/i,
  /\b(?:free|no\s+(?:charge|cost|payment|fee)|gratis|pro\s+bono)\b/i,
  /\b(?:mutual\s+benefit|in-?kind|barter|trade)\b/i,
  /\bper\s+(?:hour|day|week|month|year|project|milestone|share)\b/i,
  /\b\d+k\b/i,
  /\b(?:paying|paid|pay)\s+\d/i,
  /\b(?:rev(?:enue)?\s+share|split|50\/50|equal\s+(?:profit|split))\b/i,
  /\b\d+\s*%/,
  /\b\d+\s*percent\b/i,
  /\b(?:contributes?\s+equally|split\s+\d+)\b/i,
  /\$[\d,]+\s*\/\s*(?:mo|month|week|wk|hr|hour|day|yr|year)\b/i,
];

const TERM_PATTERNS = [
  /\b\d+\s*(?:day|week|month|year|mnth|mnths|yr|yrs)s?\b/i,
  /\b(?:perpetual|indefinite|ongoing|until\s+terminated)\b/i,
  /\b(?:term|duration|period|timeline|deadline)\s*(?::|is|of)?\s*\d/i,
  /\b(?:effective\s+date|start\s+date|end\s+date|expir(?:es?|ation))\b/i,
  /\b(?:renew|auto-?renew|renewal)\b/i,
  /\b(?:mutual|settlement|release)\b/i,
];

const GOVERNING_LAW_PATTERNS = [
  /\b(?:california|texas|new\s+york|delaware|florida|illinois|pennsylvania|ohio|georgia|north\s+carolina|michigan|arizona|washington|colorado|massachusetts|virginia|new\s+jersey|tennessee|oregon|nevada|minnesota|wisconsin|maryland|indiana|missouri|wyoming|new\s+mexico|utah|idaho|kansas|nebraska|south\s+dakota|north\s+dakota|montana|louisiana|arkansas|mississippi|alabama|kentucky|maine|vermont|new\s+hampshire|rhode\s+island|connecticut|iowa|west\s+virginia|hawaii|alaska|south\s+carolina|oklahoma)\s+law\b/i,
  /\bgoverning\s+law\b/i,
  /\bjurisdiction\b/i,
  /\b(?:CA|TX|NY|DE|FL|IL|PA|OH|GA|NC|MI|AZ|WA|CO|MA|VA|NJ|TN|OR|NV|MN|WI|MD|IN|MO|WY|NM|UT|ID|KS|NE|SD|ND|MT|LA|AR|MS|AL|KY|ME|VT|NH|RI|CT|IA|WV|HI|AK|SC|OK)\s+law\b/,
  /\bstate\s+of\s+[A-Z][a-z]+\b/,
  /\b(?:california|texas|new\s+york|delaware|florida|illinois|pennsylvania|ohio|georgia|north\s+carolina|michigan|arizona|washington|colorado|massachusetts|virginia|new\s+jersey|tennessee|oregon|nevada|minnesota|wisconsin|maryland|indiana|missouri|wyoming|new\s+mexico|utah|idaho|kansas|nebraska|south\s+dakota|north\s+dakota|montana|louisiana|arkansas|mississippi|alabama|kentucky|maine|vermont|new\s+hampshire|rhode\s+island|connecticut|iowa|west\s+virginia|hawaii|alaska|south\s+carolina|oklahoma)\.?\s*$/i,
  /\blaw:\s*(?:california|texas|new\s+york|delaware|florida|illinois|wyoming|new\s+mexico)/i,
  /\btexass?\s+law\b/i,
];

function hasParties(text: string): boolean {
  const lower = text.toLowerCase();
  const trimmed = text.trim();
  
  const roleOnlyOpening = /^(?:Service\s+Provider|The\s+Developer|The\s+Consultant|The\s+Contractor|The\s+Client|The\s+Company)\s+(?:will|agrees?|shall|provides?|is\s+to|are\s+to)\b/i;
  if (roleOnlyOpening.test(trimmed)) {
    const hasLlcOrInc = /\b(?:LLC|L\.L\.C\.|Inc\.?|Incorporated|Corp\.?|Corporation|Ltd\.?|Limited|LP|L\.P\.|LLP|PLLC|GmbH|PLC|SA|S\.A\.|AG|KG)\b/i.test(text);
    const hasLabeledParty = /\b(?:Provider|Client|Consultant|Contractor|Developer|Company):\s*[A-Z][a-z]+/i.test(text);
    const hasBetweenClause = /\b(?:between|among)\s+[A-Z][a-z]+/i.test(text);
    if (!hasLlcOrInc && !hasLabeledParty && !hasBetweenClause) {
      return false;
    }
  }
  
  if (ROLE_TOKEN_ONLY_RE.test(trimmed)) {
    const hasLlcOrInc = /\b(?:LLC|L\.L\.C\.|Inc\.?|Incorporated|Corp\.?|Corporation|Ltd\.?|Limited|LP|L\.P\.|LLP|PLLC|GmbH|PLC|SA|S\.A\.|AG|KG)\b/i.test(text);
    const hasLabeledParty = /\b(?:Provider|Client|Consultant|Contractor|Developer|Company):\s*[A-Z][a-z]+/i.test(text);
    const hasBetweenClause = /\b(?:between|among)\s+[A-Z][a-z]+/i.test(text);
    if (!hasLlcOrInc && !hasLabeledParty && !hasBetweenClause) {
      return false;
    }
  }
  
  for (const token of GENERIC_ROLE_TOKENS) {
    if (lower.includes(token)) {
      const hasLlcOrInc = /\b(?:LLC|L\.L\.C\.|Inc\.?|Incorporated|Corp\.?|Corporation|Ltd\.?|Limited|LP|L\.P\.|LLP|PLLC|GmbH|PLC|SA|S\.A\.|AG|KG)\b/i.test(text);
      const hasBetweenClause = /\b(?:between|among)\s+[A-Z][a-z]+/.test(text);
      const hasLabeledParty = /\b(?:Provider|Client|Consultant|Contractor|Party\s*[AB12]):\s*[A-Z][a-z]+/i.test(text);
      if (!hasLlcOrInc && !hasBetweenClause && !hasLabeledParty) {
        return false;
      }
    }
  }
  
  const partyIndicators = [
    /\b(?:between|among)\s+[A-Z]/i,
    /\bparties?\s*:/i,
    /\b(?:provider|client|consultant|contractor|licensor|licensee|lender|borrower)\s*:\s*[A-Z]/i,
  ];
  const hasIndicator = partyIndicators.some((p) => p.test(text));
  const hasEntityName = PARTY_NAME_PATTERNS.some((p) => p.test(text));
  const hasTwoNames = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b.*\b(?:and|&)\b.*\b[A-Z][a-z]+/i.test(text);
  return hasIndicator || hasEntityName || hasTwoNames;
}

function hasScope(text: string): boolean {
  return SCOPE_PATTERNS.some((p) => p.test(text));
}

function hasPayment(text: string): boolean {
  const hasMoneyPattern = PAYMENT_PATTERNS.some((p) => p.test(text));
  if (hasMoneyPattern) return true;
  const lower = text.toLowerCase();
  if (lower.includes("no payment") || lower.includes("no compensation") || lower.includes("no fee")) {
    return true;
  }
  if (/\bmutual\s+(?:NDA|non-?disclosure|confidentiality)\b/i.test(text)) {
    return true;
  }
  return false;
}

function hasTerm(text: string): boolean {
  return TERM_PATTERNS.some((p) => p.test(text));
}

function hasGoverningLaw(text: string): boolean {
  return GOVERNING_LAW_PATTERNS.some((p) => p.test(text));
}

function namedPartiesFromDraft(draft: FiveTenetDraftInput | null | undefined): string[] {
  return (draft?.parties || [])
    .map((p) => (typeof p === "string" ? p : String(p?.name || "")).trim())
    .filter((n) => n && !/^party\s*[ab12]$/i.test(n));
}

function isPlaceholderDuration(raw: string | null | undefined): boolean {
  const t = (raw || "").trim();
  if (!t) return true;
  return PLACEHOLDER_DURATION_RE.test(t);
}

function isRealPaymentTerms(
  raw: string | null | undefined,
  payment?: { amount?: number | string | null } | null,
): boolean {
  const amt = payment?.amount;
  if (amt != null && String(amt).trim() !== "" && Number(amt) > 0) return true;
  const t = (raw || "").trim();
  if (!t) return false;
  if (isInventedNoFeePayment(t)) return false;
  if (!isPaymentSemanticallySafe(t)) return false;
  return t.length >= 2;
}

function isRealTermFromDraft(draft: FiveTenetDraftInput): boolean {
  const duration = (draft.duration || "").trim();
  if (duration && !isPlaceholderDuration(duration) && !DEFAULT_EFFECTIVE_RE.test(duration)) return true;
  if ((draft.due_date || "").trim()) return true;
  return false;
}

function isRealJurisdiction(raw: string | null | undefined): boolean {
  const t = (raw || "").trim();
  if (!t || PLACEHOLDER_JURISDICTION_RE.test(t)) return false;
  return true;
}

function assembleFiveTenetScore(
  parties: boolean,
  scope: boolean,
  payment: boolean,
  term: boolean,
  governingLaw: boolean,
): FiveTenetScore {
  const presentCount = [parties, scope, payment, term, governingLaw].filter(Boolean).length;
  const missingTenets: string[] = [];
  if (!parties) missingTenets.push("parties");
  if (!scope) missingTenets.push("scope");
  if (!payment) missingTenets.push("payment");
  if (!term) missingTenets.push("term");
  if (!governingLaw) missingTenets.push("governing_law");
  return {
    parties,
    scope,
    payment,
    term,
    governingLaw,
    score: Math.round((presentCount / 5) * 100),
    isComplete: parties && scope && payment && term && governingLaw,
    missingTenets,
  };
}

/**
 * Score a parsed free/paid draft. Empty payment_terms, duration, or jurisdiction
 * are missing tenets even when title/parties/purpose are filled. Does not treat
 * "Mutual NDA" title or placeholder duration as payment/term.
 */
export function scoreFiveTenetsFromDraft(
  draft: FiveTenetDraftInput,
  intakeText = "",
): FiveTenetScore {
  const dump = (intakeText || "").trim();
  const named = namedPartiesFromDraft(draft);
  const purpose = (draft.purpose || "").trim();
  const title = (draft.title || "").trim();
  const parties = named.length >= 2 || hasParties(dump);
  const scope = purpose.length >= 8 || hasScope(purpose) || hasScope(title) || hasScope(dump);
  const payment = isRealPaymentTerms(draft.payment_terms, draft.payment);
  const term = isRealTermFromDraft(draft);
  const governingLaw = isRealJurisdiction(draft.jurisdiction);
  return assembleFiveTenetScore(parties, scope, payment, term, governingLaw);
}

/**
 * Score intake text against the five tenets of a complete Pro agreement.
 * When a parsed draft is provided, score those fields — not dump regex alone.
 */
export function scoreFiveTenets(intakeText: string, draft?: FiveTenetDraftInput | null): FiveTenetScore {
  if (draft) return scoreFiveTenetsFromDraft(draft, intakeText);
  const text = (intakeText || "").trim();
  return assembleFiveTenetScore(
    hasParties(text),
    hasScope(text),
    hasPayment(text),
    hasTerm(text),
    hasGoverningLaw(text),
  );
}

export type ContradictionResult = {
  hasContradiction: boolean;
  contradictionTypes: string[];
  details: string[];
};

/**
 * Detect contradictions in the intake that require clarification.
 * We should never invent parties or governing law when there are contradictions.
 */
export function detectContradictions(intakeText: string): ContradictionResult {
  const text = (intakeText || "").trim();
  const contradictionTypes: string[] = [];
  const details: string[] = [];

  // Detect same party twice (duplicate party names)
  const betweenMatch = text.match(/between\s+([A-Z][A-Za-z\s&.]+?)\s+and\s+([A-Z][A-Za-z\s&.]+?)(?:\.|,|$)/i);
  if (betweenMatch) {
    const party1 = betweenMatch[1].trim().toLowerCase().replace(/[.,]$/, "");
    const party2 = betweenMatch[2].trim().toLowerCase().replace(/[.,]$/, "");
    if (party1 && party2 && party1 === party2) {
      contradictionTypes.push("same_party_twice");
      details.push(`Same party listed twice: "${betweenMatch[1].trim()}"`);
    }
  }

  // Detect conflicting governing law (multiple states/countries)
  const lawMatches: string[] = [];
  const lawPatterns = [
    /\b(california|texas|new\s+york|delaware|florida|illinois|nevada|arizona|washington|oregon|colorado|georgia|north\s+carolina|virginia|massachusetts|pennsylvania|ohio|michigan|new\s+jersey|tennessee|wyoming)\s+law\b/gi,
    /\b(french|german|uk|british|english|canadian|australian|chinese|japanese|indian|mexican|brazilian|spanish|italian)\s+law\b/gi,
  ];
  for (const pattern of lawPatterns) {
    const matches = text.match(pattern);
    if (matches) {
      lawMatches.push(...matches.map((m) => m.toLowerCase()));
    }
  }
  if (lawMatches.length > 1) {
    const uniqueLaws = [...new Set(lawMatches)];
    if (uniqueLaws.length > 1) {
      contradictionTypes.push("conflicting_law");
      details.push(`Conflicting governing laws: ${uniqueLaws.join(", ")}`);
    }
  }

  // Detect "the client is also the provider" type contradictions
  if (/\b(?:client|provider|contractor|service provider)\s+is\s+(?:also|the same as)\s+(?:the\s+)?(?:client|provider|contractor|service provider)\b/i.test(text)) {
    contradictionTypes.push("role_contradiction");
    details.push("Same entity assigned conflicting roles");
  }

  return {
    hasContradiction: contradictionTypes.length > 0,
    contradictionTypes,
    details,
  };
}

/**
 * Determine if we should skip ask-before-draft and render immediately.
 * Skip if all five tenets are present in the intake AND no contradictions.
 */
export function shouldSkipAskAndRenderImmediately(
  intakeText: string,
  draft?: FiveTenetDraftInput | null,
): boolean {
  const contradictions = detectContradictions(intakeText);
  if (contradictions.hasContradiction) return false;
  const score = scoreFiveTenets(intakeText, draft);
  return score.isComplete;
}

/**
 * Extract which topics to ask about based on missing tenets.
 */
export function getMissingTenetTopics(
  intakeText: string,
  draft?: FiveTenetDraftInput | null,
): string[] {
  const score = scoreFiveTenets(intakeText, draft);
  return score.missingTenets.slice(0, 5);
}

export type NoiseFilterResult = {
  cleanedText: string;
  droppedNoise: string[];
  keptMaterial: string[];
};

const FABRICATED_PARTY_PATTERNS = [
  /\bwe\s+agreed\s+on\b/i,
  /\bkeep\s+it\s+simple\b/i,
  /\byou\s+know\s+who\b/i,
  /\btbd\b/i,
  /\blet\s+me\s+think\b/i,
  /\bsomething\s+about\b/i,
];

/**
 * Detect if text contains casual prose that should NOT be parsed as party names.
 * Returns true if the text looks like conversational filler rather than party identification.
 */
export function looksLikeCasualProseNotParties(text: string): boolean {
  const lower = (text || "").toLowerCase().trim();
  if (!lower) return true;
  if (lower.length < 10) return true;
  if (FABRICATED_PARTY_PATTERNS.some((p) => p.test(lower))) return true;
  if (/^(?:contract|deal|agreement|nda|tbd|idk|hmm|uh|um)\s*$/.test(lower)) return true;
  return false;
}

/**
 * Check if the intake is too sparse to draft - must ask questions instead.
 * Returns true if the intake is insufficient and needs clarification.
 */
export function intakeRequiresClarification(
  intakeText: string,
  draft?: FiveTenetDraftInput | null,
): boolean {
  const text = (intakeText || "").trim();
  if (!text || text.length < 15) return true;
  if (!draft && looksLikeCasualProseNotParties(text)) return true;
  const score = scoreFiveTenets(text, draft);
  if (score.isComplete) return false;
  if (score.score === 0) return true;
  // Empty payment, term, or governing law always force a 2–5 ask — even when parties+scope exist.
  if (!score.payment || !score.term || !score.governingLaw) return true;
  if (!score.parties || !score.scope) return true;
  return false;
}

/**
 * Missing tenets to ask before paid generate. Scores the parsed draft when given.
 * Never re-asks parties/scope if those fields are already present. Cap 5.
 */
export function getRequiredClarificationTopics(
  intakeText: string,
  draft?: FiveTenetDraftInput | null,
): string[] {
  const score = scoreFiveTenets(intakeText, draft);
  if (score.isComplete) return [];
  return score.missingTenets.slice(0, 5);
}

function counterpartyHint(draft?: FiveTenetDraftInput | null): string {
  const names = namedPartiesFromDraft(draft);
  return names.find((n) => !/^client$/i.test(n)) || names[0] || "";
}

function looksLikeNda(intakeText: string, draft?: FiveTenetDraftInput | null): boolean {
  const blob = `${draft?.title || ""} ${draft?.purpose || ""} ${intakeText || ""}`;
  return /\b(?:nda|non-?disclosure|confidentiality)\b/i.test(blob);
}

function shortPurpose(draft?: FiveTenetDraftInput | null, intakeText = ""): string {
  const purpose = (draft?.purpose || "").trim().replace(/\.+$/, "");
  if (purpose) return purpose;
  const dump = (intakeText || "").trim().replace(/\.+$/, "");
  return dump.length > 90 ? `${dump.slice(0, 87)}…` : dump;
}

/**
 * 2–5 questions specific to what the visitor already typed. Never suggests Delaware or no-fees.
 */
export function buildLocalMissingTenetQuestions(
  intakeText: string,
  draft?: FiveTenetDraftInput | null,
): string[] {
  const topics = getRequiredClarificationTopics(intakeText, draft);
  const who = counterpartyHint(draft);
  const purpose = shortPurpose(draft, intakeText);
  const nda = looksLikeNda(intakeText, draft);
  const paymentKnown = isRealPaymentTerms(draft?.payment_terms, draft?.payment);

  return topics.slice(0, 5).map((topic) => {
    switch (topic) {
      case "parties":
        return "Who are the parties to this agreement? Please provide full legal names.";
      case "scope":
        return "What is the purpose or scope of this agreement? What services or work will be performed?";
      case "payment":
        if (nda) {
          return who
            ? `This NDA with ${who}${purpose ? ` (${purpose})` : ""} does not list any payment. Is there a fee or other consideration?`
            : `This NDA${purpose ? ` (${purpose})` : ""} does not list any payment. Is there a fee or other consideration?`;
        }
        if (who && purpose) {
          return `${who} is already named for this work (${purpose}), but no payment amount is listed. What are the payment terms?`;
        }
        if (who) {
          return `No payment amount is listed for the agreement with ${who}. What are the payment terms?`;
        }
        return "What are the payment terms? Include amounts, timing, and any conditions.";
      case "term":
        if (who) {
          return `How long does this agreement with ${who} last? When does it start and end?`;
        }
        return "What is the duration of this agreement? When does it start and end?";
      case "governing_law":
        if (nda && who) {
          return `This NDA with ${who}${purpose ? ` (${purpose})` : ""} does not say which state's law governs. Which state's law should apply?`;
        }
        if (paymentKnown && who) {
          const pay = (draft?.payment_terms || "").trim();
          return pay
            ? `${who} is already named and payment is ${pay}, but no governing law was given. Which state's law should govern this agreement?`
            : `${who} is already named, but no governing law was given. Which state's law should govern this agreement?`;
        }
        if (who) {
          return `${who} is already named, but no governing law was given. Which state's law should govern this agreement?`;
        }
        return "Which state's law should govern this agreement?";
      default:
        return `Please clarify: ${topic}`;
    }
  });
}

/**
 * Enhanced check that includes contradiction detection.
 * Returns true if we should ask questions (contradictions or missing tenets).
 */
export function shouldAskDueToContradictionsOrMissing(
  intakeText: string,
  draft?: FiveTenetDraftInput | null,
): boolean {
  const contradictions = detectContradictions(intakeText);
  if (contradictions.hasContradiction) return true;
  return intakeRequiresClarification(intakeText, draft);
}

const NOISE_PATTERNS = [
  /\b(?:my\s+)?(?:dog|cat|pet)(?:'s)?\s+(?:name\s+is\s+|is\s+named\s+)?[A-Z][a-z]+/gi,
  /\b(?:also\s+)?my\s+(?:dog|cat|pet)\s+is\s+named\s+\w+/gi,
  /\b(?:it's|it\s+is)\s+(?:raining|sunny|cloudy|snowing|hot|cold)\s+(?:today|outside)?\b/gi,
  /\b(?:the\s+)?weather\s+(?:is|in)\s+[^.]+?(?:\d+\s*degrees?)?/gi,
  /\bmy\s+(?:truck|car|vehicle)\s+is\s+\w+/gi,
  /\bmy\s+(?:cousin|friend|neighbor)\s+(?:recommended|told|said)\b[^.]*\./gi,
  /\bhad\s+coffee\s+this\s+morning\b/gi,
  /\babout\s+\d+\s*degrees?\b/gi,
  /\bi\s+like\s+the\s+color\s+\w+/gi,
  /\bignore\s+that\b/gi,
];

/**
 * Filter noise from intake text while preserving material commercial terms.
 */
export function filterNoiseFromIntake(intakeText: string): NoiseFilterResult {
  let text = (intakeText || "").trim();
  const droppedNoise: string[] = [];

  for (const pattern of NOISE_PATTERNS) {
    const matches = text.match(pattern);
    if (matches) {
      for (const match of matches) {
        droppedNoise.push(match.trim());
      }
      text = text.replace(pattern, "").trim();
    }
  }

  text = text.replace(/\s{2,}/g, " ").replace(/\s+([.,;:])/g, "$1").trim();

  const keptMaterial: string[] = [];
  const materialPatterns = [
    /\$[\d,]+(?:\.\d+)?/g,
    /\b\d+\s*%/g,
    /\b\d+\s*(?:day|week|month|year)s?\b/gi,
    /\b(?:exclusive|non-?exclusive)\b/gi,
    /\b(?:clawback|claw\s+back)\b/gi,
    /\b(?:commission|royalty|fee|payment)\b/gi,
    /\b(?:no-?poach|non-?solicit)\b/gi,
  ];

  for (const pattern of materialPatterns) {
    const matches = text.match(pattern);
    if (matches) {
      keptMaterial.push(...matches.map((m) => m.trim()));
    }
  }

  return {
    cleanedText: text,
    droppedNoise,
    keptMaterial: [...new Set(keptMaterial)],
  };
}

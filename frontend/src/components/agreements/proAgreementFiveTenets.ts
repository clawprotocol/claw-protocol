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

const PARTY_NAME_PATTERNS = [
  /\b(?:LLC|L\.L\.C\.|Inc\.?|Incorporated|Corp\.?|Corporation|Ltd\.?|Limited|LP|L\.P\.|LLP|PLLC|GmbH|PLC)\b/i,
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
];

const PAYMENT_PATTERNS = [
  /\$[\d,]+(?:\.\d{2})?/,
  /€[\d,]+(?:\.\d{2})?/,
  /£[\d,]+(?:\.\d{2})?/,
  /\b\d+(?:,\d{3})*(?:\.\d{2})?\s*(?:dollars?|usd|eur|gbp)\b/i,
  /\b(?:payment|fee|compensation|salary|hourly|monthly|annual|retainer|commission|royalty)\b/i,
  /\b(?:free|no\s+(?:charge|cost|payment)|gratis|pro\s+bono)\b/i,
  /\bper\s+(?:hour|day|week|month|year|project|milestone)\b/i,
  /\b\d+k\b/i,
  /\b(?:paying|paid|pay)\s+\d/i,
  /\b(?:rev(?:enue)?\s+share|split|50\/50)\b/i,
  /\b\d+%\b/,
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
    const hasLlcOrInc = /\b(?:LLC|L\.L\.C\.|Inc\.?|Incorporated|Corp\.?|Corporation|Ltd\.?|Limited|LP|L\.P\.|LLP|PLLC|GmbH|PLC)\b/i.test(text);
    const hasLabeledParty = /\b(?:Provider|Client|Consultant|Contractor|Developer|Company):\s*[A-Z][a-z]+/i.test(text);
    const hasBetweenClause = /\b(?:between|among)\s+[A-Z][a-z]+/i.test(text);
    if (!hasLlcOrInc && !hasLabeledParty && !hasBetweenClause) {
      return false;
    }
  }
  
  if (ROLE_TOKEN_ONLY_RE.test(trimmed)) {
    const hasLlcOrInc = /\b(?:LLC|L\.L\.C\.|Inc\.?|Incorporated|Corp\.?|Corporation|Ltd\.?|Limited|LP|L\.P\.|LLP|PLLC|GmbH|PLC)\b/i.test(text);
    const hasLabeledParty = /\b(?:Provider|Client|Consultant|Contractor|Developer|Company):\s*[A-Z][a-z]+/i.test(text);
    const hasBetweenClause = /\b(?:between|among)\s+[A-Z][a-z]+/i.test(text);
    if (!hasLlcOrInc && !hasLabeledParty && !hasBetweenClause) {
      return false;
    }
  }
  
  for (const token of GENERIC_ROLE_TOKENS) {
    if (lower.includes(token)) {
      const hasLlcOrInc = /\b(?:LLC|L\.L\.C\.|Inc\.?|Incorporated|Corp\.?|Corporation|Ltd\.?|Limited|LP|L\.P\.|LLP|PLLC|GmbH|PLC)\b/i.test(text);
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

/**
 * Score intake text against the five tenets of a complete Pro agreement.
 */
export function scoreFiveTenets(intakeText: string): FiveTenetScore {
  const text = (intakeText || "").trim();
  const parties = hasParties(text);
  const scope = hasScope(text);
  const payment = hasPayment(text);
  const term = hasTerm(text);
  const governingLaw = hasGoverningLaw(text);

  const presentCount = [parties, scope, payment, term, governingLaw].filter(Boolean).length;
  const score = Math.round((presentCount / 5) * 100);
  const isComplete = parties && scope && payment && term && governingLaw;

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
    score,
    isComplete,
    missingTenets,
  };
}

/**
 * Determine if we should skip ask-before-draft and render immediately.
 * Skip if all five tenets are present in the intake.
 */
export function shouldSkipAskAndRenderImmediately(intakeText: string): boolean {
  const score = scoreFiveTenets(intakeText);
  return score.isComplete;
}

/**
 * Extract which topics to ask about based on missing tenets.
 */
export function getMissingTenetTopics(intakeText: string): string[] {
  const score = scoreFiveTenets(intakeText);
  return score.missingTenets;
}

export type NoiseFilterResult = {
  cleanedText: string;
  droppedNoise: string[];
  keptMaterial: string[];
};

const NOISE_PATTERNS = [
  /\b(?:my\s+)?(?:dog|cat|pet)(?:'s)?\s+(?:name\s+is\s+)?[A-Z][a-z]+/gi,
  /\b(?:it's|it\s+is)\s+(?:raining|sunny|cloudy|snowing|hot|cold)\s+(?:today|outside)?\b/gi,
  /\b(?:the\s+)?weather\s+(?:is|in)\s+[^.]+?(?:\d+\s*degrees?)?/gi,
  /\bmy\s+(?:truck|car|vehicle)\s+is\s+\w+/gi,
  /\bmy\s+(?:cousin|friend|neighbor)\s+(?:recommended|told|said)\b[^.]*\./gi,
  /\bhad\s+coffee\s+this\s+morning\b/gi,
  /\babout\s+\d+\s*degrees?\b/gi,
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
    /\$[\d,]+(?:\.\d{2})?/g,
    /\b\d+\s*(?:day|week|month|year)s?\b/gi,
    /\b(?:exclusive|non-?exclusive)\b/gi,
    /\b(?:clawback|claw\s+back)\b/gi,
    /\b(?:commission|royalty|fee|payment)\b/gi,
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

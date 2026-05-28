/**
 * LawDog Pro — universal paid intent “contract” (routing + validation + model guidance).
 * Not a legal contract; product-level constraints so Pro never ships a wrong-category shell.
 */
import { resolveDeterministicIntentTitleAndSeed, type DeterministicIntentResolution } from "./deterministicIntentTitleMapper";
import {
  getResolvedTitleForFounderGating,
  hasRequiredFounderPremiumTitle,
  isFounderEquityVestingIntent,
} from "./founderIntentRouter";
import { extractIntakePayment, hasExplicitPerInstallmentAmountInIntake, normalizeCurrency } from "./intakeCurrencyParse";
import { isLikelyFiveSectionStarterShellPro } from "./premiumFullDraftClientAcceptance";

const FOUNDRY_CUES = /\b(60\s*\/\s*40|40\s*\/\s*60|vesting|founder equity|cap table|four-?year|cliff|accelerat)/i;
/** Estate/family context only — exclude modal “will” (e.g. “Party A will pay”). */
const ESTATE_CUES =
  /\b(estate|sibling|inherit|probate|(?:last|living)\s+will|testament|executor|heir|dad|mom|parent|descendent)\b/i;
const FOUNDRY_LIKELY = /\b(vest|founder|60\s*\/\s*40|startup equity|reprice|s\d{1}\b|seeds?\s+round)/i;

/** Same rules as `rejectCrossPromptContamination` in paid-pro (duplicated to avoid an import cycle). */
function crossIntakeContamination(
  text: string,
  intakeLower: string,
): { ok: boolean; reasons: string[] } {
  const low = (text || "").toLowerCase();
  const il = (intakeLower || "").toLowerCase();
  const r: string[] = [];
  if (ESTATE_CUES.test(il) && FOUNDRY_CUES.test(low) && !ESTATE_CUES.test(low) && !/\b(sibling|estate|probate|heir|inherit|will|executor)\b/i.test(low)) {
    r.push("intake_category_estate_vs_founder_vesting_body");
  }
  if (il.includes("sibling") && (/\b60\s*\/\s*40\b/.test(low) || /\bvesting between two\s+founders?/i.test(low))) {
    r.push("estate_sibling_mismatch_vesting_founders");
  }
  if (ESTATE_CUES.test(il) && FOUNDRY_CUES.test(low) && FOUNDRY_LIKELY.test(low) && !il.includes("vest") && !il.includes("founder")) {
    r.push("intake_not_founder_body_has_founder_mechanics");
  }
  return { ok: r.length === 0, reasons: r };
}

export type AgreementAmbiguityPolicy = "require_user_details" | "allow_neutral_draft" | "unknown";

export type AgreementIntentId =
  | "design_creative"
  | "software_web_dev"
  | "loan_repayment"
  | "founder_equity_vesting"
  | "estate_family_admin"
  | "rent_roommate_property"
  | "nda_confidentiality"
  | "consulting_services"
  | "employment_contractor"
  | "settlement_dispute"
  | "custom_unknown";

export type AgreementIntentContract = {
  intent_id: AgreementIntentId;
  expected_title_terms: string[];
  required_material_terms: string[];
  forbidden_misclassifications: string[];
  minimum_section_expectations: string;
  ambiguity_policy: AgreementAmbiguityPolicy;
  /** When true, server failure or bad output must not show stitched preview as successful Pro. */
  pro_strict: boolean;
  /** One-line for the model: preserve these user facts. */
  user_fact_summary: string;
};

const ESTATE =
  /\b(estate|sibling|inherit|probate|(?:last|living)\s+will|testament|executor|heir|dad|mom|parent|descendent|funeral|caregiving|elder)\b/i;
const SERVICES_AGREEMENT =
  /\b(?:simple\s+)?services?\s+agreement\b|\bprofessional\s+services?\s+agreement\b|\bmaster\s+services?\s+agreement\b/i;
const RENT = /\b(roommate|sublet|lease|landlord|tenant|rent|utilities?|security\s+deposit|hoa|premises|unit)\b/i;
const NDA = /\b(nda|non[-\s]?disclosure|confidentiality\s+agreement|confidential\s+information|trade\s+secret)\b/i;
const SETTLE = /\b(settlement|mutual\s+release|release\s+of\s+claims|dispute\s+settled|dismiss(ing|ed)?\s+with\s+prejudice)\b/i;
const EMP = /\b(employment|w-2|w2|at-?will|employee|salary|payroll|offer\s+letter|job\s+title|benefits\s+package)\b/i;
const C1099 = /\b(1099|independent\s+contractor|freelance|consulting\s+agreement|sow|retainer|hourly\s+rate)\b/i;
const CONSULT = /\b(consult|advisory|retainer|msa|master\s+service|sow|deliverables|statement\s+of\s+work)\b/i;
const LOAN = /\b(loan|lent|borrow|lend|repay|installment|promissory|principal|interest|apr|iou)\b/i;
const WEB =
  /\b(website|web\s*site|web\s+app|saas|api|software\s+develop|devops|hosting|cms|web\s+build|reseller|white[-\s]?label|workflow\s+automation|ai\s+workflow|workflow\s+setup)\b/i;
const DESIGN = /\b(logo|brand|graphic\s+design|illustrat|creative\s+direct|design\s+services|branding)\b/i;

function collapse(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function factSummary(raw: string, max = 1_200): string {
  const t = collapse(raw);
  if (!t) return "";
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

/**
 * Product deterministic bucket id (e.g. from `context.deterministic_intent_id`) → universal `AgreementIntentId`
 * for analytics and Pro routing. Aligned with `fromDeterministic`.
 */
export function mapDeterministicIntentIdToAgreementIntentId(
  detId: string | null | undefined,
): AgreementIntentId | null {
  if (!detId) return null;
  return (
    (
      {
        logo_brand: "design_creative",
        graphic_design: "design_creative",
        web_presence: "software_web_dev",
        loan: "loan_repayment",
        founder_equity: "founder_equity_vesting",
        growth_advisor: "consulting_services",
      } as const satisfies Record<string, AgreementIntentId>
    )[detId] ?? null
  );
}

function fromDeterministic(
  det: DeterministicIntentResolution,
  raw: string,
): AgreementIntentContract {
  const idMap: Record<string, { intent: AgreementIntentId; extraTerms: string[]; minSec: string; forbid: string[] }> = {
    logo_brand: {
      intent: "design_creative",
      extraTerms: [
        "Design Services Agreement",
        "deliverable",
        "revisions",
        "fee",
        "acceptance",
        "out of scope",
      ],
      minSec:
        "Title must read as a Logo or Design Services agreement. Cover logo/brand deliverables, included revision rounds, flat fee, IP/ownership, acceptance, and out-of-scope revision billing — not software/review services or generic commercial ‘review’ framing.",
      forbid: ["at-will employment", "vesting cliff for founders", "estate distribution"],
    },
    graphic_design: {
      intent: "design_creative",
      extraTerms: ["scope", "design", "work product", "IP"],
      minSec: "Project scope, fees, change/revision handling, IP in commissioned work.",
      forbid: ["60/40 founders", "vesting", "estate personal representative"],
    },
    web_presence: {
      intent: "software_web_dev",
      extraTerms: [
        "development",
        "web",
        "software",
        "application",
        "developer",
        "client",
        "acceptance",
        "scope",
        "site",
        "saas",
        "api",
        "services",
      ],
      minSec: "Build scope, acceptance, change orders, IP, warranty/support, fees.",
      forbid: ["at-will", "estate bequest", "vesting for equity holders"],
    },
    loan: {
      intent: "loan_repayment",
      extraTerms: ["principal", "repay", "borrower", "lender"],
      minSec: "Principal, interest (if any), repayment cadence, default, notices; preserve principal vs installment amount distinction.",
      forbid: ["60/40 between founders for equity", "at-will", "estate trust distribution"],
    },
    founder_equity: {
      intent: "founder_equity_vesting",
      extraTerms: ["vesting", "equity", "founder"],
      minSec: "Vesting, grants/repurchase, IP, confidentiality, roles; not generic B2B services only.",
      forbid: ["estate bequest to siblings", "logo revision rounds for brand agency"],
    },
    growth_advisor: {
      intent: "consulting_services",
      extraTerms: ["advisor", "advisory", "growth", "revenue share", "services"],
      minSec: "Advisory scope, compensation (retainer, hourly, or revenue share), confidentiality, IP, and term.",
      forbid: ["founder vesting schedule", "cap table repurchase", "estate administration"],
    },
  };
  const row = idMap[det.id];
  if (!row) {
    return contractUnknown(factSummary(raw), raw.length);
  }
  const designRequired =
    row.intent === "design_creative" && (det.id === "logo_brand" || det.id === "graphic_design")
      ? det.id === "logo_brand"
        ? ["logo", "revision", "deliverable", "fee", "ip", "accept", "copyright", "scope", "change"]
        : ["design", "scope", "deliverable", "fee", "ip", "accept", "revisions", "project"]
      : null;
  return {
    intent_id: row.intent,
    expected_title_terms: [det.title, ...row.extraTerms.slice(0, 6)],
    required_material_terms:
      row.intent === "loan_repayment"
        ? ["principal", "lender", "parties", "agreement", "shall", "repay", "installment", "note", "borrower"]
        : designRequired ?? [det.title.split(" ")[0] ?? "Agreement", "parties", "agreement", "shall", "ip", "confidential"],
    forbidden_misclassifications: row.forbid,
    minimum_section_expectations: row.minSec,
    ambiguity_policy: "require_user_details",
    pro_strict: true,
    user_fact_summary: factSummary(raw),
  };
}

function contractEstate(raw: string): AgreementIntentContract {
  return {
    intent_id: "estate_family_admin",
    expected_title_terms: [
      "Family",
      "Estate",
      "Memorandum",
      "Administration",
      "Agreement",
      "Care",
      "TBD",
    ],
    required_material_terms: ["estate", "family", "signature", "duties", "heir", "sibling", "parent"],
    forbidden_misclassifications: ["msa for vendor", "SaaS subscription", "at-will", "60/40 vesting for founders", "NDA for trade secrets in employment"],
    minimum_section_expectations: "Family/estate roles, decision rights, and administration steps appropriate to a non-commercial family prompt — not a commercial services MSA stack.",
    ambiguity_policy: "require_user_details",
    pro_strict: true,
    user_fact_summary: factSummary(raw),
  };
}

function contractRent(raw: string): AgreementIntentContract {
  return {
    intent_id: "rent_roommate_property",
    expected_title_terms: ["Lease", "Rental", "Roommate", "Tenancy", "Housing", "Property"],
    required_material_terms: ["rent", "premises", "landlord", "tenant", "utilities", "deposit", "roommate", "lease"],
    forbidden_misclassifications: ["SaaS development", "founder vesting", "referral commission"],
    minimum_section_expectations: "Premises, rent, utilities, maintenance, and roommate/household allocation when stated — not enterprise vendor terms.",
    ambiguity_policy: "require_user_details",
    pro_strict: true,
    user_fact_summary: factSummary(raw),
  };
}

function contractNda(raw: string): AgreementIntentContract {
  return {
    intent_id: "nda_confidentiality",
    expected_title_terms: ["Non-Disclosure", "NDA", "Confidentiality", "Disclosure", "Proprietary"],
    required_material_terms: ["confidential", "disclose", "information", "protect"],
    forbidden_misclassifications: ["estate executor duties", "rent due", "vesting schedule for shares"],
    minimum_section_expectations: "Confidential information, permitted use, return/destruction, term, and remedies appropriate to a confidentiality relationship.",
    ambiguity_policy: "require_user_details",
    pro_strict: true,
    user_fact_summary: factSummary(raw),
  };
}

function contractSettlement(raw: string): AgreementIntentContract {
  return {
    intent_id: "settlement_dispute",
    expected_title_terms: ["Settlement", "Release", "Resolution", "Dispute", "Mutual"],
    required_material_terms: ["release", "settlement", "claims", "consideration", "dismiss", "mutual"],
    forbidden_misclassifications: ["logo file formats", "web hosting SLA", "founder 4-year vesting"],
    minimum_section_expectations: "Consideration, releases, confidentiality of settlement, and no-relitigation; not a creative services SOW unless intake says so.",
    ambiguity_policy: "require_user_details",
    pro_strict: true,
    user_fact_summary: factSummary(raw),
  };
}

function contractEmployment(raw: string): AgreementIntentContract {
  return {
    intent_id: "employment_contractor",
    expected_title_terms: ["Employment", "Contractor", "Independent", "At-Will", "Consulting", "Statement of Work"],
    required_material_terms: ["compensation", "duties", "term", "termination", "work"],
    forbidden_misclassifications: ["estate heir shares", "roommate split", "SaaS uptime SLA for unrelated product"],
    minimum_section_expectations: "Duties, comp, term/termination, IP for work product, and classification-appropriate terms.",
    ambiguity_policy: "require_user_details",
    pro_strict: true,
    user_fact_summary: factSummary(raw),
  };
}

function contractConsulting(raw: string): AgreementIntentContract {
  return {
    intent_id: "consulting_services",
    expected_title_terms: ["Consulting", "Services", "Professional", "Advisory", "MSA", "SOW", "Retainer"],
    required_material_terms: ["services", "fees", "scope", "deliverables", "invoic"],
    forbidden_misclassifications: ["sibling estate partition", "founder cliff", "lease premises"],
    minimum_section_expectations: "Scope, fees, IP, change control, acceptance, and term — generic five-slot is insufficient.",
    ambiguity_policy: "allow_neutral_draft",
    pro_strict: true,
    user_fact_summary: factSummary(raw),
  };
}

/** True when intake describes a B2B/commercial services deal (not family estate administration). */
export function isCommercialServicesIntake(raw: string | null | undefined): boolean {
  const t = collapse((raw || "").replace(/\r\n/g, "\n"));
  if (!t) return false;
  const low = t.toLowerCase();
  if (intakeHasEstateFamilyContext(t)) return false;
  if (SERVICES_AGREEMENT.test(t)) return true;
  if (
    /\b(LLC|L\.L\.C\.|Inc\.|Corp\.|Corporation|Ltd\.)\b/i.test(t) &&
    /\$|(?:\d{1,3}(?:,\d{3})+)\s*(?:usd|dollars?)?/i.test(t) &&
    /\b(services?|scope|workflow|setup|deliver|project|agreement between)\b/i.test(low)
  ) {
    return true;
  }
  return false;
}

export function intakeHasEstateFamilyContext(raw: string | null | undefined): boolean {
  return ESTATE.test(collapse((raw || "").replace(/\r\n/g, "\n")));
}

type ValidationMinimumElementsInput = {
  passed?: boolean;
  minimum_contract_elements?: {
    identifiable_parties?: boolean;
    agreement_purpose_or_scope?: boolean;
    exchange_of_value_or_consideration?: boolean;
    obligations_or_performance?: boolean;
    execution_or_acceptance_mechanism?: boolean;
  };
};

export function validationMinimumContractElementsSatisfied(
  validation: ValidationMinimumElementsInput | null | undefined,
): boolean {
  if (!validation || validation.passed !== true) return false;
  const m = validation.minimum_contract_elements;
  if (!m) return false;
  return Boolean(
    m.identifiable_parties &&
      m.agreement_purpose_or_scope &&
      m.exchange_of_value_or_consideration &&
      m.obligations_or_performance &&
      m.execution_or_acceptance_mechanism,
  );
}

/**
 * Paid Pro validation intent: fixes modal-“will” estate misroutes and prefers commercial services
 * when backend validation confirms minimum contract elements.
 */
export function resolvePaidProIntentContract(args: {
  rawIntake: string | null | undefined;
  draftFamily?: string | null;
  agreementValidation?: ValidationMinimumElementsInput | null;
}): AgreementIntentContract {
  const raw = collapse((args.rawIntake || "").replace(/\r\n/g, "\n"));
  let contract = resolveAgreementIntentContract(raw);
  const family = (args.draftFamily || "").toLowerCase();
  const validationOk = validationMinimumContractElementsSatisfied(args.agreementValidation);

  if (contract.intent_id === "estate_family_admin" && isCommercialServicesIntake(raw)) {
    contract = contractConsulting(raw);
  } else if (validationOk && contract.intent_id === "estate_family_admin") {
    contract = contractConsulting(raw);
  } else if (
    validationOk &&
    /services|consult|professional|software|web|generic_business/i.test(family) &&
    contract.intent_id === "estate_family_admin"
  ) {
    contract = contractConsulting(raw);
  }

  return contract;
}

function contractUnknown(summary: string, len: number): AgreementIntentContract {
  const longEnough = len >= 36;
  return {
    intent_id: "custom_unknown",
    expected_title_terms: ["Agreement", "Contract", "TBD", "parties", "Service"],
    required_material_terms: [],
    forbidden_misclassifications: [],
    minimum_section_expectations: "A coherent, operative agreement shaped to the user's own nouns and numbers; not a thin five-section preview.",
    ambiguity_policy: longEnough ? "allow_neutral_draft" : "unknown",
    pro_strict: false,
    user_fact_summary: summary,
  };
}

/**
 * Resolves a single best-fit intent for LawDog Pro routing, validation, and model constraints.
 * Order: deterministic title map → category cues (specific first) → unknown.
 */
export function resolveAgreementIntentContract(rawIntake: string | null | undefined): AgreementIntentContract {
  const raw = collapse((rawIntake || "").replace(/\r\n/g, "\n"));
  if (!raw) {
    return contractUnknown("", 0);
  }
  const low = raw.toLowerCase();
  /* "60/40" often hits founder/vesting regex, but a roommate+utility split is property allocation, not cap table. */
  if (RENT.test(raw) && (/\broommate\b/.test(low) || /\butilities?\b/.test(low)) && /\b60\s*\/\s*40\b/.test(raw)) {
    if (!/\b(founder|vesting|equit(y|ies)|cliff|cap table|shares?|startup)\b/i.test(raw)) {
      return contractRent(raw);
    }
  }
  const det = resolveDeterministicIntentTitleAndSeed(raw);
  if (det) {
    return fromDeterministic(det, raw);
  }
  if (RENT.test(raw)) {
    return contractRent(raw);
  }
  if (
    /\b(growth\s+advisor|advisory\s+agreement|consulting\s+advisor|board\s+advisor)\b/i.test(low) &&
    !/\b(?:founder\s+vesting|cap\s+table)\b/i.test(low)
  ) {
    return contractConsulting(raw);
  }
  if (
    /\b(referral\s+agreement|referral\s+fee|channel\s+partner)\b/i.test(raw) ||
    (/\b(revenue\s+share|commission)\b/i.test(raw) &&
      /\b(?:referral|introduc(?:e|es|ing))\b/i.test(raw) &&
      !/\b(?:growth\s+advisor|advisory\s+agreement)\b/i.test(low))
  ) {
    return contractConsulting(raw);
  }
  if (
    /\b(joint\s+venture|jv\b)\b/i.test(low) ||
    (/\b(profit\s+split|deadlock|contribu|earnest\s+money)\b/i.test(low) &&
      /\b(project|rehab|houses?|collaborat)\b/i.test(low))
  ) {
    return contractConsulting(raw);
  }
  if (
    /\b(software\s+)?license\s+agreement\b/i.test(low) ||
    (/\bsoftware\s+licen[cs]e\b/i.test(low) && !/\b(?:develop|implementation)\b/i.test(low))
  ) {
    return contractConsulting(raw);
  }
  if (isFounderEquityVestingIntent(raw)) {
    return fromDeterministic(
      { id: "founder_equity", title: "Founder Vesting Agreement", clausePackSeed: "" } as DeterministicIntentResolution,
      raw,
    );
  }
  if (SERVICES_AGREEMENT.test(raw) && isCommercialServicesIntake(raw)) {
    return contractConsulting(raw);
  }
  if (intakeHasEstateFamilyContext(raw) && !/b2b|invoice|saas|vendor|msa|enterprise|logo contract/i.test(raw)) {
    return contractEstate(raw);
  }
  if (NDA.test(raw)) {
    return contractNda(raw);
  }
  if (SETTLE.test(raw)) {
    return contractSettlement(raw);
  }
  if (EMP.test(raw) || (C1099.test(raw) && !DESIGN.test(raw) && !WEB.test(raw))) {
    return contractEmployment(raw);
  }
  if (LOAN.test(raw) && (/\$|k\b|principal|repay|lent|borrow/i.test(raw) || /monthly|weekly|installment/i.test(low))) {
    return fromDeterministic(
      { id: "loan", title: "Loan Agreement", clausePackSeed: "" } as DeterministicIntentResolution,
      raw,
    );
  }
  if (WEB.test(raw)) {
    return fromDeterministic(
      { id: "web_presence", title: "Web Development Agreement", clausePackSeed: "" } as DeterministicIntentResolution,
      raw,
    );
  }
  if (DESIGN.test(raw)) {
    return fromDeterministic(
      { id: "logo_brand", title: "Design Services Agreement", clausePackSeed: "" } as DeterministicIntentResolution,
      raw,
    );
  }
  if (
    CONSULT.test(raw) ||
    C1099.test(raw) ||
    /\b(growth\s+advisor|advisory\s+agreement|consulting\s+agreement)\b/i.test(low)
  ) {
    return contractConsulting(raw);
  }
  return contractUnknown(factSummary(raw), raw.length);
}

/** Payload for POST /premium-full-draft / context (guidance, not a template). */
export type AgreementIntentContractApi = {
  intent_id: string;
  expected_title_terms: string[];
  required_material_terms: string[];
  forbidden_misclassifications: string[];
  minimum_section_expectations: string;
  ambiguity_policy: string;
  pro_strict: boolean;
  user_fact_summary: string;
  expected_agreement_type: string;
  avoid_or_wrong_category: string;
  must_cover_operative: string;
};

export function buildIntentContractApiPayload(c: AgreementIntentContract): AgreementIntentContractApi {
  return {
    intent_id: c.intent_id,
    expected_title_terms: c.expected_title_terms,
    required_material_terms: c.required_material_terms,
    forbidden_misclassifications: c.forbidden_misclassifications,
    minimum_section_expectations: c.minimum_section_expectations,
    ambiguity_policy: c.ambiguity_policy,
    pro_strict: c.pro_strict,
    user_fact_summary: c.user_fact_summary,
    expected_agreement_type: c.intent_id,
    avoid_or_wrong_category: c.forbidden_misclassifications.slice(0, 12).join(" | "),
    must_cover_operative: c.minimum_section_expectations,
  };
}

function firstLineOrTitle(title: string, body: string): string {
  const t = (title || "").trim();
  if (t) return t;
  for (const line of (body || "").replace(/\r\n/g, "\n").split("\n")) {
    const s = line.replace(/^\s*#+\s*/, "").trim();
    if (s.length >= 2) return s;
  }
  return "";
}

function bodyHay(title: string, body: string, max = 20_000): string {
  return `${firstLineOrTitle(title, body)}\n${(body || "").slice(0, max)}`.toLowerCase();
}

/**
 * Returns true if any expected title / category stem appears in title + top of body.
 */
function hasExpectedTitleFit(contract: AgreementIntentContract, title: string, body: string): boolean {
  const h = bodyHay(title, body);
  return contract.expected_title_terms.some((term) => {
    const t = (term || "").toLowerCase().trim();
    return t.length > 1 && h.includes(t);
  });
}

function countNeedles(hay: string, terms: string[]): number {
  let n = 0;
  for (const term of terms) {
    const t = (term || "").toLowerCase();
    if (t.length < 2) continue;
    if (t.length < 3) {
      if (t === "ip" && /\bip\b/.test(hay)) n += 1;
      continue;
    }
    if (hay.includes(t)) n += 1;
  }
  return n;
}

/**
 * Whether a long, operative Pro body is substantively “real” (used for material-term and title-hint lenience).
 * `minDocLen` allows an 8k+ bar when the model returned a full agreement just under 10k tokens-as-chars.
 */
function hasOperativeProDepth(hay: string, docLen: number, minDocLen: number = 10_000): boolean {
  if (docLen < minDocLen) return false;
  let score = 0;
  if (/\bwhereas\b|recital/i.test(hay)) score += 1;
  if (/\bthe\s+parties\b|\bparty\b/i.test(hay)) score += 1;
  if (/\b(compensation|fees?|payment|milestone|invoice|deposit|retainer)\b/i.test(hay)) score += 1;
  if (/\b(termination|governing\s+law|choice\s+of\s+law|dispute|jurisdiction|venue|oklahoma)\b/i.test(hay)) score += 1;
  if (/\b(intellectual\s+property|work\s+product|copyright|licen[sc]|deliverable)\b/i.test(hay)) score += 1;
  if (/\b(notice|notices|notif|email|electronic\s+mail)\b/i.test(hay)) score += 1;
  if (/\b(revision|change\s+order|scope|acceptance|warrant)\b/i.test(hay)) score += 1;
  if (/\b(confidential|indemn|limitation\s+of\s+liabilit|liability)\b/i.test(hay)) score += 1;
  if (/\b(execution|signatur|counterpart|electronic)\b/i.test(hay)) score += 1;
  return score >= 6;
}

/** Top-of-document / title: must read as logo or design services, not a generic commercial shell. */
function hasDesignServiceAgreementTitleFit(title: string, body: string): boolean {
  const head = `${(title || "").trim()}\n${(body || "").trim()}`.slice(0, 2500);
  return /((?:logo|graphic) design (?:services )?agreement|design services agreement)/i.test(head);
}

/**
 * `phrase` found in `hay` with a non-negated occurrence (avoids false positives on “not review services”).
 */
function hasUnnegatedPhrase(hay: string, phrase: string): boolean {
  const h = hay.toLowerCase();
  const p = phrase.toLowerCase();
  if (p.length < 4) return false;
  let i = 0;
  while ((i = h.indexOf(p, i)) !== -1) {
    const before = h.slice(Math.max(0, i - 40), i);
    if (/\bnot\s+$/.test(before) || /(is not|isn't|except|except that)\s+$/i.test(before)) {
      i += 1;
      continue;
    }
    return true;
  }
  return false;
}

const INTAKE_REVIEW_ENGAGEMENT = /\b(review services|commercial review|compliance review|code review|legal review|due diligence|audit review|document review|peer review|qa review|transaction review|merger review)\b/i;
const INTAKE_DEV_SOFTWARE = /\b(software|develop(er|ment)?|devops|website|web-?app|saas|api|code|github|hosting|local\s*host|localhost|typescript|react|node|python|java|database|programm|application development)\b/i;

/**
 * Reject design outputs that recast “revisions” as compliance/QA “review” or software work unless the intake asked for that.
 */
function designCreativeCrossCategoryPhrases(title: string, body: string, rawIntake: string): string | null {
  const fullHay = bodyHay(title, body);
  const il = (rawIntake || "").toLowerCase();
  if (!INTAKE_REVIEW_ENGAGEMENT.test(il)) {
    if (hasUnnegatedPhrase(fullHay, "review services")) {
      return "intent:design_forbidden_review_services";
    }
    if (hasUnnegatedPhrase(fullHay, "commercial review")) {
      return "intent:design_forbidden_commercial_review";
    }
    if (/\breview and \d+\s+revisions?\b/i.test(fullHay) && /\b(revisions?|revision rounds?)\b/i.test(il) && !/\breview services\b/i.test(il)) {
      return "intent:design_misread_revision_as_review_heading";
    }
  }
  if (!INTAKE_DEV_SOFTWARE.test(il)) {
    if (hasUnnegatedPhrase(fullHay, "local development")) {
      return "intent:design_forbidden_local_development";
    }
    if (hasUnnegatedPhrase(fullHay, "environment setup")) {
      return "intent:design_forbidden_environment_setup";
    }
    if (/\b(software|web|application)\s+developer\b/i.test(fullHay) && !/\b(designer|design)\b/i.test(fullHay.slice(0, 800))) {
      return "intent:design_forbidden_software_developer_role";
    }
  }
  const head = `${(title || "").trim()}\n${(body || "").trim()}`.slice(0, 1_200).toLowerCase();
  if (/\bcommercial arrangement\b/.test(head) && /logo|design|brand|creative|mark|illustrat/i.test(il) && !INTAKE_DEV_SOFTWARE.test(il)) {
    if (!/((?:logo|graphic) design|design services)\b/i.test(head)) {
      return "intent:design_generic_commercial_arrangement_title";
    }
  }
  return null;
}

/** When intake is principal + monthly cadence but no per-installment $, block outputs that set each payment equal to full principal. */
function loanOutputEquatesInstallmentToPrincipal(hay: string, principal: number): boolean {
  if (!Number.isFinite(principal) || principal <= 0) return false;
  const pats: RegExp[] = [
    /(?:monthly\s+)?installments?\s+of\s+\$?([\d,]+(?:\.\d{2})?)\b/gi,
    /each\s+(?:monthly\s+)?installment(?:\s+amount)?\s+(?:is|of|shall be)\s+\$?([\d,]+(?:\.\d{2})?)\b/gi,
    /installment\s+amount[s]?\s+of\s+\$?([\d,]+(?:\.\d{2})?)\b/gi,
    /pay(?:ments?|ing)?\s+of\s+\$?([\d,]+(?:\.\d{2})?)\s+per\s+month/gi,
  ];
  for (const re of pats) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(hay)) !== null) {
      const n = normalizeCurrency(m[1]);
      if (n != null && Math.abs(n - principal) < 0.01) {
        return true;
      }
    }
  }
  return false;
}

/**
 * When the paid pipeline already accepted a full `server_full_draft` (or equivalent), category **title stem**
 * match is a hint, not a hard gate: the body + source-fact checks are the Pro truth.
 */
function authoritativeTitleCategoryBypassOk(
  c: AgreementIntentContract,
  hay: string,
  docLen: number,
  authoritativeProPipelineAccepted: boolean,
): boolean {
  if (!authoritativeProPipelineAccepted) return false;
  if (c.intent_id === "design_creative") return false;
  if (c.intent_id === "founder_equity_vesting") return false;
  if (docLen >= 10_000 && hasOperativeProDepth(hay, docLen, 10_000)) return true;
  if (docLen >= 8000 && hasOperativeProDepth(hay, docLen, 8000)) return true;
  return false;
}

/**
 * LawDog Pro output check for a **recognized** intent. Unknown / non-strict: lenient.
 */
export function validateIntentContractForPaidProOutput(args: {
  contract: AgreementIntentContract;
  text: string;
  rawIntake: string;
  /** Model or draft title. */
  draftTitle?: string | null;
  /**
   * True when the full-draft pipeline already accepted this run (`server_full_draft*`, `snapshot_server_full_draft`).
   * Softens only **title stem vs. intent_id** mismatch — never cross-intake, loan, or design title rules.
   */
  authoritativeProPipelineAccepted?: boolean;
  /** When backend validation passed with minimum contract elements, allows minimalist commercial Pro bodies. */
  agreementValidation?: ValidationMinimumElementsInput | null;
}): { ok: boolean; reasons: string[] } {
  const c = args.contract;
  const authoritative = Boolean(args.authoritativeProPipelineAccepted);
  if (!c.pro_strict || c.intent_id === "custom_unknown") {
    return { ok: true, reasons: [] };
  }
  const text = (args.text || "").trim();
  if (!text) {
    return { ok: false, reasons: ["intent:empty_body"] };
  }
  if (isLikelyFiveSectionStarterShellPro(text)) {
    return { ok: false, reasons: ["intent:starter_shell_not_acceptable"] };
  }
  const tline = getResolvedTitleForFounderGating((args.draftTitle || "").trim(), text);
  const hay = bodyHay(tline, text);
  const docLen = text.length;
  const tryTitleMismatchBypass = (reason: string) => {
    if (
      reason === `intent:title_mismatch_category:${c.intent_id}` &&
      authoritative &&
      authoritativeTitleCategoryBypassOk(c, hay, docLen, authoritative)
    ) {
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.info("[paid-pro-intent-hint]", {
          event: "category_title_stem_bypassed",
          intent_id: c.intent_id,
          reason: "authoritative_server_pro_body",
          docLen,
        });
      }
      return true;
    }
    return false;
  };
  const firstLine = firstLineOrTitle(tline, text).toLowerCase();
  if (firstLine === "agreement" || firstLine === "agreement.") {
    return { ok: false, reasons: ["intent:generic_agreement_title"] };
  }

  if (c.intent_id === "founder_equity_vesting" || isFounderEquityVestingIntent(args.rawIntake)) {
    if (!hasRequiredFounderPremiumTitle(tline, text)) {
      return { ok: false, reasons: ["intent:founder_title_not_found"] };
    }
  } else {
    if (c.intent_id === "design_creative") {
      if (!hasDesignServiceAgreementTitleFit(tline, text)) {
        return { ok: false, reasons: ["intent:design_title_requires_logo_or_design_services"] };
      }
    } else if (!hasExpectedTitleFit(c, tline, text) && c.expected_title_terms.length) {
      const tmReason = `intent:title_mismatch_category:${c.intent_id}`;
      if (!tryTitleMismatchBypass(tmReason)) {
        return { ok: false, reasons: [tmReason] };
      }
    }
  }

  for (const fb of c.forbidden_misclassifications) {
    const f = (fb || "").toLowerCase();
    if (f.length < 4) continue;
    if (hay.includes(f)) {
      return { ok: false, reasons: [`intent:forbidden_category_phrase:${f.slice(0, 32)}`] };
    }
  }

  const x = crossIntakeContamination(text, (args.rawIntake || "").toLowerCase());
  if (!x.ok) {
    return { ok: false, reasons: x.reasons.map((r) => `intent:cross_contamination:${r}`) };
  }

  if (c.intent_id === "design_creative") {
    const dReason = designCreativeCrossCategoryPhrases(tline, text, args.rawIntake);
    if (dReason) {
      return { ok: false, reasons: [dReason] };
    }
  }

  if (c.required_material_terms.length) {
    const needed = Math.min(c.required_material_terms.length, 3);
    const hit = countNeedles(hay, c.required_material_terms);
    if (hit < Math.min(2, needed)) {
      if (docLen >= 10_000 && hasOperativeProDepth(hay, docLen)) {
        /* Long, operative Pro pass — do not fail on 1–2 synonym swaps vs. stem list */
      } else if (
        validationMinimumContractElementsSatisfied(args.agreementValidation) &&
        (c.intent_id === "consulting_services" ||
          c.intent_id === "software_web_dev" ||
          c.intent_id === "employment_contractor") &&
        docLen >= 500 &&
        hasOperativeProDepth(hay, docLen, 2_500)
      ) {
        /* Validation-backed minimalist commercial services / software Pro */
      } else {
        return { ok: false, reasons: [`intent:insufficient_operative_substance:${c.intent_id}`] };
      }
    }
  }

  if (c.intent_id === "loan_repayment") {
    if (!/principal|borrower|lender|repay|loan|note/i.test(hay)) {
      return { ok: false, reasons: ["intent:loan_operative_anchors"] };
    }
    const p = extractIntakePayment(args.rawIntake);
    if (p.amount != null && !hasExplicitPerInstallmentAmountInIntake(args.rawIntake)) {
      if (loanOutputEquatesInstallmentToPrincipal(hay, p.amount)) {
        return { ok: false, reasons: ["intent:loan_installment_amount_equated_principal"] };
      }
    }
    if (p.installmentAmountUnspecified) {
      const hasAmbiguityWording = hay.includes("installment") && hay.includes("principal");
      const hasScheduleALanguage = /schedule a|agreed by (the )?parties/i.test(hay);
      const hasBorrowerLine = hay.includes("borrower shall repay principal");
      if (!hasAmbiguityWording && !hasScheduleALanguage && !hasBorrowerLine) {
        return { ok: false, reasons: ["intent:loan_installment_not_distinct_from_principal"] };
      }
    }
  }

  return { ok: true, reasons: [] };
}

/**
 * User-visible copy when Pro cannot finish for this intent.
 */
export function proIntentPlainEnglishForGate(contract: AgreementIntentContract, reasonCodes: string[]): string {
  if (contract.intent_id === "founder_equity_vesting" && reasonCodes.some((r) => r.includes("title"))) {
    return "We need a clear founder/vesting-oriented agreement title. Add 2 specific details and try **Retry Pro draft**.";
  }
  const r = reasonCodes[0] || "quality";
  if (r.includes("empty") || r.includes("unavailable") || r.includes("server")) {
    return "LawDog Pro could not run the full draft. Check your connection, add any missing key facts, and tap **Retry Pro draft**.";
  }
  if (r.includes("installment") || r.includes("loan") || r.includes("principal")) {
    return "Your loan has principal plus a repayment *schedule* — the monthly installment amount is not the same as the full principal. Add the repayment structure you want (or that installments are TBD) and use **Retry Pro draft**.";
  }
  if (r.includes("estate") || r.includes("sibling") || r.includes("cross")) {
    return "This should read as a **family/estate**-style plan, not commercial vendor services. Add specific names/roles, then **Retry Pro draft**.";
  }
  if (reasonCodes.some((c) => c.includes("design_") || c.includes("review_services") || c.includes("commercial_review"))) {
    return "This should read as a **logo or design services** agreement, not a generic commercial, software, or ‘review’ engagement. Add your fee, deliverables, and IP terms, then **Retry Pro draft**.";
  }
  if (r.includes("title") || r.includes("mismatch") || r.includes("generic")) {
    return `The agreement should read like a **${contract.intent_id.replace(/_/g, " ")}** document, not a generic "Agreement" shell. Add missing specifics and use **Retry Pro draft**.`;
  }
  if (r.includes("starter") || r.includes("five") || r.includes("shell")) {
    return "The draft is too thin for Pro. Add material facts the parties would sign against, then **Retry Pro draft**.";
  }
  return "LawDog Pro could not produce a full agreement that matches this scenario. Add missing details in plain language and use **Retry Pro draft**.";
}

/**
 * If server full draft never returns, and intent is strict.
 */
export function proIntentMessageWhenServerFullDraftFailed(contract: AgreementIntentContract): string {
  if (contract.pro_strict) {
    return "LawDog Pro could not finish your full agreement this run. Add any missing key facts, then use **Retry Pro draft** (we can't show a quick preview as a finished Pro document for this type of request).";
  }
  return "";
}

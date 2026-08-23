/**
 * Universal intake clarification — turn blocked / incomplete / counsel-prep prompts
 * into guided remediation with a suggested draftable rewrite.
 * Product-wide: no account, tier, or user branching.
 *
 * Goal: salvage as wide a spectrum of commercial material as practical from
 * overloaded negotiation notes (economics, term, paper choice, risk topics,
 * data scope, venue, renewal, insurance, etc.) into whatWeHeard + rewrite.
 *
 * Signing parties: default 2; expand suggested rewrites to 3–4 only when intake
 * clearly lists/declares that many; cap at 4 (never invent Party 5).
 */

import { extractBetweenPartyNameList } from "./partyBetweenParse";
import { resolveDeclaredExplicitPartyCount } from "./partySlotIdentityNormalize";
import { PAID_PRO_GTM_MAX_SIGNING_PARTIES } from "./paidProAuthorityLimits";
import { isAuthoritativeLegalEntityName } from "./paidProPartyNamePreserve";
import {
  extractAgreementEntityCandidates,
  dedupeEntityCandidatesToLegalParties,
} from "../../agreement/partyPlaceholderDisplay";
import { inferCasualScopeFromDump } from "./intakeNamedPartyFallback";

export type AgreementIntakeClarificationKind =
  | "counsel_prep"
  | "missing_named_parties"
  | "too_sparse"
  | "needs_commercial_basics"
  | "ambiguous_request"
  /** Keyboard mash, spam, or long noise with almost no draftable commercial signal. */
  | "low_signal"
  /** 5+ signing entities / affiliates — GTM supports 2–4 only. */
  | "party_count_cap"
  /** Prompt under minimum character threshold - need more detail. */
  | "too_short";

export type AgreementIntakeClarification = {
  kind: AgreementIntakeClarificationKind;
  /** Short title for the panel */
  title: string;
  /** One-sentence why we paused */
  why: string;
  /** Facts we could salvage from the prompt */
  whatWeHeard: string[];
  /** Concrete revision steps */
  guidedSteps: string[];
  /** Ready-to-paste draftable rewrite when we can invent one from facts */
  suggestedRewrite: string | null;
  primaryCtaLabel: string;
  secondaryCtaLabel: string;
};

const DRAFT_INTENT_RE =
  /\b(?:draft|create|write|prepare|generate)\b[\s\S]{0,80}\b(?:agreement|contract|msa|sow|nda|pilot\s+agreement|order\s+form|subscription\s+agreement|master\s+services)\b/i;

const BETWEEN_PARTIES_RE = /\b(?:between|among)\b[\s\S]{0,220}\band\b/i;

const COUNSEL_PREP_SIGNAL_RE =
  /\b(?:help\s+me\s+(?:figure\s+out|thinking\s+through)|what\s+positions\s+i\s+should\s+take|negotiation\s+plan|fallback\s+(?:language|positions)|clause\s+edits|deal\s+(?:risks?|guidance)|lawyering\s+the\s+deal|not\s+looking\s+for\s+a\s+(?:law\s+school\s+)?memo|confirm\s+(?:internally|with\s+security|with\s+.{0,20}legal)\s+before|push\s+them\s+back|accept\s+their\s+.{0,40}(?:with\s+edits|paper)|which\s+terms\s+are\s+(?:actual\s+)?(?:deal\s+)?risks|AE[-\s]?friendly\s+note|redline\s+concepts|needs?\s+attorney\s+review|mark\s*it\s*up|counter[-\s]?proposal)\b/i;

const NUMBERED_ADVISORY_QUESTIONS_RE =
  /(?:^|\n)\s*(?:1[\).\]]|1\.)\s+(?:whether|which|what|how|where)\b[\s\S]{40,}(?:^|\n)\s*(?:2[\).\]]|2\.)\s+/im;

const MONEY_RE =
  /\$\s?\d[\d,]*(?:\.\d+)?\s*(?:k|m)?|\b\d[\d,]*(?:\.\d+)?\s*(?:dollars?|usd|acv|arr|mrr|tcv)\b|\b\d+\s*k\b|\b\d+(?:\.\d+)?%\s*(?:equity|ownership)\b/i;
const TERM_RE =
  /\b(?:\d+\s*[-–]?\s*(?:day|days|week|weeks|month|months|year|years)|sixty[-\s]?day|6[-\s]?week|twelve[-\s]?month|auto[-\s]?renew(?:al)?|evergreen|perpetual)\b/i;
/** Commencement / effective-date cues — count as term-like facts for any deal family. */
const EFFECTIVE_DATE_RE =
  /\beffective\s+(?:upon|on|as\s+of|date)|upon\s+(?:the\s+)?(?:signing|execution)(?:\s+date)?\b|\bcommenc(?:e|es|ement)\s+(?:on|upon|as\s+of|date)\b/i;
const SAAS_RE = /\b(?:saas|software\s+as\s+a\s+service|subscription|ARR|MRR|ACV)\b/i;
const PILOT_RE = /\b(?:pilot\s+agreement|paid\s+pilot|\bpilot\b|proof[-\s]?of[-\s]?concept|POC)\b/i;
const NDA_RE = /\b(?:mutual\s+)?(?:non[-\s]?disclosure|nda|confidentiality\s+agreement)\b/i;
const SERVICES_RE =
  /\b(?:services?\s+agreement|consulting|design|development|freelance|statement\s+of\s+work|\bSOW\b|master\s+services|\bMSA\b)\b/i;
const LICENSE_RE = /\b(?:license\s+agreement|software\s+license|IP\s+license|end[-\s]?user\s+license|\bEULA\b)\b/i;
const EMPLOYMENT_RE =
  /\b(?:employment\s+agreement|independent\s+contractor|contractor\s+agreement|offer\s+letter|vesting|equity\s+grant)\b/i;
const LOAN_RE = /\b(?:promissory\s+note|loan\s+agreement|principal|interest\s+rate|repayment\s+schedule)\b/i;
const LEASE_RE = /\b(?:lease\s+agreement|landlord|tenant|rent\s+commencement|premises)\b/i;

/**
 * Broad scope/work patterns for fail-open detection. Includes common service verbs
 * and activity nouns that indicate draftable commercial intent.
 */
const BROAD_SCOPE_RE =
  /\b(?:paint(?:ing)?|clean(?:ing)?|fix(?:ing)?|repair(?:ing)?|build(?:ing)?|design(?:ing)?|develop(?:ing)?|creat(?:e|ing)|writ(?:e|ing)|mak(?:e|ing)|consult(?:ing)?|advis(?:e|ing)|manag(?:e|ing)|market(?:ing)?|sell(?:ing)?|buy(?:ing)?|rent(?:ing)?|leas(?:e|ing)?|deliver(?:y|ing)?|install(?:ing)?|maintain(?:ing)?|support(?:ing)?|train(?:ing)?|coach(?:ing)?|teach(?:ing)?|photograph(?:y|ing)?|video(?:graphy)?|edit(?:ing)?|review(?:ing)?|audit(?:ing)?|account(?:ing)?|bookkeep(?:ing)?|legal|services?|work|project|deal|agreement|contract|job|task|gig|assignment|engagement)(?:s)?\b/i;

/**
 * Exchange/agreement indicators - words that suggest a commercial arrangement.
 */
const EXCHANGE_INDICATOR_RE =
  /\b(?:agreed|agree|deal|agreement|contract|shook|handshake|settle(?:d|ment)?|pay(?:ing|ment)?|paid|hire[ds]?|for|with|commission(?:ed)?|retain(?:ed)?|engag(?:e|ed)|employ(?:ed)?|partner(?:ship|ed)?|collaborat(?:e|ion)|arrang(?:e|ement)|understanding|terms?)(?:s)?\b/i;

/**
 * Person/name pattern - capitalized word that could be a name (first name or entity).
 * Excludes common sentence starters like "I", "We", "The", etc.
 */
const PERSON_NAME_RE = /\b(?!(?:I|We|The|A|An|It|This|That|My|Our|Your|His|Her|Their)\b)[A-Z][a-z]{2,}\b/;

/**
 * Check if thin dump has ANY draftable commercial signal:
 * - A person/name
 * - A scope/work fragment
 * - An exchange indicator
 *
 * Used to FAIL-OPEN thin dumps to the starter one-pager instead of blocking.
 * Block only empty / gibberish / counsel-memo.
 */
function hasDraftableCommercialSignal(raw: string): boolean {
  const text = (raw || "").trim();
  if (text.length < 10) return false;

  const hasName = PERSON_NAME_RE.test(text);
  const hasScope = BROAD_SCOPE_RE.test(text);
  const hasExchange = EXCHANGE_INDICATOR_RE.test(text);

  return hasName || hasScope || hasExchange;
}

/**
 * Universal commercial / risk topic detectors — broad spectrum, display-priority order.
 * Keep labels draftable (what to put in the agreement), not negotiation strategy.
 */
const TOPIC_CHECKS: ReadonlyArray<[RegExp, string]> = [
  // Liability / risk transfer
  [/\bunlimited\s+liability\b|\bliability\s+caps?\b|\bliability\s+for\b|\bconsequential\s+damages?\b|\bindirect\s+damages?\b/i, "capped (not unlimited) liability"],
  [/\bindemnit/i, "balanced indemnity"],
  [/\binsurance\b|\bcyber\s+liability\b|\bCOI\b|\bcertificate\s+of\s+insurance\b/i, "insurance requirements"],
  // Performance / ops
  [/\b99\.9\s*%|\buptime\s+SLA\b|\bservice\s+credits?\b|\bSLA\b|\bresponse\s+time\b|\bseverity\s+level\b/i, "uptime SLA / service credits"],
  [/\bacceptance\s+(?:criteria|testing|period)\b|\bUAT\b|\bmilestone\s+acceptance\b/i, "acceptance criteria"],
  [/\bwarrant(?:y|ies)\b|\bdisclaimers?\s+of\s+warrant/i, "warranty / disclaimer balance"],
  [/\bsupport\s+(?:hours|obligations?|levels?)\b|\bmaintenance\s+(?:and\s+)?support\b/i, "support / maintenance"],
  // Security / privacy / data
  [/\bcustom\s+security\b|\bsecurity\s+obligations?\b|\bsecurity\s+program\b|\bsecurity\s+commitments?\b|\bISO\s*27001\b|\bpenetration\s+test/i, "security commitments aligned to your program"],
  [/\bSOC\s*2\b/i, "SOC 2 security representations"],
  [/\baudit\s+rights?\b|\bon[-\s]?site\s+audits?\b|\binterviews?\s+with\s+(?:our\s+)?personnel\b/i, "scoped audit rights"],
  [/\bsubprocessors?\b/i, "subprocessor notice / approval limits"],
  [/\bDPA\b|\bdata\s+processing\b|\bGDPR\b|\bCCPA\b|\bCPRA\b/i, "DPA / privacy terms"],
  [/\bdelet(?:e|ion).{0,40}data\b|\breturn\s+(?:or\s+)?destroy\b/i, "data deletion / return"],
  [/\bmodel\s+training\b|\btrain(?:ing)?\s+(?:AI|models?)\b/i, "no model-training use of data"],
  [/\bconfidential/i, "confidentiality"],
  [/\bdata\s+residency\b|\bdata\s+localization\b|\bstay\s+in\s+(?:the\s+)?(?:US|EU|UK)\b/i, "data residency limits"],
  // IP / ownership
  [
    /\bderivative\s+works?\b|\bownership\s+of\s+(?:all\s+)?(?:data|configurations?|reports?|outputs?)\b|\bIP\s+(?:ownership|claims?|assignment)\b|\bwork\s+product\b|\bintellectual\s+property\b|\bwork\s+for\s+hire\b|\bsource\s+code\s+escrow\b/i,
    "IP / outputs / data ownership",
  ],
  [/\blicense\s+(?:grant|scope|restrictions?)\b|\bnon[-\s]?exclusive\s+license\b/i, "license grant / scope"],
  [/\bpublicity\b|\bpress\s+release\b|\blogo\s+use\b|\bcase\s+stud(?:y|ies)\b/i, "publicity / logo use limits"],
  // Term / exit / commercial mechanics
  [/\bterminat(?:e|ion).{0,48}convenience\b|\b30[-\s]?day\s+termination\b|\bfor\s+convenience\b/i, "termination for convenience"],
  [/\bterminat(?:e|ion).{0,40}cause\b|\bmaterial\s+breach\b|\bcure\s+period\b/i, "termination for cause / cure"],
  [/\bauto[-\s]?renew|\brenewal\s+notice\b|\bnon[-\s]?renew\b|\bevergreen\b/i, "renewal / notice terms"],
  [/\bwithhold\s+payment\b|\bpayment\s+if\s+there.?s\s+any\s+dispute\b|\bpayment\s+disputes?\b|\bset[-\s]?off\b/i, "payment dispute / withhold rights"],
  [/\blate\s+fee|\binterest\s+on\s+(?:late\s+)?(?:payments?|invoices?)\b|\bnet\s+\d+\b|\bpayment\s+terms?\b/i, "payment timing / late fees"],
  [/\bprice\s+(?:increase|adjustment|escalation)\b|\bmost[-\s]?favored\b|\bMFN\b/i, "pricing / MFN / increases"],
  [/\binternal\s+policies\b|\bpolicies\s+even\s+if\s+they\s+change\b|\bflow[-\s]?down\b/i, "no open-ended policy change obligations"],
  [/\bchange\s+orders?\b|\bscope\s+creep\b|\bout[-\s]?of[-\s]?scope\b/i, "change-order / scope controls"],
  [/\bexclusiv(?:e|ity)\b|\bnon[-\s]?compete\b|\bnon[-\s]?solicit/i, "exclusivity / non-solicit limits"],
  [/\bassignment\b|\bchange\s+of\s+control\b/i, "assignment / change of control"],
  [/\bforce\s+majeure\b/i, "force majeure"],
  [/\bgoverning\s+law\b|\bvenue\b|\barbitration\b|\bjury\s+waiver\b|\bdispute\s+resolution\b/i, "governing law / dispute forum"],
  // People / equity / finance adjacent (still draftable)
  [/\bvesting\b|\bcliff\b|\bequity\s+grant\b|\boption\s+grant\b/i, "equity / vesting terms"],
  [/\bnon[-\s]?solicit(?:ation)?\b|\bgarden\s+leave\b/i, "non-solicit / post-term limits"],
];

const MAX_TOPIC_CHIPS = 18;

/** GTM product ceiling for clarification templates (2–4 signing parties). */
export const CLARIFICATION_MAX_SIGNING_PARTIES = PAID_PRO_GTM_MAX_SIGNING_PARTIES;

function looksLikeUsablePartyLabel(name: string): boolean {
  const t = name.replace(/\s+/g, " ").trim();
  if (t.length < 2) return false;
  if (/^\[/.test(t) || /^Party\s+\d+$/i.test(t)) return false;
  if (isAuthoritativeLegalEntityName(t)) return true;
  const words = t.split(/\s+/);
  return words.length >= 2 && words.length <= 8 && !/^(?:the|a|an)\b/i.test(t);
}

function countLabeledPartySlots(raw: string): number {
  const re = /(?:^|\n)\s*Party\s*([1-9])\s*[:\-]/gim;
  let max = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    const n = Number(m[1]);
    if (n > max) max = n;
  }
  return max;
}

/** Ordered legal-name candidates from between/among or Party N: lines (not capped). */
export function extractListedSigningPartyNames(raw: string): string[] {
  const between = extractBetweenPartyNameList(raw).filter(looksLikeUsablePartyLabel);
  if (between.length >= 2) return between;
  const labeled: string[] = [];
  const lineRe = /(?:^|\n)\s*Party\s*[1-9]\s*[:\-]\s*([^\n]{2,80})/gim;
  let m: RegExpExecArray | null;
  while ((m = lineRe.exec(raw))) {
    const name = (m[1] || "").replace(/\s+/g, " ").trim().replace(/[.;,]+$/, "");
    if (looksLikeUsablePartyLabel(name)) labeled.push(name);
  }
  if (labeled.length >= 2) return labeled;

  // Fallback: extract entity names from prose when structured patterns fail.
  // Common in messy "I run X. Y said they can send us clients." prompts where
  // party names are embedded in natural language rather than "between A and B".
  const proseCandidates = dedupeEntityCandidatesToLegalParties(
    extractAgreementEntityCandidates(raw),
  ).filter(looksLikeUsablePartyLabel);
  if (proseCandidates.length >= 2) return proseCandidates;

  return labeled;
}

export type SigningPartyCountSignals = {
  listed: number;
  declared: number | null;
  overCap: boolean;
  /** Target for suggested rewrite: 2–4 */
  suggestedCount: number;
};

export function resolveSigningPartyCountSignals(raw: string): SigningPartyCountSignals {
  const text = String(raw || "");
  const declaredBase = resolveDeclaredExplicitPartyCount(text);
  const fiveDeclared = /\b(?:five|5)\s+parties\b|\bfive[\s-]party\b/i.test(text);
  const declared = fiveDeclared ? 5 : declaredBase;
  const listedNames = extractListedSigningPartyNames(text);
  const labeledSlots = countLabeledPartySlots(text);
  const listed = Math.max(listedNames.length, labeledSlots);
  const affiliates =
    /\ball\s+affiliates\s+will\s+sign\b|\bevery\s+affiliate\b|\bunlimited\s+parties\b/i.test(text);
  const overCap = Boolean(affiliates || (declared != null && declared >= 5) || listed >= 5);
  let suggestedCount = 2;
  if (declared === 3 || declared === 4) suggestedCount = declared;
  else if (listed >= 3 && listed <= 4) suggestedCount = listed;
  else if (overCap) suggestedCount = CLARIFICATION_MAX_SIGNING_PARTIES;
  suggestedCount = Math.min(Math.max(suggestedCount, 2), CLARIFICATION_MAX_SIGNING_PARTIES);
  return { listed, declared, overCap, suggestedCount };
}

/** `between A and B` or `among A, B, and C` using known names or [Party N Legal Name]. */
export function buildSigningPartyClause(
  count: number,
  knownNames?: readonly string[] | null,
): string {
  const n = Math.min(Math.max(count, 2), CLARIFICATION_MAX_SIGNING_PARTIES);
  const slots = Array.from({ length: n }, (_, i) => {
    const known = String(knownNames?.[i] || "").trim();
    if (known && looksLikeUsablePartyLabel(known)) return known;
    return `[Party ${i + 1} Legal Name]`;
  });
  if (n === 2) return `between ${slots[0]} and ${slots[1]}`;
  const head = slots.slice(0, -1).join(", ");
  return `among ${head}, and ${slots[n - 1]}`;
}

function extractMoneyPhrases(raw: string): string[] {
  const out: string[] = [];
  const re =
    /\$\s?\d[\d,]*(?:\.\d+)?(?:\s*(?:k|m|K|M))?(?:\s*(?:ACV|ARR|MRR|TCV))?|\b\d+\s*k(?:-ish)?(?:\s*(?:ACV|ARR|MRR))?\b|\b\d[\d,]*\s*(?:dollars?|usd)\b|\b\d+(?:\.\d+)?%\s*(?:equity|ownership)\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) && out.length < 5) {
    out.push(m[0].replace(/\s+/g, " ").trim());
  }
  return out;
}

function extractTermPhrase(raw: string): string | null {
  const m = raw.match(
    /\b(?:\d+\s*[-–]?\s*(?:day|days|week|weeks|month|months|year|years)|sixty[-\s]?day|6[-\s]?week|twelve[-\s]?month|auto[-\s]?renew(?:al)?|evergreen|perpetual)\b/i,
  );
  if (m?.[0]) return m[0].replace(/\s+/g, " ").trim();
  const effective = raw.match(
    /\beffective\s+(?:upon|on|as\s+of)\s+(?:signing|execution|the\s+date)[^.;,]{0,40}|\bupon\s+(?:the\s+)?(?:signing|execution)\s+date\b/i,
  );
  return effective?.[0]?.replace(/\s+/g, " ").trim() ?? null;
}

const PURPOSE_CONNECTOR_RE =
  /\b(?:for|about|regarding|concerning|covering|whereby|under\s+which|to\s+(?:document|memorialize|confirm|establish|set\s+forth)|understanding\s+that|so\s+that|such\s+that)\b\s+/i;

/** Concrete work infinitive — "to design a logo and brand kit", "to run a marketing campaign". */
const WORK_INFINITIVE_RE =
  /\bto\s+(?=(?:design(?:ing)?|build(?:ing)?|creat(?:e|ing)|develop(?:ing)?|provid(?:e|ing)|perform(?:ing)?|deliver(?:ing)?|run(?:ning)?|paint(?:ing)?|photograph(?:ing)?|writ(?:e|ing)|install(?:ing)?|fix(?:ing)?|repair(?:ing)?|market(?:ing)?|consult(?:ing)?|manag(?:e|ing)|handl(?:e|ing)|produc(?:e|ing)|film(?:ing)?|edit(?:ing)?|coach(?:ing)?|train(?:ing)?|maintain(?:ing)?|support(?:ing)?)\b)/i;

const THIN_PURPOSE_ONLY_RE =
  /^(?:stuff|things|business|it|work|services?|a\s+deal|the\s+deal|something|whatever|misc(?:ellaneous)?)\b/i;

const PURPOSE_STOPWORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "of",
  "to",
  "in",
  "on",
  "for",
  "that",
  "this",
  "with",
  "will",
  "be",
  "is",
  "are",
  "as",
  "by",
  "from",
  "their",
  "its",
  "both",
  "either",
  "through",
  "which",
  "whom",
  "ones",
  "case",
  "into",
  "any",
  "all",
]);

/**
 * Prompt-agnostic: draft + named parties + a real purpose/scope clause may proceed
 * even when the ask is not a memorized deal family (NDA / SaaS / services / etc.).
 * Bare “draft … between A and B about stuff” stays blocked.
 */
function purposeContentWordCount(body: string): number {
  return body
    .split(/\s+/)
    .filter(Boolean)
    .filter((w) => {
      const t = w.toLowerCase().replace(/[^a-z0-9']/g, "");
      return t.length > 2 && !PURPOSE_STOPWORDS.has(t);
    }).length;
}

export function hasSubstantiveDealPurpose(raw: string): boolean {
  const text = String(raw || "").replace(/\s+/g, " ").trim();
  if (text.length < 40) return false;

  // "hiring X to design a logo and brand kit" is stated work — not a thin-scope shell.
  const workInf = WORK_INFINITIVE_RE.exec(text);
  if (workInf && workInf.index != null) {
    const body = text.slice(workInf.index).replace(/\s+/g, " ").trim();
    const afterTo = body.replace(/^to\s+/i, "");
    if (!THIN_PURPOSE_ONLY_RE.test(afterTo) && purposeContentWordCount(afterTo) >= 2) {
      return true;
    }
  }

  const casualScope = inferCasualScopeFromDump(text);
  if (
    casualScope &&
    casualScope.split(/\s+/).length >= 2 &&
    !THIN_PURPOSE_ONLY_RE.test(casualScope)
  ) {
    return true;
  }

  const connector = PURPOSE_CONNECTOR_RE.exec(text);
  if (!connector || connector.index == null) {
    if (
      /\bwill\s+(?:provide|pay|license|perform|deliver|design|build|consult)\b/i.test(text) &&
      text.split(/\s+/).length >= 10
    ) {
      const content = text
        .split(/\s+/)
        .filter(Boolean)
        .filter((w) => {
          const t = w.toLowerCase().replace(/[^a-z0-9']/g, "");
          return t.length > 2 && !PURPOSE_STOPWORDS.has(t);
        });
      return content.length >= 4;
    }
    return false;
  }
  const body = text.slice(connector.index + connector[0].length).replace(/\s+/g, " ").trim();
  const words = body.split(/\s+/).filter(Boolean);
  if (words.length < 3) return false;
  if (words.length <= 12 && THIN_PURPOSE_ONLY_RE.test(body)) return false;
  const content = words.filter((w) => {
    const t = w.toLowerCase().replace(/[^a-z0-9']/g, "");
    return t.length > 2 && !PURPOSE_STOPWORDS.has(t);
  });
  return content.length >= 2;
}

function extractGoverningLaw(raw: string): string | null {
  const m = raw.match(
    /\b(?:governing\s+law|governed\s+by(?:\s+the\s+laws?\s+of)?|laws?\s+of)\s*[:\-]?\s*([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?|[A-Z]{2})\b/,
  );
  if (m?.[1]) return m[1].trim();
  // Common shorthand: "Governing law: Texas."
  const m2 = raw.match(/\bGoverning\s+law\s*:\s*([A-Za-z][A-Za-z\s]{1,40})/i);
  return m2?.[1]?.trim().replace(/[.;,]+$/, "") || null;
}

function extractTopicChips(raw: string): string[] {
  const chips: string[] = [];
  const matchedChecks: Array<[RegExp, string]> = [];
  for (const check of TOPIC_CHECKS) {
    if (check[0].test(raw)) {
      chips.push(check[1]);
      matchedChecks.push(check);
    }
  }
  // Supplement with ask-list bullets that no structured detector already covered.
  for (const bullet of extractAskBullets(raw)) {
    if (matchedChecks.some(([re]) => re.test(bullet))) continue;
    if (chips.some((c) => c.toLowerCase() === bullet.toLowerCase())) continue;
    chips.push(bullet);
    if (chips.length >= MAX_TOPIC_CHIPS) break;
  }
  return chips.slice(0, MAX_TOPIC_CHIPS);
}

/** Short commercial asks from markdown/plain bullets (max ~12 words each). */
function extractAskBullets(raw: string): string[] {
  const out: string[] = [];
  const blockMatch = raw.match(
    /(?:asking\s+for|terms?\s+that\s+seem|key\s+terms?|their\s+(?:agreement|paper)\s+has|includes?(?:\s+the\s+following)?|heavy\s+for\s+this\s+deal)[:\s]*\n((?:[ \t]*(?:[-*•]|\d+[.)])\s+.+\n?){2,})/i,
  );
  const block = blockMatch?.[1] || raw;
  for (const line of block.split("\n")) {
    const m = line.match(/^[ \t]*(?:[-*•]|\d+[.)])\s+(.{8,180})$/);
    if (!m) continue;
    const cleaned = m[1].replace(/\s+/g, " ").trim().replace(/[.;,:]+$/, "");
    if (cleaned.length < 8) continue;
    // Skip pure advisory questions inside numbered counsel checklists.
    if (/^(?:whether|which|what|how|where)\b/i.test(cleaned)) continue;
    const words = cleaned.split(/\s+/);
    const short = words.length > 12 ? `${words.slice(0, 12).join(" ")}…` : cleaned;
    out.push(short);
    if (out.length >= 14) break;
  }
  return out;
}

function pushUniqueLabel(list: string[], label: string): void {
  if (!list.some((x) => x.toLowerCase() === label.toLowerCase())) list.push(label);
}

/** Map a short data-scope token into a stable exclusion label (or null). */
function exclusionLabelFromToken(token: string): string | null {
  const p = token.replace(/\s+/g, " ").trim().toLowerCase();
  if (!p || p.length > 64) return null;
  if (/\bphi\b|\bhipaa\b/.test(p)) return "PHI/HIPAA";
  if (/\bpci\b|payment\s+card/.test(p)) return "PCI";
  if (/\bchild|\bcoppa\b|\bminors?\b/.test(p)) return "children's data";
  if (/\bclassif|\bitar\b|\bcui\b|controlled\s+(?:unclassified|gov)/.test(p)) {
    return "classified / controlled gov data";
  }
  return null;
}

function extractDataScopeNotes(raw: string): string[] {
  const notes: string[] = [];
  const includes: string[] = [];
  if (/\bbusiness\s+records?\b/i.test(raw)) includes.push("business records");
  if (/\bemployee\s+names?(?:\/emails?)?\b|\bemails?\b/i.test(raw) && /\bemployee\b/i.test(raw)) {
    includes.push("employee names/emails");
  }
  if (/\busage\s+(?:analytics|data)\b/i.test(raw)) includes.push("usage analytics");
  if (/\bPII\b|\bpersonal\s+data\b/i.test(raw)) includes.push("personal data / PII");
  if (/\bcustomer\s+content\b|\bcustomer\s+data\b/i.test(raw)) includes.push("customer data/content");
  if (includes.length) notes.push(`Handles: ${includes.join(", ")}`);

  const exclusions: string[] = [];
  if (/\bPHI\b|\bHIPAA\b/i.test(raw)) pushUniqueLabel(exclusions, "PHI/HIPAA");
  if (/\bPCI\b|\bpayment\s+card\b/i.test(raw)) pushUniqueLabel(exclusions, "PCI");
  // Straight / curly apostrophe, "child data", COPPA, minors.
  if (
    /\bchildren[''\u2019]?s\s+data\b|\bchild(?:ren)?\s+data\b|\bCOPPA\b|\bminors?[''\u2019]?s?\s+data\b/i.test(
      raw,
    )
  ) {
    pushUniqueLabel(exclusions, "children's data");
  }
  if (/\b(?:government\s+)?classified\b|\bITAR\b|\bCUI\b|\bcontrolled\s+(?:unclassified|gov)/i.test(raw)) {
    pushUniqueLabel(exclusions, "classified / controlled gov data");
  }

  // List patterns: "should not involve PHI, PCI, children's data, or …"
  const listRe =
    /(?:should\s+not\s+involve|must\s+not\s+(?:include|involve)|(?:does|do)\s+not\s+(?:include|involve)|excludes?|out\s+of\s+scope|no(?:t)?\s+(?:include|involving))\s*:?\s*([^.!\n]{6,240})/gi;
  let lm: RegExpExecArray | null;
  while ((lm = listRe.exec(raw))) {
    const chunk = lm[1] || "";
    for (const part of chunk.split(/\s*(?:,|;|\bor\b|\band\b)\s*/i)) {
      const label = exclusionLabelFromToken(part);
      if (label) pushUniqueLabel(exclusions, label);
    }
  }

  if (exclusions.length) notes.push(`Out of scope: ${exclusions.join(", ")}`);
  return notes;
}

/** Rough commercial-signal score used to distinguish draftable notes from noise. */
function commercialSignalScore(raw: string): number {
  let score = 0;
  if (MONEY_RE.test(raw)) score += 3;
  if (TERM_RE.test(raw) || EFFECTIVE_DATE_RE.test(raw)) score += 2;
  if (
    SAAS_RE.test(raw) ||
    PILOT_RE.test(raw) ||
    SERVICES_RE.test(raw) ||
    NDA_RE.test(raw) ||
    LICENSE_RE.test(raw) ||
    EMPLOYMENT_RE.test(raw) ||
    LOAN_RE.test(raw) ||
    LEASE_RE.test(raw)
  ) {
    score += 2;
  }
  if (BETWEEN_PARTIES_RE.test(raw)) score += 2;
  if (DRAFT_INTENT_RE.test(raw)) score += 1;
  if (hasSubstantiveDealPurpose(raw)) score += 2;
  score += Math.min(extractTopicChips(raw).length, 6);
  if (extractDataScopeNotes(raw).length) score += 2;
  if (extractGoverningLaw(raw)) score += 1;
  if (COUNSEL_PREP_SIGNAL_RE.test(raw)) score += 1;
  return score;
}

/**
 * True when the prompt is mostly gibberish, spam, or padding with almost nothing
 * LawDog can turn into an agreement (universal — every account).
 */
function looksLowSignalOrNonsensical(raw: string): boolean {
  const compact = raw.replace(/\s+/g, " ").trim();
  if (compact.length < 6) return false;

  const alnum = compact.replace(/[^a-zA-Z0-9]/g, "");
  if (/^(?:(.)\1{5,}|[asdfghjkl;']{10,}|[qwertyuiop]{10,}|[zxcvbnm]{10,})$/i.test(alnum)) {
    return true;
  }
  if (/(.)\1{7,}/.test(compact)) return true;

  const letters = (compact.match(/[A-Za-z]/g) || []).length;
  const letterRatio = letters / Math.max(compact.length, 1);
  if (compact.length >= 48 && letterRatio < 0.42) return true;

  const score = commercialSignalScore(raw);
  if (score >= 3) return false;

  // If we can extract two distinct party-like names from the prose, this is not low-signal.
  // This covers "I run X. Y said they can send us clients" messy prompts that have
  // embedded company names but no structured "between A and B" clause.
  const proseCandidates = dedupeEntityCandidatesToLegalParties(
    extractAgreementEntityCandidates(raw),
  ).filter(looksLikeUsablePartyLabel);
  if (proseCandidates.length >= 2) return false;

  const words = compact
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 2);
  const dealHits = words.filter((w) =>
    /^(?:draft|create|write|agreement|contract|between|parties?|fee|term|nda|saas|services?|payment|month|months|year|years|llc|inc|pilot|subscription|msa|sow)$/.test(
      w,
    ),
  ).length;

  // Long inundation with almost no deal vocabulary.
  if (compact.length >= 220 && score <= 1 && dealHits <= 1) return true;
  if (compact.length >= 80 && score === 0 && dealHits === 0) return true;
  if (words.length >= 28 && dealHits <= 1 && score <= 1) return true;

  return false;
}

function extractExpansionNote(raw: string): string | null {
  if (/\bexpansion\b/i.test(raw) && /\b(?:rollout|first\s+team|goes\s+well)\b/i.test(raw)) {
    return "Possible expansion after initial team rollout";
  }
  if (/\bconvert(?:s|ing)?\b/i.test(raw) && /\b(?:annual|subscription|pilot)\b/i.test(raw)) {
    return "May convert / expand if the initial engagement succeeds";
  }
  return null;
}

function extractCounterpartySegment(raw: string): string | null {
  if (/\benterprise\b/i.test(raw)) return "enterprise";
  if (/\bmid[-\s]?market\b/i.test(raw)) return "mid-market";
  if (/\bSMB\b|\bsmall\s+business\b/i.test(raw)) return "SMB";
  if (/\bstartup\b/i.test(raw)) return "startup";
  return null;
}

type DealType =
  | "saas_subscription"
  | "saas_pilot"
  | "services"
  | "nda"
  | "license"
  | "employment"
  | "loan"
  | "lease"
  | "generic";

function dealTypeLabel(raw: string): DealType {
  if (PILOT_RE.test(raw) && (SAAS_RE.test(raw) || MONEY_RE.test(raw))) return "saas_pilot";
  if (SAAS_RE.test(raw) || /\bACV\b|\bARR\b|\bMRR\b/i.test(raw)) return "saas_subscription";
  if (NDA_RE.test(raw) && !SERVICES_RE.test(raw) && !SAAS_RE.test(raw)) return "nda";
  if (LICENSE_RE.test(raw)) return "license";
  if (EMPLOYMENT_RE.test(raw)) return "employment";
  if (LOAN_RE.test(raw)) return "loan";
  if (LEASE_RE.test(raw)) return "lease";
  if (SERVICES_RE.test(raw)) return "services";
  return "generic";
}

function agreementTypePhrase(deal: DealType, term: string): string {
  switch (deal) {
    case "saas_pilot":
      return `${term} paid SaaS pilot agreement`;
    case "saas_subscription":
      return `${term} SaaS subscription agreement`;
    case "nda":
      return "mutual non-disclosure agreement";
    case "license":
      return `${term} software license agreement`;
    case "employment":
      return "independent contractor agreement";
    case "loan":
      return "promissory note / loan agreement";
    case "lease":
      return `${term} commercial lease agreement`;
    case "services":
      return `${term} services agreement`;
    default:
      return "[agreement type]";
  }
}

function bipartiteDealPartyClause(deal: DealType): string {
  switch (deal) {
    case "saas_pilot":
    case "saas_subscription":
      return "between [Your Company Legal Name] and [Customer Legal Name]";
    case "nda":
      return "between [Party A Legal Name] and [Party B Legal Name]";
    case "license":
      return "between [Licensor Legal Name] and [Licensee Legal Name]";
    case "employment":
      return "between [Company Legal Name] and [Contractor Legal Name]";
    case "loan":
      return "between [Lender Legal Name] and [Borrower Legal Name]";
    case "lease":
      return "between [Landlord Legal Name] and [Tenant Legal Name]";
    case "services":
      return "between [Provider Legal Name] and [Client Legal Name]";
    default:
      return "between [Party 1 Legal Name] and [Party 2 Legal Name]";
  }
}

function buildCommercialSuggestedRewrite(raw: string): string {
  const deal = dealTypeLabel(raw);
  const money = extractMoneyPhrases(raw);
  const term =
    extractTermPhrase(raw) ||
    (deal === "saas_subscription" || deal === "license" ? "12-month" : deal === "nda" ? "2-year" : "60-day");
  const fee =
    money[0] ||
    (deal === "saas_subscription" ? "[annual fee / ACV]" : deal === "loan" ? "[principal]" : "[fee amount]");
  const topics = extractTopicChips(raw);
  const dataNotes = extractDataScopeNotes(raw);
  const expansion = extractExpansionNote(raw);
  const gov = extractGoverningLaw(raw) || "[State]";
  const partySignals = resolveSigningPartyCountSignals(raw);
  const knownNames = extractListedSigningPartyNames(raw).slice(0, CLARIFICATION_MAX_SIGNING_PARTIES);
  const partyClause =
    partySignals.suggestedCount >= 3
      ? buildSigningPartyClause(partySignals.suggestedCount, knownNames)
      : bipartiteDealPartyClause(deal);

  const topicLine =
    topics.length > 0
      ? ` Address these commercial positions with practical, balanced language: ${topics.join("; ")}.`
      : "";
  const dataLine =
    dataNotes.length > 0 ? ` Data scope: ${dataNotes.join("; ").replace(/\.$/, "")}.` : "";
  const expansionLine = expansion ? ` ${expansion}.` : "";
  const typePhrase = agreementTypePhrase(deal, term);

  if (deal === "saas_pilot") {
    const conversion =
      money.find((m) => m !== fee && (/150|annual|k|ACV|ARR/i.test(m))) || money[1] || "";
    const convertBit = conversion
      ? ` If the pilot succeeds, it may convert to an annual SaaS subscription near ${conversion}.`
      : expansion
        ? ` ${expansion}.`
        : "";
    return (
      `Draft a ${typePhrase} ${partyClause} for ${fee}.` +
      convertBit +
      topicLine +
      dataLine +
      ` Use clear, practical language. Governing law: ${gov}.`
    );
  }

  if (deal === "saas_subscription") {
    return (
      `Draft a ${typePhrase} ${partyClause} for approximately ${fee}.` +
      expansionLine +
      topicLine +
      dataLine +
      ` Use clear, practical language. Governing law: ${gov}.`
    );
  }

  if (deal === "nda") {
    return (
      `Draft a ${typePhrase} ${partyClause} ` +
      `covering confidential business information for a ${term} term.` +
      topicLine +
      dataLine +
      ` Governing law: ${gov}.`
    );
  }

  if (deal === "license") {
    return (
      `Draft a ${typePhrase} ${partyClause} for ${fee}.` +
      topicLine +
      dataLine +
      ` Governing law: ${gov}.`
    );
  }

  if (deal === "employment") {
    return (
      `Draft an ${typePhrase} ${partyClause} for ${term} at ${fee}.` +
      topicLine +
      ` Cover services, payment, IP ownership of work product, and termination. Governing law: ${gov}.`
    );
  }

  if (deal === "loan") {
    return (
      `Draft a ${typePhrase} ${partyClause} for principal ${fee}, term ${term}.` +
      topicLine +
      ` Governing law: ${gov}.`
    );
  }

  if (deal === "lease") {
    return (
      `Draft a ${typePhrase} ${partyClause} at ${fee}.` +
      topicLine +
      ` Governing law: ${gov}.`
    );
  }

  if (deal === "services" || MONEY_RE.test(raw)) {
    return (
      `Draft a ${typePhrase} ${partyClause} for ${term} at ${fee}.` +
      topicLine +
      dataLine +
      ` Describe the services, payment schedule, ownership of deliverables, and termination. Governing law: ${gov}.`
    );
  }

  return (
    `Draft a ${typePhrase} ${partyClause} for [scope], ` +
    `fee ${fee}, term ${term}.` +
    topicLine +
    dataLine +
    ` Governing law: ${gov}.`
  );
}

function buildGenericSuggestedRewrite(raw: string): string | null {
  return buildCommercialSuggestedRewrite(raw);
}

function heardFromCounselPrep(raw: string): string[] {
  const heard: string[] = [];
  const deal = dealTypeLabel(raw);

  if (/\btheir\s+paper\b|\bcustomer\s+wants\s+to\s+use\s+their\b|\baccept\s+their\s+paper\b|\bmark\s*it\s*up\b/i.test(raw)) {
    heard.push("Customer wants to use their paper; you’re weighing markup vs pushing to your form.");
  } else if (PILOT_RE.test(raw)) {
    heard.push("You’re evaluating a customer’s proposed paper (not asking us to draft your form yet).");
  } else if (deal === "saas_subscription") {
    heard.push("This is framed as SaaS / subscription deal guidance, not a draft-between-parties request.");
  } else {
    heard.push("This is framed as negotiation / deal guidance, not a draft-between-parties request.");
  }

  const segment = extractCounterpartySegment(raw);
  if (segment) heard.push(`Deal context: ${segment} customer (legal name not given).`);

  const term = extractTermPhrase(raw);
  if (term) {
    heard.push(
      deal === "saas_subscription" || deal === "license"
        ? `Term mentioned: ${term}.`
        : `Term mentioned: ${term}.`,
    );
  }
  const money = extractMoneyPhrases(raw);
  if (money.length) {
    const econLabel = /\b(?:ACV|ARR|MRR|TCV)\b/i.test(raw) ? " (ACV/ARR/MRR/fee)" : "";
    heard.push(`Economics mentioned: ${money.join(", ")}${econLabel}.`);
  }

  const expansion = extractExpansionNote(raw);
  if (expansion) heard.push(`${expansion}.`);

  if (/\bMSA|order\s+form|DPA|their\s+paper|our\s+paper\b/i.test(raw)) {
    heard.push("You’re comparing their paper vs your form set (MSA / order form / DPA or equivalent).");
  }

  const topics = extractTopicChips(raw);
  if (topics.length) {
    heard.push(`Commercial / risk topics called out (${topics.length}): ${topics.join("; ")}.`);
  }

  for (const note of extractDataScopeNotes(raw)) {
    heard.push(`${note}.`);
  }

  const gov = extractGoverningLaw(raw);
  if (gov) heard.push(`Governing law cue: ${gov}.`);

  if (NUMBERED_ADVISORY_QUESTIONS_RE.test(raw)) {
    heard.push("The ask is a numbered negotiation / counsel checklist, not a draft request.");
  }
  return heard;
}

function draftExampleForDeal(deal: DealType): string {
  switch (deal) {
    case "saas_subscription":
      return "Draft a 12-month SaaS subscription agreement between…";
    case "saas_pilot":
      return "Draft a 60-day SaaS pilot agreement between…";
    case "nda":
      return "Draft a mutual NDA between…";
    case "license":
      return "Draft a software license agreement between…";
    case "employment":
      return "Draft an independent contractor agreement between…";
    case "loan":
      return "Draft a promissory note between…";
    case "lease":
      return "Draft a commercial lease between…";
    default:
      return "Draft a services agreement between…";
  }
}

function lowSignalClarification(raw: string): AgreementIntakeClarification {
  const heard: string[] = [];
  if (raw.length >= 200) {
    heard.push(
      `About ${raw.length.toLocaleString()} characters of text, but almost no draftable deal facts.`,
    );
  } else if (raw.length) {
    heard.push(`You wrote: “${raw.slice(0, 140)}${raw.length > 140 ? "…" : ""}”`);
  }
  heard.push("We could not reliably extract who is agreeing or what they are agreeing to.");
  return {
    kind: "low_signal",
    title: "I can draft this once I know who is agreeing and what they are agreeing to",
    why:
      "Add the two legal names and one sentence describing the work, rights, or exchange. " +
      "Paste the deal facts — not filler, spam, or unrelated notes.",
    whatWeHeard: heard,
    guidedSteps: [
      "Start with: “Draft a [type] agreement between [Party A Legal Name] and [Party B Legal Name]…”.",
      "Add scope, fee (if any), and term in plain sentences.",
      "Drop nonsense, pasted junk, or questions that aren’t deal terms.",
      "Optional: keep data-scope lines (what data is in / out of scope) if they matter.",
    ],
    suggestedRewrite:
      "Draft a services agreement between [Party A Legal Name] and [Party B Legal Name] for [scope], " +
      "fee [amount], term [duration]. Use clear, practical language. Governing law: [State].",
    primaryCtaLabel: "Use starter template",
    secondaryCtaLabel: "Keep editing",
  };
}

export function buildAgreementIntakeClarification(rawIntake: string): AgreementIntakeClarification | null {
  const raw = (rawIntake || "").replace(/\r\n/g, "\n").trim();
  if (raw.length < 6) return null;

  const hasDraftIntent = DRAFT_INTENT_RE.test(raw);
  const listedSigningNames = extractListedSigningPartyNames(raw);
  const hasBetweenParties = BETWEEN_PARTIES_RE.test(raw) || listedSigningNames.length >= 2;
  const counselSignals = COUNSEL_PREP_SIGNAL_RE.test(raw);
  const numberedAdvisory = NUMBERED_ADVISORY_QUESTIONS_RE.test(raw);
  const hasMoney = MONEY_RE.test(raw);
  const hasTerm = TERM_RE.test(raw) || EFFECTIVE_DATE_RE.test(raw);
  const hasPurpose = hasSubstantiveDealPurpose(raw);
  const deal = dealTypeLabel(raw);
  const signal = commercialSignalScore(raw);
  const lowSignal = looksLowSignalOrNonsensical(raw);
  const partySignals = resolveSigningPartyCountSignals(raw);

  // Noise / gibberish / inundation with no salvageable deal — before other branches.
  if (lowSignal && !(counselSignals && (numberedAdvisory || raw.length >= 900))) {
    return lowSignalClarification(raw);
  }

  // Too many signing parties for this GTM version (2–4) — before proceed.
  if (partySignals.overCap) {
    const known = extractListedSigningPartyNames(raw).slice(0, CLARIFICATION_MAX_SIGNING_PARTIES);
    const heard: string[] = [];
    if (partySignals.listed >= 5) {
      heard.push(`About ${partySignals.listed} party-like names were detected — more than this version can sign.`);
    }
    if (partySignals.declared != null && partySignals.declared >= 5) {
      heard.push(`The prompt asks for ${partySignals.declared} parties.`);
    }
    if (/\baffiliate/i.test(raw)) {
      heard.push("Affiliate / open-ended signer language was detected.");
    }
    if (known.length) heard.push(`Keeping the first ${known.length} names in the suggested rewrite: ${known.join("; ")}.`);
    heard.push("LawDog drafts executable agreements for 2–4 signing parties in this version.");
    return {
      kind: "party_count_cap",
      title: "List 2–4 signing parties",
      why:
        "This version supports two to four legal entities that will execute the agreement. " +
        "Pick the parties that will sign (in order) and leave affiliates or notice-only entities out of the party list.",
      whatWeHeard: heard,
      guidedSteps: [
        "List 2–4 legal entity names that will sign, in order (e.g. “among A LLC, B Inc, and C LP”).",
        "Keep fee, term, scope, and data-scope facts you already wrote.",
        "Add extra affiliates later only if they are true contracting parties — or note them in the body without making them signers.",
      ],
      suggestedRewrite: buildCommercialSuggestedRewrite(raw),
      primaryCtaLabel: "Use suggested draft request",
      secondaryCtaLabel: "I’ll edit the party list",
    };
  }

  // Draft-shaped prompts proceed when there is purpose/scope, economics, term, topics,
  // or a named deal family — never require a memorized catalog type (NDA/SaaS/services).
  // Bare “draft an agreement between A and B” without substance still needs basics.
  // Do not ask about Party 3/4 when two clear parties already suffice.
  if (hasDraftIntent && hasBetweenParties) {
    const hasDealType = deal !== "generic";
    const hasTopics = extractTopicChips(raw).length > 0;
    if (hasMoney || hasTerm || hasDealType || hasTopics || hasPurpose) return null;
    return {
      kind: "needs_commercial_basics",
      title: "I can draft this once I know what they are agreeing to",
      why: "Add one sentence describing the work, rights, or exchange. Payment, dates, and governing law can wait.",
      whatWeHeard: [
        "A “draft … between …” shape was detected.",
        "Scope / purpose still looks thin or missing.",
      ],
      guidedSteps: [
        "Say what the parties are agreeing to (scope, rights, payment treatment, settlement, work, etc.).",
        "Add fee and term or effective date if you know them — they are not required to create a draft.",
        "Keep any data-scope exclusions you care about (e.g. no PHI, PCI, or children’s data).",
      ],
      suggestedRewrite: buildGenericSuggestedRewrite(raw),
      primaryCtaLabel: "Use suggested draft request",
      secondaryCtaLabel: "Keep editing",
    };
  }

  if ((counselSignals && numberedAdvisory && !hasBetweenParties) || (counselSignals && raw.length >= 900 && !hasDraftIntent)) {
    const suggested = buildCommercialSuggestedRewrite(raw);
    const topicCount = extractTopicChips(raw).length;
    const dataNotes = extractDataScopeNotes(raw);
    const partyHint =
      partySignals.suggestedCount >= 3
        ? `Name all ${partySignals.suggestedCount} legal entities that will sign (in order).`
        : "Name both legal entities (your company and the other party). You can add a 3rd/4th signer later in signer setup if needed.";
    return {
      kind: "counsel_prep",
      title: "This reads like negotiation prep — not a draftable agreement yet",
      why:
        "LawDog creates executable agreements from named parties, scope, fee, and term. " +
        "It does not produce attorney negotiation memos or markups of the other side’s paper.",
      whatWeHeard: heardFromCounselPrep(raw),
      guidedSteps: [
        partyHint,
        `Say you want a draft (not advice) — e.g. “${draftExampleForDeal(deal)}”.`,
        topicCount > 0
          ? "Keep the commercial facts already listed below (fee, term, and the topics we extracted)."
          : "Keep the commercial facts you already listed (fee, term, and key risk topics).",
        dataNotes.length > 0
          ? "Keep the data-scope lines (handles / out of scope) — they belong in the draft request."
          : "If data scope matters, say what data is in and out of scope (e.g. no PHI, PCI, or children’s data).",
        "Save negotiation strategy / “what to push” questions for your attorney or AE playbook outside LawDog.",
      ],
      suggestedRewrite: suggested,
      primaryCtaLabel: "Use suggested draft request",
      secondaryCtaLabel: "I’ll edit the prompt myself",
    };
  }

  // Thin dumps with ANY draftable signal (name, scope/work, exchange) should
  // FAIL-OPEN to the starter one-pager instead of blocking. The five-tenet system will
  // show targeted questions for missing tenets (parties, payment, term, governing law).
  // Block only empty / gibberish / counsel-memo.
  const hasDraftableSignal = hasDraftableCommercialSignal(raw);

  if (!hasDraftableSignal && ((raw.length < 40 && !hasBetweenParties) || (signal === 0 && raw.length < 80 && !hasBetweenParties))) {
    return {
      kind: "too_sparse",
      title: "I can draft this once I know who is agreeing and what they are agreeing to",
      why: "Add the two legal names and one sentence describing the work, rights, or exchange.",
      whatWeHeard: raw.length ? [`You wrote: “${raw.slice(0, 120)}${raw.length > 120 ? "…" : ""}”`] : [],
      guidedSteps: [
        "Name the legal entities that will sign (usually two; up to four).",
        "Say what they are agreeing to (any commercial arrangement — not limited to NDA/SaaS/services).",
        "Add fee and term or effective date if you know them — they are not required to create a draft.",
        "Optional: note data that is in or out of scope.",
      ],
      suggestedRewrite: buildGenericSuggestedRewrite(raw),
      primaryCtaLabel: "Use starter template",
      secondaryCtaLabel: "Keep editing",
    };
  }

  const looksCommercial =
    hasMoney ||
    hasTerm ||
    SAAS_RE.test(raw) ||
    PILOT_RE.test(raw) ||
    SERVICES_RE.test(raw) ||
    NDA_RE.test(raw) ||
    LICENSE_RE.test(raw) ||
    EMPLOYMENT_RE.test(raw) ||
    LOAN_RE.test(raw) ||
    LEASE_RE.test(raw) ||
    signal >= 3;

  // Skip the missing_named_parties block for thin dumps with draftable signal,
  // UNLESS they explicitly mention multiple parties (e.g., "3 parties", "three-party").
  // Let them fail-open to the starter; the five-tenet system will ask targeted questions.
  const explicitMultiPartyRequest = (partySignals.declared != null && partySignals.declared >= 3) || /\b(?:three|four|3|4)[-\s]?part(?:y|ies)\b/i.test(raw);
  if (looksCommercial && !hasBetweenParties && !(hasDraftableSignal && raw.length < 100 && !explicitMultiPartyRequest)) {
    const suggested = buildGenericSuggestedRewrite(raw);
    const heard: string[] = [];
    if (hasMoney) heard.push(`Fee / economics mentioned: ${extractMoneyPhrases(raw).join(", ") || "yes"}.`);
    if (hasTerm) heard.push(`Term mentioned: ${extractTermPhrase(raw) || "yes"}.`);
    if (deal !== "generic") heard.push(`Looks like a ${deal.replace(/_/g, " ")} request.`);
    const topics = extractTopicChips(raw);
    if (topics.length) heard.push(`Topics detected (${topics.length}): ${topics.slice(0, 12).join("; ")}.`);
    for (const note of extractDataScopeNotes(raw)) heard.push(`${note}.`);
    if (partySignals.declared === 3 || partySignals.declared === 4) {
      heard.push(`You mentioned a ${partySignals.declared}-party deal — list those ${partySignals.declared} legal names.`);
    } else if (partySignals.listed === 1) {
      heard.push("Only one party-like name was detected; agreements need at least two signers.");
    } else {
      heard.push("Legal party names are missing or not in a “between A and B” / “among A, B, and C” form.");
    }
    const partyStep =
      partySignals.suggestedCount >= 3
        ? `Add: “${buildSigningPartyClause(partySignals.suggestedCount)}”.`
        : "Add: “between [Your Company LLC] and [Customer Inc.].” (Add a 3rd/4th party only if they will sign.)";
    return {
      kind: "missing_named_parties",
      title: "Name the parties to continue",
      why: "We can see commercial details, but not clear legal names for every signing party (2–4).",
      whatWeHeard: heard,
      guidedSteps: [
        partyStep,
        "Keep the fee, term, scope, and data-scope facts you already wrote.",
        "Then tap Create agreement again.",
      ],
      suggestedRewrite: suggested,
      primaryCtaLabel: "Use suggested draft request",
      secondaryCtaLabel: "I’ll add parties myself",
    };
  }

  // Two named parties + a concrete work description is never a too-thin
  // suggested-draft dead-end — missing payment/term/law go to the five-tenet ask.
  if (hasBetweenParties && hasPurpose) {
    return null;
  }

  if (
    hasBetweenParties &&
    !hasDraftIntent &&
    !hasMoney &&
    !hasTerm &&
    !hasPurpose &&
    (raw.length < 120 || signal < 3)
  ) {
    return {
      kind: "needs_commercial_basics",
      title: "I can draft this once I know what they are agreeing to",
      why: "Parties are clearer than the deal itself — add one sentence describing the work, rights, or exchange.",
      whatWeHeard: ["A between-parties phrase was detected.", "Scope / purpose still looks thin."],
      guidedSteps: [
        "Add what the parties are agreeing to (scope, rights, payment treatment, work, etc.).",
        "Add payment (if any) and how long it lasts or when it becomes effective if you know them.",
        "Start with “Draft a … agreement between …”.",
      ],
      suggestedRewrite: buildGenericSuggestedRewrite(raw),
      primaryCtaLabel: "Use suggested draft request",
      secondaryCtaLabel: "Keep editing",
    };
  }

  // Long / inundated notes: salvage what we can, force a draft-shaped rewrite.
  if (raw.length >= 400 && !hasDraftIntent && !hasBetweenParties) {
    const topics = extractTopicChips(raw);
    const dataNotes = extractDataScopeNotes(raw);
    if (signal <= 1 && topics.length === 0 && dataNotes.length === 0) {
      return lowSignalClarification(raw);
    }
    return {
      kind: "ambiguous_request",
      title: "We need a clearer draft request",
      why:
        "This prompt is long or mixed with extra notes, but it isn’t shaped as “draft an agreement between named parties.” " +
        "Your original text is preserved. We summarized the commercial facts we could read — nothing was dropped silently.",
      whatWeHeard: [
        `About ${raw.length.toLocaleString()} characters of notes.`,
        hasMoney ? `Economics mentioned: ${extractMoneyPhrases(raw).join(", ")}.` : "Economics were not clearly stated.",
        hasTerm ? `Term mentioned: ${extractTermPhrase(raw)}.` : "Term was not clearly stated.",
        ...(topics.length ? [`Topics detected (${topics.length}): ${topics.slice(0, 14).join("; ")}.`] : []),
        ...dataNotes.map((n) => `${n}.`),
        ...(signal <= 2
          ? ["Much of the text looks unrelated or non-commercial — only salvageable facts are listed above."]
          : []),
      ],
      guidedSteps: [
        "Lead with: “Draft a [type] agreement between [A] and [B]…” (or among A, B, and C for 3–4 signers).",
        "Keep the deal facts you want in the contract; leave advice questions for later.",
        "Keep data-scope exclusions if you stated them (PHI, PCI, children’s data, etc.).",
        "Or use the suggested rewrite and fill in the bracketed names.",
      ],
      suggestedRewrite: buildGenericSuggestedRewrite(raw),
      primaryCtaLabel: "Use suggested draft request",
      secondaryCtaLabel: "I’ll rewrite it",
    };
  }

  // Medium-length prompts with no commercial anchors — but allow draftable signals.
  if (signal === 0 && raw.length >= 40 && !hasDraftableSignal) {
    return lowSignalClarification(raw);
  }

  return null;
}

/** Backward-compatible boolean gate used by create-submit paths. */
export type AgreementIntakeCapabilityDecision =
  | { ok: true }
  | {
      ok: false;
      code: AgreementIntakeClarificationKind;
      userMessage: string;
      clarification: AgreementIntakeClarification;
    };

function clarificationToUserMessage(c: AgreementIntakeClarification): string {
  const heard = c.whatWeHeard.length ? `\n\nWhat we heard:\n- ${c.whatWeHeard.join("\n- ")}` : "";
  const steps = `\n\nHow to fix it:\n${c.guidedSteps.map((s, i) => `${i + 1}. ${s}`).join("\n")}`;
  const suggest = c.suggestedRewrite ? `\n\nSuggested draft request:\n${c.suggestedRewrite}` : "";
  return `${c.title}\n\n${c.why}${heard}${steps}${suggest}`;
}

export function assessAgreementIntakeCapability(rawIntake: string): AgreementIntakeCapabilityDecision {
  const clarification = buildAgreementIntakeClarification(rawIntake);
  if (!clarification) return { ok: true };
  return {
    ok: false,
    code: clarification.kind,
    userMessage: clarificationToUserMessage(clarification),
    clarification,
  };
}

export type IntentionalCreateDraftSubmitDecision =
  | { action: "proceed"; text: string }
  | {
      action: "block_capability";
      text: string;
      message: string;
      clarification: AgreementIntakeClarification;
    }
  | { action: "noop" };

export function evaluateIntentionalCreateDraftSubmit(rawIntake: string): IntentionalCreateDraftSubmitDecision {
  const text = (rawIntake || "").replace(/\r\n/g, "\n").trim();
  if (text.length < 6) {
    return {
      action: "block_capability",
      text,
      message: "Please describe the agreement in more detail.",
      clarification: {
        kind: "too_short",
        title: "Need more detail",
        why: "Please describe the parties and the deal so we can draft an agreement.",
        whatWeHeard: text ? [`"${text}"`] : [],
        guidedSteps: [
          "Name the parties to the agreement (e.g., Acme Corp and Beta LLC)",
          "Describe the purpose or scope (e.g., services, NDA, partnership)",
          "Include payment terms if applicable",
        ],
        suggestedRewrite: null,
        primaryCtaLabel: "Continue",
        secondaryCtaLabel: "Cancel",
      },
    };
  }
  const capability = assessAgreementIntakeCapability(text);
  if (!capability.ok) {
    return {
      action: "block_capability",
      text,
      message: capability.userMessage,
      clarification: capability.clarification,
    };
  }
  return { action: "proceed", text };
}

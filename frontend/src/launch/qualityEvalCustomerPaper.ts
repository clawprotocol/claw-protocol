/**
 * Customer-meaning checks for quality-eval Harbor and SaaS papers.
 * Equivalent valid wording is accepted. Changed, omitted, or invented
 * supplied facts are rejected. Unanswered facts stay visible, not invented.
 */
import {
  describeOperativeArticleCompare,
  normalizeArticleWhitespace,
} from "./corePaidJourneyAcceptanceMatrix";
import {
  RELEASE_SCOPE_SAMPLES,
  type ReleaseScopeCaseId,
} from "./releaseScopeQualificationCampaign";
import { cueAssignedToExpectedEntity } from "../components/agreements/paidProPartyEconomicRelationships";
import { paperBindsMilestonePayer, textNamesExplicitPayer } from "../components/agreements/paidProMilestonePayer";

export type PaperCheck = { ok: boolean; reasons: string[] };

const CHANGED_NET = /\bnet[- ]*(?:60|90|sixty|ninety)\b/i;
const NET_30 =
  /\b(?:net[- ]*(?:30|thirty)|payable within (?:30|thirty) days|due (?:in |within )(?:30|thirty) days)\b/i;
const ANNUAL_FEE = /\b(?:annual(?:ly)?|per year|yearly)\b/i;
const TWELVE_MONTHS =
  /\b(?:twelve(?:\s*\(\s*12\s*\))?\s*months?|12(?:\s*\(\s*12\s*\))?\s*months?|12-month|one[- ]year)\b/i;
const HOSTED_SCOPE = /\b(?:hosted platform|hosted access|hosted software)\b/i;
const NO_PROFESSIONAL =
  /\b(?:no professional services|without professional services|hosted platform only|hosted access only|hosted software access only|shall not perform professional services)\b/i;
const AUTOMATIC_ACCEPT = /\b(?:accepted automatically|automatically (?:accepted|deemed))\b/i;
const PROJECT_DELIVERABLE_APPROVAL = /approve every project deliverable/i;
const PLACEHOLDER = /\[insert[^\]]*\]|lorem ipsum|\bTBD\b|Orion Labs|Contoso Retail/i;
const INVENTED_CONSULTING =
  /\b(?:CONSULTING SERVICES AGREEMENT|AI workflow implementation|Consultant shall perform)\b/;
const UNDEFINED_EFFECTIVE = /as of the Effective Date by and between/i;
const CUSTOMER_EFFECTIVE =
  /October 1, 2026 \(the ["']Effective Date["']\)|as of October 1, 2026/i;
const CUSTOMER_COMPLETION =
  /\b(?:written confirmation|client(?:'s)? confirms?) that the implemented AI workflow is in operational use/i;

function fail(reasons: string[]): PaperCheck {
  return { ok: reasons.length === 0, reasons };
}

function inventedAcceptanceObligation(text: string): boolean {
  if (AUTOMATIC_ACCEPT.test(text) || PROJECT_DELIVERABLE_APPROVAL.test(text)) return true;
  if (/must approve every|shall approve every project/i.test(text)) return true;
  if (/deemed (?:accepted|acceptance)/i.test(text) && !/does not create\b/i.test(text)) return true;
  return false;
}

export function checkSaasCustomerMeaning(article: string): PaperCheck {
  const text = normalizeArticleWhitespace(article || "");
  const reasons: string[] = [];
  if (!/Orion Harbor LLC/.test(text)) reasons.push("missing_provider_party");
  if (!/Northwind Retail Inc/.test(text)) reasons.push("missing_customer_party");
  if (!/\$48,000/.test(text)) reasons.push("missing_annual_fee_amount");
  if (!ANNUAL_FEE.test(text)) reasons.push("missing_annual_fee_basis");
  if (!TWELVE_MONTHS.test(text)) reasons.push("missing_twelve_month_duration");
  if (!NET_30.test(text)) reasons.push("missing_supplied_net_30");
  if (CHANGED_NET.test(text)) reasons.push("changed_supplied_payment_timing");
  if (!HOSTED_SCOPE.test(text)) reasons.push("missing_hosted_scope");
  if (!NO_PROFESSIONAL.test(text)) reasons.push("missing_hosted_only_limit");
  if (!/New York/i.test(text)) reasons.push("missing_governing_law");
  if (INVENTED_CONSULTING.test(text) && /CONSULTING SERVICES AGREEMENT|AI workflow implementation/.test(text)) {
    reasons.push("invented_consulting_paper");
  }
  if (inventedAcceptanceObligation(text)) reasons.push("invented_project_acceptance");
  if (PLACEHOLDER.test(text)) reasons.push("placeholder_or_forbidden_party");
  return fail(reasons);
}

export function saasPaperReady(article: string): boolean {
  return checkSaasCustomerMeaning(article).ok;
}

export function checkHarborFirstDraftMeaning(article: string): PaperCheck {
  const text = normalizeArticleWhitespace(article || "");
  const reasons: string[] = [];
  if (!/Harbor Peak Analytics LLC/.test(text)) reasons.push("missing_consultant_party");
  if (!/Ironvale Manufacturing Inc/.test(text)) reasons.push("missing_client_party");
  if (!/\$48,000/.test(text)) reasons.push("missing_fee_amount");
  if (!/AI workflow implementation/i.test(text)) reasons.push("missing_supplied_scope");
  if (!/Delaware/i.test(text)) reasons.push("missing_governing_law");
  if (!/October 1, 2026/.test(text)) reasons.push("missing_service_start");
  if (!TWELVE_MONTHS.test(text)) reasons.push("missing_term_duration");
  if (UNDEFINED_EFFECTIVE.test(text)) reasons.push("invented_undefined_effective_date");
  if (CUSTOMER_EFFECTIVE.test(text)) reasons.push("invented_effective_date_before_answer");
  if (CUSTOMER_COMPLETION.test(text)) reasons.push("invented_completion_before_answer");
  if (inventedAcceptanceObligation(text) || /uptime sla/i.test(text)) {
    reasons.push("invented_acceptance_or_sla");
  }
  if (PLACEHOLDER.test(text)) reasons.push("placeholder_or_forbidden_party");
  return fail(reasons);
}

export function checkHarborAppliedMeaning(article: string): PaperCheck {
  const first = checkHarborFirstDraftMeaning(article);
  const text = normalizeArticleWhitespace(article || "");
  const reasons = first.reasons.filter(
    (r) => r !== "invented_completion_before_answer" && r !== "invented_effective_date_before_answer",
  );
  const opening = text.slice(0, 700);
  if (!CUSTOMER_EFFECTIVE.test(opening) && !CUSTOMER_EFFECTIVE.test(text)) {
    reasons.push("missing_customer_effective_date");
  }
  if (!CUSTOMER_COMPLETION.test(text)) reasons.push("missing_customer_completion_meaning");
  if (UNDEFINED_EFFECTIVE.test(opening)) reasons.push("invented_undefined_effective_date");
  return fail(reasons);
}

export function consultingPaperReady(article: string): boolean {
  return checkHarborAppliedMeaning(article).ok;
}

/** Remove the date/completion decorations this bounded Apply is allowed to add. */
export function stripAuthorizedHarborApplyDecorations(article: string): string {
  let text = article || "";
  text = text.replace(/^\s*CONSULTING SERVICES AGREEMENT\s*/i, "");
  text = text.replace(
    /This (?:AI Workflow Implementation )?Consulting Services Agreement(?:\s*\((?:the|this) ["']Agreement["']\))?\s+is entered into(?:\s+as of October 1, 2026(?:,)?(?:\s*\(the ["']Effective Date["']\))?)?\s+by and between/gi,
    "This Consulting Services Agreement is entered into by and between",
  );
  text = text.replace(
    /\s+as of October 1, 2026(?:,)?(?:\s*\(the ["']Effective Date["']\))?/gi,
    "",
  );
  text = text.replace(
    /\s*(?:The )?(?:Consultant and Client|parties) may be referred to individually as a ["']Party["'] and collectively as the ["']Parties\.?["']\.?\s*/gi,
    " ",
  );
  text = text.replace(/October 1, 2026 \(the ["']Effective Date["']\)/gi, "October 1, 2026");
  // Strip only the authorized completion decoration, not the rest of the sentence.
  text = text.replace(
    /(?:Completion\s+is\s+)?(?:Client(?:'s)?\s+)?written confirmation that the implemented AI workflow is in operational use/gi,
    "",
  );
  text = text.replace(
    /(?:Completion\s+is\s+)?[Cc]lient(?:'s)?\s+confirms? that the implemented AI workflow is in operational use/gi,
    "",
  );
  // Collapse a sentence that is now only leftover punctuation. Do not eat remaining clauses.
  text = text.replace(/([.!?])\s*\./g, "$1");
  text = text.replace(/^\s*[.]\s*/gm, "");
  return text;
}

function ceremonyLineRemainder(line: string, body: string): string | null {
  let t = line.replace(/\r/g, "").trim();
  if (!t) return null;
  if (/^IN WITNESS WHEREOF\b/i.test(t)) {
    t = t.replace(/^IN WITNESS WHEREOF[\s\S]*?(?:\.|$)/i, "").trim();
    return t || null;
  }
  t = t.replace(/^(?:CONSULTANT|CLIENT|SERVICE PROVIDER|PROVIDER|CUSTOMER)\s*:?\s*/i, "").trim();
  t = t.replace(/^(?:By|Name|Title|Date)\s*:\s*/i, "").trim();
  t = t.replace(/_{3,}/g, " ").replace(/\s+/g, " ").trim();
  if (!t || /^[\s_.-]+$/.test(t)) return null;
  if (body.includes(t) && t.split(/\s+/).length <= 6 && t.length < 80) return null;
  return t;
}

/** Drop signature ceremony labels, but keep any extra operative text on those lines. */
export function stripHarborCeremonyKeepOperativeTail(article: string): string {
  const text = (article || "").replace(/\r\n/g, "\n");
  const idx = text.search(/\bIN WITNESS WHEREOF/i);
  const body = idx >= 0 ? text.slice(0, idx) : text;
  const tail = idx >= 0 ? text.slice(idx) : "";
  const kept = tail
    .split("\n")
    .map((line) => ceremonyLineRemainder(line, body))
    .filter((line): line is string => Boolean(line));
  return normalizeArticleWhitespace([body, ...kept].join("\n"));
}

export function applyChangesExplainedByAnswers(
  before: string,
  after: string,
  answers: string,
): PaperCheck {
  const prior = normalizeArticleWhitespace(before);
  const next = normalizeArticleWhitespace(after);
  const supplied = normalizeArticleWhitespace(answers);
  const reasons: string[] = [];
  if (!next || next.length < 400) reasons.push("after_apply_empty");
  const addedDate = CUSTOMER_EFFECTIVE.test(next) && !CUSTOMER_EFFECTIVE.test(prior);
  if (addedDate && !/effective date is the same as the October 1, 2026 service start/i.test(supplied)) {
    reasons.push("effective_date_not_from_customer_answer");
  }
  const addedCompletion = CUSTOMER_COMPLETION.test(next) && !CUSTOMER_COMPLETION.test(prior);
  if (
    addedCompletion &&
    !/written confirmation that the implemented AI workflow is in operational use|client confirms the implemented AI workflow is in operational use/i.test(
      supplied,
    )
  ) {
    reasons.push("completion_not_from_customer_answer");
  }
  const remainder = describeOperativeArticleCompare(
    "first_draft_remainder",
    stripHarborCeremonyKeepOperativeTail(stripAuthorizedHarborApplyDecorations(before)),
    "after_apply_remainder",
    stripHarborCeremonyKeepOperativeTail(stripAuthorizedHarborApplyDecorations(after)),
  );
  if (!remainder.sameOperative) {
    reasons.push("unauthorized_operative_change");
  }
  return fail(reasons);
}

export function assertCheck(check: PaperCheck, label: string): void {
  if (!check.ok) {
    throw new Error(`${label}: ${check.reasons.join(",")}`);
  }
}

const THREE_PARTY_SPLIT = [/\b45\s*%|\bforty[ -]?five\s+percent/i, /\b35\s*%|\bthirty[ -]?five\s+percent/i, /\b20\s*%|\btwenty\s+percent/i];
const FOUR_PARTY_LUMEN = [/\$250,000/, /\$400,000/, /\$350,000/];
const FOUR_PARTY_THALASSA = [/\$180,000/, /\$220,000/];
const FOUR_PARTY_COASTAL = [/\$150,000/, /\$175,000/];
const FOUR_PARTY_VANGUARD = [/\$95,000/, /\$105,000/];
const TWENTY_FOUR_MONTHS = /\b(?:24(?:\s*\(\s*24\s*\))?\s*months?|twenty[ -]?four\s+months)\b/i;

function missingParty(text: string, name: string): boolean {
  return !text.includes(name);
}

function substitutedGoverningLaw(text: string, expected: string, forbidden: readonly string[]): boolean {
  if (!new RegExp(expected, "i").test(text)) return true;
  for (const other of forbidden) {
    const governed = new RegExp(
      `(?:govern(?:ed|ing)(?:\\s+law)?(?:\\s+by(?:\\s+the\\s+laws\\s+of(?:\\s+the\\s+State\\s+of)?)?)?|laws?\\s+of(?:\\s+the\\s+State\\s+of)?)\\s+${other}`,
      "i",
    );
    const governs = new RegExp(`${other}\\s+law\\s+governs`, "i");
    if (governed.test(text) || governs.test(text)) return true;
  }
  return false;
}

const STONEBRIDGE = "Stonebridge Wellness LLC";
const NOVAPATH = "NovaPath Learning Inc.";
const CLEARSPRING = "ClearSpring Distribution LLC";
const SHARE_45 = /\b45\s*%|\bforty[ -]?five\s+percent/i;
const SHARE_35 = /\b35\s*%|\bthirty[ -]?five\s+percent/i;
const SHARE_20 = /\b20\s*%|\btwenty\s+percent/i;
const STONEBRIDGE_RIGHT = /original (?:content|materials)|wellness training/i;
const NOVAPATH_OBLIGATION = /platform code|online training platform|adapt(?:s| and host)/i;
const CLEARSPRING_OBLIGATION = /\b(?:billing|account management|market(?:s|ing)|sell(?:s|ing) subscriptions)\b/i;

export function checkThreePartyCustomerMeaning(article: string): PaperCheck {
  const text = normalizeArticleWhitespace(article || "");
  const sample = RELEASE_SCOPE_SAMPLES.find((row) => row.id === "three_party");
  const reasons: string[] = [];
  if (!sample) return fail(["missing_three_party_sample"]);
  for (const party of sample.parties) {
    if (missingParty(text, party.legalEntity)) reasons.push(`missing_party_${party.legalEntity}`);
  }
  if (!/Oklahoma/i.test(text) || substitutedGoverningLaw(text, "Oklahoma", sample.forbiddenJurisdictions)) {
    reasons.push("missing_or_substituted_governing_law");
  }
  THREE_PARTY_SPLIT.forEach((pattern, index) => {
    if (!pattern.test(text)) reasons.push(`missing_revenue_share_${["45", "35", "20"][index]}`);
  });
  const threeEntities = [STONEBRIDGE, NOVAPATH, CLEARSPRING];
  if (!cueAssignedToExpectedEntity(text, STONEBRIDGE, threeEntities, SHARE_45)) {
    reasons.push("reassigned_or_unbound_stonebridge_share");
  }
  if (!cueAssignedToExpectedEntity(text, NOVAPATH, threeEntities, SHARE_35)) {
    reasons.push("reassigned_or_unbound_novapath_share");
  }
  if (!cueAssignedToExpectedEntity(text, CLEARSPRING, threeEntities, SHARE_20)) {
    reasons.push("reassigned_or_unbound_clearspring_share");
  }
  if (!cueAssignedToExpectedEntity(text, STONEBRIDGE, threeEntities, STONEBRIDGE_RIGHT)) {
    reasons.push("missing_stonebridge_content_ownership");
  }
  if (!cueAssignedToExpectedEntity(text, NOVAPATH, threeEntities, NOVAPATH_OBLIGATION)) {
    reasons.push("missing_novapath_platform_responsibility");
  }
  if (!cueAssignedToExpectedEntity(text, CLEARSPRING, threeEntities, CLEARSPRING_OBLIGATION)) {
    reasons.push("missing_clearspring_distribution_responsibility");
  }
  if (/\bI am only coordinating|Jane Coordinator\b/i.test(text)) {
    reasons.push("invented_coordinator_party");
  }
  for (const name of sample.forbiddenParties) {
    if (text.includes(name)) reasons.push(`forbidden_party_${name}`);
  }
  if (PLACEHOLDER.test(text)) reasons.push("placeholder_or_forbidden_party");
  return fail(reasons);
}

const LUMEN = "Lumen Bioinformatics Inc.";
const THALASSA = "Thalassa Data Systems LLC";
const COASTAL = "Coastal Meridian Analytics LLC";
const VANGUARD = "Vanguard Regulatory Sciences Ltd.";
const FOUR_ENTITIES = [LUMEN, THALASSA, COASTAL, VANGUARD];

export function checkFourPartyCustomerMeaning(article: string, stage: "first" | "applied" = "first"): PaperCheck {
  const text = normalizeArticleWhitespace(article || "");
  const sample = RELEASE_SCOPE_SAMPLES.find((row) => row.id === "four_party");
  const reasons: string[] = [];
  if (!sample) return fail(["missing_four_party_sample"]);
  for (const party of sample.parties) {
    if (missingParty(text, party.legalEntity)) reasons.push(`missing_party_${party.legalEntity}`);
  }
  if (
    !/Massachusetts/i.test(text) ||
    substitutedGoverningLaw(text, "Massachusetts", sample.forbiddenJurisdictions)
  ) {
    reasons.push("missing_or_substituted_governing_law");
  }
  if (!TWENTY_FOUR_MONTHS.test(text)) reasons.push("missing_twenty_four_month_term");
  const milestoneBindings: Array<[string, readonly RegExp[], string]> = [
    [LUMEN, FOUR_PARTY_LUMEN, "lumen"],
    [THALASSA, FOUR_PARTY_THALASSA, "thalassa"],
    [COASTAL, FOUR_PARTY_COASTAL, "coastal"],
    [VANGUARD, FOUR_PARTY_VANGUARD, "vanguard"],
  ];
  for (const [entity, patterns, label] of milestoneBindings) {
    for (const pattern of patterns) {
      if (!pattern.test(text)) reasons.push(`missing_${label}_milestone_${pattern.source}`);
      else if (!cueAssignedToExpectedEntity(text, entity, FOUR_ENTITIES, pattern)) {
        reasons.push(`reassigned_${label}_milestone_${pattern.source}`);
      }
    }
  }
  if (!cueAssignedToExpectedEntity(text, LUMEN, FOUR_ENTITIES, /Platform Developer/i)) {
    reasons.push("missing_lumen_role");
  }
  if (!cueAssignedToExpectedEntity(text, THALASSA, FOUR_ENTITIES, /Data Infrastructure Provider/i)) {
    reasons.push("missing_thalassa_role");
  }
  if (!cueAssignedToExpectedEntity(text, COASTAL, FOUR_ENTITIES, /Analytics Integrator/i)) {
    reasons.push("missing_coastal_role");
  }
  if (!cueAssignedToExpectedEntity(text, VANGUARD, FOUR_ENTITIES, /Regulatory Compliance Advisor/i)) {
    reasons.push("missing_vanguard_role");
  }
  if (stage === "first") {
    if (textNamesExplicitPayer(text)) reasons.push("invented_milestone_payer");
  } else if (!paperBindsMilestonePayer(text, LUMEN)) {
    reasons.push("missing_or_reassigned_milestone_payer");
  }
  for (const name of sample.forbiddenParties) {
    if (text.includes(name)) reasons.push(`forbidden_party_${name}`);
  }
  if (PLACEHOLDER.test(text)) reasons.push("placeholder_or_forbidden_party");
  return fail(reasons);
}

export function threePartyPaperReady(article: string): boolean {
  return checkThreePartyCustomerMeaning(article).ok;
}

export function checkSilverMesaFourPartyCustomerMeaning(article: string): PaperCheck {
  const text = normalizeArticleWhitespace(article || "");
  const reasons: string[] = [];
  const parties = [
    "Ironclad Systems Group LLC",
    "Harborline Data Solutions Inc.",
    "Northwind Automation Partners LLC",
    "Silver Mesa Analytics LP",
  ];
  for (const name of parties) {
    if (!text.includes(name)) reasons.push(`missing_party_${name}`);
  }
  if (text.includes("VertexGrid Technologies LLC")) reasons.push("invented_fifth_party_vertexgrid");
  if (!/Texas/i.test(text)) reasons.push("missing_texas_governing_law");
  if (/Massachusetts|Oklahoma|Delaware/i.test(text) && !/Texas/i.test(text)) {
    reasons.push("substituted_governing_law");
  }
  if (!/\$187,500/.test(text)) reasons.push("missing_rollout_fee");
  if (!/\b24 months\b/i.test(text)) reasons.push("missing_twenty_four_month_term");
  if (!/3 Ironclad Way, Austin, TX 78701/.test(text)) reasons.push("missing_ironclad_address");
  if (!/Sponsor/.test(text) || !/Vendor/.test(text) || !/Integrator/.test(text) || !/Analyst/.test(text)) {
    reasons.push("missing_requested_roles");
  }
  if (PLACEHOLDER.test(text)) reasons.push("placeholder_or_forbidden_party");
  return fail(reasons);
}

export function silverMesaFourPartyPaperReady(article: string): boolean {
  return checkSilverMesaFourPartyCustomerMeaning(article).ok;
}

export function fourPartyPaperReady(article: string): boolean {
  return checkFourPartyCustomerMeaning(article, "applied").ok;
}

export function fourPartyFirstDraftReady(article: string): boolean {
  return checkFourPartyCustomerMeaning(article, "first").ok;
}

export function paperReadyForReleaseScopeCase(id: ReleaseScopeCaseId, article: string): boolean {
  if (id === "consulting") return consultingPaperReady(article);
  if (id === "saas") return saasPaperReady(article);
  if (id === "three_party") return threePartyPaperReady(article);
  return fourPartyPaperReady(article);
}


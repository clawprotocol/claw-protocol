import { semanticPayloadOwnerMap, type SemanticPayloadType } from "./finalAgreementCompilerIntegrity";
import { renderPaymentSection, renderSupportSection, type ProCommercialProseContext } from "./proCommercialProseRenderer";
import { forbiddenSemanticFactForLine, type ProSemanticArchetype } from "./proSemanticBlocks";
import { dedupeGuidedQuestionsBySemanticIntent } from "./guidedDealCompletion/guidedQuestionQueue";
import type { DealVariable } from "./guidedDealCompletion/types";

export type ProAgreementPlanOwnerSection =
  | "purpose"
  | "fees"
  | "ownership"
  | "confidentiality"
  | "support"
  | "termination"
  | "notices"
  | "misc"
  | "electronic_signatures"
  | "execution";

export type ProAgreementPlanParty = {
  legalName: string;
  roleLabel: string;
};

export type ProAgreementPlanClauseCandidate = {
  intent: string;
  ownerSection: ProAgreementPlanOwnerSection;
  text: string;
  requiredFacts: string[];
  prohibitedFacts: string[];
};

export type ProAgreementPlanMissingQuestion = {
  id: string;
  semanticIntent: string;
  question: string;
  label?: string;
};

export type ProAgreementPlan = {
  archetype: ProSemanticArchetype | string;
  parties: {
    client?: ProAgreementPlanParty | null;
    serviceProvider?: ProAgreementPlanParty | null;
    partiesLabel?: string | null;
  };
  commercialFacts: Record<string, string | number | boolean | null | undefined>;
  clauseIntents: string[];
  missingQuestions: ProAgreementPlanMissingQuestion[];
  style: string;
  clauseCandidates?: ProAgreementPlanClauseCandidate[];
};

export type ProAgreementPlanValidationResult = {
  ok: boolean;
  defects: string[];
  safeClauseCandidates: ProAgreementPlanClauseCandidate[];
  rejectedClauseCandidates: Array<{ candidate: ProAgreementPlanClauseCandidate; defects: string[] }>;
};

const GENERIC_PROSE_RE =
  /\b(?:the applicable Party|applicable deliverables|applicable Party retained materials|commercial terms include|standard terms)\b/i;
const PLACEHOLDER_RE = /\[(?:ORG|ADDRESS|PERSON|PARTY|CLIENT|PROVIDER|DATE|AMOUNT|STATE|NAME)[^\]]*\]|\{\{[^}]+\}\}/i;

const INTENT_TO_PAYLOAD: Record<string, SemanticPayloadType> = {
  services_scope_list: "services_scope_list",
  scope: "services_scope_list",
  payment: "payment_amount",
  payment_amount: "payment_amount",
  payment_structure: "payment_amount",
  milestone_schedule: "milestone_schedule",
  support: "support_expectations",
  support_expectations: "support_expectations",
  governing_law: "governing_law",
  termination: "termination_notice",
  termination_notice: "termination_notice",
  ownership: "ownership_terms",
  ownership_terms: "ownership_terms",
  confidentiality: "confidentiality_terms",
  confidentiality_terms: "confidentiality_terms",
  notices: "notices_terms",
  notices_terms: "notices_terms",
  signature_block: "signature_block",
};

function normalize(text: string | null | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

function canonicalIntent(intent: string): string {
  return normalize(intent).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function payloadForIntent(intent: string): SemanticPayloadType | null {
  const key = canonicalIntent(intent);
  return INTENT_TO_PAYLOAD[key] ?? null;
}

function hasFact(text: string, fact: string): boolean {
  const target = normalize(text);
  const terms = normalize(fact).split(/[^a-z0-9$%]+/).filter((term) => term.length > 1);
  return terms.length > 0 && terms.every((term) => target.includes(term));
}

function planFactsText(plan: ProAgreementPlan): string {
  return Object.values(plan.commercialFacts)
    .filter((value) => value != null && value !== false)
    .map(String)
    .join("\n");
}

function textUsesKnownRoles(text: string, plan: ProAgreementPlan): boolean {
  const client = plan.parties.client?.roleLabel || "Client";
  const provider = plan.parties.serviceProvider?.roleLabel || "Service Provider";
  if (/\b(?:Company|Contractor|Provider)\b/i.test(text) && !new RegExp(`\\b(?:${client}|${provider})\\b`, "i").test(text)) {
    return false;
  }
  return true;
}

export function validateClauseCandidate(
  candidate: ProAgreementPlanClauseCandidate,
  plan: ProAgreementPlan,
): { ok: boolean; defects: string[] } {
  const defects: string[] = [];
  const text = candidate.text || "";
  const payload = payloadForIntent(candidate.intent);
  const owner = payload ? semanticPayloadOwnerMap[payload] : null;
  if (!payload) defects.push("unknown_semantic_intent");
  if (owner && owner !== candidate.ownerSection) defects.push("owner_section_mismatch");
  if (PLACEHOLDER_RE.test(text)) defects.push("placeholder");
  if (GENERIC_PROSE_RE.test(text)) defects.push("generic_renderer_language");
  if (!textUsesKnownRoles(text, plan)) defects.push("party_role_mismatch");
  for (const fact of candidate.requiredFacts) {
    if (!hasFact(text, fact)) defects.push(`required_fact_missing:${fact}`);
  }
  for (const fact of candidate.prohibitedFacts) {
    if (hasFact(text, fact)) defects.push(`prohibited_fact_present:${fact}`);
  }
  const forbidden = forbiddenSemanticFactForLine(text, plan.archetype, planFactsText(plan));
  if (forbidden) defects.push(`forbidden_archetype_fact:${forbidden}`);
  return { ok: defects.length === 0, defects };
}

export function validateProAgreementPlan(plan: ProAgreementPlan): ProAgreementPlanValidationResult {
  const defects: string[] = [];
  if (!plan.archetype) defects.push("missing_archetype");
  if (PLACEHOLDER_RE.test(JSON.stringify(plan))) defects.push("placeholder");
  if (GENERIC_PROSE_RE.test(JSON.stringify(plan.clauseCandidates ?? []))) defects.push("generic_renderer_language");
  const seenIntents = new Set<string>();
  for (const intent of plan.clauseIntents) {
    const key = canonicalIntent(intent);
    if (seenIntents.has(key)) defects.push(`duplicate_semantic_intent:${key}`);
    seenIntents.add(key);
  }

  const safeClauseCandidates: ProAgreementPlanClauseCandidate[] = [];
  const rejectedClauseCandidates: Array<{ candidate: ProAgreementPlanClauseCandidate; defects: string[] }> = [];
  const seenCandidateIntents = new Set<string>();
  for (const candidate of plan.clauseCandidates ?? []) {
    const key = canonicalIntent(candidate.intent);
    if (seenCandidateIntents.has(key)) {
      rejectedClauseCandidates.push({ candidate, defects: ["duplicate_semantic_intent"] });
      continue;
    }
    seenCandidateIntents.add(key);
    const validation = validateClauseCandidate(candidate, plan);
    if (validation.ok) safeClauseCandidates.push(candidate);
    else rejectedClauseCandidates.push({ candidate, defects: validation.defects });
  }

  return {
    ok: defects.length === 0 && rejectedClauseCandidates.length === 0,
    defects: [...new Set(defects)],
    safeClauseCandidates,
    rejectedClauseCandidates,
  };
}

export function selectSafeClauseCandidate(args: {
  plan: ProAgreementPlan;
  intent: string;
  ownerSection: ProAgreementPlanOwnerSection;
  fallbackText: string;
}): { text: string; source: "candidate" | "deterministic"; defects: string[] } {
  const candidates = args.plan.clauseCandidates ?? [];
  for (const candidate of candidates) {
    if (canonicalIntent(candidate.intent) !== canonicalIntent(args.intent)) continue;
    if (candidate.ownerSection !== args.ownerSection) continue;
    const validation = validateClauseCandidate(candidate, args.plan);
    if (validation.ok) return { text: candidate.text.trim(), source: "candidate", defects: [] };
    return { text: args.fallbackText, source: "deterministic", defects: validation.defects };
  }
  return { text: args.fallbackText, source: "deterministic", defects: [] };
}

export function renderPlanBackedClause(args: {
  plan: ProAgreementPlan;
  intent: string;
  ownerSection: ProAgreementPlanOwnerSection;
  fallbackText: string;
}): string {
  return selectSafeClauseCandidate(args).text;
}

export function renderPaymentClauseFromPlan(
  plan: ProAgreementPlan,
  context: ProCommercialProseContext = {},
): { text: string; source: "candidate" | "deterministic"; defects: string[] } {
  const amount = String(plan.commercialFacts.totalProjectFee ?? plan.commercialFacts.amount ?? context.amount ?? "");
  const fallbackText = renderPaymentSection({ ...context, amount });
  return selectSafeClauseCandidate({ plan, intent: "payment_amount", ownerSection: "fees", fallbackText });
}

export function renderSupportClauseFromPlan(
  plan: ProAgreementPlan,
  context: ProCommercialProseContext = {},
): { text: string; source: "candidate" | "deterministic"; defects: string[] } {
  const supportDescription = String(plan.commercialFacts.supportModel ?? context.supportDescription ?? "");
  const fallbackText = renderSupportSection({ ...context, supportDescription });
  return selectSafeClauseCandidate({ plan, intent: "support_expectations", ownerSection: "support", fallbackText });
}

export function deriveGuidedQuestionsFromPlan(args: {
  plan: ProAgreementPlan;
  deterministicVariables?: readonly DealVariable[];
  answered?: Readonly<Record<string, string>>;
  skipped?: ReadonlySet<string>;
  intakeText?: string | null;
}): { variables: DealVariable[]; removedIds: string[]; blockedRepeatIds: string[] } {
  const intake = normalize(args.intakeText);
  const statedFacts = normalize(`${args.intakeText ?? ""}\n${planFactsText(args.plan)}`);
  const blockedByIntake: string[] = [];
  const intakeSatisfiesVariable = (v: Pick<DealVariable, "id" | "category" | "label" | "question">): boolean => {
    const blob = `${v.id} ${v.category} ${v.label} ${v.question}`;
    if (/\bgoverning|venue|jurisdiction\b/i.test(blob) && /\b(?:oklahoma|texas|delaware|california|new york)\s+law\b/i.test(intake)) {
      return true;
    }
    if (/\bpayment|fee|milestone|phase|compensation\b/i.test(blob) && /\$[\d,]+|\b\d+\s*%|\bmonthly\b/i.test(args.intakeText ?? "")) {
      return true;
    }
    if (/\btermination|renewal|notice\b/i.test(blob) && /\b\d{1,3}\s*[- ]?days?\s+(?:written\s+)?notice\b/i.test(args.intakeText ?? "")) {
      return true;
    }
    return false;
  };
  const planVariables: DealVariable[] = args.plan.missingQuestions
    .filter((q) => !statedFacts.includes(normalize(q.semanticIntent)) && !statedFacts.includes(normalize(q.question)))
    .filter((q) => !(q.semanticIntent === "governing_law" && /\b(?:oklahoma|texas|delaware|california|new york)\s+law\b/i.test(intake)))
    .filter((q) => !/\bstandard terms\b/i.test(q.question))
    .map((q) => ({
      id: q.id,
      category: q.semanticIntent === "governing_law" ? "governing_law" : "general",
      label: q.label ?? q.question.slice(0, 80),
      question: q.question,
      severity: "important",
      suggestedDefaults: [],
      agreementImpact: "Completes the validated Pro agreement plan.",
      requiredForExecution: false,
      applicableAgreementFamilies: ["services_agreement"],
      uiControlType: "pills",
      currentValue: null,
      confidence: 0.7,
      affectsSections: [],
    }));
  const deterministicVariables = (args.deterministicVariables ?? []).filter((v) => {
    if (!intakeSatisfiesVariable(v)) return true;
    blockedByIntake.push(v.id);
    return false;
  });
  const deduped = dedupeGuidedQuestionsBySemanticIntent({
    variables: [...deterministicVariables, ...planVariables],
    answered: args.answered,
    skipped: args.skipped,
  });
  return {
    ...deduped,
    blockedRepeatIds: [...new Set([...deduped.blockedRepeatIds, ...blockedByIntake])],
  };
}


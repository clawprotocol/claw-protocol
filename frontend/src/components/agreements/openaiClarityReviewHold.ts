/**
 * Post-generate OpenAI clarity hold.
 *
 * Guided-question-gate currently logs a decision after pfd, then still paints
 * Review because a long invented corpus sets `materialReviewAllowed`. This
 * module holds Review until material answers exist — or fail-closes.
 *
 * KEEP:
 * - Does not change evaluateIntentionalCreateDraftSubmit / pre-generate.
 * - Does not introduce #227 `material_gap` or #224 dump classifiers.
 * - Northline-class bodies (real named work, no invented-framework admission)
 *   do not hold.
 */

import { extractListedSigningPartyNames } from "./agreementIntakeClarification";
import type { AgreementIntakeClarification } from "./agreementIntakeClarification";
import type {
  AgreementIntelligence,
  MissingMaterialTerm,
  RecommendedQuestion,
} from "./premiumFullDraftApi";
import type { DealVariable } from "./guidedDealCompletion/types";

export type OpenAiClarityReviewHold = {
  hold: boolean;
  ask: boolean;
  reasons: string[];
  questions: DealVariable[];
  clarification: AgreementIntakeClarification | null;
};

const CRITICAL_TOPIC_RE =
  /\b(scope|deliverable|milestone|lawful\s+payment|payment\s+control|escrow|kyc|cash\s+only|consideration|services?\s+to\s+be\s+performed|work\s+to\s+be\s+performed)\b/i;

/** OpenAI body admitting it invented a placeholder because intake lacked terms. */
const INTAKE_GAP_ADMISSION_RE =
  /\b(?:because\s+)?(?:the\s+)?intake\s+does\s+not\s+define\b|\bdoes\s+not\s+define\s+any\s+actual\s+(?:consulting\s+)?(?:scope|deliverables|milestones|lawful\s+payment)/i;

const INVENTED_FRAMEWORK_RE =
  /\bcompliant\s+services\s+framework\b|\bdrafted\s+to\s+document\s+only\b|\bdocument\s+only\s+a\s+compliant\b/i;

const EXPLICIT_INTAKE_SCOPE_OMISSION_RE =
  /\bno\s+deliverables?\b|\bdeliverables?\s+(?:not\s+)?(?:specified|unspecified|missing|omitted|defined|tbd|none)\b/i;

const FUTURE_SOW_DEFER_RE =
  /\b(?:statements?\s+of\s+work|work\s+orders?)\b/i;

const FUTURE_SOW_REQUEST_RE =
  /\b(?:services\s+will\s+be\s+requested|to\s+be\s+set\s+forth\s+in|as\s+described\s+in\s+(?:each\s+)?(?:sow|work\s+order)|referred\s+to\s+as\s+an?\s+["']?sow["']?)\b/i;

function trim(s: string | null | undefined): string {
  return String(s || "").trim();
}

function blobOf(parts: readonly (string | null | undefined)[]): string {
  return parts.map((p) => trim(p)).filter(Boolean).join(" ");
}

function isCriticalClarityTopic(...parts: Array<string | null | undefined>): boolean {
  return CRITICAL_TOPIC_RE.test(blobOf(parts));
}

function isHighSignal(level: string | null | undefined): boolean {
  const t = trim(level).toLowerCase();
  return t === "high" || t === "critical";
}

/** True when the generated body itself says it invented a compliant framework. */
export function looksInventedFrameworkReviewCorpus(body: string | null | undefined): boolean {
  const t = trim(body);
  if (t.length < 200) return false;
  return INTAKE_GAP_ADMISSION_RE.test(t) && INVENTED_FRAMEWORK_RE.test(t);
}

/**
 * Post-generate pairing: intake explicitly omitted deliverables AND the draft
 * deferred all work to a future SOW. Not a pre-generate capability gate.
 */
export function looksDeferredSowForOmittedDeliverables(args: {
  intakeText?: string | null;
  body?: string | null;
}): boolean {
  const intake = trim(args.intakeText);
  const body = trim(args.body);
  if (intake.length < 24 || body.length < 200) return false;
  if (!EXPLICIT_INTAKE_SCOPE_OMISSION_RE.test(intake)) return false;
  return FUTURE_SOW_DEFER_RE.test(body) && FUTURE_SOW_REQUEST_RE.test(body);
}

export function isOpenAiCriticalClarityQuestion(q: RecommendedQuestion): boolean {
  if (!q.question || q.question.trim().length <= 8) return false;
  if (!isHighSignal(q.priority) && !isCriticalClarityTopic(q.topic, q.question, q.reason)) {
    return false;
  }
  return isCriticalClarityTopic(q.topic, q.question, q.reason);
}

export function isOpenAiCriticalMissingTerm(term: MissingMaterialTerm): boolean {
  if (!isHighSignal(term.severity) && !isCriticalClarityTopic(term.topic, term.reason)) {
    return false;
  }
  return isCriticalClarityTopic(term.topic, term.reason);
}

function questionFromRecommended(q: RecommendedQuestion): DealVariable {
  return {
    id: `openai_clarity_${q.id || q.topic.replace(/\W+/g, "_").toLowerCase() || "q"}`,
    category: /\b(payment|fee|escrow|kyc|cash|wire)\b/i.test(blobOf([q.topic, q.question]))
      ? "compensation"
      : "milestones",
    label: q.topic || "Clarification",
    question: q.question.trim(),
    severity: "critical",
    suggestedDefaults: [],
    agreementImpact: q.reason || "Material term is missing from the intake.",
    requiredForExecution: true,
    applicableAgreementFamilies: ["generic_business_agreement"],
    uiControlType: "text",
    currentValue: null,
    confidence: 1,
    affectsSections: q.topic ? [q.topic] : [],
    questionType: "REQUIRED_COMPLETION",
    semanticIntent: q.topic || q.id,
  };
}

function questionFromMissingTerm(term: MissingMaterialTerm): DealVariable {
  return questionFromRecommended({
    id: term.id,
    topic: term.topic,
    question: `What should we use for ${term.topic}?`,
    reason: term.reason,
    priority: term.severity === "high" ? "high" : "medium",
  });
}

function questionFromMissingInfoLine(line: string, index: number): DealVariable | null {
  const text = trim(line);
  if (text.length < 8 || !isCriticalClarityTopic(text)) return null;
  return questionFromRecommended({
    id: `missing_info_${index}`,
    topic: text.slice(0, 48),
    question: text.endsWith("?") ? text : `Please specify: ${text}`,
    reason: "OpenAI listed this as missing material information.",
    priority: "high",
  });
}

const SYNTH_SCOPE_ID = "openai_clarity_scope_deliverables";
const SYNTH_PAY_ID = "openai_clarity_lawful_payment";

function synthesizeClarityQuestions(intakeText: string): DealVariable[] {
  const parties = extractListedSigningPartyNames(intakeText);
  const money = intakeText.match(/\$\s?\d[\d,]*(?:\.\d+)?/)?.[0] || "the stated amount";
  const who =
    parties.length >= 2 ? `${parties[0]} and ${parties[1]}` : "the named parties";
  return [
    questionFromRecommended({
      id: SYNTH_SCOPE_ID,
      topic: "scope / deliverables",
      question: `What consulting services and deliverables should the agreement between ${who} actually cover?`,
      reason: "The intake does not define scope or deliverables.",
      priority: "high",
    }),
    questionFromRecommended({
      id: SYNTH_PAY_ID,
      topic: "lawful payment",
      question: `What lawful payment method, schedule, and conditions apply to ${money}?`,
      reason: "Payment instructions are incomplete or not a lawful services-fee structure.",
      priority: "high",
    }),
  ];
}

export function collectOpenAiCriticalClarityQuestions(args: {
  intelligence?: AgreementIntelligence | null;
  missingMaterialInfo?: readonly string[] | null;
}): DealVariable[] {
  const out: DealVariable[] = [];
  const seen = new Set<string>();
  const push = (v: DealVariable | null) => {
    if (!v || seen.has(v.id)) return;
    seen.add(v.id);
    out.push(v);
  };
  for (const q of args.intelligence?.recommended_questions ?? []) {
    if (isOpenAiCriticalClarityQuestion(q)) push(questionFromRecommended(q));
  }
  for (const term of args.intelligence?.missing_material_terms ?? []) {
    if (isOpenAiCriticalMissingTerm(term)) push(questionFromMissingTerm(term));
  }
  (args.missingMaterialInfo ?? []).forEach((line, i) => {
    push(questionFromMissingInfoLine(line, i));
  });
  return out.slice(0, 4);
}

function buildClarityClarification(args: {
  intakeText: string;
  questions: DealVariable[];
  reasons: string[];
}): AgreementIntakeClarification {
  const parties = extractListedSigningPartyNames(args.intakeText);
  const heard: string[] = [];
  if (parties.length >= 2) heard.push(`Named parties: ${parties.slice(0, 4).join("; ")}.`);
  const money = args.intakeText.match(/\$\s?\d[\d,]*(?:\.\d+)?/);
  if (money) heard.push(`A payment amount was mentioned: ${money[0]}.`);
  for (const q of args.questions) heard.push(q.question);
  const fee = money?.[0] || "[fee amount]";
  const partyClause =
    parties.length >= 2
      ? `between ${parties[0]} and ${parties[1]}`
      : "between [Party 1 Legal Name] and [Party 2 Legal Name]";
  return {
    kind: "needs_commercial_basics",
    title: "I need material terms before I can draft this",
    why:
      "Two names and a dollar amount are not a deal. Scope, deliverables, and lawful payment " +
      "controls are still missing — I will ask, not invent a Pro Review.",
    whatWeHeard: heard.slice(0, 8),
    guidedSteps: args.questions.map((q) => q.question).concat([
      "Add term or effective date and governing law if you know them.",
    ]),
    suggestedRewrite:
      `Draft a services agreement ${partyClause} for [describe the actual deliverables and scope], ` +
      `fee ${fee}, term [duration]. Use a lawful payment method and schedule. Governing law: [State].`,
    primaryCtaLabel: "Use suggested draft request",
    secondaryCtaLabel: "Keep editing",
  };
}

export function resolveOpenAiClarityReviewHold(args: {
  body?: string | null;
  intakeText?: string | null;
  intelligence?: AgreementIntelligence | null;
  missingMaterialInfo?: readonly string[] | null;
}): OpenAiClarityReviewHold {
  const body = trim(args.body);
  const intakeText = trim(args.intakeText);
  const reasons: string[] = [];
  let questions = collectOpenAiCriticalClarityQuestions({
    intelligence: args.intelligence,
    missingMaterialInfo: args.missingMaterialInfo,
  });

  if (looksInventedFrameworkReviewCorpus(body)) {
    reasons.push("invented_framework_corpus");
  }
  if (looksDeferredSowForOmittedDeliverables({ intakeText, body })) {
    reasons.push("deferred_sow_omitted_deliverables");
  }
  if (questions.length) {
    reasons.push(`openai_critical_questions:${questions.map((q) => q.id).join(",")}`);
  }

  const hold = reasons.length > 0;
  if (!hold) {
    return { hold: false, ask: false, reasons: [], questions: [], clarification: null };
  }
  if (!questions.length) {
    questions = synthesizeClarityQuestions(intakeText);
  }
  const clarification = buildClarityClarification({ intakeText, questions, reasons });
  return {
    hold: true,
    ask: questions.length > 0,
    reasons,
    questions,
    clarification,
  };
}

export function logOpenAiClarityReviewHold(hold: OpenAiClarityReviewHold): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[openai-clarity-review-hold]", {
    hold: hold.hold,
    ask: hold.ask,
    reasons: hold.reasons,
    questionCount: hold.questions.length,
  });
}

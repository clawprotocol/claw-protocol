/**
 * Fatal vs optional guided-question gating for paid Pro review.
 * Optional clarification must not hide a material Pro agreement or block review CTAs.
 */

import type { ParsedDraftShape } from "../intakeSmartDefaults";
import { validateProMinimumSubstance } from "../paidProConciseServicesQuality";
import { SEND_HANDOFF_AUTHORITATIVE_MIN_LEN } from "../paidProAuthorityConstants";
import type { DealVariable, DealVariableCategory, GuidedCompletionSession } from "./types";
import { variableHasSelectableAnswerPath } from "./shouldRenderGuidedCompletionPanel";

export type GuidedQuestionGateDecision = {
  /** True when unresolved fatal questions should block Pro review chrome / primary CTAs. */
  blocked: boolean;
  fatalCount: number;
  optionalCount: number;
  reasons: string[];
  corpusLen: number;
  minimumSubstancePassed: boolean;
  /** Material Pro corpus may render with review/share/sign CTAs despite optional questions. */
  materialReviewAllowed: boolean;
};

const OPTIONAL_CATEGORIES = new Set<DealVariableCategory>([
  "support",
  "ip_ownership",
  "audit",
  "uptime",
  "notices",
  "confidentiality",
  "exclusivity",
  "governance",
  "termination",
]);

const FATAL_CATEGORIES = new Set<DealVariableCategory>([
  "compensation",
  "payment_timing",
  "milestones",
  "referral_economics",
  "governing_law",
]);

const OPTIONAL_QUESTION_RE =
  /\b(signer|signatory|email|title|address|support period|ownership nuance|notice address|entity type)\b/i;

function trim(s: string | null | undefined): string {
  return (s || "").trim();
}

export function isFatalGuidedDealVariable(variable: DealVariable): boolean {
  if (variable.severity === "optional") return false;
  if (variable.questionType === "OPTIONAL_ENHANCEMENT" || variable.questionType === "OPTIMIZATION") {
    return false;
  }
  if (OPTIONAL_CATEGORIES.has(variable.category) && variable.severity !== "critical") {
    return false;
  }
  if (OPTIONAL_QUESTION_RE.test(variable.question) && variable.severity !== "critical") {
    return false;
  }
  if (variable.severity === "critical" && variable.requiredForExecution) return true;
  if (FATAL_CATEGORIES.has(variable.category) && variable.requiredForExecution) return true;
  const q = variable.question.toLowerCase();
  if (variable.requiredForExecution && /\b(parties?|legal entity|who (is|are) the)\b/.test(q)) return true;
  if (
    variable.requiredForExecution &&
    variable.category === "compensation" &&
    /\b(payment|fee|amount|\$|compensation)\b/.test(q)
  ) {
    return true;
  }
  if (
    variable.requiredForExecution &&
    /\b(scope of services|core services|deliverables|workflow setup)\b/.test(q) &&
    variable.severity === "critical"
  ) {
    return true;
  }
  return false;
}

export function countUnresolvedGuidedQuestions(session: GuidedCompletionSession | null | undefined): {
  fatalCount: number;
  optionalCount: number;
  fatalIds: string[];
  optionalIds: string[];
} {
  if (!session?.queue.length) {
    return { fatalCount: 0, optionalCount: 0, fatalIds: [], optionalIds: [] };
  }
  let fatalCount = 0;
  let optionalCount = 0;
  const fatalIds: string[] = [];
  const optionalIds: string[] = [];
  for (const id of session.queue) {
    if (session.answered[id] || session.skipped.has(id)) continue;
    const v = session.variables.find((x) => x.id === id);
    if (!v || !variableHasSelectableAnswerPath(v) || v.question.trim().length <= 8) continue;
    if (isFatalGuidedDealVariable(v)) {
      fatalCount += 1;
      fatalIds.push(id);
    } else {
      optionalCount += 1;
      optionalIds.push(id);
    }
  }
  return { fatalCount, optionalCount, fatalIds, optionalIds };
}

export function assessGuidedMinimumSubstance(args: {
  bodyText?: string | null;
  intakeText?: string | null;
  draft?: ParsedDraftShape | null;
}): boolean {
  const body = trim(args.bodyText);
  const intake = trim(args.intakeText);
  if (body.length >= SEND_HANDOFF_AUTHORITATIVE_MIN_LEN) {
    const substance = validateProMinimumSubstance({
      text: body,
      rawIntake: intake,
      draft: args.draft ?? null,
      source: "guided_question_gate",
    });
    if (substance.applies && substance.ok) return true;
    if (!substance.applies && body.length >= SEND_HANDOFF_AUTHORITATIVE_MIN_LEN) return true;
  }
  if (intake.length >= 80) {
    const hasParties = /\b(?:LLC|Inc\.|Corp\.|between .+ and )\b/i.test(intake);
    const hasPayment = /\$[\d,]+|\b\d{1,3}(?:,\d{3})*\s*(?:dollars|usd)\b/i.test(intake);
    const hasScope = /\b(services|workflow|automation|agreement)\b/i.test(intake);
    const hasLaw = /\b(texas|california|delaware|governing law)\b/i.test(intake);
    if (hasParties && hasPayment && hasScope && hasLaw) return true;
    if (hasParties && hasPayment && hasScope) return true;
  }
  return false;
}

export function resolveGuidedQuestionGateDecision(args: {
  session: GuidedCompletionSession | null | undefined;
  corpusLen: number;
  intakeText?: string | null;
  bodyText?: string | null;
  draft?: ParsedDraftShape | null;
}): GuidedQuestionGateDecision {
  const corpusLen = Math.max(0, args.corpusLen);
  const minimumSubstancePassed = assessGuidedMinimumSubstance({
    bodyText: args.bodyText,
    intakeText: args.intakeText,
    draft: args.draft ?? null,
  });
  const materialReviewAllowed =
    corpusLen >= SEND_HANDOFF_AUTHORITATIVE_MIN_LEN && minimumSubstancePassed;
  const { fatalCount, optionalCount, fatalIds, optionalIds } = countUnresolvedGuidedQuestions(args.session);
  const reasons: string[] = [];
  if (fatalCount > 0) reasons.push(`fatal_unresolved:${fatalIds.join(",")}`);
  if (optionalCount > 0) reasons.push(`optional_unresolved:${optionalIds.join(",")}`);
  if (!minimumSubstancePassed) reasons.push("minimum_substance_failed");
  if (corpusLen < SEND_HANDOFF_AUTHORITATIVE_MIN_LEN) reasons.push("corpus_below_min");

  const blocked = fatalCount > 0 && !materialReviewAllowed;

  return {
    blocked,
    fatalCount,
    optionalCount,
    reasons,
    corpusLen,
    minimumSubstancePassed,
    materialReviewAllowed,
  };
}

export function logGuidedQuestionGateDecision(decision: GuidedQuestionGateDecision): void {
  if (import.meta.env.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[guided-question-gate-decision]", {
    blocked: decision.blocked,
    fatalCount: decision.fatalCount,
    optionalCount: decision.optionalCount,
    reasons: decision.reasons,
    corpusLen: decision.corpusLen,
    minimumSubstancePassed: decision.minimumSubstancePassed,
    materialReviewAllowed: decision.materialReviewAllowed,
  });
}

/** Label for optional guided prompts — must not read as a blocking CTA. */
export const GUIDED_OPTIONAL_IMPROVE_LABEL = "Optional: improve this agreement";

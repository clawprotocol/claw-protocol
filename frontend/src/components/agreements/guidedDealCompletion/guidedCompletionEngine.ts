import type { MaterialMissingItem } from "../proAgreementCompleteness/types";
import { extractDealVariables } from "./missingVariableExtractor";
import {
  buildGuidedCompletionIntro,
  computeCompletenessPercent,
  createGuidedCompletionSession,
} from "./variablePrioritizationLayer";
import type { CommercialFamilyHint } from "../proAgreementCompleteness/types";
import type { DealVariable, DealVariableCategory, GuidedCompletionSession } from "./types";

export function buildGuidedSessionFromAgreement(args: {
  intakeRaw?: string | null;
  body: string;
  materialItems?: readonly MaterialMissingItem[];
  agreementFamily?: CommercialFamilyHint;
}): GuidedCompletionSession | null {
  const variables = extractDealVariables({
    intakeRaw: args.intakeRaw,
    body: args.body,
    materialItems: args.materialItems,
  });
  if (!variables.length) return null;
  const family = args.agreementFamily ?? variables[0]?.applicableAgreementFamilies[0] ?? "generic_business_agreement";
  return createGuidedCompletionSession({
    variables,
    agreementFamily: family,
    bodyLen: (args.body || "").trim().length,
  });
}

/** Pure resolver — never mutates session (avoids stale React state / inert controls). */
export function resolveGuidedCurrentIndex(session: GuidedCompletionSession): number {
  let idx = session.currentIndex;
  while (idx < session.queue.length) {
    const id = session.queue[idx];
    if (!session.answered[id] && !session.skipped.has(id)) break;
    idx += 1;
  }
  return idx;
}

export function getCurrentVariable(session: GuidedCompletionSession): DealVariable | null {
  const idx = resolveGuidedCurrentIndex(session);
  if (idx >= session.queue.length) return null;
  const id = session.queue[idx];
  return session.variables.find((v) => v.id === id) ?? null;
}

export function formatRefineInstructionForAnswer(variable: DealVariable, answer: string): string {
  const a = (answer || "").trim();
  if (!a) return "";
  return `Update the agreement to reflect the following for "${variable.label}": ${a}. Keep all other terms unchanged unless required for consistency.`;
}

export function applyGuidedAnswer(
  session: GuidedCompletionSession,
  variableId: string,
  answer: string,
  bodyLen?: number,
): GuidedCompletionSession {
  const answered = { ...session.answered, [variableId]: answer.trim() };
  const idx = resolveGuidedCurrentIndex({
    ...session,
    answered,
  });
  return {
    ...session,
    answered,
    currentIndex: idx,
    completenessPercent: computeCompletenessPercent({
      totalVariables: session.frozenTotalQuestions ?? session.queue.length,
      answeredCount: Object.keys(answered).length,
      skippedCount: session.skipped.size,
      bodyLen,
    }),
  };
}

export function skipGuidedVariable(session: GuidedCompletionSession, variableId: string, bodyLen?: number): GuidedCompletionSession {
  const skipped = new Set(session.skipped);
  skipped.add(variableId);
  const idx = resolveGuidedCurrentIndex({
    ...session,
    skipped,
  });
  return {
    ...session,
    skipped,
    currentIndex: idx,
    completenessPercent: computeCompletenessPercent({
      totalVariables: session.frozenTotalQuestions ?? session.queue.length,
      answeredCount: Object.keys(session.answered).length,
      skippedCount: skipped.size,
      bodyLen,
    }),
  };
}

export function isGuidedCompletionComplete(session: GuidedCompletionSession): boolean {
  return getCurrentVariable(session) === null;
}

export function guidedSessionIntro(session: GuidedCompletionSession) {
  return buildGuidedCompletionIntro(session);
}

export function importantVariableCount(session: GuidedCompletionSession): number {
  return session.queue.filter((id) => {
    const v = session.variables.find((x) => x.id === id);
    return v && (v.severity === "critical" || v.severity === "important");
  }).length;
}

const WHAT_CHANGED_BY_ID: Record<string, string> = {
  payment_structure: "What changed: Added payment structure and invoicing terms.",
  support_obligations: "What changed: Defined post-launch support obligations.",
  scope_change_approval: "What changed: Clarified approval process for evolving scope.",
  ip_ownership: "What changed: Added intellectual property ownership terms.",
  governing_law_notice: "What changed: Added governing law and notice terms.",
  referral_economics: "What changed: Added referral compensation terms.",
  payment_timing: "What changed: Added payment timing terms.",
  saas_sla: "What changed: Added service level and uptime terms.",
  milestone_schedule: "What changed: Added milestone and deliverable terms.",
  governing_venue: "What changed: Added governing law and venue terms.",
  ip_allocation: "What changed: Added intellectual property allocation terms.",
  nda_survival: "What changed: Added confidentiality survival terms.",
  exclusivity_scope: "What changed: Added exclusivity scope terms.",
  audit_scope: "What changed: Added audit rights terms.",
  license_scope: "What changed: Added license scope terms.",
  jv_contributions: "What changed: Added joint venture contribution terms.",
  jv_ip_governance: "What changed: Added joint venture IP governance terms.",
  ai_deployment: "What changed: Added deployment milestone terms.",
  ai_ops_economics: "What changed: Added operational economics terms.",
};

const WHAT_CHANGED_BY_CATEGORY: Partial<Record<DealVariableCategory, string>> = {
  referral_economics: "What changed: Added referral compensation terms.",
  compensation: "What changed: Added compensation terms.",
  payment_timing: "What changed: Added payment timing terms.",
  sla: "What changed: Added service level terms.",
  governing_law: "What changed: Added governing law and venue terms.",
  termination: "What changed: Added termination and notice terms.",
  confidentiality: "What changed: Added confidentiality terms.",
  milestones: "What changed: Added milestone terms.",
  ip_ownership: "What changed: Added intellectual property terms.",
};

/** User-facing success line tied to the guided variable that was answered. */
export function whatChangedLineForGuidedVariable(
  variableId: string | null | undefined,
  variables: readonly DealVariable[],
): string | null {
  if (!variableId) return null;
  const byId = WHAT_CHANGED_BY_ID[variableId];
  if (byId) return byId;
  const v = variables.find((x) => x.id === variableId);
  if (!v) return null;
  const byCat = WHAT_CHANGED_BY_CATEGORY[v.category];
  if (byCat) return byCat;
  return `What changed: Added ${v.label.toLowerCase()} terms.`;
}

export function frozenQuestionTotal(session: GuidedCompletionSession): number {
  return session.frozenTotalQuestions ?? session.queue.length;
}

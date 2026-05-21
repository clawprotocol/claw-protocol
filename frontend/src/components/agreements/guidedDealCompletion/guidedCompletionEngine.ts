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

/** First unanswered id in the frozen queue (always scan from 0 — never trust stale currentIndex). */
export function resolveGuidedCurrentIndex(session: GuidedCompletionSession): number {
  for (let idx = 0; idx < session.queue.length; idx += 1) {
    const id = session.queue[idx];
    if (!session.answered[id] && !session.skipped.has(id)) return idx;
  }
  return session.queue.length;
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
  return applyGuidedAnswerTransaction(session, variableId, answer, bodyLen);
}

/**
 * Pure transactional advance — mark answered by id, recompute index from frozen queue only.
 */
export function applyGuidedAnswerTransaction(
  session: GuidedCompletionSession,
  variableId: string,
  answer: string,
  bodyLen?: number,
): GuidedCompletionSession {
  const trimmed = (answer || "").trim();
  const answered = { ...session.answered, [variableId]: trimmed };
  const answeredAt = {
    ...(session.answeredAt ?? {}),
    [variableId]: Date.now(),
  };
  const next: GuidedCompletionSession = {
    ...session,
    answered,
    answeredAt,
    queue: [...session.queue],
    variables: [...session.variables],
    frozenTotalQuestions: session.frozenTotalQuestions ?? session.queue.length,
    skipped: new Set(session.skipped),
  };
  const idx = resolveGuidedCurrentIndex(next);
  return {
    ...next,
    currentIndex: idx,
    completenessPercent: computeCompletenessPercent({
      totalVariables: next.frozenTotalQuestions ?? next.queue.length,
      answeredCount: Object.keys(answered).length,
      skippedCount: next.skipped.size,
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
  payment_structure: "Added payment structure and invoicing terms.",
  support_obligations: "Defined post-launch support obligations.",
  scope_change_approval: "Clarified approval process for evolving scope.",
  ip_ownership: "Added IP ownership allocation.",
  ip_ownership_contradiction: "Added IP ownership allocation.",
  term_structure_contradiction: "Clarified term and termination structure.",
  license_background_tools: "Added license and background materials language.",
  deliverables_scope: "Defined deliverables and scope.",
  governing_law_notice: "Added governing law and notice terms.",
  referral_economics: "Added referral compensation terms.",
  payment_timing: "Added payment timing terms.",
  saas_sla: "Added service level and uptime terms.",
  milestone_schedule: "Added milestone and deliverable terms.",
  governing_venue: "Added governing law and venue terms.",
  ip_allocation: "Added intellectual property allocation terms.",
  nda_survival: "Added confidentiality survival terms.",
  exclusivity_scope: "Added exclusivity scope terms.",
  audit_scope: "Added audit rights terms.",
  license_scope: "Added license and background materials language.",
  jv_contributions: "Added joint venture contribution terms.",
  jv_ip_governance: "Added joint venture IP governance terms.",
  ai_deployment: "Added deployment milestone terms.",
  ai_ops_economics: "Added operational economics terms.",
};

const WHAT_CHANGED_BY_CATEGORY: Partial<Record<DealVariableCategory, string>> = {
  referral_economics: "Added referral compensation terms.",
  compensation: "Added payment structure.",
  payment_timing: "Added payment timing terms.",
  sla: "Added service level terms.",
  governing_law: "Added governing law and venue terms.",
  termination: "Clarified term and termination structure.",
  confidentiality: "Added confidentiality terms.",
  milestones: "Added milestone terms.",
  ip_ownership: "Added IP ownership allocation.",
};

/** Strip duplicate "What changed:" prefix before UI adds its own label. */
export function normalizeWhatChangedDisplayLine(line: string | null | undefined): string | null {
  const t = (line || "").trim();
  if (!t) return null;
  return t.replace(/^(?:what changed:\s*)+/i, "").trim() || null;
}

/** User-facing success caption (no leading "What changed:" — host adds prefix once). */
export function whatChangedLineForGuidedVariable(
  variableId: string | null | undefined,
  variables: readonly DealVariable[],
): string | null {
  if (!variableId) return null;
  const byId = WHAT_CHANGED_BY_ID[variableId];
  if (byId) return normalizeWhatChangedDisplayLine(byId);
  const v = variables.find((x) => x.id === variableId);
  if (!v) return null;
  const byCat = WHAT_CHANGED_BY_CATEGORY[v.category];
  if (byCat) return normalizeWhatChangedDisplayLine(byCat);
  return normalizeWhatChangedDisplayLine(`Added ${v.label.toLowerCase()} terms.`);
}

export function frozenQuestionTotal(session: GuidedCompletionSession): number {
  return session.frozenTotalQuestions ?? session.queue.length;
}

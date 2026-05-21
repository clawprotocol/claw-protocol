import type { MaterialMissingItem } from "../proAgreementCompleteness/types";
import { extractDealVariables } from "./missingVariableExtractor";
import {
  buildGuidedCompletionIntro,
  computeCompletenessPercent,
  createGuidedCompletionSession,
} from "./variablePrioritizationLayer";
import type { CommercialFamilyHint } from "../proAgreementCompleteness/types";
import type { DealVariable, GuidedCompletionSession } from "./types";

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

export function getCurrentVariable(session: GuidedCompletionSession): DealVariable | null {
  while (session.currentIndex < session.queue.length) {
    const id = session.queue[session.currentIndex];
    if (session.answered[id] || session.skipped.has(id)) {
      session.currentIndex += 1;
      continue;
    }
    return session.variables.find((v) => v.id === id) ?? null;
  }
  return null;
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
  let idx = session.currentIndex;
  while (idx < session.queue.length) {
    const id = session.queue[idx];
    if (!answered[id] && !session.skipped.has(id)) break;
    idx += 1;
  }
  return {
    ...session,
    answered,
    currentIndex: idx,
    completenessPercent: computeCompletenessPercent({
      totalVariables: session.queue.length,
      answeredCount: Object.keys(answered).length,
      skippedCount: session.skipped.size,
      bodyLen,
    }),
  };
}

export function skipGuidedVariable(session: GuidedCompletionSession, variableId: string, bodyLen?: number): GuidedCompletionSession {
  const skipped = new Set(session.skipped);
  skipped.add(variableId);
  let idx = session.currentIndex;
  while (idx < session.queue.length) {
    const id = session.queue[idx];
    if (!session.answered[id] && !skipped.has(id)) break;
    idx += 1;
  }
  return {
    ...session,
    skipped,
    currentIndex: idx,
    completenessPercent: computeCompletenessPercent({
      totalVariables: session.queue.length,
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

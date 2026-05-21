import type { DealVariable, DealVariableSeverity, GuidedCompletionIntro, GuidedCompletionSession } from "./types";

const SEVERITY_RANK: Record<DealVariableSeverity, number> = {
  critical: 0,
  important: 1,
  optional: 2,
};

const MAX_GUIDED_QUEUE = 7;
const MAX_INTRO_LABELS = 3;

export function prioritizeDealVariables(variables: readonly DealVariable[]): DealVariable[] {
  return [...variables].sort((a, b) => {
    const sa = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (sa !== 0) return sa;
    return a.confidence - b.confidence;
  });
}

export function buildGuidedQueue(variables: readonly DealVariable[]): string[] {
  return prioritizeDealVariables(variables)
    .slice(0, MAX_GUIDED_QUEUE)
    .map((v) => v.id);
}

export function computeCompletenessPercent(args: {
  totalVariables: number;
  answeredCount: number;
  skippedCount: number;
  bodyLen?: number;
}): number {
  const { totalVariables, answeredCount, skippedCount, bodyLen = 0 } = args;
  if (totalVariables === 0) {
    return bodyLen >= 900 ? 92 : bodyLen >= 400 ? 78 : 65;
  }
  const resolved = answeredCount + skippedCount * 0.5;
  const ratio = Math.min(1, resolved / totalVariables);
  const base = 55 + ratio * 40;
  const bodyBoost = bodyLen >= 2000 ? 5 : bodyLen >= 800 ? 2 : 0;
  return Math.min(98, Math.round(base + bodyBoost));
}

export function buildGuidedCompletionIntro(session: GuidedCompletionSession): GuidedCompletionIntro {
  const remaining = session.queue
    .filter((id) => !session.answered[id] && !session.skipped.has(id))
    .map((id) => session.variables.find((v) => v.id === id)?.label)
    .filter(Boolean) as string[];

  const pct = session.completenessPercent;
  if (remaining.length === 0) {
    return {
      headline: "Your agreement looks ready to review.",
      subline: "You can still refine any term before sending.",
      completenessPercent: pct,
      remainingLabels: [],
    };
  }

  const shortList = remaining.slice(0, MAX_INTRO_LABELS).join(", ");
  const more = remaining.length > MAX_INTRO_LABELS ? ` (+${remaining.length - MAX_INTRO_LABELS} more)` : "";

  return {
    headline: `Your agreement is ${pct}% complete.`,
    subline: `We still need: ${shortList}${more}. Let's finish them.`,
    completenessPercent: pct,
    remainingLabels: remaining,
  };
}

export function createGuidedCompletionSession(args: {
  variables: DealVariable[];
  agreementFamily: DealVariable["applicableAgreementFamilies"][0];
  bodyLen?: number;
}): GuidedCompletionSession {
  const queue = buildGuidedQueue(args.variables);
  return {
    variables: args.variables,
    queue,
    answered: {},
    skipped: new Set(),
    currentIndex: 0,
    completenessPercent: computeCompletenessPercent({
      totalVariables: queue.length,
      answeredCount: 0,
      skippedCount: 0,
      bodyLen: args.bodyLen,
    }),
    agreementFamily: args.agreementFamily,
    frozenTotalQuestions: queue.length,
  };
}

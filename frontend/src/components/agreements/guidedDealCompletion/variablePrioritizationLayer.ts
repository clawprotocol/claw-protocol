import type { DealVariable, DealVariableSeverity, GuidedCompletionIntro, GuidedCompletionSession } from "./types";

const SEVERITY_RANK: Record<DealVariableSeverity, number> = {
  critical: 0,
  important: 1,
  optional: 2,
};

const MAX_GUIDED_QUEUE = 5;
const MAX_INTRO_LABELS = 3;

/** Business-order priority for contractor/contradiction flows (lower = earlier). */
const GUIDED_ID_PRIORITY: Record<string, number> = {
  ip_ownership_contradiction: 0,
  ip_ownership: 1,
  term_structure_contradiction: 2,
  payment_structure: 3,
  license_background_tools: 4,
  deliverables_scope: 5,
  support_obligations: 6,
  scope_change_approval: 7,
};

function guidedIdPriority(id: string): number {
  return GUIDED_ID_PRIORITY[id] ?? 50;
}

export function prioritizeDealVariables(variables: readonly DealVariable[]): DealVariable[] {
  return [...variables].sort((a, b) => {
    const pa = guidedIdPriority(a.id);
    const pb = guidedIdPriority(b.id);
    if (pa !== pb) return pa - pb;
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

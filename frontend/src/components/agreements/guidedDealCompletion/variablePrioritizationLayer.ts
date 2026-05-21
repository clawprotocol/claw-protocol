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
  supplemental_schedule_confirmation: 0,
  total_fee_confirmation: 1,
  phase_payment_allocation: 2,
  amount_to_be_confirmed: 2,
  party_legal_names: 3,
  ip_ownership_contradiction: 4,
  ip_ownership: 5,
  term_structure_contradiction: 6,
  payment_structure: 7,
  payment_timing: 8,
  license_background_tools: 9,
  saas_sla: 10,
  security_obligations: 11,
  renewal_notice: 12,
  governing_law_notice: 13,
  deliverables_scope: 14,
  support_obligations: 15,
  scope_change_approval: 16,
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

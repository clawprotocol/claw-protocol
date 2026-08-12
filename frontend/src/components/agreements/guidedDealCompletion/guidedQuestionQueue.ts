/**
 * Stable guided question queue — dedupe by canonical variableId, block repeats after answer/skip.
 */

import type { DealVariable } from "./types";
import { prioritizeDealVariables } from "./variablePrioritizationLayer";
import { filterUserAnswerableGuidedVariables } from "./userAnswerableGuidedQuestion";

const MAX_GUIDED_QUEUE = 5;

/** When one id is queued, suppress near-duplicate fee questions. */
const CANONICAL_EXCLUDES: Record<string, readonly string[]> = {
  project_fee_phase_confirmation: ["total_fee_confirmation"],
  total_fee_confirmation: ["project_fee_phase_confirmation"],
};

const SEMANTIC_INTENT_CLUSTERS: Record<string, string> = {
  governing_law_notice: "governing_law_and_venue",
  governing_venue: "governing_law_and_venue",
  project_fee_phase_confirmation: "payment_structure",
  total_fee_confirmation: "payment_structure",
  phase_payment_allocation: "payment_structure",
  payment_structure: "payment_structure",
  milestone_schedule: "payment_structure",
  ip_ownership: "ownership_and_ip",
  ip_allocation: "ownership_and_ip",
  license_background_tools: "ownership_and_ip",
  saas_sla: "support_expectations",
  support_obligations: "support_expectations",
  renewal_notice: "termination_notice",
  termination: "termination_notice",
};

export type BuildStableGuidedQueueArgs = {
  variables: readonly DealVariable[];
  answered?: Readonly<Record<string, string>>;
  skipped?: ReadonlySet<string>;
  maxQuestions?: number;
};

export type StableGuidedQueueResult = {
  queue: string[];
  variables: DealVariable[];
  removedIds: string[];
  blockedRepeatIds: string[];
};

function isResolved(id: string, answered?: Readonly<Record<string, string>>, skipped?: ReadonlySet<string>): boolean {
  if (skipped?.has(id)) return true;
  const a = (answered?.[id] || "").trim();
  return a.length > 0;
}

function semanticIntentForVariable(v: DealVariable): string {
  const explicit = SEMANTIC_INTENT_CLUSTERS[v.id];
  if (explicit) return explicit;
  const blob = `${v.id} ${v.category} ${v.label} ${v.question}`.toLowerCase();
  if (/\bgoverning|venue|jurisdiction\b/i.test(blob)) return "governing_law_and_venue";
  if (/\bpayment|fee|milestone|phase|compensation\b/i.test(blob)) return "payment_structure";
  if (/\bownership|work product|intellectual|license|background tools?\b/i.test(blob)) return "ownership_and_ip";
  if (/\bsupport|uptime|sla|service level|maintenance\b/i.test(blob)) return "support_expectations";
  if (/\btermination|renewal|notice\b/i.test(blob)) return "termination_notice";
  return v.id;
}

function preferVariableInPaymentCluster(a: DealVariable, b: DealVariable): DealVariable {
  // Without a concrete fee amount, "how paid" beats "confirm total fee".
  const rank = (id: string): number => {
    if (id === "project_fee_phase_confirmation") return 0;
    if (id === "payment_structure") return 1;
    if (id === "phase_payment_allocation") return 2;
    if (id === "total_fee_confirmation") return 3;
    if (id === "milestone_schedule") return 4;
    return 5;
  };
  return rank(a.id) <= rank(b.id) ? a : b;
}

export function dedupeGuidedQuestionsBySemanticIntent(args: {
  variables: readonly DealVariable[];
  answered?: Readonly<Record<string, string>>;
  skipped?: ReadonlySet<string>;
}): { variables: DealVariable[]; removedIds: string[]; blockedRepeatIds: string[] } {
  const intentByAnswered = new Set<string>();
  for (const v of args.variables) {
    if (isResolved(v.id, args.answered, args.skipped)) intentByAnswered.add(semanticIntentForVariable(v));
  }
  const seenIntent = new Map<string, DealVariable>();
  const variables: DealVariable[] = [];
  const removedIds: string[] = [];
  const blockedRepeatIds: string[] = [];
  for (const v of args.variables) {
    const intent = semanticIntentForVariable(v);
    if (isResolved(v.id, args.answered, args.skipped)) {
      blockedRepeatIds.push(v.id);
      continue;
    }
    if (intentByAnswered.has(intent)) {
      blockedRepeatIds.push(v.id);
      continue;
    }
    const existing = seenIntent.get(intent);
    if (existing) {
      if (intent === "payment_structure") {
        const preferred = preferVariableInPaymentCluster(existing, v);
        if (preferred.id !== existing.id) {
          removedIds.push(existing.id);
          const idx = variables.findIndex((x) => x.id === existing.id);
          if (idx >= 0) variables[idx] = preferred;
          seenIntent.set(intent, preferred);
        } else {
          removedIds.push(v.id);
        }
        continue;
      }
      removedIds.push(v.id);
      continue;
    }
    seenIntent.set(intent, v);
    variables.push(v);
  }
  return { variables, removedIds, blockedRepeatIds };
}

export function buildStableGuidedQuestionQueue(args: BuildStableGuidedQueueArgs): StableGuidedQueueResult {
  const max = args.maxQuestions ?? MAX_GUIDED_QUEUE;
  const semanticDedupe = dedupeGuidedQuestionsBySemanticIntent({
    variables: prioritizeDealVariables(filterUserAnswerableGuidedVariables(args.variables)),
    answered: args.answered,
    skipped: args.skipped,
  });
  const prioritized = semanticDedupe.variables;
  const seen = new Set<string>();
  const removedIds: string[] = [...semanticDedupe.removedIds];
  const blockedRepeatIds: string[] = [...semanticDedupe.blockedRepeatIds];
  const queue: string[] = [];
  const variables: DealVariable[] = [];

  for (const v of prioritized) {
    if (queue.length >= max) break;
    const id = v.id;
    if (seen.has(id)) {
      removedIds.push(id);
      continue;
    }
    if (isResolved(id, args.answered, args.skipped)) {
      blockedRepeatIds.push(id);
      continue;
    }
    const excludes = CANONICAL_EXCLUDES[id];
    if (excludes?.some((other) => seen.has(other) || isResolved(other, args.answered, args.skipped))) {
      removedIds.push(id);
      continue;
    }
    seen.add(id);
    queue.push(id);
    variables.push(v);
  }

  const visible = queue.length;
  logGuidedQuestionQueueBuilt({ total: prioritized.length, visible, ids: queue });
  if (removedIds.length) logGuidedQuestionDedupe({ removedIds });
  if (blockedRepeatIds.length) {
    for (const variableId of blockedRepeatIds) {
      logGuidedQuestionRepeatBlocked({ variableId });
    }
  }

  return { queue, variables, removedIds, blockedRepeatIds };
}

export function mergeStableGuidedQueue(
  lockedQueue: readonly string[],
  lockedVariables: readonly DealVariable[],
  base: BuildStableGuidedQueueArgs,
): StableGuidedQueueResult {
  const varById = new Map<string, DealVariable>();
  for (const v of lockedVariables) varById.set(v.id, v);
  for (const v of base.variables) varById.set(v.id, v);

  const mergedVars = [...lockedVariables];
  for (const v of base.variables) {
    if (!varById.has(v.id)) mergedVars.push(v);
  }

  const fresh = buildStableGuidedQuestionQueue({
    variables: mergedVars,
    answered: base.answered,
    skipped: base.skipped,
    maxQuestions: Math.max(base.maxQuestions ?? MAX_GUIDED_QUEUE, lockedQueue.length),
  });

  const answered = base.answered ?? {};
  const skipped = base.skipped ?? new Set<string>();
  const queue: string[] = [];
  const seen = new Set<string>();

  for (const id of lockedQueue) {
    if (seen.has(id)) continue;
    if (isResolved(id, answered, skipped)) {
      logGuidedQuestionRepeatBlocked({ variableId: id });
      continue;
    }
    seen.add(id);
    queue.push(id);
  }

  for (const id of fresh.queue) {
    if (seen.has(id) || queue.length >= (base.maxQuestions ?? MAX_GUIDED_QUEUE)) continue;
    if (isResolved(id, answered, skipped)) continue;
    seen.add(id);
    queue.push(id);
  }

  const variables = queue
    .map((id) => varById.get(id))
    .filter((v): v is DealVariable => Boolean(v));

  logGuidedQuestionQueueBuilt({ total: mergedVars.length, visible: queue.length, ids: queue });

  return {
    queue,
    variables: variables.length ? variables : fresh.variables,
    removedIds: fresh.removedIds,
    blockedRepeatIds: fresh.blockedRepeatIds,
  };
}

export function logGuidedQuestionQueueBuilt(payload: { total: number; visible: number; ids: string[] }): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[guided-question-queue-built]", payload);
}

export function logGuidedQuestionDedupe(payload: { removedIds: string[] }): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[guided-question-dedupe]", payload);
}

export function logGuidedQuestionRepeatBlocked(payload: { variableId: string }): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[guided-question-repeat-blocked]", payload);
}

/** Applied variable IDs must never re-enter the visible queue. */
export function filterAppliedIdsFromVisibleQueue(
  queue: readonly string[],
  answered: Readonly<Record<string, string>>,
  skipped: ReadonlySet<string>,
): string[] {
  const out: string[] = [];
  for (const id of queue) {
    if (skipped.has(id)) continue;
    if ((answered[id] || "").trim()) continue;
    out.push(id);
  }
  return out;
}

export function logGuidedQuestionQueueFreezeHit(payload: {
  queueLen: number;
  answeredCount?: number;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[guided-question-queue-freeze-hit]", payload);
}

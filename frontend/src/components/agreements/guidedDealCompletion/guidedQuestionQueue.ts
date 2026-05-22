/**
 * Stable guided question queue — dedupe by canonical variableId, block repeats after answer/skip.
 */

import type { DealVariable } from "./types";
import { prioritizeDealVariables } from "./variablePrioritizationLayer";

const MAX_GUIDED_QUEUE = 5;

/** When one id is queued, suppress near-duplicate fee questions. */
const CANONICAL_EXCLUDES: Record<string, readonly string[]> = {
  project_fee_phase_confirmation: ["total_fee_confirmation"],
  total_fee_confirmation: ["project_fee_phase_confirmation"],
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

export function buildStableGuidedQuestionQueue(args: BuildStableGuidedQueueArgs): StableGuidedQueueResult {
  const max = args.maxQuestions ?? MAX_GUIDED_QUEUE;
  const prioritized = prioritizeDealVariables(args.variables);
  const seen = new Set<string>();
  const removedIds: string[] = [];
  const blockedRepeatIds: string[] = [];
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

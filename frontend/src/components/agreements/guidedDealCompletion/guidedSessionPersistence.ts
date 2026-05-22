import type { CommercialFamilyHint } from "../proAgreementCompleteness/types";
import { applyGuidedAnswerTransaction, resolveGuidedCurrentIndex } from "./guidedCompletionEngine";
import { mergeStableGuidedQueue } from "./guidedQuestionQueue";
import { computeCompletenessPercent } from "./variablePrioritizationLayer";
import type { DealVariable, GuidedCompletionSession } from "./types";

const STORAGE_KEY = "claw_guided_completion_locked_v1";

export type PersistedGuidedSession = {
  sessionKey: string;
  frozenTotalQuestions: number;
  queue: string[];
  /** Snapshot of deal variables at lock time — prevents queue shrink on rerender. */
  variables: DealVariable[];
  answered: Record<string, string>;
  answeredAt?: Record<string, number>;
  skippedIds: string[];
  currentIndex: number;
  agreementFamily: CommercialFamilyHint;
};

export function buildGuidedSessionKey(agreementGenerationId: string, intakeFingerprint: string): string {
  return `${(agreementGenerationId || "gen").trim()}:${(intakeFingerprint || "intake").trim()}`;
}

export function readPersistedGuidedSession(): PersistedGuidedSession | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PersistedGuidedSession;
  } catch {
    return null;
  }
}

export function persistGuidedSession(session: GuidedCompletionSession, sessionKey: string): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    const idx = resolveGuidedCurrentIndex(session);
    const payload: PersistedGuidedSession = {
      sessionKey,
      frozenTotalQuestions: session.frozenTotalQuestions ?? session.queue.length,
      queue: [...session.queue],
      variables: [...session.variables],
      answered: { ...session.answered },
      answeredAt: session.answeredAt ? { ...session.answeredAt } : undefined,
      skippedIds: [...session.skipped],
      currentIndex: idx,
      agreementFamily: session.agreementFamily,
    };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

export function clearPersistedGuidedSession(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function lockGuidedSession(session: GuidedCompletionSession, sessionKey: string): GuidedCompletionSession {
  const frozen = session.frozenTotalQuestions ?? session.queue.length;
  const idx = resolveGuidedCurrentIndex(session);
  return {
    ...session,
    sessionKey,
    frozenTotalQuestions: Math.max(frozen, session.queue.length),
    currentIndex: idx,
  };
}

function sessionProgressScore(session: GuidedCompletionSession): number {
  const answeredN = Object.keys(session.answered).length;
  const skippedN = session.skipped.size;
  const idx = resolveGuidedCurrentIndex(session);
  const latestAt = Math.max(0, ...Object.values(session.answeredAt ?? {}));
  return answeredN * 1000 + skippedN * 100 + idx * 10 + latestAt / 1_000_000_000;
}

function recomputeSessionProgress(session: GuidedCompletionSession): GuidedCompletionSession {
  const idx = resolveGuidedCurrentIndex(session);
  const frozen = session.frozenTotalQuestions ?? session.queue.length;
  return {
    ...session,
    currentIndex: idx,
    completenessPercent: computeCompletenessPercent({
      totalVariables: frozen,
      answeredCount: Object.keys(session.answered).length,
      skippedCount: session.skipped.size,
    }),
  };
}

function mergeAnsweredMaps(
  prev: GuidedCompletionSession,
  incoming: GuidedCompletionSession,
): { answered: Record<string, string>; answeredAt: Record<string, number> } {
  const answered = { ...incoming.answered, ...prev.answered };
  const answeredAt: Record<string, number> = { ...(incoming.answeredAt ?? {}), ...(prev.answeredAt ?? {}) };
  for (const id of Object.keys(prev.answered)) {
    const prevAt = prev.answeredAt?.[id] ?? 0;
    const inAt = incoming.answeredAt?.[id] ?? 0;
    if (prevAt >= inAt) {
      answered[id] = prev.answered[id];
      answeredAt[id] = prevAt;
    }
  }
  return { answered, answeredAt };
}

/** Add new variables from base to the frozen queue — never remove ids mid-session. */
export function supplementGuidedSessionFromBase(
  locked: GuidedCompletionSession,
  base: GuidedCompletionSession | null,
  sessionKey: string,
): GuidedCompletionSession {
  if (!base) return recomputeSessionProgress({ ...locked, sessionKey });
  const merged = mergeStableGuidedQueue(locked.queue, locked.variables, {
    variables: base.variables,
    answered: locked.answered,
    skipped: locked.skipped,
    maxQuestions: Math.max(locked.frozenTotalQuestions ?? locked.queue.length, base.queue.length),
  });
  return recomputeSessionProgress({
    ...locked,
    sessionKey,
    queue: merged.queue,
    variables: merged.variables.length ? merged.variables : locked.variables,
    frozenTotalQuestions: Math.max(locked.frozenTotalQuestions ?? locked.queue.length, merged.queue.length),
  });
}

/** Keep the more advanced in-memory session when a rerender tries to rewind progress. */
export function preserveGuidedSessionProgress(
  prev: GuidedCompletionSession,
  incoming: GuidedCompletionSession,
): GuidedCompletionSession {
  const { answered, answeredAt } = mergeAnsweredMaps(prev, incoming);
  const skipped = new Set([...incoming.skipped, ...prev.skipped]);
  const queue =
    prev.queue.length >= incoming.queue.length
      ? [...prev.queue]
      : [...incoming.queue, ...prev.queue.filter((id) => !incoming.queue.includes(id))];
  const varById = new Map<string, DealVariable>();
  for (const v of incoming.variables) varById.set(v.id, v);
  for (const v of prev.variables) varById.set(v.id, v);
  const variables = queue.map((id) => varById.get(id)).filter((v): v is DealVariable => Boolean(v));
  const frozen = Math.max(
    prev.frozenTotalQuestions ?? prev.queue.length,
    incoming.frozenTotalQuestions ?? incoming.queue.length,
    queue.length,
  );
  const merged: GuidedCompletionSession = {
    ...incoming,
    queue,
    variables: variables.length ? variables : prev.variables,
    answered,
    answeredAt,
    skipped,
    frozenTotalQuestions: frozen,
  };
  return recomputeSessionProgress(merged);
}

/** After bulk apply — freeze queue/answers; do not grow from post-apply body gap rescans. */
export function freezeGuidedSessionAfterApply(
  session: GuidedCompletionSession,
  sessionKey: string,
): GuidedCompletionSession {
  const frozen = session.frozenTotalQuestions ?? session.queue.length;
  return recomputeSessionProgress({
    ...session,
    sessionKey,
    queue: [...session.queue],
    variables: [...session.variables],
    answered: { ...session.answered },
    answeredAt: session.answeredAt ? { ...session.answeredAt } : undefined,
    answeredMeta: session.answeredMeta ? { ...session.answeredMeta } : undefined,
    skipped: new Set(session.skipped),
    frozenTotalQuestions: frozen,
  });
}

/**
 * During local answer collection, only merge new variables from base — never rewind answers.
 */
export function preserveGuidedSessionDuringCollection(
  prev: GuidedCompletionSession,
  base: GuidedCompletionSession | null,
  sessionKey: string,
): GuidedCompletionSession {
  const supplemented = supplementGuidedSessionFromBase(prev, base, sessionKey);
  return {
    ...supplemented,
    answered: { ...prev.answered },
    answeredAt: prev.answeredAt ? { ...prev.answeredAt } : supplemented.answeredAt,
    answeredMeta: prev.answeredMeta ? { ...prev.answeredMeta } : supplemented.answeredMeta,
    skipped: new Set([...prev.skipped, ...supplemented.skipped]),
    sessionKey,
  };
}

/** Reuse locked queue for the same premium generation; never shrink mid-review. */
export function mergeGuidedSessionWithPersistence(
  base: GuidedCompletionSession | null,
  persisted: PersistedGuidedSession | null,
  sessionKey: string,
): GuidedCompletionSession | null {
  if (!base?.queue.length && !persisted?.queue.length) return null;

  if (persisted && persisted.sessionKey === sessionKey && persisted.queue.length > 0) {
    const varById = new Map<string, DealVariable>();
    for (const v of persisted.variables ?? []) varById.set(v.id, v);
    for (const v of base?.variables ?? []) varById.set(v.id, v);
    const queue = [...persisted.queue];
    const variables = queue.map((id) => varById.get(id)).filter((v): v is DealVariable => Boolean(v));
    const mergedVars = variables.length ? variables : (persisted.variables ?? base?.variables ?? []);
    const session: GuidedCompletionSession = {
      variables: mergedVars,
      queue,
      answered: { ...persisted.answered },
      answeredAt: persisted.answeredAt ? { ...persisted.answeredAt } : undefined,
      skipped: new Set(persisted.skippedIds),
      currentIndex: 0,
      completenessPercent: 0,
      agreementFamily: persisted.agreementFamily ?? base?.agreementFamily ?? "generic_business_agreement",
      sessionKey,
      frozenTotalQuestions: Math.max(persisted.frozenTotalQuestions, persisted.queue.length),
    };
    return recomputeSessionProgress(session);
  }

  if (!base) return null;
  return lockGuidedSession(base, sessionKey);
}

export function mergeGuidedSessionOnBaseRefresh(
  prev: GuidedCompletionSession | null,
  base: GuidedCompletionSession | null,
  persisted: PersistedGuidedSession | null,
  sessionKey: string,
): GuidedCompletionSession | null {
  const incoming = mergeGuidedSessionWithPersistence(base, persisted, sessionKey);
  if (!incoming) return null;
  if (!prev || prev.sessionKey !== sessionKey) return incoming;

  const prevProgress = Object.keys(prev.answered).length + prev.skipped.size;
  const incomingProgress = Object.keys(incoming.answered).length + incoming.skipped.size;
  const prevIdx = resolveGuidedCurrentIndex(prev);
  const incomingIdx = resolveGuidedCurrentIndex(incoming);

  if (prevProgress > 0 && (prevProgress > incomingProgress || prevIdx > incomingIdx)) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.info("[guided-session-merge-skipped-active-progress]", {
        prevAnswered: Object.keys(prev.answered),
        incomingAnswered: Object.keys(incoming.answered),
        prevIndex: prevIdx,
        incomingIndex: incomingIdx,
      });
    }
    return supplementGuidedSessionFromBase(prev, base, sessionKey);
  }

  if (sessionProgressScore(prev) > sessionProgressScore(incoming)) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.info("[guided-session-merge-skipped-active-progress]", { reason: "progress_score" });
    }
    return supplementGuidedSessionFromBase(prev, base, sessionKey);
  }
  return preserveGuidedSessionProgress(prev, incoming);
}

/** Re-apply a persisted answered id after external refresh (idempotent). */
export function rehydrateGuidedSessionAnswer(
  session: GuidedCompletionSession,
  variableId: string,
  answer: string,
): GuidedCompletionSession {
  if (!session.answered[variableId] && !answer.trim()) return session;
  return applyGuidedAnswerTransaction(session, variableId, answer || session.answered[variableId]);
}

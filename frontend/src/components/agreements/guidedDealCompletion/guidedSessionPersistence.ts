import type { CommercialFamilyHint } from "../proAgreementCompleteness/types";
import { resolveGuidedCurrentIndex } from "./guidedCompletionEngine";
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
  return Object.keys(session.answered).length * 100 + session.skipped.size * 10 + session.currentIndex;
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

/** Add new variables from base to the frozen queue — never remove ids mid-session. */
export function supplementGuidedSessionFromBase(
  locked: GuidedCompletionSession,
  base: GuidedCompletionSession | null,
  sessionKey: string,
): GuidedCompletionSession {
  if (!base) return recomputeSessionProgress({ ...locked, sessionKey });
  const varById = new Map<string, DealVariable>();
  for (const v of locked.variables) varById.set(v.id, v);
  for (const v of base.variables) varById.set(v.id, v);
  const queue = [...locked.queue];
  for (const id of base.queue) {
    if (!queue.includes(id)) queue.push(id);
  }
  const variables = queue.map((id) => varById.get(id)).filter((v): v is DealVariable => Boolean(v));
  return recomputeSessionProgress({
    ...locked,
    sessionKey,
    queue,
    variables: variables.length ? variables : locked.variables,
    frozenTotalQuestions: locked.frozenTotalQuestions ?? locked.queue.length,
  });
}

/** Keep the more advanced in-memory session when a rerender tries to rewind progress. */
export function preserveGuidedSessionProgress(
  prev: GuidedCompletionSession,
  incoming: GuidedCompletionSession,
): GuidedCompletionSession {
  const answered = { ...incoming.answered, ...prev.answered };
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
    skipped,
    frozenTotalQuestions: frozen,
    currentIndex: Math.max(prev.currentIndex, incoming.currentIndex),
  };
  return recomputeSessionProgress(merged);
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
    const answered = { ...persisted.answered };
    const skipped = new Set(persisted.skippedIds);
    const session: GuidedCompletionSession = {
      variables: mergedVars,
      queue,
      answered,
      skipped,
      currentIndex: persisted.currentIndex,
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
  if (sessionProgressScore(prev) > sessionProgressScore(incoming)) {
    return supplementGuidedSessionFromBase(prev, base, sessionKey);
  }
  return preserveGuidedSessionProgress(prev, incoming);
}

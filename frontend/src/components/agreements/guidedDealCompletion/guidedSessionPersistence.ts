import type { CommercialFamilyHint } from "../proAgreementCompleteness/types";
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
    const payload: PersistedGuidedSession = {
      sessionKey,
      frozenTotalQuestions: session.frozenTotalQuestions ?? session.queue.length,
      queue: [...session.queue],
      variables: [...session.variables],
      answered: { ...session.answered },
      skippedIds: [...session.skipped],
      currentIndex: session.currentIndex,
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
  return {
    ...session,
    sessionKey,
    frozenTotalQuestions: Math.max(frozen, session.queue.length),
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
    const answered = { ...persisted.answered };
    const skipped = new Set(persisted.skippedIds);
    return {
      variables: mergedVars,
      queue,
      answered,
      skipped,
      currentIndex: persisted.currentIndex,
      completenessPercent: computeCompletenessPercent({
        totalVariables: persisted.frozenTotalQuestions,
        answeredCount: Object.keys(answered).length,
        skippedCount: skipped.size,
      }),
      agreementFamily: persisted.agreementFamily ?? base?.agreementFamily ?? "generic_business_agreement",
      sessionKey,
      frozenTotalQuestions: Math.max(persisted.frozenTotalQuestions, persisted.queue.length),
    };
  }

  if (!base) return null;
  return lockGuidedSession(base, sessionKey);
}

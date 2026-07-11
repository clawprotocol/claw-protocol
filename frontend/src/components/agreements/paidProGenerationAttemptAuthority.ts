/**
 * Paid Pro generation-attempt authority — one immutable attempt identity per checkout generation.
 * Historical attempt evidence may remain for diagnostics but must not classify a later attempt.
 */

import { clearAcceptedProCorpusSafeDisplayCache } from "./paidProAcceptedCorpusSafeDisplayCache";
import { clearProGenerationAdoptionForTests } from "./paidProGenerationAdoption";
import { clearPaidProPostAcceptanceValidatorCache } from "./paidProPostAcceptanceValidatorCache";
import {
  clearAcceptedServerFullDraftLatchAndSessionFrozenBodies,
  PARSE_DEGRADED_PAID_AUTHORITATIVE_MIN_LEN,
} from "./premiumAcceptancePolicy";
import { clearPremiumParseSessionGuard } from "./premiumParseSessionGuard";

export type PaidProGenerationAttemptTerminalOutcome =
  | "accepted"
  | "rejected"
  | "degraded_recovery"
  | "fallback"
  | "cancelled"
  | "superseded"
  | "transport_failure"
  | "frozen";

type AttemptTerminalRecord = {
  outcome: PaidProGenerationAttemptTerminalOutcome;
  at: number;
};

type AttemptRecord = {
  sequence: number;
  generationId: string;
  intakeFingerprint: string;
  startedAt: number;
  terminal: AttemptTerminalRecord | null;
};

let activeAttemptId: string | null = null;
let activeAttemptIntakeFingerprint: string | null = null;
let activeAttemptSequence = 0;
const terminalByAttemptId = new Map<string, AttemptTerminalRecord>();
const attemptsBySequence = new Map<number, AttemptRecord>();

function trim(value: string | null | undefined): string {
  return (value || "").trim();
}

function markPriorAttemptsSuperseded(nextSequence: number): void {
  for (const [seq, rec] of attemptsBySequence) {
    if (seq >= nextSequence || rec.terminal) continue;
    rec.terminal = { outcome: "superseded", at: Date.now() };
    terminalByAttemptId.set(rec.generationId, { outcome: "superseded", at: Date.now() });
  }
}

export function getActivePaidProGenerationAttemptId(): string | null {
  return activeAttemptId;
}

export function getActivePaidProGenerationAttemptIntakeFingerprint(): string | null {
  return activeAttemptIntakeFingerprint;
}

export function getActivePaidProGenerationAttemptSequence(): number {
  return activeAttemptSequence;
}

export function readPaidProGenerationAttemptRecord(
  attemptSequence?: number | null,
): AttemptRecord | null {
  const seq = attemptSequence ?? activeAttemptSequence;
  if (!seq) return null;
  return attemptsBySequence.get(seq) ?? null;
}

export function isActivePaidProGenerationAttempt(attemptId: string | null | undefined): boolean {
  const id = trim(attemptId);
  if (!id || !activeAttemptId) return false;
  return activeAttemptId === id;
}

export function readPaidProGenerationAttemptTerminalOutcome(args?: {
  agreementGenerationId?: string | null;
  attemptSequence?: number | null;
}): PaidProGenerationAttemptTerminalOutcome | null {
  const seq = args?.attemptSequence;
  if (seq != null && seq > 0) {
    return attemptsBySequence.get(seq)?.terminal?.outcome ?? null;
  }
  const id = trim(args?.agreementGenerationId);
  if (!id) return null;
  return terminalByAttemptId.get(id)?.outcome ?? null;
}

/** Idempotent terminalization — first authorized terminal outcome remains authoritative. */
export function markPaidProGenerationAttemptTerminal(args: {
  agreementGenerationId: string | null | undefined;
  attemptSequence?: number | null;
  outcome: PaidProGenerationAttemptTerminalOutcome;
}): boolean {
  const id = trim(args.agreementGenerationId);
  const seq = args.attemptSequence ?? activeAttemptSequence;
  if (!id && !seq) return false;
  const rec = seq ? attemptsBySequence.get(seq) : null;
  if (rec?.terminal) return false;
  const terminal = { outcome: args.outcome, at: Date.now() };
  if (rec) rec.terminal = terminal;
  if (id) terminalByAttemptId.set(id, terminal);
  return true;
}

export function cancelPaidProGenerationAttempt(args: {
  agreementGenerationId?: string | null;
  attemptSequence?: number | null;
}): void {
  markPaidProGenerationAttemptTerminal({
    agreementGenerationId: args.agreementGenerationId,
    attemptSequence: args.attemptSequence,
    outcome: "cancelled",
  });
}

/** Reject authoritative writes from a superseded or cancelled attempt. */
export function rejectSupersededPaidProGenerationWrite(args: {
  agreementGenerationId?: string | null;
  attemptSequence?: number | null;
  surface?: string | null;
}): boolean {
  if (activeAttemptSequence === 0 && !activeAttemptId) return false;
  const seq = args.attemptSequence;
  if (seq != null && seq > 0 && seq !== activeAttemptSequence) {
    return true;
  }
  if (seq != null && seq > 0) {
    const terminal = attemptsBySequence.get(seq)?.terminal?.outcome;
    if (terminal === "superseded" || terminal === "cancelled") return true;
  }
  const id = trim(args.agreementGenerationId);
  if (!id || !activeAttemptId) return false;
  if (id !== activeAttemptId) return true;
  const genTerminal = terminalByAttemptId.get(id)?.outcome;
  if (genTerminal === "superseded" || genTerminal === "cancelled") return true;
  return false;
}

export type PaidProGenerationAttemptContext = {
  attemptSequence: number;
  agreementGenerationId: string | null;
  premiumRequestIntakeFingerprint: string | null;
  supersededPriorAttempt: boolean;
};

/**
 * Initialize attempt-scoped mutable recovery/validation state at generation start.
 * Do not rely on post-failure cleanup — failure, cancellation, or navigation may bypass it.
 */
export function beginPaidProGenerationAttempt(args: {
  agreementGenerationId?: string | null;
  premiumRequestIntakeFingerprint?: string | null;
}): PaidProGenerationAttemptContext {
  const nextId = trim(args.agreementGenerationId);
  const nextFp = trim(args.premiumRequestIntakeFingerprint);
  const isNewGeneration = Boolean(nextId && nextId !== activeAttemptId);
  const nextSequence = activeAttemptSequence + 1;
  markPriorAttemptsSuperseded(nextSequence);
  activeAttemptSequence = nextSequence;

  if (nextId) activeAttemptId = nextId;
  if (nextFp) activeAttemptIntakeFingerprint = nextFp;

  attemptsBySequence.set(nextSequence, {
    sequence: nextSequence,
    generationId: nextId,
    intakeFingerprint: nextFp,
    startedAt: Date.now(),
    terminal: null,
  });

  clearAcceptedProCorpusSafeDisplayCache();
  clearPremiumParseSessionGuard();
  clearPaidProPostAcceptanceValidatorCache();

  if (isNewGeneration) {
    clearProGenerationAdoptionForTests();
    clearAcceptedServerFullDraftLatchAndSessionFrozenBodies();
  }

  return {
    attemptSequence: nextSequence,
    agreementGenerationId: nextId || null,
    premiumRequestIntakeFingerprint: nextFp || null,
    supersededPriorAttempt: nextSequence > 1,
  };
}

export function clearPaidProGenerationAttemptAuthorityForTests(): void {
  activeAttemptId = null;
  activeAttemptIntakeFingerprint = null;
  activeAttemptSequence = 0;
  terminalByAttemptId.clear();
  attemptsBySequence.clear();
}

/**
 * Current-attempt validation corpus: classify from the HTTP wire body for this attempt,
 * not from pre-gate safe-display preparation that may strip material clause coverage.
 */
export function resolveCurrentAttemptPremiumValidationCorpus(args: {
  processedDoc: string;
  wireDocumentText: string;
  wireServerFullDocumentText: string;
  intakeText: string;
}): { text: string; source: "wire" | "processed" } {
  const processed = trim(args.processedDoc);
  const wireDoc = trim(args.wireDocumentText);
  const wireServer = trim(args.wireServerFullDocumentText);
  const wireCandidate = wireServer.length >= wireDoc.length ? wireServer : wireDoc;

  if (wireCandidate.length < PARSE_DEGRADED_PAID_AUTHORITATIVE_MIN_LEN) {
    return { text: processed, source: "processed" };
  }

  if (processed !== wireCandidate) {
    return { text: wireCandidate, source: "wire" };
  }

  return { text: processed, source: "processed" };
}

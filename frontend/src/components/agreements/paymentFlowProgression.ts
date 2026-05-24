/**
 * Structured logging and helpers for post-checkout → guided review → signing prep progression.
 */

import type { PremiumCompletionSnapshot } from "./premiumCompletionStorage";
import { isAuthoritativePremiumPipelineRenderSource } from "./premiumRenderSourceResolver";
import { shouldSkipPremiumEnsureBecauseSnapshotAlreadyAuthoritative } from "./premiumAuthoritativeVisibleSurface";

export type PaymentFlowStage =
  | "checkout_complete"
  | "premium_unlock_received"
  | "authoritative_corpus_started"
  | "authoritative_corpus_complete"
  | "signing_prepare_started"
  | "signing_prepare_complete"
  | "signing_prepare_failed"
  | "review_transition_started"
  | "review_transition_complete";

export type PaymentFlowStagePayload = {
  agreementId?: string | null;
  paymentState?: string | null;
  premiumUnlocked?: boolean;
  corpusIntegrity?: "ok" | "warn" | "fail" | "unknown";
  initialsValidation?: "complete" | "incomplete" | "skipped" | "unknown";
  signatureValidation?: "complete" | "incomplete" | "skipped" | "unknown";
  durationMs?: number;
  error?: string;
  stack?: string;
  [key: string]: unknown;
};

export type GuidedProgressionBlockedPayload = {
  reason: string;
  validator?: string;
  unresolvedPromise?: string;
  missingState?: string;
  agreementId?: string | null;
  phase?: string | null;
  [key: string]: unknown;
};

export const SIGNING_PREPARE_TIMEOUT_MS = 45_000;

function isTestEnv(): boolean {
  return typeof import.meta !== "undefined" && import.meta.env?.MODE === "test";
}

export function logPaymentFlowStage(stage: PaymentFlowStage, payload?: PaymentFlowStagePayload): void {
  if (isTestEnv()) return;
  // eslint-disable-next-line no-console
  console.info("[payment-flow-stage]", { stage, ...(payload ?? {}) });
}

export function logGuidedProgressionBlocked(payload: GuidedProgressionBlockedPayload): void {
  if (isTestEnv()) return;
  // eslint-disable-next-line no-console
  console.warn("[guided-progression-blocked]", payload);
}

export function logSigningPrepareTimeout(payload: Record<string, unknown>): void {
  if (isTestEnv()) return;
  // eslint-disable-next-line no-console
  console.warn("[signing-prepare-timeout]", payload);
}

export function serializeProgressionError(err: unknown): { message: string; stack?: string } {
  if (err instanceof Error) {
    return { message: err.message, stack: err.stack };
  }
  return { message: String(err) };
}

export function readAuthoritativeSnapshotBody(snap: PremiumCompletionSnapshot | null): string {
  return (snap?.premiumWinningBodyText || snap?.premiumReadonlyPlainText || "").trim();
}

export function snapshotReadyForPostCheckoutUnlock(args: {
  snapshot: PremiumCompletionSnapshot | null;
  intakeFingerprint: string;
}): boolean {
  return shouldSkipPremiumEnsureBecauseSnapshotAlreadyAuthoritative({
    snapshot: args.snapshot,
    intakeFingerprint: args.intakeFingerprint,
  });
}

/** True when checkout modal can exit using persisted authoritative snapshot (no new ensure call). */
export function shouldResolvePostCheckoutFromAuthoritativeSnapshot(args: {
  postCheckoutPhase: string | null;
  snapshot: PremiumCompletionSnapshot | null;
  intakeFingerprint: string;
}): boolean {
  if (args.postCheckoutPhase !== "processing") return false;
  return snapshotReadyForPostCheckoutUnlock({
    snapshot: args.snapshot,
    intakeFingerprint: args.intakeFingerprint,
  });
}

export function corpusIntegrityFromStructureDefects(defects: readonly string[]): PaymentFlowStagePayload["corpusIntegrity"] {
  if (!defects.length) return "ok";
  return "warn";
}

export async function withSigningPrepareTimeout<T>(
  label: string,
  promise: Promise<T>,
  timeoutMs: number = SIGNING_PREPARE_TIMEOUT_MS,
): Promise<{ ok: true; value: T } | { ok: false; timedOut: true; label: string }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const raced = await Promise.race([
      promise.then((value) => ({ kind: "ok" as const, value })),
      new Promise<{ kind: "timeout" }>((resolve) => {
        timer = setTimeout(() => resolve({ kind: "timeout" }), timeoutMs);
      }),
    ]);
    if (raced.kind === "timeout") {
      logSigningPrepareTimeout({ label, timeoutMs });
      return { ok: false, timedOut: true, label };
    }
    return { ok: true, value: raced.value };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function isAuthoritativeSnapshotBody(body: string, pipelineSource?: string | null): boolean {
  return body.length >= 500 && isAuthoritativePremiumPipelineRenderSource(String(pipelineSource || ""));
}

/**
 * DEV-only: dump SoT / pin / signing snapshot corpus when paid Pro surface parity drifts.
 * Temporary instrumentation for live repro — remove after investigation.
 */

import { readAuthoritativeSigningCorpus } from "./authoritativeSigningSnapshot";
import { readPaidProPinnedSignerAppliedCorpus } from "./paidProFinalHydratedCorpus";
import { getPaidProSourceOfTruth, hashPaidProCorpus } from "./paidProSourceOfTruth";

const loggedDriftKeys = new Set<string>();

function isDevCaptureEnabled(): boolean {
  return typeof import.meta !== "undefined" && Boolean(import.meta.env?.DEV) && import.meta.env?.MODE !== "test";
}

function corpusEnds(text: string, n = 500): string {
  const t = text || "";
  if (t.length <= n) return t;
  return t.slice(-n);
}

function corpusSnapshot(label: string, text: string) {
  const body = text || "";
  return {
    label,
    length: body.length,
    hash: body.length > 0 ? hashPaidProCorpus(body) : "empty",
    first500: body.slice(0, 500),
    last500: corpusEnds(body, 500),
  };
}

export type PaidProDriftCorpusCaptureContext = {
  surface: string;
  expectedHash: string;
  actualHash: string;
  actualSource: string;
};

/**
 * Log the three authoritative corpus stores once per unique drift signature (DEV only).
 */
export function logPaidProDriftCorpusCaptureOnce(context: PaidProDriftCorpusCaptureContext): void {
  if (!isDevCaptureEnabled()) return;

  const key = `${context.surface}|${context.expectedHash}|${context.actualHash}|${context.actualSource}`;
  if (loggedDriftKeys.has(key)) return;
  loggedDriftKeys.add(key);

  const sot = getPaidProSourceOfTruth()?.text ?? "";
  const pinned = readPaidProPinnedSignerAppliedCorpus();
  const snapshot = readAuthoritativeSigningCorpus();

  // eslint-disable-next-line no-console
  console.warn("[paid-pro-drift-corpus-capture]", {
    drift: context,
    paidProSourceOfTruth: corpusSnapshot("paidProSourceOfTruth", sot),
    pinned_signer_applied_corpus: corpusSnapshot("pinned_signer_applied_corpus", pinned),
    authoritative_signing_snapshot: corpusSnapshot("authoritative_signing_snapshot", snapshot),
  });
}

/** Test-only reset so dedupe does not leak across cases. */
export function resetPaidProDriftCorpusCaptureForTests(): void {
  loggedDriftKeys.clear();
}

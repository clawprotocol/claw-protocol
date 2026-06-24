/**
 * Hash-gated memo for applyAcceptedProCorpusSafeDisplay — same input/output returns cached bytes.
 */

import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { shortIntakeFingerprint } from "../../lib/agreementGenerationId";
import { hashPaidProCorpus } from "./paidProSourceOfTruth";
import { paidProPerfTraceEnabled } from "./paidProPerfLogging";
import type { AcceptedProCorpusSafeDisplayOpts, AcceptedProCorpusSafeDisplayResult } from "./acceptedProCorpusSafeDisplay";

const resultCache = new Map<string, AcceptedProCorpusSafeDisplayResult>();

function draftFingerprint(draft: ParsedDraftShape | null | undefined): string {
  if (!draft) return "no-draft";
  const blob = [
    (draft.parties || []).map((p) => `${String(p?.name ?? "").trim()}|${String(p?.role ?? "").trim()}`).join(";"),
    String(draft.title ?? "").trim(),
    String(draft.jurisdiction ?? "").trim(),
  ].join("\n");
  return blob.length >= 80 ? hashPaidProCorpus(blob) : `len:${blob.length}`;
}

function surfaceMode(opts?: AcceptedProCorpusSafeDisplayOpts): string {
  return opts?.appendExecutionBlockIfMissing ? "vs01_append" : "safe_display";
}

export function buildAcceptedProCorpusSafeDisplayCacheKey(
  corpus: string,
  opts?: AcceptedProCorpusSafeDisplayOpts,
): string {
  const corpusHash = corpusHashForCache(corpus);
  const intakeFp = opts?.intakeText ? shortIntakeFingerprint(opts.intakeText) : "no-intake";
  const draftFp = draftFingerprint(opts?.draft);
  const surface = opts?.surface ?? "accepted_pro_corpus_safe_display";
  return `${corpusHash}|${intakeFp}|${draftFp}|${surfaceMode(opts)}|${surface}`;
}

function corpusHashForCache(corpus: string): string {
  const t = (corpus || "").trim();
  if (!t) return "empty";
  return hashPaidProCorpus(t);
}

export function readAcceptedProCorpusSafeDisplayCache(
  key: string,
): AcceptedProCorpusSafeDisplayResult | null {
  return resultCache.get(key) ?? null;
}

export function writeAcceptedProCorpusSafeDisplayCache(
  key: string,
  value: AcceptedProCorpusSafeDisplayResult,
): void {
  resultCache.set(key, value);
}

export function clearAcceptedProCorpusSafeDisplayCacheForTests(): void {
  resultCache.clear();
}

export function readAcceptedProCorpusSafeDisplayCacheSizeForTests(): number {
  return resultCache.size;
}

export function logPaidProSafeDisplayCacheHit(args: {
  surface: string;
  cacheKey: string;
  inputHash: string;
  outputHash: string;
}): void {
  if (!paidProPerfTraceEnabled()) return;
  if (import.meta.env.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[paid-pro-safe-display-cache-hit]", args);
}

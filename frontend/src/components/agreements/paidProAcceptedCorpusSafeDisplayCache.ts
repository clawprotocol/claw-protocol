/**
 * Hash-gated memo for applyAcceptedProCorpusSafeDisplay — same input/output returns cached bytes.
 */

import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { shortIntakeFingerprint } from "../../lib/agreementGenerationId";
import { hashPaidProCorpus } from "./paidProSourceOfTruth";
import { paidProPerfTraceEnabled } from "./paidProPerfLogging";
import { readFrozenCanonicalManifestPartyNames } from "./frozenCanonicalManifestAuthority";
import { readConsumedPaidProSignerMetadataAuthority } from "./paidProSignerMetadataAuthority";
import type { AcceptedProCorpusSafeDisplayOpts, AcceptedProCorpusSafeDisplayResult } from "./acceptedProCorpusSafeDisplay";

declare const __PAID_PRO_CACHE_BUILD_ID__: string | undefined;

/**
 * TEST541 — bump when the safe-display transform semantics change so a long-lived tab cannot serve
 * bytes produced by an older schema. Combined with the build id below this makes the memo key carry
 * an explicit schema+build discriminator.
 */
export const PAID_PRO_SAFE_DISPLAY_CACHE_SCHEMA_VERSION = "v2";

/** Per-build discriminator (git short SHA / build timestamp) injected by vite `define`. */
export function paidProSafeDisplayCacheBuildId(): string {
  try {
    if (typeof __PAID_PRO_CACHE_BUILD_ID__ === "string" && __PAID_PRO_CACHE_BUILD_ID__) {
      return __PAID_PRO_CACHE_BUILD_ID__;
    }
  } catch {
    // define not present (tests / non-vite runtime)
  }
  return "dev";
}

/**
 * TEST541 — the safe-display transform reads MUTABLE global authority state (frozen canonical
 * manifest + consumed signer-metadata authority). Those are real inputs to the pure transform, so
 * they MUST be part of the memo key. Omitting them let a corpus repaired under a contaminated
 * authority state (e.g. an extra "If to" stanza) be replayed verbatim after the authority was later
 * corrected — surfacing as excess_party_notice_stanzas even though live counts read 4/4/4.
 */
function authorityStateFingerprint(): string {
  try {
    const frozen = readFrozenCanonicalManifestPartyNames();
    const consumed = readConsumedPaidProSignerMetadataAuthority()?.parties ?? [];
    const blob = [
      `f:${frozen.join("|")}`,
      `c:${consumed.map((p) => String(p?.partyLegalName ?? "").trim()).join("|")}`,
    ].join("\n");
    if (!blob.trim() || blob === "f:\nc:") return "no-authority";
    return blob.length >= 40 ? hashPaidProCorpus(blob) : blob;
  } catch {
    return "no-authority";
  }
}

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
  const generationId = (opts?.agreementGenerationId ?? "").trim() || "no-gen";
  const recoveryKind = (opts?.recoveryKind ?? "").trim() || "no-recovery";
  const sourceKind = (opts?.sourceKind ?? "").trim() || "no-source";
  const partyCount = opts?.partyCount ?? 0;
  const version = `${PAID_PRO_SAFE_DISPLAY_CACHE_SCHEMA_VERSION}:${paidProSafeDisplayCacheBuildId()}`;
  const authorityFp = authorityStateFingerprint();
  return `${version}|auth:${authorityFp}|${corpusHash}|${intakeFp}|${draftFp}|${generationId}|${recoveryKind}|${sourceKind}|party:${partyCount}|${surfaceMode(opts)}|${surface}`;
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

/**
 * Production clear — used by the retry / SoT-clear path so a rejected paid Pro validation candidate
 * is never replayed as safe-display authority on the next generation attempt.
 */
export function clearAcceptedProCorpusSafeDisplayCache(): void {
  resultCache.clear();
}

/** Evict a single memoized entry (e.g. a candidate that just failed validation). */
export function evictAcceptedProCorpusSafeDisplayCacheEntry(
  corpus: string,
  opts?: AcceptedProCorpusSafeDisplayOpts,
): boolean {
  return resultCache.delete(buildAcceptedProCorpusSafeDisplayCacheKey(corpus, opts));
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

/**
 * Memoize post-acceptance validators (minimum substance, render resolve) by source + corpus hash.
 */

import type { ConciseCommercialServicesQualityAssessment } from "./paidProConciseServicesQuality";
import { assessConciseCommercialServicesProQuality } from "./paidProConciseServicesQuality";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { corpusHashForScanCache } from "./paidProCorpusScanCache";
import {
  paidProPipelineAcceptedCorpusHash,
  readPaidProPipelineAcceptedCorpusHash,
} from "./paidProPipelineAcceptedCorpus";
import {
  getLatchedAcceptedServerFullDraftAuthority,
  LONG_PREMIUM_AUTHORITATIVE_MIN_LEN,
} from "./premiumAcceptancePolicy";
import { isAuthoritativePremiumPipelineRenderSource } from "./premiumRenderSourceResolver";

type SubstanceCacheKey = string;

const substanceByKey = new Map<SubstanceCacheKey, ConciseCommercialServicesQualityAssessment>();
const authoritativeValidationKeys = new Set<string>();

/** Pipeline acceptance may be keyed by any of these equivalent render sources. */
export const PAID_PRO_PIPELINE_VALIDATION_SOURCE_ALIASES = [
  "server_full_draft",
  "server_full_draft_retry",
  "server_full_document_text",
] as const;

function substanceKey(source: string, text: string): SubstanceCacheKey {
  const t = (text || "").trim();
  return `${source}|${corpusHashForScanCache(t)}|${t.length}`;
}

function authoritativeKey(text: string, source: string): string {
  return substanceKey(source, text);
}

export function clearPaidProPostAcceptanceValidatorCache(): void {
  substanceByKey.clear();
  authoritativeValidationKeys.clear();
}

export function markPaidProAuthoritativeValidationPassed(args: {
  text: string;
  source: string;
}): void {
  authoritativeValidationKeys.add(authoritativeKey(args.text, args.source));
}

export function markPaidProPipelineValidationPassed(args: { text: string; source: string }): void {
  const sources = new Set<string>([
    args.source,
    ...PAID_PRO_PIPELINE_VALIDATION_SOURCE_ALIASES,
  ]);
  for (const source of sources) {
    markPaidProAuthoritativeValidationPassed({ text: args.text, source });
  }
}

export function hasPaidProAuthoritativeValidationPassed(args: {
  text: string;
  source: string;
}): boolean {
  return authoritativeValidationKeys.has(authoritativeKey(args.text, args.source));
}

export function hasPaidProPipelineValidationForCorpus(args: {
  text: string;
  source?: string | null;
}): boolean {
  const sources = new Set<string>([
    args.source ?? "unknown",
    ...PAID_PRO_PIPELINE_VALIDATION_SOURCE_ALIASES,
  ]);
  for (const source of sources) {
    if (hasPaidProAuthoritativeValidationPassed({ text: args.text, source })) {
      return true;
    }
  }
  return false;
}

const PIPELINE_ACCEPTED_CORPUS_LEN_MIN_RATIO = 0.85;
const PIPELINE_ACCEPTED_CORPUS_LEN_MAX_DELTA = 1200;

function isAuthoritativePipelineValidationSource(source: string | null | undefined): boolean {
  const s = (source ?? "").trim();
  if (!s) return true;
  if (
    (PAID_PRO_PIPELINE_VALIDATION_SOURCE_ALIASES as readonly string[]).includes(s)
  ) {
    return true;
  }
  return isAuthoritativePremiumPipelineRenderSource(s);
}

/**
 * Pipeline acceptance is session-scoped: post-checkout safe-display / latch / hydration variants
 * must not re-fail minimum-substance when the server_full_draft was already accepted.
 */
export function hasPaidProPipelineSessionAcceptance(args: {
  text: string;
  source?: string | null;
}): boolean {
  if (hasPaidProPipelineValidationForCorpus(args)) return true;
  if (!isAuthoritativePipelineValidationSource(args.source)) return false;
  const t = (args.text || "").trim();
  if (t.length < LONG_PREMIUM_AUTHORITATIVE_MIN_LEN) return false;
  const latched = getLatchedAcceptedServerFullDraftAuthority();
  if (latched && latched.len >= LONG_PREMIUM_AUTHORITATIVE_MIN_LEN) {
    const latchedBody = latched.body.trim();
    if (t === latchedBody) return true;
    const minLen = Math.floor(latched.len * PIPELINE_ACCEPTED_CORPUS_LEN_MIN_RATIO);
    if (t.length >= minLen && t.length <= latched.len + PIPELINE_ACCEPTED_CORPUS_LEN_MAX_DELTA) {
      return true;
    }
  }
  if (readPaidProPipelineAcceptedCorpusHash() !== null) {
    const incomingHash = paidProPipelineAcceptedCorpusHash(t);
    const acceptedHash = readPaidProPipelineAcceptedCorpusHash();
    if (incomingHash && acceptedHash && incomingHash === acceptedHash) return true;
  }
  return false;
}

export function assessProMinimumSubstanceCached(args: {
  text: string;
  rawIntake: string;
  draft?: ParsedDraftShape | null;
  source?: string | null;
}): ConciseCommercialServicesQualityAssessment {
  const source = args.source ?? "unknown";
  const key = substanceKey(source, args.text);
  const hit = substanceByKey.get(key);
  if (hit) return hit;
  const decision = assessConciseCommercialServicesProQuality({
    text: args.text,
    rawIntake: args.rawIntake,
    draft: args.draft ?? null,
  });
  substanceByKey.set(key, decision);
  return decision;
}

export function readProMinimumSubstanceCacheSize(): number {
  return substanceByKey.size;
}

/**
 * Memoize post-acceptance validators (minimum substance, render resolve) by source + corpus hash.
 */

import type { ConciseCommercialServicesQualityAssessment } from "./paidProConciseServicesQuality";
import { assessConciseCommercialServicesProQuality } from "./paidProConciseServicesQuality";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { corpusHashForScanCache } from "./paidProCorpusScanCache";

type SubstanceCacheKey = string;

const substanceByKey = new Map<SubstanceCacheKey, ConciseCommercialServicesQualityAssessment>();
const authoritativeValidationKeys = new Set<string>();

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

export function hasPaidProAuthoritativeValidationPassed(args: {
  text: string;
  source: string;
}): boolean {
  return authoritativeValidationKeys.has(authoritativeKey(args.text, args.source));
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

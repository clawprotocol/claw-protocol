/**
 * Dedupe expensive corpus scans/repairs by (surface, corpusHash, phase, scanType).
 */

import { hashPaidProCorpus } from "./paidProSourceOfTruth";
import {
  paidProPerfIncrementScan,
  readActivePaidProPerformanceTrace,
} from "./paidProPerformanceTrace";

export type PaidProCorpusScanType =
  | "placeholder_scan"
  | "integrity_auto_repair"
  | "section_contract_violation"
  | "duplicate_payload_rejected"
  | "signature_preview_mode"
  | "canonical_final_party_manifest"
  | "prepare_paid_pro_server_acceptance"
  | "orphan_party_lines_pre_execution";

export type PaidProCorpusScanCacheKey = {
  surface: string;
  corpusHash: string;
  phase: string;
  scanType: PaidProCorpusScanType;
};

const resultCache = new Map<string, unknown>();

function cacheKeyString(key: PaidProCorpusScanCacheKey): string {
  return `${key.scanType}|${key.surface}|${key.phase}|${key.corpusHash}`;
}

export function corpusHashForScanCache(corpus: string): string {
  const t = (corpus || "").trim();
  if (!t) return "";
  return hashPaidProCorpus(t);
}

export function readCachedCorpusScanResult<T>(key: PaidProCorpusScanCacheKey): T | null {
  const hit = resultCache.get(cacheKeyString(key));
  return hit != null ? (hit as T) : null;
}

export function writeCachedCorpusScanResult<T>(key: PaidProCorpusScanCacheKey, value: T): T {
  resultCache.set(cacheKeyString(key), value);
  const trace = readActivePaidProPerformanceTrace();
  if (trace) {
    paidProPerfIncrementScan(trace.traceId, key.scanType);
  }
  return value;
}

export function runCachedCorpusScan<T>(args: {
  surface: string;
  corpus: string;
  phase: string;
  scanType: PaidProCorpusScanType;
  run: () => T;
}): T {
  const corpusHash = corpusHashForScanCache(args.corpus);
  const key: PaidProCorpusScanCacheKey = {
    surface: args.surface,
    corpusHash,
    phase: args.phase,
    scanType: args.scanType,
  };
  const cached = readCachedCorpusScanResult<T>(key);
  if (cached != null) return cached;
  const result = args.run();
  return writeCachedCorpusScanResult(key, result);
}

export function clearPaidProCorpusScanCache(): void {
  resultCache.clear();
}

export function readPaidProCorpusScanCacheSize(): number {
  return resultCache.size;
}

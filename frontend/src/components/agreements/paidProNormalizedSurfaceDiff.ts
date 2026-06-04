/**
 * Canonical SoT vs normalized review/copy surface — telemetry only (no corpus mutation).
 */

import { hashPaidProCorpus } from "./paidProSourceOfTruth";
import { normalizeCorpusForCopyCompare } from "./qa/paidProCorpusIntegrity/paidProCorpusIntegrityMetrics";

export type PaidProNormalizedSurfaceDiffClassification =
  | "whitespace_only"
  | "signature_line_width_only"
  | "display_markup_only"
  | "substantive"
  | "identical";

export type PaidProNormalizedSurfaceDiffPayload = {
  surface: string;
  canonicalHash: string;
  normalizedHash: string;
  canonicalLen: number;
  normalizedLen: number;
  lenDelta: number;
  firstDiffOffset: number | null;
  removedSnippet: string | null;
  insertedSnippet: string | null;
  classification: PaidProNormalizedSurfaceDiffClassification;
};

const SNIPPET_MAX = 120;

function snippetAround(text: string, offset: number): string {
  const start = Math.max(0, offset - 40);
  return text.slice(start, start + SNIPPET_MAX).replace(/\s+/g, " ").trim();
}

function collapseSignatureLineWidthNoise(text: string): string {
  return text.replace(/_{2,}/g, "___");
}

function stripDisplayMarkupNoise(text: string): string {
  return text
    .replace(/<[^>]+>/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n");
}

export function classifyPaidProNormalizedSurfaceDiff(
  canonicalText: string,
  normalizedText: string,
): PaidProNormalizedSurfaceDiffClassification {
  const canonical = (canonicalText || "").replace(/\r\n/g, "\n");
  const normalized = (normalizedText || "").replace(/\r\n/g, "\n");
  if (canonical === normalized) return "identical";
  if (normalizeCorpusForCopyCompare(canonical) === normalizeCorpusForCopyCompare(normalized)) {
    return "whitespace_only";
  }
  if (
    collapseSignatureLineWidthNoise(normalizeCorpusForCopyCompare(canonical)) ===
    collapseSignatureLineWidthNoise(normalizeCorpusForCopyCompare(normalized))
  ) {
    return "signature_line_width_only";
  }
  if (
    normalizeCorpusForCopyCompare(stripDisplayMarkupNoise(canonical)) ===
    normalizeCorpusForCopyCompare(stripDisplayMarkupNoise(normalized))
  ) {
    return "display_markup_only";
  }
  return "substantive";
}

export function buildPaidProNormalizedSurfaceDiffPayload(args: {
  surface: string;
  canonicalText: string;
  normalizedText: string;
}): PaidProNormalizedSurfaceDiffPayload {
  const canonical = (args.canonicalText || "").replace(/\r\n/g, "\n");
  const normalized = (args.normalizedText || "").replace(/\r\n/g, "\n");
  const canonicalHash = hashPaidProCorpus(canonical);
  const normalizedHash = hashPaidProCorpus(normalized);
  const classification = classifyPaidProNormalizedSurfaceDiff(canonical, normalized);

  let firstDiffOffset: number | null = null;
  let removedSnippet: string | null = null;
  let insertedSnippet: string | null = null;
  if (canonical !== normalized) {
    let idx = 0;
    while (idx < canonical.length && idx < normalized.length && canonical[idx] === normalized[idx]) {
      idx += 1;
    }
    firstDiffOffset = idx;
    removedSnippet = snippetAround(canonical, idx);
    insertedSnippet = snippetAround(normalized, idx);
  }

  return {
    surface: args.surface,
    canonicalHash,
    normalizedHash,
    canonicalLen: canonical.length,
    normalizedLen: normalized.length,
    lenDelta: normalized.length - canonical.length,
    firstDiffOffset,
    removedSnippet,
    insertedSnippet,
    classification,
  };
}

let lastNormalizedDiffLogKey: string | null = null;

export function resetPaidProNormalizedSurfaceDiffLogForTests(): void {
  lastNormalizedDiffLogKey = null;
}

export function logPaidProNormalizedSurfaceDiff(
  payload: PaidProNormalizedSurfaceDiffPayload,
  opts?: { force?: boolean },
): void {
  if (payload.classification === "identical") return;
  const key = `${payload.surface}|${payload.canonicalHash}|${payload.normalizedHash}|${payload.classification}`;
  if (!opts?.force && lastNormalizedDiffLogKey === key) return;
  lastNormalizedDiffLogKey = key;
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test" && !opts?.force) {
    return;
  }
  if (typeof import.meta !== "undefined" && import.meta.env?.DEV !== true && !opts?.force) {
    return;
  }
  // eslint-disable-next-line no-console
  console.info("[paid-pro-normalized-surface-diff]", payload);
}

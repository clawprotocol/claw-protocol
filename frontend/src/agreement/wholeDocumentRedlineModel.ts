/**
 * Whole-document redline VM: delegates to block-aware {@link buildLegalRedlineDocumentViewModel}
 * and flattens segments for legacy callers that expect a single segment list.
 */

import { buildLegalRedlineDocumentViewModel } from "./legalRedlineBlocks";
import type { RedlineSegmentVM } from "./recipientPreviewDiffModel";

export type WholeDocumentRedlineStats = {
  insertCount: number;
  deleteCount: number;
  sameCount: number;
  segmentCount: number;
  currentLen: number;
  proposedLen: number;
};

export type WholeDocumentRedlineViewModel = {
  hasChanges: boolean;
  segments: RedlineSegmentVM[];
  fallbackReason?: string;
  stats: WholeDocumentRedlineStats;
};

/** Normalize for diff input; preserves newlines (unlike one-line summary helpers). */
export function normalizeWholeDocumentPlainText(text: string): string {
  return String(text ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\u00a0/g, " ");
}

function countStats(segments: RedlineSegmentVM[]): Omit<WholeDocumentRedlineStats, "currentLen" | "proposedLen"> {
  let insertCount = 0;
  let deleteCount = 0;
  let sameCount = 0;
  for (const s of segments) {
    if (s.type === "insert") insertCount++;
    else if (s.type === "delete") deleteCount++;
    else sameCount++;
  }
  return {
    insertCount,
    deleteCount,
    sameCount,
    segmentCount: segments.length,
  };
}

/**
 * Deterministic full-document redline: block-aware engine, flattened segment stream.
 */
export function buildWholeDocumentRedlineViewModel(
  currentPlainText: string,
  proposedPlainText: string,
): WholeDocumentRedlineViewModel {
  const cur = normalizeWholeDocumentPlainText(currentPlainText);
  const prop = normalizeWholeDocumentPlainText(proposedPlainText);
  const doc = buildLegalRedlineDocumentViewModel(cur, prop);
  const segments: RedlineSegmentVM[] = [];
  for (const b of doc.blocks) {
    for (const s of b.segments) {
      segments.push({ type: s.type, text: s.text });
    }
  }
  const baseStats = countStats(segments);
  return {
    hasChanges: doc.hasChanges,
    segments,
    fallbackReason: doc.fallbackReason,
    stats: {
      ...baseStats,
      currentLen: doc.stats.currentLen,
      proposedLen: doc.stats.proposedLen,
    },
  };
}

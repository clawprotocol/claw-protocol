/**
 * Canonical whole-document plain-text redline for recipient preview (primary UX surface).
 * Never hides diff behind “noisy” gates — uses deterministic {@link buildAgreementRedline}.
 */

import { buildAgreementRedline } from "../vs01/agreementRedline";
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
  /** True when plain-text diff has non-same segments. */
  hasChanges: boolean;
  segments: RedlineSegmentVM[];
  /**
   * Optional note when the engine fell back to a very coarse block diff
   * (user still sees red/green; we never return clean-only as “redline”).
   */
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
 * Deterministic full-document redline from normalized plain text (e.g. htmlToPlainText outputs).
 * Insert-only diffs render green inserts; replacement yields delete + insert segments.
 */
export function buildWholeDocumentRedlineViewModel(
  currentPlainText: string,
  proposedPlainText: string,
): WholeDocumentRedlineViewModel {
  const cur = normalizeWholeDocumentPlainText(currentPlainText);
  const prop = normalizeWholeDocumentPlainText(proposedPlainText);
  const rl = buildAgreementRedline(cur, prop);
  const segments: RedlineSegmentVM[] = rl.segments.map((s) => ({
    type: s.type,
    text: s.text,
  }));

  let fallbackReason: string | undefined;
  if (
    segments.length === 2 &&
    segments[0]?.type === "delete" &&
    segments[1]?.type === "insert"
  ) {
    const delLen = segments[0].text.length;
    const insLen = segments[1].text.length;
    if (delLen > 6000 || insLen > 6000) {
      fallbackReason =
        "Very large single replacement — shown as one removal and one addition. Scroll both sections.";
    }
  }

  const baseStats = countStats(segments);
  return {
    hasChanges: rl.hasChanges,
    segments,
    fallbackReason,
    stats: {
      ...baseStats,
      currentLen: cur.length,
      proposedLen: prop.length,
    },
  };
}

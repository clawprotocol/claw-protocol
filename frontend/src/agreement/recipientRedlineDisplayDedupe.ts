import {
  type LegalRedlineBlock,
  type LegalRedlineDocumentViewModel,
  mergeAdjacentRedlineSegmentsAllTypes,
  normalizeNewlinesForLegalRedline,
  recomputeLegalRedlineBlock,
} from "./legalRedlineBlocks";
import { RECIPIENT_REDLINE_SECTION_COLLAPSED_NOTE } from "./portableReviewCopy";

function normCollapse(s: string): string {
  return normalizeNewlinesForLegalRedline(String(s ?? ""))
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** True when `small` is largely contained in `big` (duplicate replay from PDF / alignment). */
function proposedSubsumedByPrior(big: string, small: string, minRatio = 0.82): boolean {
  const B = normCollapse(big);
  const S = normCollapse(small);
  if (S.length < 120 || B.length < 200) return false;
  if (B.includes(S.slice(0, Math.min(400, S.length)))) return true;
  let hit = 0;
  const words = S.split(/\s+/).filter((w) => w.length > 3);
  if (words.length < 8) return false;
  for (const w of words) {
    if (B.includes(w)) hit++;
  }
  return words.length > 0 && hit / words.length >= minRatio;
}

function blockInsertCharTotal(b: LegalRedlineBlock): number {
  return b.segments.filter((s) => s.type === "insert").reduce((n, s) => n + s.text.length, 0);
}

function collapseBlockToSectionUpdated(b: LegalRedlineBlock, label: string): LegalRedlineBlock {
  const segments = mergeAdjacentRedlineSegmentsAllTypes([
    { type: "same" as const, text: `${label}\n\n${RECIPIENT_REDLINE_SECTION_COLLAPSED_NOTE}` },
  ]);
  return recomputeLegalRedlineBlock(
    {
      ...b,
      currentText: b.currentText,
      proposedText: b.proposedText,
    },
    segments,
  );
}

/**
 * Collapses blocks whose inserted text largely repeats content already shown in earlier
 * insert-heavy blocks (common when PDF extraction duplicates headers or alignment mis-pairs).
 */
export function collapseRecipientRedlineDuplicateInsertBlocks(
  vm: LegalRedlineDocumentViewModel,
  proposedPlain: string,
): LegalRedlineDocumentViewModel {
  const prop = normalizeNewlinesForLegalRedline(proposedPlain);
  if (prop.length < 1500 || vm.blocks.length < 4) return vm;

  const propLen = Math.max(1, normCollapse(prop).length);
  const out: LegalRedlineBlock[] = [];
  let rollingInserts = "";

  for (let i = 0; i < vm.blocks.length; i++) {
    const b = vm.blocks[i]!;
    const insTotal = blockInsertCharTotal(b);
    const propBody = (b.proposedText ?? "").trim();
    const isMegaInsert =
      insTotal > propLen * 0.38 && !((b.currentText ?? "").trim().length > propLen * 0.15);

    if (isMegaInsert && rollingInserts.length < propLen * 0.5) {
      rollingInserts += "\n" + b.segments.filter((s) => s.type === "insert").map((s) => s.text).join("");
      out.push(b);
      continue;
    }

    if (
      propBody.length > 400 &&
      rollingInserts.length > propLen * 0.25 &&
      proposedSubsumedByPrior(rollingInserts, propBody)
    ) {
      const lab = (b.label || b.heading || "Section").trim();
      out.push(collapseBlockToSectionUpdated(b, lab));
      continue;
    }

    if (insTotal > 80) {
      rollingInserts += "\n" + b.segments.filter((s) => s.type === "insert").map((s) => s.text).join("");
    }
    out.push(b);
  }

  const stats = recomputeStats(out, vm.stats.currentLen, vm.stats.proposedLen);
  const hasChanges = out.some((blk) => blk.hasChange);
  return { ...vm, blocks: out, stats, hasChanges };
}

function recomputeStats(
  blocks: LegalRedlineBlock[],
  currentLen: number,
  proposedLen: number,
): LegalRedlineDocumentViewModel["stats"] {
  let insertCount = 0;
  let deleteCount = 0;
  let sameCount = 0;
  let changedBlockCount = 0;
  let segmentCount = 0;
  for (const b of blocks) {
    insertCount += b.insertCount;
    deleteCount += b.deleteCount;
    sameCount += b.sameCount;
    segmentCount += b.segments.length;
    if (b.hasChange) changedBlockCount++;
  }
  return {
    blockCount: blocks.length,
    changedBlockCount,
    insertCount,
    deleteCount,
    sameCount,
    segmentCount,
    currentLen,
    proposedLen,
  };
}

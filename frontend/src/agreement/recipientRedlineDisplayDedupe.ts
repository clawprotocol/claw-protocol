import {
  type LegalRedlineBlock,
  type LegalRedlineDocumentViewModel,
  type LegalRedlineSegment,
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
function nonSameChangeMass(b: LegalRedlineBlock): number {
  return b.segments
    .filter((s) => s.type !== "same")
    .reduce((a, s) => a + String(s.text).replace(/\s+/g, " ").trim().length, 0);
}

/** Sub-clause / list continuations and other tiny compare tails (not standalone substantive revisions). */
function looksLikeListOrSubclauseFragment(b: LegalRedlineBlock): boolean {
  const raw = (b.proposedText || b.currentText || "").trim();
  const fromSegs = b.segments
    .filter((s) => s.type !== "same")
    .map((s) => String(s.text).trim())
    .join(" ");
  const head = (raw || fromSegs).split("\n")[0]?.trim() ?? "";
  const probe = head || (b.label || b.heading || "").trim();
  if (/^\([a-z]\)\s+/i.test(probe)) return true;
  if (/^\([ivx]{1,4}\)\s+/i.test(probe)) return true;
  if (/^\d+\.\d+[\.)]\s/.test(probe) && raw.length < 160) return true;
  return false;
}

function isLowSignalFragmentBlock(b: LegalRedlineBlock): boolean {
  if (!b.hasChange) return false;
  const m = nonSameChangeMass(b);
  if (m === 0) return false;

  const numberedClause = Boolean(b.clauseNumber && b.kind === "clause");
  if (numberedClause) {
    if (m > 60) return false;
    return looksLikeListOrSubclauseFragment(b);
  }

  if (m <= 22) return true;
  if (
    m <= 60 &&
    (looksLikeListOrSubclauseFragment(b) ||
      b.kind === "bullet" ||
      b.kind === "heading" ||
      b.kind === "footer" ||
      b.kind === "signature")
  ) {
    return true;
  }
  return false;
}

function combineAdjacentBlocks(first: LegalRedlineBlock, second: LegalRedlineBlock): LegalRedlineBlock {
  const spacer: LegalRedlineSegment = { type: "same", text: "\n\n" };
  const mergedSegs = mergeAdjacentRedlineSegmentsAllTypes([...first.segments, spacer, ...second.segments]);
  const currentText = [first.currentText?.trim(), second.currentText?.trim()].filter(Boolean).join("\n\n");
  const proposedText = [first.proposedText?.trim(), second.proposedText?.trim()].filter(Boolean).join("\n\n");
  const label = (first.label || first.heading || second.label || second.heading || "Section").trim();
  return recomputeLegalRedlineBlock(
    {
      ...first,
      id: `${first.id}__${second.id}`,
      label,
      heading: first.heading || second.heading,
      clauseNumber: first.clauseNumber ?? second.clauseNumber,
      currentText: currentText || undefined,
      proposedText: proposedText || undefined,
      kind: first.kind,
    },
    mergedSegs,
  );
}

/**
 * Merges tiny / list-fragment changed blocks into adjacent sections so Business Review and exports
 * do not surface parser-scale “revisions” as first-class edits.
 */
export function mergeRecipientRedlineLowSignalFragments(vm: LegalRedlineDocumentViewModel): LegalRedlineDocumentViewModel {
  const { blocks } = vm;
  if (blocks.length < 2) return vm;

  const out: LegalRedlineBlock[] = [];
  let i = 0;
  while (i < blocks.length) {
    const b = blocks[i]!;
    if (isLowSignalFragmentBlock(b) && i + 1 < blocks.length) {
      out.push(combineAdjacentBlocks(b, blocks[i + 1]!));
      i += 2;
      continue;
    }
    if (isLowSignalFragmentBlock(b) && out.length > 0) {
      out[out.length - 1] = combineAdjacentBlocks(out[out.length - 1]!, b);
      i++;
      continue;
    }
    out.push(b);
    i++;
  }

  if (out.length === blocks.length) return vm;
  const stats = recomputeStats(out, vm.stats.currentLen, vm.stats.proposedLen);
  const hasChanges = out.some((blk) => blk.hasChange);
  return { ...vm, blocks: out, stats, hasChanges };
}

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

/**
 * Post-diff pass: clause equivalence + explicit {@link LegalRedlineBlock.isMeaningfullyChanged}
 * (prefer false positives over false negatives for signer trust).
 */

import type { LegalRedlineBlock, LegalRedlineBlockKind, LegalRedlineDocumentViewModel } from "./legalRedlineBlocks";
import { recomputeLegalRedlineBlock, withReplacedLegalRedlineBlocks } from "./legalRedlineBlocks";
import {
  areClausesSemanticallyEquivalent,
  materialObligationExpansionLikely,
} from "./recipientClauseEquivalence";

const HEAD_KINDS = new Set<LegalRedlineBlockKind>(["heading", "title"]);
const BODY_KINDS = new Set<LegalRedlineBlockKind>(["clause", "paragraph", "bullet"]);

export function recipientBlockShowsRedline(b: LegalRedlineBlock): boolean {
  if (b.isMeaningfullyChanged !== undefined) return Boolean(b.isMeaningfullyChanged);
  return b.hasChange;
}

function plainFromSegmentsCurrent(block: LegalRedlineBlock): string {
  if (String(block.currentText ?? "").trim()) return String(block.currentText);
  return block.segments
    .filter((s) => s.type !== "insert")
    .map((s) => s.text)
    .join("");
}

function plainFromSegmentsProposed(block: LegalRedlineBlock): string {
  if (String(block.proposedText ?? "").trim()) return String(block.proposedText);
  return block.segments
    .filter((s) => s.type !== "delete")
    .map((s) => s.text)
    .join("");
}

function collapseBlockToEquivalentSame(block: LegalRedlineBlock, canonical: string): LegalRedlineBlock {
  const text = canonical.trim() || "\u00a0";
  const next = recomputeLegalRedlineBlock(block, [{ type: "same", text }]);
  return {
    ...next,
    currentText: text,
    proposedText: text,
    isMeaningfullyChanged: false,
  };
}

function classifyNonHeadingBlock(block: LegalRedlineBlock): LegalRedlineBlock {
  if (!block.hasChange) {
    return { ...block, isMeaningfullyChanged: false };
  }
  const cur = plainFromSegmentsCurrent(block).trim();
  const prop = plainFromSegmentsProposed(block).trim();
  if (
    areClausesSemanticallyEquivalent(cur, prop) &&
    !materialObligationExpansionLikely(cur, prop)
  ) {
    const canon = prop.length >= cur.length ? prop : cur;
    return collapseBlockToEquivalentSame(block, canon || cur || prop);
  }
  return { ...block, isMeaningfullyChanged: true };
}

function anyMeaningfulBodyBelow(blocks: readonly LegalRedlineBlock[], startIdx: number): boolean {
  for (let j = startIdx + 1; j < blocks.length; j++) {
    const nb = blocks[j]!;
    if (HEAD_KINDS.has(nb.kind)) break;
    if (BODY_KINDS.has(nb.kind) && nb.isMeaningfullyChanged) return true;
  }
  return false;
}

function classifyHeadingBlock(block: LegalRedlineBlock, blocks: readonly LegalRedlineBlock[], idx: number): LegalRedlineBlock {
  if (!block.hasChange) {
    return { ...block, isMeaningfullyChanged: false };
  }
  const cur = plainFromSegmentsCurrent(block).trim();
  const prop = plainFromSegmentsProposed(block).trim();
  const bodiesMeaningful = anyMeaningfulBodyBelow(blocks, idx);

  if (!bodiesMeaningful) {
    const canon = (prop || cur).trim() || "\u00a0";
    return collapseBlockToEquivalentSame(block, canon);
  }

  if (
    areClausesSemanticallyEquivalent(cur, prop) &&
    !materialObligationExpansionLikely(cur, prop)
  ) {
    return collapseBlockToEquivalentSame(block, (prop || cur).trim() || "\u00a0");
  }
  return { ...block, isMeaningfullyChanged: true };
}

/**
 * Runs normalization + equivalence on each block, collapses non-material diffs,
 * and assigns {@link LegalRedlineBlock.isMeaningfullyChanged} for gating UI/PDF.
 */
export function applyRecipientMeaningfulChangePass(vm: LegalRedlineDocumentViewModel): LegalRedlineDocumentViewModel {
  if (!vm.blocks.length) return vm;

  let blocks: LegalRedlineBlock[] = vm.blocks.map((b) =>
    HEAD_KINDS.has(b.kind) ? { ...b } : classifyNonHeadingBlock({ ...b }),
  );
  blocks = blocks.map((b, i) => (HEAD_KINDS.has(b.kind) ? classifyHeadingBlock(b, blocks, i) : b));

  return withReplacedLegalRedlineBlocks(vm, blocks);
}

/** True when insert/delete segments carry visible diff characters (for “advanced markup” disclosure). */
export function recipientBlockHasInlineMarkupDiff(block: LegalRedlineBlock): boolean {
  return block.segments.some(
    (s) =>
      (s.type === "insert" || s.type === "delete") && String(s.text).replace(/\s+/g, "").length > 0,
  );
}

/** Share of `clause` blocks that are precision redline targets (for PDF / whole-doc gating). */
export function recipientClauseMeaningfulMaterialRatio(vm: LegalRedlineDocumentViewModel): number {
  const clauses = vm.blocks.filter((b) => b.kind === "clause");
  if (!clauses.length) return 0;
  return clauses.filter((b) => recipientBlockShowsRedline(b)).length / clauses.length;
}

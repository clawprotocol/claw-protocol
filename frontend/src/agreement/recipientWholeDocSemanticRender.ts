/**
 * Negotiation-oriented redline presentation: clause-level prior/revised panels where helpful,
 * with whole-document "replacement mode" reserved for rare catastrophic rewrites.
 */

import type { LegalRedlineBlock, LegalRedlineDocumentViewModel } from "./legalRedlineBlocks";
import { recipientBlockShowsRedline } from "./recipientMeaningfulRedlinePass";

export type RecipientRedlineSemanticRenderMode = "inline_edit" | "whole_section_replacement";

export type RecipientSemanticBlockStyle = "inline" | "before_after";

export type RecipientSemanticRedlinePresentation = {
  mode: RecipientRedlineSemanticRenderMode;
  blockStyle: ReadonlyMap<string, RecipientSemanticBlockStyle>;
  beforeAfterBlockIds: readonly string[];
  /** True when revised plain text is much shorter than baseline (e.g. memo vs full agreement). */
  shortRevisedVsLongBaseline: boolean;
};

function nonSameSegmentCount(block: LegalRedlineBlock): number {
  return block.segments.filter((s) => s.type !== "same").length;
}

function nonSameMass(block: LegalRedlineBlock): number {
  return block.segments
    .filter((s) => s.type !== "same")
    .reduce((a, s) => a + String(s.text).replace(/\s+/g, " ").trim().length, 0);
}

function totalTextMass(block: LegalRedlineBlock): number {
  const cur = String(block.currentText ?? "").length;
  const prop = String(block.proposedText ?? "").length;
  if (cur + prop > 0) return cur + prop;
  return block.segments.reduce((a, s) => a + String(s.text).length, 0);
}

function wordTokenJaccard(a: string, b: string): number {
  const tokenize = (t: string) =>
    t
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2);
  const A = new Set(tokenize(a));
  const B = new Set(tokenize(b));
  if (A.size === 0 && B.size === 0) return 1;
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const w of A) {
    if (B.has(w)) inter++;
  }
  return inter / (A.size + B.size - inter);
}

function insertMass(block: LegalRedlineBlock): number {
  return block.segments.filter((s) => s.type === "insert").reduce((a, s) => a + String(s.text).length, 0);
}

function deleteMass(block: LegalRedlineBlock): number {
  return block.segments.filter((s) => s.type === "delete").reduce((a, s) => a + String(s.text).length, 0);
}

/** One-sided giant insert typical of mis-aligned “whole new doc” paste. */
function blockLooksLikeWholeDocumentBlob(block: LegalRedlineBlock): boolean {
  if (!block.hasChange) return false;
  const cur = String(block.currentText ?? "").trim().length;
  const prop = String(block.proposedText ?? "").trim().length;
  const ins = insertMass(block);
  const del = deleteMass(block);
  if (ins > 3500 && del < ins * 0.08) return true;
  if (cur > 400 && prop > cur * 2.2 && ins > del * 6) return true;
  return false;
}

/**
 * Sarah-style QA: short revised extract vs long original — avoid treating as whole-doc rewrite.
 */
export function recipientDocumentShortRevisedVsLongBaseline(vm: LegalRedlineDocumentViewModel): boolean {
  const c = Math.max(1, vm.stats.currentLen);
  const p = vm.stats.proposedLen;
  if (c < 2000) return false;
  return p < c * 0.4;
}

/**
 * Strict clause-scale rewrite (last resort for before/after at block level when baseline is short).
 */
export function blockQualifiesForBeforeAfterPanelStrict(block: LegalRedlineBlock): boolean {
  if (!block.hasChange || block.isMeaningfullyChanged === false || !recipientBlockShowsRedline(block)) return false;
  if (blockLooksLikeWholeDocumentBlob(block)) return false;
  const cur = String(block.currentText ?? "").trim();
  const prop = String(block.proposedText ?? "").trim();
  const alt = nonSameSegmentCount(block);
  const nsm = nonSameMass(block);
  const tot = Math.max(120, totalTextMass(block));
  const sameMass = block.segments.filter((s) => s.type === "same").reduce((a, s) => a + String(s.text).length, 0);
  const sameRatio = tot > 0 ? sameMass / tot : 0;

  if (cur.length > 500 && prop.length < cur.length * 0.32) return false;
  if (alt >= 10) return true;
  if (alt >= 6 && nsm / tot > 0.38) return true;
  if (cur.length > 160 && prop.length > 160 && wordTokenJaccard(cur, prop) < 0.4) return true;
  if (nsm > 260 && alt >= 6) return true;
  if (nsm > 80 && sameRatio < 0.58 && alt >= 3) return true;
  return false;
}

/**
 * Default clause-level prior/revised when the document is not a short-revised / mis-pair flood.
 */
export function blockQualifiesClausePriorRevisedPanel(
  block: LegalRedlineBlock,
  ctx: { shortRevisedVsLongBaseline: boolean },
): boolean {
  if (!block.hasChange || block.isMeaningfullyChanged === false || !recipientBlockShowsRedline(block)) return false;
  if (blockLooksLikeWholeDocumentBlob(block)) return false;
  if (ctx.shortRevisedVsLongBaseline) {
    return blockQualifiesForBeforeAfterPanelStrict(block);
  }
  const cur = String(block.currentText ?? "").trim();
  const prop = String(block.proposedText ?? "").trim();
  const alt = nonSameSegmentCount(block);
  const nsm = nonSameMass(block);
  if (nsm < 26 && alt < 3) return false;
  if (cur.length > 400 && prop.length < cur.length * 0.28) return false;
  if (alt >= 5 && nsm > 40) return true;
  if (cur.length > 90 && prop.length > 90 && wordTokenJaccard(cur, prop) < 0.52) return true;
  if (nsm > 55 && alt >= 2) return true;
  return blockQualifiesForBeforeAfterPanelStrict(block);
}

export function recipientSemanticAnchorForBlockId(blockId: string): string {
  return `semantic-${String(blockId).replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

export function recipientSemanticAnchorForBlock(block: LegalRedlineBlock): string {
  return recipientSemanticAnchorForBlockId(block.id);
}

export function blockPriorAndRevisedPlain(block: LegalRedlineBlock): { prior: string; revised: string } {
  const cur = String(block.currentText ?? "").trim();
  const prop = String(block.proposedText ?? "").trim();
  if (cur.length > 0 || prop.length > 0) {
    return {
      prior: cur.length > 0 ? cur : "—",
      revised: prop.length > 0 ? prop : "—",
    };
  }
  const del = block.segments
    .filter((s) => s.type === "delete")
    .map((s) => s.text)
    .join("");
  const ins = block.segments
    .filter((s) => s.type === "insert")
    .map((s) => s.text)
    .join("");
  return {
    prior: del.trim() || "—",
    revised: ins.trim() || "—",
  };
}

/**
 * Whole-document replacement mode is intentionally rare (~last resort).
 */
export function buildRecipientSemanticRedlinePresentation(
  vm: LegalRedlineDocumentViewModel,
): RecipientSemanticRedlinePresentation {
  const shortRev = recipientDocumentShortRevisedVsLongBaseline(vm);
  const blockStyle = new Map<string, RecipientSemanticBlockStyle>();
  const beforeAfter: string[] = [];
  let changed = 0;

  for (const b of vm.blocks) {
    if (!b.hasChange || !recipientBlockShowsRedline(b)) {
      blockStyle.set(b.id, "inline");
      continue;
    }
    changed++;
    const ba = blockQualifiesClausePriorRevisedPanel(b, { shortRevisedVsLongBaseline: shortRev });
    const style: RecipientSemanticBlockStyle = ba ? "before_after" : "inline";
    blockStyle.set(b.id, style);
    if (ba) beforeAfter.push(b.id);
  }

  const beforeAfterRatio = changed > 0 ? beforeAfter.length / changed : 0;
  const heavySegments = vm.stats.segmentCount >= 110 && vm.stats.insertCount + vm.stats.deleteCount >= 95;
  const fewChangedManyFragments = vm.stats.changedBlockCount <= 5 && vm.stats.segmentCount >= 68;
  const clauseBlocks = vm.blocks.filter((b) => b.kind === "clause");
  const meaningfulClauseShare =
    clauseBlocks.length > 0
      ? clauseBlocks.filter((b) => recipientBlockShowsRedline(b)).length / clauseBlocks.length
      : 0;

  let mode: RecipientRedlineSemanticRenderMode = "inline_edit";
  if (
    !shortRev &&
    !fewChangedManyFragments &&
    beforeAfter.length >= 8 &&
    beforeAfterRatio >= 0.62 &&
    meaningfulClauseShare >= 0.58 &&
    heavySegments &&
    (Boolean(vm.fallbackReason?.trim()) || vm.stats.changedBlockCount >= 12)
  ) {
    mode = "whole_section_replacement";
  }

  return {
    mode,
    blockStyle,
    beforeAfterBlockIds: beforeAfter,
    shortRevisedVsLongBaseline: shortRev,
  };
}

/**
 * Negotiation-oriented redline presentation: distinguish heavy whole-section rewrites
 * from small inline edits so UI + PDF stay readable (not raw OCR-style interleaves).
 */

import type { LegalRedlineBlock, LegalRedlineDocumentViewModel } from "./legalRedlineBlocks";

export type RecipientRedlineSemanticRenderMode = "inline_edit" | "whole_section_replacement";

export type RecipientSemanticBlockStyle = "inline" | "before_after";

export type RecipientSemanticRedlinePresentation = {
  mode: RecipientRedlineSemanticRenderMode;
  /** How each block should render when `mode` is negotiated (per-block may still be inline). */
  blockStyle: ReadonlyMap<string, RecipientSemanticBlockStyle>;
  /** Changed blocks rendered as prior/revised panels (subset of all blocks). */
  beforeAfterBlockIds: readonly string[];
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

/**
 * True when literal line-level diff is likely noise vs a clean prior/revised pair.
 */
export function blockQualifiesForBeforeAfterPanel(block: LegalRedlineBlock): boolean {
  if (!block.hasChange) return false;
  const cur = String(block.currentText ?? "").trim();
  const prop = String(block.proposedText ?? "").trim();
  const alt = nonSameSegmentCount(block);
  const nsm = nonSameMass(block);
  const tot = Math.max(120, totalTextMass(block));
  const sameMass = block.segments.filter((s) => s.type === "same").reduce((a, s) => a + String(s.text).length, 0);
  const sameRatio = tot > 0 ? sameMass / tot : 0;

  if (alt >= 8) return true;
  if (alt >= 4 && nsm / tot > 0.36) return true;
  if (alt >= 2 && cur.length > 90 && prop.length > 90 && wordTokenJaccard(cur, prop) < 0.48) return true;
  if (cur.length > 140 && prop.length > 140 && wordTokenJaccard(cur, prop) < 0.42) return true;
  if (nsm > 220 && alt >= 5) return true;
  /** Clause-scale rewrite: little literal overlap but large non-same mass vs retained boilerplate. */
  if (nsm > 55 && sameRatio < 0.62 && alt >= 2) return true;
  return false;
}

/** Stable DOM / scroll anchor for a parsed redline block. */
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
 * Builds a presentation plan for the legal redline document.
 * When {@link RecipientRedlineSemanticRenderMode} is `whole_section_replacement`, prefer
 * stacked prior/revised panels for qualifying changed blocks to avoid duplicated headings
 * in inline strike/insert streams.
 */
export function buildRecipientSemanticRedlinePresentation(
  vm: LegalRedlineDocumentViewModel,
): RecipientSemanticRedlinePresentation {
  const blockStyle = new Map<string, RecipientSemanticBlockStyle>();
  const beforeAfter: string[] = [];
  let changed = 0;

  for (const b of vm.blocks) {
    if (!b.hasChange) {
      blockStyle.set(b.id, "inline");
      continue;
    }
    changed++;
    const ba = blockQualifiesForBeforeAfterPanel(b);
    const style: RecipientSemanticBlockStyle = ba ? "before_after" : "inline";
    blockStyle.set(b.id, style);
    if (ba) beforeAfter.push(b.id);
  }

  const beforeAfterRatio = changed > 0 ? beforeAfter.length / changed : 0;
  const docChurn =
    vm.stats.segmentCount >= 48 &&
    vm.stats.changedBlockCount >= 6 &&
    vm.stats.insertCount + vm.stats.deleteCount >= 28;

  const multiClauseRewrite =
    changed >= 3 &&
    beforeAfter.length >= 2 &&
    vm.stats.insertCount + vm.stats.deleteCount >= 14;

  const mode: RecipientRedlineSemanticRenderMode =
    beforeAfter.length >= 3 ||
    beforeAfterRatio >= 0.42 ||
    (docChurn && beforeAfter.length >= 2) ||
    multiClauseRewrite ||
    (Boolean(vm.fallbackReason?.trim()) && beforeAfter.length >= 1 && vm.stats.changedBlockCount >= 10)
      ? "whole_section_replacement"
      : "inline_edit";

  if (mode === "whole_section_replacement") {
    for (const b of vm.blocks) {
      if (!b.hasChange) continue;
      if (nonSameMass(b) >= 40) {
        blockStyle.set(b.id, "before_after");
        if (!beforeAfter.includes(b.id)) beforeAfter.push(b.id);
      }
    }
  }

  return {
    mode,
    blockStyle,
    beforeAfterBlockIds: beforeAfter,
  };
}

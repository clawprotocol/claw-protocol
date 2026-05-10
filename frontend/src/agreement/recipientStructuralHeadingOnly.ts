/**
 * Detects heading / section-label blocks that must not surface as material redline
 * when only formatting or duplicate PDF headers differ, or when the following body is unchanged.
 */

import type { LegalRedlineBlock, LegalRedlineBlockKind } from "./legalRedlineBlocks";

const LAWDOG_OR_PAGE_LINE = /(created\s+with\s+lawdog|draft\s+for\s+review|page\s+\d+\s+of\s+\d+)/i;

/** Exported for tests and alignment heuristics. */
export function stripRecipientStructuralNoiseLines(text: string): string {
  return String(text ?? "")
    .split(/\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !LAWDOG_OR_PAGE_LINE.test(l))
    .join("\n")
    .trim();
}

const MAX_STRUCTURAL_CHARS = 240;
const MAX_STRUCTURAL_LINES = 4;

function isTitleCasedHeadingWords(s: string): boolean {
  const w = s.trim().split(/\s+/).filter(Boolean);
  if (w.length === 0 || w.length > 12 || s.length > 88) return false;
  if (/\b(shall|must|will|may|agrees?|including|within|days?|party|parties|hereby|notwithstanding)\b/i.test(s)) {
    return false;
  }
  if (/\d/.test(s)) return false;
  for (const t of w) {
    const ok = /^[A-Z][a-zA-Z.'-]*$/.test(t) || /^(and|or|the|of|for|to|in|a|an|on|at|by)$/i.test(t);
    if (!ok) return false;
  }
  return true;
}

/**
 * True when plain text is only a structural heading / section label (no substantive clause body).
 * Used before diff alignment and in the meaningful-change pass.
 */
export function isStructuralHeadingOnlyPlainText(
  raw: string,
  meta: { kind: LegalRedlineBlockKind | string; clauseNumber?: string },
): boolean {
  if (meta.clauseNumber) return false;
  const k = String(meta.kind);
  if (k === "title" || k === "heading") return true;
  if (k !== "paragraph" && k !== "bullet") return false;

  const t = stripRecipientStructuralNoiseLines(raw);
  if (!t) return false;
  if (t.length > MAX_STRUCTURAL_CHARS) return false;
  const lines = t.split(/\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0 || lines.length > MAX_STRUCTURAL_LINES) return false;

  const first = lines[0]!;
  if (/^background\s+and\s+purpose$/i.test(first) && lines.length <= 2) return true;
  if (/^definitions?$/i.test(first)) return true;
  if (/^recitals?$/i.test(first)) return true;
  if (/^whereas$/i.test(first)) return true;
  if (/^schedule\s+[a-z0-9]+\b/i.test(first)) return true;
  if (/^exhibit\s+[a-z0-9]+\b/i.test(first)) return true;

  if (lines.length >= 2 && lines.every((l) => l === lines[0])) return true;

  const allCaps = /^[A-Z0-9][A-Z0-9\s,.'&-]{8,}$/;
  if (lines.length <= 2 && allCaps.test(first) && first === first.toUpperCase()) return true;

  if (lines.length === 1 && !first.includes(".") && isTitleCasedHeadingWords(first)) return true;

  return false;
}

export function isStructuralHeadingOnlyParsedPlain(pb: {
  kind: LegalRedlineBlockKind;
  clauseNumber?: string;
  rawText: string;
}): boolean {
  return isStructuralHeadingOnlyPlainText(pb.rawText, { kind: pb.kind, clauseNumber: pb.clauseNumber });
}

function mergedPlainForStructuralProbe(block: LegalRedlineBlock): string {
  const cur =
    String(block.currentText ?? "").trim() ||
    block.segments
      .filter((s) => s.type !== "insert")
      .map((s) => s.text)
      .join("");
  const prop =
    String(block.proposedText ?? "").trim() ||
    block.segments
      .filter((s) => s.type !== "delete")
      .map((s) => s.text)
      .join("");
  if (cur && prop) return `${cur}\n\n${prop}`;
  return (cur || prop).trim();
}

/** Whether this block should be treated like a heading for material-redline gating. */
export function isStructuralHeadingOnlyBlock(block: LegalRedlineBlock): boolean {
  if (block.clauseNumber) return false;
  if (block.kind === "title" || block.kind === "heading") return true;
  if (block.kind !== "paragraph" && block.kind !== "bullet") return false;
  return isStructuralHeadingOnlyPlainText(mergedPlainForStructuralProbe(block), {
    kind: block.kind,
    clauseNumber: block.clauseNumber,
  });
}

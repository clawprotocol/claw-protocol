/**
 * Clause/block-aware whole-document legal redline: parse → align → per-block word diff.
 */

import { buildAgreementRedline, type RedlineSegment } from "../vs01/agreementRedline";

export type LegalRedlineBlockKind =
  | "title"
  | "heading"
  | "clause"
  | "paragraph"
  | "bullet"
  | "signature"
  | "footer";

export type LegalRedlineSegment = {
  type: "same" | "insert" | "delete";
  text: string;
};

export type LegalRedlineBlock = {
  id: string;
  kind: LegalRedlineBlockKind;
  clauseNumber?: string;
  /** First line / short label for UI. */
  heading?: string;
  /** Display label (clause + heading when useful). */
  label?: string;
  currentText?: string;
  proposedText?: string;
  segments: LegalRedlineSegment[];
  /** Per-block segment-type counts. */
  insertCount: number;
  deleteCount: number;
  sameCount: number;
  hasInsert: boolean;
  hasDelete: boolean;
  hasChange: boolean;
  /** Reserved for per-block instruction-gap hints (future); default false. */
  requestedButNotReflected?: boolean;
};

export type LegalRedlineDocumentViewModel = {
  blocks: LegalRedlineBlock[];
  stats: {
    blockCount: number;
    changedBlockCount: number;
    insertCount: number;
    deleteCount: number;
    sameCount: number;
    segmentCount: number;
    currentLen: number;
    proposedLen: number;
  };
  hasChanges: boolean;
  fallbackReason?: string;
  /** Reviewer requests not evidenced in the proposal (e.g. instruction capture gaps). */
  requestedNotReflectedCount?: number;
};

export type ParsedPlainBlock = {
  kind: LegalRedlineBlockKind;
  clauseNumber?: string;
  headingLine: string;
  rawText: string;
  sourceIndex: number;
};

const SIGNATURE_RE = /^(IN\s+WITNESS\s+WHEREOF|IN\s+WITNESS|WITNESS\s+WHEREOF|Signature|Signatures)\b/i;
const FOOTER_RE = /^(Page\s+\d+\s+of\s+\d+|©|\(C\)|CONFIDENTIAL)/i;

export function normalizeNewlinesForLegalRedline(s: string): string {
  return String(s ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\u00a0/g, " ");
}

export function normalizeClauseNumberKey(n: string): string {
  return n.replace(/-/g, ".").replace(/\)+$/, "").trim();
}

export function extractClauseNumberFromFirstLine(line: string): string | undefined {
  const t = line.trim();
  if (!t) return undefined;
  const dotted = t.match(/^(\d+(?:\.\d+)+)\s+\S/);
  if (dotted) return normalizeClauseNumberKey(dotted[1]!);
  const dashed = t.match(/^(\d+(?:-\d+)+)\s+\S/);
  if (dashed) return normalizeClauseNumberKey(dashed[1]!.replace(/-/g, "."));
  const single = t.match(/^(\d+)\s+[A-Za-z"']/);
  if (single) return normalizeClauseNumberKey(single[1]!);
  const singleDot = t.match(/^(\d+)\.\s+\S/);
  if (singleDot) return normalizeClauseNumberKey(singleDot[1]!);
  return undefined;
}

function normHeadingKey(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

function classifyKind(firstLine: string, chunkIndex: number): LegalRedlineBlockKind {
  const fl = firstLine.trim();
  if (!fl) return "paragraph";
  if (SIGNATURE_RE.test(fl)) return "signature";
  if (FOOTER_RE.test(fl)) return "footer";
  if (/^\s*([•\*\-]|\d+[\.)])\s/.test(fl)) return "bullet";
  if (/^(article|section)\s+/i.test(fl) && extractClauseNumberFromFirstLine(firstLine) === undefined) return "heading";
  if (extractClauseNumberFromFirstLine(firstLine) !== undefined) return "clause";
  if (chunkIndex === 0 && fl.length <= 160 && !/^[\d.]/.test(fl)) return "title";
  return "paragraph";
}

export function parsePlainTextIntoLegalBlocks(text: string): ParsedPlainBlock[] {
  const norm = normalizeNewlinesForLegalRedline(text);
  const chunks = norm.split(/\n\n+/);
  const out: ParsedPlainBlock[] = [];
  let sourceIndex = 0;
  for (let i = 0; i < chunks.length; i++) {
    const rawText = chunks[i] ?? "";
    if (!rawText.trim()) continue;
    const firstLine = rawText.split("\n")[0] ?? "";
    const clause = extractClauseNumberFromFirstLine(firstLine);
    const kind = classifyKind(firstLine, out.length === 0 ? 0 : 1);
    out.push({
      kind,
      clauseNumber: clause,
      headingLine: firstLine.trim(),
      rawText,
      sourceIndex: sourceIndex++,
    });
  }
  return out;
}

function mapSegments(segs: RedlineSegment[]): LegalRedlineSegment[] {
  return segs.map((s) => ({ type: s.type, text: s.text }));
}

function blockHasMaterialChange(segments: LegalRedlineSegment[]): boolean {
  return segments.some((s) => (s.type !== "same" && s.text.replace(/\s+/g, " ").trim().length > 0));
}

function meaningfulNonSameSegment(text: string): boolean {
  return text.replace(/\s+/g, "").length > 0;
}

function countSegmentTypes(segments: LegalRedlineSegment[]): {
  insertCount: number;
  deleteCount: number;
  sameCount: number;
} {
  let insertCount = 0;
  let deleteCount = 0;
  let sameCount = 0;
  for (const s of segments) {
    if (s.type === "insert") insertCount++;
    else if (s.type === "delete") deleteCount++;
    else sameCount++;
  }
  return { insertCount, deleteCount, sameCount };
}

function aggregateStats(
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
    const c = countSegmentTypes(b.segments);
    insertCount += c.insertCount;
    deleteCount += c.deleteCount;
    sameCount += c.sameCount;
    segmentCount += b.segments.length;
    if (blockHasMaterialChange(b.segments)) changedBlockCount++;
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

function enrichAlignedBlock(block: Omit<LegalRedlineBlock, "insertCount" | "deleteCount" | "sameCount" | "hasInsert" | "hasDelete" | "hasChange" | "label">): LegalRedlineBlock {
  const counts = countSegmentTypes(block.segments);
  const hasInsert = block.segments.some((s) => s.type === "insert" && meaningfulNonSameSegment(s.text));
  const hasDelete = block.segments.some((s) => s.type === "delete" && meaningfulNonSameSegment(s.text));
  const hasChange = hasInsert || hasDelete;
  const labelParts = [block.clauseNumber ? String(block.clauseNumber) : "", block.heading ?? ""].filter(
    (x) => !!x && String(x).trim(),
  );
  const computedLabel = labelParts.length > 0 ? labelParts.join(" — ") : block.heading;
  return {
    ...block,
    insertCount: counts.insertCount,
    deleteCount: counts.deleteCount,
    sameCount: counts.sameCount,
    hasInsert,
    hasDelete,
    hasChange,
    label: computedLabel?.trim() || block.heading,
    requestedButNotReflected: false,
  };
}

function detectFallbackReason(blocks: LegalRedlineBlock[]): string | undefined {
  for (const b of blocks) {
    const s = b.segments;
    if (
      s.length === 2 &&
      s[0]?.type === "delete" &&
      s[1]?.type === "insert" &&
      (s[0].text.length > 6000 || s[1].text.length > 6000)
    ) {
      return "Very large single replacement in one section — shown as one removal and one addition.";
    }
  }
  return undefined;
}

function makeBlockId(prefix: string, i: number): string {
  return `${prefix}_${i}`;
}

function clauseKeysEqual(a?: string, b?: string): boolean {
  if (!a || !b) return false;
  return normalizeClauseNumberKey(a) === normalizeClauseNumberKey(b);
}

export function alignParsedBlocksToLegalRedline(
  currentBlocks: ParsedPlainBlock[],
  proposedBlocks: ParsedPlainBlock[],
): LegalRedlineBlock[] {
  const usedCurrent = new Set<number>();
  const out: LegalRedlineBlock[] = [];
  let outIdx = 0;

  const nextUnusedCurrentWithClause = (clause: string): ParsedPlainBlock | undefined => {
    for (const ca of currentBlocks) {
      if (usedCurrent.has(ca.sourceIndex)) continue;
      if (ca.clauseNumber && clauseKeysEqual(ca.clauseNumber, clause)) return ca;
    }
    return undefined;
  };

  const nextUnusedCurrentUnnumberedMatching = (pb: ParsedPlainBlock): ParsedPlainBlock | undefined => {
    const key = normHeadingKey(pb.headingLine);
    if (!key) return undefined;
    for (const ca of currentBlocks) {
      if (usedCurrent.has(ca.sourceIndex)) continue;
      if (ca.clauseNumber) continue;
      if (normHeadingKey(ca.headingLine) === key) return ca;
    }
    return undefined;
  };

  const nextUnusedCurrentUnnumbered = (): ParsedPlainBlock | undefined => {
    for (const ca of currentBlocks) {
      if (usedCurrent.has(ca.sourceIndex)) continue;
      if (!ca.clauseNumber) return ca;
    }
    return undefined;
  };

  for (const pb of proposedBlocks) {
    if (pb.clauseNumber) {
      const ca = nextUnusedCurrentWithClause(pb.clauseNumber);
      if (ca) {
        usedCurrent.add(ca.sourceIndex);
        const rl = buildAgreementRedline(ca.rawText, pb.rawText);
        out.push(
          enrichAlignedBlock({
            id: makeBlockId("m", outIdx++),
            kind: pb.kind,
            clauseNumber: pb.clauseNumber ?? ca.clauseNumber,
            heading: pb.headingLine || ca.headingLine,
            currentText: ca.rawText,
            proposedText: pb.rawText,
            segments: mapSegments(rl.segments),
          }),
        );
      } else {
        const rl = buildAgreementRedline("", pb.rawText);
        out.push(
          enrichAlignedBlock({
            id: makeBlockId("i", outIdx++),
            kind: pb.kind,
            clauseNumber: pb.clauseNumber,
            heading: pb.headingLine,
            proposedText: pb.rawText,
            segments: mapSegments(rl.segments),
          }),
        );
      }
      continue;
    }

    const ca = nextUnusedCurrentUnnumberedMatching(pb) ?? nextUnusedCurrentUnnumbered();
    if (ca && !ca.clauseNumber) {
      usedCurrent.add(ca.sourceIndex);
      const rl = buildAgreementRedline(ca.rawText, pb.rawText);
      out.push(
        enrichAlignedBlock({
          id: makeBlockId("m", outIdx++),
          kind: pb.kind,
          clauseNumber: pb.clauseNumber ?? ca.clauseNumber,
          heading: pb.headingLine || ca.headingLine,
          currentText: ca.rawText,
          proposedText: pb.rawText,
          segments: mapSegments(rl.segments),
        }),
      );
    } else {
      const rl = buildAgreementRedline("", pb.rawText);
      out.push(
        enrichAlignedBlock({
          id: makeBlockId("i", outIdx++),
          kind: pb.kind,
          clauseNumber: pb.clauseNumber,
          heading: pb.headingLine,
          proposedText: pb.rawText,
          segments: mapSegments(rl.segments),
        }),
      );
    }
  }

  for (const ca of currentBlocks) {
    if (usedCurrent.has(ca.sourceIndex)) continue;
    const rl = buildAgreementRedline(ca.rawText, "");
    out.push(
      enrichAlignedBlock({
        id: makeBlockId("d", outIdx++),
        kind: ca.kind,
        clauseNumber: ca.clauseNumber,
        heading: ca.headingLine,
        currentText: ca.rawText,
        segments: mapSegments(rl.segments),
      }),
    );
  }

  return out;
}

export function buildLegalRedlineDocumentViewModel(
  currentPlainText: string,
  proposedPlainText: string,
): LegalRedlineDocumentViewModel {
  const cur = normalizeNewlinesForLegalRedline(currentPlainText);
  const prop = normalizeNewlinesForLegalRedline(proposedPlainText);
  const a = parsePlainTextIntoLegalBlocks(cur);
  const b = parsePlainTextIntoLegalBlocks(prop);
  const blocks = alignParsedBlocksToLegalRedline(a, b);
  const stats = aggregateStats(blocks, cur.length, prop.length);
  const hasChanges = blocks.some((b) => blockHasMaterialChange(b.segments));
  return {
    blocks,
    stats,
    hasChanges,
    fallbackReason: detectFallbackReason(blocks),
  };
}

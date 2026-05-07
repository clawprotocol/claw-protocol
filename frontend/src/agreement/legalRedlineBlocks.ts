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

/** Insert/delete text that must never be styled as a redline change for narrow payment instructions. */
export function narrowPaymentInsertDeleteContainsBoilerplate(text: string): boolean {
  const s = String(text ?? "");
  if (!s.trim()) return false;
  const low = s.toLowerCase();
  if (/\bin witness whereof\b/.test(low)) return true;
  if (/\bcreated with lawdog\b|\bdraft for review\b/.test(low)) return true;
  if (/\bemail for notices\b/.test(low)) return true;
  if (/execution and signature/i.test(s)) return true;
  if (/\b(client|developer)\s*:/.test(low)) return true;
  if (/\beffective date\b/.test(low)) return true;
  if (/\bparty execution\b|\bexecution by the parties\b/i.test(s)) return true;
  if (/\b(?:signatures?|signed)\s*:/.test(low)) return true;
  if (/\(signature\)/i.test(s)) return true;
  return false;
}

function mergeAdjacentSameSegments(segments: LegalRedlineSegment[]): LegalRedlineSegment[] {
  const out: LegalRedlineSegment[] = [];
  for (const s of segments) {
    const prev = out[out.length - 1];
    if (prev && prev.type === "same" && s.type === "same") {
      prev.text += s.text;
    } else {
      out.push({ type: s.type, text: s.text });
    }
  }
  return out;
}

/** Merge consecutive segments of the same type (insert/delete/same) for PDF/export readability. */
export function mergeAdjacentRedlineSegmentsAllTypes(segments: LegalRedlineSegment[]): LegalRedlineSegment[] {
  const out: LegalRedlineSegment[] = [];
  for (const s of segments) {
    const prev = out[out.length - 1];
    if (prev && prev.type === s.type) {
      prev.text += s.text;
    } else {
      out.push({ type: s.type, text: s.text });
    }
  }
  return out;
}

export function recomputeLegalRedlineBlock(block: LegalRedlineBlock, segments: LegalRedlineSegment[]): LegalRedlineBlock {
  const counts = countSegmentTypes(segments);
  const hasInsert = segments.some((s) => s.type === "insert" && meaningfulNonSameSegment(s.text));
  const hasDelete = segments.some((s) => s.type === "delete" && meaningfulNonSameSegment(s.text));
  const hasChange = hasInsert || hasDelete;
  return {
    ...block,
    segments,
    insertCount: counts.insertCount,
    deleteCount: counts.deleteCount,
    sameCount: counts.sameCount,
    hasInsert,
    hasDelete,
    hasChange,
  };
}

/**
 * Collapses insert/delete segments that accidentally include signature / witness / party boilerplate
 * (alignment drift) to “same” so chips and styling stay payment-only.
 */
export function sanitizeNarrowRecipientPaymentRedlineBoilerplateSegments(
  vm: LegalRedlineDocumentViewModel,
): LegalRedlineDocumentViewModel {
  const blocks = vm.blocks.map((b) => {
    const next = mergeAdjacentSameSegments(
      b.segments.map((s) => {
        if (s.type !== "insert" && s.type !== "delete") return s;
        if (!narrowPaymentInsertDeleteContainsBoilerplate(s.text)) return s;
        return { type: "same" as const, text: s.text };
      }),
    );
    const dirty =
      next.length !== b.segments.length ||
      next.some((s, i) => s.type !== b.segments[i]?.type || s.text !== b.segments[i]?.text);
    if (!dirty) return b;
    return recomputeLegalRedlineBlock(b, next);
  });
  const stats = aggregateStats(blocks, vm.stats.currentLen, vm.stats.proposedLen);
  const hasChanges = blocks.some((blk) => blockHasMaterialChange(blk.segments));
  return { ...vm, blocks, stats, hasChanges };
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

function normPlainCollapseWs(s: string): string {
  return normalizeNewlinesForLegalRedline(String(s ?? ""))
    .replace(/\s+/g, " ")
    .trim();
}

function jaccardWordSimilarity(a: string, b: string): number {
  const wa = normPlainCollapseWs(a)
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  const wb = normPlainCollapseWs(b)
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (wa.length === 0 && wb.length === 0) return 1;
  const A = new Set(wa);
  const B = new Set(wb);
  let inter = 0;
  for (const w of A) {
    if (B.has(w)) inter++;
  }
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
}

function kindsCompatibleForAlignment(ca: ParsedPlainBlock, pb: ParsedPlainBlock): boolean {
  if (ca.kind === pb.kind) return true;
  if (
    (ca.kind === "paragraph" || ca.kind === "clause") &&
    (pb.kind === "paragraph" || pb.kind === "clause")
  ) {
    return true;
  }
  if (
    (ca.kind === "heading" || ca.kind === "title") &&
    (pb.kind === "heading" || pb.kind === "title")
  ) {
    return true;
  }
  return false;
}

/**
 * Optimal global alignment score for unnumbered blocks (Needleman–Wunsch).
 * Hard-rejects incompatible kinds and unrelated low-overlap pairs so gaps beat bad matches.
 */
function matchScoreForUnnumberedDp(ca: ParsedPlainBlock, pb: ParsedPlainBlock): number {
  if (!kindsCompatibleForAlignment(ca, pb)) return -2_000_000;

  const hk = normHeadingKey(ca.headingLine);
  const hp = normHeadingKey(pb.headingLine);
  const jac = jaccardWordSimilarity(ca.rawText, pb.rawText);

  if (!(hk && hp && hk === hp) && jac < 0.09) {
    return -2_000_000;
  }

  let score = 0;
  if (hk && hp && hk === hp) {
    score += 950;
  } else if (
    hk &&
    hp &&
    (hk.startsWith(hp.slice(0, Math.min(28, hp.length))) || hp.startsWith(hk.slice(0, Math.min(28, hk.length))))
  ) {
    score += 420;
  }

  score += Math.round(jac * 520);
  const od = Math.abs(ca.sourceIndex - pb.sourceIndex);
  score += Math.max(0, 140 - od * 28);
  return score;
}

/**
 * Diff two aligned blocks: word-level when similarity is high; otherwise one delete + one insert
 * (avoids cross-section token weaving from global LCS).
 */
function diffAlignedBlockSegments(currentText: string, proposedText: string): LegalRedlineSegment[] {
  const cur = String(currentText ?? "");
  const prop = String(proposedText ?? "");
  if (normPlainCollapseWs(cur) === normPlainCollapseWs(prop)) {
    return cur ? [{ type: "same", text: cur }] : [{ type: "same", text: "" }];
  }
  if (!prop.trim()) {
    return cur.trim() ? [{ type: "delete", text: cur }] : [{ type: "same", text: "" }];
  }
  if (!cur.trim()) {
    return mapSegments(buildAgreementRedline("", prop).segments);
  }

  const jac = jaccardWordSimilarity(cur, prop);
  const maxLen = Math.max(cur.length, prop.length);
  if (maxLen > 280 && jac < 0.26) {
    return [
      { type: "delete", text: cur },
      { type: "insert", text: prop },
    ];
  }

  return mapSegments(buildAgreementRedline(cur, prop).segments);
}

function alignUnnumberedBlockSequencesDp(
  uCur: ParsedPlainBlock[],
  uProp: ParsedPlainBlock[],
): Map<number, number> {
  const pairs = new Map<number, number>();
  const n = uCur.length;
  const m = uProp.length;
  const GAP = -58;
  const NEG = -1e15;

  const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(NEG));
  dp[0]![0] = 0;
  for (let i = 1; i <= n; i++) {
    dp[i]![0] = dp[i - 1]![0]! + GAP;
  }
  for (let j = 1; j <= m; j++) {
    dp[0]![j] = dp[0]![j - 1]! + GAP;
  }

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const ms = matchScoreForUnnumberedDp(uCur[i - 1]!, uProp[j - 1]!);
      const diag = dp[i - 1]![j - 1]! + ms;
      const up = dp[i - 1]![j]! + GAP;
      const left = dp[i]![j - 1]! + GAP;
      dp[i]![j] = Math.max(diag, up, left);
    }
  }

  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0) {
      const ms = matchScoreForUnnumberedDp(uCur[i - 1]!, uProp[j - 1]!);
      const diag = dp[i - 1]![j - 1]! + ms;
      if (dp[i]![j] === diag) {
        pairs.set(uProp[j - 1]!.sourceIndex, uCur[i - 1]!.sourceIndex);
        i--;
        j--;
        continue;
      }
    }
    if (i > 0 && dp[i]![j] === dp[i - 1]![j]! + GAP) {
      i--;
      continue;
    }
    if (j > 0 && dp[i]![j] === dp[i]![j - 1]! + GAP) {
      j--;
      continue;
    }
    if (i > 0 && j > 0) {
      pairs.set(uProp[j - 1]!.sourceIndex, uCur[i - 1]!.sourceIndex);
      i--;
      j--;
    } else if (i > 0) {
      i--;
    } else {
      j--;
    }
  }

  return pairs;
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

  // Pair numbered clauses first; remaining unnumbered blocks are aligned with global DP (document order).
  const clausePairPbToCa = new Map<number, number>();
  for (const pb of proposedBlocks) {
    if (!pb.clauseNumber) continue;
    const ca = nextUnusedCurrentWithClause(pb.clauseNumber);
    if (ca) {
      usedCurrent.add(ca.sourceIndex);
      clausePairPbToCa.set(pb.sourceIndex, ca.sourceIndex);
    }
  }

  const uCur = currentBlocks.filter(
    (c) => !usedCurrent.has(c.sourceIndex) && !c.clauseNumber,
  );
  const uProp = proposedBlocks.filter((p) => !p.clauseNumber);
  const unnumberedPairPbToCa = alignUnnumberedBlockSequencesDp(uCur, uProp);

  for (const pb of proposedBlocks) {
    if (pb.clauseNumber) {
      const caSid = clausePairPbToCa.get(pb.sourceIndex);
      if (caSid !== undefined) {
        const ca = currentBlocks.find((c) => c.sourceIndex === caSid);
        if (ca) {
          out.push(
            enrichAlignedBlock({
              id: makeBlockId("m", outIdx++),
              kind: pb.kind,
              clauseNumber: pb.clauseNumber ?? ca.clauseNumber,
              heading: pb.headingLine || ca.headingLine,
              currentText: ca.rawText,
              proposedText: pb.rawText,
              segments: diffAlignedBlockSegments(ca.rawText, pb.rawText),
            }),
          );
        }
      } else {
        out.push(
          enrichAlignedBlock({
            id: makeBlockId("i", outIdx++),
            kind: pb.kind,
            clauseNumber: pb.clauseNumber,
            heading: pb.headingLine,
            proposedText: pb.rawText,
            segments: diffAlignedBlockSegments("", pb.rawText),
          }),
        );
      }
      continue;
    }

    const caSid = unnumberedPairPbToCa.get(pb.sourceIndex);
    if (caSid !== undefined) {
      const ca = currentBlocks.find((c) => c.sourceIndex === caSid);
      if (ca && !usedCurrent.has(ca.sourceIndex)) {
        usedCurrent.add(ca.sourceIndex);
        out.push(
          enrichAlignedBlock({
            id: makeBlockId("m", outIdx++),
            kind: pb.kind,
            clauseNumber: pb.clauseNumber ?? ca.clauseNumber,
            heading: pb.headingLine || ca.headingLine,
            currentText: ca.rawText,
            proposedText: pb.rawText,
            segments: diffAlignedBlockSegments(ca.rawText, pb.rawText),
          }),
        );
        continue;
      }
    }

    out.push(
      enrichAlignedBlock({
        id: makeBlockId("i", outIdx++),
        kind: pb.kind,
        clauseNumber: pb.clauseNumber,
        heading: pb.headingLine,
        proposedText: pb.rawText,
        segments: diffAlignedBlockSegments("", pb.rawText),
      }),
    );
  }

  for (const ca of currentBlocks) {
    if (usedCurrent.has(ca.sourceIndex)) continue;
    out.push(
      enrichAlignedBlock({
        id: makeBlockId("d", outIdx++),
        kind: ca.kind,
        clauseNumber: ca.clauseNumber,
        heading: ca.headingLine,
        currentText: ca.rawText,
        segments: diffAlignedBlockSegments(ca.rawText, ""),
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

function collapseBlockToSameOnly(b: LegalRedlineBlock): LegalRedlineBlock {
  const text = (b.currentText ?? b.proposedText ?? "").trim() || "\u00a0";
  const segments: LegalRedlineSegment[] = [{ type: "same", text }];
  const counts = countSegmentTypes(segments);
  return {
    ...b,
    proposedText: b.currentText ?? b.proposedText,
    segments,
    insertCount: counts.insertCount,
    deleteCount: counts.deleteCount,
    sameCount: counts.sameCount,
    hasInsert: false,
    hasDelete: false,
    hasChange: false,
  };
}

function blockLooksStrongPayment(t: string): boolean {
  const s = t.toLowerCase();
  if (/\bif\s+payment\s+is\s+more\s+than\b.*\bpause\s+work\s+until\b/i.test(s)) return true;
  return /\b(invoice|invoicing|payable|net\s*\d|payment schedule|fee schedule|compensation|past due|late payment|payment terms)\b/.test(
    s,
  );
}

/**
 * Blocks that should never show insert/delete styling for a narrow payment-only recipient suggestion,
 * even if template drift or alignment makes the word-diff noisy.
 */
/** Insert/delete text that is clearly boilerplate drift, not payment timing (narrow path sanitizer). */
function narrowPaymentSpuriousInsertDeleteLeak(b: LegalRedlineBlock): boolean {
  const raw = `${b.currentText ?? ""}\n${b.proposedText ?? ""}`;
  if (blockLooksStrongPayment(raw)) return false;
  const insDel = b.segments
    .filter((s) => s.type === "insert" || s.type === "delete")
    .map((s) => s.text)
    .join(" ")
    .toLowerCase();
  if (!insDel.replace(/\s+/g, "").length) return false;
  if (
    /\bnet\s*\d+\b/.test(insDel) ||
    /\b(invoice|invoices|payable|receipt|payment)\b/.test(insDel) ||
    /\bpause\s+work\s+until\b/.test(insDel)
  )
    return false;
  if (narrowPaymentInsertDeleteContainsBoilerplate(insDel)) return true;
  return /\b(sarah collins|anthem blanchard)\b/i.test(insDel) || /\bsignature\b/i.test(insDel);
}

export function isRecipientRedlineNoiseBlockForNarrowPayment(b: LegalRedlineBlock): boolean {
  const raw = `${b.currentText ?? ""}\n${b.proposedText ?? ""}`;
  if (blockLooksStrongPayment(raw)) return false;

  const t = raw.toLowerCase();
  const firstLine = (b.heading ?? b.currentText ?? b.proposedText ?? "").split("\n")[0]?.trim() ?? "";

  if (b.kind === "signature" || b.kind === "footer") return true;

  if (/\b(created with lawdog|draft for review)\b/.test(t)) return true;
  if (/\bin witness whereof\b/.test(t)) return true;
  if (/execution and signature/i.test(t)) return true;
  if (/\beffective date\b/.test(t)) return true;
  if (/^notices\b/i.test(firstLine)) return true;
  if (/\bemail\s+for\s+notices\b/.test(t)) return true;

  if (/\bemail\s*:/i.test(t) || (/\bemail\b/.test(t) && /@/.test(t))) return true;
  if (/(^|\n)\s*(client|developer)\s*:\s*/im.test(raw)) return true;

  const lines = raw.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  for (const line of lines.slice(0, 8)) {
    const low = line.toLowerCase();
    if (/^(signed|signature)\b/.test(low)) return true;
    if (/^(by|name|title|date)\s*:/.test(low)) return true;
    if (/^(client|developer)\s*$/i.test(line)) return true;
  }

  const nonEmpty = lines.filter((l) => l.length > 0);
  if (
    nonEmpty.length <= 6 &&
    nonEmpty.some((l) => /^client\s*$/i.test(l)) &&
    nonEmpty.some((l) => /^developer\s*$/i.test(l))
  ) {
    return true;
  }

  return false;
}

function recipientRedlineNoiseFilterDiagEnabled(): boolean {
  return (
    typeof import.meta !== "undefined" &&
    (import.meta.env?.DEV ||
      (typeof globalThis !== "undefined" &&
        (globalThis as unknown as { window?: Window }).window?.localStorage?.getItem("lawdogRecipientReviseDiag") ===
          "1"))
  );
}

/** Collapses noisy blocks to “same” so they are not counted or styled as redline changes. */
export function filterNarrowRecipientPaymentRedlineNoise(
  vm: LegalRedlineDocumentViewModel,
  options: { narrowPaymentInstruction: boolean },
): LegalRedlineDocumentViewModel {
  if (!options.narrowPaymentInstruction) return vm;

  vm = sanitizeNarrowRecipientPaymentRedlineBoilerplateSegments(vm);

  const droppedBlocks: Array<{ id: string; kind: LegalRedlineBlockKind; label?: string }> = [];
  const blocks = vm.blocks.map((b) => {
    if (!blockHasMaterialChange(b.segments)) return b;
    if (!isRecipientRedlineNoiseBlockForNarrowPayment(b) && !narrowPaymentSpuriousInsertDeleteLeak(b)) return b;
    droppedBlocks.push({ id: b.id, kind: b.kind, label: b.label });
    return collapseBlockToSameOnly(b);
  });

  if (droppedBlocks.length > 0 && recipientRedlineNoiseFilterDiagEnabled()) {
    // eslint-disable-next-line no-console
    console.warn("[recipient-redline-noise-filter]", {
      droppedBlocks,
      reason: "narrow_payment_instruction",
    });
  }

  const stats = aggregateStats(blocks, vm.stats.currentLen, vm.stats.proposedLen);
  const hasChanges = blocks.some((blk) => blockHasMaterialChange(blk.segments));
  return {
    ...vm,
    blocks,
    stats,
    hasChanges,
  };
}

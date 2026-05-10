import {
  diffLegalRedlineClausePlainText,
  extractClauseNumberFromFirstLine,
  normalizeClauseNumberKey,
  normalizeNewlinesForLegalRedline,
  recomputeLegalRedlineBlock,
  withReplacedLegalRedlineBlocks,
  type LegalRedlineBlock,
  type LegalRedlineDocumentViewModel,
} from "./legalRedlineBlocks";

function countNumberedClauseLineStarts(text: string): number {
  const norm = normalizeNewlinesForLegalRedline(text);
  const m = norm.match(/(?:^|\n)(\d+(?:\.\d+)+)\s+\S/g);
  return m?.length ?? 0;
}

function extractNumberedClauseChunks(text: string): Array<{ key: string; body: string; headingLine: string }> {
  const norm = normalizeNewlinesForLegalRedline(text);
  const parts = norm.split(/\n(?=\d+(?:\.\d+)+\s+\S)/);
  const out: Array<{ key: string; body: string; headingLine: string }> = [];
  for (const p of parts) {
    const t = p.trim();
    if (!t) continue;
    const firstLine = t.split("\n")[0] ?? "";
    const cn = extractClauseNumberFromFirstLine(firstLine);
    if (!cn) continue;
    out.push({ key: normalizeClauseNumberKey(cn), body: t, headingLine: firstLine.trim() });
  }
  return out;
}

function buildClauseBodyMapFromBaseline(currentPlain: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const c of extractNumberedClauseChunks(currentPlain)) {
    m.set(c.key, c.body);
  }
  return m;
}

function candidateGiantChangedBlockIndex(vm: LegalRedlineDocumentViewModel): number {
  let best = -1;
  let bestScore = 0;
  for (let i = 0; i < vm.blocks.length; i++) {
    const b = vm.blocks[i]!;
    if (!b.hasChange) continue;
    const prop = String(b.proposedText ?? "").trim();
    if (prop.length < 1600) continue;
    const nClause = countNumberedClauseLineStarts(prop);
    if (nClause < 3) continue;
    const score = nClause * 1000 + prop.length;
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}

/**
 * When a single changed block pairs a long baseline with a condensed multi-clause revised extract,
 * re-diff per numbered clause so "Changed wording" starts with clause-sized items.
 */
export function splitRecipientCondensedGiantChangedBlock(vm: LegalRedlineDocumentViewModel): LegalRedlineDocumentViewModel {
  const idx = candidateGiantChangedBlockIndex(vm);
  if (idx < 0) return vm;
  const b = vm.blocks[idx]!;
  const prop = String(b.proposedText ?? "").trim();
  const curFull = String(b.currentText ?? "").trim();
  const propParts = extractNumberedClauseChunks(prop);
  if (propParts.length < 3) return vm;
  const curMap = buildClauseBodyMapFromBaseline(curFull);
  let hits = 0;
  for (const p of propParts) {
    if (curMap.has(p.key)) hits++;
  }
  if (hits < Math.min(3, Math.ceil(propParts.length * 0.55))) return vm;

  const replacement: LegalRedlineBlock[] = [];
  let sid = 0;
  for (const p of propParts) {
    const curSlice = curMap.get(p.key) ?? "";
    const segs = diffLegalRedlineClausePlainText(curSlice, p.body);
    const id = `${b.id}_split_${sid++}`;
    const draft: LegalRedlineBlock = {
      id,
      kind: "clause",
      clauseNumber: p.key,
      heading: p.headingLine,
      currentText: curSlice || undefined,
      proposedText: p.body,
      segments: segs,
      insertCount: 0,
      deleteCount: 0,
      sameCount: 0,
      hasInsert: false,
      hasDelete: false,
      hasChange: false,
      label: `${p.key} — ${p.headingLine.slice(0, 96)}`.trim(),
    };
    const next = recomputeLegalRedlineBlock(draft, segs);
    replacement.push({ ...next, label: draft.label });
  }

  const outBlocks = [...vm.blocks.slice(0, idx), ...replacement, ...vm.blocks.slice(idx + 1)];
  return withReplacedLegalRedlineBlocks(vm, outBlocks);
}

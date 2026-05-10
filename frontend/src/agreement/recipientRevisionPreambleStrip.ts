import { normalizeNewlinesForLegalRedline } from "./legalRedlineBlocks";

/** QA / cover-sheet lines and PDF page runners — not operative agreement text. */
const QA_OR_PAGE_NOISE_LINE_RES: RegExp[] = [
  /^\s*sarah\s+collins\s+proposed\s+revised\s+draft\s+for\s+qa\s+testing\b/i,
  /^\s*prepared\s+as\s+sarah\s+collins\s+proposed\s+revised\s+agreement\s+draft\b/i,
  /^\s*this\s+is\s+a\s+clean\s+revised\s+draft\b/i,
  /^\s*not\s+a\s+signed\s+agreement\.?\s*$/i,
  /^\s*page\s+\d+\s*(?:of\s+\d+)?\s*$/i,
  /^\s*-\s*page\s+\d+\s*-\s*$/i,
  /^\s*page\s+\d+\s*\/\s*\d+\s*$/i,
];

/**
 * Removes QA cover lines and page runners from extracted revised-draft text (compare, clean tab, export).
 */
export function stripRecipientQaDraftNoiseLines(raw: string): string {
  const lines = String(raw ?? "").replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t) {
      out.push(line);
      continue;
    }
    let drop = false;
    for (const r of QA_OR_PAGE_NOISE_LINE_RES) {
      if (r.test(t)) {
        drop = true;
        break;
      }
    }
    if (!drop) out.push(line);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * When a condensed / LLM-style revised upload starts with narrative before the first numbered clause,
 * strip that preamble from both sides so compare aligns to real agreement clauses (not a giant meta block).
 */
export function stripClausePreambleFromRevisedPair(
  currentPlain: string,
  proposedPlain: string,
): { currentPlain: string; proposedPlain: string } {
  const propClean = stripRecipientQaDraftNoiseLines(proposedPlain);
  const curClean = stripRecipientQaDraftNoiseLines(currentPlain);
  const propNorm = normalizeNewlinesForLegalRedline(propClean);
  const m = propNorm.match(/(?:^|\n)((\d+(?:\.\d+)+)\s+\S[^\n]*)/);
  if (!m || m.index == null) return { currentPlain: curClean, proposedPlain: propClean };
  const lineStart = m.index + (m[0].startsWith("\n") ? 1 : 0);
  const head = propNorm.slice(0, m.index).trim();
  if (head.length < 100) return { currentPlain: curClean, proposedPlain: propClean };
  const looksMeta =
    /(summary|revised\s+draft|this\s+draft|the\s+following|key\s+changes|below\s+(?:are|is)|reflects|condensed|llm|editor(?:'s)?\s+note)/i.test(
      head,
    );
  if (!looksMeta) return { currentPlain: curClean, proposedPlain: propClean };

  const propCut = propNorm.slice(lineStart).trim();
  const clauseNum = m[2]!;
  const clauseKey = clauseNum.replace(/\./g, "\\.");
  const curNorm = normalizeNewlinesForLegalRedline(curClean);
  const re = new RegExp(`(?:^|\\n)${clauseKey}\\s+`, "m");
  const cm = curNorm.match(re);
  let curCut = curNorm;
  if (cm?.index != null && cm.index > 0 && cm.index < curNorm.length * 0.45) {
    curCut = curNorm.slice(cm.index + (cm[0].startsWith("\n") ? 1 : 0)).trim();
  }
  return { currentPlain: curCut, proposedPlain: propCut };
}

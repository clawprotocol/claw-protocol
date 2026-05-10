import { normalizeNewlinesForLegalRedline } from "./legalRedlineBlocks";

/**
 * When a condensed / LLM-style revised upload starts with narrative before the first numbered clause,
 * strip that preamble from both sides so compare aligns to real agreement clauses (not a giant meta block).
 */
export function stripClausePreambleFromRevisedPair(
  currentPlain: string,
  proposedPlain: string,
): { currentPlain: string; proposedPlain: string } {
  const propNorm = normalizeNewlinesForLegalRedline(proposedPlain);
  const m = propNorm.match(/(?:^|\n)((\d+(?:\.\d+)+)\s+\S[^\n]*)/);
  if (!m || m.index == null) return { currentPlain, proposedPlain };
  const lineStart = m.index + (m[0].startsWith("\n") ? 1 : 0);
  const head = propNorm.slice(0, m.index).trim();
  if (head.length < 100) return { currentPlain, proposedPlain };
  const looksMeta =
    /(summary|revised\s+draft|this\s+draft|the\s+following|key\s+changes|below\s+(?:are|is)|reflects|condensed|llm|editor(?:'s)?\s+note)/i.test(
      head,
    );
  if (!looksMeta) return { currentPlain, proposedPlain };

  const propCut = propNorm.slice(lineStart).trim();
  const clauseNum = m[2]!;
  const clauseKey = clauseNum.replace(/\./g, "\\.");
  const curNorm = normalizeNewlinesForLegalRedline(currentPlain);
  const re = new RegExp(`(?:^|\\n)${clauseKey}\\s+`, "m");
  const cm = curNorm.match(re);
  let curCut = curNorm;
  if (cm?.index != null && cm.index > 0 && cm.index < curNorm.length * 0.45) {
    curCut = curNorm.slice(cm.index + (cm[0].startsWith("\n") ? 1 : 0)).trim();
  }
  return { currentPlain: curCut, proposedPlain: propCut };
}

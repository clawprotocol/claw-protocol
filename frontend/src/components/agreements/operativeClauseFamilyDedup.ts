/**
 * Remove duplicate standalone operative clause-family sections from authoritative corpus.
 * Append gates prevent new duplicates; this pass repairs server output that already contains them.
 */

import {
  countStandaloneClauseFamilyHeadings,
  STANDALONE_FAMILY_HEADING_RES,
  type OperativeClauseFamily,
} from "./clauseFamilyRegistry";
import { resolveAuthoritativeWitnessIndex } from "./paidProExecutionBlockNormalization";
import { renumberTopLevelHeadingsAfterOrphanRemoval } from "./paidProOrphanSectionNumberRepair";

const DEDUPE_FAMILIES: OperativeClauseFamily[] = ["governing_law", "venue", "notices"];

const TOP_LEVEL_HEADING_LINE_RE = /^\s*\d+\.(?!\d)\s+\S/;

function lineMatchesStandaloneFamily(line: string, family: OperativeClauseFamily): boolean {
  const re = STANDALONE_FAMILY_HEADING_RES[family];
  if (!re) return false;
  return new RegExp(re.source, re.flags.replace("g", "")).test(line.trim());
}

function removeDuplicateFamilySections(
  corpus: string,
  family: OperativeClauseFamily,
): { text: string; repairs: string[] } {
  if (countStandaloneClauseFamilyHeadings(corpus, family) <= 1) {
    return { text: corpus, repairs: [] };
  }

  const witnessIdx = resolveAuthoritativeWitnessIndex(corpus);
  const operative = witnessIdx >= 0 ? corpus.slice(0, witnessIdx) : corpus;
  const tail = witnessIdx >= 0 ? corpus.slice(witnessIdx) : "";
  const lines = operative.replace(/\r\n/g, "\n").split("\n");

  const headingIndexes: number[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (lineMatchesStandaloneFamily(lines[i] ?? "", family)) headingIndexes.push(i);
  }
  if (headingIndexes.length <= 1) return { text: corpus, repairs: [] };

  const remove = new Set<number>();
  for (let h = 1; h < headingIndexes.length; h += 1) {
    const start = headingIndexes[h]!;
    for (let j = start; j < lines.length; j += 1) {
      if (j > start && TOP_LEVEL_HEADING_LINE_RE.test((lines[j] ?? "").trim())) break;
      remove.add(j);
    }
  }

  const kept = lines.filter((_, idx) => !remove.has(idx)).join("\n").trimEnd();
  const merged = tail ? `${kept}\n\n${tail.trim()}` : kept;
  const renumbered = renumberTopLevelHeadingsAfterOrphanRemoval(merged);
  return {
    text: renumbered.text.replace(/\n{3,}/g, "\n\n").trimEnd(),
    repairs: [`dedupe:${family}_standalone`],
  };
}

export function dedupeStandaloneOperativeClauseFamilies(corpus: string): {
  text: string;
  repairs: string[];
} {
  const repairs: string[] = [];
  let out = (corpus || "").replace(/\r\n/g, "\n");
  for (const family of DEDUPE_FAMILIES) {
    const deduped = removeDuplicateFamilySections(out, family);
    if (deduped.text !== out) {
      out = deduped.text;
      repairs.push(...deduped.repairs);
    }
  }
  return { text: out, repairs: [...new Set(repairs)] };
}

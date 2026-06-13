/**
 * TEST312 — detect and collapse lone N.1 subsections under a main section heading into body text.
 */

import { hashPaidProCorpus } from "./paidProSourceOfTruth";

const TOP_LEVEL_RE = /^(\d+)\.\s+(?!\d)(.+)$/;
const SUB_LEVEL_RE = /^(\d+)\.(\d+)\.?\s*(.*)$/;
const WITNESS_RE = /\bIN WITNESS WHEREOF\b/i;

/** True when N.1 remainder is only a short subsection title, not operative body text. */
function isSubsectionHeadingOnlyLabel(bodyText: string): boolean {
  const t = bodyText.trim();
  if (!t) return true;
  const labelBody = t.match(/^([A-Za-z][A-Za-z\s/&,\-'—–().]{2,56}\.)\s+(.+)$/s);
  if (labelBody?.[2]?.trim()) {
    return isSubsectionHeadingOnlyLabel(labelBody[1]);
  }
  if (t.length > 72) return false;
  if (!/^[A-Z]/.test(t) || !/\.$/.test(t)) return false;
  if (/\b(?:shall|will|must|may|is|are|has|have|been|during|upon|unless|if|when|the|this|each|either|agreement|party|parties)\b/i.test(t)) {
    return false;
  }
  return /^[A-Z][A-Za-z\s/&,\-'—–().]+\.$/.test(t);
}

function subsectionRemainderAfterCollapse(rawRemainder: string): string | null {
  const t = rawRemainder.trim();
  if (!t) return null;
  const inline = t.match(/^([A-Za-z][A-Za-z\s/&,\-'—–().]{2,56}\.)\s+((?:During|The|Each|Either|Upon|Unless|If|When|Client|Service|This|In|For|All|Any|Neither|Notwithstanding).+)/s);
  if (inline?.[2]?.trim()) return inline[2].trim();
  if (isSubsectionHeadingOnlyLabel(t)) return null;
  return t;
}

export type PaidProOrphanSubsectionScanResult = {
  orphanSectionsFound: number;
  sectionNumbers: number[];
};

export type PaidProOrphanSubsectionNormalizationResult = PaidProOrphanSubsectionScanResult & {
  text: string;
  orphanSectionsRepaired: number;
  repairs: string[];
};

export type NormalizePaidProOrphanSubsectionsOpts = {
  source?: string;
};

let lastOrphanSubsectionLogKey = "";

export function resetPaidProOrphanSubsectionNormalizerLogsForTests(): void {
  lastOrphanSubsectionLogKey = "";
}

function logOrphanSubsectionNormalizer(payload: {
  orphanSectionsFound: number;
  orphanSectionsRepaired: number;
  sectionNumbers: number[];
  source: string;
  beforeHash: string | null;
  afterHash: string | null;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  const key = `${payload.source}|${payload.orphanSectionsRepaired}|${payload.sectionNumbers.join(",")}|${payload.afterHash ?? ""}`;
  if (key === lastOrphanSubsectionLogKey) return;
  lastOrphanSubsectionLogKey = key;
  // eslint-disable-next-line no-console
  console.info("[test312-orphan-subsection-normalizer]", payload);
}

function scanOrphansInBody(body: string): PaidProOrphanSubsectionScanResult {
  const lines = body.split("\n");
  const sectionNumbers: number[] = [];
  let orphanSectionsFound = 0;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;
    const trimmed = line.trim();
    const topMatch = trimmed.match(TOP_LEVEL_RE);
    if (!topMatch) {
      i += 1;
      continue;
    }

    const sectionNum = Number(topMatch[1]);
    i += 1;

    const sectionStart = i;
    let j = i;
    while (j < lines.length) {
      const probe = lines[j]?.trim() ?? "";
      if (!probe) {
        j += 1;
        continue;
      }
      if (TOP_LEVEL_RE.test(probe)) break;
      if (WITNESS_RE.test(probe)) break;
      if (/^(?:CLIENT|SERVICE\s+PROVIDER|PARTY\s+\d+)\s*:?\s*$/i.test(probe)) break;
      j += 1;
    }

    const sectionLines = lines.slice(sectionStart, j);
    const subsectionNums = new Set<number>();
    for (const sectionLine of sectionLines) {
      const subMatch = sectionLine.trim().match(SUB_LEVEL_RE);
      if (!subMatch) continue;
      if (Number(subMatch[1]) !== sectionNum) continue;
      subsectionNums.add(Number(subMatch[2]));
    }

    if (subsectionNums.size === 1 && subsectionNums.has(1)) {
      orphanSectionsFound += 1;
      sectionNumbers.push(sectionNum);
    }
    i = j;
  }

  return { orphanSectionsFound, sectionNumbers };
}

function splitCorpusBeforeWitness(text: string): { head: string; tail: string } {
  const witnessIdx = text.search(WITNESS_RE);
  return witnessIdx >= 0
    ? { head: text.slice(0, witnessIdx), tail: text.slice(witnessIdx) }
    : { head: text, tail: "" };
}

/** Model-independent orphan subsection detection on authoritative plain corpus. */
export function detectPaidProOrphanSubsections(text: string): PaidProOrphanSubsectionScanResult {
  const raw = (text || "").replace(/\r\n/g, "\n");
  if (!raw.trim()) {
    return { orphanSectionsFound: 0, sectionNumbers: [] };
  }
  return scanOrphansInBody(splitCorpusBeforeWitness(raw).head);
}

function normalizeOrphansInBody(body: string): PaidProOrphanSubsectionNormalizationResult {
  const lines = body.split("\n");
  const out: string[] = [];
  const sectionNumbers: number[] = [];
  const repairs: string[] = [];
  let orphanSectionsFound = 0;
  let orphanSectionsRepaired = 0;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;
    const trimmed = line.trim();
    const topMatch = trimmed.match(TOP_LEVEL_RE);
    if (!topMatch) {
      out.push(line);
      i += 1;
      continue;
    }

    const sectionNum = Number(topMatch[1]);
    out.push(line);
    i += 1;

    const sectionStart = i;
    let j = i;
    while (j < lines.length) {
      const probe = lines[j]?.trim() ?? "";
      if (!probe) {
        j += 1;
        continue;
      }
      if (TOP_LEVEL_RE.test(probe)) break;
      if (WITNESS_RE.test(probe)) break;
      if (/^(?:CLIENT|SERVICE\s+PROVIDER|PARTY\s+\d+)\s*:?\s*$/i.test(probe)) break;
      j += 1;
    }

    const sectionLines = lines.slice(sectionStart, j);
    const subsectionNums = new Set<number>();
    for (const sectionLine of sectionLines) {
      const subMatch = sectionLine.trim().match(SUB_LEVEL_RE);
      if (!subMatch) continue;
      if (Number(subMatch[1]) !== sectionNum) continue;
      subsectionNums.add(Number(subMatch[2]));
    }

    const isOrphan = subsectionNums.size === 1 && subsectionNums.has(1);
    if (isOrphan) {
      orphanSectionsFound += 1;
      orphanSectionsRepaired += 1;
      sectionNumbers.push(sectionNum);
      repairs.push(`orphan_subsection:${sectionNum}.1->body`);
      for (const sectionLine of sectionLines) {
        const subMatch = sectionLine.trim().match(SUB_LEVEL_RE);
        if (subMatch && Number(subMatch[1]) === sectionNum && Number(subMatch[2]) === 1) {
          const remainder = subsectionRemainderAfterCollapse(subMatch[3] ?? "");
          if (remainder) out.push(remainder);
          continue;
        }
        out.push(sectionLine);
      }
    } else {
      out.push(...sectionLines);
    }
    i = j;
  }

  return {
    text: out.join("\n"),
    orphanSectionsFound,
    orphanSectionsRepaired,
    sectionNumbers,
    repairs,
  };
}

/**
 * When main section N is followed by exactly one N.1 and no N.2+, strip the N.1 label.
 */
export function normalizePaidProOrphanSubsections(
  text: string,
  opts?: NormalizePaidProOrphanSubsectionsOpts,
): PaidProOrphanSubsectionNormalizationResult {
  const raw = (text || "").replace(/\r\n/g, "\n");
  if (!raw.trim()) {
    return {
      text: raw,
      orphanSectionsFound: 0,
      orphanSectionsRepaired: 0,
      sectionNumbers: [],
      repairs: [],
    };
  }

  const beforeHash = raw.length >= 80 ? hashPaidProCorpus(raw) : null;
  const { head, tail } = splitCorpusBeforeWitness(raw);

  const normalized = normalizeOrphansInBody(head);
  const merged = tail
    ? `${normalized.text.replace(/\n{3,}/g, "\n\n").trimEnd()}\n\n${tail.trim()}`
    : normalized.text.replace(/\n{3,}/g, "\n\n").trimEnd();
  const out = merged.replace(/\n{3,}/g, "\n\n").trimEnd();
  const afterHash = out.length >= 80 ? hashPaidProCorpus(out) : null;

  if (normalized.orphanSectionsRepaired > 0) {
    logOrphanSubsectionNormalizer({
      orphanSectionsFound: normalized.orphanSectionsFound,
      orphanSectionsRepaired: normalized.orphanSectionsRepaired,
      sectionNumbers: normalized.sectionNumbers,
      source: opts?.source ?? "normalizePaidProOrphanSubsections",
      beforeHash,
      afterHash,
    });
  }

  return {
    text: out,
    orphanSectionsFound: normalized.orphanSectionsFound,
    orphanSectionsRepaired: normalized.orphanSectionsRepaired,
    sectionNumbers: normalized.sectionNumbers,
    repairs: normalized.repairs,
  };
}

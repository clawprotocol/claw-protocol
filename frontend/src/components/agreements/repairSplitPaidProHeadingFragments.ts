/**
 * Merge main section headings split across two adjacent lines (Paid Pro review corpus).
 * Complements repairGluedSectionHeadingsInText when a title-case fragment lands on the next line.
 */

const WITNESS_RE = /\bIN WITNESS WHEREOF\b/i;
const SUBSECTION_RE = /^\d+\.\d+/;
const MAIN_SECTION_PREFIX_RE = /^(\d+)\.\s+(?!\d+\.\d)(.+)$/;
const SUBSECTION_PREFIX_RE = /^(\d+\.\d+)\s+(.+)$/;

/** Heading title ends mid-phrase — next line is likely a continuation fragment. */
const DANGLING_HEADING_TAIL_RE = /\b(and|or|&|of|for|the|to|with|upon|under)\s*$/i;

const EXECUTION_LINE_RE =
  /^(?:IN WITNESS WHEREOF|CLIENT\s*:|SERVICE\s+PROVIDER\s*:|\bSIGNATURES\b)/i;

const BODY_SENTENCE_START_RE =
  /^(?:The|This|Each|Either|Any|Neither|Both|When|If|Unless|Upon|Where|As|An|A|In|For|Client will|Service Provider will|Neither party|Either party|During|Within|After|Before|All|Some|Such|Notwithstanding)\b/i;

const BODY_VERB_RE =
  /\b(?:will|shall|must|may|should|are|is|was|were|have|has|had|agrees?|represents?)\b/i;

function parseSubsectionPrefixLine(
  line: string,
): { sectionNum: string; title: string; full: string } | null {
  const trimmed = line.trim();
  const m = trimmed.match(SUBSECTION_PREFIX_RE);
  if (!m?.[1] || !m[2]) return null;
  return { sectionNum: m[1], title: m[2].trim(), full: trimmed };
}

function isSubsectionDanglingPrefix(title: string): boolean {
  if (!title || title.length < 3) return false;
  if (/\.\s+[A-Za-z]/.test(title)) return false;
  if (BODY_VERB_RE.test(title)) return false;
  if (DANGLING_HEADING_TAIL_RE.test(title)) return true;
  return title.split(/\s+/).filter(Boolean).length <= 2;
}

export type RepairSplitPaidProHeadingFragmentsResult = {
  text: string;
  repairs: string[];
};

function peelHeadingContinuationFromGluedLine(
  line: string,
): { fragment: string; remainder: string } | null {
  const t = line.trim();
  const during = t.match(
    /^((?:During|Within|After|Before|Upon)\s+(?:Term|the\s+Term|[A-Z][a-zA-Z]+))\s+((?:The|Each|Either|Any|Neither|Both|All|Some|Such|Fees|Invoices|Client|Service|Neither party|Either party)\b.+)$/i,
  );
  if (during?.[1] && during[2] && isPaidProHeadingContinuationFragment(during[1])) {
    return { fragment: during[1].trim(), remainder: during[2].trim() };
  }
  const singleWord = t.match(/^([A-Z][a-zA-Z]+)\s+((?:The|Each|Either|Fees|Invoices|Client|Service)\b.+)$/);
  if (singleWord?.[1] && singleWord[2] && isPaidProHeadingContinuationFragment(singleWord[1])) {
    return { fragment: singleWord[1].trim(), remainder: singleWord[2].trim() };
  }
  return null;
}

function nextNonEmptyLineIndex(lines: string[], from: number): number | null {
  for (let i = from; i < lines.length; i += 1) {
    if (lines[i]!.trim()) return i;
  }
  return null;
}

function parseMainSectionPrefixLine(
  line: string,
): { sectionNum: string; title: string; full: string } | null {
  const trimmed = line.trim();
  const m = trimmed.match(MAIN_SECTION_PREFIX_RE);
  if (!m?.[1] || !m[2]) return null;
  return { sectionNum: m[1], title: m[2].trim(), full: trimmed };
}

export function isDanglingPaidProMainHeadingPrefix(title: string): boolean {
  if (!title || title.length < 3) return false;
  if (/\.\s+[A-Za-z]/.test(title)) return false;
  if (BODY_VERB_RE.test(title)) return false;
  return DANGLING_HEADING_TAIL_RE.test(title);
}

export function isPaidProHeadingContinuationFragment(line: string): boolean {
  const t = line.trim();
  if (!t || t.length < 2 || t.length > 72) return false;
  if (SUBSECTION_RE.test(t)) return false;
  if (/^\d+\.\s/.test(t)) return false;
  if (EXECUTION_LINE_RE.test(t)) return false;
  if (/^(?:By|Name|Title|Date|Email|Address|Signature)\s*:/i.test(t)) return false;

const HEADING_PARTICLE_WORD_RE = /^(?:for|of|and|or|the|to|in|on|at|by|with|upon|under|per|a|an)$/i;

  const words = t
    .split(/\s+/)
    .map((w) => w.replace(/[.,;:]+$/, ""))
    .filter(Boolean);
  if (words.length < 1 || words.length > 8) return false;

  const titleCaseHeading =
    words.length >= 2 &&
    !BODY_VERB_RE.test(t) &&
    words.every(
      (w) =>
        HEADING_PARTICLE_WORD_RE.test(w) ||
        /^[A-Z][a-zA-Z'&-]*$/.test(w) ||
        /^[A-Z]{2,}$/.test(w),
    );
  if (titleCaseHeading) return true;

  if (BODY_SENTENCE_START_RE.test(t) && !/^(?:During|Within|After|Before|Upon)\s+[A-Z]/i.test(t)) {
    return false;
  }
  if (BODY_VERB_RE.test(t)) return false;
  if (/[.!?]$/.test(t) && t.length > 24) return false;

  const titleCaseOk = words.every(
    (w) => /^[A-Z][a-zA-Z'&-]*$/.test(w) || /^[A-Z]{2,}$/.test(w),
  );
  if (!titleCaseOk && !/^[A-Z][A-Z\s/&,\-'.]+$/.test(t)) return false;
  return true;
}

function isCompleteMergedMainHeadingLine(merged: string): boolean {
  const prefix = parseMainSectionPrefixLine(merged);
  if (!prefix) return false;
  if (isDanglingPaidProMainHeadingPrefix(prefix.title)) return false;
  if (BODY_VERB_RE.test(prefix.title)) return false;
  if (/\.\s+[A-Za-z]/.test(prefix.title)) return false;
  if (BODY_SENTENCE_START_RE.test(prefix.title)) return false;
  return prefix.title.split(/\s+/).filter(Boolean).length >= 2;
}

/** Merge dangling `N. Title and` + `Client Materials` style heading fragments. */
export function repairSplitPaidProHeadingFragments(text: string): RepairSplitPaidProHeadingFragmentsResult {
  const repairs: string[] = [];
  const normalized = (text || "").replace(/\r\n/g, "\n");
  const witnessIdx = normalized.search(WITNESS_RE);
  const head = witnessIdx >= 0 ? normalized.slice(0, witnessIdx) : normalized;
  const tail = witnessIdx >= 0 ? normalized.slice(witnessIdx) : "";

  const lines = head.split("\n");
  const skip = new Set<number>();
  const out: string[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    if (skip.has(i)) continue;
    const line = lines[i]!;
    const prefix = parseMainSectionPrefixLine(line);
    if (prefix && isDanglingPaidProMainHeadingPrefix(prefix.title)) {
      const nextIdx = nextNonEmptyLineIndex(lines, i + 1);
      if (nextIdx != null) {
        const nextTrimmed = lines[nextIdx]!.trim();
        if (isPaidProHeadingContinuationFragment(nextTrimmed)) {
          const merged = `${prefix.full} ${nextTrimmed}`;
          if (isCompleteMergedMainHeadingLine(merged)) {
            out.push(merged);
            skip.add(nextIdx);
            repairs.push(`split_heading_fragment:${prefix.sectionNum}`);
            continue;
          }
        }
      }
    }

    const subsection = parseSubsectionPrefixLine(line);
    if (subsection && isSubsectionDanglingPrefix(subsection.title)) {
      const nextIdx = nextNonEmptyLineIndex(lines, i + 1);
      if (nextIdx != null) {
        const nextTrimmed = lines[nextIdx]!.trim();
        if (isPaidProHeadingContinuationFragment(nextTrimmed)) {
          const merged = `${subsection.full} ${nextTrimmed}`;
          const mergedPrefix = parseSubsectionPrefixLine(merged);
          if (mergedPrefix && !isSubsectionDanglingPrefix(mergedPrefix.title)) {
            out.push(merged);
            skip.add(nextIdx);
            repairs.push(`split_subsection_heading_fragment:${subsection.sectionNum}`);
            continue;
          }
        }
        const peeled = peelHeadingContinuationFromGluedLine(nextTrimmed);
        if (peeled && isPaidProHeadingContinuationFragment(peeled.fragment)) {
          const merged = `${subsection.full} ${peeled.fragment}`;
          const mergedPrefix = parseSubsectionPrefixLine(merged);
          if (mergedPrefix && !isSubsectionDanglingPrefix(mergedPrefix.title)) {
            out.push(merged);
            out.push(peeled.remainder);
            skip.add(nextIdx);
            repairs.push(`split_subsection_heading_fragment:${subsection.sectionNum}:peeled_body`);
            continue;
          }
        }
      }
    }

    out.push(line);
  }

  const mergedHead = out.join("\n").replace(/\n{3,}/g, "\n\n");
  const textOut = tail
    ? `${mergedHead}${mergedHead.endsWith("\n") ? "" : "\n\n"}${tail}`
    : mergedHead;

  return { text: textOut, repairs };
}

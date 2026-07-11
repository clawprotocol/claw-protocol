/**
 * Pre-freeze Pro section heading title authority — merge split numbered titles and
 * remove orphan semantic fragments before canonical section headings.
 */

import { resolveAuthoritativeWitnessIndex } from "./paidProExecutionBlockNormalization";
import {
  isAuthoritativePaidProAgreementDocumentTitleLine,
  repairMultilinePaidProAgreementDocumentTitle,
} from "./paidProAgreementTitleScope";
import { isPaidProNumberedSectionHeadingLine } from "./paidProNumberedSectionHeading";
import {
  isDanglingPaidProMainHeadingPrefix,
  isPaidProHeadingContinuationFragment,
  repairSplitPaidProHeadingFragments,
} from "./repairSplitPaidProHeadingFragments";
import {
  hasFalseFragmentSectionHeading,
  isFalseFragmentSectionTitle,
  repairOrphanNumberFragmentContinuationLines,
} from "./paidProOrphanSectionNumberRepair";
import {
  isBeforeFirstOperativeSectionLineIndex,
  isPaidProDocumentOpeningMaterialLineIndex,
  resolvePaidProDocumentOpeningAuthority,
} from "./paidProDocumentOpeningAuthority";

const MAIN_SECTION_PREFIX_RE = /^(\d+)\.\s+(?!\d+\.\d)(.+)$/;
const SUBSECTION_PREFIX_RE = /^(\d+\.\d+)\s+(.+)$/;
const ALL_CAPS_SECTION_HEADING_RE = /^\d+\.\s+[A-Z][A-Z\s,&'\-]+$/;
const EXECUTION_LINE_RE =
  /^(?:IN WITNESS WHEREOF|CLIENT\s*:|SERVICE\s+PROVIDER\s*:|\bSIGNATURES\b)/i;

const BODY_VERB_RE =
  /\b(?:will|shall|must|may|should|are|is|was|were|have|has|had|agrees?|represents?)\b/i;

const BODY_SENTENCE_START_RE =
  /^(?:The|This|Each|Either|Any|Neither|Both|When|If|Unless|Upon|Where|As|An|A|In|For|Client|Service Provider|Neither party|Either party|During|Within|After|Before|All|Some|Such|Notwithstanding)\b/i;

function isCollapsedClauseFamilyHeadingBodyLine(line: string): boolean {
  return /^Terms\.?\s*$/i.test(line.trim());
}

function shouldSkipHeadingContinuationSplitAnomaly(
  title: string,
  nextTrimmed: string,
): boolean {
  if (/^Clause$/i.test(title.trim()) && isCollapsedClauseFamilyHeadingBodyLine(nextTrimmed)) {
    return true;
  }
  return false;
}

function isCanonicalSplitOperativeSectionHeading(
  lines: readonly string[],
  lineIndex: number,
  title: string,
): boolean {
  if (!isFalseFragmentSectionTitle(title)) return false;
  const nextIdx = nextNonEmptyLineIndex(lines, lineIndex + 1);
  if (nextIdx == null) return false;
  const nextTrimmed = lines[nextIdx]!.trim();
  if (!nextTrimmed || /^\d+\.\s/.test(nextTrimmed)) return false;
  if (isPaidProHeadingContinuationFragment(nextTrimmed)) return false;
  if (isFalseFragmentSectionTitle(nextTrimmed.replace(/[.,;:]+$/, ""))) return false;
  if (BODY_VERB_RE.test(nextTrimmed)) return true;
  if (BODY_SENTENCE_START_RE.test(nextTrimmed)) return true;
  return /[a-z]/.test(nextTrimmed) && nextTrimmed.length >= 16;
}

export type PaidProSectionHeadingTitleAnomaly = {
  lineIndex: number;
  line: string;
  code:
    | "numbered_heading_ends_with_comma"
    | "numbered_heading_title_continuation_split"
    | "orphan_title_fragment_before_section"
    | "duplicate_semantic_and_canonical_heading"
    | "false_fragment_section_heading";
};

function nextNonEmptyLineIndex(lines: readonly string[], from: number): number | null {
  for (let i = from; i < lines.length; i += 1) {
    if (lines[i]!.trim()) return i;
  }
  return null;
}

function parseMainSectionPrefixLine(line: string): { sectionNum: string; title: string; full: string } | null {
  const trimmed = line.trim();
  const m = trimmed.match(MAIN_SECTION_PREFIX_RE);
  if (!m?.[1] || !m[2]) return null;
  return { sectionNum: m[1], title: m[2].trim(), full: trimmed };
}

export function isIncompletePaidProHeadingTitle(title: string): boolean {
  if (!title || title.length < 2) return false;
  if (/\.\s+[A-Za-z]/.test(title)) return false;
  if (BODY_VERB_RE.test(title)) return false;
  if (isDanglingPaidProMainHeadingPrefix(title)) return true;
  if (/,\s*$/.test(title)) return true;
  const words = title.split(/\s+/).filter(Boolean);
  if (words.length <= 2 && !/[.!?]$/.test(title)) return true;
  return false;
}

function isOrphanTitleFragmentLine(line: string): boolean {
  const t = line.trim();
  if (!t || t.length < 2) return false;
  if (/^Section$/i.test(t)) return false;
  if (/^\d+\./.test(t)) return false;
  if (EXECUTION_LINE_RE.test(t)) return false;
  if (isPaidProNumberedSectionHeadingLine(t)) return false;
  if (ALL_CAPS_SECTION_HEADING_RE.test(t)) return false;
  if (isPaidProHeadingContinuationFragment(t)) return true;
  if (isDanglingPaidProMainHeadingPrefix(t)) return true;
  if (BODY_VERB_RE.test(t)) return false;
  if (/[.!?]$/.test(t) && t.length > 24) return false;
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length > 8) return false;
  return words.every((w) => /^[A-Z][a-zA-Z'&-]*$/.test(w) || /^[A-Z]{2,}$/.test(w) || /^(?:and|or|of|the|for|to|with)$/i.test(w));
}

function isCanonicalSectionHeadingLine(line: string): boolean {
  const t = line.trim();
  if (!/^\d+\.\s+/.test(t)) return false;
  if (ALL_CAPS_SECTION_HEADING_RE.test(t)) return true;
  return isPaidProNumberedSectionHeadingLine(t);
}

function normalizeHeadingTokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !/^(?:and|or|the|of|for|to|with|upon|under|among)$/i.test(w));
}

function fragmentContainedInCanonicalTitle(fragmentText: string, canonicalTitle: string): boolean {
  const fragment = fragmentText.trim().toLowerCase();
  const canonical = canonicalTitle.trim().toLowerCase();
  if (!fragment || !canonical) return false;
  if (canonical.includes(fragment)) return true;
  const fragmentWords = fragment.split(/\s+/).filter((w) => w.length > 2);
  return fragmentWords.length > 0 && fragmentWords.every((w) => canonical.includes(w));
}

function semanticTokensOverlap(fragmentText: string, canonicalTitle: string): boolean {
  const fragmentTokens = normalizeHeadingTokens(fragmentText);
  const canonicalTokens = normalizeHeadingTokens(canonicalTitle);
  if (fragmentTokens.length === 0 || canonicalTokens.length === 0) return false;
  const overlap = fragmentTokens.filter((t) => canonicalTokens.includes(t)).length;
  return overlap >= Math.min(2, fragmentTokens.length);
}

function fragmentLinesAllContinuationFragments(lines: readonly string[]): boolean {
  return (
    lines.length > 0 &&
    lines.every(
      (line) =>
        isPaidProHeadingContinuationFragment(line) || isDanglingPaidProMainHeadingPrefix(line),
    )
  );
}

/** Remove orphan title fragments immediately before canonical numbered section headings. */
export function repairOrphanSemanticHeadingFragmentsBeforeCanonicalHeadings(text: string): {
  text: string;
  repairs: string[];
} {
  const repairs: string[] = [];
  const witnessIdx = resolveAuthoritativeWitnessIndex(text || "");
  const head = witnessIdx >= 0 ? text.slice(0, witnessIdx) : text;
  const tail = witnessIdx >= 0 ? text.slice(witnessIdx) : "";
  const lines = head.replace(/\r\n/g, "\n").split("\n");
  const openingAuthority = resolvePaidProDocumentOpeningAuthority(text);
  const skip = new Set<number>();
  const out: string[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    if (skip.has(i)) continue;
    const line = lines[i]!;
    const trimmed = line.trim();
    if (
      !trimmed ||
      (isBeforeFirstOperativeSectionLineIndex(i, openingAuthority) &&
        isAuthoritativePaidProAgreementDocumentTitleLine(trimmed))
    ) {
      out.push(line);
      continue;
    }
    if (isPaidProDocumentOpeningMaterialLineIndex(i, openingAuthority)) {
      out.push(line);
      continue;
    }
    if (!trimmed || !isOrphanTitleFragmentLine(trimmed)) {
      out.push(line);
      continue;
    }

    const fragmentLines: string[] = [trimmed];
    let j = i + 1;
    while (j < lines.length) {
      const nextTrimmed = lines[j]!.trim();
      if (!nextTrimmed) {
        j += 1;
        continue;
      }
      if (isOrphanTitleFragmentLine(nextTrimmed)) {
        fragmentLines.push(nextTrimmed);
        j += 1;
        continue;
      }
      break;
    }

    const nextIdx = nextNonEmptyLineIndex(lines, j);
    if (nextIdx == null) {
      out.push(line);
      continue;
    }
    const nextTrimmed = lines[nextIdx]!.trim();
    const canonical = parseMainSectionPrefixLine(nextTrimmed);
    if (!canonical || !isCanonicalSectionHeadingLine(nextTrimmed)) {
      out.push(line);
      continue;
    }

    const fragmentText = fragmentLines.join(" ");
    const removeOrphans =
      ALL_CAPS_SECTION_HEADING_RE.test(nextTrimmed) ||
      semanticTokensOverlap(fragmentText, canonical.title) ||
      fragmentContainedInCanonicalTitle(fragmentText, canonical.title) ||
      fragmentLinesAllContinuationFragments(fragmentLines);
    if (removeOrphans) {
      for (let k = i; k < nextIdx; k += 1) {
        if (lines[k]!.trim()) skip.add(k);
      }
      repairs.push(`orphan_title_fragment_before:${canonical.sectionNum}`);
      continue;
    }

    out.push(line);
  }

  const mergedHead = out.join("\n").replace(/\n{3,}/g, "\n\n");
  const textOut = tail
    ? `${mergedHead}${mergedHead.endsWith("\n") ? "" : "\n\n"}${tail}`
    : mergedHead;
  return { text: textOut, repairs };
}

export function detectPaidProSectionHeadingTitleAnomalies(text: string): PaidProSectionHeadingTitleAnomaly[] {
  const witnessIdx = resolveAuthoritativeWitnessIndex(text || "");
  const head = witnessIdx >= 0 ? text.slice(0, witnessIdx) : text;
  const lines = head.replace(/\r\n/g, "\n").split("\n");
  const openingAuthority = resolvePaidProDocumentOpeningAuthority(text);
  const findings: PaidProSectionHeadingTitleAnomaly[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i]!.trim();
    if (!trimmed) continue;
    const inOpeningRegion = isBeforeFirstOperativeSectionLineIndex(i, openingAuthority);
    if (inOpeningRegion && isAuthoritativePaidProAgreementDocumentTitleLine(trimmed)) continue;
    if (isPaidProDocumentOpeningMaterialLineIndex(i, openingAuthority)) continue;

    const prefix = parseMainSectionPrefixLine(trimmed);
    if (prefix) {
      if (
        isFalseFragmentSectionTitle(prefix.title) &&
        !isCanonicalSplitOperativeSectionHeading(lines, i, prefix.title)
      ) {
        findings.push({
          lineIndex: i,
          line: trimmed,
          code: "false_fragment_section_heading",
        });
      }
      if (/,\s*$/.test(prefix.title)) {
        findings.push({
          lineIndex: i,
          line: trimmed,
          code: "numbered_heading_ends_with_comma",
        });
      }
      const nextIdx = nextNonEmptyLineIndex(lines, i + 1);
      if (nextIdx != null) {
        const nextTrimmed = lines[nextIdx]!.trim();
        if (
          isIncompletePaidProHeadingTitle(prefix.title) &&
          isPaidProHeadingContinuationFragment(nextTrimmed) &&
          !shouldSkipHeadingContinuationSplitAnomaly(prefix.title, nextTrimmed)
        ) {
          findings.push({
            lineIndex: i,
            line: trimmed,
            code: "numbered_heading_title_continuation_split",
          });
        }
      }
      continue;
    }

    const subsection = trimmed.match(SUBSECTION_PREFIX_RE);
    if (subsection?.[1] && subsection[2]) {
      const subTitle = subsection[2].trim();
      if (isFalseFragmentSectionTitle(subTitle)) {
        findings.push({
          lineIndex: i,
          line: trimmed,
          code: "false_fragment_section_heading",
        });
      }
      const nextIdx = nextNonEmptyLineIndex(lines, i + 1);
      if (nextIdx != null) {
        const nextTrimmed = lines[nextIdx]!.trim();
        if (
          isIncompletePaidProHeadingTitle(subTitle) &&
          isPaidProHeadingContinuationFragment(nextTrimmed) &&
          !shouldSkipHeadingContinuationSplitAnomaly(subTitle, nextTrimmed)
        ) {
          findings.push({
            lineIndex: i,
            line: trimmed,
            code: "numbered_heading_title_continuation_split",
          });
        }
      }
      continue;
    }

    if (isOrphanTitleFragmentLine(trimmed)) {
      if (isBeforeFirstOperativeSectionLineIndex(i, openingAuthority)) {
        continue;
      }
      const fragmentLines: string[] = [trimmed];
      let j = i + 1;
      while (j < lines.length) {
        const nextTrimmed = lines[j]!.trim();
        if (!nextTrimmed) {
          j += 1;
          continue;
        }
        if (isOrphanTitleFragmentLine(nextTrimmed)) {
          fragmentLines.push(nextTrimmed);
          j += 1;
          continue;
        }
        break;
      }
      const nextIdx = nextNonEmptyLineIndex(lines, j);
      if (nextIdx != null && /^\d+\.\s+/.test(lines[nextIdx]!.trim())) {
        findings.push({
          lineIndex: i,
          line: fragmentLines.join(" / "),
          code: "orphan_title_fragment_before_section",
        });
        const canonical = parseMainSectionPrefixLine(lines[nextIdx]!.trim());
        if (canonical && semanticTokensOverlap(fragmentLines.join(" "), canonical.title)) {
          findings.push({
            lineIndex: nextIdx,
            line: lines[nextIdx]!.trim(),
            code: "duplicate_semantic_and_canonical_heading",
          });
        }
      }
    }
  }

  return findings;
}

/** Actionable anomaly payload for freeze diagnostics and regression tests. */
export function formatPaidProSectionHeadingTitleAnomalyDetails(
  text: string,
  anomalies: PaidProSectionHeadingTitleAnomaly[],
): Array<{
  code: string;
  line: string;
  lineIndex: number;
  prevLine: string | null;
  nextLine: string | null;
  sectionNumber: string | null;
  canonicalTitle: string | null;
  canonicalTitleMatch: boolean;
  canonicalTitleMatchDecision: string;
}> {
  const lines = (text || "").replace(/\r\n/g, "\n").split("\n");
  return anomalies.map((a) => {
    const trimmed = a.line.includes(" / ")
      ? a.line.split(" / ")[0]!.trim()
      : a.line.trim();
    const main = parseMainSectionPrefixLine(trimmed);
    const subsection = trimmed.match(SUBSECTION_PREFIX_RE);
    const sectionNumber = main?.sectionNum ?? subsection?.[1] ?? null;
    const canonicalTitle = main?.title ?? subsection?.[2]?.trim() ?? null;
    let canonicalTitleMatchDecision = "none";
    let canonicalTitleMatch = false;
    if (a.code === "orphan_title_fragment_before_section" && a.lineIndex + 1 < lines.length) {
      const nextTrimmed = lines[nextNonEmptyLineIndex(lines, a.lineIndex + 1) ?? a.lineIndex + 1]?.trim() ?? "";
      const canonical = parseMainSectionPrefixLine(nextTrimmed);
      if (canonical) {
        const fragmentText = a.line.replace(/\s\/\s/g, " ");
        if (ALL_CAPS_SECTION_HEADING_RE.test(nextTrimmed)) {
          canonicalTitleMatchDecision = "all_caps_heading";
          canonicalTitleMatch = true;
        } else if (fragmentContainedInCanonicalTitle(fragmentText, canonical.title)) {
          canonicalTitleMatchDecision = "fragment_contained_in_canonical_title";
          canonicalTitleMatch = true;
        } else if (semanticTokensOverlap(fragmentText, canonical.title)) {
          canonicalTitleMatchDecision = "semantic_token_overlap";
          canonicalTitleMatch = true;
        } else if (
          fragmentLinesAllContinuationFragments(a.line.split(" / ").map((s) => s.trim()))
        ) {
          canonicalTitleMatchDecision = "continuation_fragment_stack";
          canonicalTitleMatch = true;
        }
      }
    } else if (a.code === "duplicate_semantic_and_canonical_heading") {
      canonicalTitleMatchDecision = "duplicate_semantic_canonical_pair";
      canonicalTitleMatch = true;
    } else if (a.code === "numbered_heading_title_continuation_split") {
      canonicalTitleMatchDecision = "split_title_continuation";
    } else if (a.code === "false_fragment_section_heading") {
      canonicalTitleMatchDecision = "false_fragment_section_title";
    }
    return {
      code: a.code,
      line: a.line,
      lineIndex: a.lineIndex,
      prevLine: a.lineIndex > 0 ? (lines[a.lineIndex - 1]?.trim() || null) : null,
      nextLine:
        a.lineIndex + 1 < lines.length ? (lines[a.lineIndex + 1]?.trim() || null) : null,
      sectionNumber,
      canonicalTitle,
      canonicalTitleMatch,
      canonicalTitleMatchDecision,
    };
  });
}

function repairCommaTerminatedNumberedHeadings(text: string): { text: string; repairs: string[] } {
  const repairs: string[] = [];
  const witnessIdx = resolveAuthoritativeWitnessIndex(text || "");
  const head = witnessIdx >= 0 ? text.slice(0, witnessIdx) : text;
  const tail = witnessIdx >= 0 ? text.slice(witnessIdx) : "";
  const lines = head.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!;
    const trimmed = line.trim();
    const prefix = parseMainSectionPrefixLine(trimmed);
    if (prefix && /,\s*$/.test(prefix.title) && !isIncompletePaidProHeadingTitle(prefix.title)) {
      const nextIdx = nextNonEmptyLineIndex(lines, i + 1);
      if (nextIdx == null) {
        const cleaned = `${prefix.sectionNum}. ${prefix.title.replace(/,\s*$/, "").trim()}`;
        out.push(cleaned);
        repairs.push(`comma_heading_trim:${prefix.sectionNum}`);
        continue;
      }
      const nextTrimmed = lines[nextIdx]!.trim();
      if (!isPaidProHeadingContinuationFragment(nextTrimmed)) {
        const cleaned = `${prefix.sectionNum}. ${prefix.title.replace(/,\s*$/, "").trim()}`;
        out.push(cleaned);
        repairs.push(`comma_heading_trim:${prefix.sectionNum}`);
        continue;
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

export function applyPaidProSectionHeadingTitleAuthority(text: string): {
  text: string;
  repairs: string[];
} {
  const repairs: string[] = [];
  let out = (text || "").replace(/\r\n/g, "\n");

  const multilineTitle = repairMultilinePaidProAgreementDocumentTitle(out);
  if (multilineTitle.repairs.length > 0) {
    out = multilineTitle.text;
    repairs.push(...multilineTitle.repairs);
  }

  const fragmentMerge = repairOrphanNumberFragmentContinuationLines(out);
  if (fragmentMerge.repairs.length > 0) {
    out = fragmentMerge.text;
    repairs.push(...fragmentMerge.repairs.map((r) => `orphan_fragment:${r}`));
  }

  const commaTrim = repairCommaTerminatedNumberedHeadings(out);
  if (commaTrim.repairs.length > 0) {
    out = commaTrim.text;
    repairs.push(...commaTrim.repairs.map((r) => `comma_heading:${r}`));
  }

  const split = repairSplitPaidProHeadingFragments(out);
  if (split.repairs.length > 0) {
    out = split.text;
    repairs.push(...split.repairs.map((r) => `split_heading:${r}`));
  }

  const orphans = repairOrphanSemanticHeadingFragmentsBeforeCanonicalHeadings(out);
  if (orphans.repairs.length > 0) {
    out = orphans.text;
    repairs.push(...orphans.repairs.map((r) => `orphan_fragment:${r}`));
  }

  const splitAgain = repairSplitPaidProHeadingFragments(out);
  if (splitAgain.repairs.length > 0) {
    out = splitAgain.text;
    repairs.push(...splitAgain.repairs.map((r) => `split_heading:${r}`));
  }

  if (hasFalseFragmentSectionHeading(out)) {
    const retry = repairOrphanNumberFragmentContinuationLines(out);
    if (retry.repairs.length > 0) {
      out = retry.text;
      repairs.push(...retry.repairs.map((r) => `orphan_fragment_retry:${r}`));
    }
  }

  return { text: out, repairs };
}

/**
 * Detects synthetic / repair-inserted section headings that must never ship as frozen Pro SoT.
 */

import { resolveAuthoritativeWitnessIndex } from "./paidProExecutionBlockNormalization";
import { isPaidProNumberedSectionHeadingLine } from "./paidProNumberedSectionHeading";

export type PaidProSyntheticMalformedSectionHeading = {
  lineIndex: number;
  line: string;
  code:
    | "generic_section_parent"
    | "duplicate_major_minor_prefix"
    | "generic_section_intermediate"
    | "provisions_glued_intermediate"
    | "generic_general_provisions"
    | "empty_numbered_subsection"
    | "heading_body_collapse_line";
};

const GENERIC_SECTION_PARENT_RE = /^\d+\.\s+SECTION\s*$/i;
const DUPLICATE_MAJOR_MINOR_PREFIX_RE = /^\d+\s+\d+\.\d+/;
const GENERIC_SECTION_INTERMEDIATE_RE = /^\d+\.\d+\s+Section\s*$/i;
const PROVISIONS_GLUED_INTERMEDIATE_RE = /^\d+\.\d+\s+Provisions\s+\d+\.\d+/i;
const GENERIC_GENERAL_PROVISIONS_RE = /^\d+\.\d+\s+General Provisions\s*$/i;
const SUBSECTION_HEADING_RE = /^(\d+)\.(\d+)(?:\.(\d+))?\s+(.+)$/;

/** Real clause titles (e.g. "Initial Payment.") — not empty synthetic subsection shells. */
function isSubstantiveSubsectionTitle(title: string): boolean {
  const t = title.trim();
  if (t.length < 5) return false;
  if (/^Section\s*$/i.test(t)) return false;
  if (/^General Provisions\s*$/i.test(t)) return false;
  if (/^Provisions\s+\d+\.\d+/i.test(t)) return false;
  return /[a-z]/i.test(t) && (/\s/.test(t) || t.endsWith("."));
}

function isProseBodyLine(trimmed: string): boolean {
  if (!trimmed) return false;
  if (GENERIC_SECTION_PARENT_RE.test(trimmed)) return false;
  if (SUBSECTION_HEADING_RE.test(trimmed)) return false;
  if (/^\d+\.\s+(?!\d)/.test(trimmed) && isPaidProNumberedSectionHeadingLine(trimmed)) return false;
  if (/^IN WITNESS WHEREOF\b/i.test(trimmed)) return false;
  return trimmed.length >= 8 && /[a-z]/i.test(trimmed);
}

/** Scan operative text for synthetic malformed numbered headings and empty subsection shells. */
export function detectPaidProSyntheticMalformedSectionHeadings(text: string): PaidProSyntheticMalformedSectionHeading[] {
  const witnessIdx = resolveAuthoritativeWitnessIndex(text || "");
  const head = witnessIdx >= 0 ? text.slice(0, witnessIdx) : text;
  const lines = head.replace(/\r\n/g, "\n").split("\n");
  const findings: PaidProSyntheticMalformedSectionHeading[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i]!.trim();
    if (!trimmed) continue;

    if (GENERIC_SECTION_PARENT_RE.test(trimmed)) {
      findings.push({ lineIndex: i, line: trimmed, code: "generic_section_parent" });
      continue;
    }
    if (DUPLICATE_MAJOR_MINOR_PREFIX_RE.test(trimmed)) {
      findings.push({ lineIndex: i, line: trimmed, code: "duplicate_major_minor_prefix" });
      continue;
    }
    if (GENERIC_SECTION_INTERMEDIATE_RE.test(trimmed)) {
      findings.push({ lineIndex: i, line: trimmed, code: "generic_section_intermediate" });
      continue;
    }
    if (PROVISIONS_GLUED_INTERMEDIATE_RE.test(trimmed)) {
      findings.push({ lineIndex: i, line: trimmed, code: "provisions_glued_intermediate" });
      continue;
    }
    if (GENERIC_GENERAL_PROVISIONS_RE.test(trimmed)) {
      findings.push({ lineIndex: i, line: trimmed, code: "generic_general_provisions" });
      continue;
    }

    const subMatch = trimmed.match(SUBSECTION_HEADING_RE);
    if (subMatch?.[1] && subMatch[2] && subMatch[4]) {
      const title = subMatch[4].trim();
      if (/^Provisions\s+\d+\.\d+/i.test(title)) {
        findings.push({ lineIndex: i, line: trimmed, code: "provisions_glued_intermediate" });
      }
      if (/^Section\s*$/i.test(title)) {
        findings.push({ lineIndex: i, line: trimmed, code: "generic_section_intermediate" });
      }
      if (/^General Provisions\s*$/i.test(title)) {
        let hasBody = false;
        for (let j = i + 1; j < lines.length; j += 1) {
          const next = lines[j]!.trim();
          if (!next) continue;
          if (SUBSECTION_HEADING_RE.test(next) || isPaidProNumberedSectionHeadingLine(next)) break;
          if (isProseBodyLine(next)) {
            hasBody = true;
            break;
          }
        }
        if (!hasBody) {
          findings.push({ lineIndex: i, line: trimmed, code: "generic_general_provisions" });
        }
      }
      continue;
    }

    if (isPaidProNumberedSectionHeadingLine(trimmed)) {
      const glued = trimmed.match(/^(\d+\.\s+(?!\d+\.\d).+?)\s+(\d+\.\d+\s+.+)$/);
      if (glued) {
        findings.push({ lineIndex: i, line: trimmed, code: "heading_body_collapse_line" });
      }
    }
  }

  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i]!.trim();
    const subMatch = trimmed.match(SUBSECTION_HEADING_RE);
    if (!subMatch?.[4]) continue;
    const titleText = subMatch[4].trim();
    if (titleText.length >= 20 && /\.\s+[A-Za-z]/.test(titleText)) {
      continue;
    }
    if (
      GENERIC_SECTION_INTERMEDIATE_RE.test(trimmed) ||
      GENERIC_GENERAL_PROVISIONS_RE.test(trimmed) ||
      PROVISIONS_GLUED_INTERMEDIATE_RE.test(trimmed)
    ) {
      continue;
    }
    let hasBody = false;
    for (let j = i + 1; j < lines.length; j += 1) {
      const next = lines[j]!.trim();
      if (!next) continue;
      if (SUBSECTION_HEADING_RE.test(next) || isPaidProNumberedSectionHeadingLine(next)) break;
      if (isProseBodyLine(next)) {
        hasBody = true;
        break;
      }
    }
    if (!hasBody && !isSubstantiveSubsectionTitle(titleText)) {
      findings.push({ lineIndex: i, line: trimmed, code: "empty_numbered_subsection" });
    }
  }

  return findings;
}

export function corpusHasPaidProSyntheticMalformedSectionHeadings(text: string): boolean {
  return detectPaidProSyntheticMalformedSectionHeadings(text).length > 0;
}

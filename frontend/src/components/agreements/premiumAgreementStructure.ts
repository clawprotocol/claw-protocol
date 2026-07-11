/**
 * Final structural validation + deterministic repair for LawDog Pro agreement bodies.
 * Runs once after polish; never leaves blank numbered headings on screen.
 */

import { parseAgreementSections } from "./proOperationalSynthesis/sectionPurityValidator";
import { shouldLogPremiumStructureRepair } from "./paidProDiagnosticLogPolicy";
import { repairPaidProOrphanSectionNumbers } from "./paidProOrphanSectionNumberRepair";
import { analyzePaidProSectionStructureCompleteness } from "./paidProSectionStructureCompletenessAuthority";
import { tracePaidProQaPassWithText } from "./paidProQaPerfTrace";

export type PremiumStructureIssue = {
  code: string;
  message: string;
  repaired?: boolean;
};

export type PremiumStructureResult = {
  text: string;
  ok: boolean;
  issues: PremiumStructureIssue[];
  repairs: string[];
};

const DUPLICATE_PHRASE_FIXES: readonly { re: RegExp; replacement: string }[] = [
  {
    re: /\bdesignated operational contacts through designated operational contacts\b/gi,
    replacement: "designated operational contacts",
  },
  {
    re: /\bthrough designated operational contacts identified in the Notices section through designated operational contacts\b/gi,
    replacement: "through designated operational contacts identified in the Notices section",
  },
];

const ORPHAN_TERM_SENTENCE_RE =
  /^\s*The initial term of this Agreement begins on the date of the last signature below[^.!?]*[.!?]\s*$/gim;

const DISPUTE_SENTENCE_RE =
  /\b(?:Any\s+)?[Dd]ispute(?:s)?\s+shall\s+be\s+(?:resolved|settled|submitted)[^.!?]*[.!?]\s*/g;

const MILESTONE_TABLE_INLINE_RE =
  /\n\s*IMPLEMENTATION MILESTONES\s*\n[\s\S]*?(?=\n\s*\d+\.\d+\s+[A-Z]|\n\s*\d+\.\s+[A-Z]|\n\s*[A-Z][A-Z0-9\s/&-]{4,}\s*\n|$)/gi;

const REPEATED_GOOD_FAITH_FILLER =
  "The Parties shall perform their obligations in good faith and in accordance with this Agreement.";

const GENERIC_CLAUSE_BY_TOPIC: Record<string, string> = {
  payment: "Fees and payment timing will be confirmed in writing before execution.",
  invoicing: "Invoices will be sent to the billing contact identified in the Notices section.",
  warranty:
    "Each Party represents that it has authority to enter into this Agreement. Services are provided in a professional manner consistent with industry standards.",
  liability:
    "Except as expressly stated, neither Party is liable for indirect or consequential damages. Direct damages are limited as set forth in the Limitation of Liability section.",
  general:
    "The Parties shall perform their obligations in good faith and in accordance with this Agreement.",
};

function topicForEmptyHeading(heading: string): keyof typeof GENERIC_CLAUSE_BY_TOPIC | "general" {
  const h = heading.toLowerCase();
  if (/invoic|payment|fee/.test(h)) return "invoicing";
  if (/warrant/.test(h)) return "warranty";
  if (/liabilit|cap|limitation/.test(h)) return "liability";
  if (/payment|compensation/.test(h)) return "payment";
  return "general";
}

function genericClauseForHeading(heading: string): string {
  const key = topicForEmptyHeading(heading);
  return GENERIC_CLAUSE_BY_TOPIC[key] ?? GENERIC_CLAUSE_BY_TOPIC.general;
}

/** Line-level scrub when section parser misses short governance blocks. */
function scrubDisputeLinesGlobally(text: string): { text: string; removed: number } {
  let removed = 0;
  let inDisputeSection = false;
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^\d+\.?\s+/.test(trimmed) || /^[A-Z][A-Z0-9\s/&-]{4,}$/.test(trimmed)) {
      inDisputeSection = /dispute|arbitration|mediation|governing\s+law/i.test(trimmed);
    }
    if (
      !inDisputeSection &&
      /\b(?:Any\s+)?[Dd]ispute(?:s)?\s+shall\s+be\s+(?:resolved|settled|submitted)\b/i.test(line)
    ) {
      removed += 1;
      continue;
    }
    out.push(line);
  }
  return { text: out.join("\n").replace(/\n{3,}/g, "\n\n"), removed };
}

/** Remove dispute escalation sentences outside dispute / governing-law sections. */
function scrubDisputeLanguageOutsideDisputeSection(text: string): { text: string; removed: number } {
  const sections = parseAgreementSections(text);
  if (!sections.length) return { text, removed: 0 };
  let removed = 0;
  let out = text;
  for (const sec of sections) {
    if (sec.kind === "dispute" || /dispute|arbitration|governing\s+law|mediation/i.test(sec.heading)) continue;
    if (sec.kind === "termination" && /term\b/i.test(sec.heading) && !/dispute/i.test(sec.heading)) {
      /* allow term section */
    }
    const body = sec.body;
    const cleaned = body.replace(DISPUTE_SENTENCE_RE, () => {
      removed += 1;
      return "";
    });
    if (cleaned !== body) {
      out = out.replace(body, cleaned);
    }
  }
  return { text: out.replace(/\n{3,}/g, "\n\n"), removed };
}

/** Drop orphan effective-date sentence when it sits alone before a unrelated section. */
function scrubOrphanEffectiveDateSentence(text: string): { text: string; removed: number } {
  const sections = parseAgreementSections(text);
  let removed = 0;
  let out = text;
  for (const sec of sections) {
    if (sec.kind === "termination" || /term|duration|renewal/i.test(sec.heading)) continue;
    const m = ORPHAN_TERM_SENTENCE_RE.exec(sec.body);
    ORPHAN_TERM_SENTENCE_RE.lastIndex = 0;
    if (m) {
      out = out.replace(m[0], "");
      removed += 1;
    }
  }
  out = out.replace(ORPHAN_TERM_SENTENCE_RE, "");
  return { text: out.replace(/\n{3,}/g, "\n\n"), removed };
}

/** Drop repeated generic good-faith filler beyond two occurrences. */
function scrubRepeatedGoodFaithFiller(text: string): { text: string; removed: number } {
  const low = REPEATED_GOOD_FAITH_FILLER.toLowerCase();
  let removed = 0;
  let count = 0;
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  for (const line of lines) {
    if (line.toLowerCase().includes(low)) {
      count += 1;
      if (count > 2) {
        removed += 1;
        continue;
      }
    }
    out.push(line);
  }
  return { text: out.join("\n").replace(/\n{3,}/g, "\n\n"), removed };
}

/** Remove milestone table blocks embedded inside non-milestone sections (e.g. mid 4.1 or Notices). */
function scrubMisplacedMilestoneBlocks(text: string): { text: string; removed: number } {
  let removed = 0;
  let searchFrom = 0;
  let out = text;
  for (;;) {
    MILESTONE_TABLE_INLINE_RE.lastIndex = searchFrom;
    const m = MILESTONE_TABLE_INLINE_RE.exec(out);
    if (!m) break;
    const block = m[0];
    const offset = m.index;
    const before = out.slice(0, offset);
    const headWindow = before.slice(-600);
    const inNotices = /\bnotices\b/i.test(headWindow) && !/\bimplementation\s+milestones\b/i.test(
      headWindow.split("\n").slice(-2).join("\n"),
    );
    const sections = parseAgreementSections(before + block);
    const last = sections[sections.length - 1];
    const inMilestoneSection =
      last &&
      (last.kind === "milestones" || /^(?:\d+\.\s+)?implementation\s+milestones\b/i.test(last.heading.trim()));
    if (!inMilestoneSection || inNotices) {
      out = out.slice(0, offset) + "\n" + out.slice(offset + block.length);
      removed += 1;
      searchFrom = offset;
      continue;
    }
    searchFrom = offset + block.length;
  }
  return { text: out.replace(/\n{3,}/g, "\n\n"), removed };
}

/** Fill or remove empty numbered subsections (e.g. "5.3 Invoicing." with no body). */
function repairEmptyNumberedSubsections(text: string): { text: string; filled: number; removed: number } {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let filled = 0;
  let removed = 0;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const m = line.match(/^(\s*)(\d+\.\d+)\s+(.+?)\.?\s*$/);
    if (!m) {
      out.push(line);
      i += 1;
      continue;
    }
    const heading = m[3].trim();
    const bodyLines: string[] = [];
    let j = i + 1;
    while (j < lines.length) {
      const next = lines[j];
      if (/^\s*\d+\.\d+\s+/.test(next) || /^\s*\d+\.\s+[A-Z]/.test(next)) break;
      if (
        next.trim().length >= 8 &&
        !/^\s*IMPLEMENTATION MILESTONES\s*$/i.test(next) &&
        !/^\s*[-|]\s*$/.test(next)
      ) {
        bodyLines.push(next);
      }
      if (/^\s*[A-Z][A-Z0-9\s/&-]{4,}\s*$/.test(next.trim()) && bodyLines.length === 0) break;
      j += 1;
    }
    const bodyText = bodyLines.join("\n").trim();
    const substantive =
      bodyText.length >= 40 &&
      !/^\s*\d+\.\d+\s+/.test(bodyText) &&
      !/^\s*IMPLEMENTATION MILESTONES\s*$/i.test(bodyText);
    if (substantive) {
      out.push(line, ...bodyLines);
      i = j;
      continue;
    }
    const clause = genericClauseForHeading(heading);
    if (clause.length >= 24) {
      out.push(line, "", clause);
      filled += 1;
    } else {
      removed += 1;
    }
    i = j;
  }
  return { text: out.join("\n").replace(/\n{3,}/g, "\n\n"), filled, removed };
}

export function validatePremiumAgreementStructure(text: string): PremiumStructureResult {
  const issues: PremiumStructureIssue[] = [];
  const repairs: string[] = [];
  let working = (text || "").trim();
  if (!working) {
    return { text: "", ok: false, issues: [{ code: "empty", message: "Empty document" }], repairs };
  }

  for (const { re, replacement } of DUPLICATE_PHRASE_FIXES) {
    const before = working;
    working = working.replace(re, replacement);
    if (working !== before) repairs.push("duplicate_phrase");
  }

  const disputeGlobal = scrubDisputeLinesGlobally(working);
  working = disputeGlobal.text;
  if (disputeGlobal.removed > 0) repairs.push(`dispute_line_removed:${disputeGlobal.removed}`);

  const dispute = scrubDisputeLanguageOutsideDisputeSection(working);
  working = dispute.text;
  if (dispute.removed > 0) repairs.push(`dispute_relocated:${dispute.removed}`);

  const orphan = scrubOrphanEffectiveDateSentence(working);
  working = orphan.text;
  if (orphan.removed > 0) repairs.push("orphan_term_sentence");

  const milestone = scrubMisplacedMilestoneBlocks(working);
  working = milestone.text;
  if (milestone.removed > 0) repairs.push("misplaced_milestone_block");

  const filler = scrubRepeatedGoodFaithFiller(working);
  working = filler.text;
  if (filler.removed > 0) repairs.push(`repeated_good_faith_removed:${filler.removed}`);

  const orphanSections = repairPaidProOrphanSectionNumbers(working);
  working = orphanSections.text;
  if (orphanSections.repairs.length > 0) {
    repairs.push(...orphanSections.repairs);
  }

  const emptySubs = repairEmptyNumberedSubsections(working);
  working = emptySubs.text;
  if (emptySubs.filled > 0) repairs.push(`empty_subsection_filled:${emptySubs.filled}`);
  if (emptySubs.removed > 0) repairs.push(`empty_subsection_removed:${emptySubs.removed}`);

  const sections = parseAgreementSections(working);
  for (const sec of sections) {
    const body = sec.body.trim();
    if (body.length < 20 && /^\d/.test(sec.heading)) {
      issues.push({
        code: "thin_section",
        message: `Section "${sec.heading}" lacks substantive body`,
        repaired: emptySubs.filled > 0,
      });
    }
  }

  if (/\bdesignated operational contacts through designated operational contacts\b/i.test(working)) {
    issues.push({ code: "duplicate_phrase", message: "Duplicated operational contacts phrase" });
  }
  if (DISPUTE_SENTENCE_RE.test(working)) {
    const nonDispute = sections.filter((s) => s.kind !== "dispute" && !/dispute|arbitration/i.test(s.heading));
    for (const sec of nonDispute) {
      if (DISPUTE_SENTENCE_RE.test(sec.body)) {
        issues.push({
          code: "dispute_out_of_place",
          message: `Dispute language in section "${sec.heading}"`,
          repaired: dispute.removed > 0,
        });
        DISPUTE_SENTENCE_RE.lastIndex = 0;
      }
    }
  }

  const completeness = analyzePaidProSectionStructureCompleteness(working);
  if (completeness.missingParentSections.length > 0) {
    issues.push({
      code: "missing_parent_sections",
      message: `Missing parent sections: ${completeness.missingParentSections.join(", ")}`,
    });
  }
  if (completeness.missingIntermediateSections.length > 0) {
    issues.push({
      code: "missing_intermediate_sections",
      message: `Missing ancestor subsections: ${completeness.missingIntermediateSections.slice(0, 6).join(", ")}`,
    });
  }
  if (completeness.sequenceGaps.length > 0) {
    const gapSummary = completeness.sequenceGaps
      .slice(0, 4)
      .map((g) => `${g.parentMajor}:[${g.missingSiblings.slice(0, 4).join(",")}]`)
      .join("; ");
    issues.push({
      code: "section_sequence_gaps",
      message: `Non-contiguous subsection numbering: ${gapSummary}`,
    });
  }
  if (completeness.truncatedFamilies.length > 0) {
    issues.push({
      code: "truncated_section_families",
      message: `Truncated section families: ${completeness.truncatedFamilies.join(", ")}`,
    });
  }

  const ok =
    issues.filter((i) => !i.repaired).length === 0 &&
    completeness.missingParentSections.length === 0 &&
    completeness.missingIntermediateSections.length === 0;
  return { text: working, ok, issues, repairs };
}

export function validateAndRepairPremiumAgreementStructure(
  text: string,
  opts?: { surface?: string },
): PremiumStructureResult {
  const surface = opts?.surface ?? "premium_structure_repair";
  return tracePaidProQaPassWithText("premium-structure-repair", surface, text, () =>
    validateAndRepairPremiumAgreementStructureCore(text),
  );
}

function validateAndRepairPremiumAgreementStructureCore(text: string): PremiumStructureResult {
  const result = validatePremiumAgreementStructure(text);
  if (import.meta.env.MODE !== "test" && shouldLogPremiumStructureRepair(result.repairs)) {
    // eslint-disable-next-line no-console
    console.info("[premium-structure-repair]", {
      repairs: result.repairs,
      issueCount: result.issues.length,
      ok: result.ok,
    });
  }
  return result;
}

/**
 * Final render integrity — block or repair before user-visible agreement output ships.
 */

import { collectForbiddenTemplateFragments } from "../agreementTemplatePlaceholderSafety";
import { repairGluedSectionHeadingsInText, splitGluedSectionHeadingFromLine } from "../documentSectionHeadingSplit";
import { repairMalformedSectionNumbering } from "../starterPreviewFormatting";
import { parseAgreementSections } from "../proOperationalSynthesis/sectionPurityValidator";
import { suppressRepeatedBoilerplate } from "./boilerplateContaminationGuard";
import type { AgreementOutputQualityContext, IntegrityIssue, IntegrityResult } from "./types";

const BLANK_NUMBERED_SECTION_RE = /^\s*(\d+)\.\s*$/m;
const DANGLING_NUMBER_RE = /^\s*(\d+)\.\s*$/m;
const TRUNCATED_HEADING_RE = /^\s*\d+\.?\s+[A-Z]{0,2}\s*$/m;
const DUPLICATE_SIGNATURE_RE =
  /(?:IN WITNESS WHEREOF|IN WITNESS WHERE OF)[\s\S]*?(?:IN WITNESS WHEREOF|IN WITNESS WHERE OF)/gi;
const PAYMENT_IN_NON_PAYMENT_RE =
  /\b(?:invoice|milestone or service period)\b/i;
const IMPLEMENTATION_IN_NOTICES_RE =
  /\b(?:notices?|counterparts?|electronic\s+signatures?)\b[\s\S]{0,600}implementation\s+milestones/i;
const MALFORMED_DOUBLE_NUM_LINE_RE = /^\s*\d+\.\s+\d+\.\s+\S/m;
const COLLAPSED_HEADING_BODY_RE = /^\s*\d+\.\s+[^.\n]{2,72}\.\s+[A-Z][a-z]/m;

function repairCollapsedHeadingLines(text: string): { text: string; fixed: number } {
  const before = text;
  const repaired = repairGluedSectionHeadingsInText(text);
  const lines = repaired.replace(/\r\n/g, "\n").split("\n");
  let fixed = 0;
  const out = lines.map((line) => {
    const split = splitGluedSectionHeadingFromLine(line);
    if (split !== line) {
      fixed += 1;
      return split;
    }
    const m = line.match(/^(\s*\d+\.\s+[^.\n]{2,72})\.\s+([A-Z][a-z].+)$/);
    if (!m) return line;
    fixed += 1;
    return `${m[1]}\n${m[2]}`;
  });
  const joined = out.join("\n");
  if (joined !== before) fixed = Math.max(fixed, 1);
  return { text: joined, fixed };
}

function detectMissingSubsectionNumbers(text: string): IntegrityIssue[] {
  const issues: IntegrityIssue[] = [];
  const nums = [...text.matchAll(/^\s*(\d+)\.(\d+)\s+/gm)].map((m) => ({
    major: parseInt(m[1], 10),
    minor: parseInt(m[2], 10),
  }));
  if (nums.length < 3) return issues;
  const byMajor = new Map<number, number[]>();
  for (const n of nums) {
    const arr = byMajor.get(n.major) ?? [];
    arr.push(n.minor);
    byMajor.set(n.major, arr);
  }
  for (const [major, minors] of byMajor) {
    const sorted = [...new Set(minors)].sort((a, b) => a - b);
    if (sorted.length < 2 || sorted[0] > 1) continue;
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] - sorted[i - 1] > 1) {
        issues.push({
          code: "missing_subsection_number",
          message: `Gap in section ${major} numbering (${sorted[i - 1]} → ${sorted[i]})`,
          repaired: false,
        });
        break;
      }
    }
  }
  return issues;
}

function repairBlankNumberedSections(text: string): { text: string; fixed: number } {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let fixed = 0;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (BLANK_NUMBERED_SECTION_RE.test(line) && line.trim().match(/^\d+\.\s*$/)) {
      fixed += 1;
      i += 1;
      continue;
    }
    const trunc = line.match(/^\s*(\d+)\.?\s+(.+?)\s*$/);
    if (trunc && trunc[2].trim().length < 3) {
      fixed += 1;
      i += 1;
      continue;
    }
    out.push(line);
    i += 1;
  }
  return { text: out.join("\n"), fixed };
}

function repairDuplicateSignatureBlocks(text: string): { text: string; fixed: number } {
  if (!DUPLICATE_SIGNATURE_RE.test(text)) return { text, fixed: 0 };
  DUPLICATE_SIGNATURE_RE.lastIndex = 0;
  const first = text.search(/IN WITNESS WHEREOF/i);
  if (first < 0) return { text, fixed: 0 };
  const second = text.indexOf("IN WITNESS WHEREOF", first + 20);
  if (second < 0) return { text, fixed: 0 };
  return { text: text.slice(0, second).trimEnd(), fixed: 1 };
}

function detectSectionContamination(text: string): IntegrityIssue[] {
  const issues: IntegrityIssue[] = [];
  if (IMPLEMENTATION_IN_NOTICES_RE.test(text)) {
    issues.push({
      code: "milestone_in_notices",
      message: "Implementation milestones block inside Notices",
    });
  }
  const sections = parseAgreementSections(text);
  for (const sec of sections) {
    if (sec.kind === "payment" || /payment|fees/i.test(sec.heading)) continue;
    if (sec.kind === "contacts" || /notices?/i.test(sec.heading)) continue;
    if (PAYMENT_IN_NON_PAYMENT_RE.test(sec.body) && sec.body.length < 400) {
      issues.push({
        code: "payment_leak",
        message: `Payment/invoice language in section "${sec.heading}"`,
      });
    }
  }
  return issues;
}

export function validateAndRepairFinalRenderIntegrity(
  text: string,
  ctx: AgreementOutputQualityContext,
): IntegrityResult {
  const issues: IntegrityIssue[] = [];
  const repairs: string[] = [];
  let working = (text || "").trim();
  if (!working) {
    return { ok: false, text: "", issues: [{ code: "empty", message: "Empty document" }], repairs };
  }

  const boiler = suppressRepeatedBoilerplate(working);
  if (boiler.removedCount > 0) {
    working = boiler.text;
    repairs.push(`boilerplate_removed:${boiler.removedCount}`);
  }

  const blank = repairBlankNumberedSections(working);
  if (blank.fixed > 0) {
    working = blank.text;
    repairs.push(`blank_sections_removed:${blank.fixed}`);
  }

  const numbering = repairMalformedSectionNumbering(working);
  if (numbering.fixed > 0) {
    working = numbering.text;
    repairs.push(`malformed_numbering_repaired:${numbering.fixed}`);
  }

  const collapsed = repairCollapsedHeadingLines(working);
  if (collapsed.fixed > 0) {
    working = collapsed.text;
    repairs.push(`collapsed_heading_split:${collapsed.fixed}`);
  }

  if (MALFORMED_DOUBLE_NUM_LINE_RE.test(working)) {
    issues.push({ code: "malformed_double_number", message: "Malformed section numbering (e.g. 4. 5.)" });
  }
  if (ctx.tier === "premium" && COLLAPSED_HEADING_BODY_RE.test(working)) {
    issues.push({
      code: "collapsed_heading_body",
      message: "Section heading merged with body on same line",
      repaired: collapsed.fixed > 0,
    });
  }

  for (const sub of detectMissingSubsectionNumbers(working)) {
    issues.push(sub);
  }

  const sig = repairDuplicateSignatureBlocks(working);
  if (sig.fixed > 0) {
    working = sig.text;
    repairs.push("duplicate_signature_block_removed");
  }

  if (DANGLING_NUMBER_RE.test(working)) {
    issues.push({ code: "dangling_number", message: "Dangling section number", repaired: blank.fixed > 0 });
  }
  if (TRUNCATED_HEADING_RE.test(working)) {
    issues.push({ code: "truncated_heading", message: "Truncated section heading", repaired: blank.fixed > 0 });
  }

  const contamination = detectSectionContamination(working);
  for (const c of contamination) {
    issues.push({ ...c, repaired: false });
  }

  const intake = (ctx.intakeRaw || "").trim();
  const remaining = collectForbiddenTemplateFragments(working, intake);
  if (remaining.length > 0) {
    issues.push({
      code: "unresolved_placeholder",
      message: `Unresolved placeholders: ${remaining.slice(0, 3).join("; ")}`,
    });
  }

  const fatal = issues.filter((i) => !i.repaired);
  return {
    ok: fatal.length === 0,
    text: working,
    issues,
    repairs,
  };
}

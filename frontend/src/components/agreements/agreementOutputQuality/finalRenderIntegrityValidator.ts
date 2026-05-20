/**
 * Final render integrity — block or repair before user-visible agreement output ships.
 */

import { collectForbiddenTemplateFragments } from "../agreementTemplatePlaceholderSafety";
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
const IMPLEMENTATION_IN_NOTICES_RE = /\bnotices?\b[\s\S]{0,600}implementation\s+milestones/i;

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

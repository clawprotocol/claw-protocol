/**
 * Final Pro-body hard integrity gate — banned scaffolds, empty shells, Schedule A, advisor cleanup.
 */

import { parseAgreementSections } from "../proOperationalSynthesis/sectionPurityValidator";
import type { ProCompletenessContext } from "../proAgreementCompleteness/types";
import { neutralFallbackForTopic } from "../proAgreementCompleteness/familyFallbackLanguage";

const BANNED_LINE_PATTERNS: readonly RegExp[] = [
  /unless a different period is stated in a schedule/i,
  /Until then, this Section is intentionally left for completion before signing/i,
  /^\s*Invoicing and Payment\.?\s*$/i,
  /^\s*Confidentiality Obligations\.?\s*$/i,
  /^\s*Exclusions\.?\s*$/i,
  /^\s*Required Disclosure\.?\s*$/i,
  /^\s*signature\.\s*$/i,
  /Sections that by their nature should/i,
];

const HEADING_ONLY_RE = /^\s*(\d+(?:\.\d+)*)\s+(.+?)\.?\s*$/;
const SUBSTANTIVE_MIN = 40;

const SCHEDULE_A_STUB =
  "Specific compensation mechanics will be completed in Schedule A before execution.";

const SCHEDULE_A_HEADER = "SCHEDULE A\nCOMPENSATION TERMS";

function isGrowthAdvisorIntake(intakeRaw?: string | null): boolean {
  const t = (intakeRaw || "").toLowerCase();
  return /\bgrowth\s+advisor\b/.test(t) || /\brevenue\s+share\s+on\s+intro/.test(t) || /\badvisor\b.*\bintro/.test(t);
}

function intakeMentionsMilestones(intakeRaw?: string | null): boolean {
  return /\bmilestone|deliverable|implementation\s+plan|project\s+plan\b/i.test(intakeRaw || "");
}

function scrubBannedLines(text: string): { text: string; repairs: string[] } {
  const repairs: string[] = [];
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  for (const line of lines) {
    if (BANNED_LINE_PATTERNS.some((re) => re.test(line.trim()) || re.test(line))) {
      repairs.push("banned_line_removed");
      continue;
    }
    out.push(line);
  }
  return { text: out.join("\n").replace(/\n{3,}/g, "\n\n"), repairs };
}

function safeFallbackForHeading(heading: string, ctx: ProCompletenessContext): string {
  const h = heading.toLowerCase();
  const advisor = isGrowthAdvisorIntake(ctx.intakeRaw);
  if (/confidential/i.test(h)) {
    return neutralFallbackForTopic("confidentiality", ctx.agreementFamily ?? undefined);
  }
  if (/invoic|payment|compensation|fee/i.test(h)) {
    if (advisor) {
      return "Compensation for introductions and advisory services will be as set forth in Schedule A or confirmed in writing before execution.";
    }
    return "Fees and payment timing will be confirmed in writing before execution.";
  }
  if (/exclusion|disclosure/i.test(h)) {
    return "Standard exceptions to confidentiality apply as described in this Agreement.";
  }
  if (advisor && /service|scope|advisor/i.test(h)) {
    return "Advisor will provide introductions, pipeline support, strategic advice, and enterprise customer development support as described in this Agreement.";
  }
  return neutralFallbackForTopic("general", ctx.agreementFamily ?? undefined);
}

function repairEmptyNumberedHeadings(text: string, ctx: ProCompletenessContext): { text: string; repairs: string[] } {
  const repairs: string[] = [];
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const m = line.match(HEADING_ONLY_RE);
    if (!m) {
      out.push(line);
      i += 1;
      continue;
    }
    const title = m[2].trim();
    const bodyLines: string[] = [];
    let j = i + 1;
    while (j < lines.length) {
      const next = lines[j];
      if (HEADING_ONLY_RE.test(next.trim()) || /^\s*\d+\.\s+[A-Z]/.test(next)) break;
      if (next.trim().length >= 8) bodyLines.push(next);
      j += 1;
    }
    const body = bodyLines.join("\n").trim();
    if (body.length >= SUBSTANTIVE_MIN) {
      out.push(line, ...bodyLines);
      i = j;
      continue;
    }
    const fallback = safeFallbackForHeading(title, ctx);
    out.push(line, "", fallback);
    repairs.push(`empty_heading_filled:${title.slice(0, 32)}`);
    i = j;
  }
  return { text: out.join("\n").replace(/\n{3,}/g, "\n\n"), repairs };
}

function scrubAdvisorOperationalSplice(text: string, intakeRaw?: string | null): { text: string; repairs: string[] } {
  if (!isGrowthAdvisorIntake(intakeRaw) || intakeMentionsMilestones(intakeRaw)) {
    return { text, repairs: [] };
  }
  const repairs: string[] = [];
  let working = text;
  const patterns = [
    /\bimplementation\s+(?:plan|schedule|milestones?)\b[^.!?]*[.!?]\s*/gi,
    /\benterprise\s+implementation\b[^.!?]*[.!?]\s*/gi,
    /\boperational\s+plan\b[^.!?]*[.!?]\s*/gi,
    /\bmilestone(?:-based)?\s+(?:payments?|fees?)\b[^.!?]*[.!?]\s*/gi,
  ];
  for (const re of patterns) {
    if (re.test(working)) {
      re.lastIndex = 0;
      working = working.replace(re, "");
      repairs.push("advisor_ops_splice_removed");
    }
    re.lastIndex = 0;
  }
  return { text: working.replace(/\n{3,}/g, "\n\n"), repairs };
}

/** Normalize loose Schedule bullets into a headed block or replace with stub reference. */
export function normalizeScheduleAContent(text: string, ctx: ProCompletenessContext): { text: string; repairs: string[] } {
  const repairs: string[] = [];
  let working = text;

  const looseScheduleBullets =
    /\n\s*[-•]\s+(?:compensation|revenue\s+share|referral\s+fee|payout)[^\n]*(?:\n\s*[-•]\s+[^\n]+){0,6}/gi;
  if (looseScheduleBullets.test(working) && !/\bSCHEDULE\s+A\b/i.test(working)) {
    looseScheduleBullets.lastIndex = 0;
    working = working.replace(looseScheduleBullets, `\n\n${SCHEDULE_A_STUB}\n`);
    repairs.push("loose_schedule_bullets→stub");
  }

  if (/\bSCHEDULE\s+A\b/i.test(working)) {
    const hasHeader = /\bSCHEDULE\s+A\s*\n\s*COMPENSATION\s+TERMS\b/i.test(working);
    if (!hasHeader) {
      working = working.replace(/\bSCHEDULE\s+A\b/i, SCHEDULE_A_HEADER);
      repairs.push("schedule_a_header_normalized");
    }
  } else if (/\bcompensation\b.*\b(?:schedule|before execution)\b/i.test(working)) {
    /* already has inline reference */
  } else if (/\b(?:revenue\s+share|referral\s+fee|commission)\b/i.test(ctx.intakeRaw || "")) {
    if (!working.includes(SCHEDULE_A_STUB)) {
      working = `${working.trim()}\n\n${SCHEDULE_A_STUB}\n`;
      repairs.push("schedule_a_stub_appended");
    }
  }

  return { text: working.replace(/\n{3,}/g, "\n\n"), repairs };
}

export function applyProBodyHardIntegrityGate(
  text: string,
  ctx: ProCompletenessContext,
): { text: string; repairs: string[] } {
  const repairs: string[] = [];
  let working = (text || "").trim();
  if (!working) return { text: "", repairs };

  const banned = scrubBannedLines(working);
  working = banned.text;
  repairs.push(...banned.repairs);

  const advisor = scrubAdvisorOperationalSplice(working, ctx.intakeRaw);
  working = advisor.text;
  repairs.push(...advisor.repairs);

  const empty = repairEmptyNumberedHeadings(working, ctx);
  working = empty.text;
  repairs.push(...empty.repairs);

  const schedule = normalizeScheduleAContent(working, ctx);
  working = schedule.text;
  repairs.push(...schedule.repairs);

  const sections = parseAgreementSections(working);
  for (const sec of sections) {
    const body = sec.body.trim();
    if (body.length < SUBSTANTIVE_MIN && /^\d/.test(sec.heading)) {
      const fallback = safeFallbackForHeading(sec.heading.replace(/^\d+(?:\.\d+)*\s+/, ""), ctx);
      working = working.replace(sec.body, `\n${fallback}\n`);
      repairs.push("thin_section_filled");
    }
  }

  const bannedFinal = scrubBannedLines(working);
  working = bannedFinal.text;
  repairs.push(...bannedFinal.repairs);

  return { text: working, repairs };
}

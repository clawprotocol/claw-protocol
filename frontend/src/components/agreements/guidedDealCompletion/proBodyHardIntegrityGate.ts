/**
 * Final Pro-body hard integrity gate — banned scaffolds, empty shells, Schedule A, advisor/referral cleanup.
 */

import { applyClauseCoherenceEngine } from "./clauseCoherenceEngine";
import { parseAgreementSections } from "../proOperationalSynthesis/sectionPurityValidator";
import type { ProCompletenessContext } from "../proAgreementCompleteness/types";
import { neutralFallbackForTopic } from "../proAgreementCompleteness/familyFallbackLanguage";

const BANNED_LINE_PATTERNS: readonly RegExp[] = [
  /unless a different period is stated in a schedule/i,
  /Until then, this Section is intentionally left for completion before signing/i,
  /^\s*signature\.\s*$/i,
  /Sections that by their nature should/i,
];

const BANNED_SENTENCE_PATTERNS: readonly RegExp[] = [
  /\bunless a different period is stated in a schedule\b[^.!?]*[.!?]?/gi,
  /\bUntil then, this Section is intentionally left for completion before signing\b[^.!?]*[.!?]?/gi,
];

const HEADING_ONLY_RE = /^\s*(\d+(?:\.\d+)*)\s+(.+?)\.?\s*$/;
const SUBSTANTIVE_MIN = 40;
const ORPHAN_BODY_RE =
  /^(?:for\s+indirect|to\s+enter\s+into|unless\s+a\s+different|fees\s+and\s+payment\s+timing)/i;

const SCHEDULE_A_STUB =
  "Specific compensation mechanics will be completed in Schedule A before execution.";

const SCHEDULE_A_HEADER = "SCHEDULE A\nCOMPENSATION TERMS";

const MUTUAL_CONFIDENTIALITY_FALLBACK =
  "Each Party may disclose Confidential Information to the other in connection with this Agreement. Each receiving Party will protect such information using reasonable care, use it only for the permitted purpose, and not disclose it except as allowed herein. These obligations survive termination as stated in this Agreement.";

const REFERRAL_PROTECTION_FALLBACK =
  "Introduced opportunities will remain protected for twelve (12) months from introduction, subject to the compensation terms in Schedule A or a signed side letter confirmed before any referral fee is owed.";

const REFERRAL_REVENUE_STUB =
  "Referral compensation will be calculated as a percentage of net collected revenue from introduced customers, as confirmed in Schedule A before any referral fee is owed.";

const SIGNATURE_BLOCK_RE =
  /\n\s*(?:\d+\.?\s*)?SIGNATURES?\s*\n[\s\S]*?(?=\n\s*\d+\.|\n\s*IN WITNESS|\n\s*KEY CONTACTS|\n\s*SCHEDULE\s+[A-Z]|$)/gi;

const MANUAL_SIGNER_LINE_RE =
  /^\s*(?:By:\s*|Name:\s*|Title:\s*|Email:\s*|Date:\s*|Signature:\s*)\s*[_\s-]*\s*$/gim;

function isGrowthAdvisorIntake(intakeRaw?: string | null): boolean {
  const t = (intakeRaw || "").toLowerCase();
  return /\bgrowth\s+advisor\b/.test(t) || /\brevenue\s+share\s+on\s+intro/.test(t) || /\badvisor\b.*\bintro/.test(t);
}

function isReferralChannelIntake(intakeRaw?: string | null): boolean {
  const t = (intakeRaw || "").toLowerCase();
  return (
    /\breferral\b/.test(t) ||
    /\bchannel\s+partner\b/.test(t) ||
    /\brevenue\s+share\b/.test(t) ||
    /\bintroduc(?:e|es|ing)\b.*\b(?:customer|account|lead)/.test(t) ||
    isGrowthAdvisorIntake(intakeRaw)
  );
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
    if (MANUAL_SIGNER_LINE_RE.test(line)) {
      repairs.push("manual_signer_line_removed");
      continue;
    }
    out.push(line);
  }
  return { text: out.join("\n").replace(/\n{3,}/g, "\n\n"), repairs };
}

function scrubBannedSentences(text: string): { text: string; repairs: string[] } {
  const repairs: string[] = [];
  let working = text;
  for (const re of BANNED_SENTENCE_PATTERNS) {
    if (re.test(working)) {
      re.lastIndex = 0;
      working = working.replace(re, "");
      repairs.push("banned_sentence_removed");
    }
    re.lastIndex = 0;
  }
  return { text: working.replace(/\n{3,}/g, "\n\n"), repairs };
}

function stripManualSignatureBlocks(text: string): { text: string; repairs: string[] } {
  const repairs: string[] = [];
  let working = text;
  if (SIGNATURE_BLOCK_RE.test(working)) {
    SIGNATURE_BLOCK_RE.lastIndex = 0;
    working = working.replace(SIGNATURE_BLOCK_RE, "\n");
    repairs.push("manual_signature_block_removed");
  }
  return { text: working.replace(/\n{3,}/g, "\n\n"), repairs };
}

function safeFallbackForHeading(heading: string, ctx: ProCompletenessContext): string {
  const h = heading.toLowerCase();
  const advisor = isGrowthAdvisorIntake(ctx.intakeRaw);
  const referral = isReferralChannelIntake(ctx.intakeRaw);
  if (/confidential/i.test(h)) {
    return MUTUAL_CONFIDENTIALITY_FALLBACK;
  }
  if (/protection\s+period|protected\s+opportunit/i.test(h)) {
    return REFERRAL_PROTECTION_FALLBACK;
  }
  if (/deal\s+visibility|visibility/i.test(h) && referral) {
    return "Each Party will keep introduced opportunity details confidential and use them only for evaluating and pursuing the introduced business.";
  }
  if (/wind-?down|survival/i.test(h)) {
    return "Survival and wind-down obligations apply to payment, confidentiality, and referral protection terms as stated in this Agreement.";
  }
  if (/invoic|payment|compensation|fee|referral|commission|revenue/i.test(h)) {
    if (referral || advisor) {
      return REFERRAL_REVENUE_STUB;
    }
    return "Fees and payment timing will be confirmed in writing before execution.";
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
    const genericPaymentFiller =
      /fees\s+and\s+payment\s+timing\s+will\s+be\s+confirmed/i.test(body) &&
      !/payment|compensation|invoic|referral|commission/i.test(title);
    const orphanBody = ORPHAN_BODY_RE.test(body);
    if (body.length >= SUBSTANTIVE_MIN && !genericPaymentFiller && !orphanBody) {
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
    /\n\s*[-•]\s+(?:compensation|revenue\s+share|referral\s+fee|payout|protected)[^\n]*(?:\n\s*[-•]\s+[^\n]+){0,8}/gi;
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
  } else if (isReferralChannelIntake(ctx.intakeRaw) && !working.includes(SCHEDULE_A_STUB)) {
    working = `${working.trim()}\n\n${SCHEDULE_A_STUB}\n`;
    repairs.push("schedule_a_stub_appended");
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

  const sig = stripManualSignatureBlocks(working);
  working = sig.text;
  repairs.push(...sig.repairs);

  const banned = scrubBannedLines(working);
  working = banned.text;
  repairs.push(...banned.repairs);

  const bannedSent = scrubBannedSentences(working);
  working = bannedSent.text;
  repairs.push(...bannedSent.repairs);

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

  const coherence = applyClauseCoherenceEngine(working);
  working = coherence.text;
  repairs.push(...coherence.repairs);

  return { text: working, repairs };
}

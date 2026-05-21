/**
 * Universal visible-body quality gate — starter and premium agreement text before display.
 */

import { parseAgreementSections } from "./proOperationalSynthesis/sectionPurityValidator";
import { validatePremiumAgreementStructure } from "./premiumAgreementStructure";
import { scrubVisiblePlaceholderLexemes } from "./proAgreementCompleteness/familyFallbackLanguage";
import { scrubMarkdownArtifacts } from "./proAgreementCompleteness/proStructuralDetection";
import { repairAgreementTemplatePlaceholders } from "./agreementTemplatePlaceholderSafety";
import type { ProCompletenessContext } from "./proAgreementCompleteness/types";

const PLACEHOLDER_SCHEDULE_RE =
  /\n\s*(?:SCHEDULE\s+[A-Z]|IMPLEMENTATION\s+MILESTONES)\s*\n[\s\S]*?(?=\n\s*\d+\.|\n\s*IN WITNESS|$)/gi;
const SIGNATURE_SECTION_BLOCK_RE =
  /\n\s*\d+\.?\s*(?:SIGNATURES?|EXECUTION)\s*\.?\s*\n[\s\S]*?(?=\n\s*\d+\.|\n\s*IN WITNESS WHEREOF|\n\s*KEY CONTACTS|$)/gi;

const DANGLING_FRAGMENT_RES: readonly RegExp[] = [
  /^\s*signature\.\s*$/gim,
  /\bor\s+service\s+period\b/gi,
  /\bto\s+enter\s+into\s+this\s+Agreement\s*$/gim,
  /\bSections?\s+that\s+by\s+their\s+nature\s+should\b[^\n]*/gi,
  /\bshould\s{2,}or\s+termination\b/gi,
];

const BOILERPLATE_DUPE_RES = [
  /\bInvoices are due within thirty \(30\) days unless a different period is stated in a schedule\./gi,
  /\bExcept as expressly stated, neither Party is liable for indirect or consequential damages\./gi,
  /\bFees and invoicing follow the payment schedule in this Agreement\./gi,
  /\bThe Parties shall perform their obligations in good faith and in accordance with this Agreement\./gi,
];

function scrubDanglingFragments(text: string): { text: string; repairs: string[] } {
  let out = text;
  const repairs: string[] = [];
  for (const re of DANGLING_FRAGMENT_RES) {
    re.lastIndex = 0;
    if (re.test(out)) {
      re.lastIndex = 0;
      out = out.replace(re, "");
      repairs.push(`dangling_fragment:${re.source.slice(0, 24)}`);
    }
    re.lastIndex = 0;
  }
  return { text: out.replace(/\n{3,}/g, "\n\n"), repairs };
}

/** Remove duplicate boilerplate sentences beyond first occurrence. */
function dedupeBoilerplateSentences(text: string): { text: string; repairs: string[] } {
  let out = text;
  const repairs: string[] = [];
  for (const re of BOILERPLATE_DUPE_RES) {
    re.lastIndex = 0;
    const matches = [...out.matchAll(re)];
    if (matches.length <= 1) continue;
    let first = true;
    out = out.replace(re, (m) => {
      if (first) {
        first = false;
        return m;
      }
      repairs.push("boilerplate_dedupe");
      return "";
    });
    re.lastIndex = 0;
  }
  return { text: out.replace(/\n{3,}/g, "\n\n"), repairs };
}

function removePlaceholderSchedules(text: string): { text: string; repairs: string[] } {
  let out = text;
  const repairs: string[] = [];
  if (PLACEHOLDER_SCHEDULE_RE.test(out)) {
    PLACEHOLDER_SCHEDULE_RE.lastIndex = 0;
    out = out.replace(PLACEHOLDER_SCHEDULE_RE, "\n");
    repairs.push("placeholder_schedule_removed");
  }
  if (/\|[-:| ]+\|/.test(out) || /^\s*\|.*TBD.*\|/im.test(out)) {
    out = scrubMarkdownArtifacts(out).text;
    repairs.push("placeholder_table_removed");
  }
  return { text: out, repairs };
}

const PAYMENT_SPLICE_RE =
  /\b(?:invoices?\s+are\s+due\s+within\s+thirty\s*\(30\)\s+days|fees\s+and\s+invoicing\s+follow\s+the\s+payment\s+schedule)\b[^.!?]*[.!?]\s*/gi;
const LOL_SPLICE_RE =
  /\bexcept\s+as\s+expressly\s+stated,?\s+neither\s+party\s+is\s+liable\b[^.!?]*[.!?]\s*/gi;

function scrubPaymentAndLolOutsideProperSections(text: string): { text: string; repairs: string[] } {
  const repairs: string[] = [];
  const sections = parseAgreementSections(text);
  if (!sections.length) return { text, repairs };
  let out = text;
  for (const sec of sections) {
    if (/payment|fee|compensation|invoic|pricing/i.test(sec.heading)) continue;
    if (/limitation|liability/i.test(sec.heading)) continue;
    let body = sec.body;
    const cleaned = body
      .replace(PAYMENT_SPLICE_RE, "")
      .replace(LOL_SPLICE_RE, "");
    if (cleaned !== body) {
      out = out.replace(body, cleaned);
      repairs.push(`splice_removed:${sec.heading.slice(0, 40)}`);
    }
  }
  return { text: out.replace(/\n{3,}/g, "\n\n"), repairs };
}

function stripSignatureSectionBlocks(text: string): { text: string; repairs: string[] } {
  let out = text;
  const repairs: string[] = [];
  if (SIGNATURE_SECTION_BLOCK_RE.test(out)) {
    SIGNATURE_SECTION_BLOCK_RE.lastIndex = 0;
    out = out.replace(SIGNATURE_SECTION_BLOCK_RE, "\n");
    repairs.push("signature_section_removed");
  }
  return { text: out.replace(/\n{3,}/g, "\n\n"), repairs };
}

export type VisibleBodyQualityResult = {
  text: string;
  repairs: string[];
};

/** Run universal structural scrub before user-visible render (starter + premium). */
export function applyVisibleBodyQualityGate(
  text: string,
  ctx: ProCompletenessContext,
): VisibleBodyQualityResult {
  const repairs: string[] = [];
  let working = (text || "").trim();
  if (!working) return { text: "", repairs };

  const sched = removePlaceholderSchedules(working);
  working = sched.text;
  repairs.push(...sched.repairs);

  const md = scrubMarkdownArtifacts(working);
  working = md.text;
  repairs.push(...md.repairs);

  const scrub = scrubVisiblePlaceholderLexemes(working);
  working = scrub.text;
  repairs.push(...scrub.repairs);

  const ph = repairAgreementTemplatePlaceholders(working, {
    intakeRaw: ctx.intakeRaw,
    partyNames: ctx.partyNames,
  });
  working = ph.text;
  repairs.push(...ph.repaired);

  const structure = validatePremiumAgreementStructure(working);
  working = structure.text;
  repairs.push(...structure.repairs);

  const splice = scrubPaymentAndLolOutsideProperSections(working);
  working = splice.text;
  repairs.push(...splice.repairs);

  const frag = scrubDanglingFragments(working);
  working = frag.text;
  repairs.push(...frag.repairs);

  const dedupe = dedupeBoilerplateSentences(working);
  working = dedupe.text;
  repairs.push(...dedupe.repairs);

  const sig = stripSignatureSectionBlocks(working);
  working = sig.text;
  repairs.push(...sig.repairs);

  return { text: working, repairs };
}

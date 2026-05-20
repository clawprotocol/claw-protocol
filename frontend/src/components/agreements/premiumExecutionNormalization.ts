/**
 * Single canonical normalization for premium (and light starter) agreement bodies before review.
 * Strips manual wet-signature grids; preserves LawDog execution-only closing.
 */

import { applySectionPurityPass } from "./proOperationalSynthesis/sectionPurityValidator";
import { suppressRepeatedBoilerplate } from "./agreementOutputQuality/boilerplateContaminationGuard";

export const LAWDOG_WITNESS_EXECUTION_SENTENCE =
  "IN WITNESS WHEREOF, the Parties agree to execute this Agreement through the LawDog signing workflow.";

export const LAWDOG_ESIGN_CLAUSE =
  "This Agreement may be executed electronically through the LawDog workflow and signature process. Electronic signatures and records shall be binding and enforceable to the maximum extent permitted by applicable law.";

const MANUAL_SIG_FIELD_RE = /^\s*(?:By|Name|Title|Date|Signature|Signatory)\s*:/i;
const MANUAL_SIG_VALUE_RE =
  /^\s*(?:By|Name|Title|Date|Signature|Signatory)\s*:\s*(?:_{2,}|\[SIGNATURE\]|\[NAME\]|\[TITLE\]|\[DATE\]|<[^>]+>|Signatory\s+\d+)/i;
const MANUAL_SIG_EMAIL_STUB_RE = /^\s*Email:\s*(?:_{2,}|\[EMAIL|\[SIGNER|<|\s*$)/i;
const UNDERSCORE_SIG_RE = /^_{4,}\s*$/m;
const WET_PARTY_BLOCK_RE =
  /(?:^|\n\n)([A-Z][^\n]{6,90})\n\s*By:\s*(?:_{2,}|\[SIGNATURE\])[\s\S]*?(?=\n\n(?:IN WITNESS|This Agreement may be executed|\d+\.\s+[A-Z]|$))/gim;

const DUPLICATE_ESIGN_RE =
  /(?:^|\n)This agreement will be executed electronically via LawDog\.?\s*/gim;

function normalizeNewlines(text: string): string {
  return (text || "").replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function stripDuplicateWitnessBlocks(text: string): { text: string; removed: number } {
  let t = normalizeNewlines(text);
  let removed = 0;
  const firstWitness = t.search(/\bIN WITNESS WHEREOF\b/i);
  if (firstWitness >= 0) {
    const second = t.indexOf("IN WITNESS WHEREOF", firstWitness + 20);
    if (second >= 0) {
      t = t.slice(0, second).trimEnd();
      removed += 1;
    }
  }
  return { text: t, removed };
}

/** Remove manual By/Name/Title/Date/Email grids and underscore signature lines. */
export function stripManualSignatureExecutionFromBody(text: string): { text: string; removed: number } {
  let t = normalizeNewlines(text);
  let removed = 0;
  const beforeWet = t;
  t = t.replace(WET_PARTY_BLOCK_RE, "\n\n");
  if (t !== beforeWet) removed += 1;

  const lines = t.split("\n");
  const kept: string[] = [];
  for (const line of lines) {
    if (
      MANUAL_SIG_FIELD_RE.test(line) ||
      MANUAL_SIG_VALUE_RE.test(line) ||
      MANUAL_SIG_EMAIL_STUB_RE.test(line)
    ) {
      removed += 1;
      continue;
    }
    if (UNDERSCORE_SIG_RE.test(line.trim())) {
      removed += 1;
      continue;
    }
    kept.push(line);
  }
  t = kept.join("\n");
  return { text: normalizeNewlines(t), removed };
}

function replaceWitnessAndExecutionFooter(text: string): { text: string; repaired: boolean } {
  let t = text;
  const witnessIdx = t.search(/\bIN WITNESS WHEREOF\b/i);
  const head = witnessIdx >= 0 ? t.slice(0, witnessIdx).trimEnd() : t.trimEnd();
  const footer = `${LAWDOG_WITNESS_EXECUTION_SENTENCE}\n\n${LAWDOG_ESIGN_CLAUSE}`;
  const repaired = witnessIdx >= 0;
  t = `${head}\n\n${footer}`;
  return { text: normalizeNewlines(t), repaired };
}

function dedupeEsignNotices(text: string): string {
  let t = text;
  t = t.replace(DUPLICATE_ESIGN_RE, "\n");
  const esc = LAWDOG_ESIGN_CLAUSE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = t.match(new RegExp(esc, "gi")) || [];
  if (matches.length > 1) {
    let first = true;
    t = t.replace(new RegExp(esc, "gi"), () => {
      if (first) {
        first = false;
        return LAWDOG_ESIGN_CLAUSE;
      }
      return "";
    });
  }
  return normalizeNewlines(t);
}

const MISPLACED_CLAUSE_RULES: readonly {
  id: string;
  sentenceRe: RegExp;
  allowedHeadingRe: RegExp;
}[] = [
  {
    id: "invoice_in_non_payment",
    sentenceRe: /\binvoices?\s+shall\s+reference\s+the\s+applicable\s+milestone\b/i,
    allowedHeadingRe: /^(?:\d+\.?\s+)?(?:fees?|payment|compensation|pricing|milestones?)\b/i,
  },
  {
    id: "authority_in_non_representation",
    sentenceRe: /\beach\s+party\s+represents\s+that\s+it\s+has\s+authority\b/i,
    allowedHeadingRe: /^(?:\d+\.?\s+)?(?:warranties?|representations?)\b/i,
  },
  {
    id: "limitation_outside_lol",
    sentenceRe: /\bexcept\s+as\s+expressly\s+stated\s+in\s+this\s+agreement\b/i,
    allowedHeadingRe: /^(?:\d+\.?\s+)?(?:limitation\s+of\s+liability|liability)\b/i,
  },
  {
    id: "survival_outside_termination",
    sentenceRe: /\b(?:shall\s+)?survive\s+(?:expiration|termination)\b/i,
    allowedHeadingRe: /^(?:\d+\.?\s+)?(?:termination|survival|general)\b/i,
  },
];

function suppressMisplacedClauseSplices(text: string): { text: string; removed: number } {
  const sections = text.split(/\n(?=\d+\.?\s+[A-Z])/);
  if (sections.length < 2) return { text, removed: 0 };
  let removed = 0;
  const out: string[] = [];
  for (const block of sections) {
    const headingLine = block.split("\n")[0] || "";
    let body = block;
    for (const rule of MISPLACED_CLAUSE_RULES) {
      if (rule.allowedHeadingRe.test(headingLine)) continue;
      if (!rule.sentenceRe.test(body)) continue;
      const before = body;
      body = body.replace(rule.sentenceRe, "").replace(/\n{3,}/g, "\n\n");
      if (body !== before) removed += 1;
    }
    out.push(body.trimEnd());
  }
  return { text: normalizeNewlines(out.join("\n\n")), removed };
}

const SUBSECTION_LINE_RE = /^(\s*)(\d+)\.(\d+)\s+(.+)$/;

/**
 * Renumber visible subsections sequentially within each major section (fixes 2.1, 2.5 → 2.1, 2.2).
 */
export function renumberVisibleSubsections(text: string): { text: string; fixed: number } {
  const lines = (text || "").replace(/\r\n/g, "\n").split("\n");
  let fixed = 0;
  const groups = new Map<number, Array<{ lineIdx: number; indent: string; major: number; minor: number; rest: string }>>();

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(SUBSECTION_LINE_RE);
    if (!m) continue;
    const major = parseInt(m[2], 10);
    const minor = parseInt(m[3], 10);
    const entry = {
      lineIdx: i,
      indent: m[1],
      major,
      minor,
      rest: m[4],
    };
    const arr = groups.get(major) ?? [];
    arr.push(entry);
    groups.set(major, arr);
  }

  for (const [, entries] of groups) {
    if (entries.length < 2) continue;
    entries.sort((a, b) => a.lineIdx - b.lineIdx);
    let expect = 1;
    for (const e of entries) {
      if (e.minor !== expect) {
        lines[e.lineIdx] = `${e.indent}${e.major}.${expect} ${e.rest}`;
        fixed += 1;
      }
      expect += 1;
    }
  }

  return { text: lines.join("\n"), fixed };
}

export type PremiumExecutionNormalizeResult = {
  text: string;
  repairs: string[];
};

/**
 * One canonical pass: manual signature strip, LawDog execution footer, purity, boilerplate, renumbering.
 */
export function applyPremiumExecutionNormalization(
  text: string,
  opts?: { tier?: "starter" | "premium" },
): PremiumExecutionNormalizeResult {
  const repairs: string[] = [];
  const tier = opts?.tier ?? "premium";
  let working = normalizeNewlines(text);

  const dup = stripDuplicateWitnessBlocks(working);
  if (dup.removed > 0) {
    working = dup.text;
    repairs.push(`duplicate_witness_blocks:${dup.removed}`);
  }

  const manual = stripManualSignatureExecutionFromBody(working);
  if (manual.removed > 0) {
    working = manual.text;
    repairs.push(`manual_signature_fields:${manual.removed}`);
  }

  const witness = replaceWitnessAndExecutionFooter(working);
  if (witness.repaired) repairs.push("lawdog_witness_footer");
  working = witness.text;
  working = dedupeEsignNotices(working);

  if (tier === "premium") {
    const misplaced = suppressMisplacedClauseSplices(working);
    if (misplaced.removed > 0) {
      working = misplaced.text;
      repairs.push(`misplaced_clause_splices:${misplaced.removed}`);
    }
    const purity = applySectionPurityPass(working);
    if (purity.issues.length > 0) {
      working = purity.text;
      repairs.push(`section_purity:${purity.issues.length}`);
    }
    const boiler = suppressRepeatedBoilerplate(working);
    if (boiler.removedCount > 0) {
      working = boiler.text;
      repairs.push(`boilerplate_deduped:${boiler.removedCount}`);
    }
    const renum = renumberVisibleSubsections(working);
    if (renum.fixed > 0) {
      working = renum.text;
      repairs.push(`subsection_renumbered:${renum.fixed}`);
    }
  }

  return { text: working, repairs };
}

/** Validate-only: true when body has no manual signature field lines. */
export function bodyHasManualSignatureFields(text: string): boolean {
  const lines = (text || "").split("\n");
  for (const line of lines) {
    if (
      MANUAL_SIG_FIELD_RE.test(line) ||
      MANUAL_SIG_VALUE_RE.test(line) ||
      MANUAL_SIG_EMAIL_STUB_RE.test(line)
    ) {
      return true;
    }
    if (/^\s*By:\s*_{2,}/i.test(line)) return true;
  }
  return false;
}

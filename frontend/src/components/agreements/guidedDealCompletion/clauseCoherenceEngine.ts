/**
 * Semantic clause coherence — consolidate repeated concepts across agreement bodies.
 */

import { parseAgreementSections } from "../proOperationalSynthesis/sectionPurityValidator";
import { suppressRepeatedBoilerplate, KNOWN_BOILERPLATE_SENTENCES } from "../agreementOutputQuality/boilerplateContaminationGuard";

const CONCEPT_PATTERNS: readonly { id: string; re: RegExp; allowedHeadingRe: RegExp }[] = [
  {
    id: "invoice_milestone",
    re: /\binvoices?\s+shall\s+reference\s+the\s+applicable\s+milestone\b[^.!?]*[.!?]\s*/gi,
    allowedHeadingRe: /payment|fee|compensation|invoic|milestones?/i,
  },
  {
    id: "invoice_thirty_days",
    re: /\binvoices?\s+are\s+due\s+within\s+thirty\s*\(30\)\s+days\b[^.!?]*[.!?]\s*/gi,
    allowedHeadingRe: /payment|fee|compensation|invoic/i,
  },
  {
    id: "payment_schedule",
    re: /\bfees\s+and\s+invoicing\s+follow\s+the\s+payment\s+schedule\b[^.!?]*[.!?]\s*/gi,
    allowedHeadingRe: /payment|fee|compensation|invoic/i,
  },
  {
    id: "invoice_billing_contact",
    re: /\binvoices?\s+will\s+be\s+sent\s+to\s+the\s+billing\s+contact\b[^.!?]*[.!?]\s*/gi,
    allowedHeadingRe: /payment|fee|compensation|invoic|billing/i,
  },
  {
    id: "payment_timing_confirm",
    re: /\bfees\s+and\s+payment\s+timing\s+will\s+be\s+confirmed\b[^.!?]*[.!?]\s*/gi,
    allowedHeadingRe: /payment|fee|compensation|invoic|referral|commission/i,
  },
  {
    id: "orphan_lol_fragment",
    re: /\bfor\s+indirect\s+or\s+consequential\s+damages\b[^.!?]*[.!?]\s*/gi,
    allowedHeadingRe: /limitation|liability/i,
  },
  {
    id: "orphan_authority_fragment",
    re: /\bto\s+enter\s+into\s+this\s+agreement\b[^.!?]*[.!?]\s*/gi,
    allowedHeadingRe: /warrant|represent|authority|execution/i,
  },
  {
    id: "lol_except",
    re: /\bexcept\s+as\s+expressly\s+stated,?\s+neither\s+party\s+is\s+liable\b[^.!?]*[.!?]\s*/gi,
    allowedHeadingRe: /limitation|liability/i,
  },
  {
    id: "authority_rep",
    re: /\beach\s+party\s+represents\s+that\s+it\s+has\s+authority\b[^.!?]*[.!?]\s*/gi,
    allowedHeadingRe: /warrant|represent/i,
  },
  {
    id: "good_faith",
    re: /\bthe\s+parties\s+shall\s+perform\s+their\s+obligations\s+in\s+good\s+faith\b[^.!?]*[.!?]\s*/gi,
    allowedHeadingRe: /general|miscellaneous|term/i,
  },
];

function scrubConceptOutsideAllowedSections(text: string): { text: string; removed: number } {
  const sections = parseAgreementSections(text);
  if (!sections.length) return { text, removed: 0 };
  let out = text;
  let removed = 0;
  for (const sec of sections) {
    const heading = sec.heading;
    let body = sec.body;
    for (const rule of CONCEPT_PATTERNS) {
      if (rule.allowedHeadingRe.test(heading)) continue;
      const before = body;
      body = body.replace(rule.re, "");
      if (body !== before) removed += 1;
    }
    if (body !== sec.body) out = out.replace(sec.body, body);
  }
  return { text: out.replace(/\n{3,}/g, "\n\n"), removed };
}

/** Keep the first occurrence of high-contamination concept sentences document-wide. */
function dedupeGlobalConceptSentences(text: string): { text: string; removed: number } {
  let working = text;
  let removed = 0;
  for (const rule of CONCEPT_PATTERNS) {
    const re = new RegExp(rule.re.source, rule.re.flags);
    let seen = false;
    working = working.replace(re, (match) => {
      if (!seen) {
        seen = true;
        return match;
      }
      removed += 1;
      return "";
    });
  }
  return { text: working.replace(/\n{3,}/g, "\n\n").replace(/[ \t]+\n/g, "\n"), removed };
}

/** Collapse near-duplicate sentences using known boilerplate keys. */
function collapseNearDuplicateSentences(text: string): { text: string; removed: number } {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const globalSeen = new Map<string, number>();
  let removed = 0;
  const out: string[] = [];
  for (const line of lines) {
    const sentences = line.split(/(?<=[.!?])\s+/);
    const kept: string[] = [];
    for (const sent of sentences) {
      const norm = sent.toLowerCase().replace(/\s+/g, " ").trim();
      let matched = false;
      for (const b of KNOWN_BOILERPLATE_SENTENCES) {
        if (norm.length >= 30 && (norm.includes(b) || b.includes(norm.slice(0, 50)))) {
          matched = true;
          const c = globalSeen.get(b) ?? 0;
          if (c > 0) {
            removed += 1;
            break;
          }
          globalSeen.set(b, c + 1);
          break;
        }
      }
      if (!matched || kept.length === 0) kept.push(sent);
      else if (matched) {
        const b = KNOWN_BOILERPLATE_SENTENCES.find((x) => norm.includes(x))!;
        if ((globalSeen.get(b) ?? 0) <= 1) kept.push(sent);
        else removed += 1;
      }
    }
    out.push(kept.join(" "));
  }
  return { text: out.join("\n"), removed };
}

export function applyClauseCoherenceEngine(text: string): { text: string; repairs: string[] } {
  const repairs: string[] = [];
  let working = (text || "").trim();
  const boiler = suppressRepeatedBoilerplate(working);
  if (boiler.removedCount > 0) {
    working = boiler.text;
    repairs.push(`boilerplate_global:${boiler.removedCount}`);
  }
  const concept = scrubConceptOutsideAllowedSections(working);
  if (concept.removed > 0) {
    working = concept.text;
    repairs.push(`concept_splice_removed:${concept.removed}`);
  }
  const globalConcept = dedupeGlobalConceptSentences(working);
  if (globalConcept.removed > 0) {
    working = globalConcept.text;
    repairs.push(`concept_global_deduped:${globalConcept.removed}`);
  }
  const near = collapseNearDuplicateSentences(working);
  if (near.removed > 0) {
    working = near.text;
    repairs.push(`near_dup_sentences:${near.removed}`);
  }
  return { text: working, repairs };
}

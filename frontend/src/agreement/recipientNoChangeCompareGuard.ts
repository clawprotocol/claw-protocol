/**
 * Detects when an imported revised draft (especially PDF extraction) is materially the same
 * as the sender’s current rendered agreement, after shared normalization. Used before building
 * compare / redline VMs so structured-HTML vs full-paste rendering cannot create false diffs.
 */

import { htmlToPlainText } from "./externalAiHandoff";
import { normalizeNewlinesForLegalRedline } from "./legalRedlineBlocks";
import { stripRecipientQaDraftNoiseLines } from "./recipientRevisionPreambleStrip";

/** Lines treated as PDF runners / QA cover (aligned with recipientRevisedDraftExtractSanitize). */
const PDF_NOISE_LINE_RES: RegExp[] = [
  /^\s*Sarah\s+Collins\s+revised\s+draft\b/i,
  /^\s*Sarah\s+Collins\s+proposed\s+revised\s+draft\s+for\s+qa\s+testing\b/i,
  /^\s*prepared\s+as\s+sarah\s+collins\s+proposed\s+revised\s+agreement\s+draft\b/i,
  /^\s*this\s+is\s+a\s+clean\s+revised\s+draft\b/i,
  /revised\s+draft\s+for\s+lawdog\s+qa\b/i,
  /^\s*page\s+\d+\s+of\s+\d+\s*$/i,
  /^\s*-\s*page\s+\d+\s*-\s*$/i,
  /^\s*Page\s+\d+\s*\/\s*\d+\s*$/i,
  /^\s*Page\s+\d+\s*$/i,
  /^\s*CONFIDENTIAL\s*-\s*DRAFT\s*$/i,
];

const LAWDOG_CREATED_TAIL = /\bcreated\s+with\s+lawdog\b[\s\S]*$/i;

/** ISO-like timestamps often appear in export footers (not operative contract text). */
const LOOSE_TIMESTAMP_LINE =
  /^\s*\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?\s*$/i;

function stripLawdogFooterPlain(s: string): string {
  return s.replace(LAWDOG_CREATED_TAIL, "").trimEnd();
}

function stripPdfNoiseLines(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t) {
      out.push(line);
      continue;
    }
    let drop = false;
    if (LOOSE_TIMESTAMP_LINE.test(t)) drop = true;
    if (!drop) {
      for (const r of PDF_NOISE_LINE_RES) {
        if (r.test(t)) {
          drop = true;
          break;
        }
      }
    }
    if (!drop) out.push(line);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Joins words split across line breaks by a trailing hyphen (common PDF extraction artifact). */
function repairHyphenatedLineWraps(s: string): string {
  return s.replace(/(\w)-\s*\n\s*(\w)/g, "$1$2");
}

function normalizeUnicodeTypography(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/[\u2018\u2019\u2032]/g, "'")
    .replace(/[\u201c\u201d\u2033]/g, '"')
    .replace(/[\u2013\u2014]/g, "-");
}

/**
 * Strong normalization shared by baseline (rendered HTML → plain) and imported agreement body.
 * Not used for legal redline display — only for same-document fingerprinting.
 */
export function normalizeForRecipientSameDocumentCompare(raw: string): string {
  let s = normalizeNewlinesForLegalRedline(String(raw ?? ""));
  s = stripRecipientQaDraftNoiseLines(s);
  s = stripPdfNoiseLines(s);
  s = stripLawdogFooterPlain(s);
  s = repairHyphenatedLineWraps(s);
  s = normalizeUnicodeTypography(s);
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

/** Plain text from rendered agreement HTML (matches compare preview’s htmlToPlainText baseline). */
export function recipientBaselinePlainFromRenderedHtml(html: string): string {
  return htmlToPlainText(html || "");
}

/**
 * Returns true when the imported body is materially the same as the current agreement text
 * after shared normalization (including whitespace / footer / page-noise tolerance).
 */
export function recipientImportsMatchAuthoritativeBaseline(params: {
  baselineRenderedHtml: string;
  importedAgreementPlain: string;
}): boolean {
  const basePlain = recipientBaselinePlainFromRenderedHtml(params.baselineRenderedHtml);
  const a = normalizeForRecipientSameDocumentCompare(basePlain);
  const b = normalizeForRecipientSameDocumentCompare(params.importedAgreementPlain);
  const minLen = Math.min(a.length, b.length);
  if (minLen < 60) return false;
  if (a === b) return true;
  const ac = a.replace(/\s+/g, "");
  const bc = b.replace(/\s+/g, "");
  if (ac.length < 60 || bc.length < 60) return false;
  return ac === bc;
}

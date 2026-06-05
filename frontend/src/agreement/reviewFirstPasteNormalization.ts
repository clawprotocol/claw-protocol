/**
 * Normalizes reviewer-pasted agreement text before review-first diff.
 * Strips PDF/export artifacts while preserving operative agreement body.
 */

import { normalizeNewlinesForLegalRedline } from "./legalRedlineBlocks";
import { stripRecipientQaDraftNoiseLines } from "./recipientRevisionPreambleStrip";
import { sanitizeRecipientImportedRevisionText } from "./recipientRevisedDraftExtractSanitize";

const DRAFT_TEMPLATE_INLINE_RE = /draft\s+agreement\s*\(\s*non-?binding\s+template\s*\)/gi;
const LAWDOG_PRO_HEADER_LINE_RE = /^\s*lawdog\s+pro\b.*$/gim;
const LAWDOG_HEADER_LINE_RE = /^\s*(?:powered\s+by\s+)?lawdog\b.*$/gim;

/** Joins words split across line breaks by a trailing hyphen (common PDF extraction artifact). */
function repairHyphenatedLineWraps(text: string): string {
  return text.replace(/(\w)-\s*\n\s*(\w)/g, "$1$2");
}

/** Rejoins soft PDF line wraps inside a paragraph (lowercase continuation lines). */
function rejoinPdfSoftLineBreaks(text: string): string {
  const paragraphs = text.split(/\n\n+/);
  return paragraphs
    .map((para) => {
      const lines = para.split("\n");
      const out: string[] = [];
      for (const rawLine of lines) {
        const line = rawLine.replace(/\s+/g, " ").trim();
        if (!line) continue;
        if (out.length === 0) {
          out.push(line);
          continue;
        }
        const prev = out[out.length - 1]!;
        const prevEndsBlock = /[.!?:;)]$/.test(prev);
        const lineStartsHeading =
          /^(?:schedule|section|article)\s+/i.test(line) || /^\d+\.\s+[A-Z]/.test(line);
        if (!prevEndsBlock && !lineStartsHeading && /^[a-z(]/.test(line)) {
          out[out.length - 1] = `${prev} ${line}`;
        } else {
          out.push(line);
        }
      }
      return out.join("\n");
    })
    .join("\n\n");
}

export type ReviewFirstAgreementTextNormalization = {
  text: string;
  hadFormattingArtifacts: boolean;
};

/**
 * Prepares agreement text for review-first comparison (baseline or pasted revision).
 * Removes non-substantive PDF/export noise and repairs common copy/paste line-wrap artifacts.
 */
export function normalizeReviewFirstAgreementText(raw: string): ReviewFirstAgreementTextNormalization {
  const original = String(raw ?? "");
  let hadFormattingArtifacts = false;

  let text = normalizeNewlinesForLegalRedline(original);
  const sanitized = sanitizeRecipientImportedRevisionText(text);
  if (sanitized.artifactsRemoved.length > 0) hadFormattingArtifacts = true;
  text = sanitized.agreementText;

  const withoutTemplate = text.replace(DRAFT_TEMPLATE_INLINE_RE, " ");
  if (withoutTemplate !== text) {
    hadFormattingArtifacts = true;
    text = withoutTemplate;
  }

  const withoutHeaders = text.replace(LAWDOG_PRO_HEADER_LINE_RE, "").replace(LAWDOG_HEADER_LINE_RE, "");
  if (withoutHeaders !== text) {
    hadFormattingArtifacts = true;
    text = withoutHeaders;
  }

  const qaStripped = stripRecipientQaDraftNoiseLines(text);
  if (qaStripped !== text) hadFormattingArtifacts = true;
  text = qaStripped;

  const wrapped = repairHyphenatedLineWraps(text);
  if (wrapped !== text) hadFormattingArtifacts = true;
  text = wrapped;

  const rejoined = rejoinPdfSoftLineBreaks(text);
  if (rejoined !== text) hadFormattingArtifacts = true;
  text = rejoined;

  text = text
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (text !== original.trim()) hadFormattingArtifacts = true;

  return { text, hadFormattingArtifacts };
}

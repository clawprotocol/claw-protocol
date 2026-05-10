import { escapeHtml } from "../components/agreements/premiumAgreementDocumentHtml";
import { parsePlainTextIntoLegalBlocks, type ParsedPlainBlock } from "./legalRedlineBlocks";
import type { BusinessReviewSemanticId } from "./recipientBusinessReviewCardsModel";

/** Major section prefixes on the original (consulting-style) agreement for topic grouping. */
const TOPIC_MAJOR_SECTIONS: Record<
  BusinessReviewSemanticId,
  readonly { startMajor: number; endMajor: number }[]
> = {
  payment_terms: [{ startMajor: 3, endMajor: 3 }],
  scope: [{ startMajor: 1, endMajor: 1 }],
  ownership: [{ startMajor: 5, endMajor: 5 }],
  third_party: [
    { startMajor: 6, endMajor: 6 },
    { startMajor: 11, endMajor: 11 },
  ],
  acceptance: [{ startMajor: 4, endMajor: 4 }],
  timeline_protections: [
    { startMajor: 2, endMajor: 2 },
    { startMajor: 4, endMajor: 4 },
    { startMajor: 11, endMajor: 11 },
  ],
  term_timing: [{ startMajor: 2, endMajor: 2 }],
  generic: [{ startMajor: 1, endMajor: 12 }],
};

function blockMatchesMajorRange(block: ParsedPlainBlock, startMajor: number, endMajor: number): boolean {
  const cn = block.clauseNumber;
  if (!cn) return false;
  const major = parseInt(String(cn).split(".")[0] ?? "0", 10);
  if (!Number.isFinite(major) || major <= 0) return false;
  return major >= startMajor && major <= endMajor;
}

/**
 * Pulls representative original text for a business-review topic (clause groups on the long baseline).
 */
export function extractOriginalPlainExcerptForSemanticTopic(
  currentPlain: string,
  semanticId: BusinessReviewSemanticId,
  maxChars = 1100,
): string {
  const blocks = parsePlainTextIntoLegalBlocks(currentPlain);
  const ranges = TOPIC_MAJOR_SECTIONS[semanticId] ?? TOPIC_MAJOR_SECTIONS.generic!;
  const picked: ParsedPlainBlock[] = [];
  for (const b of blocks) {
    for (const r of ranges) {
      if (blockMatchesMajorRange(b, r.startMajor, r.endMajor)) {
        picked.push(b);
        break;
      }
    }
  }
  const text = picked
    .map((b) => b.rawText.trim())
    .join("\n\n")
    .trim();
  if (!text) return "";
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars - 1).trim()}…`;
}

/** Human labels for the reconciliation appendix (not exhaustive — calm defaults). */
export const RECIPIENT_NOT_RESTAT_ORIGINAL_SECTION_LABELS: readonly string[] = [
  "Representations and warranties",
  "Termination",
  "Limitation of liability",
  "General provisions",
  "Signatures and execution",
];

/** Escaped `<ul><li>…` for PDF appendix. */
export function buildNotRestatedOriginalSectionsAppendixHtml(labels: readonly string[]): string {
  const items = labels.map((l) => `<li style="margin:0 0 6px;">${escapeHtml(l)}</li>`).join("");
  return `<ul style="margin:0;padding-left:18px;font-size:13px;color:#334155;line-height:1.6;">${items}</ul>`;
}

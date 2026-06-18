/**
 * Shared paid Pro document block classifier — single typography authority for
 * HTML and React readonly renderers (TEST310).
 */

import { findSignatureRegionStart } from "./guidedDealCompletion/signatureRegion";
import { splitGluedSectionHeadingFromLine } from "./documentSectionHeadingSplit";
import {
  isDanglingPaidProMainHeadingPrefix,
  isPaidProHeadingContinuationFragment,
} from "./repairSplitPaidProHeadingFragments";
import {
  isPaidProNumberedSectionHeadingLine,
  PAID_PRO_SUBSECTION_NUMBER_RE,
  parsePaidProNumberedSectionLine,
} from "./paidProNumberedSectionHeading";

export {
  isPaidProNumberedSectionHeadingLine,
  isPaidProNumberedSectionHeadingLine as isMainSectionHeadingLine,
  parsePaidProNumberedSectionLine,
  PAID_PRO_SUBSECTION_NUMBER_RE,
} from "./paidProNumberedSectionHeading";

export type PaidProDocumentBlockKind =
  | "document_title"
  | "main_section_heading"
  | "legacy_section_heading"
  | "signature_party_start"
  | "signature_entity_name"
  | "signature_notice"
  | "signature_field"
  | "body_paragraph";

export type ClassifiedPaidProDocumentBlock = {
  block: string;
  blockIndex: number;
  chunkOffset: number;
  inSignatureRegion: boolean;
  kind: PaidProDocumentBlockKind;
  firstLine: string;
  singleLine: boolean;
};

/** Subsection lines like "1.1", "8.1" — remain body paragraphs. */
const SUBSECTION_HEADING_RE = PAID_PRO_SUBSECTION_NUMBER_RE;

const SIGNATURE_PARTY_HEADER_RE = /^(?:CLIENT|SERVICE\s+PROVIDER|PARTY\s+\d+)\s*:?\s*$/i;
const SIGNATURE_NOTICE_EMAIL_RE = /^email(?:\s+for\s+notices?)?\s*:/i;
const SIGNATURE_ENTITY_LINE_RE =
  /\b(?:LLC|L\.L\.C\.|Inc\.?|Incorporated|Corp\.?|Corporation|Ltd\.?|Limited|LLP|PLLC|LP|L\.P\.)\b/i;

function isStandaloneAllCapsTitleLine(line: string): boolean {
  const t = line.trim();
  if (t.length < 4 || t.length > 96) return false;
  if (/^\d+\./.test(t)) return false;
  if (/[a-z]/.test(t)) return false;
  return /^[A-Z]/.test(t);
}

function isFirstBlockDocumentTitle(firstLine: string): boolean {
  const t = firstLine.trim();
  if (t.length < 8 || t.length > 160) return false;
  if (/^\d+\./.test(t)) return false;
  return t === t.toUpperCase() || /^[A-Z][^.!?]{12,}$/.test(t);
}

/** Main numbered section heading — excludes subsections like "8.1". */
function isMainSectionHeadingLineInternal(line: string): boolean {
  return isPaidProNumberedSectionHeadingLine(line);
}

function parseMainSectionTitleFromLine(line: string): string | null {
  return parsePaidProNumberedSectionLine(line)?.title ?? null;
}

function isFalseSplitMainHeadingFragment(headingLine: string, remainder: string): boolean {
  const title = parseMainSectionTitleFromLine(headingLine);
  if (!title || !remainder) return false;
  return (
    isDanglingPaidProMainHeadingPrefix(title) &&
    isPaidProHeadingContinuationFragment(remainder)
  );
}

function rejectFalseMainHeadingGluedSplit(glued: string, originalLine: string): string {
  if (!glued.includes("\n")) return glued;
  const [headingLine, ...rest] = glued
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  const remainder = rest.join("\n").trim();
  if (headingLine && remainder && isFalseSplitMainHeadingFragment(headingLine, remainder)) {
    return originalLine.trim();
  }
  return glued;
}

/** Lines like `10. TITLE. Body on same line` — heading prefix only. */
export function extractMainSectionHeadingPrefix(
  line: string,
): { heading: string; remainder: string } | null {
  const t = line.trim();
  if (!t || SUBSECTION_HEADING_RE.test(t)) return null;
  const numbered = t.match(/^(\d+)\.\s+(.+)$/);
  if (numbered) {
    const dotSplit = numbered[2].match(/^(.+?)\.\s+(.+)$/s);
    if (dotSplit) {
      const heading = `${numbered[1]}. ${dotSplit[1].trim()}`;
      const remainder = dotSplit[2].trim();
      if (remainder && isMainSectionHeadingLineInternal(heading)) {
        return { heading, remainder };
      }
    }
    const glued = rejectFalseMainHeadingGluedSplit(splitGluedSectionHeadingFromLine(t), t);
    if (glued.includes("\n")) {
      const [headingLine, ...rest] = glued
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      if (headingLine && isMainSectionHeadingLineInternal(headingLine)) {
        const remainder = rest.join("\n").trim();
        if (remainder) return { heading: headingLine, remainder };
      }
    }
  }
  if (isMainSectionHeadingLineInternal(t)) {
    return { heading: t, remainder: "" };
  }
  return null;
}

/** Split one `\n\n` block when it contains standalone or embedded main section headings. */
export function splitSinglePaidProDocumentBlock(block: string): string[] {
  const trimmed = block.trim();
  if (!trimmed) return [];

  if (!trimmed.includes("\n")) {
    const glued = splitGluedMainAndSubsectionHeadingLine(trimmed);
    if (glued) return glued;
    const embedded = extractMainSectionHeadingPrefix(trimmed);
    if (embedded?.remainder) return [embedded.heading, embedded.remainder];
    if (embedded?.heading) return [embedded.heading];
    return [trimmed];
  }

  const lines = trimmed.split("\n");
  const segments: string[] = [];
  let current: string[] = [];

  const flushCurrent = () => {
    const text = current.join("\n").trim();
    if (text) segments.push(text);
    current = [];
  };

  for (const line of lines) {
    const t = line.trim();
    const repairedLine = rejectFalseMainHeadingGluedSplit(splitGluedSectionHeadingFromLine(t), t);
    if (repairedLine !== t) {
      flushCurrent();
      for (const part of repairedLine
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean)) {
        segments.push(...splitSinglePaidProDocumentBlock(part));
      }
      continue;
    }
    const glued = splitGluedMainAndSubsectionHeadingLine(t);
    if (glued) {
      flushCurrent();
      segments.push(glued[0]!);
      current.push(glued[1]!);
      continue;
    }
    if (isMainSectionHeadingLineInternal(t)) {
      flushCurrent();
      segments.push(t);
      continue;
    }
    const embedded = extractMainSectionHeadingPrefix(t);
    if (embedded?.remainder) {
      flushCurrent();
      segments.push(embedded.heading);
      current.push(embedded.remainder);
      continue;
    }
    if (embedded?.heading && !embedded.remainder) {
      flushCurrent();
      segments.push(embedded.heading);
      continue;
    }
    current.push(line);
  }

  flushCurrent();
  return segments.length > 0 ? segments : [trimmed];
}

/** Split plain text into render blocks with main headings isolated from body text. */
export function splitPaidProDocumentBlocks(raw: string): string[] {
  const parts = (raw || "").replace(/\r\n/g, "\n").split(/\n\n+/);
  const out: string[] = [];
  for (const part of parts) {
    const block = part.trim();
    if (!block) continue;
    out.push(...splitSinglePaidProDocumentBlock(block));
  }
  return out;
}

const MAIN_SECTION_LINE_LEAK_RE = /^\d+\.\s+\S+/;

/** Main section heading glued to immediate subsection on one line (test337). */
export const GLUED_MAIN_AND_SUBSECTION_HEADING_RE = /^\d+\.\s+(?!\d+\.\d).+\s+\d+\.\d+\s+/;

export function splitGluedMainAndSubsectionHeadingLine(line: string): string[] | null {
  const t = line.trim();
  if (!GLUED_MAIN_AND_SUBSECTION_HEADING_RE.test(t)) return null;
  const m = t.match(/^(\d+\.\s+(?!\d+\.\d).+?)\s+(\d+\.\d+\s+.*)$/);
  if (!m?.[1] || !m[2]) return null;
  return [m[1].trim(), m[2].trim()];
}

export function detectPaidProPlainParagraphHeadingLeaks(plain: string): {
  plainParagraphHeadingLeakCount: number;
  leakedLines: string[];
} {
  const blocks = classifyPaidProDocumentBlocks(plain);
  const leakedLines: string[] = [];
  for (const block of blocks) {
    if (block.kind !== "body_paragraph") continue;
    for (const line of block.block.split("\n")) {
      const t = line.trim();
      if (!t || SUBSECTION_HEADING_RE.test(t)) continue;
      if (/^section\s+\d+(?:\.\d+)*/i.test(t)) continue;
      if (isMainSectionHeadingLineInternal(t)) {
        leakedLines.push(t);
        continue;
      }
      if (GLUED_MAIN_AND_SUBSECTION_HEADING_RE.test(t)) {
        leakedLines.push(t.slice(0, 160));
        continue;
      }
      if (MAIN_SECTION_LINE_LEAK_RE.test(t) && extractMainSectionHeadingPrefix(t)) {
        leakedLines.push(t.slice(0, 160));
      }
    }
  }
  return {
    plainParagraphHeadingLeakCount: leakedLines.length,
    leakedLines,
  };
}

function classifySignatureLine(firstLine: string): PaidProDocumentBlockKind | null {
  const t = firstLine.trim();
  if (SIGNATURE_PARTY_HEADER_RE.test(t)) return "signature_party_start";
  if (
    t.length >= 4 &&
    t.length <= 120 &&
    SIGNATURE_ENTITY_LINE_RE.test(t) &&
    !/^(?:by|name|title|date|email|address|signature)\s*:/i.test(t)
  ) {
    return "signature_entity_name";
  }
  if (SIGNATURE_NOTICE_EMAIL_RE.test(t)) return "signature_notice";
  if (/^(?:by|name|title|date|address|signature)\s*:/i.test(t)) return "signature_field";
  return null;
}

export function classifyPaidProDocumentBlock(args: {
  block: string;
  blockIndex: number;
  inSignatureRegion: boolean;
}): Pick<ClassifiedPaidProDocumentBlock, "kind" | "firstLine" | "singleLine"> {
  const block = args.block.trim();
  const lines = block.split("\n");
  const singleLine = lines.length === 1;
  const firstLine = lines[0]?.trim() ?? "";

  if (args.inSignatureRegion && singleLine && SIGNATURE_PARTY_HEADER_RE.test(firstLine)) {
    return { kind: "signature_party_start", firstLine, singleLine };
  }

  if (singleLine && isMainSectionHeadingLineInternal(firstLine)) {
    return { kind: "main_section_heading", firstLine, singleLine };
  }

  if (singleLine && /^Section\s+\d+\./i.test(firstLine)) {
    return { kind: "legacy_section_heading", firstLine, singleLine };
  }

  const isTitle =
    args.blockIndex === 0
      ? singleLine && isFirstBlockDocumentTitle(firstLine)
      : singleLine &&
        isStandaloneAllCapsTitleLine(firstLine) &&
        !SIGNATURE_PARTY_HEADER_RE.test(firstLine);

  if (isTitle) {
    return { kind: "document_title", firstLine, singleLine };
  }

  if (args.inSignatureRegion) {
    const sigKind = classifySignatureLine(firstLine);
    if (sigKind && sigKind !== "signature_party_start") {
      return { kind: sigKind, firstLine, singleLine };
    }
  }

  return { kind: "body_paragraph", firstLine, singleLine };
}

export function classifyPaidProDocumentBlocks(plain: string): ClassifiedPaidProDocumentBlock[] {
  const raw = (plain || "").replace(/\r\n/g, "\n");
  const signatureRegionStart = findSignatureRegionStart(raw);
  const splitBlocks = splitPaidProDocumentBlocks(raw);
  const results: ClassifiedPaidProDocumentBlock[] = [];
  let blockIndex = 0;
  let chunkOffset = 0;

  for (const block of splitBlocks) {
    if (!block) continue;
    const blockStart = raw.indexOf(block, chunkOffset);
    if (blockStart >= 0) chunkOffset = blockStart;
    const inSignatureRegion = signatureRegionStart >= 0 && chunkOffset >= signatureRegionStart;
    const classified = classifyPaidProDocumentBlock({ block, blockIndex, inSignatureRegion });
    results.push({
      block,
      blockIndex,
      chunkOffset,
      inSignatureRegion,
      ...classified,
    });
    blockIndex += 1;
    chunkOffset += block.length + 2;
  }
  return results;
}

export type PaidProRenderClassificationSummary = {
  titleCount: number;
  mainSectionHeadingCount: number;
  legacySectionHeadingCount: number;
  signaturePartyStartCount: number;
  signatureEntityCount: number;
  signatureNoticeCount: number;
  signatureFieldCount: number;
  bodyParagraphCount: number;
};

export function summarizePaidProDocumentBlockClassifications(
  plain: string,
): PaidProRenderClassificationSummary {
  const blocks = classifyPaidProDocumentBlocks(plain);
  const summary: PaidProRenderClassificationSummary = {
    titleCount: 0,
    mainSectionHeadingCount: 0,
    legacySectionHeadingCount: 0,
    signaturePartyStartCount: 0,
    signatureEntityCount: 0,
    signatureNoticeCount: 0,
    signatureFieldCount: 0,
    bodyParagraphCount: 0,
  };
  for (const block of blocks) {
    switch (block.kind) {
      case "document_title":
        summary.titleCount += 1;
        break;
      case "main_section_heading":
        summary.mainSectionHeadingCount += 1;
        break;
      case "legacy_section_heading":
        summary.legacySectionHeadingCount += 1;
        break;
      case "signature_party_start":
        summary.signaturePartyStartCount += 1;
        break;
      case "signature_entity_name":
        summary.signatureEntityCount += 1;
        break;
      case "signature_notice":
        summary.signatureNoticeCount += 1;
        break;
      case "signature_field":
        summary.signatureFieldCount += 1;
        break;
      default:
        summary.bodyParagraphCount += 1;
        break;
    }
  }
  return summary;
}

/** CSS class for signature-region body blocks (shared by HTML builder). */
export function premiumDocSignatureClassForBlockKind(
  kind: PaidProDocumentBlockKind,
): string | null {
  switch (kind) {
    case "signature_party_start":
      return "premium-doc-signature-party-start";
    case "signature_entity_name":
      return "premium-doc-signature-entity-name";
    case "signature_notice":
      return "premium-doc-signature-notice";
    case "signature_field":
      return "premium-doc-signature-field";
    default:
      return null;
  }
}

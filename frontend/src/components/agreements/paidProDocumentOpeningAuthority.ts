/**
 * Deterministic document opening authority — title, subtitle, caption, and first
 * operative section boundary shared by title repair and section-heading validation.
 */

import { resolveAuthoritativeWitnessIndex } from "./paidProExecutionBlockNormalization";
import {
  isAuthoritativePaidProAgreementDocumentTitleLine,
} from "./paidProAgreementTitleScope";

export type PaidProDocumentOpeningAuthority = {
  titleLineIndices: number[];
  subtitleLineIndices: number[];
  captionLineIndices: number[];
  openingProseStartLine: number | null;
  firstOperativeSectionLine: number | null;
  confidence: "canonical" | "structural" | "ambiguous";
};

const OPENING_CAPTION_RE =
  /^(?:EFFECTIVE(?:\s+AS\s+OF|\s+DATE)?|AS\s+OF|DATED)\b/i;
const RECITAL_START_RE = /^This\s+(?:Mutual\s+|MUTUAL\s+)?/i;
const FIRST_OPERATIVE_SECTION_RE = /^\d+\.\s+(?!\d+\.\d)/;

function isAllCapsOpeningLine(line: string): boolean {
  const t = line.trim();
  if (t.length < 4 || t.length > 240) return false;
  if (/^\d+\./.test(t)) return false;
  if (/[a-z]/.test(t)) return false;
  return /^[A-Z0-9]/.test(t);
}

/** First line of a multiline all-caps agreement title (e.g. ends with comma or conjunction). */
export function isPaidProMultilineAgreementTitleStartLine(line: string): boolean {
  const t = line.replace(/\s+/g, " ").trim();
  if (!t || t.length < 8 || t.length > 180) return false;
  if (/^\d+\./.test(t)) return false;
  if (/\bAGREEMENT\b/i.test(t)) return false;
  if (!isAllCapsOpeningLine(t)) return false;
  if (/[,&]$/.test(t)) return true;
  if (/\b(?:AND|OR|OF|FOR|THE|TO|WITH|BETWEEN)\s*$/i.test(t)) return true;
  return t.split(/\s+/).filter(Boolean).length <= 6;
}

/** Completes a split all-caps agreement title. */
export function isPaidProMultilineAgreementTitleCompletionLine(line: string): boolean {
  const t = line.replace(/\s+/g, " ").trim();
  if (!t || t.length < 8 || t.length > 240) return false;
  if (/^\d+\./.test(t)) return false;
  if (!/\bAGREEMENT\b/i.test(t)) return false;
  return isAllCapsOpeningLine(t) || isAuthoritativePaidProAgreementDocumentTitleLine(t);
}

function isPaidProDocumentSubtitleLine(
  line: string,
  lines: readonly string[],
  lineIndex: number,
  firstOperativeSectionLine: number | null,
): boolean {
  const t = line.trim();
  if (!t || t.length < 6 || t.length > 160) return false;
  if (/^\d+\./.test(t)) return false;
  if (RECITAL_START_RE.test(t)) return false;
  if (firstOperativeSectionLine != null && lineIndex >= firstOperativeSectionLine) return false;
  if (isAuthoritativePaidProAgreementDocumentTitleLine(t)) return false;
  if (/\bAGREEMENT\b/i.test(t)) return false;
  if (OPENING_CAPTION_RE.test(t)) return false;

  const prevNonEmpty = (() => {
    for (let i = lineIndex - 1; i >= 0; i -= 1) {
      const prev = lines[i]?.trim();
      if (prev) return prev;
    }
    return "";
  })();
  const hasTitleAbove =
    isAuthoritativePaidProAgreementDocumentTitleLine(prevNonEmpty) ||
    isPaidProMultilineAgreementTitleCompletionLine(prevNonEmpty) ||
    isPaidProMultilineAgreementTitleStartLine(prevNonEmpty);

  if (!hasTitleAbove) return false;

  if (isAllCapsOpeningLine(t)) return true;

  const words = t.split(/\s+/).filter(Boolean);
  if (words.length > 12) return false;
  return words.every(
    (w) =>
      /^[A-Z][a-zA-Z'&-]*$/.test(w) ||
      /^[A-Z]{2,}$/.test(w) ||
      /^(?:a|an|the|of|for|to|with|and|or|between|among)$/i.test(w),
  );
}

function isPaidProOpeningCaptionLine(line: string): boolean {
  const t = line.trim();
  if (!t || t.length < 8 || t.length > 160) return false;
  if (/^\d+\./.test(t)) return false;
  if (RECITAL_START_RE.test(t)) return false;
  if (OPENING_CAPTION_RE.test(t)) return true;
  if (
    /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\b/i.test(
      t,
    ) &&
    /\b(?:20\d{2}|\d{1,2},\s*20\d{2})\b/.test(t) &&
    !/\bshall\b/i.test(t)
  ) {
    return true;
  }
  return false;
}

/** Resolve deterministic opening-region boundaries before operative section validation. */
export function resolvePaidProDocumentOpeningAuthority(text: string): PaidProDocumentOpeningAuthority {
  const witnessIdx = resolveAuthoritativeWitnessIndex(text || "");
  const head = witnessIdx >= 0 ? text.slice(0, witnessIdx) : text;
  const lines = head.replace(/\r\n/g, "\n").split("\n");

  let firstOperativeSectionLine: number | null = null;
  for (let i = 0; i < lines.length; i += 1) {
    const t = lines[i]!.trim();
    if (FIRST_OPERATIVE_SECTION_RE.test(t)) {
      firstOperativeSectionLine = i;
      break;
    }
  }

  let openingProseStartLine: number | null = null;
  const proseSearchEnd = firstOperativeSectionLine ?? lines.length;
  for (let i = 0; i < proseSearchEnd; i += 1) {
    const t = lines[i]!.trim();
    if (RECITAL_START_RE.test(t)) {
      openingProseStartLine = i;
      break;
    }
  }

  const titleLineIndices: number[] = [];
  const subtitleLineIndices: number[] = [];
  const captionLineIndices: number[] = [];
  const searchEnd = openingProseStartLine ?? firstOperativeSectionLine ?? Math.min(lines.length, 32);

  for (let i = 0; i < searchEnd; i += 1) {
    const t = lines[i]!.trim();
    if (!t) continue;
    if (isAuthoritativePaidProAgreementDocumentTitleLine(t)) {
      titleLineIndices.push(i);
      continue;
    }
    if (isPaidProOpeningCaptionLine(t)) {
      captionLineIndices.push(i);
      continue;
    }
    if (
      isPaidProMultilineAgreementTitleStartLine(t) ||
      isPaidProMultilineAgreementTitleCompletionLine(t)
    ) {
      titleLineIndices.push(i);
      continue;
    }
    if (isPaidProDocumentSubtitleLine(t, lines, i, firstOperativeSectionLine)) {
      subtitleLineIndices.push(i);
    }
  }

  let confidence: PaidProDocumentOpeningAuthority["confidence"] = "ambiguous";
  if (titleLineIndices.length > 0 && firstOperativeSectionLine != null) {
    confidence = "canonical";
  } else if (firstOperativeSectionLine != null || openingProseStartLine != null) {
    confidence = "structural";
  }

  return {
    titleLineIndices,
    subtitleLineIndices,
    captionLineIndices,
    openingProseStartLine,
    firstOperativeSectionLine,
    confidence,
  };
}

export function isPaidProDocumentOpeningMaterialLineIndex(
  lineIndex: number,
  authority: PaidProDocumentOpeningAuthority,
): boolean {
  return (
    authority.titleLineIndices.includes(lineIndex) ||
    authority.subtitleLineIndices.includes(lineIndex) ||
    authority.captionLineIndices.includes(lineIndex)
  );
}

export function isBeforeFirstOperativeSectionLineIndex(
  lineIndex: number,
  authority: PaidProDocumentOpeningAuthority,
): boolean {
  if (authority.firstOperativeSectionLine == null) return lineIndex < 32;
  return lineIndex < authority.firstOperativeSectionLine;
}

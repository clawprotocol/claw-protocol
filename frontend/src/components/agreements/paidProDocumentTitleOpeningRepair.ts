/**
 * Display-only repair for collapsed / duplicated Pro agreement title + recital openings.
 * Idempotent — safe on frozen signing snapshots and SoT review surfaces.
 */

import { resolveAuthoritativeWitnessIndex } from "./paidProExecutionBlockNormalization";
import {
  summarizePaidProDocumentBlockClassifications,
} from "./paidProDocumentBlockClassifier";

export const PAID_PRO_GLUED_DOCUMENT_TITLE_OPENING_RE =
  /^((?:MUTUAL\s+)?[A-Z][A-Z\s&]{4,80}AGREEMENT)\s+(This\b[\s\S]+)$/;

const PAID_PRO_CANONICAL_TITLE_EXTRACT_RE =
  /\b((?:MUTUAL\s+)?(?:CONSULTING\s+(?:AND\s+IMPLEMENTATION\s+|SERVICES\s+)?|SERVICES\s+)?(?:CONSULTING\s+AND\s+IMPLEMENTATION\s+|CONSULTING\s+SERVICES\s+|BUSINESS\s+CONSULTING\s+|SOFTWARE\s+DEVELOPMENT\s+SERVICES\s+)?AGREEMENT)\b/i;

const PAID_PRO_STANDALONE_TITLE_LINE_RE =
  /^(?:MUTUAL\s+)?[A-Z][A-Z\s&]{4,80}AGREEMENT\s*$/i;

const PAID_PRO_CAPS_TITLE_SCAN_RE = /\b(?:MUTUAL\s+)?[A-Z][A-Z\s&]{4,80}AGREEMENT\b/g;

const PAID_PRO_RECITAL_START_RE =
  /\bThis\s+(?:(?:Mutual|MUTUAL)\s+)?(?:Consulting\s+(?:and\s+Implementation\s+|Services\s+)?|Services\s+|SERVICES\s+)?(?:Consulting\s+and\s+Implementation\s+|Consulting\s+Services\s+|Software\s+Development\s+Services\s+)?Agreement\b/i;

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function openingSliceBeforeSectionOne(text: string): string {
  const normalized = (text || "").replace(/\r\n/g, "\n");
  const sec1Idx = normalized.search(/^\s*1\.\s+(?!\d)/m);
  return sec1Idx >= 0 ? normalized.slice(0, sec1Idx) : normalized.slice(0, 2_500);
}

function extractCanonicalTitleUpper(opening: string): string | null {
  const match = opening.match(PAID_PRO_CANONICAL_TITLE_EXTRACT_RE);
  return match?.[1]?.replace(/\s+/g, " ").trim().toUpperCase() ?? null;
}

function countCapsTitleOccurrences(opening: string): number {
  return (opening.match(PAID_PRO_CAPS_TITLE_SCAN_RE) ?? []).length;
}

/** Title-case recital phrase from an all-caps document title. */
export function recitalPhraseFromTitleUpper(titleUpper: string): string {
  return titleUpper
    .trim()
    .toLowerCase()
    .replace(/(^|\s)\S/g, (m) => m.toUpperCase());
}

export function hasStandaloneTitleParagraph(opening: string): boolean {
  const firstBlock = opening.trim().split(/\n\n+/)[0]?.trim() ?? "";
  const lines = firstBlock.split("\n").map((line) => line.trim()).filter(Boolean);
  if (lines.length !== 1) return false;
  return PAID_PRO_STANDALONE_TITLE_LINE_RE.test(lines[0] ?? "");
}

function recitalRepeatsTitlePhrase(openingFlat: string, titleUpper: string): boolean {
  if (!titleUpper.trim()) return false;
  const titleEsc = escapeRegex(titleUpper);
  return new RegExp(`\\bThis\\s+${titleEsc}\\b`).test(openingFlat);
}

function collapseRecitalTitleDuplication(recital: string, titleUpper: string): string {
  let r = recital.trim();
  const titleEsc = escapeRegex(titleUpper);
  const recitalPhrase = recitalPhraseFromTitleUpper(titleUpper);

  r = r.replace(new RegExp(`^(?:${titleEsc}\\s+)+`, "i"), "");
  r = r.replace(new RegExp(`^This\\s+${titleEsc}\\b`, "i"), `This ${recitalPhrase}`);

  while (/^This\s+(?:MUTUAL\s+)?(?:SERVICES\s+)?AGREEMENT\s+This\s+/i.test(r)) {
    r = r.replace(/^This\s+(?:MUTUAL\s+)?(?:SERVICES\s+)?AGREEMENT\s+/i, "");
  }
  r = r.replace(
    /^((?:This\s+(?:(?:Mutual|MUTUAL)\s+)?(?:[A-Za-z]+\s+){0,10}Agreement\s*)+)/i,
    (match) => {
      const parts = match.match(/This\s+(?:(?:Mutual|MUTUAL)\s+)?(?:[A-Za-z]+\s+){0,10}Agreement\s*/gi) ?? [];
      const last = parts[parts.length - 1] ?? match;
      if (new RegExp(titleEsc, "i").test(last)) {
        return `This ${recitalPhrase} `;
      }
      return last;
    },
  );
  if (!/^This\s+/i.test(r)) {
    r = `This ${r.replace(new RegExp(`^${titleEsc}\\s*`, "i"), "").trim()}`.trim();
  }
  return r.trim();
}

/** True when the opening lacks a standalone title block or repeats the title inline. */
export function needsPaidProDocumentTitleOpeningRepair(text: string): boolean {
  const body = (text || "").replace(/\r\n/g, "\n").trim();
  if (body.length < 40) return false;

  const opening = openingSliceBeforeSectionOne(body);
  const openingFlat = opening.replace(/\s+/g, " ").trim();
  const firstLine = opening.split("\n").map((line) => line.trim()).find(Boolean) ?? "";

  const titleUpper = extractCanonicalTitleUpper(opening) ?? "";

  if (PAID_PRO_GLUED_DOCUMENT_TITLE_OPENING_RE.test(firstLine)) return true;
  if (titleUpper && recitalRepeatsTitlePhrase(openingFlat, titleUpper)) return true;
  if (countCapsTitleOccurrences(opening) > 1) return true;

  const summary = summarizePaidProDocumentBlockClassifications(body);
  if (summary.titleCount >= 1 && hasStandaloneTitleParagraph(opening) && (!titleUpper || !recitalRepeatsTitlePhrase(openingFlat, titleUpper))) {
    return false;
  }

  if (hasStandaloneTitleParagraph(opening) && (!titleUpper || !recitalRepeatsTitlePhrase(openingFlat, titleUpper))) {
    return false;
  }

  return Boolean(extractCanonicalTitleUpper(opening) && PAID_PRO_RECITAL_START_RE.test(opening));
}

/** Split a collapsed title + recital opening into a standalone title line and one recital paragraph. */
export function repairPaidProDocumentTitleOpening(text: string): {
  text: string;
  repairs: string[];
} {
  const repairs: string[] = [];
  const working = (text || "").replace(/\r\n/g, "\n").trim();
  if (!working || !needsPaidProDocumentTitleOpeningRepair(working)) {
    return { text: working, repairs };
  }

  const witnessIdx = resolveAuthoritativeWitnessIndex(working);
  const prefix = witnessIdx >= 0 ? working.slice(0, witnessIdx) : working;
  const tail = witnessIdx >= 0 ? working.slice(witnessIdx) : "";

  const sec1Idx = prefix.search(/^\s*1\.\s+(?!\d)/m);
  const openingPart = sec1Idx >= 0 ? prefix.slice(0, sec1Idx) : prefix;
  const bodyPart = sec1Idx >= 0 ? prefix.slice(sec1Idx) : "";

  const titleUpper = extractCanonicalTitleUpper(openingPart);
  if (!titleUpper) return { text: working, repairs };

  const openingFlat = openingPart.replace(/\n+/g, " ").replace(/\s+/g, " ").trim();
  const titleEsc = escapeRegex(titleUpper);
  let recitalIdx = openingFlat.search(PAID_PRO_RECITAL_START_RE);
  if (recitalIdx < 0) {
    const gluedIdx = openingFlat.search(new RegExp(`${titleEsc}\\s+This\\b`, "i"));
    if (gluedIdx < 0) return { text: working, repairs };
    recitalIdx = gluedIdx + titleUpper.length;
  }

  let recital = openingFlat.slice(recitalIdx).trim();
  recital = collapseRecitalTitleDuplication(recital, titleUpper);

  const rebuiltOpening = `${titleUpper}\n\n${recital}`.trim();
  if (
    hasStandaloneTitleParagraph(rebuiltOpening) &&
    !recitalRepeatsTitlePhrase(recital, titleUpper) &&
    rebuiltOpening.replace(/\s+/g, " ").trim() === openingFlat
  ) {
    return { text: working, repairs };
  }

  repairs.push("display:repair_collapsed_title_opening");
  const out = `${rebuiltOpening}\n\n${bodyPart.trim()}${tail ? `\n\n${tail.trimStart()}` : ""}`
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();
  return { text: out, repairs };
}

/** Final visible-shell title projection — idempotent display-only separator + recital cleanup. */
export function projectPaidProVisibleTitleDisplayPlain(plain: string): string {
  const body = (plain || "").trim();
  if (body.length < 40) return body;
  const repaired = repairPaidProDocumentTitleOpening(body);
  if (repaired.repairs.length > 0) return repaired.text;
  if (summarizePaidProDocumentBlockClassifications(body).titleCount >= 1) return body;
  return repairPaidProDocumentTitleOpening(body).text || body;
}

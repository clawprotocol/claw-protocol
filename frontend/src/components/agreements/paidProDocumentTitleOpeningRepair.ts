/**
 * Display-only repair for collapsed / duplicated Pro agreement title + recital openings.
 * Idempotent — safe on frozen signing snapshots and SoT review surfaces.
 */

import { resolveAuthoritativeWitnessIndex } from "./paidProExecutionBlockNormalization";
import {
  summarizePaidProDocumentBlockClassifications,
} from "./paidProDocumentBlockClassifier";

const PAID_PRO_CANONICAL_TITLE_EXTRACT_RE =
  /\b((?:MUTUAL\s+)?(?:CONSULTING\s+(?:AND\s+IMPLEMENTATION\s+|SERVICES\s+)?|SERVICES\s+)?(?:CONSULTING\s+AND\s+IMPLEMENTATION\s+|CONSULTING\s+SERVICES\s+|BUSINESS\s+CONSULTING\s+|SOFTWARE\s+DEVELOPMENT\s+SERVICES\s+)?AGREEMENT)\b/i;

const PAID_PRO_CAPS_TITLE_SCAN_RE = /\b(?:MUTUAL\s+)?[A-Z][A-Z\s&]{4,80}AGREEMENT\b/g;

const PAID_PRO_RECITAL_START_RE =
  /\bThis\s+(?:Mutual\s+)?(?:Consulting\s+(?:and\s+Implementation\s+|Services\s+)?|Services\s+)?(?:Consulting\s+and\s+Implementation\s+|Consulting\s+Services\s+|Software\s+Development\s+Services\s+)?Agreement\b/i;

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

function collapseRecitalTitleDuplication(recital: string, titleUpper: string): string {
  let r = recital.trim();
  const titleEsc = escapeRegex(titleUpper);
  r = r.replace(new RegExp(`^(?:${titleEsc}\\s+)+`, "i"), "");
  while (/^This\s+(?:MUTUAL\s+)?(?:SERVICES\s+)?AGREEMENT\s+This\s+/i.test(r)) {
    r = r.replace(/^This\s+(?:MUTUAL\s+)?(?:SERVICES\s+)?AGREEMENT\s+/i, "");
  }
  r = r.replace(
    /^((?:This\s+(?:Mutual\s+)?(?:[A-Za-z]+\s+){0,10}Agreement\s*)+)/i,
    (match) => {
      const parts = match.match(/This\s+(?:Mutual\s+)?(?:[A-Za-z]+\s+){0,10}Agreement\s*/gi) ?? [];
      return parts[parts.length - 1] ?? match;
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
  const firstLine = opening.split("\n").map((line) => line.trim()).find(Boolean) ?? "";
  if (/^[A-Z][A-Z\s&]{8,}AGREEMENT\s+This\b/.test(firstLine)) return true;
  if (
    /\b(?:MUTUAL\s+)?[A-Z][A-Z\s&]{4,80}AGREEMENT\s+This\s+(?:MUTUAL\s+)?[A-Z][A-Z\s&]{4,80}AGREEMENT\b/.test(
      opening.slice(0, 800),
    )
  ) {
    return true;
  }
  if (countCapsTitleOccurrences(opening) > 1) return true;

  const summary = summarizePaidProDocumentBlockClassifications(body);
  if (summary.titleCount >= 1) return false;

  const firstBlockLine = opening
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean) ?? "";
  if (/^(?:MUTUAL\s+)?[A-Z][A-Z\s&]{4,80}AGREEMENT\s*$/i.test(firstBlockLine)) {
    const afterTitle = opening.slice(opening.indexOf(firstBlockLine) + firstBlockLine.length).trim();
    if (/^This\s+/i.test(afterTitle) && countCapsTitleOccurrences(opening) <= 1) {
      return false;
    }
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
  const normalizedBefore = openingPart.replace(/\s+/g, " ").trim();
  const normalizedAfter = rebuiltOpening.replace(/\s+/g, " ").trim();
  if (normalizedBefore === normalizedAfter) {
    return { text: working, repairs };
  }

  repairs.push("display:repair_collapsed_title_opening");
  const out = `${rebuiltOpening}\n\n${bodyPart.trim()}${tail ? `\n\n${tail.trimStart()}` : ""}`
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();
  return { text: out, repairs };
}

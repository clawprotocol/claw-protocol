/**
 * Display-only repair for collapsed / duplicated Pro agreement title + recital openings.
 * Idempotent — safe on frozen signing snapshots and SoT review surfaces.
 */

import { resolveAuthoritativeWitnessIndex } from "./paidProExecutionBlockNormalization";
import {
  summarizePaidProDocumentBlockClassifications,
} from "./paidProDocumentBlockClassifier";
import { resolvePaidProUniversalDisplayTitle } from "./paidProUniversalDisplayTitle";
import type { AgreementFamily } from "./agreementFamilyRouter";

export const PAID_PRO_GLUED_DOCUMENT_TITLE_OPENING_RE =
  /^((?:MUTUAL\s+)?[A-Z][A-Z\s&]{4,80}AGREEMENT)\s+(This\b[\s\S]+)$/;

const PAID_PRO_CANONICAL_TITLE_EXTRACT_RE =
  /\b((?:MUTUAL\s+)?(?:CONSULTING\s+(?:AND\s+IMPLEMENTATION\s+|SERVICES\s+)?|SERVICES\s+|SOFTWARE\s+DEVELOPMENT\s+(?:SERVICES\s+)?|FREELANCE\s+SOFTWARE\s+DEVELOPMENT\s+|WEB\s+DEVELOPMENT\s+|SAAS\s+(?:SUBSCRIPTION\s+|SERVICES\s+)?)?(?:CONSULTING\s+AND\s+IMPLEMENTATION\s+|CONSULTING\s+SERVICES\s+|BUSINESS\s+CONSULTING\s+|SOFTWARE\s+DEVELOPMENT\s+(?:SERVICES\s+)?)?AGREEMENT)\b/i;

const PAID_PRO_STANDALONE_TITLE_LINE_RE =
  /^(?:MUTUAL\s+)?[A-Z][A-Z\s&]{4,80}AGREEMENT\s*$/i;

const PAID_PRO_CAPS_TITLE_SCAN_RE = /\b(?:MUTUAL\s+)?[A-Z][A-Z\s&]{4,80}AGREEMENT\b/g;

/** Formal recital opener — must not match mid-prose "enter into this Agreement". */
const PAID_PRO_RECITAL_START_RE =
  /(?:^|[.!?]\s+)This\s+(?:(?:Mutual|MUTUAL)\s+)?(?:Consulting\s+(?:and\s+Implementation\s+|Services\s+)?|Services\s+|SERVICES\s+|Software\s+Development\s+(?:Services\s+)?|Freelance\s+Software\s+Development\s+|Web\s+Development\s+)?(?:Consulting\s+and\s+Implementation\s+|Consulting\s+Services\s+|Software\s+Development\s+Services\s+)?Agreement\b/i;

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function openingSliceBeforeSectionOne(text: string): string {
  const normalized = (text || "").replace(/\r\n/g, "\n");
  const sec1Idx = normalized.search(/^\s*1\.\s+(?!\d)/m);
  return sec1Idx >= 0 ? normalized.slice(0, sec1Idx) : normalized.slice(0, 2_500);
}

function extractCanonicalTitleUpper(opening: string): string | null {
  // Prefer a standalone first-line caps title (avoids truncating
  // "SOFTWARE DEVELOPMENT AGREEMENT" down to bare "AGREEMENT").
  const firstLine = opening
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);
  if (firstLine && PAID_PRO_STANDALONE_TITLE_LINE_RE.test(firstLine)) {
    return firstLine.replace(/\s+/g, " ").trim().toUpperCase();
  }
  const caps = opening.match(PAID_PRO_CAPS_TITLE_SCAN_RE) ?? [];
  if (caps.length > 0) {
    const longest = [...caps].sort((a, b) => b.length - a.length)[0]!;
    const normalized = longest.replace(/\s+/g, " ").trim().toUpperCase();
    // Bare "AGREEMENT" is never an authoritative document title by itself.
    if (normalized !== "AGREEMENT") return normalized;
  }
  const match = opening.match(PAID_PRO_CANONICAL_TITLE_EXTRACT_RE);
  const extracted = match?.[1]?.replace(/\s+/g, " ").trim().toUpperCase() ?? null;
  if (extracted === "AGREEMENT") return null;
  return extracted;
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
  // Bare "AGREEMENT" matches ordinary prose ("enter into this Agreement") — never treat that
  // as a collapsed title/recital duplication signal.
  if (/^AGREEMENT$/i.test(titleUpper.trim())) return false;
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

export type ProjectPaidProVisibleTitleOpts = {
  /** Draft / persisted agreement title (e.g. "Services Agreement"). */
  fallbackTitle?: string | null;
  /** Raw create / resume intake prompt — drives intent-specific titles. */
  intakeText?: string | null;
  /** Routed agreement family when known. */
  family?: AgreementFamily | string | null;
};

/**
 * When the corpus has no classified document title, prepend the best universal title
 * for this prompt (employment / consulting / IP / services / …) — display-only.
 */
export function ensurePaidProVisibleDocumentTitleOpening(
  plain: string,
  opts?: ProjectPaidProVisibleTitleOpts,
): { text: string; repairs: string[] } {
  const body = (plain || "").replace(/\r\n/g, "\n").trim();
  const repairs: string[] = [];
  if (body.length < 40) return { text: body, repairs };
  if (summarizePaidProDocumentBlockClassifications(body).titleCount >= 1) {
    return { text: body, repairs };
  }

  const resolved = resolvePaidProUniversalDisplayTitle({
    draftTitle: opts?.fallbackTitle,
    intakeText: opts?.intakeText,
    family: opts?.family,
    corpusPlain: body,
  });
  if (!resolved.titleUpper) return { text: body, repairs };

  repairs.push("display:ensure_missing_document_title");
  return {
    text: `${resolved.titleUpper}\n\n${body}`.replace(/\n{3,}/g, "\n\n"),
    repairs,
  };
}

/** Final visible-shell title projection — idempotent display-only separator + recital cleanup. */
export function projectPaidProVisibleTitleDisplayPlain(
  plain: string,
  opts?: ProjectPaidProVisibleTitleOpts,
): string {
  const body = (plain || "").trim();
  if (body.length < 40) return body;
  const repaired = repairPaidProDocumentTitleOpening(body);
  const afterRepair = repaired.repairs.length > 0 ? repaired.text : body;
  if (summarizePaidProDocumentBlockClassifications(afterRepair).titleCount >= 1) {
    return afterRepair;
  }
  const ensured = ensurePaidProVisibleDocumentTitleOpening(afterRepair, opts);
  return ensured.text || afterRepair;
}

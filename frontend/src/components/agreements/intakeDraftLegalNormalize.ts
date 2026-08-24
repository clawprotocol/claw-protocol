/**
 * Deterministic post-parse upgrades: map common legal phrasing from raw intake
 * into structured draft fields (no LLM, no network).
 */
import { extractIntakePayment, formatPaymentTermsLine } from "./intakeCurrencyParse";
import { parseIntakeToStructuredAgreement } from "./intakeStructuredAgreementModel";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import {
  STARTER_DEFAULT_TERMINATION_SUMMARY,
  terminationSummaryIsUnset,
} from "./starterAgreementPreviewNormalize";

const MONTH_MAP: Record<string, number> = {
  january: 1,
  jan: 1,
  february: 2,
  feb: 2,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  may: 5,
  june: 6,
  jun: 6,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sep: 9,
  sept: 9,
  october: 10,
  oct: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12,
};

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

function formatCalendarDate(y: number, m: number, d: number): string {
  if (m < 1 || m > 12 || d < 1 || d > 31) return "";
  return `${MONTH_NAMES[m - 1]} ${d}, ${y}`;
}

function collapseWs(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function effectiveDateIsWeak(s: string | null | undefined): boolean {
  const t = (s || "").trim();
  if (!t) return true;
  if (/^tbd$/i.test(t)) return true;
  if (/upon\s+full\s+execution/i.test(t)) return true;
  if (/^as\s+of\s+signing\.?$/i.test(t)) return true;
  if (/\b20\d{2}\b/.test(t) && /(January|February|March|April|May|June|July|August|September|October|November|December)/i.test(t)) {
    return false;
  }
  if (/\b20\d{2}-\d{1,2}-\d{1,2}\b/.test(t)) return false;
  if (/\b\d{1,2}\/\d{1,2}\/20\d{2}\b/.test(t)) return false;
  return true;
}

function dateAlreadyRepresentedElsewhere(datePhrase: string, duration: string | null, due: string | null): boolean {
  const p = datePhrase.trim().toLowerCase();
  if (!p) return false;
  const d = `${duration || ""} ${due || ""}`.toLowerCase();
  return d.includes(p) || (p.length > 6 && d.includes(p.slice(0, 8)));
}

const MONTH_NAME_RE =
  /\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(20\d{2})\b/i;

function matchMonthDate(s: string): { month: string; day: number; year: number } | null {
  const m = s.match(MONTH_NAME_RE);
  if (!m) return null;
  const monthKey = m[1].toLowerCase();
  const mo = MONTH_MAP[monthKey];
  if (!mo) return null;
  return { month: m[1], day: Number(m[2]), year: Number(m[3]) };
}

/** Extract a single human-readable start/effective date from free text when parse missed it. */
export function extractEffectiveDateFromRawIntake(raw: string): string | null {
  const t = collapseWs(raw);
  if (!t) return null;

  const iso = t.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) {
    const y = Number(iso[1]);
    const mo = Number(iso[2]);
    const d = Number(iso[3]);
    const out = formatCalendarDate(y, mo, d);
    return out || null;
  }

  const slash = t.match(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/);
  if (slash) {
    const mo = Number(slash[1]);
    const d = Number(slash[2]);
    const y = Number(slash[3]);
    const out = formatCalendarDate(y, mo, d);
    return out || null;
  }

  const prefix = /(?:starting|start(?:ing)?|effective|begins?|commencing|as of)\s+/i;
  const pm = t.match(prefix);
  const slice = pm && pm.index != null ? t.slice(pm.index + pm[0].length) : t;
  const hit = matchMonthDate(slice) || matchMonthDate(t);
  if (hit) {
    const mo = MONTH_MAP[hit.month.toLowerCase()];
    if (!mo) return null;
    return formatCalendarDate(hit.year, mo, hit.day) || null;
  }

  return null;
}

const AT_WILL_TERMINATION =
  "This relationship is at-will. Either party may end it at any time, with or without cause or advance notice, except where applicable law requires otherwise.";

function rawHasAtWill(raw: string): boolean {
  const t = raw.toLowerCase();
  return /\bat[\s-]?will\b/.test(t) || /\bat\s+will\s+agreement\b/.test(t) || /\bat-will\b/.test(t);
}

function draftTerminationSummaryIsUnset(parsed: ParsedDraftShape): boolean {
  return terminationSummaryIsUnset(parsed.termination_summary);
}

/** When intake clearly describes termination notice but duration still looks like a notice period. */
function reconcileTerminationNoticeMisroute(parsed: ParsedDraftShape, rawIntake: string): ParsedDraftShape {
  if (parsed.agreement_family === "operating_agreement") return parsed;
  const raw = collapseWs(rawIntake);
  if (!raw) return parsed;
  const low = raw.toLowerCase();
  const noticeCtx =
    /termination\s+by\s+either\s+party|either\s+party\s+may\s+terminate|either\s+party\s+may\s+end|30\s*days?\s+notice|notice\s+by\s+email|terminated\s+with\s+notice|terminate\s+with\s+notice|end\s+with\s+notice|cancel\s+with\s+notice/i.test(
      low,
    );
  if (!noticeCtx) return parsed;

  const structured = parseIntakeToStructuredAgreement(raw);
  const syn = (structured.termination || "").trim();
  if (!syn) return parsed;

  let next: ParsedDraftShape = { ...parsed };
  const dur = (next.duration || "").trim();
  const tsWeak = draftTerminationSummaryIsUnset(next);

  const dayUnitOnly = /^\d+\s*days?$/i.test(dur);
  const dayPlusExec =
    /\b\d+\s*days?\s*(?:[·•]|—|-|,)\s*upon\s+full\s+execution/i.test(dur) ||
    (/\b\d+\s*days?\b/i.test(dur) && /\bupon\s+full\s+execution/i.test(dur));
  const stoleNoticePeriod =
    dayUnitOnly ||
    dayPlusExec ||
    (/\b\d+\s*days?\b/i.test(dur) &&
      /notice|terminat/i.test(low) &&
      !/\b(?:1|one)\s+year\b/i.test(dur) &&
      !/\b\d+\s*(?:month|months|week|weeks|year|years)\b/i.test(dur));

  if (stoleNoticePeriod) {
    return {
      ...next,
      ...(tsWeak ? { termination_summary: syn } : {}),
      duration: "Ongoing unless and until terminated in accordance with the termination provisions.",
    };
  }

  if (tsWeak) {
    return { ...next, termination_summary: syn };
  }

  return next;
}

/** Copy structured termination from intake when the parse payload omitted it (client-only path). */
function backfillTerminationSummaryFromIntake(parsed: ParsedDraftShape, rawIntake: string): ParsedDraftShape {
  if (parsed.agreement_family === "operating_agreement") return parsed;
  const raw = collapseWs(rawIntake);
  if (!raw) return parsed;
  if (!draftTerminationSummaryIsUnset(parsed)) return parsed;
  const syn = parseIntakeToStructuredAgreement(raw).termination.trim();
  if (!syn) return parsed;
  return { ...parsed, termination_summary: syn };
}

/** Replace bilateral shell default when intake already implies termination-driven duration. */
function softenGenericDurationWhenTerminationRich(parsed: ParsedDraftShape, rawIntake: string): ParsedDraftShape {
  if (parsed.agreement_family === "operating_agreement") return parsed;
  const raw = collapseWs(rawIntake);
  if (!raw) return parsed;
  const syn = parseIntakeToStructuredAgreement(raw).termination.trim();
  if (syn.length < 24) return parsed;
  const dur = (parsed.duration || "").trim();
  if (!dur) return parsed;
  if (/^12\s+months\s+unless\s+terminated\s+earlier/i.test(dur)) {
    return {
      ...parsed,
      duration: "Ongoing unless and until terminated in accordance with the termination provisions.",
    };
  }
  return parsed;
}

/**
 * "Lent $X repay monthly" style: do not keep the misleading `$X, monthly payment` line; use principal + Schedule A language.
 */
function applyPersonalLoanInstallmentWordingFromIntake(
  parsed: ParsedDraftShape,
  rawIntake: string,
): ParsedDraftShape {
  const p = extractIntakePayment(rawIntake);
  if (!p.installmentAmountUnspecified || p.amount == null) return parsed;
  const want = formatPaymentTermsLine(p);
  const cur = (parsed.payment_terms || "").trim();
  if (!cur) {
    return { ...parsed, payment_terms: want, payment: p };
  }
  if (new RegExp(`^\\$\\s*${p.amount.toLocaleString("en-US")}\\s*,\\s*monthly payment`, "i").test(cur)) {
    return { ...parsed, payment_terms: want, payment: p };
  }
  if (/^\$[\d,]+(?:\.\d{1,2})?\s*,\s*monthly payment\.?\s*$/i.test(cur) && p.cadence === "monthly") {
    return { ...parsed, payment_terms: want, payment: p };
  }
  return { ...parsed, payment: p };
}

/**
 * Upgrade parsed draft using raw intake (deterministic).
 * Safe to run after `applySimpleFlowSmartDefaults` and canonical type alignment.
 */
export function normalizeParsedDraftLegalConcepts(parsed: ParsedDraftShape, rawIntake: string): ParsedDraftShape {
  const raw = collapseWs(rawIntake);
  if (!raw) return parsed;

  let next: ParsedDraftShape = { ...parsed };

  // At-will employment-style heuristics do not apply to LLC operating agreement shells.
  if (parsed.agreement_family === "operating_agreement") {
    if (effectiveDateIsWeak(next.effective_date)) {
      const extracted = extractEffectiveDateFromRawIntake(raw);
      if (extracted && !dateAlreadyRepresentedElsewhere(extracted, next.duration, next.due_date)) {
        next = { ...next, effective_date: extracted };
      }
    }
    return next;
  }

  if (rawHasAtWill(raw)) {
    const cur = (next.termination_summary || "").trim();
    if (!cur) {
      next = { ...next, termination_summary: AT_WILL_TERMINATION };
    }
    const dur = (next.duration || "").trim();
    if (!dur) {
      next = { ...next, duration: "At-will unless the parties agree otherwise in writing." };
    }
  }

  if (effectiveDateIsWeak(next.effective_date)) {
    const extracted = extractEffectiveDateFromRawIntake(raw);
    if (extracted && !dateAlreadyRepresentedElsewhere(extracted, next.duration, next.due_date)) {
      next = { ...next, effective_date: extracted };
    }
  }

  next = reconcileTerminationNoticeMisroute(next, raw);
  next = backfillTerminationSummaryFromIntake(next, raw);
  next = softenGenericDurationWhenTerminationRich(next, raw);
  next = applyPersonalLoanInstallmentWordingFromIntake(next, raw);
  if (draftTerminationSummaryIsUnset(next)) {
    next = { ...next, termination_summary: STARTER_DEFAULT_TERMINATION_SUMMARY };
  }

  return next;
}

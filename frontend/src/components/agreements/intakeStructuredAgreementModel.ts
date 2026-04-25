/**
 * Single structured view of free-text intake: each concept maps to at most one field.
 * Heuristic only — server parse on submit remains authoritative when available.
 */

import { extractBetweenPartyPair } from "./partyBetweenParse";
import {
  extractIntakePayment,
  formatPaymentCadencePhrase,
  formatPaymentTermsLine,
  type IntakePaymentField,
} from "./intakeCurrencyParse";
import { formatPartiesJoinedLine, formatPartySegmentForPreview } from "./partyFormat";
import { normalizePartyNameFragment, splitTwoPartiesFromJoinedLine, type StructuredTwoParties } from "./partyIntakeNormalize";

export type IntakeStructuredAgreement = {
  parties: string[];
  scope: string;
  payment: string;
  term: string;
  governing_law: string;
  confidentiality: string;
  termination: string;
  /** When true, omit party lines and rely on placeholders / suggestions. */
  partiesUncertain: boolean;
  /** 0–1 heuristic confidence for scope extraction. */
  scopeConfidence: number;
  termConfidence: number;
  /** Low-confidence scope with usable signal — UI may show ⚠️ inferred, not “missing”. */
  scopeInferred: boolean;
  termInferred: boolean;
  /** True when fuzzy or structured cues indicate the user described scope (even if chunk is imperfect). */
  scopeSignalPresent: boolean;
  termSignalPresent: boolean;
};

const MAX_PARTY_CHARS = 72;
const MAX_PARTY_WORDS = 9;
const MAX_FIELD_CHARS = 320;
const PARTY_CONFIDENCE_SHOW = 0.72;

function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

/** One sentence, trimmed; drops obvious repetition. */
export function normalizeIntakeFieldText(raw: string, maxLen = MAX_FIELD_CHARS): string {
  let s = raw.replace(/\s+/g, " ").trim();
  if (!s) return "";
  const firstStop = s.search(/[.!?]\s/);
  if (firstStop > 40 && firstStop < maxLen) {
    s = s.slice(0, firstStop + 1).trim();
  }
  s = dedupeLooseSentences(s);
  if (s.length > maxLen) s = `${s.slice(0, maxLen - 1).trim()}…`;
  return s;
}

function dedupeLooseSentences(s: string): string {
  const parts = s.split(/(?<=[.!?])\s+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length <= 1) return s;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const k = p.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  return out.join(" ");
}

function looksLikeNameFragment(s: string): boolean {
  const t = s.trim();
  if (t.length < 2) return false;
  if (wordCount(t) > MAX_PARTY_WORDS) return false;
  if (t.length > MAX_PARTY_CHARS) return false;
  if (/^(?:if|when|the|this|payment|fee|i\s+will|we\s+will|whereas|agreement|contract)\b/i.test(t)) return false;
  return wordCount(t) >= 2 || /(?:LLC|L\.L\.C\.|Inc\.?|Corp\.?|Ltd\.?|LLP|PLLC)\b/i.test(t);
}

function confidenceBetweenPair(left: string, right: string): number {
  const wc = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
  const hasEntityMark = (s: string) =>
    /(?:LLC|L\.L\.C\.|Inc\.?|Incorporated|Corp\.?|Corporation|Ltd\.?|Limited|LLP|PLLC|PC|P\.C\.)/i.test(s);
  let c = 0.88;
  if (wc(left) >= 2 || wc(right) >= 2) c = 0.94;
  if (hasEntityMark(left) || hasEntityMark(right)) c = 0.98;
  if (wc(left) === 1 && wc(right) === 1 && Math.min(left.length, right.length) <= 2) c = 0.45;
  return Math.min(1, c);
}

function clampPartySegment(raw: string): string {
  const formatted = formatPartySegmentForPreview(normalizePartyNameFragment(raw));
  if (formatted.length > MAX_PARTY_CHARS) return "";
  if (wordCount(formatted) > MAX_PARTY_WORDS) return "";
  return formatted;
}

type PartiesExtract = {
  parties: string[];
  uncertain: boolean;
  structured: StructuredTwoParties | null;
};

function tryCommaPairFirstLine(text: string): PartiesExtract | null {
  const firstLine = (text.split(/\n/)[0] || "").trim();
  if (firstLine.length < 8) return null;
  if (/^\s*parties?\s*:/i.test(firstLine)) return null;
  if (/\bbetween\b/i.test(firstLine)) return null;
  const idx = firstLine.indexOf(",");
  if (idx < 2 || idx >= firstLine.length - 3) return null;
  let leftRaw = firstLine.slice(0, idx).trim();
  let rightRaw = firstLine.slice(idx + 1).trim();
  const rCut = rightRaw.search(/\b(?:for|whereas|effective|hereafter)\b|[.!?](?:\s|$)/i);
  if (rCut > 0) rightRaw = rightRaw.slice(0, rCut).trim();
  if (!looksLikeNameFragment(leftRaw) || !looksLikeNameFragment(rightRaw)) return null;
  const a = clampPartySegment(leftRaw);
  const b = clampPartySegment(rightRaw);
  if (a.length < 2 || b.length < 2) return null;
  const conf = confidenceBetweenPair(a, b);
  const structured: StructuredTwoParties = { party_1: a, party_2: b };
  if (conf >= PARTY_CONFIDENCE_SHOW) {
    return { parties: [a, b], uncertain: false, structured };
  }
  return { parties: [], uncertain: true, structured: null };
}

function extractStructuredParties(text: string, lower: string): PartiesExtract {
  const betweenPair = extractBetweenPartyPair(text);
  if (betweenPair) {
    const a = clampPartySegment(betweenPair.left);
    const b = clampPartySegment(betweenPair.right);
    if (a.length > 1 && b.length > 1) {
      const conf = confidenceBetweenPair(a, b);
      const structured: StructuredTwoParties = { party_1: a, party_2: b };
      if (conf >= PARTY_CONFIDENCE_SHOW) {
        return { parties: [a, b], uncertain: false, structured };
      }
      return { parties: [], uncertain: true, structured: null };
    }
  }

  const partiesEq = text.match(/\bparties?\s*:\s*([^\n]+)/i);
  if (partiesEq) {
    const rawBody = partiesEq[1].trim();
    if (rawBody.length > 200 || wordCount(rawBody) > 24) {
      return { parties: [], uncertain: true, structured: null };
    }
    const commaParts = rawBody.split(/\s*,\s*/).map((x) => x.trim()).filter(Boolean);
    if (commaParts.length >= 2) {
      const a = clampPartySegment(commaParts[0]);
      const b = clampPartySegment(commaParts[1]);
      if (a.length > 1 && b.length > 1) {
        return { parties: [a, b], uncertain: false, structured: { party_1: a, party_2: b } };
      }
    }
    const joined = formatPartiesJoinedLine(rawBody);
    const structured = splitTwoPartiesFromJoinedLine(joined);
    if (structured && clampPartySegment(structured.party_1) && clampPartySegment(structured.party_2)) {
      const a = clampPartySegment(structured.party_1);
      const b = clampPartySegment(structured.party_2);
      if (a.length > 1 && b.length > 1) {
        return { parties: [a, b], uncertain: false, structured: { party_1: a, party_2: b } };
      }
    }
    return { parties: [], uncertain: true, structured: null };
  }

  const commaPair = tryCommaPairFirstLine(text);
  if (commaPair) return commaPair;

  if (/\bI\s+will\b/i.test(text) && /\byou\b/i.test(lower)) {
    return { parties: [], uncertain: true, structured: null };
  }

  return { parties: [], uncertain: false, structured: null };
}

const FUZZY_SCOPE_PATTERNS: { re: RegExp; label: string }[] = [
  { re: /\bscope\s+of\s+work\b/i, label: "scope of work" },
  { re: /\bwill\s+be\s+performing\b/i, label: "will be performing" },
  { re: /\bwill\s+provide\b/i, label: "will provide" },
  { re: /\bresponsible\s+for\b/i, label: "responsible for" },
  { re: /\bjob\s+is\s+to\b/i, label: "job is to" },
  { re: /\bwork\s+includes\b/i, label: "work includes" },
  { re: /\bservices\s+include\b/i, label: "services include" },
];

function chunkAfterRegex(text: string, re: RegExp, maxLen = 200): string {
  const m = text.match(re);
  if (!m || m.index === undefined) return "";
  const start = m.index + m[0].length;
  let chunk = text.slice(start, start + maxLen + 80).replace(/^\s*[.,:;-]\s*/, "");
  const stop = chunk.search(/(?<=[.!?])\s|\n/);
  if (stop >= 20) chunk = chunk.slice(0, stop + 1);
  else {
    const soft = chunk.search(/\s+(?:payment|term|duration|governing|parties|for\s+the|whereas)\b/i);
    if (soft > 24) chunk = chunk.slice(0, soft).trim();
  }
  return normalizeIntakeFieldText(chunk, maxLen);
}

type FieldMeta = { text: string; confidence: number; signal: boolean; inferred: boolean };

function extractScopeAndMeta(lower: string, text: string): FieldMeta {
  let best: FieldMeta = { text: "", confidence: 0, signal: false, inferred: false };

  const labeled = text.match(/\b(?:scope|services?|work|tasks?)\s*[:\-]\s*([^\n]+)/i);
  if (labeled) {
    const t = normalizeIntakeFieldText(labeled[1], 220);
    if (t)
      return { text: t, confidence: 0.92, signal: true, inferred: t.length < 28 && !/[.!?]/.test(t) };
  }

  if (/\bmow\b/i.test(lower) || /\blawn\b/i.test(lower)) {
    return { text: "Weekly lawn care / property maintenance", confidence: 0.78, signal: true, inferred: false };
  }
  if (/\bclean\b/i.test(lower)) {
    return { text: "Cleaning services", confidence: 0.78, signal: true, inferred: false };
  }
  if (/\bconsult/i.test(lower)) {
    return { text: "Consulting / advisory services", confidence: 0.78, signal: true, inferred: false };
  }
  if (/\bdevelop|software|code\b/i.test(lower)) {
    return { text: "Software development / technical services", confidence: 0.78, signal: true, inferred: false };
  }

  const willDo = text.match(/\bwill\s+([^.!\n]{8,160})/i);
  if (willDo) {
    const t = normalizeIntakeFieldText(willDo[1], 200);
    if (t) best = { text: t, confidence: 0.74, signal: true, inferred: t.length < 36 };
  }

  const shall = text.match(/\b(?:shall|must)\s+([^.!\n]{8,120})/i);
  if (shall) {
    const t = normalizeIntakeFieldText(shall[0], 200);
    const conf = 0.7;
    if (t && conf >= best.confidence) best = { text: t, confidence: conf, signal: true, inferred: true };
  }

  for (const { re } of FUZZY_SCOPE_PATTERNS) {
    if (!re.test(text)) continue;
    const chunk = chunkAfterRegex(text, re, 220);
    if (chunk.length >= 8) {
      const conf = 0.62;
      if (conf >= best.confidence || !best.text) {
        best = { text: chunk, confidence: conf, signal: true, inferred: true };
      }
    } else if (!best.text) {
      best = {
        text: "Scope of work described in your text — refine wording in review.",
        confidence: 0.55,
        signal: true,
        inferred: true,
      };
    }
  }

  const INFER_THRESHOLD = 0.72;
  if (best.text && best.confidence < INFER_THRESHOLD && best.signal) best.inferred = true;
  return best;
}

function extractPaymentLine(text: string, payment: IntakePaymentField): string {
  if (payment.amount != null) {
    if (payment.installmentAmountUnspecified) {
      return formatPaymentTermsLine(payment);
    }
    const formatted = payment.amount.toLocaleString("en-US");
    if (!payment.cadence) return `$${formatted}`;
    return `$${formatted}, ${formatPaymentCadencePhrase(payment.cadence)}`;
  }
  const money =
    text.match(/\$\s*[\d,]+(?:\.\d{2})?\s*(?:\/\s*(?:month|week|visit|service|hr|hour))?/gi) ||
    text.match(/\$?\d[\d,]*(?:\.\d+)?k(?:\/(?:month|week|year|mo))?\b/gi) ||
    text.match(/\b\d{2,}\s*(?:usd|dollars?)\b/gi);
  if (money?.length) {
    const parts = money.slice(0, 3).map((m) => m.replace(/\s+/g, " ").trim());
    return normalizeIntakeFieldText(parts.join("; "), 180);
  }
  const rate = text.match(/\b(?:payment|compensation|fee|price)\s*(?:of|is)?\s*([^\n,.]{3,100})/i);
  if (rate) return normalizeIntakeFieldText(rate[1], 160);
  return "";
}

const DATE_LIKE =
  /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s*\d{4})?\b/i;
const DATE_NUMERIC = /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/;

/** Contract timing cues — excludes pay cadence words (monthly, weekly, …) unless duration context exists. */
const TERM_DURATION_SOFT =
  /\b(?:starting|start\s+date|duration|as\s+long\s+as|until(?!\s+terminated)|ongoing)\b/i;

/**
 * Pay-frequency wording; do not map to agreement "term" unless {@link explicitAgreementDurationContext} is true.
 */
const PAYMENT_CADENCE_IN_TERM =
  /\b(?:monthly|weekly|bi-?weekly|semi-?monthly|annually|each\s+month|per\s+month)\b/i;

/** Cadence words may describe contract length only when clearly tied to duration / term (not pay schedule). */
function explicitAgreementDurationContext(lower: string, text: string): boolean {
  if (/\bmonth-to-month\b/i.test(lower)) return true;
  if (/\b(?:annual|weekly|monthly)\s+term\b/i.test(lower)) return true;
  if (/\b(?:for|through)\s+\d+\s*(?:year|years|month|months|week|weeks|day|days)\b/i.test(lower)) return true;
  if (/\b(?:one|1)[-\s]year\s+agreement\b/i.test(lower)) return true;
  if (/\bagreement\s+lasts?\b/i.test(lower)) return true;
  if (/\bterm\s+is\b/i.test(lower)) return true;
  if (/\bterm\s+\d+/i.test(text)) return true;
  if (/\bduration\s+of\b/i.test(lower)) return true;
  return false;
}

/** Human-readable agreement length token (e.g. "12 months" not "12 month"). */
function formatTermLengthToken(nStr: string, unitRaw: string): string {
  const u = unitRaw.toLowerCase();
  const n = parseInt(nStr, 10);
  if (!Number.isFinite(n)) return `${nStr} ${u}`;
  if (u === "year" || u === "years" || u === "yr" || u === "yrs") return n === 1 ? "1 year" : `${n} years`;
  if (u === "month" || u === "months" || u === "mo") return n === 1 ? "1 month" : `${n} months`;
  if (u === "week" || u === "weeks") return n === 1 ? "1 week" : `${n} weeks`;
  if (u === "day" || u === "days") return n === 1 ? "1 day" : `${n} days`;
  return `${nStr} ${u}`;
}

function durationMatchIsTerminationNoticeContext(text: string, m: RegExpMatchArray): boolean {
  const idx = m.index ?? 0;
  const unit = (m[2] || "").toLowerCase();
  if (unit !== "day" && unit !== "days") return false;
  const tail = text.slice(idx + m[0].length, idx + m[0].length + 28).toLowerCase();
  if (/\b(?:notice|notices|written|prior|calendar)\b/.test(tail)) return true;
  const winStart = Math.max(0, idx - 95);
  const win = text.slice(winStart, idx + m[0].length + 48).toLowerCase();
  return (
    /terminat|either\s+party|party\s+may\s+terminate|with\s+notice|written\s+notice|prior\s+notice|notice\s+by|by\s+email|cancel\s+with|end\s+with|terminated\s+with/.test(win) ||
    /(?:termination|terminate).{0,120}\d+\s*days?\b/i.test(text) ||
    /\b\d+\s*days?\b.{0,80}(?:notice|terminat|either)/i.test(text)
  );
}

function extractTermAndMeta(lower: string, text: string): FieldMeta {
  const m = text.match(/\b(\d+)\s*(year|years|yr|yrs|month|months|mo|week|weeks|day|days)\b/i);
  if (m) {
    const unit = m[2].toLowerCase();
    if ((unit === "day" || unit === "days") && durationMatchIsTerminationNoticeContext(text, m)) {
      // Skip — "30 days notice" belongs under termination, not term/duration.
    } else {
      const t = formatTermLengthToken(m[1], m[2]);
      return { text: t, confidence: 0.88, signal: true, inferred: false };
    }
  }
  if (/\bperpetual|indefinite\b/i.test(lower)) {
    return { text: "Until terminated by either party", confidence: 0.86, signal: true, inferred: false };
  }
  if (/\buntil\s+(?:terminated|cancelled|canceled)\b/i.test(lower)) {
    return { text: "Until terminated as described", confidence: 0.84, signal: true, inferred: false };
  }
  if (/\b(?:one|1)\s*year\b/i.test(text)) {
    return { text: "1 year", confidence: 0.85, signal: true, inferred: false };
  }

  if (DATE_LIKE.test(text) || DATE_NUMERIC.test(text)) {
    const dm = text.match(DATE_LIKE) || text.match(DATE_NUMERIC);
    const snippet = dm ? dm[0].trim() : "Date mentioned";
    let line = normalizeIntakeFieldText(`Start / date: ${snippet}`, 120);
    if (/\bmonth-to-month\b/i.test(lower)) {
      line = normalizeIntakeFieldText(`${line}; Month-to-month (continues until terminated as agreed)`, 200);
    }
    return {
      text: line,
      confidence: /\bmonth-to-month\b/i.test(lower) ? 0.87 : 0.82,
      signal: true,
      inferred: true,
    };
  }

  if (/\bmonth-to-month\b/i.test(lower)) {
    return {
      text: "Month-to-month (continues until terminated as agreed)",
      confidence: 0.86,
      signal: true,
      inferred: false,
    };
  }

  if (TERM_DURATION_SOFT.test(lower)) {
    const soft = text.match(TERM_DURATION_SOFT);
    const frag = soft ? soft[0].replace(/\s+/g, " ").trim() : "timing";
    return {
      text: normalizeIntakeFieldText(`Timing noted (${frag}) — refine in review.`, 140),
      confidence: 0.58,
      signal: true,
      inferred: true,
    };
  }

  if (PAYMENT_CADENCE_IN_TERM.test(lower) && explicitAgreementDurationContext(lower, text)) {
    const soft = text.match(PAYMENT_CADENCE_IN_TERM);
    const frag = soft ? soft[0].replace(/\s+/g, " ").trim() : "cadence";
    return {
      text: normalizeIntakeFieldText(`Timing noted (${frag}) — refine in review.`, 140),
      confidence: 0.56,
      signal: true,
      inferred: true,
    };
  }

  return { text: "", confidence: 0, signal: false, inferred: false };
}

function extractGoverningLaw(lower: string, text: string): string {
  const gl = text.match(
    /\b(?:govern(?:ed|ing)\s+by|laws?\s+of|jurisdiction|venue\s+in)\s*[:\s]+([^\n.]{2,120})/i,
  );
  if (gl) return normalizeIntakeFieldText(gl[1], 140);
  const state = text.match(/\b(?:State\s+of|Commonwealth\s+of)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/);
  if (state) return normalizeIntakeFieldText(`State of ${state[1]}`, 120);
  if (/\bdelaware\b/i.test(lower) && /\b(?:law|DE|corp)\b/i.test(lower)) return "Delaware";
  if (/\bnew\s+york\b/i.test(lower) && /\b(?:law|NYS)\b/i.test(lower)) return "New York";
  return "";
}

function extractConfidentiality(lower: string, text: string): string {
  if (/\bnda|non-disclosure|confidential(?:ity)?\b/.test(lower)) {
    return "Mutual confidentiality — standard of care for shared information.";
  }
  const m = text.match(/\bconfidential(?:ity)?\s*[:\-]\s*([^\n]{6,200})/i);
  if (m) return normalizeIntakeFieldText(m[1], 200);
  return "";
}

function extractTermination(lower: string, text: string): string {
  const m = text.match(/\btermination\s*[:\-]\s*([^\n]{6,200})/i);
  if (m) return normalizeIntakeFieldText(m[1], 220);
  if (/\bat-will\b/i.test(lower)) return "At-will termination as permitted by law.";

  const noticePhrase =
    /termination\s+by\s+either\s+party|either\s+party\s+may\s+terminate|either\s+party\s+may\s+end|may\s+terminate\s+with|terminate\s+(?:this\s+)?(?:agreement\s+)?with|terminated\s+with\s+notice|terminate\s+with\s+notice|end\s+with\s+notice|cancel\s+with\s+notice/i.test(
      lower,
    );
  const noticeNumeric =
    /(?:terminat|terminate).{0,140}\b\d+\s*days?\b/i.test(text) ||
    /\b\d+\s*days?\b.{0,90}(?:notice|terminat|either)/i.test(text);

  if (noticePhrase || (noticeNumeric && /notice|terminat|either\s+party/i.test(lower))) {
    const parts: string[] = [];
    if (/either\s+party|by\s+either\s+party|both\s+parties\s+may/i.test(lower)) {
      parts.push("Either party may terminate this agreement.");
    } else {
      parts.push("The agreement may be terminated with notice as described in the intake.");
    }
    const daysM =
      text.match(/\b(\d+)\s*days?\s*(?:'|’)?s?\s*(?:of\s+)?(?:prior\s+)?(?:written\s+)?notice\b/i) ||
      text.match(/\b(\d+)\s*days?\s+notice\b/i);
    if (daysM) {
      const n = daysM[1];
      parts.push(`Prior written notice of at least ${n} calendar day${n === "1" ? "" : "s"} is required.`);
    } else if (/\b(?:thirty|30)\s*days?\b/i.test(text) && /notice/i.test(lower)) {
      parts.push("Prior written notice of at least thirty (30) calendar days is required.");
    }
    if (/by\s+email|email\s+(?:for\s+)?notice|notice\s+(?:by|via)\s+email|with\s+.{0,40}email/i.test(lower)) {
      parts.push("Termination and other notices may be delivered by email where permitted herein.");
    }
    // Use semicolons so normalizeIntakeFieldText does not cut everything after the first ". " (see firstStop rule).
    return normalizeIntakeFieldText(parts.join("; "), 280);
  }

  if (/\b30\s*day|thirty\s*day/i.test(text) && /notice|terminat/i.test(lower)) {
    return normalizeIntakeFieldText("Prior written notice of at least thirty (30) calendar days to terminate.", 220);
  }
  return "";
}

function unclearPaymentSchedule(lower: string): boolean {
  if (/\bpayment\s+schedule\s+(?:is\s+)?(?:not\s+set|tbd|tba|unknown|unclear|undetermined)\b/i.test(lower))
    return true;
  if (/\b(?:not|un)(?:clear|defined)\s+(?:payment\s+)?schedule\b/i.test(lower)) return true;
  if (/\bschedule\s+(?:for\s+)?(?:payments?|pay)\s+(?:is\s+)?(?:tbd|not\s+set)\b/i.test(lower)) return true;
  return false;
}

export function extractScheduleLine(lower: string, text: string): string | null {
  const day =
    text.match(
      /\b(?:every|each|on)\s+(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)s?\b/i,
    ) || text.match(/\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)s?\b/i);
  if (day) {
    const d = day[1] || day[0];
    if (/\bevery\b/i.test(text)) return `Paid weekly (every ${d})`;
    return `Paid weekly · ${d}`;
  }
  if (/\bweekly\b/i.test(lower)) return "Paid weekly";
  if (/\bmonthly\b/i.test(lower)) return "Paid monthly";
  const byDate = text.match(/\bby\s+([A-Z][a-z]+\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s*\d{4})?)\b/);
  if (byDate) return `Deadline / date: ${byDate[1]}`;
  if (unclearPaymentSchedule(lower)) return "Payment schedule not set";
  return null;
}

/**
 * Parse raw intake into disjoint fields. Uncertain party signal → empty `parties` and `partiesUncertain` true
 * (never stuff a paragraph into `parties`).
 */
export function parseIntakeToStructuredAgreement(raw: string): IntakeStructuredAgreement {
  const text = raw.trim();
  if (!text) {
    return {
      parties: [],
      scope: "",
      payment: "",
      term: "",
      governing_law: "",
      confidentiality: "",
      termination: "",
      partiesUncertain: false,
      scopeConfidence: 0,
      termConfidence: 0,
      scopeInferred: false,
      termInferred: false,
      scopeSignalPresent: false,
      termSignalPresent: false,
    };
  }
  const lower = text.toLowerCase();
  const paymentField = extractIntakePayment(text);
  const partyEx = extractStructuredParties(text, lower);
  const scopeMeta = extractScopeAndMeta(lower, text);
  const termMeta = extractTermAndMeta(lower, text);
  let scope = scopeMeta.text;
  const payment = extractPaymentLine(text, paymentField);
  let term = termMeta.text;
  const governing_law = extractGoverningLaw(lower, text);
  const confidentiality = extractConfidentiality(lower, text);
  const termination = extractTermination(lower, text);
  if (termination.trim() && /^\d+\s*days?$/i.test(term.trim())) {
    term = "";
  }

  // Location / governing tails should not become "scope" if we already captured governing law
  if (governing_law && scope.toLowerCase().includes(governing_law.toLowerCase())) {
    scope = scope.replace(new RegExp(governing_law.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "").trim();
  }

  const scopeNorm = normalizeIntakeFieldText(scope);
  const termNorm = normalizeIntakeFieldText(term, 120);
  const scopeSignalPresent = Boolean(scopeMeta.signal || scopeNorm.length > 6);
  const termSignalPresent = Boolean(termMeta.signal || termNorm.length > 2);

  return {
    parties: partyEx.parties,
    scope: scopeNorm,
    payment: normalizeIntakeFieldText(payment),
    term: termNorm,
    governing_law: normalizeIntakeFieldText(governing_law, 120),
    confidentiality: normalizeIntakeFieldText(confidentiality, 220),
    termination: normalizeIntakeFieldText(termination, 220),
    partiesUncertain: partyEx.uncertain,
    scopeConfidence: scopeMeta.confidence,
    termConfidence: termMeta.confidence,
    scopeInferred: Boolean(scopeMeta.inferred || (scopeMeta.confidence > 0 && scopeMeta.confidence < 0.72 && scopeSignalPresent)),
    termInferred: Boolean(termMeta.inferred || (termMeta.confidence > 0 && termMeta.confidence < 0.75 && termSignalPresent)),
    scopeSignalPresent,
    termSignalPresent,
  };
}

export function structuredPartiesDisplayLine(structured: IntakeStructuredAgreement): string | null {
  if (structured.partiesUncertain || structured.parties.length < 2) return null;
  const [a, b] = structured.parties;
  if (!a?.trim() || !b?.trim()) return null;
  return `${a} and ${b}`;
}

export function structuredPartiesStructured(structured: IntakeStructuredAgreement): StructuredTwoParties | null {
  if (structured.partiesUncertain || structured.parties.length < 2) return null;
  const [a, b] = structured.parties;
  if (!a?.trim() || !b?.trim()) return null;
  return { party_1: a, party_2: b };
}


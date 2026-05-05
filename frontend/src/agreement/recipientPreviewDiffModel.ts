/**
 * Recipient preview diff integrity: plain-text material change detection and
 * summary strings derived from the same diff + snapshot compare (no second AI pass).
 */

import { htmlToPlainText } from "./externalAiHandoff";
import { buildAgreementRedline, type RedlineResult } from "../vs01/agreementRedline";
import {
  agreementFieldLabel,
  compareAgreementSnapshots,
  type AgreementCompareResult,
  type AgreementFieldChange,
} from "../vs01/agreementCompare";
import type { AgreementDraft } from "./agreementTypes";
import { draftToSnapshot } from "./agreementVersionStore";

/** Minimum insert+delete characters (after trim) to treat as a material text change. */
export const RECIPIENT_PREVIEW_MIN_DIFF_CHARS = 1;

export function normalizeRecipientPreviewPlain(html: string): string {
  return htmlToPlainText(html || "")
    .replace(/\r/g, "\n")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildRecipientPreviewRedline(baselineHtml: string, proposedHtml: string): RedlineResult {
  return buildAgreementRedline(htmlToPlainText(baselineHtml || ""), htmlToPlainText(proposedHtml || ""));
}

export function countRedlineChangeChars(redline: RedlineResult): number {
  let n = 0;
  for (const s of redline.segments) {
    if (s.type === "same") continue;
    n += s.text.replace(/\s+/g, " ").trim().length;
  }
  return n;
}

/** Above this, full-document redline is hidden behind “Full document redline” by default. */
export const RECIPIENT_FULL_REDLINE_MAX_SEGMENTS = 72;

/** Total insert+delete characters above this → treat as noisy for default UX. */
export const RECIPIENT_FULL_REDLINE_MAX_CHANGE_CHARS = 6000;

/** Any single insert/delete segment longer than this → noisy (often whole-document replace). */
export const RECIPIENT_FULL_REDLINE_MAX_BLOCK_CHARS = 2500;

export function isRecipientRedlineNoisyRaw(redline: RedlineResult, changeCharCount: number): boolean {
  const nonSame = redline.segments.filter((s) => s.type !== "same");
  if (redline.segments.length > RECIPIENT_FULL_REDLINE_MAX_SEGMENTS) return true;
  if (changeCharCount > RECIPIENT_FULL_REDLINE_MAX_CHANGE_CHARS) return true;
  for (const s of nonSame) {
    if (s.text.length > RECIPIENT_FULL_REDLINE_MAX_BLOCK_CHARS) return true;
  }
  return false;
}

export function isRecipientRedlineConsideredNoisy(assessment: RecipientPreviewDiffAssessment): boolean {
  return isRecipientRedlineNoisyRaw(assessment.redline, assessment.changeCharCount);
}

const CLAUSE_FIELD_ORDER = [
  "title",
  "parties",
  "jurisdiction",
  "payment_terms",
  "purpose",
  "duration",
  "due_date",
  "effective_date",
] as const;

function sortChangedFields(rows: AgreementFieldChange[]): AgreementFieldChange[] {
  const rank = (f: string) => {
    const i = CLAUSE_FIELD_ORDER.indexOf(f as (typeof CLAUSE_FIELD_ORDER)[number]);
    return i === -1 ? 99 : i;
  };
  return [...rows].filter((r) => r.changed).sort((a, b) => rank(a.field) - rank(b.field));
}

function clauseChangeReason(row: AgreementFieldChange): string {
  const b = (row.before || "").trim().toLowerCase();
  const a = (row.after || "").trim().toLowerCase();
  switch (row.field) {
    case "payment_terms": {
      const pauseAfter = extractPauseWorkBullet(row.after || "");
      const pauseBefore = extractPauseWorkBullet(row.before || "");
      const pauseAdded = Boolean(pauseAfter && !pauseBefore);
      const netChanged = /\bnet\s*\d+/.test(a) && !/\bnet\s*\d+/.test(b);
      if (pauseAdded && netChanged) return "Net / payment timing and pause-work for late payment updated.";
      if (pauseAdded) return "Pause-work or suspension right added for late payment.";
      if (netChanged) return "Net / payment timing updated.";
      return "Payment terms updated.";
    }
    case "purpose":
      if (a.includes("pause") && !b.includes("pause")) return "Pause-work or suspension right added for late payment.";
      if (a.includes("confidential") && !b.includes("confidential")) return "Confidentiality / NDA-style language added.";
      if (a.length > b.length + 40) return "Additional obligations or clarifications added to the purpose / scope.";
      return "Purpose / scope text updated.";
    case "jurisdiction":
      return "Governing law updated.";
    case "duration":
      return "Term / duration updated.";
    case "due_date":
    case "effective_date":
      return "Key dates updated.";
    case "title":
      return "Agreement title updated.";
    case "parties":
      return "Party names or roles updated.";
    default:
      return "This part of the agreement was revised.";
  }
}

/** Max “What changed” bullets on a clause card. */
export const MAX_WHAT_CHANGED_BULLETS = 3;

function normalizeClauseOneLine(s: string): string {
  return (s || "")
    .replace(/\r/g, "\n")
    .replace(/\s+/g, " ")
    .trim();
}

function trimCap(s: string, max: number): string {
  const u = s.trim();
  if (u.length <= max) return u;
  const cut = u.slice(0, max - 1).replace(/\s+\S*$/, "");
  return `${cut}…`;
}

function firstSentenceOrText(t: string, maxLen: number): string {
  if (!t) return "—";
  const m = t.match(/^[^.!?]+[.!?]?/);
  const unit = (m?.[0] || t).trim();
  return trimCap(unit, maxLen);
}

/**
 * Short “current payment terms” line for cards (prefers receipt/due phrasing, then Net timing).
 */
export function extractPaymentTermsCurrentSnippet(before: string): string {
  const t = normalizeClauseOneLine(before);
  if (!t) return "—";
  const chunks = t
    .split(/\.\s+/)
    .map((p) => p.trim())
    .filter(Boolean);
  for (const chunk of chunks) {
    const seg = chunk.endsWith(".") ? chunk : `${chunk}.`;
    if (/\b(due\s+(?:on|upon)\s+receipt|upon\s+receipt)\b/i.test(seg)) {
      return trimCap(seg, 180);
    }
  }
  for (const chunk of chunks) {
    const seg = chunk.endsWith(".") ? chunk : `${chunk}.`;
    if (/\bnet\s*\d+\b/i.test(seg)) return trimCap(seg, 180);
  }
  return trimCap(chunks[0] || t, 180);
}

/**
 * Short suggested payment lines (Net timing + pause-work), for compact cards — not the full field paragraph.
 */
export function buildPaymentTermsSuggestedSnippetLines(
  afterRaw: string,
  beforeRaw: string,
  proposedRenderedPlain?: string,
): string[] {
  const after = normalizeClauseOneLine(afterRaw);
  const before = normalizeClauseOneLine(beforeRaw);
  const lines: string[] = [];
  const netA = after.match(/\bnet\s*(\d+)\b/i);
  const netB = before.match(/\bnet\s*(\d+)\b/i);
  if (netA && (!netB || netA[1] !== netB[1])) {
    lines.push(`Invoices are due Net ${netA[1]}.`);
  }
  const pauseA =
    extractPauseWorkBullet(afterRaw) ||
    (proposedRenderedPlain ? extractPauseWorkBullet(proposedRenderedPlain) : null);
  const pauseB = extractPauseWorkBullet(beforeRaw);
  if (pauseA && !pauseB) {
    lines.push(pauseA.endsWith(".") ? pauseA : `${pauseA}.`);
  }
  if (lines.length === 0 && after) {
    lines.push(firstSentenceOrText(after, 160));
  }
  return lines;
}

function buildClauseSnippetsForRow(row: AgreementFieldChange, ctx?: RecipientClauseContext): {
  currentSnippet: string;
  suggestedSnippetLines: string[];
} {
  if (row.field === "payment_terms") {
    return {
      currentSnippet: extractPaymentTermsCurrentSnippet(row.before || ""),
      suggestedSnippetLines: buildPaymentTermsSuggestedSnippetLines(
        row.after || "",
        row.before || "",
        ctx?.proposedRenderedPlain,
      ),
    };
  }
  const b = normalizeClauseOneLine(row.before || "");
  const a = normalizeClauseOneLine(row.after || "");
  return {
    currentSnippet: b ? firstSentenceOrText(b, 160) : "—",
    suggestedSnippetLines: a ? [firstSentenceOrText(a, 160)] : ["—"],
  };
}

/** Collapse long “same” runs so the tracked row shows mostly inserts/deletes. */
/** Keep clause-card tracked row readable — long single-segment inserts are capped. */
export const CLAUSE_TRACKED_SEGMENT_CHAR_CAP = 100;

export function capRedlineChangeSegmentsForClauseUi(
  redline: RedlineResult,
  maxLen = CLAUSE_TRACKED_SEGMENT_CHAR_CAP,
): RedlineResult {
  return {
    hasChanges: redline.hasChanges,
    segments: redline.segments.map((s) => {
      if (s.type === "same") return s;
      const t = s.text.replace(/\s+/g, " ").trim();
      if (t.length <= maxLen) return s;
      const cut = t.slice(0, maxLen - 1).replace(/\s+\S*$/, "");
      return { type: s.type, text: `${cut}…` } as (typeof redline.segments)[number];
    }),
  };
}

export function buildClauseCardDisplayRedline(redline: RedlineResult): RedlineResult {
  if (!redline.hasChanges) return redline;
  const out: RedlineResult["segments"] = [];
  let skippedSame = false;
  for (const s of redline.segments) {
    if (s.type === "same") {
      if (s.text.replace(/\s+/g, " ").trim().length > 0) skippedSame = true;
      continue;
    }
    if (skippedSame && out.length > 0) {
      out.push({ type: "same", text: " … " });
    }
    skippedSame = false;
    out.push(s);
  }
  if (out.length === 0) return redline;
  return {
    hasChanges: out.some((s) => s.type === "insert" || s.type === "delete"),
    segments: out,
  };
}

export function redlineHasSignificantRemovals(redline: RedlineResult): boolean {
  return redline.segments.some((s) => s.type === "delete" && s.text.replace(/\s+/g, " ").trim().length >= 2);
}

export function insertTextsForAddedPills(redline: RedlineResult, maxPills = 6, capChars = 100): string[] {
  const out: string[] = [];
  for (const s of redline.segments) {
    if (s.type !== "insert") continue;
    const t = s.text.replace(/\s+/g, " ").trim();
    if (t.length < 2) continue;
    out.push(trimCap(t, capChars));
    if (out.length >= maxPills) break;
  }
  return out;
}

function extractNetTimingLine(after: string, before: string): string | null {
  const ma = (after || "").match(/\bnet\s*(\d+)\b/i);
  const mb = (before || "").match(/\bnet\s*(\d+)\b/i);
  if (ma && (!mb || ma[1] !== mb[1])) return `Payment timing changed to Net ${ma[1]}`;
  return null;
}

function extractPauseWorkBullet(text: string): string | null {
  const t = text || "";
  const hasPauseWork =
    /\bpause\s+work\b|\bmay\s+pause\b|\bpause\s+work\s+after\b|\bpause\s+work\s+if\b|\bsuspend\s+work\b|\bsuspend\b.*\bwork\b|\bpause\b.*\bwork\b.*\blate\b/i.test(
      t,
    );
  if (!hasPauseWork) return null;
  const dm = t.match(
    /more\s+than\s+(\d+)\s*days?\s+late|(\d+)\s*days?\s*(?:past\s*due|late)|after\s+(\d+)\s*days?\s*late/i,
  );
  const days = dm ? (dm[1] || dm[2] || dm[3]) : "15";
  return `Developer may pause work if payment is more than ${days} days late`;
}

/** Reviewer instruction mentions pause / suspend work for late payment. */
export function instructionRequestsPauseWork(instr: string): boolean {
  const t = (instr || "").toLowerCase();
  return /\bpause\s*[- ]?\s*work\b|\bsuspend\s*[- ]?\s*work\b|\bpause\b.*\b(late|days)\b|\bwork\b.*\b(after|more\s+than)\b.*\bdays?\b.*\blate\b/i.test(
    t,
  );
}

/** Short phrase from reviewer instruction for “requested but not reflected” messaging. */
export function extractPauseRequestPhrase(instr: string): string | null {
  const t = (instr || "").trim();
  if (!t) return null;
  const m =
    t.match(/pause\s+work\s+after[^.!?]{0,100}/i) ||
    t.match(/pause\s+work[^.!?]{0,140}/i) ||
    t.match(/suspend\s+work[^.!?]{0,100}/i);
  return m ? m[0].trim().replace(/\s+/g, " ") : null;
}

function pauseWorkInProposed(afterField: string, proposedRenderedPlain?: string): boolean {
  return !!(
    extractPauseWorkBullet(afterField) ||
    (proposedRenderedPlain && extractPauseWorkBullet(proposedRenderedPlain))
  );
}

function pauseWorkInBaseline(beforeField: string, baselineRenderedPlain?: string): boolean {
  return !!(
    extractPauseWorkBullet(beforeField) ||
    (baselineRenderedPlain && extractPauseWorkBullet(baselineRenderedPlain))
  );
}

/** Snapshot + instruction context for clause bullets, counts, and capture warnings. */
export type RecipientClauseContext = {
  recipientInstructionPlain?: string;
  proposedRenderedPlain: string;
  baselineRenderedPlain: string;
};

/** Deterministic bullets for the “What changed” area on a clause card. */
export function deriveClauseWhatChangedBullets(
  row: AgreementFieldChange,
  ctx?: RecipientClauseContext,
): string[] {
  const bullets: string[] = [];
  const b = (row.before || "").trim();
  const a = (row.after || "").trim();
  const blo = b.toLowerCase();
  const proposedPlain = ctx?.proposedRenderedPlain || "";
  const baselinePlain = ctx?.baselineRenderedPlain || "";
  const instr = ctx?.recipientInstructionPlain || "";

  if (row.field === "payment_terms") {
    const netLine = extractNetTimingLine(a, b);
    if (netLine) bullets.push(netLine);
    const pauseLine = extractPauseWorkBullet(a) || extractPauseWorkBullet(proposedPlain);
    const hadPause = pauseWorkInBaseline(b, baselinePlain);
    if (pauseLine && !hadPause) {
      bullets.push(pauseLine.endsWith(".") ? pauseLine : `${pauseLine}.`);
    }
    if (instructionRequestsPauseWork(instr) && !pauseWorkInProposed(a, proposedPlain)) {
      const phrase = extractPauseRequestPhrase(instr);
      bullets.push(
        `Requested but not reflected: ${phrase || "pause work for late payment"}.`,
      );
    }
    if (bullets.length === 0) bullets.push("Payment terms updated.");
  } else if (row.field === "purpose") {
    const pauseB = extractPauseWorkBullet(a);
    if (pauseB && !/\bpause\b.*\bwork\b|\bmay\s+pause\b/i.test(b)) bullets.push(pauseB);
    if (a.includes("confidential") && !blo.includes("confidential")) {
      bullets.push("Confidentiality / NDA-style language added.");
    }
    if (bullets.length === 0 && a.length > b.length + 20) {
      bullets.push("Purpose / scope text updated.");
    } else if (bullets.length === 0) {
      bullets.push("Purpose / scope text updated.");
    }
  } else if (row.field === "jurisdiction" && a !== b) {
    bullets.push("Governing law updated.");
  } else if (row.field === "duration" && a !== b) {
    bullets.push("Term / duration updated.");
  } else if ((row.field === "due_date" || row.field === "effective_date") && a !== b) {
    bullets.push("Important dates updated.");
  } else if (row.field === "title" && a !== b) {
    bullets.push("Agreement title updated.");
  } else if (row.field === "parties" && a !== b) {
    bullets.push("Parties updated.");
  } else if (a !== b) {
    bullets.push(`${agreementFieldLabel(row.field)} updated.`);
  }
  return bullets.slice(0, MAX_WHAT_CHANGED_BULLETS);
}

export function buildFieldLevelRedline(before: string, after: string): RedlineResult | null {
  const cur = (before || "").trim();
  const prop = (after || "").trim();
  if (!cur && !prop) return null;
  const rl = buildAgreementRedline(cur, prop);
  return rl.hasChanges ? rl : null;
}

const CLAUSE_INLINE_DIFF_MAX_CHARS = 8000;

function capFieldTextForDiff(s: string): string {
  const t = (s || "").trim();
  if (t.length <= CLAUSE_INLINE_DIFF_MAX_CHARS) return t;
  return `${t.slice(0, CLAUSE_INLINE_DIFF_MAX_CHARS)}…`;
}

export function buildFieldLevelRedlineCapped(before: string, after: string): RedlineResult | null {
  return buildFieldLevelRedline(capFieldTextForDiff(before || ""), capFieldTextForDiff(after || ""));
}

function friendlyFieldSummaryLine(field: string, row: AgreementFieldChange): string {
  const reason = clauseChangeReason(row);
  if (field === "payment_terms") {
    const net = extractNetTimingLine((row.after || "").trim(), (row.before || "").trim());
    return net || "Payment terms updated";
  }
  if (field === "purpose" && reason.includes("Pause")) return "Pause-work right added for late payment";
  if (field === "purpose" && reason.includes("Confidential")) return "Confidentiality language added";
  if (field === "purpose") return "Purpose / scope updated";
  if (field === "jurisdiction") return "Governing law updated";
  if (field === "duration") return "Duration updated";
  if (field === "due_date" || field === "effective_date") return "Important dates updated";
  if (field === "title") return "Title updated";
  if (field === "parties") return "Parties updated";
  return `${agreementFieldLabel(field)} updated`;
}

/** Material summary lines for the preview header (one row can yield two lines, e.g. Net 30 + pause in payment_terms). */
function materialSummaryLinesForRow(row: AgreementFieldChange, ctx?: RecipientClauseContext): string[] {
  if (row.field === "payment_terms") {
    const out: string[] = [];
    const a = (row.after || "").trim();
    const b = (row.before || "").trim();
    const proposedPlain = ctx?.proposedRenderedPlain || "";
    const baselinePlain = ctx?.baselineRenderedPlain || "";
    const net = extractNetTimingLine(a, b);
    if (net) out.push(net);
    const pauseLine = extractPauseWorkBullet(a) || extractPauseWorkBullet(proposedPlain);
    const hadPause = pauseWorkInBaseline(b, baselinePlain);
    if (pauseLine && !hadPause) {
      out.push("Pause-work right added for late payment.");
    }
    if (out.length === 0) out.push("Payment terms updated");
    return out;
  }
  return [friendlyFieldSummaryLine(row.field, row)];
}

const GENERIC_CLAUSE_BULLETS = new Set([
  "Payment terms updated.",
  "Purpose / scope text updated.",
]);

const INSTRUCTION_GAP_BULLET_PREFIX = "Requested but not reflected:";

function isCountableClauseBullet(b: string): boolean {
  if (GENERIC_CLAUSE_BULLETS.has(b)) return false;
  if (b.startsWith(INSTRUCTION_GAP_BULLET_PREFIX)) return false;
  return true;
}

function countChangeUnitsForRow(row: AgreementFieldChange, ctx?: RecipientClauseContext): number {
  if (!row.changed) return 0;
  const bullets = deriveClauseWhatChangedBullets(row, ctx);
  const meaningful = bullets.filter(isCountableClauseBullet);
  return meaningful.length > 0 ? meaningful.length : 1;
}

export type RecipientClauseTrackMode = "lines" | "pair" | "inline";

export type RecipientClauseCard = {
  id: string;
  /** Short heading, e.g. “Payment terms”. */
  cardTitle: string;
  /** @deprecated Same as {@link cardTitle}; kept for tests. */
  sectionLabel: string;
  /** Word-style “what changed” bullets for this field. */
  whatChangedBullets: string[];
  /** Inline diff for this field only (never full-document HTML). */
  fieldRedline: RedlineResult | null;
  /** Full field text (disclosure only). */
  currentText: string;
  /** Full field text (disclosure only). */
  proposedText: string;
  /** Compact current value for the card body. */
  currentSnippet: string;
  /** Compact suggested value lines for the card body. */
  suggestedSnippetLines: string[];
  /** Primary track-changes presentation for this card. */
  trackMode: RecipientClauseTrackMode;
  /** “Added: …” rows (compact, no full field). */
  trackAddedDisplayLines: string[];
  /** Red/green snippet pair when there is a meaningful deletion + insertion. */
  trackSnippetPair: { removed: string; added: string } | null;
  reason: string;
};

/** When max(current, proposed) exceeds this, primary UI uses inline redline + disclosure for full text. */
export const CLAUSE_CARD_DISCLOSURE_CHAR_THRESHOLD = 220;

const EMPTY_CLAUSE_CONTEXT: RecipientClauseContext = {
  proposedRenderedPlain: "",
  baselineRenderedPlain: "",
};

function buildTrackUiForRow(
  row: AgreementFieldChange,
  ctx: RecipientClauseContext,
  rl: RedlineResult | null,
): Pick<RecipientClauseCard, "trackMode" | "trackAddedDisplayLines" | "trackSnippetPair"> {
  const trackAddedDisplayLines: string[] = [];
  let trackSnippetPair: { removed: string; added: string } | null = null;
  let trackMode: RecipientClauseTrackMode = "inline";

  if (row.field === "payment_terms") {
    const a = (row.after || "").trim();
    const b = (row.before || "").trim();
    const netA = a.match(/\bnet\s*(\d+)\b/i);
    const netB = b.match(/\bnet\s*(\d+)\b/i);
    if (netA && (!netB || netA[1] !== netB[1])) {
      trackAddedDisplayLines.push(`Added: Invoices are due Net ${netA[1]}.`);
    }
    const pauseLine = extractPauseWorkBullet(a) || extractPauseWorkBullet(ctx.proposedRenderedPlain);
    const hadPause = pauseWorkInBaseline(b, ctx.baselineRenderedPlain);
    if (pauseLine && !hadPause) {
      const p = pauseLine.endsWith(".") ? pauseLine.slice(0, -1) : pauseLine;
      trackAddedDisplayLines.push(`Added: ${p}.`);
    }
    if (trackAddedDisplayLines.length > 0) {
      return { trackMode: "lines", trackAddedDisplayLines, trackSnippetPair: null };
    }
  }

  if (rl && redlineHasSignificantRemovals(rl)) {
    const del = rl.segments.find((s) => s.type === "delete" && s.text.replace(/\s+/g, " ").trim().length >= 2);
    const ins = rl.segments.find((s) => s.type === "insert" && s.text.replace(/\s+/g, " ").trim().length >= 2);
    if (del && ins) {
      trackSnippetPair = {
        removed: trimCap(del.text.replace(/\s+/g, " ").trim(), 120),
        added: trimCap(ins.text.replace(/\s+/g, " ").trim(), 120),
      };
      return { trackMode: "pair", trackAddedDisplayLines: [], trackSnippetPair };
    }
  }

  if (rl?.hasChanges) {
    for (const t of insertTextsForAddedPills(rl, 4, 120)) {
      trackAddedDisplayLines.push(`Added: ${t}`);
    }
    if (trackAddedDisplayLines.length > 0) {
      return { trackMode: "lines", trackAddedDisplayLines, trackSnippetPair: null };
    }
  }

  return { trackMode, trackAddedDisplayLines, trackSnippetPair };
}

export function buildRecipientClauseCards(
  snapshotCompare: AgreementCompareResult,
  hasMaterialTextDiff: boolean,
  context?: RecipientClauseContext,
): RecipientClauseCard[] {
  const ctx: RecipientClauseContext = context ?? EMPTY_CLAUSE_CONTEXT;
  const rows = sortChangedFields(snapshotCompare.changedFields);
  const cards: RecipientClauseCard[] = rows.map((row) => {
    const currentText = row.before?.trim() ? row.before : "—";
    const proposedText = row.after?.trim() ? row.after : "—";
    const title = agreementFieldLabel(row.field);
    const { currentSnippet, suggestedSnippetLines } = buildClauseSnippetsForRow(row, ctx);
    const fieldRedline = buildFieldLevelRedlineCapped(row.before || "", row.after || "");
    const track = buildTrackUiForRow(row, ctx, fieldRedline);
    return {
      id: row.field,
      cardTitle: title,
      sectionLabel: title,
      whatChangedBullets: deriveClauseWhatChangedBullets(row, ctx),
      fieldRedline,
      currentText,
      proposedText,
      currentSnippet,
      suggestedSnippetLines,
      trackMode: track.trackMode,
      trackAddedDisplayLines: track.trackAddedDisplayLines,
      trackSnippetPair: track.trackSnippetPair,
      reason: clauseChangeReason(row),
    };
  });
  if (cards.length === 0 && hasMaterialTextDiff) {
    cards.push({
      id: "rendered_text",
      cardTitle: "Document wording",
      sectionLabel: "Document wording",
      whatChangedBullets: ["Rendered document text differs from the current version."],
      fieldRedline: null,
      currentText: "See Side-by-side or Full document redline for the exact rendered text.",
      proposedText: "—",
      currentSnippet: "See disclosure or Side-by-side for full rendered text.",
      suggestedSnippetLines: ["—"],
      trackMode: "inline",
      trackAddedDisplayLines: [],
      trackSnippetPair: null,
      reason: "Structured fields match, but the formatted document text differs.",
    });
  }
  return cards;
}

export function countSuggestedChanges(assessment: RecipientPreviewDiffAssessment): number {
  const ctx = assessment.clauseContext;
  const rows = sortChangedFields(assessment.snapshotCompare.changedFields).filter((r) => r.changed);
  let n = rows.reduce((acc, r) => acc + countChangeUnitsForRow(r, ctx), 0);
  if (n === 0 && assessment.hasMaterialTextDiff) n = 1;
  return n;
}

/** Short, confidence-building summary lines (no huge character counts). */
export function getRecipientPreviewSummaryBullets(assessment: RecipientPreviewDiffAssessment): string[] {
  const n = countSuggestedChanges(assessment);
  const lines: string[] = [];
  lines.push(`${n} suggested change${n === 1 ? "" : "s"}`);
  const rows = sortChangedFields(assessment.snapshotCompare.changedFields);
  const ctx = assessment.clauseContext;
  for (const row of rows) {
    for (const line of materialSummaryLinesForRow(row, ctx)) {
      lines.push(line);
    }
  }
  if (rows.length === 0 && assessment.hasMaterialTextDiff) {
    lines.push("Rendered document wording updated");
  }
  if (assessment.instructionCaptureWarning) {
    lines.push("Some requested edits may not be reflected. Review before sending.");
  }
  lines.push("Nothing changes unless the owner accepts.");
  return lines;
}

export type AssessRecipientPreviewDiffOptions = {
  /** Plain reviewer instruction (no posture preamble) — used for capture checks vs proposed output. */
  recipientInstructionPlain?: string;
};

export type RecipientPreviewDiffAssessment = {
  redline: RedlineResult;
  snapshotCompare: AgreementCompareResult;
  hasMaterialTextDiff: boolean;
  hasSnapshotDiff: boolean;
  /** True when either rendered text or structured draft differs materially. */
  hasAnyMaterialChange: boolean;
  /** True only when both plain rendered text and snapshot fields are unchanged — then show “No changes detected”. */
  isCompleteNoOp: boolean;
  changeCharCount: number;
  canSubmit: boolean;
  clauseContext: RecipientClauseContext;
  /** Instruction asked for pause-work but proposed draft + rendered text do not contain it. */
  instructionCaptureWarning: boolean;
};

export function assessRecipientPreviewDiff(
  baselineDraft: AgreementDraft,
  proposedDraft: AgreementDraft,
  baselineHtml: string,
  proposedHtml: string,
  options?: AssessRecipientPreviewDiffOptions,
): RecipientPreviewDiffAssessment {
  const redline = buildRecipientPreviewRedline(baselineHtml, proposedHtml);
  const snapshotCompare = compareAgreementSnapshots(
    draftToSnapshot(baselineDraft),
    draftToSnapshot(proposedDraft),
  );
  const hasMaterialTextDiff =
    redline.hasChanges && countRedlineChangeChars(redline) >= RECIPIENT_PREVIEW_MIN_DIFF_CHARS;
  const hasSnapshotDiff = snapshotCompare.hasChanges;
  const hasAnyMaterialChange = hasMaterialTextDiff || hasSnapshotDiff;
  const isCompleteNoOp = !hasAnyMaterialChange;
  const canSubmit = hasAnyMaterialChange;
  const baselineRenderedPlain = normalizeRecipientPreviewPlain(baselineHtml);
  const proposedRenderedPlain = normalizeRecipientPreviewPlain(proposedHtml);
  const recipientInstructionPlain = (options?.recipientInstructionPlain ?? "").trim();
  const wantedPause = instructionRequestsPauseWork(recipientInstructionPlain);
  const hasPauseInProposed =
    !!extractPauseWorkBullet(proposedDraft.payment_terms || "") ||
    !!extractPauseWorkBullet(proposedRenderedPlain);
  const instructionCaptureWarning = wantedPause && !hasPauseInProposed;
  return {
    redline,
    snapshotCompare,
    hasMaterialTextDiff,
    hasSnapshotDiff,
    hasAnyMaterialChange,
    isCompleteNoOp,
    changeCharCount: countRedlineChangeChars(redline),
    canSubmit,
    clauseContext: {
      recipientInstructionPlain,
      proposedRenderedPlain,
      baselineRenderedPlain,
    },
    instructionCaptureWarning,
  };
}

export function recipientPreviewNoOpMessage(): string {
  return "No changes detected — revise or paste edits";
}

export function sectionChangeLabels(changedFieldKeys: string[]): string[] {
  return changedFieldKeys.map((key) => {
    const label = agreementFieldLabel(key);
    return `${label} modified`;
  });
}

/** Ordered labels for UI (clause/field granularity — no template section IDs on drafts). */
export function numberedSectionChangeLines(changedFieldKeys: string[]): string[] {
  return changedFieldKeys.map((key, i) => {
    const label = agreementFieldLabel(key);
    return `Section ${i + 1} — ${label} modified`;
  });
}

/** @deprecated Prefer {@link getRecipientPreviewSummaryBullets} in UI; kept for tests / callers. */
export function buildRecipientMaterialSummaryFromDiff(assessment: RecipientPreviewDiffAssessment): string {
  return getRecipientPreviewSummaryBullets(assessment).join(" ");
}

export function recipientSendConfirmationLine(assessment: RecipientPreviewDiffAssessment): string {
  const n = countSuggestedChanges(assessment);
  return `You are sending ${n} suggested change${n === 1 ? "" : "s"} to the owner for review.`;
}

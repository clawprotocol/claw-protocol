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

function extractNetTimingLine(after: string, before: string): string | null {
  const ma = (after || "").match(/\bnet\s*(\d+)\b/i);
  const mb = (before || "").match(/\bnet\s*(\d+)\b/i);
  if (ma && (!mb || ma[1] !== mb[1])) return `Payment timing changed to Net ${ma[1]}`;
  return null;
}

function extractPauseWorkBullet(text: string): string | null {
  const t = text || "";
  if (!/\bpause\b.*\bwork\b|\bmay\s+pause\b|\bsuspend\b.*\bwork\b/i.test(t)) return null;
  const dm = t.match(/more\s+than\s+(\d+)\s*days?\s+late|(\d+)\s*days?\s*(?:past\s*due|late)/i);
  const days = dm ? (dm[1] || dm[2]) : "15";
  return `Developer may pause work if payment is more than ${days} days late`;
}

/** Deterministic bullets for the “What changed” area on a clause card. */
export function deriveClauseWhatChangedBullets(row: AgreementFieldChange): string[] {
  const bullets: string[] = [];
  const b = (row.before || "").trim();
  const a = (row.after || "").trim();
  const blo = b.toLowerCase();

  if (row.field === "payment_terms") {
    const netLine = extractNetTimingLine(a, b);
    if (netLine) bullets.push(netLine);
    const pauseInPayment = extractPauseWorkBullet(a);
    if (pauseInPayment && !extractPauseWorkBullet(b)) bullets.push(pauseInPayment);
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
  return bullets;
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
function materialSummaryLinesForRow(row: AgreementFieldChange): string[] {
  if (row.field === "payment_terms") {
    const out: string[] = [];
    const net = extractNetTimingLine((row.after || "").trim(), (row.before || "").trim());
    if (net) out.push(net);
    if (extractPauseWorkBullet(row.after || "") && !extractPauseWorkBullet(row.before || "")) {
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

function countChangeUnitsForRow(row: AgreementFieldChange): number {
  if (!row.changed) return 0;
  const bullets = deriveClauseWhatChangedBullets(row);
  const meaningful = bullets.filter((b) => !GENERIC_CLAUSE_BULLETS.has(b));
  return meaningful.length > 0 ? meaningful.length : 1;
}

export type RecipientClauseCard = {
  id: string;
  sectionLabel: string;
  /** Word-style “what changed” bullets for this field. */
  whatChangedBullets: string[];
  /** Inline diff for this field only (never full-document HTML). */
  fieldRedline: RedlineResult | null;
  currentText: string;
  proposedText: string;
  reason: string;
};

/** When max(current, proposed) exceeds this, primary UI uses inline redline + disclosure for full text. */
export const CLAUSE_CARD_DISCLOSURE_CHAR_THRESHOLD = 220;

export function buildRecipientClauseCards(
  snapshotCompare: AgreementCompareResult,
  hasMaterialTextDiff: boolean,
): RecipientClauseCard[] {
  const rows = sortChangedFields(snapshotCompare.changedFields);
  const cards: RecipientClauseCard[] = rows.map((row, i) => {
    const currentText = row.before?.trim() ? row.before : "—";
    const proposedText = row.after?.trim() ? row.after : "—";
    return {
      id: row.field,
      sectionLabel: `Section ${i + 1} — ${agreementFieldLabel(row.field)}`,
      whatChangedBullets: deriveClauseWhatChangedBullets(row),
      fieldRedline: buildFieldLevelRedlineCapped(row.before || "", row.after || ""),
      currentText,
      proposedText,
      reason: clauseChangeReason(row),
    };
  });
  if (cards.length === 0 && hasMaterialTextDiff) {
    cards.push({
      id: "rendered_text",
      sectionLabel: "Document wording",
      whatChangedBullets: ["Rendered document text differs from the current version."],
      fieldRedline: null,
      currentText: "See Side-by-side or Full document redline for the exact rendered text.",
      proposedText: "—",
      reason: "Structured fields match, but the formatted document text differs.",
    });
  }
  return cards;
}

export function countSuggestedChanges(assessment: RecipientPreviewDiffAssessment): number {
  const rows = sortChangedFields(assessment.snapshotCompare.changedFields).filter((r) => r.changed);
  let n = rows.reduce((acc, r) => acc + countChangeUnitsForRow(r), 0);
  if (n === 0 && assessment.hasMaterialTextDiff) n = 1;
  return n;
}

/** Short, confidence-building summary lines (no huge character counts). */
export function getRecipientPreviewSummaryBullets(assessment: RecipientPreviewDiffAssessment): string[] {
  const n = countSuggestedChanges(assessment);
  const lines: string[] = [];
  lines.push(`${n} suggested change${n === 1 ? "" : "s"} detected`);
  const rows = sortChangedFields(assessment.snapshotCompare.changedFields);
  for (const row of rows) {
    for (const line of materialSummaryLinesForRow(row)) {
      lines.push(line);
    }
  }
  if (rows.length === 0 && assessment.hasMaterialTextDiff) {
    lines.push("Rendered document wording updated");
  }
  lines.push("Owner's draft will not change unless they accept.");
  return lines;
}

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
};

export function assessRecipientPreviewDiff(
  baselineDraft: AgreementDraft,
  proposedDraft: AgreementDraft,
  baselineHtml: string,
  proposedHtml: string,
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
  return {
    redline,
    snapshotCompare,
    hasMaterialTextDiff,
    hasSnapshotDiff,
    hasAnyMaterialChange,
    isCompleteNoOp,
    changeCharCount: countRedlineChangeChars(redline),
    canSubmit,
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

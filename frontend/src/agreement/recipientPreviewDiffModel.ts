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
  "purpose",
  "payment_terms",
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
    case "payment_terms":
      if (/\bnet\s*\d+/.test(a) && !/\bnet\s*\d+/.test(b)) return "Net / payment timing updated.";
      return "Payment terms updated.";
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

function friendlyFieldSummaryLine(field: string, row: AgreementFieldChange): string {
  const reason = clauseChangeReason(row);
  if (field === "payment_terms") return "Payment terms updated";
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

export type RecipientClauseCard = {
  id: string;
  sectionLabel: string;
  currentText: string;
  proposedText: string;
  reason: string;
};

export function buildRecipientClauseCards(
  snapshotCompare: AgreementCompareResult,
  hasMaterialTextDiff: boolean,
): RecipientClauseCard[] {
  const rows = sortChangedFields(snapshotCompare.changedFields);
  const cards: RecipientClauseCard[] = rows.map((row, i) => ({
    id: row.field,
    sectionLabel: `Section ${i + 1} — ${agreementFieldLabel(row.field)}`,
    currentText: row.before?.trim() ? row.before : "—",
    proposedText: row.after?.trim() ? row.after : "—",
    reason: clauseChangeReason(row),
  }));
  if (cards.length === 0 && hasMaterialTextDiff) {
    cards.push({
      id: "rendered_text",
      sectionLabel: "Document wording",
      currentText: "See Side-by-side or Full document redline for the exact rendered text.",
      proposedText: "—",
      reason: "Structured fields match, but the formatted document text differs.",
    });
  }
  return cards;
}

export function countSuggestedChanges(assessment: RecipientPreviewDiffAssessment): number {
  const k = assessment.snapshotCompare.changedFieldKeys.length;
  if (k > 0) return k;
  if (assessment.hasMaterialTextDiff) return 1;
  return 0;
}

/** Short, confidence-building summary lines (no huge character counts). */
export function getRecipientPreviewSummaryBullets(assessment: RecipientPreviewDiffAssessment): string[] {
  const n = countSuggestedChanges(assessment);
  const lines: string[] = [];
  lines.push(`${n} suggested change${n === 1 ? "" : "s"} detected`);
  const rows = sortChangedFields(assessment.snapshotCompare.changedFields);
  for (const row of rows) {
    lines.push(friendlyFieldSummaryLine(row.field, row));
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

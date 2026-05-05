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

export type RecipientPreviewDiffAssessment = {
  redline: RedlineResult;
  snapshotCompare: AgreementCompareResult;
  hasMaterialTextDiff: boolean;
  hasSnapshotDiff: boolean;
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
  const canSubmit = hasMaterialTextDiff && hasSnapshotDiff;
  return {
    redline,
    snapshotCompare,
    hasMaterialTextDiff,
    hasSnapshotDiff,
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

export function buildRecipientMaterialSummaryFromDiff(assessment: RecipientPreviewDiffAssessment): string {
  const parts: string[] = [];
  const labels = sectionChangeLabels(assessment.snapshotCompare.changedFieldKeys);
  if (labels.length > 0) {
    parts.push(`Updated fields: ${labels.join("; ")}.`);
  }
  const ops = assessment.redline.segments.filter((s) => s.type !== "same").length;
  if (assessment.hasMaterialTextDiff) {
    parts.push(
      `About ${assessment.changeCharCount} characters of wording changed in the rendered document (${ops} diff segments).`,
    );
  }
  return parts.join(" ").trim() || "No material text changes.";
}

export function recipientSendConfirmationLine(assessment: RecipientPreviewDiffAssessment): string {
  const sections = assessment.snapshotCompare.changedFieldKeys.length;
  const changes = Math.max(
    1,
    assessment.redline.segments.filter((s) => s.type !== "same").length,
  );
  return `You are sending ${changes} change${changes === 1 ? "" : "s"} across ${sections} section${sections === 1 ? "" : "s"}.`;
}

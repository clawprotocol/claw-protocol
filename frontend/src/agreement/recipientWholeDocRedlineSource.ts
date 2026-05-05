/**
 * Builds whole-document legal redline plain-text inputs for recipient preview.
 * Rendered HTML often omits field-level edits; when snapshot differs but HTML-derived
 * redline is empty, append a structured draft trailer so owner vs proposed state is visible.
 */

import type { AgreementDraft } from "./agreementTypes";
import { htmlToPlainTextForLegalRedline } from "./externalAiHandoff";
import { buildLegalRedlineDocumentViewModel } from "./legalRedlineBlocks";

function structuredDraftTrailer(d: AgreementDraft): string {
  return (
    "\n\nAgreement fields (tracked for redline)\n" +
    `Payment terms: ${String(d.payment_terms ?? "").trim()}\n` +
    `Duration: ${String(d.duration ?? "").trim()}\n` +
    `Purpose: ${String(d.purpose ?? "").trim()}\n` +
    `Jurisdiction: ${String(d.jurisdiction ?? "").trim()}\n` +
    `Title: ${String(d.title ?? "").trim()}\n`
  );
}

/**
 * @param hasSnapshotDiff — from {@link assessRecipientPreviewDiff}; when true and HTML-only
 * redline is empty, draft trailers are appended so clause-level edits surface in whole-doc VM.
 */
/** Compact fingerprint for diagnostics (length + FNV-1a 32-bit). */
export function fingerprintPlainText(s: string): string {
  const t = String(s ?? "").slice(0, 12000);
  let h = 2166136261;
  for (let i = 0; i < t.length; i++) {
    h ^= t.charCodeAt(i)!;
    h = Math.imul(h, 16777619);
  }
  return `${t.length}:${(h >>> 0).toString(16)}`;
}

/** Short snippet around payment-related wording for logs. */
export function snippetAroundPaymentTerms(plain: string): string {
  const lower = plain.toLowerCase();
  const needles = ["net 30", "net 15", "net 60", "receipt", "invoice", "payment terms", "payable", "payment"];
  let idx = -1;
  for (const n of needles) {
    const i = lower.indexOf(n);
    if (i >= 0) {
      idx = i;
      break;
    }
  }
  if (idx < 0) return plain.slice(0, 200).replace(/\s+/g, " ").trim();
  return plain.slice(Math.max(0, idx - 50), idx + 180).replace(/\s+/g, " ").trim();
}

export function buildRecipientLegalRedlinePlainTexts(
  baselineDraft: AgreementDraft,
  proposedDraft: AgreementDraft,
  baselineHtml: string,
  proposedHtml: string,
  hasSnapshotDiff: boolean,
): { currentPlain: string; proposedPlain: string } {
  const cur = htmlToPlainTextForLegalRedline(baselineHtml || "");
  const prop = htmlToPlainTextForLegalRedline(proposedHtml || "");
  if (!hasSnapshotDiff) {
    return { currentPlain: cur, proposedPlain: prop };
  }
  const primaryVm = buildLegalRedlineDocumentViewModel(cur, prop);
  if (primaryVm.hasChanges) {
    return { currentPlain: cur, proposedPlain: prop };
  }
  return {
    currentPlain: cur + structuredDraftTrailer(baselineDraft),
    proposedPlain: prop + structuredDraftTrailer(proposedDraft),
  };
}

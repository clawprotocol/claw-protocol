/**
 * Draft fact preservation layer.
 *
 * Ensures structured facts extracted from intake text survive the full
 * parse → defaults → normalization → render pipeline without being
 * downgraded to placeholders or generic boilerplate.
 *
 * Strategy: after all defaults have been applied, compare the draft against
 * the structured extraction results. If a field was confidently extracted
 * but the draft contains a generic/placeholder value, restore the extracted value.
 */

import { parseIntakeToStructuredAgreement, type IntakeStructuredAgreement } from "./intakeStructuredAgreementModel";
import type { ParsedDraftShape } from "./intakeSmartDefaults";

const PLACEHOLDER_PATTERNS = [
  /^\[not yet specified\]$/i,
  /^tbd$/i,
  /^to be (?:agreed|determined|refined|defined)/i,
  /^(?:scope|deliverables?|services?)(?:\s+and\s+\w+)?\s+to be (?:refined|described|agreed)/i,
  /^(?:payment|compensation) (?:schedule )?to be agreed/i,
  /^(?:commercial )?arrangement to be described/i,
  /add specifics in review/i,
  /refine (?:wording )?in review/i,
  /^upon full execution/i,
  /to be (?:refined|described|agreed|defined) in review/i,
];

const GENERIC_DURATION_PATTERNS = [
  /^12 months unless terminated/i,
  /^as stated in the agreement/i,
  /^until (?:dissolved|terminated)/i,
];

const GENERIC_JURISDICTION = /^delaware$/i;

function isPlaceholderValue(val: string): boolean {
  const t = val.trim();
  if (!t) return true;
  return PLACEHOLDER_PATTERNS.some((re) => re.test(t));
}

function isGenericDuration(val: string): boolean {
  const t = val.trim();
  if (!t) return true;
  return GENERIC_DURATION_PATTERNS.some((re) => re.test(t));
}

/**
 * Confidence thresholds for overriding defaults with extracted values.
 * Higher thresholds = more conservative restoration.
 */
const SCOPE_CONFIDENCE_THRESHOLD = 0.60;
const TERM_CONFIDENCE_THRESHOLD = 0.60;

export type FactPreservationResult = {
  draft: ParsedDraftShape;
  restoredFields: string[];
};

/**
 * Re-checks the draft against structured extraction and restores any field
 * that was downgraded from a confident extraction to a placeholder/default.
 */
export function preserveExtractedFacts(
  draft: ParsedDraftShape,
  intakeText: string,
): FactPreservationResult {
  const structured = parseIntakeToStructuredAgreement(intakeText);
  const restored: string[] = [];
  let next = { ...draft };

  next = restoreScope(next, structured, restored);
  next = restorePayment(next, structured, intakeText, restored);
  next = restoreDuration(next, structured, restored);
  next = restoreJurisdiction(next, structured, restored);
  next = restoreTermination(next, structured, restored);

  return { draft: next, restoredFields: restored };
}

function restoreScope(
  draft: ParsedDraftShape,
  structured: IntakeStructuredAgreement,
  restored: string[],
): ParsedDraftShape {
  const current = (draft.purpose || "").trim();
  const extracted = structured.scope.trim();

  if (!extracted || structured.scopeConfidence < SCOPE_CONFIDENCE_THRESHOLD) return draft;
  if (current && !isPlaceholderValue(current)) return draft;

  restored.push("purpose");
  return { ...draft, purpose: extracted };
}

function restorePayment(
  draft: ParsedDraftShape,
  structured: IntakeStructuredAgreement,
  _intakeText: string,
  restored: string[],
): ParsedDraftShape {
  const current = (draft.payment_terms || "").trim();
  const extracted = structured.payment.trim();

  if (!extracted) return draft;
  if (current && !isPlaceholderValue(current)) return draft;

  restored.push("payment_terms");
  return { ...draft, payment_terms: extracted };
}

function restoreDuration(
  draft: ParsedDraftShape,
  structured: IntakeStructuredAgreement,
  restored: string[],
): ParsedDraftShape {
  const current = (draft.duration || "").trim();
  const extracted = structured.term.trim();

  if (!extracted || structured.termConfidence < TERM_CONFIDENCE_THRESHOLD) return draft;
  if (current && !isPlaceholderValue(current) && !isGenericDuration(current)) return draft;

  restored.push("duration");
  return { ...draft, duration: extracted };
}

function restoreJurisdiction(
  draft: ParsedDraftShape,
  structured: IntakeStructuredAgreement,
  restored: string[],
): ParsedDraftShape {
  const current = (draft.jurisdiction || "").trim();
  const extracted = structured.governing_law.trim();

  if (!extracted) return draft;
  if (current && !GENERIC_JURISDICTION.test(current) && current.toLowerCase() !== "tbd") return draft;

  restored.push("jurisdiction");
  return { ...draft, jurisdiction: extracted };
}

function restoreTermination(
  draft: ParsedDraftShape,
  structured: IntakeStructuredAgreement,
  restored: string[],
): ParsedDraftShape {
  const current = (draft.termination_summary || "").trim();
  const extracted = structured.termination.trim();

  if (!extracted) return draft;
  if (current && current.length > 10) return draft;

  restored.push("termination_summary");
  return { ...draft, termination_summary: extracted };
}

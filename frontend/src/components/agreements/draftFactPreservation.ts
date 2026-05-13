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

/**
 * Archetype default-purpose patterns that may be overridden by HIGH-confidence
 * labeled scope extraction (Scope:/Purpose: etc, confidence ~0.92). These are
 * the canned family-shell purposes that should not block a clearly extracted
 * specific scope from the user's intake.
 */
const ARCHETYPE_PURPOSE_PATTERNS = [
  /^mutual protection of confidential and proprietary information/i,
  /^protection of confidential and proprietary information/i,
  /^governance, economics, management, and operations of the LLC/i,
  /^scope of work described in your text/i,
];

const HIGH_CONFIDENCE_LABELED_THRESHOLD = 0.85;

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

function isArchetypeDefaultPurpose(val: string): boolean {
  const t = val.trim();
  if (!t) return false;
  return ARCHETYPE_PURPOSE_PATTERNS.some((re) => re.test(t));
}

function restoreScope(
  draft: ParsedDraftShape,
  structured: IntakeStructuredAgreement,
  restored: string[],
): ParsedDraftShape {
  const current = (draft.purpose || "").trim();
  const extracted = structured.scope.trim();

  if (!extracted || structured.scopeConfidence < SCOPE_CONFIDENCE_THRESHOLD) return draft;
  if (current && !isPlaceholderValue(current)) {
    // Allow HIGH-confidence labeled scope to override archetype defaults
    // (e.g. NDA's "Mutual protection of confidential...") so a user's specific
    // "Purpose: Pre-IPO due diligence on Project Apollo" wins.
    const canOverrideArchetype =
      structured.scopeConfidence >= HIGH_CONFIDENCE_LABELED_THRESHOLD && isArchetypeDefaultPurpose(current);
    if (!canOverrideArchetype) return draft;
  }

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

/**
 * Confidence threshold above which extracted governing law is AUTHORITATIVE —
 * no later default / family shell may overwrite it. Aligns with the regression
 * spec: "Once a governing law is extracted with confidence >= 0.8, it becomes authoritative."
 */
const AUTHORITATIVE_GOVERNING_LAW_CONFIDENCE = 0.8;

function restoreJurisdiction(
  draft: ParsedDraftShape,
  structured: IntakeStructuredAgreement,
  restored: string[],
): ParsedDraftShape {
  const current = (draft.jurisdiction || "").trim();
  const extracted = structured.governing_law.trim();

  if (!extracted) return draft;

  // Authoritative override: high-confidence extraction always wins, even over a
  // non-generic default like "Delaware" written by an earlier shell pass.
  const isAuthoritative = (structured.governingLawConfidence ?? 0) >= AUTHORITATIVE_GOVERNING_LAW_CONFIDENCE;
  if (isAuthoritative) {
    if (current.toLowerCase() === extracted.toLowerCase()) return draft;
    restored.push("jurisdiction");
    return { ...draft, jurisdiction: extracted };
  }

  // Lower-confidence: only restore if current is empty or a known default.
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

/**
 * Shared "between A and B" extraction for live preview and placeholder substitution.
 * Preserves full entity phrases (LLC, Inc., multi-word names); does not split on internal "and".
 */

import {
  sanitizePartyLegalNameFromIntakeFragment,
  stripSignerInstructionClausesFromIntake,
} from "./intakeSignerInstructionParse";
import { normalizePartyNameFragment } from "./partyIntakeNormalize";
import {
  collapsePartySlotCandidates,
  normalizeAgreementPartyName,
  splitCommaSeparatedPartyNames,
} from "./partySlotIdentityNormalize";
import { truncatePartyClauseTailAtLabeledFields } from "./partyRoleAnnotations";

const TAIL_STOP =
  /\s+(?:\n|(?:(?:for|whereas|hereafter|effective|the\s+term|term:|scope:|consideration|warranties|Signer\s+for)\b))/i;

/**
 * Continuity guard (Railway QA): if the tail after "between" includes a sentence boundary
 * (`. `) followed by a known structural-field keyword or a dollar-amount, truncate there
 * so the second party's name does not absorb the trailing payment / term / scope sentence.
 *
 * Examples this stops:
 *   "FoundryCo Inc. and Apollo Data LLC. Fee $20,000 due on completion." → "Apollo Data LLC"
 *   "Acme LLC and Beta Co. Property: 123 Main St"                         → "Beta Co"
 *   "Acme LLC and Beta Co. Effective May 15, 2026"                        → "Beta Co"
 *
 * Conservative on purpose: we only match well-known section starters and leading "$" so
 * unrelated periods (e.g. corporate suffixes, court-style "v.") are unaffected.
 */
const SENTENCE_BOUNDARY_FIELD_STOP =
  /\.\s+(?:\$|Fee\b|Payment\b|Compensation\b|Price\b|Term\b|Scope\b|Purpose\b|Effective\b|Closing\b|Property\b|Premises\b|Rent\b|Deposit\b|Governing\b|Jurisdiction\b|Venue\b|Confidential|Termination\b|Notice\b|Services?\b|Deliverables?\b)/i;

/** Truncate after the first complete party clause when the next sentence starts a new thought. */
const GENERAL_BETWEEN_SENTENCE_END_RE = /\.\s+(?=[A-Z])/;

function isOxfordCommaPartyList(tail: string): boolean {
  return /,/.test(tail) && /\s+and\s+\S/i.test(tail);
}

function truncateBetweenTailAtSentenceBoundary(tail: string): string {
  let out = tail;
  const sentStop = SENTENCE_BOUNDARY_FIELD_STOP.exec(out);
  if (sentStop && sentStop.index !== undefined && sentStop.index > 0) {
    out = out.slice(0, sentStop.index);
  }
  const genStop = GENERAL_BETWEEN_SENTENCE_END_RE.exec(out);
  if (genStop && genStop.index !== undefined && genStop.index > 0) {
    out = out.slice(0, genStop.index);
  }
  return out.trim();
}

function trimBetweenPartyFragment(s: string): string {
  // Strip list punctuation only — preserve "Inc." / "Corp." terminal periods.
  const cleaned = sanitizePartyLegalNameFromIntakeFragment(s.replace(/[,;:]+$/g, "").trim());
  return normalizePartyNameFragment(cleaned);
}

function sliceBetweenPartyClauseTail(raw: string): string | null {
  const text = stripSignerInstructionClausesFromIntake(raw.trim());
  const m = text.match(/\bbetween\s+/i);
  if (!m || m.index === undefined) return null;

  let tail = text.slice(m.index + m[0].length);
  const nl = tail.indexOf("\n");
  if (nl >= 0) tail = tail.slice(0, nl);
  tail = truncatePartyClauseTailAtLabeledFields(tail);
  const stop = TAIL_STOP.exec(tail);
  if (stop && stop.index !== undefined && stop.index > 0) tail = tail.slice(0, stop.index);
  tail = truncateBetweenTailAtSentenceBoundary(tail);
  return tail.length >= 3 ? tail : null;
}

function extractBetweenPartyNameListFromOxfordTail(tail: string): string[] {
  const segments = tail.split(/\s+and\s+/i).filter((s) => s.trim().length > 0);
  if (segments.length < 2) return [];

  const right = trimBetweenPartyFragment(segments[segments.length - 1]);
  const leftCsv = segments.slice(0, -1).join(" and ");
  const leftNames = splitCommaSeparatedPartyNames(leftCsv)
    .map(trimBetweenPartyFragment)
    .map(normalizeAgreementPartyName)
    .filter((n) => n.length >= 2);

  const names = collapsePartySlotCandidates(
    right.length >= 2 ? [...leftNames, normalizeAgreementPartyName(right)] : leftNames,
  );
  return names.length >= 2 ? names : [];
}

/** Two-party between clause: split on the first " and ", not later service-list conjunctions. */
function extractBetweenPartyNameListFromFirstAndPair(tail: string): string[] {
  const truncated = truncateBetweenTailAtSentenceBoundary(tail);
  const andIdx = truncated.search(/\s+and\s+/i);
  if (andIdx < 0) return [];
  const leftRaw = truncated.slice(0, andIdx);
  const rightRaw = truncated.slice(andIdx).replace(/^\s+and\s+/i, "");
  const leftNames = splitCommaSeparatedPartyNames(leftRaw)
    .map(trimBetweenPartyFragment)
    .map(normalizeAgreementPartyName)
    .filter((n) => n.length >= 2);
  const right = trimBetweenPartyFragment(rightRaw.replace(/[.,;:]+$/g, "").trim());
  const names = collapsePartySlotCandidates(
    right.length >= 2 ? [...leftNames, normalizeAgreementPartyName(right)] : leftNames,
  );
  return names.length >= 2 ? names.slice(0, 2) : [];
}

/**
 * Ordered party names after "between …" (2+ parties). Normalizes each name individually so
 * entity suffix dedupe never strips LLC/Inc. from later parties in a comma-separated list.
 */
export function extractBetweenPartyNameList(raw: string): string[] {
  const tail = sliceBetweenPartyClauseTail(raw);
  if (!tail) return [];

  if (isOxfordCommaPartyList(tail)) {
    return extractBetweenPartyNameListFromOxfordTail(tail);
  }
  return extractBetweenPartyNameListFromFirstAndPair(tail);
}

/**
 * After the word "between ", split the remainder on the **last** " and " so that
 * party A can contain "Smith and Wesson" while still separating A from B.
 */
export function extractBetweenPartyPair(raw: string): { left: string; right: string } | null {
  const names = extractBetweenPartyNameList(raw);
  if (names.length < 2) return null;
  const right = names[names.length - 1];
  const left = names.slice(0, -1).join(" and ");
  if (left.length < 2 || right.length < 2) return null;
  return { left, right };
}

export function verbatimBetweenClause(raw: string): string | null {
  const text = raw.trim();
  const m = text.match(/\bbetween\s+[\s\S]+/i);
  if (!m) return null;
  let clause = m[0];
  clause = truncatePartyClauseTailAtLabeledFields(clause);
  const stop = TAIL_STOP.exec(clause);
  if (stop && stop.index !== undefined && stop.index > 8) clause = clause.slice(0, stop.index);
  const sentStop = SENTENCE_BOUNDARY_FIELD_STOP.exec(clause);
  if (sentStop && sentStop.index !== undefined && sentStop.index > 8) clause = clause.slice(0, sentStop.index);
  const oneLine = clause.replace(/\s+/g, " ").trim();
  return oneLine.length > 400 ? `${oneLine.slice(0, 397)}…` : oneLine;
}

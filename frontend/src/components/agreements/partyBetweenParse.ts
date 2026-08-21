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
  isInvalidPartySlotLegalEntity,
  mergeSplitEntitySuffixFragments,
  normalizeAgreementPartyName,
  splitCommaSeparatedPartyNames,
} from "./partySlotIdentityNormalize";
import {
  isAuthoritativeLegalEntityName,
  isDisallowedPartyPhrase,
} from "./paidProPartyNamePreserve";
import { stripPartyRoleAnnotations, truncatePartyClauseTailAtLabeledFields, preCleanBetweenTailForMultiPartySplit } from "./partyRoleAnnotations";
import { isPlaceholderPartyName } from "./starterPartyLimits";

const ROLE_ALIAS_NOT_PARTY_RE =
  /^(?:the\s+)?(?:client|consultant|service\s+provider|company|customer|provider|vendor|contractor|party\s*[ab])$/i;

/** Broader between-clause acceptance — entities and individual contracting parties. */
export function isBetweenClausePartyCandidate(name: string): boolean {
  const raw = String(name ?? "").replace(/\s+/g, " ").trim();
  if (raw.length < 2 || isInvalidPartySlotLegalEntity(raw)) return false;
  if (ROLE_ALIAS_NOT_PARTY_RE.test(raw)) return false;
  if (isPlaceholderPartyName(raw)) return false;
  if (isAuthoritativeLegalEntityName(raw)) return true;

  const { name: stripped } = stripPartyRoleAnnotations(raw);
  const t = stripped.trim();
  if (t.length < 2 || ROLE_ALIAS_NOT_PARTY_RE.test(t)) return false;
  if (isDisallowedPartyPhrase(t)) return false;

  const words = t.split(/\s+/).filter(Boolean);
  if (/\btrust\b/i.test(t) && words.length >= 2 && words.length <= 8) return true;
  if (
    /(?:Holdings|Studios|Partners|Group|Capital|Services|Enterprises|Solutions|Technologies|Logistics|Analytics|Automation)\b/i.test(t) &&
    words.length >= 2 &&
    words.length <= 8
  ) {
    return true;
  }
  if (/\bd\/b\/a\b/i.test(t) && /(?:LLC|Inc|Corp|Ltd|LLP|SA|GmbH|AG|KG)/i.test(t)) return true;
  if (words.length >= 2 && words.length <= 8) {
    const nameLike = words.every((w) => /^[A-Z][A-Za-z'.-]*$/.test(w) || /^[A-Z]\.$/.test(w));
    if (nameLike) return true;
  }
  return false;
}

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
const GENERAL_BETWEEN_SENTENCE_END_RE = /\.\s+(?=[A-Z])/g;

/**
 * Periods inside multi-token entity suffixes (e.g. "Summit Supply Co. Inc.") are not
 * sentence boundaries — only truncate when the next capital token is not a suffix word.
 */
const ENTITY_SUFFIX_AFTER_PERIOD_RE =
  /^(?:Inc\.?|Corp\.?|Ltd\.?|LLC|L\.L\.C\.?|LLP|PLC|P\.C\.?|Co\.?|SA|S\.A\.?|GmbH|AG|KG)\b/i;

function isOxfordCommaPartyList(tail: string): boolean {
  // Ignore entity-suffix commas ("Name, LLC") so bilateral between-clauses are not
  // misclassified as Oxford party lists.
  const structural = normalizeAgreementPartyName(tail);
  return /,/.test(structural) && /\s+and\s+\S/i.test(structural);
}

function findGeneralBetweenSentenceEnd(tail: string): number {
  GENERAL_BETWEEN_SENTENCE_END_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = GENERAL_BETWEEN_SENTENCE_END_RE.exec(tail)) !== null) {
    if (m.index <= 0) continue;
    const rest = tail.slice(m.index + 1).replace(/^\s+/, "");
    if (ENTITY_SUFFIX_AFTER_PERIOD_RE.test(rest)) continue;
    return m.index;
  }
  return -1;
}

function truncateBetweenTailAtSentenceBoundary(tail: string): string {
  let out = tail;
  const sentStop = SENTENCE_BOUNDARY_FIELD_STOP.exec(out);
  if (sentStop && sentStop.index !== undefined && sentStop.index > 0) {
    out = out.slice(0, sentStop.index);
  }
  const genStop = findGeneralBetweenSentenceEnd(out);
  if (genStop > 0) {
    out = out.slice(0, genStop);
  }
  return out.trim();
}

function trimBetweenPartyFragment(s: string): string {
  // Strip list punctuation only — preserve "Inc." / "Corp." terminal periods.
  const cleaned = sanitizePartyLegalNameFromIntakeFragment(s.replace(/[,;:]+$/g, "").trim());
  const { name } = stripPartyRoleAnnotations(cleaned);
  return normalizePartyNameFragment(name);
}

function sliceBetweenPartyClauseTail(raw: string): string | null {
  const text = stripSignerInstructionClausesFromIntake(raw.trim());
  const m = text.match(/\b(?:between|among)\s+/i);
  if (!m || m.index === undefined) return null;

  let tail = text.slice(m.index + m[0].length);
  const nl = tail.indexOf("\n");
  if (nl >= 0) tail = tail.slice(0, nl);
  tail = preCleanBetweenTailForMultiPartySplit(tail);
  tail = truncatePartyClauseTailAtLabeledFields(tail);
  const stop = TAIL_STOP.exec(tail);
  if (stop && stop.index !== undefined && stop.index > 0) tail = tail.slice(0, stop.index);
  tail = truncateBetweenTailAtSentenceBoundary(tail);
  return tail.length >= 3 ? tail : null;
}

/**
 * Raw between tail for semantic role extraction — preserves "as <role>" and comma role tails
 * that {@link preCleanBetweenTailForMultiPartySplit} strips before party-name splitting.
 */
export function sliceRawBetweenPartyClauseTailForRoleHints(raw: string): string | null {
  const text = stripSignerInstructionClausesFromIntake(raw.trim());
  const m = text.match(/\b(?:between|among)\s+/i);
  if (!m || m.index === undefined) return null;

  let tail = text.slice(m.index + m[0].length);
  const nl = tail.indexOf("\n");
  if (nl >= 0) tail = tail.slice(0, nl);
  tail = tail.replace(/\s*,\s*with\s+/gi, " and ");
  tail = truncatePartyClauseTailAtLabeledFields(tail);
  const stop = TAIL_STOP.exec(tail);
  if (stop && stop.index !== undefined && stop.index > 0) tail = tail.slice(0, stop.index);
  tail = truncateBetweenTailAtSentenceBoundary(tail);
  return tail.length >= 3 ? tail : null;
}

/**
 * Oxford / comma-list segmentation aligned with {@link splitMultiPartyCommaListInternal}:
 *   - Comma + optional "and" is the structural separator (case-insensitive after the comma).
 *   - Standalone " and " is lowercase-only so mid-name capital "And"
 *     (e.g. "Beacon Operations And Logistics Group LLC") stays inside one party.
 */
const COMMA_OXFORD_PARTY_SPLIT = /\s*,\s*(?:and\s+)?/i;
const STANDALONE_LOWERCASE_AND_SPLIT = /\s+and\s+/;

function splitBetweenPartyListSegments(tail: string): string[] {
  // Detach ", LLC" / ", Inc." before structural splits so entity-suffix commas never
  // become Oxford separators (TEST330: "Red Mesa Logistics, LLC and Harbor…").
  const prepared = normalizeAgreementPartyName(tail);
  const rough = prepared
    .split(COMMA_OXFORD_PARTY_SPLIT)
    .flatMap((s) => s.split(STANDALONE_LOWERCASE_AND_SPLIT))
    .map((s) => s.trim())
    .filter(Boolean);
  return mergeSplitEntitySuffixFragments(rough.map(normalizeAgreementPartyName));
}

function extractBetweenPartyNameListFromOxfordTail(tail: string, useAuthorityCandidates: boolean): string[] {
  const truncated = truncateBetweenTailAtSentenceBoundary(tail);
  const rawSegments = splitBetweenPartyListSegments(truncated);
  if (rawSegments.length < 2) return [];

  const names: string[] = [];
  for (const segment of rawSegments) {
    for (const candidate of expandSegmentIntoPartyCandidates(segment)) {
      if (useAuthorityCandidates ? isBetweenClausePartyCandidate(candidate) : isAuthoritativeLegalEntityName(candidate)) {
        names.push(candidate);
      }
    }
  }

  const collapsed = collapsePartySlotCandidates(names);
  const filterFn = useAuthorityCandidates
    ? filterBetweenClausePartyCandidates
    : filterAuthoritativeBetweenPartyNames;
  return filterFn(collapsed);
}

function filterAuthoritativeBetweenPartyNames(names: string[]): string[] {
  return names.filter((n) => isAuthoritativeLegalEntityName(n) && !isInvalidPartySlotLegalEntity(n));
}

function filterBetweenClausePartyCandidates(names: string[]): string[] {
  return names.filter((n) => isBetweenClausePartyCandidate(n));
}

function trimTrailingListPunctuationPreservingEntitySuffix(segment: string): string {
  let s = segment.trim();
  // Keep terminal periods that are part of Inc. / Corp. / Ltd. / S.A. entity suffixes.
  if (/\b(?:Inc|Corp|Ltd|Co|L\.L\.C|S\.A)\.$/i.test(s)) return s;
  return s.replace(/[.,;:]+$/g, "").trim();
}

function expandSegmentIntoPartyCandidates(segment: string): string[] {
  const inner = truncateBetweenTailAtSentenceBoundary(
    trimTrailingListPunctuationPreservingEntitySuffix(segment),
  );
  if (!inner) return [];
  const commaParts = splitCommaSeparatedPartyNames(inner)
    .map(trimBetweenPartyFragment)
    .map(normalizeAgreementPartyName)
    .filter((n) => n.length >= 2);
  if (commaParts.length >= 2) {
    const valid = commaParts.filter((n) => isBetweenClausePartyCandidate(n));
    if (valid.length >= 2) return valid;
  }
  // Lowercase-only " and " — do not split mid-name capital "And".
  const chained = inner
    .split(STANDALONE_LOWERCASE_AND_SPLIT)
    .map((s) => trimBetweenPartyFragment(s.trim()))
    .map(normalizeAgreementPartyName)
    .filter((n) => n.length >= 2);
  if (chained.length >= 2 && chained.every((n) => isBetweenClausePartyCandidate(n))) {
    return chained;
  }
  const single = trimBetweenPartyFragment(inner);
  return single.length >= 2 ? [normalizeAgreementPartyName(single)] : [];
}

/** N-party between clause: chained " and " segments and comma lists (no two-party cap). */
function extractBetweenPartyNameListFromChainedAndSplit(tail: string): string[] {
  const truncated = truncateBetweenTailAtSentenceBoundary(tail);
  const segments = splitBetweenPartyListSegments(truncated);
  if (segments.length < 2) return [];

  const names: string[] = [];
  for (const segment of segments) {
    for (const candidate of expandSegmentIntoPartyCandidates(segment)) {
      if (isBetweenClausePartyCandidate(candidate)) names.push(candidate);
    }
  }
  const collapsed = collapsePartySlotCandidates(names);
  const filtered = filterBetweenClausePartyCandidates(collapsed);
  return filtered.length >= 2 ? filtered : [];
}

/**
 * Bilateral-only between extraction — first lowercase " and " pair for legacy two-party call sites.
 * Do not use for canonical N-party authority; prefer {@link extractBetweenPartyNameList}.
 * Capital mid-name "And" is intentionally not treated as a separator.
 */
export function extractBetweenPartyNameListBilateralOnly(tail: string): string[] {
  const truncated = truncateBetweenTailAtSentenceBoundary(tail);
  const andIdx = truncated.search(STANDALONE_LOWERCASE_AND_SPLIT);
  if (andIdx < 0) return [];
  const leftRaw = truncated.slice(0, andIdx);
  const rightRaw = truncated.slice(andIdx).replace(/^\s+and\s+/, "");
  const leftNames = splitCommaSeparatedPartyNames(leftRaw)
    .map(trimBetweenPartyFragment)
    .map(normalizeAgreementPartyName)
    .filter((n) => n.length >= 2);
  const right = trimBetweenPartyFragment(rightRaw.replace(/[.,;:]+$/g, "").trim());
  const names = collapsePartySlotCandidates(
    right.length >= 2 ? [...leftNames, normalizeAgreementPartyName(right)] : leftNames,
  );
  const filtered = filterAuthoritativeBetweenPartyNames(names);
  return filtered.length >= 2 ? filtered.slice(0, 2) : [];
}

/**
 * Ordered party names after "between …" (2+ parties). Normalizes each name individually so
 * entity suffix dedupe never strips LLC/Inc. from later parties in a comma-separated list.
 */
function extractBetweenPartyNameListInternal(raw: string, useAuthorityCandidates: boolean): string[] {
  const tail = sliceBetweenPartyClauseTail(raw);
  if (!tail) return [];

  if (isOxfordCommaPartyList(tail)) {
    return extractBetweenPartyNameListFromOxfordTail(tail, useAuthorityCandidates);
  }
  const chained = extractBetweenPartyNameListFromChainedAndSplit(tail);
  if (chained.length >= 2) {
    return useAuthorityCandidates ? chained : filterAuthoritativeBetweenPartyNames(chained);
  }
  if (useAuthorityCandidates) {
    return filterBetweenClausePartyCandidates(chained);
  }
  return extractBetweenPartyNameListBilateralOnly(tail);
}

/** Ordered party names after "between …" — N-party aware (entity suffixes preserved). */
export function extractBetweenPartyNameList(raw: string): string[] {
  // Prefer authority candidates first so sole-prop + brand intakes
  // ("Alex Rivera", "PixelForge Labs") are not dropped by entity-suffix-only filters.
  const authority = extractBetweenPartyNameListInternal(raw, true);
  if (authority.length >= 2) return authority;
  return extractBetweenPartyNameListInternal(raw, false);
}

/** Between-clause extraction for legal-party authority — includes individual contracting parties. */
export function extractBetweenPartyNameListForAuthority(raw: string): string[] {
  return extractBetweenPartyNameListInternal(raw, true);
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

/**
 * Raw between-clause sides before entity normalization — preserves comma role tails
 * ("Entity LLC, the client") for semantic role authority.
 */
export function extractBetweenPartyRawPair(raw: string): { leftRaw: string; rightRaw: string } | null {
  const tail = sliceBetweenPartyClauseTail(raw);
  if (!tail) return null;
  const truncated = truncateBetweenTailAtSentenceBoundary(tail);
  if (isOxfordCommaPartyList(truncated)) {
    const segments = truncated.split(/\s+and\s+/i).filter((s) => s.trim().length > 0);
    if (segments.length < 2) return null;
    const rightRaw = segments[segments.length - 1].trim();
    const leftRaw = segments.slice(0, -1).join(" and ").trim();
    if (leftRaw.length < 2 || rightRaw.length < 2) return null;
    return { leftRaw, rightRaw };
  }
  const andIdx = truncated.search(/\s+and\s+/i);
  if (andIdx < 0) return null;
  const leftRaw = truncated.slice(0, andIdx).trim();
  const rightRaw = truncated.slice(andIdx).replace(/^\s+and\s+/i, "").trim();
  if (leftRaw.length < 2 || rightRaw.length < 2) return null;
  return { leftRaw, rightRaw };
}

export function verbatimBetweenClause(raw: string): string | null {
  const text = raw.trim();
  const m = text.match(/\b(?:between|among)\s+[\s\S]+/i);
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

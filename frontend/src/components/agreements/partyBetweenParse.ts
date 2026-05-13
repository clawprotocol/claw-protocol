/**
 * Shared "between A and B" extraction for live preview and placeholder substitution.
 * Preserves full entity phrases (LLC, Inc., multi-word names); does not split on internal "and".
 */

import { normalizePartyNameFragment } from "./partyIntakeNormalize";
import { truncatePartyClauseTailAtLabeledFields } from "./partyRoleAnnotations";

const TAIL_STOP = /\s+(?:\n|(?:(?:for|whereas|hereafter|effective|the\s+term|term:|scope:|consideration|warranties)\b))/i;

/**
 * After the word "between ", split the remainder on the **last** " and " so that
 * party A can contain "Smith and Wesson" while still separating A from B.
 */
export function extractBetweenPartyPair(raw: string): { left: string; right: string } | null {
  const text = raw.trim();
  const m = text.match(/\bbetween\s+/i);
  if (!m || m.index === undefined) return null;

  let tail = text.slice(m.index + m[0].length);
  const nl = tail.indexOf("\n");
  if (nl >= 0) tail = tail.slice(0, nl);
  tail = truncatePartyClauseTailAtLabeledFields(tail);
  const stop = TAIL_STOP.exec(tail);
  if (stop && stop.index !== undefined && stop.index > 0) tail = tail.slice(0, stop.index);
  tail = tail.trim();
  if (tail.length < 3) return null;

  const segments = tail.split(/\s+and\s+/i).filter((s) => s.trim().length > 0);
  if (segments.length < 2) return null;

  const trimName = (s: string) => normalizePartyNameFragment(s.replace(/[.;:]+$/g, "").trim());
  const right = trimName(segments[segments.length - 1]);
  const left = trimName(segments.slice(0, -1).join(" and "));
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
  const oneLine = clause.replace(/\s+/g, " ").trim();
  return oneLine.length > 400 ? `${oneLine.slice(0, 397)}…` : oneLine;
}

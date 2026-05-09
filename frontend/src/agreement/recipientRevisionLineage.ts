/**
 * Foundational types for multi-round sender ↔ recipient negotiation.
 * UI for “Round 2” / compare-base switching is not implemented yet — these fields
 * exist so compare surfaces can be threaded without a dead-end refactor later.
 */

export type RecipientRevisionLineage = {
  /** 1 = first recipient pass; increments on subsequent rounds. */
  revisionRound: number;
  /** Parent draft this revision was derived from (e.g. sender counter-draft). */
  parentRevisionId: string | null;
  /** Explicit baseline used for compare (defaults to current agreement head when null). */
  compareBaseVersionId: string | null;
};

export const DEFAULT_RECIPIENT_REVISION_LINEAGE: RecipientRevisionLineage = {
  revisionRound: 1,
  parentRevisionId: null,
  compareBaseVersionId: null,
};

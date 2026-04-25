/**
 * Short, deterministic recipient hints — reuses buildNegotiationSuggestions only (no AI).
 */

import type { NegotiationPosture } from "../agreement/negotiationPostures";
import type { NegotiationRiskTier } from "../agreement/negotiationRisk";
import {
  buildNegotiationSuggestions,
  type BuildNegotiationSuggestionsInput,
} from "./negotiationSuggestions";
import {
  clauseFrictionDisplayLabel,
  type ClauseFrictionId,
  type NegotiationPatterns,
} from "./negotiationPatterns";

function shorten(s: string, max: number): string {
  const t = s.trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trim()}…`;
}

const SELECTED_POSTURE_HINT: Record<NegotiationPosture, string> = {
  cooperative: "A cooperative tone often improves acceptance.",
  firm: "A firmer, clearer line can help signal your priorities.",
  protective: "A protective stance may help on risk-heavy terms.",
  fast_close: "Smaller, simpler edits often move agreements to signature faster.",
  founder_friendly: "Practical flexibility for operators may land better.",
  investor_friendly: "Clear structure and reporting language may match expectations here.",
};

function clauseToFrictionField(clause: ClauseFrictionId | null): string[] {
  if (!clause) return [];
  const m: Partial<Record<ClauseFrictionId, string>> = {
    payment_terms: "payment",
    duration: "term",
    scope: "purpose",
    termination: "term",
    confidentiality: "purpose",
    governing_law: "jurisdiction",
    other: "title",
  };
  const k = m[clause];
  return k ? [k] : [];
}

export type RecipientHintsResult = {
  bullets: string[];
  footnote: string | null;
};

/**
 * Max 3 short bullets for recipient UI; reuses negotiationSuggestions internals.
 */
export function buildRecipientNegotiationHints(input: {
  patterns: NegotiationPatterns;
  currentChangedFields: string[];
  currentRiskTier: NegotiationRiskTier | null;
  latestOwnerMemory: BuildNegotiationSuggestionsInput["latestOwnerMemory"];
  selectedPosture: NegotiationPosture;
  topFrictionClause: ClauseFrictionId | null;
  hasTypedInput: boolean;
}): RecipientHintsResult {
  const {
    patterns,
    currentChangedFields,
    currentRiskTier,
    latestOwnerMemory,
    selectedPosture,
    topFrictionClause,
    hasTypedInput,
  } = input;

  const mergedChanged = Array.from(
    new Set([...clauseToFrictionField(topFrictionClause), ...currentChangedFields])
  );

  const full = buildNegotiationSuggestions({
    patterns,
    currentRiskTier,
    currentChangedFields: mergedChanged,
    latestOwnerMemory,
  });

  const bullets: string[] = [];

  if (topFrictionClause && patterns.totalNegotiationEvents < 2) {
    bullets.push(
      shorten(
        `${clauseFrictionDisplayLabel(topFrictionClause)} is often negotiated—expect attention there.`,
        88
      )
    );
  }

  const prefer = new Set(["friction", "fallback", "posture"]);
  for (const s of full.suggestions) {
    if (bullets.length >= 3) break;
    if (!prefer.has(s.type)) continue;
    const line = shorten(s.detail, 88);
    if (line) bullets.push(line);
  }

  if (full.escalationHint === "manual_review" && bullets.length < 3) {
    bullets.push(
      shorten("This direction may need careful review before you push further.", 88)
    );
  }

  if (
    full.suggestedPosture &&
    full.suggestedPosture !== selectedPosture &&
    patterns.totalNegotiationEvents >= 2 &&
    bullets.length < 3
  ) {
    bullets.push(
      shorten(
        "Past steps on this agreement leaned a different tone—your choice still works; adjust if it feels off.",
        88
      )
    );
  }

  if ((hasTypedInput || patterns.totalNegotiationEvents < 2) && bullets.length < 3) {
    bullets.push(SELECTED_POSTURE_HINT[selectedPosture]);
  }

  const seen = new Set<string>();
  const dedup: string[] = [];
  for (const b of bullets) {
    const k = b.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    dedup.push(b);
  }

  const out = dedup.slice(0, 3);
  const footnote =
    patterns.totalNegotiationEvents < 2
      ? "Suggestions will improve as more negotiation history develops."
      : null;

  return { bullets: out, footnote };
}

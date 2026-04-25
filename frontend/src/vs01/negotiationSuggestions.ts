/**
 * V1 deterministic negotiation “next move” hints from local patterns + triage only.
 * No LLM, no network, no embeddings.
 */

import type { NegotiationPatterns } from "./negotiationPatterns";
import type { NegotiationPosture } from "../agreement/negotiationPostures";
import type { NegotiationRiskTier } from "../agreement/negotiationRisk";

export type EscalationHintLevel = "none" | "watch" | "manual_review";

export type NegotiationSuggestionType = "posture" | "fallback" | "friction" | "escalation" | "review";

export type NegotiationSuggestionItem = {
  type: NegotiationSuggestionType;
  label: string;
  detail: string;
};

export type NegotiationSuggestionsResult = {
  suggestedPosture?: NegotiationPosture;
  confidence: "low" | "moderate" | "high";
  reasons: string[];
  suggestions: NegotiationSuggestionItem[];
  escalationHint?: EscalationHintLevel;
};

export type SuggestionContextMeta = {
  suggested_posture?: NegotiationPosture;
  escalation_hint?: EscalationHintLevel;
  based_on_pattern_count?: number;
};

export type BuildNegotiationSuggestionsInput = {
  patterns: NegotiationPatterns;
  currentRiskTier?: NegotiationRiskTier | null;
  /** Fields differing between prior owner snapshot and current recipient proposal. */
  currentChangedFields: string[];
  /** Most recent owner row memory (optional context). */
  latestOwnerMemory?: {
    posture?: NegotiationPosture;
    risk_level?: string;
    changed_fields?: string[];
  } | null;
};

function modRej(fo: { accepted: number; modified: number; rejected: number }) {
  return fo.modified + fo.rejected;
}

/** Aligns with negotiation pattern field keys (see negotiationPatterns). */
function fieldFrictionLabel(fieldKey: string): string {
  const m: Record<string, string> = {
    title: "Title",
    jurisdiction: "Jurisdiction",
    purpose: "Purpose",
    payment: "Payment terms",
    term: "Term",
    due_date: "Due date",
    effective_date: "Effective date",
    parties: "Parties",
  };
  return m[fieldKey] || fieldKey;
}

function hotFieldsFromPatterns(patterns: NegotiationPatterns): Set<string> {
  const s = new Set<string>();
  for (const [field, fo] of Object.entries(patterns.fieldOutcomes)) {
    if (modRej(fo) >= 3) s.add(field);
  }
  return s;
}

function legalDominant(patterns: NegotiationPatterns): boolean {
  const { low, economic, legal } = patterns.riskCounts;
  return legal > low && legal > economic;
}

function postureRankedByAccepts(patterns: NegotiationPatterns) {
  return Object.entries(patterns.postureOutcomes)
    .map(([k, o]) => ({
      key: k as NegotiationPosture,
      o,
      sum: o.accepted + o.modified + o.rejected,
      acc: o.accepted,
    }))
    .filter((x) => x.sum >= 2)
    .sort((a, b) => b.acc - a.acc);
}

/** Fixed templates only. */
export function buildNegotiationSuggestions(input: BuildNegotiationSuggestionsInput): NegotiationSuggestionsResult {
  const { patterns, currentRiskTier, currentChangedFields, latestOwnerMemory } = input;
  const n = patterns.totalNegotiationEvents;
  const reasons: string[] = [];
  const suggestions: NegotiationSuggestionItem[] = [];
  let suggestedPosture: NegotiationPosture | undefined;
  let escalationHint: EscalationHintLevel = "none";
  let confidence: "low" | "moderate" | "high" = "low";

  if (n < 2) {
    return {
      confidence: "low",
      reasons: [],
      suggestions: [],
      escalationHint: "none",
    };
  }

  reasons.push(`Based on ${n} recorded owner negotiation steps with negotiation memory.`);
  confidence = n >= 3 ? "high" : "moderate";

  const legalDom = legalDominant(patterns);
  const hot = hotFieldsFromPatterns(patterns);
  const rejects = patterns.decisionCounts.rejected;
  const accepts = patterns.decisionCounts.accepted;
  const manualTriage = currentRiskTier === "manual_legal_review";
  const economicTriage = currentRiskTier === "economic_impact";

  if (manualTriage || legalDom) {
    suggestedPosture = "protective";
    reasons.push("Legal-review risk dominates history or current triage.");
    suggestions.push({
      type: "posture",
      label: "Recommended posture",
      detail:
        "This pattern trends toward legal-review issues. A protective posture tends to fit.",
    });
  }

  if (!suggestedPosture && currentChangedFields.length > 0 && !legalDom) {
    for (const f of currentChangedFields) {
      const fo = patterns.fieldOutcomes[f];
      if (!fo) continue;
      const t = fo.accepted + fo.modified + fo.rejected;
      if (t < 2) continue;
      if (fo.accepted > fo.modified + fo.rejected) {
        suggestedPosture = "cooperative";
        suggestions.push({
          type: "posture",
          label: "Recommended posture",
          detail: `This kind of change has landed better with a cooperative posture${currentChangedFields.length === 1 ? ` (${fieldFrictionLabel(f)})` : ""}.`,
        });
        break;
      }
    }
  }

  const ranked = postureRankedByAccepts(patterns);
  if (!suggestedPosture && ranked.length > 0) {
    const top = ranked[0];
    const second = ranked[1];
    const leadBy2 = !second || top.acc >= second.acc + 2;

    if (top.key === "cooperative" && leadBy2 && top.acc > 0) {
      suggestedPosture = "cooperative";
      suggestions.push({
        type: "posture",
        label: "Recommended posture",
        detail: "Cooperative posture has produced more accepted outcomes in this history.",
      });
    } else if (top.key === "firm" && !legalDom && top.o.modified + top.o.accepted > top.o.rejected * 2) {
      suggestedPosture = "firm";
      suggestions.push({
        type: "posture",
        label: "Recommended posture",
        detail: "Firm posture has produced revisions rather than dead ends here.",
      });
    } else if (top.key === "protective" && !suggestedPosture) {
      suggestedPosture = "protective";
      suggestions.push({
        type: "posture",
        label: "Recommended posture",
        detail: "Protective posture matches the strongest past outcome mix.",
      });
    }
  }

  if (!suggestedPosture && economicTriage && !legalDom) {
    suggestedPosture = "firm";
    suggestions.push({
      type: "posture",
      label: "Recommended posture",
      detail: "Economic triage on this change: firmer framing often helps tradeoffs.",
    });
  }

  const frictionField = currentChangedFields.find((f) => hot.has(f));
  if (frictionField) {
    suggestions.push({
      type: "friction",
      label: "Watch item",
      detail: `${fieldFrictionLabel(frictionField)} is a repeat friction point.`,
    });
    suggestions.push({
      type: "fallback",
      label: "Offer fallback",
      detail: "Consider offering a fallback before pushing harder.",
    });
    reasons.push(`Current proposal touches a high-friction field (${frictionField}).`);
  }

  if (rejects >= 3 && rejects > accepts) {
    escalationHint = "manual_review";
    suggestions.push({
      type: "escalation",
      label: "Manual review likely",
      detail: "Repeated rejections outnumber accepts. Pause before pushing harder.",
    });
  } else if (manualTriage || legalDom) {
    escalationHint = "manual_review";
    suggestions.push({
      type: "review",
      label: "Manual review likely",
      detail: "Treat as legal-review weight. Not legal advice—verify with your process.",
    });
  } else if (economicTriage || frictionField !== undefined) {
    escalationHint = "watch";
    suggestions.push({
      type: "review",
      label: "Watch",
      detail: "Monitor economics and counterparty reaction; avoid a one-shot hard line if this is fragile.",
    });
  }

  const lowRiskLead =
    patterns.riskCounts.low > patterns.riskCounts.economic &&
    patterns.riskCounts.low > patterns.riskCounts.legal;
  if (
    n >= 3 &&
    lowRiskLead &&
    accepts >= rejects &&
    hot.size === 0 &&
    currentRiskTier === "low_risk"
  ) {
    suggestions.push({
      type: "review",
      label: "Good candidate to close quickly",
      detail: "History suggests this is low-friction.",
    });
  }

  if (latestOwnerMemory?.risk_level === "legal" && escalationHint === "none") {
    escalationHint = "watch";
  }

  const seen = new Set<string>();
  const deduped: NegotiationSuggestionItem[] = [];
  for (const s of suggestions) {
    const k = `${s.type}|${s.label}|${s.detail}`;
    if (seen.has(k)) continue;
    seen.add(k);
    deduped.push(s);
  }

  return {
    suggestedPosture,
    confidence,
    reasons,
    suggestions: deduped.slice(0, 5),
    escalationHint,
  };
}

export function toSuggestionContextMeta(
  result: NegotiationSuggestionsResult,
  patternEventCount: number
): SuggestionContextMeta | undefined {
  if (patternEventCount < 2) return undefined;
  return {
    suggested_posture: result.suggestedPosture,
    escalation_hint: result.escalationHint ?? "none",
    based_on_pattern_count: patternEventCount,
  };
}

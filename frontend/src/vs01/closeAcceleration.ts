/**
 * Deterministic close-acceleration hints from existing local analyses only.
 * No LLM. Human-in-the-loop only.
 */

import type { NegotiationPosture } from "../agreement/negotiationPostures";
import type { NegotiationRiskTier } from "../agreement/negotiationRisk";
import type { CloseAnalysis } from "./closeRecommendation";
import type { ConvergenceAnalysis } from "./negotiationConvergence";
import {
  clauseFrictionDisplayLabel,
  mapChangedFieldToClause,
  type ClauseFrictionId,
  type NegotiationPatterns,
} from "./negotiationPatterns";
import type { NegotiationSuggestionsResult } from "./negotiationSuggestions";

export type CloseAccelerationSuggestionType =
  | "focus_clause"
  | "offer_fallback"
  | "soften_posture"
  | "tighten_scope"
  | "escalate_review"
  | "close_now";

export type CloseAccelerationSuggestion = {
  id: string;
  type: CloseAccelerationSuggestionType;
  label: string;
  detail: string;
  strength: "light" | "moderate" | "strong";
};

export type CloseAccelerationAnalysis = {
  suggestions: CloseAccelerationSuggestion[];
  primaryFocus?: string;
};

const PRI = {
  close_now: 1,
  focus_clause: 2,
  offer_fallback: 3,
  escalate_review: 4,
  soften_posture: 5,
  tighten_scope: 6,
} as const;

const HEAVY_REJECTS = 3;
const ACCEPT_WEAK = 0.5;
const DOMINANT_SCORE_LEAD = 2;

function legalDominant(patterns: NegotiationPatterns): boolean {
  const { low, economic, legal } = patterns.riskCounts;
  return legal > low && legal > economic;
}

function heavyRejectClauseLabels(patterns: NegotiationPatterns): string[] {
  const byClause = new Map<ClauseFrictionId, number>();
  for (const [field, fo] of Object.entries(patterns.fieldOutcomes)) {
    const c = mapChangedFieldToClause(field);
    byClause.set(c, (byClause.get(c) ?? 0) + fo.rejected);
  }
  const labels = new Set<string>();
  for (const [c, rej] of byClause.entries()) {
    if (rej >= HEAVY_REJECTS) labels.add(clauseFrictionDisplayLabel(c));
  }
  return [...labels];
}

function dominantPosture(patterns: NegotiationPatterns): NegotiationPosture | undefined {
  const ent = Object.entries(patterns.postureCounts).sort((a, b) => b[1] - a[1]);
  const k = ent[0]?.[0];
  return k ? (k as NegotiationPosture) : undefined;
}

function frictionStrength(
  severity: "low" | "moderate" | "high" | undefined
): "light" | "moderate" | "strong" {
  if (severity === "high") return "strong";
  if (severity === "moderate") return "moderate";
  return "light";
}

export type BuildCloseAccelerationInput = {
  closeAnalysis: CloseAnalysis;
  convergence: ConvergenceAnalysis;
  patterns: NegotiationPatterns;
  suggestions: NegotiationSuggestionsResult;
  currentRiskTier?: NegotiationRiskTier | null;
  /** Negotiation assistant posture control (UI state). */
  selectedPosture?: NegotiationPosture;
};

type Cand = { suggestion: CloseAccelerationSuggestion; priority: number };

export function buildCloseAcceleration(input: BuildCloseAccelerationInput): CloseAccelerationAnalysis {
  const { closeAnalysis, convergence, patterns, suggestions, currentRiskTier, selectedPosture } = input;

  if (patterns.totalNegotiationEvents < 2) {
    return { suggestions: [], primaryFocus: undefined };
  }

  const acc = convergence.metrics.acceptanceRatio;
  const unresolvedN = convergence.metrics.unresolvedClauses.length;
  const top = patterns.topFrictionClauses[0];
  const second = patterns.topFrictionClauses[1];
  const topLabel = top ? clauseFrictionDisplayLabel(top.clause) : undefined;
  const legalDom = legalDominant(patterns);
  const heavyRejects = heavyRejectClauseLabels(patterns);
  const dom = dominantPosture(patterns);
  const postureForSoften = selectedPosture ?? dom;
  const manualLegal = currentRiskTier === "manual_legal_review";

  const candidates: Cand[] = [];

  const oneClauseDominates =
    top &&
    (!second ||
      top.score >= second.score + DOMINANT_SCORE_LEAD ||
      (second.score > 0 && top.score / second.score >= 1.35));

  /* 6 — close_now */
  const minorBlockers =
    unresolvedN <= 1 &&
    (!closeAnalysis.blockers || closeAnalysis.blockers.length === 0) &&
    heavyRejects.length === 0;
  if (closeAnalysis.recommendation === "ready_to_close" && minorBlockers) {
    candidates.push({
      priority: PRI.close_now,
      suggestion: {
        id: "accel_close_now",
        type: "close_now",
        label: "Close now",
        detail: "The agreement appears stable enough to finalize and send to signing.",
        strength: closeAnalysis.confidence === "high" ? "strong" : "moderate",
      },
    });
  }

  /* 4 — escalate_review */
  const needsEscalate =
    closeAnalysis.recommendation === "pause_or_escalate" ||
    legalDom ||
    manualLegal ||
    suggestions.escalationHint === "manual_review" ||
    heavyRejects.length > 0;
  if (needsEscalate) {
    candidates.push({
      priority: PRI.escalate_review,
      suggestion: {
        id: "accel_escalate",
        type: "escalate_review",
        label: "Escalate before pushing further",
        detail: "This stretch looks structurally sensitive. Manual review may save time.",
        strength: heavyRejects.length > 0 || legalDom ? "strong" : "moderate",
      },
    });
  }

  /* 2 — focus_clause */
  if (top && top.score > 0 && oneClauseDominates && closeAnalysis.recommendation !== "ready_to_close") {
    candidates.push({
      priority: PRI.focus_clause,
      suggestion: {
        id: `accel_focus_${top.clause}`,
        type: "focus_clause",
        label: `Focus on ${topLabel}`,
        detail: "Most negotiation is concentrated here. Resolving this may unblock closing.",
        strength: frictionStrength(top.severity),
      },
    });
  }

  /* 3 — offer_fallback */
  if (top) {
    const row = patterns.clauseFriction[top.clause];
    const pushback = row ? row.modified + row.rejected >= 2 : top.severity !== "low";
    if (pushback && top.score > 0 && closeAnalysis.recommendation !== "ready_to_close") {
      candidates.push({
        priority: PRI.offer_fallback,
        suggestion: {
          id: `accel_fallback_${top.clause}`,
          type: "offer_fallback",
          label: "Offer a fallback position",
          detail: "This clause shows repeated pushback. A narrower compromise may help close.",
          strength: top.severity === "high" ? "strong" : "moderate",
        },
      });
    }
  }

  /* 5 — soften_posture */
  const firmish =
    postureForSoften === "firm" ||
    postureForSoften === "protective" ||
    dom === "firm" ||
    dom === "protective";
  if (
    firmish &&
    acc < ACCEPT_WEAK &&
    !legalDom &&
    !manualLegal &&
    closeAnalysis.recommendation !== "ready_to_close" &&
    !needsEscalate
  ) {
    candidates.push({
      priority: PRI.soften_posture,
      suggestion: {
        id: "accel_soften_posture",
        type: "soften_posture",
        label: "Try a more cooperative close posture",
        detail: "A softer response may reduce friction and improve acceptance.",
        strength: acc < 0.35 ? "moderate" : "light",
      },
    });
  }

  /* 6 — tighten_scope (economics lead, scope also in play) */
  const economicsPrimary = top && (top.clause === "payment_terms" || top.clause === "duration");
  const scopeTouched = (patterns.clauseFriction["scope"]?.totalTouches ?? 0) > 0;
  const founderOrProtect =
    (patterns.postureCounts["founder_friendly"] ?? 0) >= 2 ||
    (patterns.postureCounts["protective"] ?? 0) >= 2 ||
    dom === "founder_friendly" ||
    dom === "protective";
  if (
    economicsPrimary &&
    scopeTouched &&
    founderOrProtect &&
    !legalDom &&
    closeAnalysis.recommendation !== "ready_to_close" &&
    !needsEscalate
  ) {
    candidates.push({
      priority: PRI.tighten_scope,
      suggestion: {
        id: "accel_tighten_scope",
        type: "tighten_scope",
        label: "Trade scope instead of price",
        detail: "Consider narrowing obligations rather than conceding on core economics.",
        strength: top.severity === "high" ? "strong" : "moderate",
      },
    });
  }

  candidates.sort((a, b) => a.priority - b.priority);

  const hasClose = candidates.some((c) => c.suggestion.type === "close_now");
  const hasEscalate = candidates.some((c) => c.suggestion.type === "escalate_review");

  const seen = new Set<CloseAccelerationSuggestionType>();
  const ordered: CloseAccelerationSuggestion[] = [];
  for (const c of candidates) {
    if (seen.has(c.suggestion.type)) continue;
    seen.add(c.suggestion.type);
    ordered.push(c.suggestion);
  }

  let picked: CloseAccelerationSuggestion[];
  if (hasClose) {
    picked = ordered.filter((s) => s.type === "close_now");
  } else if (hasEscalate) {
    const allow = new Set<CloseAccelerationSuggestionType>([
      "escalate_review",
      "focus_clause",
      "offer_fallback",
    ]);
    picked = ordered.filter((s) => allow.has(s.type));
  } else {
    picked = [...ordered];
  }

  const MAX = 4;
  picked = picked.slice(0, MAX);
  if (picked.length < 2 && !hasClose && ordered.length >= 2) {
    for (const s of ordered) {
      if (picked.length >= 2) break;
      if (!picked.some((p) => p.type === s.type)) picked.push(s);
    }
    picked = picked.slice(0, MAX);
  }

  const primaryFocus =
    topLabel ??
    closeAnalysis.blockers?.[0] ??
    (heavyRejects[0] ? heavyRejects[0] : undefined);

  return { suggestions: picked, primaryFocus };
}

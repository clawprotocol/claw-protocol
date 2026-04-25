/**
 * Deterministic close guidance from convergence, patterns, suggestions, and friction.
 * No LLM.
 */

import type { NegotiationRiskTier } from "../agreement/negotiationRisk";
import type { ConvergenceAnalysis } from "./negotiationConvergence";
import {
  clauseFrictionDisplayLabel,
  mapChangedFieldToClause,
  type ClauseFrictionId,
  type NegotiationPatterns,
} from "./negotiationPatterns";
import type { NegotiationSuggestionsResult } from "./negotiationSuggestions";

export type CloseRecommendation =
  | "ready_to_close"
  | "resolve_issues"
  | "continue_negotiation"
  | "pause_or_escalate";

export type CloseAnalysis = {
  recommendation: CloseRecommendation;
  confidence: "low" | "moderate" | "high";
  reasons: string[];
  blockers?: string[];
  nextActions: string[];
};

const ACCEPT_FOR_CLOSE = 0.6;
const MIXED_LOW = 0.3;
const MIXED_HIGH = 0.6;
const HEAVY_REJECTS_ON_CLAUSE = 3;

function legalDominant(patterns: NegotiationPatterns): boolean {
  const { low, economic, legal } = patterns.riskCounts;
  return legal > low && legal > economic;
}

/** Sum rejections per canonical clause across raw field outcomes. */
function clausesWithHeavyRejections(patterns: NegotiationPatterns): string[] {
  const byClause = new Map<ClauseFrictionId, number>();
  for (const [field, fo] of Object.entries(patterns.fieldOutcomes)) {
    const c = mapChangedFieldToClause(field);
    byClause.set(c, (byClause.get(c) ?? 0) + fo.rejected);
  }
  const labels = new Set<string>();
  for (const [c, rej] of byClause.entries()) {
    if (rej >= HEAVY_REJECTS_ON_CLAUSE) labels.add(clauseFrictionDisplayLabel(c));
  }
  return [...labels].sort();
}

function dedupeStrings(xs: string[], max: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of xs) {
    const t = s.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

function highLegalRisk(
  currentRiskTier: NegotiationRiskTier | null | undefined,
  patterns: NegotiationPatterns
): boolean {
  return currentRiskTier === "manual_legal_review" || legalDominant(patterns);
}

/** User-facing primary line (Part 5). */
export function closeRecommendationHeadline(recommendation: CloseRecommendation): string {
  switch (recommendation) {
    case "ready_to_close":
      return "You are ready to close";
    case "resolve_issues":
      return "Resolve these before signing";
    case "continue_negotiation":
      return "Continue reviewing";
    case "pause_or_escalate":
      return "Pause and review";
  }
}

export type BuildCloseAnalysisInput = {
  patterns: NegotiationPatterns;
  convergence: ConvergenceAnalysis;
  suggestions: NegotiationSuggestionsResult;
  currentRiskTier?: NegotiationRiskTier | null;
};

export function buildCloseAnalysis(input: BuildCloseAnalysisInput): CloseAnalysis {
  const { patterns, convergence, suggestions, currentRiskTier } = input;
  const dc = patterns.decisionCounts;
  const modRej = dc.modified + dc.rejected;
  const acc = convergence.metrics.acceptanceRatio;
  const unresolved = convergence.metrics.unresolvedClauses;
  const nUnresolved = unresolved.length;

  if (patterns.totalNegotiationEvents < 2) {
    return {
      recommendation: "continue_negotiation",
      confidence: "low",
      reasons: ["More review history is needed to recommend a next step."],
      nextActions: ["Keep recording owner responses on this agreement.", "Check back after another review round."],
    };
  }

  const heavyRejectClauses = clausesWithHeavyRejections(patterns);
  const pauseLegal = highLegalRisk(currentRiskTier, patterns);
  const pauseDiverging = convergence.state === "diverging";
  const pauseHeavyReject = heavyRejectClauses.length > 0;
  const pauseManualEscalation = suggestions.escalationHint === "manual_review";

  const pause_or_escalate =
    pauseDiverging || pauseLegal || pauseHeavyReject || pauseManualEscalation;

  const hasHighFriction = patterns.topFrictionClauses.some((t) => t.severity === "high");
  const hasModHighFriction = patterns.topFrictionClauses.some((t) => t.severity !== "low");

  const readyBase =
    (convergence.state === "converging" || convergence.state === "stable") &&
    acc > ACCEPT_FOR_CLOSE &&
    nUnresolved <= 1 &&
    !pauseLegal &&
    !hasHighFriction &&
    heavyRejectClauses.length === 0;

  const ready_to_close = readyBase && !pause_or_escalate && convergence.state !== "diverging";

  const resolve_issues =
    !pause_or_escalate &&
    !ready_to_close &&
    (convergence.state === "stable" || convergence.state === "active") &&
    nUnresolved >= 1 &&
    nUnresolved <= 2 &&
    hasModHighFriction;

  const continue_negotiation_plain =
    !pause_or_escalate &&
    !ready_to_close &&
    !resolve_issues &&
    convergence.state === "active" &&
    acc >= MIXED_LOW &&
    acc <= MIXED_HIGH &&
    modRej >= 2;

  let recommendation: CloseRecommendation;
  if (pause_or_escalate) recommendation = "pause_or_escalate";
  else if (ready_to_close) recommendation = "ready_to_close";
  else if (resolve_issues) recommendation = "resolve_issues";
  else if (continue_negotiation_plain) recommendation = "continue_negotiation";
  else if (convergence.state === "active" || modRej >= 2) recommendation = "continue_negotiation";
  else if (nUnresolved >= 1 || hasModHighFriction) recommendation = "resolve_issues";
  else if (readyBase) recommendation = "ready_to_close";
  else recommendation = "continue_negotiation";

  const conflicting =
    (convergence.state === "converging" || convergence.state === "stable") &&
    (pauseLegal || heavyRejectClauses.length > 0);

  let confidence: "low" | "moderate" | "high" = "moderate";
  if (patterns.totalNegotiationEvents < 4 || conflicting) confidence = "low";
  else if (recommendation === "pause_or_escalate" && (pauseDiverging || pauseHeavyReject || pauseLegal)) {
    confidence = patterns.totalNegotiationEvents >= 6 ? "high" : "moderate";
  } else if (recommendation === "ready_to_close" && convergence.state === "converging" && !conflicting) {
    confidence = convergence.confidence === "high" ? "high" : "moderate";
  } else if (recommendation === "ready_to_close") {
    confidence = "moderate";
  } else if (recommendation === "continue_negotiation" && modRej < 2) {
    confidence = "low";
  }

  const reasons: string[] = [];
  const nextActions: string[] = [];
  let blockers: string[] | undefined;

  if (recommendation === "pause_or_escalate") {
    if (pauseDiverging) reasons.push("Agreement complexity looks like it is increasing.");
    if (pauseLegal) reasons.push("Legal-risk items are prominent in review history.");
    if (pauseHeavyReject)
      reasons.push("The same topics show repeated disagreement in recorded steps.");
    if (reasons.length === 0) reasons.push("Signals point to slowing down and reviewing before the next push.");
    nextActions.push("Consider manual legal review if your process requires it.");
    nextActions.push("Re-evaluate core terms with your counterpart before continuing.");
    blockers = dedupeStrings([...heavyRejectClauses, ...unresolved], 5).filter(Boolean);
    if (blockers.length === 0 && patterns.topFrictionClauses[0]) {
      blockers = [clauseFrictionDisplayLabel(patterns.topFrictionClauses[0].clause)];
    }
  } else if (recommendation === "ready_to_close") {
    reasons.push("Agreement structure has stabilized in recent revisions.");
    if (acc > ACCEPT_FOR_CLOSE) reasons.push("Recent owner steps mostly accepted counterpart changes.");
    reasons.push("No major sticking points in local history.");
    nextActions.push("Finalize agreement in the workspace.");
    nextActions.push("Send for signing when both sides match the latest draft.");
  } else if (recommendation === "resolve_issues") {
    if (patterns.topFrictionClauses[0]) {
      reasons.push(
        `Most edits are concentrated on ${clauseFrictionDisplayLabel(patterns.topFrictionClauses[0].clause)}.`
      );
    } else {
      reasons.push("A few topics still show repeated edits or pushback.");
    }
    if (nUnresolved >= 1) reasons.push("One or more clauses still need a clear landing position.");
    blockers = unresolved.length > 0 ? [...unresolved] : [];
    if (blockers.length === 0 && patterns.topFrictionClauses.length > 0) {
      blockers = patterns.topFrictionClauses
        .filter((t) => t.severity !== "low")
        .slice(0, 3)
        .map((t) => clauseFrictionDisplayLabel(t.clause));
    }
    const focus =
      blockers[0] ??
      (patterns.topFrictionClauses[0]
        ? clauseFrictionDisplayLabel(patterns.topFrictionClauses[0].clause)
        : "Open points");
    nextActions.push(`Resolve ${focus.toLowerCase()} explicitly in your next response.`);
    nextActions.push("Clarify any open tradeoffs before you finalize.");
    if (patterns.topFrictionClauses[1]) {
      nextActions.push(
        `Then address ${clauseFrictionDisplayLabel(patterns.topFrictionClauses[1].clause).toLowerCase()} if it remains open.`
      );
    }
  } else {
    reasons.push("Changes are still actively being reviewed.");
    if (modRej >= 2) reasons.push("Multiple revisions or rejects appear in recent history.");
    if (patterns.topPatterns.length > 0) reasons.push(patterns.topPatterns[0]!.detail);
    nextActions.push("Propose revised terms that narrow open points.");
    nextActions.push("Adjust review posture if the tone no longer fits.");
  }

  return {
    recommendation,
    confidence,
    reasons: dedupeStrings(reasons, 3),
    blockers: blockers && blockers.length > 0 ? dedupeStrings(blockers, 5) : undefined,
    nextActions: dedupeStrings(nextActions, 3),
  };
}

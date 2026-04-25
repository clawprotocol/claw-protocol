/**
 * Deterministic negotiation convergence from local version history + friction only.
 * No LLM, no network.
 */

import type { AgreementVersionRecord } from "../agreement/agreementVersionStore";
import { detectChangedSnapshotFields } from "../agreement/negotiationMemory";
import {
  clauseFrictionDisplayLabel,
  computeNegotiationPatterns,
  mapChangedFieldToClause,
  type ClauseFrictionId,
} from "./negotiationPatterns";

export type ConvergenceState = "converging" | "stable" | "active" | "diverging";

export type ConvergenceAnalysis = {
  state: ConvergenceState;
  confidence: "low" | "moderate" | "high";
  signals: string[];
  metrics: {
    recentChangeRate: number;
    repeatedEdits: number;
    unresolvedClauses: string[];
    acceptanceRatio: number;
  };
};

const RECENT_EDGE_WINDOW = 3;
/** Deltas: “recent” avg vs “earlier” avg (field counts per revision). */
const TREND_UP_DELTA = 0.85;
const TREND_DOWN_RATIO = 0.72;
/** Low churn: avg fields changed per recent edge. */
const LOW_CHURN_MAX = 2.25;
const ACCEPT_HIGH = 0.6;
const ACCEPT_LOW = 0.3;

function clausesOnEdge(prev: AgreementVersionRecord, next: AgreementVersionRecord): Set<ClauseFrictionId> {
  const fields = detectChangedSnapshotFields(prev.snapshot, next.snapshot);
  const clauses = new Set<ClauseFrictionId>();
  for (const f of fields) clauses.add(mapChangedFieldToClause(f));
  return clauses;
}

/** Plain-language headline for the primary status line (Part 7). */
export function convergenceProgressHeadline(state: ConvergenceState): string {
  switch (state) {
    case "converging":
      return "Nearing agreement";
    case "stable":
      return "Changes are slowing down";
    case "active":
      return "Still going back and forth";
    case "diverging":
      return "More open points than before";
  }
}

function confidenceFrom(
  totalDecisions: number,
  conflictingSignals: boolean
): "low" | "moderate" | "high" {
  if (conflictingSignals) return totalDecisions >= 5 ? "moderate" : "low";
  if (totalDecisions >= 6) return "high";
  if (totalDecisions >= 3) return "moderate";
  return "low";
}

function dedupeCapSignals(lines: string[], max: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of lines) {
    const t = s.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

export function analyzeNegotiationConvergence(versions: AgreementVersionRecord[]): ConvergenceAnalysis {
  const patterns = computeNegotiationPatterns(versions);
  const dc = patterns.decisionCounts;
  const totalD = dc.accepted + dc.modified + dc.rejected;
  const acceptanceRatio = totalD > 0 ? dc.accepted / totalD : 0;

  if (patterns.totalNegotiationEvents < 2) {
    return {
      state: "stable",
      confidence: "low",
      signals: ["Not enough history yet to assess progress"],
      metrics: {
        recentChangeRate: 0,
        repeatedEdits: 0,
        unresolvedClauses: [],
        acceptanceRatio,
      },
    };
  }

  const edgeCounts: number[] = [];
  for (let i = 1; i < versions.length; i++) {
    edgeCounts.push(
      detectChangedSnapshotFields(versions[i - 1]!.snapshot, versions[i]!.snapshot).length
    );
  }

  const k = Math.min(RECENT_EDGE_WINDOW, edgeCounts.length);
  const recentSlice = edgeCounts.slice(-k);
  const recentChangeRate =
    recentSlice.length > 0 ? recentSlice.reduce((a, b) => a + b, 0) / recentSlice.length : 0;

  const earlierSlice = edgeCounts.slice(0, Math.max(0, edgeCounts.length - k));
  const earlierAvg =
    earlierSlice.length > 0
      ? earlierSlice.reduce((a, b) => a + b, 0) / earlierSlice.length
      : recentChangeRate;

  let changeTrend: "up" | "down" | "flat" = "flat";
  if (earlierSlice.length > 0 && edgeCounts.length >= 2) {
    if (recentChangeRate > earlierAvg + TREND_UP_DELTA) changeTrend = "up";
    else if (
      recentChangeRate < earlierAvg - TREND_UP_DELTA ||
      (earlierAvg > 0 && recentChangeRate < earlierAvg * TREND_DOWN_RATIO)
    ) {
      changeTrend = "down";
    }
  } else if (edgeCounts.length >= 2) {
    const first = edgeCounts[0] ?? 0;
    const last = edgeCounts[edgeCounts.length - 1] ?? 0;
    if (last > first + 1) changeTrend = "up";
    else if (last < first - 1) changeTrend = "down";
  }

  /* Clauses appearing on 2+ of the last 3 snapshot transitions */
  const lastEdgeStarts = Math.max(1, versions.length - RECENT_EDGE_WINDOW);
  const clauseHits = new Map<ClauseFrictionId, number>();
  for (let i = lastEdgeStarts; i < versions.length; i++) {
    const cl = clausesOnEdge(versions[i - 1]!, versions[i]!);
    for (const c of cl) clauseHits.set(c, (clauseHits.get(c) ?? 0) + 1);
  }
  let repeatedEdits = 0;
  for (const n of clauseHits.values()) {
    if (n >= 2) repeatedEdits += 1;
  }

  const recentClausesUnion = new Set<ClauseFrictionId>();
  for (let i = Math.max(1, versions.length - 2); i < versions.length; i++) {
    const cl = clausesOnEdge(versions[i - 1]!, versions[i]!);
    cl.forEach((c) => recentClausesUnion.add(c));
  }

  const unresolvedClauses: string[] = [];
  for (const row of patterns.topFrictionClauses) {
    if (row.severity === "low") continue;
    if (recentClausesUnion.has(row.clause)) {
      unresolvedClauses.push(clauseFrictionDisplayLabel(row.clause));
    }
  }

  const diverging =
    changeTrend === "up" || (acceptanceRatio < ACCEPT_LOW && repeatedEdits >= 1 && totalD >= 2);

  const converging =
    (changeTrend === "down" ||
      (changeTrend === "flat" && recentChangeRate <= LOW_CHURN_MAX)) &&
    acceptanceRatio > ACCEPT_HIGH &&
    repeatedEdits === 0 &&
    unresolvedClauses.length <= 1;

  const stableHint =
    changeTrend !== "up" &&
    recentChangeRate <= LOW_CHURN_MAX &&
    acceptanceRatio >= 0.35 &&
    repeatedEdits === 0 &&
    unresolvedClauses.length <= 2;

  let state: ConvergenceState;
  if (diverging) state = "diverging";
  else if (converging) state = "converging";
  else if (stableHint) state = "stable";
  else state = "active";

  /* Stable + very high acceptance and no open friction reads closer to “done”. */
  if (
    state === "stable" &&
    acceptanceRatio > ACCEPT_HIGH &&
    recentChangeRate <= LOW_CHURN_MAX &&
    repeatedEdits === 0 &&
    unresolvedClauses.length <= 1
  ) {
    state = "converging";
  }

  const conflictingSignals =
    (changeTrend === "up" && acceptanceRatio > 0.55) ||
    (changeTrend === "down" && acceptanceRatio < 0.35 && totalD >= 3);

  const signalsRaw: string[] = [];
  if (changeTrend === "down") signalsRaw.push("Fewer fields are changing with each revision.");
  if (changeTrend === "up") signalsRaw.push("Recent revisions are touching more fields than before.");
  if (changeTrend === "flat" && recentChangeRate <= LOW_CHURN_MAX) {
    signalsRaw.push("Agreement structure is stabilizing.");
  }
  if (acceptanceRatio >= ACCEPT_HIGH && totalD >= 2) {
    signalsRaw.push("Most recent owner review steps accepted the other side’s changes.");
  }
  if (acceptanceRatio < ACCEPT_LOW && totalD >= 2) {
    signalsRaw.push("Acceptance has been uncommon in recorded review history.");
  }
  if (repeatedEdits >= 1) {
    signalsRaw.push("Repeated edits on the same topics suggest some terms are still open.");
  }
  const topFriction = patterns.topFrictionClauses[0];
  if (topFriction && topFriction.severity !== "low") {
    signalsRaw.push(`Most edits are concentrated on ${clauseFrictionDisplayLabel(topFriction.clause)}.`);
  }
  if (unresolvedClauses.length > 0) {
    signalsRaw.push(`Needs resolution on: ${unresolvedClauses.slice(0, 2).join(", ")}.`);
  }

  const signals = dedupeCapSignals(signalsRaw, 4);
  const confidence = confidenceFrom(totalD, conflictingSignals);

  return {
    state,
    confidence,
    signals: signals.length > 0 ? signals : ["Signals are mixed; treat this as directional context only."],
    metrics: {
      recentChangeRate,
      repeatedEdits,
      unresolvedClauses,
      acceptanceRatio,
    },
  };
}

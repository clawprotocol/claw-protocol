/**
 * Deterministic negotiation memory attached to version records (structured only; no AI).
 */

import type { NegotiationPosture } from "./negotiationPostures";
import type { NegotiationRiskTier } from "./negotiationRisk";

/** Shape-compatible with AgreementSnapshot; kept local to avoid import cycles. */
export type NegotiationMemorySnapshot = {
  title: string;
  jurisdiction: string;
  parties: unknown[];
  purpose: string;
  payment_terms: string;
  duration: string | null | undefined;
  due_date: string | null | undefined;
  effective_date: string | null | undefined;
};

export type NegotiationMemoryRiskLevel = "low" | "economic" | "legal";

export type NegotiationMemoryDecision = "accepted" | "rejected" | "modified";

export type NegotiationMemory = {
  intent: string;
  posture: NegotiationPosture;
  risk_level?: NegotiationMemoryRiskLevel;
  decision?: NegotiationMemoryDecision;
  changed_fields?: string[];
  summary?: string;
  timestamp: string;
};

export function mapRiskTierToMemoryLevel(
  tier: NegotiationRiskTier | null | undefined
): NegotiationMemoryRiskLevel | undefined {
  if (!tier) return undefined;
  if (tier === "low_risk") return "low";
  if (tier === "economic_impact") return "economic";
  return "legal";
}

export function decisionFromResponseType(
  rt: string | undefined
): NegotiationMemoryDecision {
  if (rt === "accept") return "accepted";
  if (rt === "reject") return "rejected";
  return "modified";
}

function norm(s: unknown): string {
  return String(s ?? "").trim();
}

export function detectChangedSnapshotFields(
  prior: NegotiationMemorySnapshot | null,
  next: NegotiationMemorySnapshot
): string[] {
  if (!prior) return [];
  const out: string[] = [];
  if (norm(prior.title) !== norm(next.title)) out.push("title");
  if (norm(prior.jurisdiction) !== norm(next.jurisdiction)) out.push("jurisdiction");
  if (norm(prior.purpose) !== norm(next.purpose)) out.push("purpose");
  if (norm(prior.payment_terms) !== norm(next.payment_terms)) out.push("payment");
  if (norm(prior.duration) !== norm(next.duration)) out.push("term");
  if (norm(prior.due_date) !== norm(next.due_date)) out.push("due_date");
  if (norm(prior.effective_date) !== norm(next.effective_date)) out.push("effective_date");
  const pj = JSON.stringify(prior.parties ?? []);
  const nj = JSON.stringify(next.parties ?? []);
  if (pj !== nj) out.push("parties");
  return out;
}

function truncateIntent(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function oneLineSummary(decision: NegotiationMemoryDecision, intent: string): string {
  const bit = truncateIntent(intent, 120);
  switch (decision) {
    case "accepted":
      return `Accepted: ${bit}`;
    case "rejected":
      return `Rejected: ${bit}`;
    default:
      return `Modified: ${bit}`;
  }
}

export function buildNegotiationMemory(args: {
  intent: string;
  posture: NegotiationPosture;
  riskTier: NegotiationRiskTier | null | undefined;
  decision: NegotiationMemoryDecision;
  priorSnapshot: NegotiationMemorySnapshot | null;
  nextSnapshot: NegotiationMemorySnapshot;
  timestampIso?: string;
}): NegotiationMemory {
  const changed = detectChangedSnapshotFields(args.priorSnapshot, args.nextSnapshot);
  return {
    intent: args.intent.trim().slice(0, 4000),
    posture: args.posture,
    risk_level: mapRiskTierToMemoryLevel(args.riskTier),
    decision: args.decision,
    changed_fields: changed.length > 0 ? changed : undefined,
    summary: oneLineSummary(args.decision, args.intent),
    timestamp: args.timestampIso ?? new Date().toISOString(),
  };
}

export function memoryRiskLabel(level: NegotiationMemoryRiskLevel | undefined): string {
  if (!level) return "";
  const m: Record<NegotiationMemoryRiskLevel, string> = {
    low: "Low risk",
    economic: "Economic",
    legal: "Legal review",
  };
  return m[level];
}

export function memoryDecisionLabel(d: NegotiationMemoryDecision | undefined): string {
  if (!d) return "";
  const m: Record<NegotiationMemoryDecision, string> = {
    accepted: "Accepted",
    rejected: "Rejected",
    modified: "Modified",
  };
  return m[d];
}

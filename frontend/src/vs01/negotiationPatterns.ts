/**
 * V1 deterministic negotiation pattern stats from local version + negotiation_memory only.
 * No AI, no network, no embeddings.
 */

import type { AgreementVersionRecord } from "../agreement/agreementVersionStore";
import type { NegotiationMemoryDecision } from "../agreement/negotiationMemory";
import type { NegotiationPosture } from "../agreement/negotiationPostures";

export type NegotiationPatternStrength = "light" | "moderate" | "strong";

export type NegotiationPatternsTopPattern = {
  label: string;
  detail: string;
  strength: NegotiationPatternStrength;
};

/** Canonical clause buckets for friction (mapped from negotiation_memory changed_fields). */
export type ClauseFrictionId =
  | "payment_terms"
  | "duration"
  | "scope"
  | "termination"
  | "confidentiality"
  | "governing_law"
  | "other";

export type ClauseFrictionRow = {
  totalTouches: number;
  modified: number;
  rejected: number;
};

export type TopFrictionClause = {
  clause: ClauseFrictionId;
  score: number;
  severity: "low" | "moderate" | "high";
};

export type NegotiationPatterns = {
  totalNegotiationEvents: number;
  postureCounts: Record<string, number>;
  decisionCounts: {
    accepted: number;
    modified: number;
    rejected: number;
  };
  riskCounts: {
    low: number;
    economic: number;
    legal: number;
  };
  changedFieldCounts: Record<string, number>;
  postureOutcomes: Record<string, { accepted: number; modified: number; rejected: number }>;
  fieldOutcomes: Record<string, { accepted: number; modified: number; rejected: number }>;
  topPatterns: NegotiationPatternsTopPattern[];
  clauseFriction: Record<string, ClauseFrictionRow>;
  topFrictionClauses: TopFrictionClause[];
};

const POSTURE_LABELS: Record<NegotiationPosture, string> = {
  cooperative: "Cooperative",
  firm: "Firm",
  protective: "Protective",
  fast_close: "Fast-close",
  founder_friendly: "Founder-friendly",
  investor_friendly: "Investor-friendly",
};

const FIELD_LABELS: Record<string, string> = {
  title: "Title",
  jurisdiction: "Jurisdiction",
  purpose: "Purpose",
  payment: "Payment terms",
  term: "Term",
  due_date: "Due date",
  effective_date: "Effective date",
  parties: "Parties",
};

function postureLabel(id: string): string {
  return POSTURE_LABELS[id as NegotiationPosture] || id;
}

function fieldLabel(key: string): string {
  return FIELD_LABELS[key] || key;
}

const CLAUSE_LABELS: Record<ClauseFrictionId, string> = {
  payment_terms: "Payment terms",
  duration: "Duration",
  scope: "Scope",
  termination: "Termination",
  confidentiality: "Confidentiality",
  governing_law: "Governing law",
  other: "Other",
};

/** Export for UI: human label for a canonical clause id. */
export function clauseFrictionDisplayLabel(clause: ClauseFrictionId): string {
  return CLAUSE_LABELS[clause] || clause;
}

function frictionSeverity(score: number): "low" | "moderate" | "high" {
  if (score >= 6) return "high";
  if (score >= 3) return "moderate";
  return "low";
}

/**
 * Map raw changed_field keys from negotiation memory / snapshots to canonical clause ids.
 */
export function mapChangedFieldToClause(field: string): ClauseFrictionId {
  const k = field.trim().toLowerCase().replace(/\s+/g, "_");
  if (k === "payment" || k === "payment_terms") return "payment_terms";
  if (k === "term" || k === "duration") return "duration";
  if (k === "purpose" || k === "scope") return "scope";
  if (k === "termination" || k === "terminate") return "termination";
  if (k === "confidentiality" || k === "confidential") return "confidentiality";
  if (k === "jurisdiction" || k === "governing_law") return "governing_law";
  return "other";
}

function emptyFrictionRow(): ClauseFrictionRow {
  return { totalTouches: 0, modified: 0, rejected: 0 };
}

function incClauseFriction(
  target: Record<string, ClauseFrictionRow>,
  clause: ClauseFrictionId,
  decision: NegotiationMemoryDecision
) {
  const key = clause;
  if (!target[key]) target[key] = emptyFrictionRow();
  const row = target[key];
  row.totalTouches += 1;
  if (decision === "modified") row.modified += 1;
  else if (decision === "rejected") row.rejected += 1;
}

function frictionScore(row: ClauseFrictionRow): number {
  return row.modified * 1 + row.rejected * 2;
}

function buildTopFrictionClauses(clauseFriction: Record<string, ClauseFrictionRow>): TopFrictionClause[] {
  const scored: TopFrictionClause[] = Object.entries(clauseFriction).map(([clause, row]) => {
    const score = frictionScore(row);
    return {
      clause: clause as ClauseFrictionId,
      score,
      severity: frictionSeverity(score),
    };
  });
  scored.sort((a, b) => (b.score !== a.score ? b.score - a.score : a.clause.localeCompare(b.clause)));
  return scored.filter((x) => x.score > 0).slice(0, 3);
}

function emptyOutcomes() {
  return { accepted: 0, modified: 0, rejected: 0 };
}

function incOutcome(
  target: Record<string, { accepted: number; modified: number; rejected: number }>,
  key: string,
  decision: NegotiationMemoryDecision
) {
  if (!target[key]) target[key] = emptyOutcomes();
  if (decision === "accepted") target[key].accepted += 1;
  else if (decision === "rejected") target[key].rejected += 1;
  else target[key].modified += 1;
}

function ratio(part: number, total: number): number {
  if (total <= 0) return 0;
  return part / total;
}

function strengthFromRatio(r: number): NegotiationPatternStrength {
  if (r >= 0.75) return "strong";
  if (r >= 0.6) return "moderate";
  return "light";
}

function strengthFromCount(n: number): NegotiationPatternStrength {
  if (n >= 5) return "strong";
  if (n >= 3) return "moderate";
  return "light";
}

/** Collect owner versions that have usable negotiation_memory. */
function collectEvents(versions: AgreementVersionRecord[]) {
  const out: Array<{ decision: NegotiationMemoryDecision; posture: string; risk_level?: string; changed_fields?: string[] }> = [];
  for (const v of versions) {
    if (v.created_by !== "owner") continue;
    const m = v.meta?.negotiation_memory;
    if (!m) continue;
    if (m.decision !== "accepted" && m.decision !== "rejected" && m.decision !== "modified") continue;
    if (!m.posture || typeof m.posture !== "string") continue;
    out.push({
      decision: m.decision,
      posture: m.posture,
      risk_level: m.risk_level,
      changed_fields: m.changed_fields,
    });
  }
  return out;
}

/**
 * Optional one-line hint for a version row (deterministic; avoids duplicating full pattern list).
 */
export function negotiationRowTrendSuffix(v: AgreementVersionRecord, patterns: NegotiationPatterns): string {
  if (!patterns || typeof patterns.totalNegotiationEvents !== "number") return "";
  if (patterns.totalNegotiationEvents < 2) return "";
  const mem = v.meta?.negotiation_memory;
  if (!mem?.posture) return "";
  const entries = Object.entries(patterns.postureCounts ?? {}).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return "";
  const [topKey, topN] = entries[0];
  const r = ratio(topN, patterns.totalNegotiationEvents);
  if (r < 0.6 || topKey !== mem.posture) return "";
  return ` · ${postureLabel(topKey)} used frequently`;
}

export function computeNegotiationPatterns(versions: AgreementVersionRecord[]): NegotiationPatterns {
  const events = collectEvents(versions);
  const n = events.length;

  const postureCounts: Record<string, number> = {};
  const decisionCounts = { accepted: 0, modified: 0, rejected: 0 };
  const riskCounts = { low: 0, economic: 0, legal: 0 };
  const changedFieldCounts: Record<string, number> = {};
  const postureOutcomes: Record<string, { accepted: number; modified: number; rejected: number }> =
    {};
  const fieldOutcomes: Record<string, { accepted: number; modified: number; rejected: number }> = {};
  const clauseFriction: Record<string, ClauseFrictionRow> = {};
  const topPatterns: NegotiationPatternsTopPattern[] = [];

  for (const m of events) {
    const d = m.decision as NegotiationMemoryDecision;
    postureCounts[m.posture] = (postureCounts[m.posture] || 0) + 1;
    decisionCounts[d] += 1;
    if (m.risk_level === "low") riskCounts.low += 1;
    else if (m.risk_level === "economic") riskCounts.economic += 1;
    else if (m.risk_level === "legal") riskCounts.legal += 1;

    incOutcome(postureOutcomes, m.posture, d);

    const fields = m.changed_fields;
    if (Array.isArray(fields)) {
      for (const f of fields) {
        if (typeof f !== "string" || !f.trim()) continue;
        const key = f.trim();
        changedFieldCounts[key] = (changedFieldCounts[key] || 0) + 1;
        incOutcome(fieldOutcomes, key, d);
        const clause = mapChangedFieldToClause(key);
        incClauseFriction(clauseFriction, clause, d);
      }
    }
  }

  if (n >= 2) {
    const postureEntries = Object.entries(postureCounts).sort((a, b) => b[1] - a[1]);
    if (postureEntries.length > 0) {
      const [pk, pv] = postureEntries[0];
      const rr = ratio(pv, n);
      if (rr >= 0.6) {
        topPatterns.push({
          label: "Dominant posture",
          detail: `Most negotiation actions used a ${postureLabel(pk)} posture.`,
          strength: strengthFromRatio(rr),
        });
      }
    }

    const modRejByField: Record<string, number> = {};
    for (const m of events) {
      if (m.decision !== "modified" && m.decision !== "rejected") continue;
      const fields = m.changed_fields;
      if (!Array.isArray(fields)) continue;
      for (const f of fields) {
        if (typeof f !== "string" || !f.trim()) continue;
        const key = f.trim();
        modRejByField[key] = (modRejByField[key] || 0) + 1;
      }
    }
    const fieldHot = Object.entries(modRejByField).sort((a, b) => b[1] - a[1]);
    for (const [fk, fv] of fieldHot) {
      if (fv >= 3) {
        topPatterns.push({
          label: "Repeated section",
          detail: `${fieldLabel(fk)} have been revised repeatedly.`,
          strength: strengthFromCount(fv),
        });
        break;
      }
    }

    const riskTotal = riskCounts.low + riskCounts.economic + riskCounts.legal;
    if (riskTotal >= 2) {
      if (
        riskCounts.legal > riskCounts.low &&
        riskCounts.legal > riskCounts.economic &&
        riskCounts.legal > 0
      ) {
        topPatterns.push({
          label: "Risk focus",
          detail: "Legal-review items are the main source of negotiation.",
          strength: riskCounts.legal >= 3 ? "strong" : "moderate",
        });
      }
    }

    const postureOutcomeCandidates = Object.entries(postureOutcomes)
      .map(([pk, po]) => {
        const sum = po.accepted + po.modified + po.rejected;
        return { pk, po, sum };
      })
      .filter((x) => x.sum >= 2)
      .sort((a, b) => b.sum - a.sum);
    for (const { pk, po } of postureOutcomeCandidates) {
      if (po.accepted >= po.rejected + 2) {
        topPatterns.push({
          label: "Posture outcome",
          detail: `${postureLabel(pk)} posture has led to more accepted changes.`,
          strength: po.accepted >= po.rejected + 3 ? "strong" : "moderate",
        });
        break;
      }
      if (po.rejected >= po.accepted + 2) {
        topPatterns.push({
          label: "Posture outcome",
          detail: `${postureLabel(pk)} posture has often led to rejection or revision.`,
          strength: po.rejected >= po.accepted + 3 ? "strong" : "moderate",
        });
        break;
      }
    }
  }

  const orderStrength: Record<NegotiationPatternStrength, number> = { strong: 3, moderate: 2, light: 1 };
  topPatterns.sort((a, b) => orderStrength[b.strength] - orderStrength[a.strength]);

  const topFrictionClauses = buildTopFrictionClauses(clauseFriction);

  return {
    totalNegotiationEvents: n,
    postureCounts,
    decisionCounts,
    riskCounts,
    changedFieldCounts,
    postureOutcomes,
    fieldOutcomes,
    topPatterns: topPatterns.slice(0, 4),
    clauseFriction,
    topFrictionClauses,
  };
}

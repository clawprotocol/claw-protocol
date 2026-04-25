/** Informational triage only — not legal advice. */
export type NegotiationRiskTier = "low_risk" | "economic_impact" | "manual_legal_review";

export type NegotiationRiskConfidence = "low" | "medium" | "high";

export type NegotiationRiskAssessment = {
  tier: NegotiationRiskTier;
  label: string;
  explanation: string;
  rationale: string;
  helper_text: string;
  confidence: NegotiationRiskConfidence;
};

const TIERS: readonly NegotiationRiskTier[] = [
  "low_risk",
  "economic_impact",
  "manual_legal_review",
];

export function normalizeRiskTier(raw: unknown): NegotiationRiskTier | null {
  const s = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  if ((TIERS as readonly string[]).includes(s)) return s as NegotiationRiskTier;
  const aliases: Record<string, NegotiationRiskTier> = {
    lowrisk: "low_risk",
    economic: "economic_impact",
    legal: "manual_legal_review",
    legal_review: "manual_legal_review",
  };
  return aliases[s] ?? null;
}

export function riskLabelForHistory(tier: NegotiationRiskTier | undefined): string {
  if (!tier) return "";
  const m: Record<NegotiationRiskTier, string> = {
    low_risk: "Low risk",
    economic_impact: "Economic impact",
    manual_legal_review: "Manual legal review",
  };
  return m[tier] ?? tier;
}

export function parseRiskAssessment(raw: unknown): NegotiationRiskAssessment | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const tier = normalizeRiskTier(r.tier);
  if (!tier) return null;
  const conf = String(r.confidence ?? "medium").toLowerCase();
  const confidence: NegotiationRiskConfidence =
    conf === "low" || conf === "high" ? conf : "medium";
  return {
    tier,
    label: String(r.label ?? riskLabelForHistory(tier)).trim() || riskLabelForHistory(tier),
    explanation: String(r.explanation ?? "").trim(),
    rationale: String(r.rationale ?? "").trim(),
    helper_text: String(r.helper_text ?? "").trim(),
    confidence,
  };
}

export function riskToVersionMeta(r: NegotiationRiskAssessment): {
  risk_tier: NegotiationRiskTier;
  risk_label: string;
  risk_rationale?: string;
  risk_helper_text?: string;
  risk_confidence?: NegotiationRiskConfidence;
} {
  return {
    risk_tier: r.tier,
    risk_label: r.label,
    risk_rationale: r.rationale || undefined,
    risk_helper_text: r.helper_text || undefined,
    risk_confidence: r.confidence,
  };
}

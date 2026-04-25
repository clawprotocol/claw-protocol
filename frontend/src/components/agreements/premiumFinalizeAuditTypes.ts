/** POST /api/agreements/premium-finalize-audit — deal-grounded finalizer input. */
export type PremiumFinalizeAudit = {
  deal_specific_missing_terms: string[];
  placeholder_terms_found: string[];
  resolved_strengths: string[];
  best_next_step: "edit" | "review" | "send";
  confidence: "low" | "medium" | "high";
};

/** Post–full-draft light review; mirrors POST /api/agreements/premium-review. */
export type PremiumAgreementReview = {
  strengths: string[];
  missing_or_weak_terms: string[];
  questions_for_user: string[];
  suggested_clause_upgrades: string[];
  /** 0–100; higher = more worth tightening before send. */
  priority_score: number;
};

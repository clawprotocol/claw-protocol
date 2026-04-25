export type PremiumReviewRoute = {
  route: "signature" | "review" | "fix";
  confidence: "low" | "medium" | "high";
  unresolved_items: string[];
  reasons: string[];
  send_readiness_score: number;
  recommended_cta: "Send for signature" | "Send for review" | "Fix a few items first";
  short_summary: string;
};


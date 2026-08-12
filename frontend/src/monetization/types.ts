/**
 * Commercial plan ladder for monetization (frontend; map from access tier + future billing).
 * `pro` = paid baseline (25 finalized agreements / billing period). `power` = advanced productivity.
 */
export type LawDogMonetizationPlan = "free" | "pro" | "power";

/**
 * Frontend user snapshot for gates.
 * Backed by access tier + usage meter today; replace with API fields when backend is ready.
 */
export type LawDogUserMonetizationState = {
  isAuthenticated: boolean;
  plan: LawDogMonetizationPlan;
  /** Count of agreements created this session / billing period (from usage meter). */
  agreements_created: number;
};

/** Normalize recommendation pill ids across agreement families. */
const RECOMMEND_PILL_IDS = new Set([
  "recommend",
  "recommend_for_me",
  "recommended",
  "lawdog_recommended",
]);

export function isRecommendPillId(pillId: string): boolean {
  const n = pillId.trim().toLowerCase().replace(/-/g, "_");
  return RECOMMEND_PILL_IDS.has(n);
}

/** Shared badge glyphs + hints for leaderboard, share cards, and tooltips. */

export const AFFILIATE_BADGE_GLYPH: Record<string, string> = {
  first_conversion: "◆",
  first_paid_user: "★",
  five_activated: "⬡",
  ten_agreements_influenced: "↗",
  weekly_climber: "⌁",
  conversion_streak: "◇",
  premium_closer: "✦",
  network_builder: "⬢",
  momentum_25: "▴",
  momentum_50: "▲",
  momentum_100: "◈",
  network_starter: "◆",
  first_activation: "⚡",
  paid_path: "★",
  retention_lift: "⌁",
  send_momentum: "↗",
  rising_pack: "✦",
};

export const AFFILIATE_BADGE_HINT: Record<string, string> = {
  first_conversion: "First win that actually converted",
  first_paid_user: "First paid path through your link",
  five_activated: "Five people activated — network breathes",
  ten_agreements_influenced: "10+ agreements with your fingerprints",
  weekly_climber: "Moved up the board in a week",
  conversion_streak: "Back-to-back conversion weeks",
  premium_closer: "Closed premium-tier momentum",
  network_builder: "Built a repeatable referral loop",
  momentum_25: "Momentum crossed 25 — consistency shows",
  momentum_50: "Momentum crossed 50 — you’re a signal",
  momentum_100: "Momentum 100+ — top shelf",
  network_starter: "Sparked your first real network edges",
  first_activation: "First activation off your link",
  paid_path: "Proved the paid path",
  retention_lift: "People came back — retention signal",
  send_momentum: "Sends stacking — execution streak",
  rising_pack: "Pack rank climbing with substance",
};

export function affiliateBadgeGlyph(id: string): string {
  return AFFILIATE_BADGE_GLYPH[id] ?? "·";
}

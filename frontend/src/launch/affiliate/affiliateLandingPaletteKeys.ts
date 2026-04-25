export const AFFILIATE_LANDING_COLOR_KEYS = [
  "pink",
  "rose",
  "purple",
  "blue",
  "aqua",
  "green",
  "tan",
  "yellow",
  "red",
] as const;

export type AffiliateLandingColorKey = (typeof AFFILIATE_LANDING_COLOR_KEYS)[number];

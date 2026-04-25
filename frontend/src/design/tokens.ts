/**
 * LawDog design tokens — core UI, CTAs, feedback, and affiliate-only pastels.
 *
 * Rule: core colors drive app chrome; pastels are for affiliate landing, leaderboard tiers, Doginal identity only.
 */

import type { CSSProperties } from "react";
import type { AffiliateLandingColorKey } from "../launch/affiliate/affiliateLandingPaletteKeys";

/** Trust / chrome layer (aligned with VS01 dark shell). */
export const LAWDOG_COLORS = {
  bg_primary: "#0b0c0f",
  bg_secondary: "#14161c",
  text_primary: "#f4efe6",
  text_secondary: "#94a3b8",
  cta_primary: "#d4a574",
  cta_hover: "#e0b588",
  cta_active: "#c49362",
  success: "#34d399",
  warning: "#fbbf24",
  error: "#f87171",
  pastel_pink: "#ffd0eb",
  pastel_rose: "#ffb1dd",
  pastel_purple: "#debcff",
  pastel_blue: "#64ffff",
  pastel_aqua: "#4ffcd1",
  pastel_green: "#8dffa4",
  pastel_tan: "#f8e49e",
  pastel_yellow: "#ffe154",
  pastel_red: "#ff7d82",
} as const;

/** Allowlisted affiliate / Doginal pastel keys → hex (single source for landing + tier accents). */
export const LAWDOG_AFFILIATE_PASTELS: Record<AffiliateLandingColorKey, string> = {
  pink: LAWDOG_COLORS.pastel_pink,
  rose: LAWDOG_COLORS.pastel_rose,
  purple: LAWDOG_COLORS.pastel_purple,
  blue: LAWDOG_COLORS.pastel_blue,
  aqua: LAWDOG_COLORS.pastel_aqua,
  green: LAWDOG_COLORS.pastel_green,
  tan: LAWDOG_COLORS.pastel_tan,
  yellow: LAWDOG_COLORS.pastel_yellow,
  red: LAWDOG_COLORS.pastel_red,
};

/** Dog-head emblem (transparent PNG); use on light as-is, invert on dark chrome. */
export const LAWDOG_EMBLEM_SRC = "/assets/lawdog-emblem.png";

/** @deprecated Prefer LAWDOG_EMBLEM_SRC — kept for older imports; points at emblem. */
export const LAWDOG_LOGO_SRC = LAWDOG_EMBLEM_SRC;

/**
 * Pastel accent application for affiliate landing: frame glow, CTA tint, light banners — not full-page reskin.
 */
export function getAffiliateAccentStyle(
  colorKey: AffiliateLandingColorKey,
  opts?: { doginalIdentityProminence?: boolean }
): {
  accentHex: string;
  pageWashStyle: CSSProperties;
  avatarFrameStyle: CSSProperties;
  ctaStyle: CSSProperties;
  bannerStyle: CSSProperties;
} {
  const hex = LAWDOG_AFFILIATE_PASTELS[colorKey];
  const prom = opts?.doginalIdentityProminence === true;
  return {
    accentHex: hex,
    pageWashStyle: {
      backgroundImage: prom
        ? `radial-gradient(ellipse 90% 70% at 50% -5%, ${hex}18, transparent 58%), radial-gradient(ellipse 70% 50% at 50% 105%, ${hex}12, transparent 52%)`
        : `radial-gradient(ellipse 80% 60% at 50% -10%, ${hex}12, transparent 55%), radial-gradient(ellipse 60% 40% at 50% 110%, ${hex}0c, transparent 50%)`,
    },
    avatarFrameStyle: {
      borderColor: `${hex}99`,
      boxShadow: prom
        ? `0 0 56px ${hex}44, 0 0 28px ${hex}28, 0 16px 48px rgba(0,0,0,0.5)`
        : `0 0 40px ${hex}36, 0 12px 40px rgba(0,0,0,0.45)`,
      background: "rgba(15,23,42,0.65)",
    },
    ctaStyle: {
      backgroundColor: hex,
      color: "#0f172a",
      boxShadow: `0 0 22px ${hex}50`,
    },
    bannerStyle: {
      borderColor: `${hex}50`,
      backgroundColor: `${hex}10`,
    },
  };
}

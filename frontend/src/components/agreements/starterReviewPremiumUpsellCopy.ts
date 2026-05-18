/**
 * Fixed marketing copy + shared visual tokens for starter / basic draft review premium upsells.
 * Kept in one module so AgreementBuilderIntake and FullDraftUpgradeDiffPreview stay aligned.
 *
 * Color rule: premium upgrade actions use amber/gold (`STARTER_REVIEW_PREMIUM_*` below).
 * Free “proceed” CTAs (Continue, Add party names, Send Agreement, …) stay emerald — do not reuse these classes there.
 */

import {
  PRO_CTA_CONTINUE,
  PRO_UPGRADE_CARD_BODY,
  PRO_UPGRADE_CARD_HEADING,
  PRO_UPGRADE_PRO_BULLETS,
  PRO_UPGRADE_REASSURANCE,
} from "../../launch/simpleProduct/proConversionCopy";

export const STARTER_REVIEW_PREMIUM_HEADLINE = PRO_UPGRADE_CARD_HEADING;

export const STARTER_REVIEW_PREMIUM_BODY = PRO_UPGRADE_CARD_BODY;

/** @deprecated Use {@link ProConversionComparisonCard} Pro column. */
export const STARTER_REVIEW_PREMIUM_BULLETS = PRO_UPGRADE_PRO_BULLETS;

export const STARTER_REVIEW_PREMIUM_CTA = PRO_CTA_CONTINUE;

export const STARTER_REVIEW_PREMIUM_MICROCOPY = PRO_UPGRADE_REASSURANCE;

/** Card / section shell: deep slate + amber border & warm glow (distinct from free emerald chrome). */
export const STARTER_REVIEW_PREMIUM_PANEL_CLASSNAME =
  "rounded-xl border border-amber-500/30 bg-gradient-to-b from-slate-900/95 via-slate-950/95 to-slate-950 shadow-[0_0_32px_-10px_rgba(245,158,11,0.24)] ring-1 ring-amber-400/18";

/** List bullet / small glyph accent inside premium upsell copy. */
export const STARTER_REVIEW_PREMIUM_LIST_GLYPH_CLASSNAME = "mt-0.5 shrink-0 text-amber-400/90";

/**
 * Primary “upgrade” CTA only: luminous gold–amber gradient, dark label, amber focus ring.
 * Combine with layout utilities (`mt-4 w-full min-h-[…] px-… py-… text-center text-sm`).
 */
export const STARTER_REVIEW_PREMIUM_CTA_BUTTON_CLASSNAME =
  "rounded-lg border border-amber-400/40 bg-gradient-to-b from-amber-200 via-amber-400 to-amber-600 font-semibold text-amber-950 shadow-[0_0_26px_-8px_rgba(251,191,36,0.48)] ring-1 ring-amber-300/30 transition hover:from-amber-100 hover:via-amber-300 hover:to-amber-600 hover:shadow-[0_0_34px_-6px_rgba(252,211,77,0.52)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/75 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none";

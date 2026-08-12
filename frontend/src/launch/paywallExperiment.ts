/**
 * Send conversion modal — single bundled experiment (one variant id sets all copy dimensions).
 *
 * Mutual exclusivity: only one major paywall experiment should run at a time. While
 * `send_conversion_paywall` is active, disable other paywall-adjacent experiments in
 * `config/experiments/registry.ts` (e.g. `ready_to_send_cta_framing`) to avoid conflicting assignments.
 *
 * Env: `VITE_CLAW_EXPERIMENT_SEND_PAYWALL=0` forces `control` (no A/B split).
 */

import { getOrCreateLawdogSessionId } from "../tracking/lawdogSession";
import { featureFlags } from "../config/featureFlags";
import {
  PAYWALL_ONE_TIME_HOVER_TITLE,
  PAYWALL_SEND_FINAL_BACK,
  PAYWALL_SEND_FINAL_FOOTER,
  PAYWALL_SEND_FINAL_FREE_CTA,
  PAYWALL_SEND_FINAL_FREE_LINE,
  PAYWALL_SEND_FINAL_HEADLINE,
  PAYWALL_SEND_FINAL_MODE_QUESTION,
  PAYWALL_SEND_FINAL_PREMIUM_PITCH,
  PAYWALL_SEND_FINAL_SUB,
  PAYWALL_SEND_FINAL_UPGRADE_CTA,
  PAYWALL_SEND_MODAL_LOSS_AVERSION,
  PAYWALL_SEND_MODAL_MICRO_URGENCY,
  PAYWALL_SEND_MODAL_SOCIAL_PROOF_BADGE,
  PAYWALL_SUBSCRIPTION_HOVER_TITLE,
  sendModalValueCompressionLine,
} from "./paywallMessaging";
import { formatMoneyUsdWhole } from "./pricingKeyMath";
import { LAUNCH_PRICING_TIERS } from "./pricingTiersData";

export const SEND_CONVERSION_PAYWALL_EXPERIMENT_KEY = "send_conversion_paywall";

const VARIANT_IDS = ["control", "v1"] as const;
export type SendPaywallVariantId = (typeof VARIANT_IDS)[number];

export type PaywallExperimentDimensions = {
  headline_frame: "default" | "direct";
  cta_copy: "unlock_full" | "continue_plus";
  social_proof: "most_users" | "popular";
  value_compression: "daily" | "flat_monthly";
  urgency_density: "full" | "minimal";
  one_time_fallback: "one_agreement" | "once_short";
};

export type ResolvedSendPaywallCopy = {
  opener: string;
  headlineDefault: string;
  subDefault: string;
  showSecondaryUrgency: boolean;
  socialBadge: string;
  subscriptionAnchorLine: string;
  valueCompressionLine: string;
  bestForLine: string;
  plusBlurb: string;
  premiumPitchAboveCta: string;
  freeDeliveryLine: string;
  freeCtaLabel: string;
  dismissCtaLabel: string;
  footerTrust: string;
  ctaLabel: string;
  microUrgency: string;
  lossAversion: string;
  oneTimeQuestion: string;
  subscriptionHoverTitle: string;
  oneTimeHoverTitle: string;
  dims: PaywallExperimentDimensions;
};

function hashBucket(sessionId: string, salt: string): number {
  const s = `${salt}:${sessionId}`;
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h) % 2;
}

export function getSendConversionPaywallVariantId(): SendPaywallVariantId {
  if (!featureFlags.sendConversionPaywallExperiment) return "control";
  const sid = getOrCreateLawdogSessionId();
  if (sid === "ssr") return "control";
  return hashBucket(sid, SEND_CONVERSION_PAYWALL_EXPERIMENT_KEY) === 0 ? "control" : "v1";
}

const DIMS: Record<SendPaywallVariantId, PaywallExperimentDimensions> = {
  control: {
    headline_frame: "default",
    cta_copy: "unlock_full",
    social_proof: "most_users",
    value_compression: "daily",
    urgency_density: "full",
    one_time_fallback: "one_agreement",
  },
  v1: {
    headline_frame: "direct",
    cta_copy: "continue_plus",
    social_proof: "popular",
    value_compression: "flat_monthly",
    urgency_density: "minimal",
    one_time_fallback: "once_short",
  },
};

export function flatDimRecord(d: PaywallExperimentDimensions): Record<string, string> {
  return {
    headline_frame: d.headline_frame,
    cta_copy: d.cta_copy,
    social_proof: d.social_proof,
    value_compression: d.value_compression,
    urgency_density: d.urgency_density,
    one_time_fallback: d.one_time_fallback,
  };
}

export function paywallDimensionsForVariant(variantId: SendPaywallVariantId): Record<string, string> {
  return flatDimRecord(DIMS[variantId] ?? DIMS.control);
}

export function resolveSendPaywallCopy(variantId: SendPaywallVariantId): ResolvedSendPaywallCopy {
  const d = DIMS[variantId] ?? DIMS.control;
  const plusTier = LAUNCH_PRICING_TIERS.find((t) => t.highlighted) ?? LAUNCH_PRICING_TIERS[0];
  const plusMonthlyUsd = plusTier.monthlyPriceUsd;
  const subscriptionAnchorLine =
    plusMonthlyUsd != null ? `${formatMoneyUsdWhole(plusMonthlyUsd)}/month` : "See plans";

  const opener = PAYWALL_SEND_FINAL_MODE_QUESTION;

  let valueCompressionLine =
    plusMonthlyUsd != null
      ? sendModalValueCompressionLine(plusMonthlyUsd)
      : "LawDog Pro: 25 finalized premium agreements per billing period";
  if (d.value_compression === "flat_monthly" && plusMonthlyUsd != null) {
    valueCompressionLine = `LawDog Pro: 25 finalized premium agreements — ${formatMoneyUsdWhole(plusMonthlyUsd)}/month`;
  }

  let socialBadge = PAYWALL_SEND_MODAL_SOCIAL_PROOF_BADGE;
  if (d.social_proof === "popular") {
    socialBadge = "Popular choice";
  }

  const ctaLabel = PAYWALL_SEND_FINAL_UPGRADE_CTA;

  const showSecondaryUrgency = d.urgency_density === "full";

  let microUrgency = PAYWALL_SEND_MODAL_MICRO_URGENCY;
  let lossAversion = PAYWALL_SEND_MODAL_LOSS_AVERSION;
  if (d.urgency_density === "minimal") {
    microUrgency = "";
    lossAversion = "";
  }

  let oneTimeQuestion = "Only need this one agreement?";
  if (d.one_time_fallback === "once_short") {
    oneTimeQuestion = "Just this once?";
  }

  return {
    opener,
    headlineDefault: PAYWALL_SEND_FINAL_HEADLINE,
    subDefault: PAYWALL_SEND_FINAL_SUB,
    showSecondaryUrgency,
    socialBadge,
    subscriptionAnchorLine,
    valueCompressionLine,
    bestForLine: "Best for ongoing use",
    plusBlurb: "",
    premiumPitchAboveCta: PAYWALL_SEND_FINAL_PREMIUM_PITCH,
    freeDeliveryLine: PAYWALL_SEND_FINAL_FREE_LINE,
    freeCtaLabel: PAYWALL_SEND_FINAL_FREE_CTA,
    dismissCtaLabel: PAYWALL_SEND_FINAL_BACK,
    footerTrust: PAYWALL_SEND_FINAL_FOOTER,
    ctaLabel,
    microUrgency,
    lossAversion,
    oneTimeQuestion,
    subscriptionHoverTitle: PAYWALL_SUBSCRIPTION_HOVER_TITLE,
    oneTimeHoverTitle: PAYWALL_ONE_TIME_HOVER_TITLE,
    dims: d,
  };
}

export function paywallExperimentLogPayload(variantId: SendPaywallVariantId): Record<string, string> {
  const dims = DIMS[variantId] ?? DIMS.control;
  return {
    paywall_experiment_key: SEND_CONVERSION_PAYWALL_EXPERIMENT_KEY,
    paywall_variant: variantId,
    ...flatDimRecord(dims),
  };
}

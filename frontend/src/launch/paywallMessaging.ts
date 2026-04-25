/** Single paywall narrative — paired headline + sub across modals and events. */

import { FUNNEL_CTA_SEND_WITH_PRO } from "./pricingContent";

export const PAYWALL_DEFAULT_HEADLINE = "You're ready to send this agreement.";

export const PAYWALL_DEFAULT_SUB =
  "Upgrade to send with LawDog Pro — review links, tracked e‑signature, and a proof record. Look professional and close faster on a simple monthly or annual plan.";

/** Shown after generation / “Your agreement is ready” — send-step contextual monetization. */
export const PAYWALL_POST_VALUE_HEADLINE = "Your agreement is ready";

export const PAYWALL_POST_VALUE_SUB =
  "Make this agreement real — send or export it. Upgrade to send for a clean send, saved workspace, and no watermark.";

/** Simple send flow — final modal before basic send unlock (SendConversionModal). */
export const PAYWALL_SEND_FINAL_HEADLINE = "You're ready to send this agreement.";

export const PAYWALL_SEND_FINAL_SUB =
  "LawDog Pro gives you review links, tracked signatures, and a proof record — calmer review, clearer terms, and a send that looks deal‑ready.";

export const PAYWALL_SEND_FINAL_MODE_QUESTION = "How do you want to send it?";

export const PAYWALL_SEND_FINAL_FREE_LINE =
  "Send a basic draft link with watermark + simple delivery";

export const PAYWALL_SEND_FINAL_FREE_CTA = "Send basic draft link";

export const PAYWALL_SEND_FINAL_PREMIUM_PITCH =
  "Review links, tracked signing, and a proof record — business‑ready terms built to help you close faster.";

export const PAYWALL_SEND_FINAL_UPGRADE_CTA = FUNNEL_CTA_SEND_WITH_PRO;

export const PAYWALL_SEND_FINAL_BACK = "Go back";

export const PAYWALL_SEND_FINAL_FOOTER = "Nothing is sent until you confirm.";

/** Urgency lines under the headline (send conversion modal). */
export const PAYWALL_URGENCY_PRIMARY = "You’re one step away from using this agreement.";

/** Subscription-first nudge; one-time unlock is offered separately as a quiet fallback in the send modal. */
export const PAYWALL_URGENCY_SECONDARY =
  "LawDog Pro keeps send, export, and save open for whatever you draft next.";

/** One-time unlock price (USD) — only offered after value exists (e.g. send conversion), not on pricing triad. */
export const CONTEXTUAL_ONE_TIME_UNLOCK_USD = 9;

/** Send conversion modal: daily value line under subscription price. */
export function sendModalValueCompressionLine(monthlyUsd: number): string {
  const daily = monthlyUsd / 30;
  if (daily < 0.5) return "Unlimited agreements with LawDog Pro for less than $0.50/day";
  return `Unlimited agreements with LawDog Pro — about $${daily.toFixed(2)}/day`;
}

export const PAYWALL_SEND_MODAL_SOCIAL_PROOF_BADGE = "Most users choose this";

export const PAYWALL_SEND_MODAL_MICRO_URGENCY = "About 10 seconds to upgrade to send";

export const PAYWALL_SEND_MODAL_LOSS_AVERSION = "Don't lose access to this agreement";

export const PAYWALL_SUBSCRIPTION_HOVER_TITLE = "Best for ongoing agreements";

export const PAYWALL_ONE_TIME_HOVER_TITLE = "Good for one-time use";

/** Direct decision line — no hedging (shown in send conversion surfaces). */
export const CONVERSION_DECISION_PROMPT = "Are you ready to send this agreement?";

/** Product-scope reassurance under primary conversion CTAs. */
export const CONVERSION_GUARANTEE_INLINE =
  "First agreement workflow: refund if you can't complete it as intended—product scope only (details on pricing).";

export function paywallCopyForTrigger(payload?: Record<string, unknown>): { headline: string; sub: string } {
  const code = String(payload?.code || "");
  const reason = String(payload?.reason || "");
  if (code === "agreement_memory_paywall") {
    return {
      headline: "Find and reuse what already worked.",
      sub: "LawDog Pro lets you search by meaning and start from previous agreements.",
    };
  }
  if (code === "premium_agreement_template") {
    return {
      headline: "Full templates for advanced agreements",
      sub: "LawDog Pro unlocks deeper operating agreement, SAFE, and governance-style drafting — then review and send.",
    };
  }
  if (reason === "watermark_upgrade") {
    return {
      headline: PAYWALL_DEFAULT_HEADLINE,
      sub: PAYWALL_DEFAULT_SUB,
    };
  }
  if (reason === "draft_expired") {
    return {
      headline: "Pick up where you left off",
      sub: "Save and finalize when you’re ready — your draft is waiting.",
    };
  }
  return { headline: PAYWALL_DEFAULT_HEADLINE, sub: PAYWALL_DEFAULT_SUB };
}

/** Single paywall narrative — paired headline + sub across modals and events. */

import { FUNNEL_CTA_SEND_WITH_PRO } from "./pricingContent";

export const PAYWALL_DEFAULT_HEADLINE = "Send this as a professional agreement";

export const PAYWALL_DEFAULT_SUB =
  "Upgrade to remove draft labeling and send a finalized agreement with a verifiable proof record.";

/** Shown after generation / “Your agreement is ready” — send-step contextual monetization. */
export const PAYWALL_POST_VALUE_HEADLINE = "Your agreement is ready";

export const PAYWALL_POST_VALUE_SUB =
  "Make this agreement real — send or export it. Upgrade to send for a clean send, saved workspace, and no watermark.";

/** Simple send flow — final modal before basic send unlock (SendConversionModal). */
export const PAYWALL_SEND_FINAL_HEADLINE = "Send this as a professional agreement";

export const PAYWALL_SEND_FINAL_SUB =
  "Upgrade to remove draft labeling and send a finalized agreement with a verifiable proof record.";

export const PAYWALL_SEND_FINAL_MODE_QUESTION = "How do you want to send it?";

export const PAYWALL_SEND_FINAL_FREE_LINE =
  "Continue with the draft version on screen — professional send unlocks proof-friendly delivery.";

export const PAYWALL_SEND_FINAL_FREE_CTA = "Continue with draft version";

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
  if (daily < 0.5) {
    return "LawDog Pro: 10 finalized premium agreements/month for less than $0.50/day";
  }
  return `LawDog Pro: 10 finalized premium agreements/month — about $${daily.toFixed(2)}/day`;
}

/** Neutral label — do not invent social proof without real cohort data. */
export const PAYWALL_SEND_MODAL_SOCIAL_PROOF_BADGE = "Subscription option";

export const PAYWALL_SEND_MODAL_MICRO_URGENCY = "About 10 seconds to upgrade to send";

export const PAYWALL_SEND_MODAL_LOSS_AVERSION = "Don't lose access to this agreement";

export const PAYWALL_SUBSCRIPTION_HOVER_TITLE = "Best for ongoing agreements";

export const PAYWALL_ONE_TIME_HOVER_TITLE = "Good for one-time use";

/** Direct decision line — no hedging (shown in send conversion surfaces). */
export const CONVERSION_DECISION_PROMPT = "Choose how you want to send.";

/** Paid Pro — ready to send (no upsell; server authoritative render). */
export const PAYWALL_PAID_READY_HEADLINE = "You're ready to send";

/** Default minimal-chrome subcopy (signature-biased legacy string). Prefer the intent-specific lines below. */
export const PAYWALL_PAID_READY_SUB = "This agreement is finalized and ready for signature.";

/** Paid Pro minimal confirmation — user chose tracked signature / signing links. */
export const PAYWALL_PAID_READY_SUB_SIGNATURE =
  "This agreement is finalized. Next you’ll get signature links for your signers — nothing is emailed automatically; you copy and share when ready.";

/** Paid Pro minimal confirmation — user chose review links first. */
export const PAYWALL_PAID_READY_SUB_REVIEW =
  "This agreement is finalized. Next you’ll get review links — recipients can suggest edits; you decide what applies before anything updates.";

export const PAYWALL_PAID_READY_CTA = "Send agreement";

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

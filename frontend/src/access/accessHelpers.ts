import { tierEntitlements } from "./tierConfig";
import type { AccessFeature, AccessTier, GateContext, GateResult, UsageTotals } from "./types";
import { loadUsageTotals } from "./usageMeter";
import { hasDemoSessionUser } from "../launch/guestCheckoutAuthority";
import { hasPaidPremiumCompletionSession } from "../components/agreements/premiumCompletionStorage";

/**
 * After-pay e-sign for a checkout-created LawDog user (demo receipt / paid
 * session). Does not change the create-path access tier — guest homepage
 * dump still paints without a Supabase JWT.
 */
export function checkoutCreatedLawdogEsignAllowed(): boolean {
  try {
    return hasDemoSessionUser() || hasPaidPremiumCompletionSession();
  } catch {
    return false;
  }
}

const APPROACH_RATIO = 0.8;

function limitApproaching(used: number, limit: number | null): boolean {
  if (limit == null || limit <= 0) return false;
  return used >= Math.floor(limit * APPROACH_RATIO) && used < limit;
}

function atOrOverLimit(used: number, limit: number | null): boolean {
  if (limit == null) return false;
  return used >= limit;
}

/**
 * Evaluate a product feature gate from tier config + current monthly usage.
 * All product surfaces should use this (or AccessContext.check) — not ad hoc tier checks.
 */
export function canUseFeature(
  tier: AccessTier,
  usage: UsageTotals,
  feature: AccessFeature,
  ctx?: GateContext
): GateResult {
  const e = tierEntitlements(tier);

  switch (feature) {
    case "create_agreement":
      if (!e.can_create_agreements) {
        return {
          allowed: false,
          title: "Structured drafts",
          message: "Your plan does not include creating new structured drafts. Upgrade to continue.",
        };
      }
      if (e.max_active_agreements != null && ctx?.activeWorkspaceAgreements != null) {
        const n = ctx.activeWorkspaceAgreements;
        if (n >= e.max_active_agreements) {
          return {
            allowed: false,
            title: "Agreement limit reached",
            message: `You’ve reached the maximum of ${e.max_active_agreements} active agreements on your plan. Archive some or upgrade for a higher limit.`,
          };
        }
        if (limitApproaching(n, e.max_active_agreements)) {
          return {
            allowed: true,
            approaching: true,
            title: "Almost at your agreement limit",
            message: `You’re using ${n} of ${e.max_active_agreements} agreements on your plan.`,
          };
        }
      }
      return { allowed: true };

    case "revision_preview":
      if (atOrOverLimit(usage.revision_previews, e.max_revision_previews_per_month)) {
        return {
          allowed: false,
          title: "Revision preview limit",
          message:
            "You’ve reached your monthly revision preview limit. Upgrade to keep iterating with LawDog assistance.",
        };
      }
      if (limitApproaching(usage.revision_previews, e.max_revision_previews_per_month)) {
        return {
          allowed: true,
          approaching: true,
          title: "Approaching preview limit",
          message: "You’re close to your monthly revision preview limit. Consider upgrading for more capacity.",
        };
      }
      return { allowed: true };

    case "recipient_invitation":
      if (atOrOverLimit(usage.recipient_invitations, e.max_recipient_reviews_per_month)) {
        return {
          allowed: false,
          title: "Recipient invitations",
          message:
            "You’ve reached your monthly limit for recipient review invitations. Upgrade to invite more counterparties.",
        };
      }
      if (limitApproaching(usage.recipient_invitations, e.max_recipient_reviews_per_month)) {
        return {
          allowed: true,
          approaching: true,
          message: "You’re close to your monthly recipient invitation limit.",
        };
      }
      return { allowed: true };

    case "signature_request":
      if (checkoutCreatedLawdogEsignAllowed()) {
        return { allowed: true };
      }
      if (atOrOverLimit(usage.signature_requests, e.max_signature_requests_per_month)) {
        return {
          allowed: false,
          title: "Signing limit",
          message:
            "You’ve reached your monthly limit for sending agreements to signature. Upgrade to continue with signing.",
        };
      }
      if (limitApproaching(usage.signature_requests, e.max_signature_requests_per_month)) {
        return {
          allowed: true,
          approaching: true,
          message: "You’re close to your monthly signing-send limit.",
        };
      }
      return { allowed: true };

    case "esign_flow":
      if (checkoutCreatedLawdogEsignAllowed()) {
        return { allowed: true };
      }
      if (!e.can_use_esign) {
        return {
          allowed: false,
          title: "E-sign",
          message: "E-sign isn’t enabled on your plan. Upgrade to send documents for signature.",
        };
      }
      return { allowed: true };

    case "negotiation_assist":
      /* Model class handled separately; tier always allows the panel unless we add a hard off flag later. */
      return { allowed: true };

    case "verification_packet":
      if (atOrOverLimit(usage.verification_packets, e.max_verification_packets_per_month)) {
        return {
          allowed: false,
          title: "Verification downloads",
          message: "You’ve reached your monthly limit for verification packet downloads on this plan.",
        };
      }
      if (limitApproaching(usage.verification_packets, e.max_verification_packets_per_month)) {
        return {
          allowed: true,
          approaching: true,
          message: "You’re close to your monthly verification packet limit.",
        };
      }
      return { allowed: true };

    case "add_vs01_counterparty":
      if (e.max_vs01_counterparties != null && ctx?.vs01NamedCounterpartyCount != null) {
        const n = ctx.vs01NamedCounterpartyCount;
        if (n >= e.max_vs01_counterparties) {
          return {
            allowed: false,
            title: "Signer slots",
            message: `Your plan allows up to ${e.max_vs01_counterparties} other signers in this flow. Upgrade to add more recipients.`,
          };
        }
      }
      return { allowed: true };

    default:
      return { allowed: true };
  }
}

export function getUsageAllowanceSnapshot(tier: AccessTier, usage: UsageTotals) {
  const e = tierEntitlements(tier);
  return [
    {
      key: "agreements",
      label: "Agreements started (this month)",
      used: usage.agreements_created,
      limit: null as number | null,
    },
    {
      key: "revision_previews",
      label: "Revision previews",
      used: usage.revision_previews,
      limit: e.max_revision_previews_per_month,
    },
    {
      key: "recipient_invitations",
      label: "Recipient invitations",
      used: usage.recipient_invitations,
      limit: e.max_recipient_reviews_per_month,
    },
    {
      key: "signature_requests",
      label: "Signing requests",
      used: usage.signature_requests,
      limit: e.max_signature_requests_per_month,
    },
    {
      key: "verification_packets",
      label: "Verification packets",
      used: usage.verification_packets,
      limit: e.max_verification_packets_per_month,
    },
  ];
}

export function isOverLimit(
  tier: AccessTier,
  usage: UsageTotals,
  feature: AccessFeature,
  ctx?: GateContext
): boolean {
  return !canUseFeature(tier, usage, feature, ctx).allowed;
}

/** Non-hook entry for utilities (reloads usage from storage). */
export function peekFeatureGate(
  tier: AccessTier,
  feature: AccessFeature,
  ctx?: GateContext
): GateResult {
  return canUseFeature(tier, loadUsageTotals(), feature, ctx);
}

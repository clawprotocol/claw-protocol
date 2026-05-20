/** Client-side mirror of backend Stripe checkout metadata for LawDog Pro. */

import type { GenesisReferralCheckoutPayload } from "./genesisReferralCapture";

export function buildStripeCheckoutMetadata(
  orgId: string,
  payload: GenesisReferralCheckoutPayload,
  userId?: string,
): Record<string, string> {
  const md: Record<string, string> = {
    org_id: orgId.trim(),
    claw_org_id: orgId.trim(),
    plan_code: "pro",
    visitor_id: payload.visitor_id,
  };
  if (payload.referral_code) {
    md.referral_code = payload.referral_code;
  }
  if (userId?.trim()) {
    md.user_id = userId.trim();
  }
  return md;
}

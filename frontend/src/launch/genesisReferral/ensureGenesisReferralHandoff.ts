import { logProductEvent } from "../../lib/experimentation/productEvents";
import { getOrgId } from "../orgContext";
import {
  fetchGenesisCheckoutMetadata,
  postGenesisReferralCapture,
  postGenesisReferralConvert,
} from "./genesisReferralApi";
import { getGenesisReferralCheckoutPayload } from "./genesisReferralCapture";

/**
 * Best-effort Genesis referral capture + conversion before checkout.
 * Does not block anonymous free UX when referral is absent.
 */
export async function ensureGenesisReferralHandoffForCheckout(userId?: string): Promise<{
  ok: boolean;
  metadata: Record<string, string>;
  skipped?: boolean;
}> {
  const payload = getGenesisReferralCheckoutPayload();
  const orgId = getOrgId();
  if (!payload.referral_code) {
    const md = await fetchGenesisCheckoutMetadata(orgId, payload, userId);
    return { ok: true, metadata: md, skipped: true };
  }

  await postGenesisReferralCapture({
    referral_code: payload.referral_code,
    visitor_id: payload.visitor_id,
    source_path: typeof window !== "undefined" ? window.location.pathname : undefined,
  });

  const converted = await postGenesisReferralConvert({
    referral_code: payload.referral_code,
    visitor_id: payload.visitor_id,
    referred_org_id: orgId,
    referred_user_id: userId,
  });

  if (converted.blocked) {
    return { ok: false, metadata: {}, skipped: false };
  }

  logProductEvent("referral_checkout_started", {
    referral_code: payload.referral_code,
    org_id: orgId,
    visitor_id: payload.visitor_id,
  });

  if (converted.ok) {
    logProductEvent("referral_conversion_recorded", {
      referral_code: payload.referral_code,
      org_id: orgId,
    });
  }

  const metadata = await fetchGenesisCheckoutMetadata(orgId, payload, userId);
  return { ok: true, metadata, skipped: false };
}

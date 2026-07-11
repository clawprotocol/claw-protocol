/**
 * Bind authenticated Supabase user to stable workspace org id.
 */

import { apiUrl, errorMessageFromResponse, readJson } from "../lib/clawApi";
import { getOrgId, setOrgId } from "../launch/orgContext";
import {
  readPaidCheckoutOrgId,
  resolveEntitlementRepairOrgCandidates,
} from "../launch/paidCheckoutOrgContext";
import { anonymousSessionHeaders } from "./anonymousSessionHeaders";

export type BindUserOrgResponse = {
  ok: boolean;
  org_id: string;
  user_id: string;
  migrated_agreement_count: number;
};

export async function bindAuthenticatedUserToWorkspace(args: {
  userId: string;
  email?: string | null;
  displayName?: string | null;
  claimMethod?: "magic_link" | "google" | "session_restore";
  accessToken?: string;
}): Promise<BindUserOrgResponse> {
  const previousOrgId = getOrgId();
  const subscriptionSourceOrgId = readPaidCheckoutOrgId();
  const entitlementRepairCandidates = resolveEntitlementRepairOrgCandidates();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    ...anonymousSessionHeaders(),
  };
  if (args.accessToken) {
    headers.Authorization = `Bearer ${args.accessToken}`;
  }
  const res = await fetch(apiUrl("/v1/workspace/bind-user-org"), {
    method: "POST",
    headers,
    credentials: "include",
    body: JSON.stringify({
      user_id: args.userId,
      email: args.email ?? undefined,
      display_name: args.displayName ?? undefined,
      previous_org_id: previousOrgId,
      subscription_source_org_id: subscriptionSourceOrgId ?? undefined,
      entitlement_repair_candidates:
        entitlementRepairCandidates.length > 0 ? entitlementRepairCandidates : undefined,
      claim_method: args.claimMethod ?? "unknown",
    }),
  });
  if (!res.ok) {
    throw new Error(await errorMessageFromResponse(res, "Could not bind workspace."));
  }
  const data = (await readJson<BindUserOrgResponse>(res)) as BindUserOrgResponse;
  if (data.org_id) {
    setOrgId(data.org_id);
  }
  return data;
}

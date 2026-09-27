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
import {
  clearGenesisDogOnboardingIntent,
  genesisDogOnboardingBindFields,
} from "../launch/genesisReferral/genesisDogOnboardingCapture";

export type BindUserOrgResponse = {
  ok: boolean;
  org_id: string;
  user_id: string;
  migrated_agreement_count: number;
  migrated_agreement_ids?: string[];
};

export type BindAuthenticatedUserArgs = {
  userId: string;
  email?: string | null;
  displayName?: string | null;
  claimMethod?: "magic_link" | "google" | "session_restore";
  accessToken?: string;
};

type InflightBind = {
  userId: string;
  hasToken: boolean;
  controller: AbortController;
  promise: Promise<BindUserOrgResponse>;
};

let inflightBind: InflightBind | null = null;

export function resetWorkspaceBindInflightForTests(): void {
  inflightBind?.controller.abort();
  inflightBind = null;
}

function sameBindContext(current: InflightBind, args: BindAuthenticatedUserArgs): boolean {
  const userId = String(args.userId || "").trim();
  if (current.userId !== userId) return false;
  if (current.hasToken) return true;
  return !String(args.accessToken || "").trim();
}

async function performAuthenticatedWorkspaceBind(
  args: BindAuthenticatedUserArgs,
  signal: AbortSignal,
): Promise<BindUserOrgResponse> {
  const previousOrgId = getOrgId();
  const subscriptionSourceOrgId = readPaidCheckoutOrgId();
  const entitlementRepairCandidates = resolveEntitlementRepairOrgCandidates();
  const genesisDog = genesisDogOnboardingBindFields();
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
    signal,
    body: JSON.stringify({
      user_id: args.userId,
      email: args.email ?? undefined,
      display_name: args.displayName ?? undefined,
      previous_org_id: previousOrgId,
      subscription_source_org_id: subscriptionSourceOrgId ?? undefined,
      entitlement_repair_candidates:
        entitlementRepairCandidates.length > 0 ? entitlementRepairCandidates : undefined,
      claim_method: args.claimMethod ?? "unknown",
      ...(genesisDog
        ? {
            community_slug: genesisDog.community_slug,
            signup_intent: genesisDog.signup_intent,
            affiliate_candidate: genesisDog.affiliate_candidate,
          }
        : {}),
    }),
  });
  if (signal.aborted) {
    throw new DOMException("The operation was aborted.", "AbortError");
  }
  if (!res.ok) {
    throw new Error(await errorMessageFromResponse(res, "Could not bind workspace."));
  }
  const data = (await readJson<BindUserOrgResponse>(res)) as BindUserOrgResponse;
  if (data.org_id) {
    setOrgId(data.org_id);
  }
  if (genesisDog) {
    clearGenesisDogOnboardingIntent();
  }
  return data;
}

/** One in-flight bind per authenticated user. AuthProvider and create-page share this. */
export async function bindAuthenticatedUserToWorkspace(
  args: BindAuthenticatedUserArgs,
): Promise<BindUserOrgResponse> {
  const userId = String(args.userId || "").trim();
  if (!userId) {
    throw new Error("Could not bind workspace.");
  }
  if (inflightBind && sameBindContext(inflightBind, args)) {
    return inflightBind.promise;
  }
  if (inflightBind) {
    inflightBind.controller.abort();
    inflightBind = null;
  }
  const controller = new AbortController();
  const started = {
    userId,
    hasToken: Boolean(String(args.accessToken || "").trim()),
    controller,
    promise: null as unknown as Promise<BindUserOrgResponse>,
  };
  started.promise = performAuthenticatedWorkspaceBind(args, controller.signal).finally(() => {
    if (inflightBind === started) inflightBind = null;
  });
  inflightBind = started;
  return started.promise;
}

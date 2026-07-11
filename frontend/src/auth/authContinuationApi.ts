/**
 * Server-backed auth continuation transactions (survives new-tab magic links).
 */

import { apiUrl, errorMessageFromResponse, readJson } from "../lib/clawApi";
import { anonymousSessionHeaders } from "./anonymousSessionHeaders";
import type { AuthWorkflowStage } from "./authContinuationContext";
import { logAuthDiagnostic } from "./anonymousSessionApi";

const CONTINUATION_KEY = "claw_auth_continuation_id_v1";

export type AuthContinuationCreateResponse = {
  ok: boolean;
  continuation_id: string;
  expires_at: string;
  org_id: string;
};

export type FinalizeAuthResponse = {
  ok: boolean;
  org_id: string;
  user_id: string;
  destination_path: string;
  migrated_agreement_count: number;
  idempotent?: boolean;
};

export function writeContinuationId(id: string): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(CONTINUATION_KEY, id.trim());
  } catch {
    /* ignore */
  }
}

export function readContinuationId(): string | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    return sessionStorage.getItem(CONTINUATION_KEY)?.trim() || null;
  } catch {
    return null;
  }
}

export function clearContinuationId(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(CONTINUATION_KEY);
  } catch {
    /* ignore */
  }
}

export async function createServerAuthContinuation(args: {
  agreementId?: string;
  destinationPath: string;
  workflowStage: AuthWorkflowStage;
  authPurpose?: string;
  provider?: string;
  returningSignIn?: boolean;
}): Promise<AuthContinuationCreateResponse> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (!args.returningSignIn) {
    Object.assign(headers, anonymousSessionHeaders());
  }
  const res = await fetch(apiUrl("/v1/workspace/auth-continuation"), {
    method: "POST",
    headers,
    credentials: "include",
    body: JSON.stringify({
      agreement_id: args.agreementId,
      destination_path: args.destinationPath,
      workflow_stage: args.workflowStage,
      auth_purpose: args.returningSignIn ? "returning_sign_in" : args.authPurpose,
      provider: args.provider,
    }),
  });
  if (!res.ok) {
    throw new Error(await errorMessageFromResponse(res, "Could not save sign-in continuation."));
  }
  const data = (await readJson<AuthContinuationCreateResponse>(res)) as AuthContinuationCreateResponse;
  writeContinuationId(data.continuation_id);
  logAuthDiagnostic("auth_continuation_created", {
    continuation_id: data.continuation_id,
    org_id: data.org_id,
  });
  return data;
}

export async function finalizeAuthOnServer(args: {
  continuationId: string;
  accessToken: string;
  claimMethod: "magic_link" | "google" | "session_restore";
  subscriptionSourceOrgId?: string | null;
  entitlementRepairCandidates?: string[];
}): Promise<FinalizeAuthResponse> {
  const res = await fetch(apiUrl("/v1/workspace/finalize-auth"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${args.accessToken}`,
      ...anonymousSessionHeaders(),
    },
    credentials: "include",
    body: JSON.stringify({
      continuation_id: args.continuationId,
      claim_method: args.claimMethod,
      subscription_source_org_id: args.subscriptionSourceOrgId ?? undefined,
      entitlement_repair_candidates:
        args.entitlementRepairCandidates && args.entitlementRepairCandidates.length > 0
          ? args.entitlementRepairCandidates
          : undefined,
    }),
  });
  if (!res.ok) {
    throw new Error(await errorMessageFromResponse(res, "Could not complete sign-in."));
  }
  const data = (await readJson<FinalizeAuthResponse>(res)) as FinalizeAuthResponse;
  clearContinuationId();
  logAuthDiagnostic("auth_finalize_completed", {
    org_id: data.org_id,
    migrated_agreement_count: data.migrated_agreement_count,
    destination_path: data.destination_path,
  });
  return data;
}

/**
 * Server-backed auth continuation transactions (survives new-tab magic links).
 */

import { apiUrl, readJson } from "../lib/clawApi";
import {
  clearGenesisDogOnboardingIntent,
  genesisDogOnboardingBindFields,
} from "../launch/genesisReferral/genesisDogOnboardingCapture";
import { anonymousSessionHeaders } from "./anonymousSessionHeaders";
import { AuthContinuationFailure } from "./authUserFacingCopy";
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
  migrated_agreement_ids?: string[];
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
    throw new AuthContinuationFailure(await readAuthFailureCode(res, "continuation_create_failed"));
  }
  const data = (await readJson<AuthContinuationCreateResponse>(res)) as AuthContinuationCreateResponse;
  writeContinuationId(data.continuation_id);
  logAuthDiagnostic("auth_continuation_created", {
    org_id: data.org_id,
    has_agreement: Boolean(args.agreementId),
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
  const genesisDog = genesisDogOnboardingBindFields();
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
      ...(genesisDog
        ? {
            community_slug: genesisDog.community_slug,
            signup_intent: genesisDog.signup_intent,
            affiliate_candidate: genesisDog.affiliate_candidate,
          }
        : {}),
    }),
  });
  if (!res.ok) {
    throw new AuthContinuationFailure(await readAuthFailureCode(res, "finalize_failed"));
  }
  let data: FinalizeAuthResponse = {
    ok: true,
    org_id: "",
    user_id: "",
    destination_path: "/app",
    migrated_agreement_count: 0,
  };
  try {
    const parsed = (await readJson<FinalizeAuthResponse>(res)) as FinalizeAuthResponse;
    if (parsed && typeof parsed === "object") {
      data = { ...data, ...parsed };
    }
  } catch {
    /* HTTP 200 already consumed the continuation — do not fail closed on a parse miss. */
  }
  try {
    clearContinuationId();
    if (genesisDog) {
      clearGenesisDogOnboardingIntent();
    }
    logAuthDiagnostic("auth_finalize_completed", {
      org_id: data.org_id,
      migrated_agreement_count: data.migrated_agreement_count,
      idempotent: Boolean(data.idempotent),
    });
  } catch {
    /* Clearing helpers must not undo a successful server finalize. */
  }
  return {
    ok: true,
    org_id: String(data?.org_id || "").trim(),
    user_id: String(data?.user_id || "").trim(),
    destination_path: String(data?.destination_path || "/app"),
    migrated_agreement_count: Number(data?.migrated_agreement_count || 0),
    migrated_agreement_ids: data?.migrated_agreement_ids,
    idempotent: Boolean(data?.idempotent),
  };
}

async function readAuthFailureCode(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await readJson<{ detail?: unknown }>(res)) as { detail?: unknown };
    const detail = body?.detail;
    if (typeof detail === "object" && detail && "code" in detail) {
      const code = String((detail as { code?: unknown }).code || "").trim();
      if (code) return code;
    }
  } catch {
    /* use fallback */
  }
  return fallback;
}

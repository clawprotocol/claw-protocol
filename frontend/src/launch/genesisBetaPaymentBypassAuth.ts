/**
 * Server-authoritative QA payment bypass authorization for public production hosts.
 * Frontend never decides bypass from storage, query params, env vars, or Supabase claims alone.
 */

import { apiUrl } from "../lib/clawApi";

export type GenesisBetaPaymentBypassAuth = {
  readonly authorized: boolean;
  readonly reason: string;
  readonly checkedAt: string;
};

function utcNowIso(): string {
  return new Date().toISOString();
}

function denied(reason: string): GenesisBetaPaymentBypassAuth {
  return { authorized: false, reason, checkedAt: utcNowIso() };
}

/** Bootstrap-only: exchange admin secret for a short-lived httpOnly session cookie. */
export async function bootstrapQaPaymentBypassAdminSession(adminSecret: string): Promise<boolean> {
  const secret = adminSecret.trim();
  if (!secret) return false;
  try {
    const res = await fetch(apiUrl("/v1/workspace/qa-payment-bypass/session"), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ admin_secret: secret }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function refreshGenesisBetaPaymentBypassAuth(
  userId?: string | null,
): Promise<GenesisBetaPaymentBypassAuth> {
  const uid = (userId || "").trim();
  const headers: Record<string, string> = {};
  if (uid) headers["X-Claw-User-Id"] = uid;

  try {
    const res = await fetch(apiUrl("/v1/workspace/qa-payment-bypass/authorization"), {
      method: "GET",
      credentials: "include",
      headers,
    });
    if (!res.ok) {
      return denied("auth_endpoint_error");
    }
    let data: unknown;
    try {
      data = await res.json();
    } catch {
      return denied("auth_malformed_response");
    }
    if (!data || typeof data !== "object" || typeof (data as { authorized?: unknown }).authorized !== "boolean") {
      return denied("auth_malformed_response");
    }
    const body = data as { authorized: boolean; reason?: string };
    return {
      authorized: body.authorized,
      reason: String(body.reason || (body.authorized ? "authorized" : "not_authorized")),
      checkedAt: utcNowIso(),
    };
  } catch {
    return denied("auth_endpoint_unreachable");
  }
}

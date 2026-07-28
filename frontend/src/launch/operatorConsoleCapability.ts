/**
 * Backend-authoritative Admin Console capability (active support_operator / admin).
 * Never infer operator access from client-only flags or localStorage.
 */

import { clawAgreementHeaders } from "../agreement/agreementOrgHeaders";
import { resolveApiBase } from "../lib/clawApi";

export type OperatorConsoleCapability = {
  authorized: boolean;
  role: "support_operator" | "admin" | null;
  userId: string | null;
};

const DENIED: OperatorConsoleCapability = {
  authorized: false,
  role: null,
  userId: null,
};

function normalizeRole(raw: unknown): OperatorConsoleCapability["role"] {
  const role = String(raw || "").trim().toLowerCase();
  if (role === "support_operator" || role === "operator") return "support_operator";
  if (role === "admin") return "admin";
  return null;
}

/** GET /v1/admin/operators/me — JWT principal + admin_users registry. */
export async function fetchOperatorConsoleCapability(): Promise<OperatorConsoleCapability> {
  try {
    const res = await fetch(`${resolveApiBase().replace(/\/$/, "")}/v1/admin/operators/me`, {
      method: "GET",
      credentials: "include",
      headers: clawAgreementHeaders(),
    });
    if (!res.ok) return DENIED;
    const data = (await res.json()) as {
      authorized?: unknown;
      role?: unknown;
      user_id?: unknown;
    };
    const role = normalizeRole(data.role);
    const authorized = Boolean(data.authorized) && role != null;
    return {
      authorized,
      role: authorized ? role : null,
      userId: typeof data.user_id === "string" ? data.user_id : null,
    };
  } catch {
    return DENIED;
  }
}

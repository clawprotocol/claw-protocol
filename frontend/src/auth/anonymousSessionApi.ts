/**
 * Server-minted anonymous workspace session (credential required for anon-* org access).
 */

import { apiUrl, errorMessageFromResponse, readJson } from "../lib/clawApi";
import { setOrgId } from "../launch/orgContext";

const TOKEN_KEY = "claw_anon_session_token_v1";
const SESSION_ID_KEY = "claw_anon_session_id_v1";

export type AnonymousSessionResponse = {
  ok: boolean;
  org_id: string;
  session_id: string;
  token: string;
  expires_in_seconds: number;
};

export function readAnonymousSessionToken(): string | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const v = sessionStorage.getItem(TOKEN_KEY)?.trim();
    return v || null;
  } catch {
    return null;
  }
}

export function writeAnonymousSession(args: {
  orgId: string;
  sessionId: string;
  token: string;
}): void {
  setOrgId(args.orgId);
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(TOKEN_KEY, args.token);
    sessionStorage.setItem(SESSION_ID_KEY, args.sessionId);
  } catch {
    /* ignore */
  }
}

export function clearAnonymousSession(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(SESSION_ID_KEY);
  } catch {
    /* ignore */
  }
}

export function readAnonymousSessionId(): string | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    return sessionStorage.getItem(SESSION_ID_KEY)?.trim() || null;
  } catch {
    return null;
  }
}

let bootstrapPromise: Promise<AnonymousSessionResponse> | null = null;

export async function ensureAnonymousSession(): Promise<AnonymousSessionResponse> {
  const existing = readAnonymousSessionToken();
  if (existing) {
    return {
      ok: true,
      org_id: "",
      session_id: readAnonymousSessionId() ?? "",
      token: existing,
      expires_in_seconds: 0,
    };
  }
  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      const res = await fetch(apiUrl("/v1/workspace/anonymous-session"), {
        method: "POST",
        headers: { Accept: "application/json" },
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error(await errorMessageFromResponse(res, "Could not start anonymous workspace."));
      }
      const data = (await readJson<AnonymousSessionResponse>(res)) as AnonymousSessionResponse;
      writeAnonymousSession({
        orgId: data.org_id,
        sessionId: data.session_id,
        token: data.token,
      });
      logAuthDiagnostic("anonymous_session_created", {
        org_id: data.org_id,
        session_id: data.session_id,
      });
      return data;
    })().finally(() => {
      bootstrapPromise = null;
    });
  }
  return bootstrapPromise;
}

export function logAuthDiagnostic(event: string, payload?: Record<string, unknown>): void {
  if (import.meta.env.PROD && String(import.meta.env.VITE_CLAW_AUTH_DIAGNOSTICS ?? "").trim() !== "1") {
    return;
  }
  try {
    // eslint-disable-next-line no-console
    console.info(`[lawdog-auth] ${event}`, payload ?? {});
  } catch {
    /* ignore */
  }
}

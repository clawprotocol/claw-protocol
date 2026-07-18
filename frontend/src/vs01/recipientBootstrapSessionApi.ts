/**
 * Phase 3C2A recipient bootstrap session API (cookie auth).
 */

export type RecipientBootstrapSessionStatus = {
  ok: boolean;
  authenticated: boolean;
  signer_display_name?: string;
  document_label?: string;
  expires_at?: string;
  readiness?: string;
};

export type RecipientBootstrapExchangeResult =
  | { ok: true; status: RecipientBootstrapSessionStatus }
  | { ok: false; code: string; message: string };

const GENERIC_FAILURE_MESSAGE =
  "This signing link is invalid, expired, or no longer available.";

async function parseJson(res: Response): Promise<Record<string, unknown>> {
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function exchangeRecipientBootstrapToken(
  token: string,
): Promise<RecipientBootstrapExchangeResult> {
  const res = await fetch("/api/recipient/bootstrap/exchange", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: token.trim() }),
  });
  const body = await parseJson(res);
  if (!res.ok) {
    const detail = (body.detail as Record<string, unknown> | undefined) ?? body;
    return {
      ok: false,
      code: String(detail.code ?? "bootstrap_invalid_or_expired"),
      message: String(detail.message ?? GENERIC_FAILURE_MESSAGE),
    };
  }
  return { ok: true, status: body as RecipientBootstrapSessionStatus };
}

export async function fetchRecipientBootstrapSessionStatus(): Promise<RecipientBootstrapSessionStatus> {
  const res = await fetch("/api/recipient/session/status", {
    method: "GET",
    credentials: "include",
  });
  const body = await parseJson(res);
  return body as RecipientBootstrapSessionStatus;
}

export async function logoutRecipientBootstrapSession(): Promise<RecipientBootstrapSessionStatus> {
  const res = await fetch("/api/recipient/session/logout", {
    method: "POST",
    credentials: "include",
  });
  const body = await parseJson(res);
  return body as RecipientBootstrapSessionStatus;
}

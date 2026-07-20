/**
 * GTM Security Slice 3B negotiation-review session API (cookie auth).
 */

import { resolveApiBase } from "../lib/clawApi";

export type NegotiationReviewSessionStatus = {
  ok: boolean;
  authenticated: boolean;
  agreement_id?: string;
  recipient_party_id?: string | null;
  role?: string;
  locked_version_id?: string | null;
  recipient_display_name?: string;
  agreement_title?: string;
  expires_at?: string;
  readiness?: "unauthenticated" | "session_invalid" | "session_established" | string;
};

export type NegotiationReviewBootstrapExchangeResult =
  | { ok: true; status: NegotiationReviewSessionStatus }
  | { ok: false; code: string; message: string };

const GENERIC_FAILURE_MESSAGE =
  "This review link is invalid, expired, or no longer available.";

const API_BASE = resolveApiBase().replace(/\/$/, "");

function negotiationReviewUrl(path: string): string {
  return `${API_BASE}${path}`;
}

async function parseJson(res: Response): Promise<Record<string, unknown>> {
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function exchangeNegotiationReviewBootstrapToken(
  token: string,
): Promise<NegotiationReviewBootstrapExchangeResult> {
  const res = await fetch(negotiationReviewUrl("/api/negotiation-review/bootstrap/exchange"), {
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
      code: String(detail.code ?? "review_bootstrap_invalid_or_expired"),
      message: String(detail.message ?? GENERIC_FAILURE_MESSAGE),
    };
  }
  return { ok: true, status: body as NegotiationReviewSessionStatus };
}

export async function fetchNegotiationReviewSessionStatus(): Promise<NegotiationReviewSessionStatus> {
  const res = await fetch(negotiationReviewUrl("/api/negotiation-review/session/status"), {
    method: "GET",
    credentials: "include",
  });
  const body = await parseJson(res);
  return body as NegotiationReviewSessionStatus;
}

export async function logoutNegotiationReviewSession(): Promise<NegotiationReviewSessionStatus> {
  const res = await fetch(negotiationReviewUrl("/api/negotiation-review/session/logout"), {
    method: "POST",
    credentials: "include",
  });
  const body = await parseJson(res);
  const status = body as NegotiationReviewSessionStatus;
  if (!res.ok) {
    return { ...status, ok: false, authenticated: true };
  }
  return { ...status, ok: true, authenticated: false };
}

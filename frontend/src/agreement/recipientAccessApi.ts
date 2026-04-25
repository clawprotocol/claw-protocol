import { clawAgreementHeaders } from "./agreementOrgHeaders";
import { loadRecipientMagicLinkSession } from "./recipientMagicLinkSession";

import { resolveApiBase } from "../lib/clawApi";

const API_BASE = resolveApiBase();

export type RecipientAccessPolicy = {
  recipient_link_token_required: boolean;
  mint_key_configured: boolean;
  signing_token_configured: boolean;
  recipient_token_ttl_seconds?: { min: number; max: number };
};

export type ValidatedRecipientAccess = {
  ok: boolean;
  agreement_id: string;
  mode: string;
  locked_version_id: string;
  role?: string;
  recipient_party_id?: string | null;
  inviter_display_name?: string | null;
};

export type RecipientAccessValidationResult =
  | { ok: true; data: ValidatedRecipientAccess }
  | { ok: false; code: string; message: string };

const DEFAULT_INVALID_MESSAGE =
  "This link is invalid or expired. Request a new link from the sender.";

/** Headers for full draft GET/render when the caller has a minted recipient link token. */
export function recipientAgreementReadHeaders(
  agreementId: string,
  explicitToken?: string | null,
): Record<string, string> {
  const fromProp = (explicitToken || "").trim();
  const fromSession = loadRecipientMagicLinkSession(agreementId)?.token?.trim() || "";
  const t = fromProp || fromSession;
  if (!t) return {};
  return { "X-Claw-Recipient-Access-Token": t };
}

function parseAccessErrorBody(raw: unknown): { code: string; message: string } {
  if (!raw || typeof raw !== "object") {
    return { code: "unknown", message: DEFAULT_INVALID_MESSAGE };
  }
  const o = raw as Record<string, unknown>;
  const detail = o.detail;
  if (detail && typeof detail === "object") {
    const d = detail as Record<string, unknown>;
    const code = typeof d.code === "string" ? d.code : "access_denied";
    const message = typeof d.message === "string" ? d.message : DEFAULT_INVALID_MESSAGE;
    return { code, message };
  }
  if (typeof detail === "string") {
    return { code: "access_denied", message: DEFAULT_INVALID_MESSAGE };
  }
  return { code: "unknown", message: DEFAULT_INVALID_MESSAGE };
}

export async function fetchRecipientAccessPolicy(): Promise<RecipientAccessPolicy | null> {
  try {
    const res = await fetch(`${API_BASE.replace(/\/$/, "")}/api/agreements/access/policy`);
    if (!res.ok) return null;
    return (await res.json()) as RecipientAccessPolicy;
  } catch {
    return null;
  }
}

export async function validateRecipientAccessToken(
  token: string,
  agreementId?: string
): Promise<RecipientAccessValidationResult> {
  const base = `${API_BASE.replace(/\/$/, "")}/api/agreements/access/validate`;
  const q = new URLSearchParams();
  q.set("token", token);
  const aid = (agreementId || "").trim();
  if (aid) q.set("agreement_id", aid);
  const res = await fetch(`${base}?${q.toString()}`);
  const raw = await res.json().catch(() => ({}));
  if (!res.ok) {
    const { code, message } = parseAccessErrorBody(raw);
    return { ok: false, code, message };
  }
  return { ok: true, data: raw as ValidatedRecipientAccess };
}

export async function mintRecipientAccessToken(
  agreementId: string,
  body: {
    mode?: "sign" | "review";
    role?: "recipient" | "reviewer" | "signer";
    ttl_seconds?: number;
    recipient_party_id?: string;
    inviter_display_name?: string;
    single_use?: boolean;
    recipient_subject?: string;
  },
  mintKey?: string
): Promise<{ token: string; expires_in_seconds: number; locked_version_id: string } | null> {
  const headers: Record<string, string> = {
    ...(clawAgreementHeaders({ "Content-Type": "application/json" }) as Record<string, string>),
  };
  if (mintKey?.trim()) headers["X-Claw-Recipient-Link-Mint-Key"] = mintKey.trim();
  const res = await fetch(
    `${API_BASE.replace(/\/$/, "")}/api/agreements/${encodeURIComponent(agreementId)}/recipient-access-token`,
    { method: "POST", headers, body: JSON.stringify(body) }
  );
  if (!res.ok) return null;
  return (await res.json()) as { token: string; expires_in_seconds: number; locked_version_id: string };
}

export async function putSigningLock(
  agreementId: string,
  payload: { locked_version_id: string; locked_at: string; locked_by: string }
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(
    `${API_BASE.replace(/\/$/, "")}/api/agreements/${encodeURIComponent(agreementId)}/signing-lock`,
    {
      method: "PUT",
      headers: clawAgreementHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        locked_version_id: payload.locked_version_id,
        locked_at: payload.locked_at,
        locked_by: payload.locked_by,
      }),
    }
  );
  if (res.ok) return { ok: true };
  const j = (await res.json().catch(() => ({}))) as { detail?: unknown };
  const d = j.detail;
  const msg =
    typeof d === "string"
      ? d
      : d && typeof d === "object" && "code" in (d as object)
        ? JSON.stringify(d)
        : `error_${res.status}`;
  return { ok: false, error: msg };
}

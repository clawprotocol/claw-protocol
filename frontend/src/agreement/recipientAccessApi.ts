import { clawAgreementHeaders } from "./agreementOrgHeaders";
import { resolveApiBase } from "../lib/clawApi";
import {
  buildRecipientAccessMintBody,
  logRecipientAccessMint422,
  logRecipientAccessMintPreflight,
  type RecipientAccessMintBodyInput,
} from "./recipientAccessMintPayload";
import {
  normalizeMintRecipientAccessTokenBody,
  type MintRecipientAccessTokenSuccess,
} from "./recipientAccessMintNormalize";

const API_BASE = resolveApiBase();

export type { MintRecipientAccessTokenSuccess };
export { normalizeMintRecipientAccessTokenBody };

export type RecipientAccessPolicy = {
  recipient_link_token_required: boolean;
  mint_key_configured: boolean;
  signing_token_configured: boolean;
  review_link_mint_enabled?: boolean;
  /** Set env var name when configured — never the secret value. */
  signing_token_env_var_detected?: string | null;
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
  _agreementId: string,
  explicitToken?: string | null,
): Record<string, string> {
  const t = (explicitToken || "").trim();
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

export type MintRecipientAccessTokenResult =
  | { ok: true; data: MintRecipientAccessTokenSuccess }
  | { ok: false; status: number; detail?: string; code?: string; message?: string };

/** Same as POST mint but surfaces HTTP status (e.g. 409) for recoverable routing without guessing from null. */
export async function mintRecipientAccessTokenResult(
  agreementId: string,
  body: RecipientAccessMintBodyInput,
  mintKey?: string,
  preflight?: {
    recipientCount?: number;
    signerCount?: number;
    hasDocumentText?: boolean;
    documentTextLen?: number;
    hasTitle?: boolean;
    hasPartyLabels?: boolean;
    documentTextSource?: string | null;
  },
): Promise<MintRecipientAccessTokenResult> {
  const headers: Record<string, string> = {
    ...(clawAgreementHeaders({ "Content-Type": "application/json" }) as Record<string, string>),
  };
  if (mintKey?.trim()) headers["X-Claw-Recipient-Link-Mint-Key"] = mintKey.trim();
  const payload = buildRecipientAccessMintBody(body);
  logRecipientAccessMintPreflight({
    agreementId,
    body: payload,
    ...preflight,
  });
  const res = await fetch(
    `${API_BASE.replace(/\/$/, "")}/api/agreements/${encodeURIComponent(agreementId)}/recipient-access-token`,
    { method: "POST", headers, body: JSON.stringify(payload) },
  );
  const raw = await res.json().catch(() => ({}));
  if (!res.ok) {
    const d = raw && typeof raw === "object" ? (raw as { detail?: unknown }).detail : undefined;
    if (res.status === 422) logRecipientAccessMint422(d, res.status);
    const detail =
      typeof d === "string"
        ? d
        : d && typeof d === "object"
          ? JSON.stringify(d).slice(0, 600)
          : "";
    let code: string | undefined;
    let message: string | undefined;
    if (d && typeof d === "object") {
      const o = d as Record<string, unknown>;
      if (typeof o.code === "string") code = o.code;
      if (typeof o.message === "string") message = o.message;
    }
    return { ok: false, status: res.status, detail: detail || undefined, code, message };
  }
  const normalized = normalizeMintRecipientAccessTokenBody(raw, body.recipient_party_id);
  if (!normalized) {
    return { ok: false, status: res.status, detail: "invalid_mint_payload", code: "invalid_mint_payload" };
  }
  const hasToken = Boolean(normalized.token?.trim());
  const hasReviewUrl = Boolean(normalized.review_url?.trim());
  if (!hasToken && !hasReviewUrl) {
    return { ok: false, status: res.status, detail: "invalid_mint_payload", code: "invalid_mint_payload" };
  }
  return { ok: true, data: normalized };
}

export async function mintRecipientAccessToken(
  agreementId: string,
  body: RecipientAccessMintBodyInput,
  mintKey?: string,
): Promise<{ token: string; expires_in_seconds: number; locked_version_id: string } | null> {
  const r = await mintRecipientAccessTokenResult(agreementId, body, mintKey);
  if (!r.ok) return null;
  const tok = r.data.token?.trim();
  if (!tok) return null;
  return {
    token: tok,
    expires_in_seconds: r.data.expires_in_seconds,
    locked_version_id: r.data.locked_version_id.trim() || "unknown",
  };
}

export async function putSigningLock(
  agreementId: string,
  payload: {
    accepted_version_id: string;
    corpus_sha256: string;
    locked_at: string;
    locked_by: string;
  }
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(
    `${API_BASE.replace(/\/$/, "")}/api/agreements/${encodeURIComponent(agreementId)}/signing-lock`,
    {
      method: "PUT",
      headers: clawAgreementHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        accepted_version_id: payload.accepted_version_id,
        corpus_sha256: payload.corpus_sha256,
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

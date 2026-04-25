import { postProductSignupLegalAssent } from "./productSignupLegalAssentApi";

const STORAGE_KEY = "lawdog_tos_privacy_ack_v1";

/** Bump when Terms/Privacy assent semantics change; invalidates prior client-only acks. */
export const PRODUCT_LEGAL_ACK_VERSION = 2;

/** Stable ids for analytics, server assent rows, and audit alignment. */
export const PRODUCT_LEGAL_TERMS_VERSION_ID = `lawdog_product_legal_v${PRODUCT_LEGAL_ACK_VERSION}`;
export const PRODUCT_LEGAL_PRIVACY_VERSION_ID = `lawdog_product_privacy_v${PRODUCT_LEGAL_ACK_VERSION}`;

export type ProductLegalAssentRecord = {
  v: number;
  /** ISO-8601 timestamp when the user assented. */
  at: string;
  terms_version_id: string;
  privacy_version_id: string;
  /** Correlates client backup with server row when posted successfully. */
  client_assent_id: string;
  server_assent_id?: string;
  server_recorded_at?: string;
};

export function readProductLegalAccepted(): boolean {
  return readProductLegalAcceptanceDetail() != null;
}

export function readProductLegalAcceptanceDetail(): ProductLegalAssentRecord | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as {
      v?: number;
      at?: string;
      terms_version_id?: string;
      privacy_version_id?: string;
      client_assent_id?: string;
      server_assent_id?: string;
      server_recorded_at?: string;
    };
    if (p?.v !== PRODUCT_LEGAL_ACK_VERSION || typeof p.at !== "string" || !p.at.trim()) return null;
    const terms_version_id =
      typeof p.terms_version_id === "string" && p.terms_version_id.trim()
        ? p.terms_version_id
        : PRODUCT_LEGAL_TERMS_VERSION_ID;
    const privacy_version_id =
      typeof p.privacy_version_id === "string" && p.privacy_version_id.trim()
        ? p.privacy_version_id
        : PRODUCT_LEGAL_PRIVACY_VERSION_ID;
    const client_assent_id =
      typeof p.client_assent_id === "string" && p.client_assent_id.trim() ? p.client_assent_id : "";
    if (!client_assent_id) return null;
    const out: ProductLegalAssentRecord = { v: p.v, at: p.at, terms_version_id, privacy_version_id, client_assent_id };
    if (typeof p.server_assent_id === "string" && p.server_assent_id.trim()) {
      out.server_assent_id = p.server_assent_id.trim();
    }
    if (typeof p.server_recorded_at === "string" && p.server_recorded_at.trim()) {
      out.server_recorded_at = p.server_recorded_at.trim();
    }
    return out;
  } catch {
    return null;
  }
}

/**
 * Records assent on the server when reachable, then mirrors to localStorage as backup.
 */
export async function persistProductLegalAcceptanceAsync(opts: {
  auth_path: "email" | "google";
  user_ref?: string | null;
  org_id?: string | null;
  authenticated_user_id?: string | null;
  meta?: Record<string, unknown>;
}): Promise<ProductLegalAssentRecord | null> {
  if (typeof window === "undefined") return null;
  const at = new Date().toISOString();
  const client_assent_id = crypto.randomUUID();
  const base: ProductLegalAssentRecord = {
    v: PRODUCT_LEGAL_ACK_VERSION,
    at,
    terms_version_id: PRODUCT_LEGAL_TERMS_VERSION_ID,
    privacy_version_id: PRODUCT_LEGAL_PRIVACY_VERSION_ID,
    client_assent_id,
  };

  const server = await postProductSignupLegalAssent({
    assent_timestamp_iso: at,
    terms_version_id: base.terms_version_id,
    privacy_version_id: base.privacy_version_id,
    legal_ack_version: base.v,
    user_ref: opts.user_ref ?? undefined,
    org_id: opts.org_id ?? undefined,
    authenticated_user_id: opts.authenticated_user_id ?? undefined,
    client_assent_id,
    auth_path: opts.auth_path,
    meta: opts.meta,
  });

  const rec: ProductLegalAssentRecord = server?.assent_id
    ? {
        ...base,
        server_assent_id: server.assent_id,
        server_recorded_at: new Date().toISOString(),
      }
    : base;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rec));
  } catch {
    /* ignore */
  }
  return rec;
}

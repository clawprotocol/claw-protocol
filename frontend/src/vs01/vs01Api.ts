import { apiUrl, resolveApiBase } from "../lib/clawApi";
import { vs01SensitiveReadFetchInit, vs01SensitiveReadHeaders, type Vs01SensitiveReadAuth } from "./vs01ReadHeaders";
import { clawAgreementHeaders } from "../agreement/agreementOrgHeaders";

function apiBase(): string {
  return resolveApiBase().replace(/\/$/, "");
}

function messageFromJsonBody(data: unknown, fallback: string): string {
  if (typeof data !== "object" || data === null) return fallback;
  const d = data as { detail?: unknown };
  if (typeof d.detail === "string") return d.detail;
  if (Array.isArray(d.detail)) {
    const parts = d.detail.map((x) =>
      typeof x === "object" && x !== null && "msg" in x
        ? String((x as { msg: string }).msg)
        : String(x)
    );
    return parts.join("; ") || fallback;
  }
  if (d.detail != null) return JSON.stringify(d.detail);
  return fallback;
}

/** Stable backend detail when legacy filesystem sign-sessions are production-disabled. */
export const LEGACY_SIGNING_DEFERRED_DETAIL = "legacy_signing_session_deferred_until_3c2c";

export const LEGACY_SIGNING_UNAVAILABLE_MESSAGE =
  "Secure signing is not available in this environment yet. Please try again after a future update.";

export class LegacySigningDeferredError extends Error {
  readonly deferredDetail = LEGACY_SIGNING_DEFERRED_DETAIL;

  constructor(message: string = LEGACY_SIGNING_UNAVAILABLE_MESSAGE) {
    super(message);
    this.name = "LegacySigningDeferredError";
  }
}

export function isLegacySigningDeferredResponse(
  status: number,
  data: unknown
): boolean {
  if (status !== 409 || typeof data !== "object" || data === null) return false;
  return (data as { detail?: unknown }).detail === LEGACY_SIGNING_DEFERRED_DETAIL;
}

function throwIfLegacySigningDeferred(status: number, data: unknown): void {
  if (isLegacySigningDeferredResponse(status, data)) {
    throw new LegacySigningDeferredError();
  }
}

export type FinalizeDocumentResponse = {
  ok?: boolean;
  document_id?: string;
  content_sha256?: string;
  content_type?: string;
  created_at?: string;
  size_bytes?: number;
  [key: string]: unknown;
};

/**
 * POST /v1/documents — finalize raw document bytes.
 */
export async function finalizeDocument(
  contentBase64: string,
  contentType?: string
): Promise<FinalizeDocumentResponse> {
  const base = apiBase();
  const url = `${base}/v1/documents`;
  const body: { content_base64: string; content_type?: string } = {
    content_base64: contentBase64,
  };
  if (contentType && contentType.trim()) {
    body.content_type = contentType.trim();
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...clawAgreementHeaders(),
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let data: FinalizeDocumentResponse;
  try {
    data = text ? (JSON.parse(text) as FinalizeDocumentResponse) : {};
  } catch {
    if (!res.ok) {
      throw new Error(text || `${res.status} ${res.statusText}`);
    }
    throw new Error("Invalid JSON response");
  }

  if (!res.ok) {
    throw new Error(messageFromJsonBody(data, text || `${res.status} ${res.statusText}`));
  }

  return data;
}

export type CreateSignSessionResponse = {
  ok?: boolean;
  session?: { session_id?: string; [key: string]: unknown };
  session_id?: string;
  [key: string]: unknown;
};

/**
 * POST /v1/sign-sessions — bind document + expected content hash.
 */
export async function createSignSession(
  documentId: string,
  contentSha256: string,
  auth?: Vs01SensitiveReadAuth
): Promise<CreateSignSessionResponse> {
  const base = apiBase();
  const url = `${base}/v1/sign-sessions`;
  const body = {
    document_id: documentId,
    content_sha256: contentSha256.toLowerCase(),
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...vs01SensitiveReadHeaders(auth),
    },
    credentials: auth?.includeSessionCookie ? "include" : "same-origin",
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let data: CreateSignSessionResponse;
  try {
    data = text ? (JSON.parse(text) as CreateSignSessionResponse) : {};
  } catch {
    if (!res.ok) {
      throw new Error(text || `${res.status} ${res.statusText}`);
    }
    throw new Error("Invalid JSON response");
  }

  if (!res.ok) {
    throwIfLegacySigningDeferred(res.status, data);
    throw new Error(messageFromJsonBody(data, text || `${res.status} ${res.statusText}`));
  }

  return data;
}

/**
 * GET /v1/documents/{document_id}/content — raw document bytes (e.g. PDF for preview).
 */
export async function fetchDocumentContent(
  documentId: string,
  auth?: Vs01SensitiveReadAuth
): Promise<Blob> {
  const enc = encodeURIComponent(documentId.trim());
  const url = apiUrl(`/v1/documents/${enc}/content`);

  const res = await fetch(url, { method: "GET", ...vs01SensitiveReadFetchInit(auth) });

  if (!res.ok) {
    const text = await res.text();
    let msg = text || `${res.status} ${res.statusText}`;
    try {
      const parsed = text ? JSON.parse(text) : {};
      msg = messageFromJsonBody(parsed, msg);
    } catch {
      /* use msg as-is */
    }
    throw new Error(msg);
  }

  return res.blob();
}

export type FieldManifestEntry = {
  field_id: string;
  page_index: number;
  x: number;
  y: number;
  w: number;
  h: number;
};

export type CompleteSignSessionPayload = {
  signer_ref: string;
  intent: string;
  field_manifest: FieldManifestEntry[];
};

export type CompleteSignSessionResponse = {
  ok?: boolean;
  receipt_id?: string;
  receipt_hash_sha256?: string;
  receipt?: unknown;
  [key: string]: unknown;
};

/**
 * POST /v1/sign-sessions/{session_id}/complete — issue receipt.
 */
export async function completeSignSession(
  sessionId: string,
  payload: CompleteSignSessionPayload,
  auth?: Vs01SensitiveReadAuth
): Promise<CompleteSignSessionResponse> {
  const base = apiBase();
  const enc = encodeURIComponent(sessionId);
  const url = `${base}/v1/sign-sessions/${enc}/complete`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...vs01SensitiveReadHeaders(auth),
    },
    credentials: auth?.includeSessionCookie ? "include" : "same-origin",
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  let data: CompleteSignSessionResponse;
  try {
    data = text ? (JSON.parse(text) as CompleteSignSessionResponse) : {};
  } catch {
    if (!res.ok) {
      throw new Error(text || `${res.status} ${res.statusText}`);
    }
    throw new Error("Invalid JSON response");
  }

  if (!res.ok) {
    throwIfLegacySigningDeferred(res.status, data);
    throw new Error(messageFromJsonBody(data, text || `${res.status} ${res.statusText}`));
  }

  return data;
}

export type GetReceiptResponse = {
  ok?: boolean;
  receipt?: unknown;
  receipt_hash_sha256?: string;
  [key: string]: unknown;
};

/**
 * GET /v1/receipts/{receipt_id}
 */
export async function getReceipt(
  receiptId: string,
  auth?: Vs01SensitiveReadAuth
): Promise<GetReceiptResponse> {
  const base = apiBase();
  const enc = encodeURIComponent(receiptId);
  const url = `${base}/v1/receipts/${enc}`;

  const res = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json", ...vs01SensitiveReadHeaders(auth) },
  });

  const text = await res.text();
  let data: GetReceiptResponse;
  try {
    data = text ? (JSON.parse(text) as GetReceiptResponse) : {};
  } catch {
    if (!res.ok) {
      throw new Error(text || `${res.status} ${res.statusText}`);
    }
    throw new Error("Invalid JSON response");
  }

  if (!res.ok) {
    throw new Error(messageFromJsonBody(data, text || `${res.status} ${res.statusText}`));
  }

  return data;
}

/**
 * GET /v1/receipts/{receipt_id}/bundle — verification zip bytes.
 */
export async function downloadBundle(
  receiptId: string,
  auth?: Vs01SensitiveReadAuth
): Promise<Blob> {
  const base = apiBase();
  const enc = encodeURIComponent(receiptId);
  const url = `${base}/v1/receipts/${enc}/bundle`;

  const res = await fetch(url, { method: "GET", ...vs01SensitiveReadFetchInit(auth) });

  if (!res.ok) {
    const text = await res.text();
    let msg = text || `${res.status} ${res.statusText}`;
    try {
      const parsed = text ? JSON.parse(text) : {};
      msg = messageFromJsonBody(parsed, msg);
    } catch {
      /* use msg as-is */
    }
    throw new Error(msg);
  }

  return res.blob();
}

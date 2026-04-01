const envBase = import.meta.env.VITE_CLAW_API_BASE as string | undefined;

function apiBase(): string {
  const raw = (envBase ?? "").trim();
  if (!raw) {
    throw new Error("VITE_CLAW_API_BASE is not set");
  }
  return raw.replace(/\/$/, "");
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
    headers: { "Content-Type": "application/json", Accept: "application/json" },
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
  contentSha256: string
): Promise<CreateSignSessionResponse> {
  const base = apiBase();
  const url = `${base}/v1/sign-sessions`;
  const body = {
    document_id: documentId,
    content_sha256: contentSha256.toLowerCase(),
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
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
    throw new Error(messageFromJsonBody(data, text || `${res.status} ${res.statusText}`));
  }

  return data;
}

/**
 * GET /v1/documents/{document_id}/content — raw document bytes (e.g. PDF for preview).
 */
export async function fetchDocumentContent(documentId: string): Promise<Blob> {
  const base = apiBase();
  const enc = encodeURIComponent(documentId.trim());
  const url = `${base}/v1/documents/${enc}/content`;

  const res = await fetch(url, { method: "GET" });

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
  payload: CompleteSignSessionPayload
): Promise<CompleteSignSessionResponse> {
  const base = apiBase();
  const enc = encodeURIComponent(sessionId);
  const url = `${base}/v1/sign-sessions/${enc}/complete`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
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
export async function getReceipt(receiptId: string): Promise<GetReceiptResponse> {
  const base = apiBase();
  const enc = encodeURIComponent(receiptId);
  const url = `${base}/v1/receipts/${enc}`;

  const res = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
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
export async function downloadBundle(receiptId: string): Promise<Blob> {
  const base = apiBase();
  const enc = encodeURIComponent(receiptId);
  const url = `${base}/v1/receipts/${enc}/bundle`;

  const res = await fetch(url, { method: "GET" });

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

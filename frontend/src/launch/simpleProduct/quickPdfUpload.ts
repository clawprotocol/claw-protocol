/**
 * Paid Quick PDF finalize — owner headers, exact bytes, sanitized errors.
 * Local file selection is not authority and does not upload.
 */
import { ownerApiFetch } from "../../lib/ownerApiClient";
import { MAX_QUICK_PDF_BYTES } from "../quickPdfReturnAuthority";

export const QUICK_PDF_HINT_KEY = "claw_quick_pdf_document_id_v1";

export type QuickPdfBinding = {
  documentId: string;
  contentSha256: string;
  sizeBytes: number;
  contentType: string;
};

export type QuickPdfUploadResult =
  | { ok: true; binding: QuickPdfBinding }
  | { ok: false; code: QuickPdfErrorCode; message: string };

export type QuickPdfErrorCode =
  | "empty_document"
  | "document_not_pdf"
  | "document_too_large"
  | "unauthorized"
  | "forbidden"
  | "wrong_organization"
  | "network"
  | "unavailable";

const MESSAGES: Record<QuickPdfErrorCode, string> = {
  empty_document: "This file is empty. Choose a PDF to continue.",
  document_not_pdf: "Only PDF files can be prepared for e-sign.",
  document_too_large: "This PDF is too large. Use a file under 25 MB.",
  unauthorized: "Sign in to save this PDF.",
  forbidden: "This workspace cannot save that PDF.",
  wrong_organization: "This PDF belongs to a different workspace.",
  network: "The PDF was not saved. Check your connection and try again.",
  unavailable: "We couldn’t save this PDF. Try again.",
};

export function sanitizedQuickPdfMessage(code: QuickPdfErrorCode): string {
  return MESSAGES[code];
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", copy.buffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function validateQuickPdfFile(file: File): { ok: true } | { ok: false; code: QuickPdfErrorCode; message: string } {
  if (!file || file.size <= 0) {
    return { ok: false, code: "empty_document", message: MESSAGES.empty_document };
  }
  if (file.size > MAX_QUICK_PDF_BYTES) {
    return { ok: false, code: "document_too_large", message: MESSAGES.document_too_large };
  }
  const type = (file.type || "").trim().toLowerCase();
  const name = (file.name || "").trim().toLowerCase();
  if (type && type !== "application/pdf" && type !== "application/x-pdf") {
    return { ok: false, code: "document_not_pdf", message: MESSAGES.document_not_pdf };
  }
  if (!type && !name.endsWith(".pdf")) {
    return { ok: false, code: "document_not_pdf", message: MESSAGES.document_not_pdf };
  }
  return { ok: true };
}

export function validateQuickPdfBytes(
  bytes: Uint8Array,
  contentType?: string,
): { ok: false; code: QuickPdfErrorCode; message: string } | null {
  if (!bytes.length) {
    return { ok: false, code: "empty_document", message: MESSAGES.empty_document };
  }
  if (bytes.length > MAX_QUICK_PDF_BYTES) {
    return { ok: false, code: "document_too_large", message: MESSAGES.document_too_large };
  }
  const ct = (contentType || "").trim().toLowerCase().split(";")[0];
  if (ct && ct !== "application/pdf" && ct !== "application/x-pdf") {
    return { ok: false, code: "document_not_pdf", message: MESSAGES.document_not_pdf };
  }
  const magic = String.fromCharCode(...bytes.subarray(0, 4));
  if (magic !== "%PDF") {
    return { ok: false, code: "document_not_pdf", message: MESSAGES.document_not_pdf };
  }
  return null;
}

function codeFromStatus(status: number, detail: string): QuickPdfErrorCode {
  if (status === 401) return "unauthorized";
  if (status === 403) {
    if (detail.includes("document_org_mismatch")) return "wrong_organization";
    return "forbidden";
  }
  if (detail === "empty_document") return "empty_document";
  if (detail === "document_not_pdf" || detail === "invalid_base64") return "document_not_pdf";
  if (detail === "document_too_large") return "document_too_large";
  return "unavailable";
}

function detailCode(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const d = data as { detail?: unknown; code?: unknown };
  if (typeof d.code === "string") return d.code;
  if (typeof d.detail === "string") return d.detail;
  if (d.detail && typeof d.detail === "object" && d.detail !== null && "code" in d.detail) {
    return String((d.detail as { code?: unknown }).code || "");
  }
  return "";
}

export async function uploadOwnerQuickPdf(bytes: Uint8Array, contentType = "application/pdf"): Promise<QuickPdfUploadResult> {
  const local = validateQuickPdfBytes(bytes, contentType);
  if (local) return local;
  let res: Response;
  try {
    res = await ownerApiFetch("/v1/documents", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        content_base64: bytesToBase64(bytes),
        content_type: "application/pdf",
      }),
    });
  } catch {
    return { ok: false, code: "network", message: MESSAGES.network };
  }
  let data: Record<string, unknown> = {};
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    if (!res.ok) {
      const code = codeFromStatus(res.status, "");
      return { ok: false, code, message: MESSAGES[code] };
    }
    return { ok: false, code: "unavailable", message: MESSAGES.unavailable };
  }
  if (!res.ok) {
    const code = codeFromStatus(res.status, detailCode(data));
    return { ok: false, code, message: MESSAGES[code] };
  }
  const documentId = String(data.document_id || "").trim();
  const contentSha256 = String(data.content_sha256 || "").trim().toLowerCase();
  const sizeBytes = Number(data.size_bytes);
  const returnedType = String(data.content_type || "application/pdf").trim() || "application/pdf";
  if (!documentId || !/^[0-9a-f]{64}$/.test(contentSha256) || !Number.isFinite(sizeBytes) || sizeBytes !== bytes.length) {
    return { ok: false, code: "unavailable", message: MESSAGES.unavailable };
  }
  return {
    ok: true,
    binding: {
      documentId,
      contentSha256,
      sizeBytes,
      contentType: returnedType,
    },
  };
}

export async function loadOwnerQuickPdfBinding(documentId: string): Promise<QuickPdfUploadResult> {
  const did = documentId.trim();
  if (!did) return { ok: false, code: "unavailable", message: MESSAGES.unavailable };
  let res: Response;
  try {
    res = await ownerApiFetch(`/v1/documents/${encodeURIComponent(did)}`, {
      headers: { Accept: "application/json" },
    });
  } catch {
    return { ok: false, code: "network", message: MESSAGES.network };
  }
  let data: Record<string, unknown> = {};
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    const code = codeFromStatus(res.status, "");
    return { ok: false, code, message: MESSAGES[code] };
  }
  if (!res.ok) {
    const code = codeFromStatus(res.status, detailCode(data));
    return { ok: false, code, message: MESSAGES[code] };
  }
  const doc = (data.document && typeof data.document === "object" ? data.document : data) as Record<string, unknown>;
  const id = String(doc.document_id || did).trim();
  const contentSha256 = String(doc.content_sha256 || "").trim().toLowerCase();
  const sizeBytes = Number(doc.size_bytes);
  const contentType = String(doc.content_type || "application/pdf").trim() || "application/pdf";
  if (!id || !/^[0-9a-f]{64}$/.test(contentSha256) || !Number.isFinite(sizeBytes)) {
    return { ok: false, code: "unavailable", message: MESSAGES.unavailable };
  }
  return { ok: true, binding: { documentId: id, contentSha256, sizeBytes, contentType } };
}

export function readQuickPdfDocumentHint(): string | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    return sessionStorage.getItem(QUICK_PDF_HINT_KEY)?.trim() || null;
  } catch {
    return null;
  }
}

export function writeQuickPdfDocumentHint(documentId: string): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(QUICK_PDF_HINT_KEY, documentId.trim());
  } catch {
    /* ignore */
  }
}

export function clearQuickPdfDocumentHint(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(QUICK_PDF_HINT_KEY);
  } catch {
    /* ignore */
  }
}

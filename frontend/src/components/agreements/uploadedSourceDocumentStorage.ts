/**
 * Persist uploaded source document text for source-comparison review (per agreement).
 */

const KEY_PREFIX = "claw_uploaded_source_document_v1:";

export type UploadedSourceDocumentRecord = {
  text: string;
  fileName?: string;
  savedAt: number;
};

export function uploadedSourceStorageKey(agreementId: string): string {
  return `${KEY_PREFIX}${agreementId.trim()}`;
}

export function readUploadedSourceDocument(agreementId: string | null | undefined): UploadedSourceDocumentRecord | null {
  if (!agreementId || typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(uploadedSourceStorageKey(agreementId));
    if (!raw) return null;
    const j = JSON.parse(raw) as UploadedSourceDocumentRecord;
    if (!j || typeof j.text !== "string") return null;
    return j;
  } catch {
    return null;
  }
}

export function writeUploadedSourceDocument(
  agreementId: string,
  record: UploadedSourceDocumentRecord,
): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(uploadedSourceStorageKey(agreementId), JSON.stringify(record));
  } catch {
    /* ignore */
  }
}

export function clearUploadedSourceDocument(agreementId: string): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(uploadedSourceStorageKey(agreementId));
  } catch {
    /* ignore */
  }
}

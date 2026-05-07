import { errorMessageFromResponse, resolveApiBase } from "../lib/clawApi";
import { recipientExportBasenameFromTitle, recipientPdfDownloadFilename } from "./recipientExportFilenames";
import type { RecipientPreviewPdfExportKind } from "./recipientPreviewPdfHtml";

const API_BASE = resolveApiBase();

/** User-facing when Story/PyMuPDF is unavailable or the server did not return a real layout PDF. */
export const RECIPIENT_PDF_EXPORT_UNAVAILABLE_MESSAGE =
  "PDF export is temporarily unavailable. You can still copy or download text.";

export type RecipientPreviewPdfExportRequest = {
  agreementId: string;
  readHeaders: Record<string, string>;
  exportKind: RecipientPreviewPdfExportKind;
  html: string;
  /**
   * Slug basename for downloads (e.g. from agreement title). Defaults to `agreement` when empty/unsafe.
   */
  fileBasename?: string;
  /** Sanitized reviewer slug for proposed/redline filename segment. */
  reviewerSlug?: string | null;
  /** Defaults to time of download; keep stable for tests via fake timers. */
  exportedAt?: Date;
};

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function resolvedPdfFilename(req: RecipientPreviewPdfExportRequest): string {
  const base =
    req.fileBasename && req.fileBasename.trim().length > 0
      ? req.fileBasename.trim()
      : recipientExportBasenameFromTitle(undefined, req.agreementId);
  return recipientPdfDownloadFilename(base, req.exportKind, {
    reviewerSlug: req.reviewerSlug ?? undefined,
    exportedAt: req.exportedAt ?? new Date(),
  });
}

async function messageFor503RecipientPdf(res: Response): Promise<string> {
  try {
    const raw = await res.text();
    const j = JSON.parse(raw) as { detail?: { message?: string } | string };
    const d = j?.detail;
    if (typeof d === "object" && d && typeof d.message === "string" && d.message.trim()) {
      return d.message.trim();
    }
  } catch {
    /* use default */
  }
  return RECIPIENT_PDF_EXPORT_UNAVAILABLE_MESSAGE;
}

/** Normalize any thrown message for recipient-facing PDF export UI (no raw “Failed to fetch”). */
export function humanizeRecipientPdfExportErrorMessage(message: string): string {
  return humanizePdfDownloadFailureMessage(message);
}

function humanizePdfDownloadFailureMessage(message: string): string {
  const m = (message || "").trim();
  if (!m) return RECIPIENT_PDF_EXPORT_UNAVAILABLE_MESSAGE;
  const low = m.toLowerCase();
  if (
    low.includes("failed to fetch") ||
    low.includes("networkerror") ||
    low.includes("load failed") ||
    low.includes("err_network") ||
    low.includes("ecconnreset") ||
    low.includes("econnreset")
  ) {
    return RECIPIENT_PDF_EXPORT_UNAVAILABLE_MESSAGE;
  }
  return m;
}

export async function downloadRecipientPreviewPdf(req: RecipientPreviewPdfExportRequest): Promise<void> {
  let res: Response;
  try {
    res = await fetch(
      `${API_BASE}/api/agreements/${encodeURIComponent(req.agreementId)}/recipient-preview-export-pdf`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...req.readHeaders,
        },
        body: JSON.stringify({ export_kind: req.exportKind, html: req.html }),
      },
    );
  } catch (e: unknown) {
    const raw = e instanceof Error ? e.message : String(e ?? "");
    throw new Error(humanizeRecipientPdfExportErrorMessage(raw));
  }
  if (!res.ok) {
    const msg =
      res.status === 503
        ? await messageFor503RecipientPdf(res)
        : humanizeRecipientPdfExportErrorMessage(
            await errorMessageFromResponse(res, "Could not create PDF. Try again."),
          );
    throw new Error(msg);
  }
  const ct = (res.headers.get("content-type") || "").toLowerCase();
  if (!ct.includes("application/pdf")) {
    throw new Error(RECIPIENT_PDF_EXPORT_UNAVAILABLE_MESSAGE);
  }
  const blob = await res.blob();
  if (!blob || blob.size < 64) {
    throw new Error(RECIPIENT_PDF_EXPORT_UNAVAILABLE_MESSAGE);
  }
  saveBlob(blob, resolvedPdfFilename(req));
}

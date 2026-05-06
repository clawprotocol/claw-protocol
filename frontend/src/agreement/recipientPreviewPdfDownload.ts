import { errorMessageFromResponse, resolveApiBase } from "../lib/clawApi";
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
};

const FILENAME_FOR_KIND: Record<RecipientPreviewPdfExportKind, string> = {
  original: "lawdog-original-draft.pdf",
  proposed: "lawdog-proposed-draft.pdf",
  redline: "lawdog-redline-preview.pdf",
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

export async function downloadRecipientPreviewPdf(req: RecipientPreviewPdfExportRequest): Promise<void> {
  const res = await fetch(
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
  if (!res.ok) {
    const msg =
      res.status === 503
        ? await messageFor503RecipientPdf(res)
        : await errorMessageFromResponse(res, "Could not create PDF. Try again.");
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
  saveBlob(blob, FILENAME_FOR_KIND[req.exportKind]);
}

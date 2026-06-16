import { clawAgreementHeaders } from "./agreementOrgHeaders";
import { errorMessageFromResponse, resolveApiBase } from "../lib/clawApi";
import { recipientExportBasenameFromTitle } from "./recipientExportFilenames";
import { humanizeRecipientPdfExportErrorMessage, RECIPIENT_PDF_EXPORT_UNAVAILABLE_MESSAGE } from "./recipientPreviewPdfDownload";

const API_BASE = resolveApiBase();

export const COMPLETED_SIGNED_PDF_EXPORT_UNAVAILABLE_MESSAGE = RECIPIENT_PDF_EXPORT_UNAVAILABLE_MESSAGE;

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

function filenameFromContentDisposition(header: string | null, fallback: string): string {
  const raw = (header || "").trim();
  if (!raw) return fallback;
  const star = /filename\*=UTF-8''([^;]+)/i.exec(raw);
  if (star?.[1]) {
    try {
      const decoded = decodeURIComponent(star[1].trim());
      if (decoded) return decoded;
    } catch {
      /* use fallback */
    }
  }
  const plain = /filename="([^"]+)"/i.exec(raw);
  if (plain?.[1]?.trim()) return plain[1].trim();
  return fallback;
}

function resolvedCompletedSignedFilename(agreementId: string, title?: string, contentDisposition?: string | null): string {
  const base = recipientExportBasenameFromTitle(title, agreementId);
  const fallback = `${base}-signed.pdf`;
  return filenameFromContentDisposition(contentDisposition ?? null, fallback);
}

async function messageFor503CompletedSignedPdf(res: Response): Promise<string> {
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
  return COMPLETED_SIGNED_PDF_EXPORT_UNAVAILABLE_MESSAGE;
}

async function savePdfResponse(res: Response, filename: string): Promise<void> {
  const ct = (res.headers.get("content-type") || "").toLowerCase();
  if (!ct.includes("application/pdf")) {
    throw new Error(COMPLETED_SIGNED_PDF_EXPORT_UNAVAILABLE_MESSAGE);
  }
  const blob = await res.blob();
  if (!blob || blob.size < 64) {
    throw new Error(COMPLETED_SIGNED_PDF_EXPORT_UNAVAILABLE_MESSAGE);
  }
  saveBlob(blob, filename);
}

/** Owner/read-auth PDF download for a fully executed agreement (optional HTML from signed view). */
export async function downloadCompletedSignedAgreementPdf(args: {
  agreementId: string;
  html?: string;
  title?: string;
  readHeaders?: Record<string, string>;
}): Promise<void> {
  const agreementId = String(args.agreementId || "").trim();
  if (!agreementId) throw new Error("Missing agreement id.");

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/agreements/${encodeURIComponent(agreementId)}/completed-signed-export-pdf`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...clawAgreementHeaders(),
        ...(args.readHeaders ?? {}),
      },
      body: JSON.stringify({ html: (args.html || "").trim() }),
    });
  } catch (e: unknown) {
    const raw = e instanceof Error ? e.message : String(e ?? "");
    throw new Error(humanizeRecipientPdfExportErrorMessage(raw));
  }

  if (!res.ok) {
    const msg =
      res.status === 503
        ? await messageFor503CompletedSignedPdf(res)
        : humanizeRecipientPdfExportErrorMessage(
            await errorMessageFromResponse(res, "Could not create PDF. Try again."),
          );
    throw new Error(msg);
  }

  const filename = resolvedCompletedSignedFilename(
    agreementId,
    args.title,
    res.headers.get("content-disposition"),
  );
  await savePdfResponse(res, filename);
}

/** Public PDF download when the agreement is fully executed (server uses signed snapshot). */
export async function downloadPublicCompletedSignedAgreementPdf(agreementId: string): Promise<void> {
  const id = String(agreementId || "").trim();
  if (!id) throw new Error("Missing agreement id.");

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/agreements/public/${encodeURIComponent(id)}/completed-signed-export-pdf`);
  } catch (e: unknown) {
    const raw = e instanceof Error ? e.message : String(e ?? "");
    throw new Error(humanizeRecipientPdfExportErrorMessage(raw));
  }

  if (!res.ok) {
    const msg =
      res.status === 503
        ? await messageFor503CompletedSignedPdf(res)
        : humanizeRecipientPdfExportErrorMessage(
            await errorMessageFromResponse(res, "Could not create PDF. Try again."),
          );
    throw new Error(msg);
  }

  const filename = resolvedCompletedSignedFilename(id, undefined, res.headers.get("content-disposition"));
  await savePdfResponse(res, filename);
}

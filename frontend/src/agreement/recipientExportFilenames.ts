import type { RecipientPreviewPdfExportKind } from "./recipientPreviewPdfHtml";

/**
 * Slug for download filenames: lowercase, hyphenated, filesystem-safe, deterministic.
 */
export function recipientExportBasenameFromTitle(
  agreementTitle: string | null | undefined,
  agreementIdFallback: string,
): string {
  const raw = (agreementTitle || "").trim();
  const slug = raw
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  if (slug.length >= 3) return slug;
  const idSlug = String(agreementIdFallback || "agreement")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  if (idSlug.length >= 3) return idSlug;
  return "agreement";
}

export function recipientPdfDownloadFilename(basename: string, kind: RecipientPreviewPdfExportKind): string {
  const safeBase = basename.replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "agreement";
  const k = kind === "original" ? "original" : kind === "proposed" ? "proposed" : "redline";
  return `${safeBase}-${k}.pdf`;
}

export function recipientTextDownloadFilename(basename: string, kind: RecipientPreviewPdfExportKind): string {
  const safeBase = basename.replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "agreement";
  const k = kind === "original" ? "original" : kind === "proposed" ? "proposed" : "redline";
  return `${safeBase}-${k}.txt`;
}

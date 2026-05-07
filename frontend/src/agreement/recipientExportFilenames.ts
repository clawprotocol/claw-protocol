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

/** Local compact stamp for deterministic filenames: `2026-05-06T2124`. */
export function formatRecipientExportCompactLocalStamp(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}`;
}

/** Optional reviewer segment for proposed/redline PDF names (sanitized). */
export function recipientReviewerSlugFromDisplayName(name: string | null | undefined): string | undefined {
  const raw = (name || "").trim();
  if (!raw) return undefined;
  const slug = raw
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug.length >= 2 ? slug : undefined;
}

export type RecipientExportFilenameOpts = {
  reviewerSlug?: string;
  exportedAt?: Date;
};

export function recipientPdfDownloadFilename(
  basename: string,
  kind: RecipientPreviewPdfExportKind,
  opts?: RecipientExportFilenameOpts,
): string {
  const safeBase =
    basename.replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "agreement";
  const stamp = formatRecipientExportCompactLocalStamp(opts?.exportedAt ?? new Date());
  const k = kind === "original" ? "original" : kind === "proposed" ? "proposed" : "redline";
  if (kind === "original") {
    return `${safeBase}-${k}-${stamp}.pdf`;
  }
  const revRaw = opts?.reviewerSlug?.trim() ?? "";
  const rev =
    revRaw.length > 0
      ? `${revRaw.replace(/[^a-z0-9-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "reviewer"}-`
      : "";
  return `${safeBase}-${k}-${rev}${stamp}.pdf`;
}

export function recipientTextDownloadFilename(
  basename: string,
  kind: RecipientPreviewPdfExportKind,
  opts?: RecipientExportFilenameOpts,
): string {
  const safeBase =
    basename.replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "agreement";
  const stamp = formatRecipientExportCompactLocalStamp(opts?.exportedAt ?? new Date());
  const k = kind === "original" ? "original" : kind === "proposed" ? "proposed" : "redline";
  if (kind === "original") {
    return `${safeBase}-${k}-${stamp}.txt`;
  }
  const revRaw = opts?.reviewerSlug?.trim() ?? "";
  const rev =
    revRaw.length > 0
      ? `${revRaw.replace(/[^a-z0-9-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "reviewer"}-`
      : "";
  return `${safeBase}-${k}-${rev}${stamp}.txt`;
}

/**
 * Temporary diagnostics for recipient revised-draft upload → parse → compare.
 * QA: watch console for [recipient-upload] … tags to locate silent stalls.
 */

function recipientUploadDiagnosticsEnabled(): boolean {
  try {
    if (import.meta.env?.DEV) return true;
    return typeof localStorage !== "undefined" && localStorage.getItem("lawdogRecipientReviseDiag") === "1";
  } catch {
    return false;
  }
}

function safeFileExt(name: unknown): string | undefined {
  if (typeof name !== "string") return undefined;
  const trimmed = name.trim();
  const dot = trimmed.lastIndexOf(".");
  if (dot < 0 || dot === trimmed.length - 1) return undefined;
  return trimmed.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12) || undefined;
}

function sanitizeDetail(detail?: Record<string, unknown>) {
  if (!detail || Object.keys(detail).length === 0) return undefined;
  const out: Record<string, unknown> = {};
  const ext = safeFileExt(detail.name ?? detail.filename ?? detail.sourceFileName);
  if (ext) out.fileExt = ext;
  for (const [key, value] of Object.entries(detail)) {
    if (key === "name" || key === "filename" || key === "sourceFileName") continue;
    if (typeof value === "string" && value.includes("@")) continue;
    out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function recipientUploadLog(stage: string, detail?: Record<string, unknown>) {
  if (!recipientUploadDiagnosticsEnabled()) return;
  const line = `[recipient-upload-${stage}]`;
  const p = sanitizeDetail(detail);
  if (p) {
    // eslint-disable-next-line no-console
    console.info(line, p);
  } else {
    // eslint-disable-next-line no-console
    console.info(line);
  }
}

export function recipientUploadLogSelected(detail: Record<string, unknown>) {
  recipientUploadLog("selected", detail);
}

export function recipientUploadLogParseStart(detail?: Record<string, unknown>) {
  recipientUploadLog("parse-start", detail);
}

export function recipientUploadLogParseSuccess(detail?: Record<string, unknown>) {
  recipientUploadLog("parse-success", detail);
}

export function recipientUploadLogCompareStart(detail?: Record<string, unknown>) {
  recipientUploadLog("compare-start", detail);
}

export function recipientUploadLogCompareSuccess(detail?: Record<string, unknown>) {
  recipientUploadLog("compare-success", detail);
}

export function recipientUploadError(stage: string, err: unknown, detail?: Record<string, unknown>) {
  if (!recipientUploadDiagnosticsEnabled()) return;
  const safeErr = err instanceof Error ? { name: err.name } : { type: typeof err };
  const safeDetail = sanitizeDetail(detail) ?? {};
  // eslint-disable-next-line no-console
  console.error(`[recipient-upload-error] ${stage}`, safeErr, safeDetail);
}

/** Full legal redline open / scroll diagnostics (recipient review). */
export function recipientRedlineNavLog(stage: string, detail?: Record<string, unknown>) {
  if (!recipientUploadDiagnosticsEnabled()) return;
  const p = sanitizeDetail(detail);
  const line = `[recipient-redline-${stage}]`;
  if (p) {
    // eslint-disable-next-line no-console
    console.info(line, p);
  } else {
    // eslint-disable-next-line no-console
    console.info(line);
  }
}

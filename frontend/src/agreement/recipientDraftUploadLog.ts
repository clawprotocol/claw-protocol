/**
 * Temporary diagnostics for recipient revised-draft upload → parse → compare.
 * QA: watch console for [recipient-upload] … tags to locate silent stalls.
 */

function payload(detail?: Record<string, unknown>) {
  return detail && Object.keys(detail).length > 0 ? detail : undefined;
}

export function recipientUploadLog(stage: string, detail?: Record<string, unknown>) {
  const line = `[recipient-upload-${stage}]`;
  const p = payload(detail);
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
  // eslint-disable-next-line no-console
  console.error(`[recipient-upload-error] ${stage}`, err, detail ?? {});
}

/** Full legal redline open / scroll diagnostics (recipient review). */
export function recipientRedlineNavLog(stage: string, detail?: Record<string, unknown>) {
  const p = payload(detail);
  const line = `[recipient-redline-${stage}]`;
  if (p) {
    // eslint-disable-next-line no-console
    console.info(line, p);
  } else {
    // eslint-disable-next-line no-console
    console.info(line);
  }
}

/**
 * Structured diagnostics when premium-full-draft returns degraded json_parse (no prompt changes).
 */

export type PaidProJsonParseDegradedDiagnostics = {
  rawResponseLen: number;
  documentTextLen: number;
  serverFullDocumentTextLen: number;
  failureCode: string;
  failureMessage: string;
  usedLocalRecovery: boolean;
  recoveryRenderSource: string | null;
  clientGatesRejected: boolean;
};

export function buildPaidProJsonParseDegradedDiagnostics(args: {
  documentText?: string | null;
  serverFullDocumentText?: string | null;
  failureCode?: string | null;
  failureMessage?: string | null;
  usedLocalRecovery?: boolean;
  recoveryRenderSource?: string | null;
  clientGatesRejected?: boolean;
  rawResponseLen?: number;
}): PaidProJsonParseDegradedDiagnostics {
  const doc = (args.documentText ?? "").trim();
  const serverFull = (args.serverFullDocumentText ?? "").trim();
  return {
    rawResponseLen: args.rawResponseLen ?? Math.max(doc.length, serverFull.length),
    documentTextLen: doc.length,
    serverFullDocumentTextLen: serverFull.length,
    failureCode: (args.failureCode ?? "json_parse").trim() || "json_parse",
    failureMessage: (args.failureMessage ?? "").trim(),
    usedLocalRecovery: Boolean(args.usedLocalRecovery),
    recoveryRenderSource: args.recoveryRenderSource ?? null,
    clientGatesRejected: Boolean(args.clientGatesRejected),
  };
}

export function logPaidProJsonParseDegradedDiagnostics(
  diag: PaidProJsonParseDegradedDiagnostics,
): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  if (typeof import.meta === "undefined" || !import.meta.env?.DEV) return;
  // eslint-disable-next-line no-console
  console.info("[paid-pro-json-parse-degraded]", diag);
}

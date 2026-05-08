import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { NOT_LEGAL_ADVICE } from "../compliance/disclosureCopy";
import { recipientExportBasenameFromTitle } from "./recipientExportFilenames";
import {
  RECIPIENT_PDF_EXPORT_UNAVAILABLE_MESSAGE,
  downloadRecipientPreviewPdf,
  humanizeRecipientPdfExportErrorMessage,
} from "./recipientPreviewPdfDownload";
import { wrapRecipientVersionPdfHtml } from "./recipientPreviewPdfHtml";

type Props = {
  agreementId: string;
  readHeaders: Record<string, string>;
  /** Same HTML as the read tab document (`scrubAgreementHtml(rendered_html)`). */
  scrubbedCurrentHtml: string;
  /** Optional display title for download filenames (slugified). */
  agreementTitle?: string | null;
  /**
   * When set, render only the helper + button (parent already provides a disclosure).
   */
  bare?: boolean;
  /** Accessible label for the PDF button. */
  pdfDownloadButtonLabel?: string;
  /** Optional `data-testid` on the download button (defaults by `bare`). */
  pdfDownloadButtonTestId?: string;
  /** Omit helper line under the button (e.g. when parent already showed trust copy). */
  suppressBareDisclosure?: boolean;
};

/**
 * Read-tab PDF: current/original draft only (before any preview). Always visible (not collapsed).
 */
export function RecipientAgreementReadPdfExport({
  agreementId,
  readHeaders,
  scrubbedCurrentHtml,
  agreementTitle = null,
  bare = false,
  pdfDownloadButtonLabel = "Download PDF",
  pdfDownloadButtonTestId,
  suppressBareDisclosure = false,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [a11yStatus, setA11yStatus] = useState("");
  const inFlightRef = useRef(false);
  const mountedRef = useRef(true);
  const errorClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exportErrorRef = useRef<HTMLParagraphElement>(null);

  const fileBasename = useMemo(
    () => recipientExportBasenameFromTitle(agreementTitle, agreementId),
    [agreementTitle, agreementId],
  );

  const safeSet = useCallback((fn: () => void) => {
    if (mountedRef.current) fn();
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      inFlightRef.current = false;
      if (errorClearTimerRef.current !== null) {
        clearTimeout(errorClearTimerRef.current);
        errorClearTimerRef.current = null;
      }
      safeSet(() => {
        setBusy(false);
        setExportError(null);
        setA11yStatus("");
      });
    };
  }, [safeSet]);

  const onDownload = useCallback(async () => {
    if (!scrubbedCurrentHtml.trim() || inFlightRef.current) return;
    const htmlSnapshot = scrubbedCurrentHtml;
    const headersSnapshot = readHeaders;
    const idSnapshot = agreementId;
    const baseSnapshot = fileBasename;
    inFlightRef.current = true;
    safeSet(() => {
      setBusy(true);
      setExportError(null);
      setA11yStatus("Preparing PDF. Please wait.");
    });
    try {
      await downloadRecipientPreviewPdf({
        agreementId: idSnapshot,
        readHeaders: headersSnapshot,
        exportKind: "original",
        html: wrapRecipientVersionPdfHtml(htmlSnapshot),
        fileBasename: baseSnapshot,
        exportedAt: new Date(),
      });
      safeSet(() => setA11yStatus("PDF download started."));
    } catch (e: unknown) {
      const raw = e instanceof Error ? e.message : String(e ?? "");
      const msg = humanizeRecipientPdfExportErrorMessage(raw.trim() || RECIPIENT_PDF_EXPORT_UNAVAILABLE_MESSAGE);
      safeSet(() => {
        setExportError(msg);
        setA11yStatus(`PDF export failed. ${msg}`);
      });
      if (errorClearTimerRef.current !== null) clearTimeout(errorClearTimerRef.current);
      errorClearTimerRef.current = setTimeout(() => {
        errorClearTimerRef.current = null;
        safeSet(() => setExportError(null));
      }, 4500);
    } finally {
      inFlightRef.current = false;
      safeSet(() => {
        setBusy(false);
      });
      window.setTimeout(() => safeSet(() => setA11yStatus("")), 800);
    }
  }, [agreementId, readHeaders, scrubbedCurrentHtml, fileBasename, safeSet]);

  useLayoutEffect(() => {
    if (!exportError) return;
    const id = window.requestAnimationFrame(() => {
      exportErrorRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(id);
  }, [exportError]);

  const hasBody = Boolean(scrubbedCurrentHtml.trim());

  const helperClass = bare
    ? "text-[10px] leading-snug text-slate-500 sm:text-xs"
    : "mt-0.5 text-[11px] leading-snug text-slate-400 sm:text-xs";
  const shellClass = bare
    ? ""
    : "mt-2 rounded-md border border-slate-700/45 bg-slate-950/30 px-2.5 py-2 sm:px-3";
  const buttonClass = `min-w-0 max-w-full break-words rounded-md border border-slate-600/70 bg-slate-900/50 px-2.5 py-1.5 text-left text-[11px] font-semibold text-slate-200 hover:bg-slate-900/75 disabled:cursor-not-allowed disabled:opacity-45 sm:text-xs ${bare ? "mt-1" : "mt-1.5"}`;

  const inner = (
    <>
      <p className="sr-only" aria-live="polite">
        {a11yStatus}
      </p>
      {bare && suppressBareDisclosure ? null : (
        <p className={helperClass}>
          {bare ? (
            <>
              Same draft as above. <span className="text-slate-600">{NOT_LEGAL_ADVICE}</span>
            </>
          ) : (
            <>
              Save a copy before you decide. <span className="text-slate-500">{NOT_LEGAL_ADVICE}</span>
            </>
          )}
        </p>
      )}
      <button
        type="button"
        disabled={busy || !hasBody}
        aria-busy={busy}
        className={buttonClass}
        data-testid={
          pdfDownloadButtonTestId ?? (bare ? "recipient-request-copy-export-pdf" : "recipient-read-download-pdf")
        }
        onClick={() => {
          safeSet(() => setExportError(null));
          void onDownload();
        }}
      >
        {busy ? "Preparing PDF…" : pdfDownloadButtonLabel}
      </button>
      {exportError ? (
        <p
          ref={exportErrorRef}
          tabIndex={-1}
          className={`text-[11px] leading-snug text-amber-100/95 outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50 ${bare ? "mt-1" : "mt-1.5"}`}
          role="alert"
          data-testid="recipient-pdf-export-error"
        >
          {exportError}
        </p>
      ) : null}
    </>
  );

  if (bare) {
    return <div className="min-w-0 space-y-0.5">{inner}</div>;
  }

  return (
    <section
      className={shellClass}
      data-testid="recipient-read-download-agreement"
      aria-label="Download agreement"
    >
      <h2 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Download agreement</h2>
      {inner}
    </section>
  );
}

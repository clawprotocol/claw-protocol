import { useCallback, useRef, useState, type ChangeEvent } from "react";
import { PRODUCT_NOT_LAW_FIRM } from "../compliance/disclosureCopy";
import { RecipientAgreementReadPdfExport } from "./recipientAgreementReadPdfExport";
import {
  RECIPIENT_COPY_ACK_COPIED,
  RECIPIENT_DRAFT_IMPORT_READ_ERROR,
  RECIPIENT_SAFETY_SUGGESTIONS_NOT_SIGNATURES,
  RECIPIENT_WANT_COPY_BODY,
  RECIPIENT_WANT_COPY_COMPARE_HELPER,
  RECIPIENT_WANT_COPY_HEADING,
  RECIPIENT_WANT_COPY_LOOPBACK_CUE,
  RECIPIENT_WANT_COPY_UPLOAD_CTA,
  RECIPIENT_WANT_COPY_UPLOAD_FORMAT_HELPER,
} from "./portableReviewCopy";
import { recipientExportBasenameFromTitle, recipientTextDownloadFilename } from "./recipientExportFilenames";

type Props = {
  agreementId: string;
  agreementTitle?: string | null;
  readHeaders: Record<string, string>;
  scrubbedCurrentHtml: string;
  /** Plain text of the current draft (for .txt download and copy). */
  plainDraftText: string;
  /** When set with {@link onImportedRevisedPlainText}, shows primary upload and wires the outside-review → bring-back loop. */
  onPrepareRevisedImport?: () => void;
  onImportedRevisedPlainText?: (text: string) => void;
  revisedImportDisabled?: boolean;
};

export function RecipientWantACopyStrip({
  agreementId,
  agreementTitle = null,
  readHeaders,
  scrubbedCurrentHtml,
  plainDraftText,
  onPrepareRevisedImport,
  onImportedRevisedPlainText,
  revisedImportDisabled,
}: Props) {
  const [copyBusy, setCopyBusy] = useState(false);
  const [copyAck, setCopyAck] = useState(false);
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const wantCopyFileInputRef = useRef<HTMLInputElement | null>(null);

  const canWireBringBack = Boolean(onPrepareRevisedImport && onImportedRevisedPlainText);
  const importDisabled = Boolean(revisedImportDisabled);

  const onDownloadText = useCallback(() => {
    const body = plainDraftText.trim();
    if (!body) return;
    const base = recipientExportBasenameFromTitle(agreementTitle, agreementId);
    const exportedAt = new Date();
    const name = recipientTextDownloadFilename(base, "original", { exportedAt });
    const blob = new Blob([body], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }, [agreementId, agreementTitle, plainDraftText]);

  const onCopyText = useCallback(async () => {
    const body = plainDraftText.trim();
    if (!body || copyBusy) return;
    setCopyBusy(true);
    setCopyAck(false);
    try {
      await navigator.clipboard.writeText(body);
      setCopyAck(true);
      window.setTimeout(() => setCopyAck(false), 2000);
    } catch {
      // ignore — clipboard may be denied
    } finally {
      setCopyBusy(false);
    }
  }, [copyBusy, plainDraftText]);

  const onWantCopyFileSelected = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      setUploadErr(null);
      if (!file || !onImportedRevisedPlainText) return;
      const name = file.name.toLowerCase();
      if (!name.endsWith(".txt") && !name.endsWith(".md")) {
        setUploadErr(RECIPIENT_DRAFT_IMPORT_READ_ERROR);
        return;
      }
      void (async () => {
        try {
          const text =
            typeof file.text === "function"
              ? await file.text()
              : await new Promise<string>((resolve, reject) => {
                  const reader = new FileReader();
                  reader.onload = () => resolve(String(reader.result ?? ""));
                  reader.onerror = () => reject(new Error("read"));
                  reader.readAsText(file);
                });
          onImportedRevisedPlainText(text);
        } catch {
          setUploadErr(RECIPIENT_DRAFT_IMPORT_READ_ERROR);
        }
      })();
    },
    [onImportedRevisedPlainText],
  );

  const onUploadRevisedClick = useCallback(() => {
    if (!canWireBringBack || importDisabled) return;
    setUploadErr(null);
    onPrepareRevisedImport?.();
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        wantCopyFileInputRef.current?.click();
      });
    });
  }, [canWireBringBack, importDisabled, onPrepareRevisedImport]);

  const hasText = Boolean(plainDraftText.trim());

  return (
    <section
      data-testid="recipient-want-a-copy-card"
      className="scroll-mt-8 rounded-xl border border-slate-700/40 bg-slate-950/25 px-4 py-4"
      aria-label={RECIPIENT_WANT_COPY_HEADING}
    >
      <h2 className="text-sm font-semibold tracking-tight text-slate-100">{RECIPIENT_WANT_COPY_HEADING}</h2>
      <p className="mt-1.5 text-xs leading-relaxed text-slate-400">{RECIPIENT_WANT_COPY_BODY}</p>
      <div className="mt-3 flex flex-col gap-3">
        <div className="flex flex-col gap-2 rounded-lg border border-slate-800/55 bg-slate-950/35 p-2.5 sm:flex-row sm:flex-wrap sm:items-stretch">
          <RecipientAgreementReadPdfExport
            bare
            suppressBareDisclosure
            agreementId={agreementId}
            agreementTitle={agreementTitle}
            readHeaders={readHeaders}
            scrubbedCurrentHtml={scrubbedCurrentHtml}
            pdfDownloadButtonLabel="Download draft PDF"
            pdfDownloadButtonTestId="recipient-download-draft-pdf"
          />
          <button
            type="button"
            data-testid="recipient-download-draft-text"
            disabled={!hasText}
            className="min-w-0 max-w-full break-words rounded-md border border-slate-600/70 bg-slate-900/50 px-2.5 py-1.5 text-left text-[11px] font-semibold text-slate-200 hover:bg-slate-900/75 disabled:cursor-not-allowed disabled:opacity-45 sm:text-xs"
            onClick={onDownloadText}
          >
            Download draft text
          </button>
          <button
            type="button"
            data-testid="recipient-copy-draft-text"
            disabled={!hasText || copyBusy}
            className="min-w-0 max-w-full break-words rounded-md border border-slate-600/70 bg-slate-900/50 px-2.5 py-1.5 text-left text-[11px] font-semibold text-slate-200 hover:bg-slate-900/75 disabled:cursor-not-allowed disabled:opacity-45 sm:text-xs"
            onClick={() => void onCopyText()}
          >
            {copyAck ? RECIPIENT_COPY_ACK_COPIED : "Copy draft text"}
          </button>
        </div>
        {canWireBringBack ? (
          <div className="border-t border-slate-800/60 pt-3">
            <input
              ref={wantCopyFileInputRef}
              type="file"
              className="sr-only"
              accept=".txt,.text,.md,text/plain"
              data-testid="recipient-want-copy-upload-revised-input"
              onChange={onWantCopyFileSelected}
            />
            <button
              type="button"
              data-testid="recipient-want-copy-upload-revised"
              disabled={importDisabled}
              className="w-full min-w-0 max-w-full break-words rounded-lg bg-emerald-600 px-3 py-2.5 text-left text-xs font-semibold text-white shadow-sm shadow-emerald-950/30 transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto sm:min-w-[11rem]"
              onClick={onUploadRevisedClick}
            >
              {RECIPIENT_WANT_COPY_UPLOAD_CTA}
            </button>
            <p className="mt-1.5 text-[10px] leading-snug text-slate-500">{RECIPIENT_WANT_COPY_UPLOAD_FORMAT_HELPER}</p>
          </div>
        ) : null}
      </div>
      <p className="mt-2 text-[10px] leading-snug text-slate-500">{RECIPIENT_WANT_COPY_COMPARE_HELPER}</p>
      <p className="mt-1 text-[10px] leading-snug text-slate-500">{RECIPIENT_WANT_COPY_LOOPBACK_CUE}</p>
      {uploadErr ? (
        <p className="mt-1.5 text-[11px] text-rose-300/95" role="alert">
          {uploadErr}
        </p>
      ) : null}
      <div className="mt-3 space-y-0.5 border-t border-slate-800/60 pt-3 text-[10px] leading-snug text-slate-500">
        <p>{RECIPIENT_SAFETY_SUGGESTIONS_NOT_SIGNATURES}</p>
        <p>{PRODUCT_NOT_LAW_FIRM}</p>
      </div>
    </section>
  );
}

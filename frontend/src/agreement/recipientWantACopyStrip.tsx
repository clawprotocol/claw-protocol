import { useCallback, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { PRODUCT_NOT_LAW_FIRM } from "../compliance/disclosureCopy";
import { RecipientAgreementReadPdfExport } from "./recipientAgreementReadPdfExport";
import {
  RECIPIENT_COPY_ACK_COPIED,
  RECIPIENT_DRAFT_IMPORT_READ_ERROR,
  RECIPIENT_SAFETY_SUGGESTIONS_NOT_SIGNATURES,
  RECIPIENT_WANT_COPY_BODY,
  RECIPIENT_WANT_COPY_DROPZONE_PRIMARY,
  RECIPIENT_WANT_COPY_DROPZONE_SECONDARY,
  RECIPIENT_WANT_COPY_HEADING,
  RECIPIENT_WANT_COPY_LOOPBACK_CUE,
  RECIPIENT_WANT_COPY_UPLOAD_CTA,
  RECIPIENT_WANT_COPY_UPLOAD_TIP,
  RECIPIENT_DOWNLOAD_DRAFT_PDF_BUTTON_TITLE,
} from "./portableReviewCopy";
import { recipientExportBasenameFromTitle, recipientTextDownloadFilename } from "./recipientExportFilenames";
import { recipientUploadError } from "./recipientDraftUploadLog";
import { extractRevisedDraftPlainText, REVISED_DRAFT_FILE_INPUT_ACCEPT } from "./recipientRevisedDraftImportText";

type Props = {
  agreementId: string;
  agreementTitle?: string | null;
  readHeaders: Record<string, string>;
  scrubbedCurrentHtml: string;
  /** Plain text of the current draft (for .txt download and copy). */
  plainDraftText: string;
  /** When set with {@link onImportedRevisedPlainText}, shows primary upload and wires the outside-review → bring-back loop. */
  onPrepareRevisedImport?: () => void;
  onImportedRevisedPlainText?: (
    text: string,
    meta?: {
      importReviewerNotesTail?: string | null;
      importArtifactsRemoved?: string[];
      pdfThinSanitizeUsedRaw?: boolean;
    },
  ) => void;
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
  const [dropzoneActive, setDropzoneActive] = useState(false);
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

  const ingestRevisedFile = useCallback(
    async (file: File) => {
      if (!onImportedRevisedPlainText) return;
      setUploadErr(null);
      const result = await extractRevisedDraftPlainText(file);
      if (!result.ok) {
        setUploadErr(result.error);
        return;
      }
      try {
        onImportedRevisedPlainText(result.text, {
          importReviewerNotesTail: result.importReviewerNotesTail ?? undefined,
          importArtifactsRemoved: result.importArtifactsRemoved,
          pdfThinSanitizeUsedRaw: result.pdfThinSanitizeUsedRaw,
        });
      } catch (e) {
        recipientUploadError("want-copy-callback-exception", e, { name: file.name });
        setUploadErr(RECIPIENT_DRAFT_IMPORT_READ_ERROR);
      }
    },
    [onImportedRevisedPlainText],
  );

  const onWantCopyFileSelected = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      void ingestRevisedFile(file);
    },
    [ingestRevisedFile],
  );

  const openRevisedFilePicker = useCallback(() => {
    if (!canWireBringBack || importDisabled) return;
    setUploadErr(null);
    onPrepareRevisedImport?.();
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        wantCopyFileInputRef.current?.click();
      });
    });
  }, [canWireBringBack, importDisabled, onPrepareRevisedImport]);

  const onDropzoneDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    if (!canWireBringBack || importDisabled) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }, [canWireBringBack, importDisabled]);

  const onDropzoneDragEnter = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      if (!canWireBringBack || importDisabled) return;
      e.preventDefault();
      setDropzoneActive(true);
    },
    [canWireBringBack, importDisabled],
  );

  const onDropzoneDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDropzoneActive(false);
    }
  }, []);

  const onDropzoneDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDropzoneActive(false);
      if (!canWireBringBack || importDisabled) return;
      const file = e.dataTransfer.files?.[0];
      if (!file) return;
      onPrepareRevisedImport?.();
      void ingestRevisedFile(file);
    },
    [canWireBringBack, importDisabled, ingestRevisedFile, onPrepareRevisedImport],
  );

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
            pdfDownloadButtonNativeTitle={RECIPIENT_DOWNLOAD_DRAFT_PDF_BUTTON_TITLE}
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
          <div className="w-full max-w-full border-t border-slate-800/60 pt-3">
            <input
              ref={wantCopyFileInputRef}
              type="file"
              className="sr-only"
              accept={REVISED_DRAFT_FILE_INPUT_ACCEPT}
              data-testid="recipient-want-copy-upload-revised-input"
              onChange={onWantCopyFileSelected}
            />
            <div
              role="group"
              data-testid="recipient-want-copy-dropzone"
              aria-label={`${RECIPIENT_WANT_COPY_DROPZONE_PRIMARY}. ${RECIPIENT_WANT_COPY_DROPZONE_SECONDARY}`}
              onDragEnter={onDropzoneDragEnter}
              onDragLeave={onDropzoneDragLeave}
              onDragOver={onDropzoneDragOver}
              onDrop={onDropzoneDrop}
              onClick={() => {
                if (importDisabled) return;
                openRevisedFilePicker();
              }}
              className={`w-full max-w-full rounded-2xl border px-4 py-4 outline-none transition-colors ${
                importDisabled ? "cursor-not-allowed opacity-45" : "cursor-pointer"
              } ${
                dropzoneActive
                  ? "border-emerald-400/55 bg-emerald-950/35"
                  : "border-emerald-500/30 bg-emerald-950/[0.12]"
              }`}
            >
              <p className="text-center text-[10px] leading-snug text-slate-500">{RECIPIENT_WANT_COPY_UPLOAD_TIP}</p>
              <p className="mt-3 text-center text-sm font-medium text-slate-100">{RECIPIENT_WANT_COPY_DROPZONE_PRIMARY}</p>
              <p className="mt-1 text-center text-[11px] text-slate-400">{RECIPIENT_WANT_COPY_DROPZONE_SECONDARY}</p>
              <div className="mt-4 flex justify-center">
                <button
                  type="button"
                  data-testid="recipient-want-copy-upload-revised"
                  disabled={importDisabled}
                  className="w-full max-w-md rounded-xl bg-emerald-600 px-4 py-2.5 text-center text-xs font-semibold text-white shadow-sm shadow-emerald-950/30 transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto sm:min-w-[12rem]"
                  onClick={(ev) => {
                    ev.stopPropagation();
                    openRevisedFilePicker();
                  }}
                >
                  {RECIPIENT_WANT_COPY_UPLOAD_CTA}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
      <p className="mt-2 text-[10px] leading-snug text-slate-500">{RECIPIENT_WANT_COPY_LOOPBACK_CUE}</p>
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

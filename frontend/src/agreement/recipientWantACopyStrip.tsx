import { useCallback, useState } from "react";
import { PRODUCT_NOT_LAW_FIRM } from "../compliance/disclosureCopy";
import { RecipientAgreementReadPdfExport } from "./recipientAgreementReadPdfExport";
import {
  RECIPIENT_COPY_ACK_COPIED,
  RECIPIENT_SAFETY_SUGGESTIONS_NOT_SIGNATURES,
  RECIPIENT_WANT_COPY_BODY,
  RECIPIENT_WANT_COPY_HEADING,
} from "./portableReviewCopy";
import { recipientExportBasenameFromTitle, recipientTextDownloadFilename } from "./recipientExportFilenames";

type Props = {
  agreementId: string;
  agreementTitle?: string | null;
  readHeaders: Record<string, string>;
  scrubbedCurrentHtml: string;
  /** Plain text of the current draft (for .txt download and copy). */
  plainDraftText: string;
};

export function RecipientWantACopyStrip({
  agreementId,
  agreementTitle = null,
  readHeaders,
  scrubbedCurrentHtml,
  plainDraftText,
}: Props) {
  const [copyBusy, setCopyBusy] = useState(false);
  const [copyAck, setCopyAck] = useState(false);

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

  const hasText = Boolean(plainDraftText.trim());

  return (
    <section
      data-testid="recipient-want-a-copy-card"
      className="scroll-mt-8 rounded-xl border border-slate-700/40 bg-slate-950/25 px-4 py-4"
      aria-label={RECIPIENT_WANT_COPY_HEADING}
    >
      <h2 className="text-sm font-semibold tracking-tight text-slate-100">{RECIPIENT_WANT_COPY_HEADING}</h2>
      <p className="mt-1.5 text-xs leading-relaxed text-slate-400">{RECIPIENT_WANT_COPY_BODY}</p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
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
      <div className="mt-3 space-y-0.5 border-t border-slate-800/60 pt-3 text-[10px] leading-snug text-slate-500">
        <p>{RECIPIENT_SAFETY_SUGGESTIONS_NOT_SIGNATURES}</p>
        <p>{PRODUCT_NOT_LAW_FIRM}</p>
      </div>
    </section>
  );
}

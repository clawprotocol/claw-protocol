import { useCallback, useState } from "react";
import { NOT_LEGAL_ADVICE } from "../compliance/disclosureCopy";
import {
  RECIPIENT_PDF_EXPORT_UNAVAILABLE_MESSAGE,
  downloadRecipientPreviewPdf,
} from "./recipientPreviewPdfDownload";

type Props = {
  agreementId: string;
  readHeaders: Record<string, string>;
  /** Same HTML as the read tab document (`scrubAgreementHtml(rendered_html)`). */
  scrubbedCurrentHtml: string;
};

/**
 * Read-tab PDF: current draft only (before any preview). Secondary to primary review actions.
 */
export function RecipientAgreementReadPdfExport({ agreementId, readHeaders, scrubbedCurrentHtml }: Props) {
  const [flash, setFlash] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onDownload = useCallback(async () => {
    if (!scrubbedCurrentHtml.trim() || busy) return;
    setBusy(true);
    setFlash(null);
    try {
      await downloadRecipientPreviewPdf({
        agreementId,
        readHeaders,
        exportKind: "original",
        html: scrubbedCurrentHtml,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : RECIPIENT_PDF_EXPORT_UNAVAILABLE_MESSAGE;
      setFlash(msg);
      window.setTimeout(() => setFlash(null), 4500);
    } finally {
      setBusy(false);
    }
  }, [agreementId, readHeaders, scrubbedCurrentHtml, busy]);

  const hasBody = Boolean(scrubbedCurrentHtml.trim());

  return (
    <details
      className="mt-3 rounded-md border border-slate-700/55 bg-slate-950/35 px-3 py-2 [&_summary::-webkit-details-marker]:hidden"
      data-testid="recipient-read-download-agreement"
    >
      <summary className="cursor-pointer list-none text-xs font-semibold text-slate-300 hover:text-slate-200 sm:text-[13px]">
        Download agreement
      </summary>
      <p className="mt-2 text-xs leading-snug text-slate-400 sm:text-[13px]">
        Save a copy before you decide. <span className="text-slate-500">{NOT_LEGAL_ADVICE}</span>
      </p>
      <button
        type="button"
        disabled={busy || !hasBody}
        className="mt-2 w-full rounded-md border border-slate-600/70 bg-slate-900/50 px-3 py-2 text-left text-xs font-semibold text-slate-200 hover:bg-slate-900/75 disabled:cursor-not-allowed disabled:opacity-45 sm:text-[13px]"
        data-testid="recipient-read-download-current-pdf"
        onClick={() => void onDownload()}
      >
        {busy ? "Preparing PDF…" : "Download current PDF"}
      </button>
      {flash ? (
        <p className="mt-2 text-xs leading-snug text-amber-100/95" role="status">
          {flash}
        </p>
      ) : null}
    </details>
  );
}

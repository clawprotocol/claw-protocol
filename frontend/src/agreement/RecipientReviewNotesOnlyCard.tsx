import { useMemo } from "react";
import {
  RECIPIENT_UPLOAD_NOTES_ONLY_CARD_BODY,
  RECIPIENT_UPLOAD_NOTES_ONLY_CARD_TITLE,
  RECIPIENT_UPLOAD_NOTES_ONLY_CTA_PASTE,
  RECIPIENT_UPLOAD_NOTES_ONLY_CTA_SEND_NOTES,
  RECIPIENT_UPLOAD_NOTES_ONLY_CTA_TURN_SUGGESTIONS,
  RECIPIENT_UPLOAD_NOTES_ONLY_CTA_UPLOAD,
  RECIPIENT_UPLOAD_NOTES_ONLY_DOWNLOAD_NOTES,
  RECIPIENT_UPLOAD_NOTES_ONLY_HELPER,
  RECIPIENT_UPLOAD_NOTES_ONLY_SUGGESTED_FOCUS_BULLETS,
  RECIPIENT_UPLOAD_NOTES_ONLY_SUGGESTED_FOCUS_HEADING,
  RECIPIENT_UPLOAD_NOTES_ONLY_VIEW_FULL_NOTES,
} from "./portableReviewCopy";

type Props = {
  extractedNotes: string;
  onSendNotesToSender: () => void;
  onTurnIntoClauseSuggestions: () => void;
  onUploadRevisedAgreement: () => void;
  onPasteRevisedAgreement: () => void;
};

/**
 * Notes-only upload: no compare/redline until the recipient brings a true revised agreement.
 */
export function RecipientReviewNotesOnlyCard({
  extractedNotes,
  onSendNotesToSender,
  onTurnIntoClauseSuggestions,
  onUploadRevisedAgreement,
  onPasteRevisedAgreement,
}: Props) {
  const downloadNotes = useMemo(
    () => () => {
      const body = extractedNotes.trim();
      if (!body) return;
      const blob = new Blob([body], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "reviewer-notes.txt";
      a.click();
      URL.revokeObjectURL(url);
    },
    [extractedNotes],
  );

  return (
    <div
      data-testid="recipient-upload-notes-only-card"
      className="rounded-xl border border-amber-900/35 bg-gradient-to-b from-amber-950/30 to-slate-950/40 px-4 py-5 shadow-inner shadow-amber-950/10"
      role="region"
      aria-labelledby="recipient-upload-notes-only-title"
    >
      <h3
        id="recipient-upload-notes-only-title"
        className="text-base font-semibold tracking-tight text-amber-50/95"
      >
        {RECIPIENT_UPLOAD_NOTES_ONLY_CARD_TITLE}
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-slate-300">{RECIPIENT_UPLOAD_NOTES_ONLY_CARD_BODY}</p>

      <div className="mt-4 rounded-lg border border-slate-700/50 bg-slate-950/40 px-3 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          {RECIPIENT_UPLOAD_NOTES_ONLY_SUGGESTED_FOCUS_HEADING}
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-4 text-[12px] leading-relaxed text-slate-300 marker:text-slate-500">
          {RECIPIENT_UPLOAD_NOTES_ONLY_SUGGESTED_FOCUS_BULLETS.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-slate-500">{RECIPIENT_UPLOAD_NOTES_ONLY_HELPER}</p>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <button
          type="button"
          data-testid="recipient-upload-notes-only-send-notes"
          className="min-h-[44px] rounded-xl bg-emerald-600 px-4 py-2.5 text-center text-sm font-semibold text-white hover:bg-emerald-500 sm:flex-1"
          onClick={onSendNotesToSender}
        >
          {RECIPIENT_UPLOAD_NOTES_ONLY_CTA_SEND_NOTES}
        </button>
        <button
          type="button"
          data-testid="recipient-upload-notes-only-turn-suggestions"
          className="min-h-[44px] rounded-xl border border-sky-800/50 bg-sky-950/25 px-4 py-2.5 text-center text-sm font-semibold text-sky-100 hover:bg-sky-950/40 sm:flex-1"
          onClick={onTurnIntoClauseSuggestions}
        >
          {RECIPIENT_UPLOAD_NOTES_ONLY_CTA_TURN_SUGGESTIONS}
        </button>
        <button
          type="button"
          data-testid="recipient-upload-notes-only-download-notes"
          className="min-h-[44px] rounded-xl border border-slate-600 bg-slate-900/60 px-4 py-2.5 text-center text-sm font-semibold text-slate-100 hover:bg-slate-900 sm:flex-1"
          onClick={downloadNotes}
        >
          {RECIPIENT_UPLOAD_NOTES_ONLY_DOWNLOAD_NOTES}
        </button>
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <button
          type="button"
          data-testid="recipient-upload-notes-only-upload-again"
          className="min-h-[44px] rounded-xl border border-slate-600 bg-slate-900/60 px-4 py-2.5 text-center text-sm font-semibold text-slate-100 hover:bg-slate-900 sm:flex-1"
          onClick={onUploadRevisedAgreement}
        >
          {RECIPIENT_UPLOAD_NOTES_ONLY_CTA_UPLOAD}
        </button>
        <button
          type="button"
          data-testid="recipient-upload-notes-only-paste-agreement"
          className="min-h-[44px] rounded-xl border border-slate-600 bg-slate-900/60 px-4 py-2.5 text-center text-sm font-semibold text-slate-100 hover:bg-slate-900 sm:flex-1"
          onClick={onPasteRevisedAgreement}
        >
          {RECIPIENT_UPLOAD_NOTES_ONLY_CTA_PASTE}
        </button>
      </div>

      <details
        className="mt-4 rounded-lg border border-slate-700/50 bg-slate-950/40"
        data-testid="recipient-upload-notes-only-full-notes"
      >
        <summary className="cursor-pointer list-none px-3 py-2.5 text-left text-xs font-medium text-slate-200 marker:content-none hover:bg-slate-900/50 [&::-webkit-details-marker]:hidden">
          {RECIPIENT_UPLOAD_NOTES_ONLY_VIEW_FULL_NOTES}
        </summary>
        <pre
          data-testid="recipient-upload-notes-only-notes-body"
          className="max-h-56 overflow-auto whitespace-pre-wrap border-t border-slate-800/60 p-3 text-[11px] leading-relaxed text-slate-400"
        >
          {extractedNotes.trim()}
        </pre>
      </details>
    </div>
  );
}

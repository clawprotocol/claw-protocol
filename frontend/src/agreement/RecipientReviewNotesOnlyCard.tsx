import { useState } from "react";
import {
  RECIPIENT_UPLOAD_NOTES_ONLY_CARD_BODY,
  RECIPIENT_UPLOAD_NOTES_ONLY_CARD_TITLE,
  RECIPIENT_UPLOAD_NOTES_ONLY_CTA_PASTE,
  RECIPIENT_UPLOAD_NOTES_ONLY_CTA_QUICK,
  RECIPIENT_UPLOAD_NOTES_ONLY_CTA_UPLOAD,
  RECIPIENT_UPLOAD_NOTES_ONLY_HELPER,
  RECIPIENT_UPLOAD_NOTES_ONLY_NOTES_PANEL_LABEL,
} from "./portableReviewCopy";

type Props = {
  extractedNotes: string;
  onUploadRevisedAgreement: () => void;
  onPasteRevisedAgreement: () => void;
  onUseAsQuickChange: () => void;
};

/**
 * Friendly gate when an uploaded file reads as reviewer commentary, not a full revised agreement.
 */
export function RecipientReviewNotesOnlyCard({
  extractedNotes,
  onUploadRevisedAgreement,
  onPasteRevisedAgreement,
  onUseAsQuickChange,
}: Props) {
  const [notesOpen, setNotesOpen] = useState(false);
  const preview = extractedNotes.trim().slice(0, 280);
  const truncated = extractedNotes.trim().length > preview.length;

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
      <p className="mt-3 text-[11px] leading-relaxed text-slate-500">{RECIPIENT_UPLOAD_NOTES_ONLY_HELPER}</p>

      <div className="mt-4 rounded-lg border border-slate-700/50 bg-slate-950/40">
        <button
          type="button"
          data-testid="recipient-upload-notes-only-notes-toggle"
          className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-xs font-medium text-slate-200 hover:bg-slate-900/50"
          aria-expanded={notesOpen}
          onClick={() => setNotesOpen((o) => !o)}
        >
          <span>{RECIPIENT_UPLOAD_NOTES_ONLY_NOTES_PANEL_LABEL}</span>
          <span className="text-slate-500">{notesOpen ? "▾" : "▸"}</span>
        </button>
        {notesOpen ? (
          <pre
            data-testid="recipient-upload-notes-only-notes-body"
            className="max-h-56 overflow-auto whitespace-pre-wrap border-t border-slate-800/60 p-3 text-[11px] leading-relaxed text-slate-400"
          >
            {extractedNotes.trim()}
          </pre>
        ) : (
          <p
            data-testid="recipient-upload-notes-only-notes-preview"
            className="border-t border-slate-800/40 px-3 py-2 text-[11px] leading-relaxed text-slate-500"
          >
            {preview}
            {truncated ? "…" : ""}
          </p>
        )}
      </div>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <button
          type="button"
          data-testid="recipient-upload-notes-only-upload-again"
          className="min-h-[44px] rounded-xl bg-emerald-600 px-4 py-2.5 text-center text-sm font-semibold text-white hover:bg-emerald-500 sm:flex-1"
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
        <button
          type="button"
          data-testid="recipient-upload-notes-only-quick-change"
          className="min-h-[44px] rounded-xl border border-sky-800/50 bg-sky-950/25 px-4 py-2.5 text-center text-sm font-semibold text-sky-100 hover:bg-sky-950/40 sm:flex-1"
          onClick={onUseAsQuickChange}
        >
          {RECIPIENT_UPLOAD_NOTES_ONLY_CTA_QUICK}
        </button>
      </div>
    </div>
  );
}

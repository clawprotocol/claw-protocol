import { useEffect, useRef, useState } from "react";
import { PremiumAgreementReadonlyView } from "./PremiumAgreementReadonlyView";
import { PRO_REVIEW_EDITED_FILE_INPUT_ACCEPT } from "./reviewEditedVersionUpload";
import { highlightAllGuidedChangedSections } from "./guidedDealCompletion/guidedSectionScroll";
import type { UploadedSourceDocumentRecord } from "./uploadedSourceDocumentStorage";

export type SimpleProFinalReviewScreenProps = {
  agreementHtml: string;
  suppressEmptyFallback?: boolean;
  appliedAreas?: readonly string[];
  appliedVariableIds?: readonly string[];
  bulkApplyBusy?: boolean;
  bulkApplyError?: string | null;
  packetStale?: boolean;
  copyAck?: boolean;
  exportBusy?: boolean;
  exportError?: string | null;
  continueDisabled?: boolean;
  onContinueToSigning: () => void;
  onCopyAgreement: () => void;
  onExportAgreement: () => void;
  suggestEditsDraft?: string;
  suggestEditsBusy?: boolean;
  suggestEditsError?: string | null;
  uploadBusy?: boolean;
  uploadError?: string | null;
  uploadedSource?: UploadedSourceDocumentRecord | null;
  onSuggestEditsDraftChange?: (value: string) => void;
  onApplySuggestEdits?: () => void;
  onUploadFile?: (file: File) => void;
  onUseUploadedForSigning?: () => void;
  onKeepLawDogVersion?: () => void;
  className?: string;
};

export function SimpleProFinalReviewScreen({
  agreementHtml,
  suppressEmptyFallback = false,
  appliedAreas = [],
  appliedVariableIds = [],
  bulkApplyBusy = false,
  bulkApplyError = null,
  packetStale = false,
  copyAck = false,
  exportBusy = false,
  exportError = null,
  continueDisabled = false,
  onContinueToSigning,
  onCopyAgreement,
  onExportAgreement,
  suggestEditsDraft = "",
  suggestEditsBusy = false,
  suggestEditsError = null,
  uploadBusy = false,
  uploadError = null,
  uploadedSource = null,
  onSuggestEditsDraftChange,
  onApplySuggestEdits,
  onUploadFile,
  onUseUploadedForSigning,
  onKeepLawDogVersion,
  className = "",
}: SimpleProFinalReviewScreenProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [suggestEditsOpen, setSuggestEditsOpen] = useState(false);
  const [showUploadActions, setShowUploadActions] = useState(Boolean(uploadedSource));
  const canSuggestEdits = Boolean(onApplySuggestEdits && onSuggestEditsDraftChange && onUploadFile);

  useEffect(() => {
    if (!appliedVariableIds.length || !agreementHtml.trim()) return;
    const timer = window.setTimeout(() => {
      highlightAllGuidedChangedSections(appliedVariableIds);
    }, 150);
    return () => window.clearTimeout(timer);
  }, [appliedVariableIds, agreementHtml]);

  useEffect(() => {
    if (uploadedSource) setShowUploadActions(true);
  }, [uploadedSource]);

  return (
    <div
      className={`flex flex-col gap-3 ${className}`}
      data-testid="simple-pro-final-review-screen"
      role="region"
      aria-label="Review your updated Pro agreement"
    >
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500">LawDog Pro</p>
        <h2 className="mt-1 font-serif text-lg font-semibold tracking-tight text-stone-900 sm:text-xl">
          Review your updated Pro agreement
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-stone-600 sm:text-sm">
          Your answers have been applied. Review the full agreement before adding signers.
        </p>
        {bulkApplyBusy ? (
          <p className="mt-2 text-xs font-medium text-stone-700" role="status" aria-live="polite">
            Updating your agreement…
          </p>
        ) : null}
        {bulkApplyError ? (
          <p className="mt-2 text-xs font-medium text-amber-800" role="alert">
            {bulkApplyError}
          </p>
        ) : null}
        {appliedAreas.length > 0 && !bulkApplyBusy ? (
          <p className="mt-2 text-[11px] leading-relaxed text-emerald-900/90">
            Updated: {appliedAreas.slice(0, 4).join(" · ")}
            {appliedAreas.length > 4 ? ` (+${appliedAreas.length - 4} more)` : ""}
          </p>
        ) : null}
      </div>

      {packetStale ? (
        <p
          className="rounded-md border border-amber-300/80 bg-amber-50 px-2.5 py-2 text-[11px] font-medium text-amber-950"
          role="alert"
        >
          Agreement changed — refresh signing packet before sending.
        </p>
      ) : null}

      <div className="rounded-sm border border-stone-200/90 bg-white shadow-sm ring-1 ring-black/[0.05]">
        <PremiumAgreementReadonlyView html={agreementHtml} suppressEmptyFallback={suppressEmptyFallback} />
      </div>

      <div className="flex flex-col gap-2">
        <button
          type="button"
          className="w-full rounded-lg bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-45"
          disabled={continueDisabled || packetStale || bulkApplyBusy}
          onClick={onContinueToSigning}
          data-testid="simple-pro-continue-to-signing"
        >
          Continue to signing
        </button>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <button
            type="button"
            className="w-full rounded-lg border border-stone-300/90 bg-white px-3 py-2 text-xs font-semibold text-stone-800 sm:w-auto"
            onClick={onCopyAgreement}
            data-testid="simple-pro-copy-agreement"
          >
            {copyAck ? "Copied" : "Copy agreement"}
          </button>
          <button
            type="button"
            className="w-full rounded-lg border border-stone-300/90 bg-white px-3 py-2 text-xs font-semibold text-stone-800 sm:w-auto"
            disabled={exportBusy}
            onClick={onExportAgreement}
            data-testid="simple-pro-export-agreement"
          >
            {exportBusy ? "Preparing export…" : "Download / export"}
          </button>
          {canSuggestEdits ? (
            <button
              type="button"
              className="w-full rounded-lg border border-stone-300/90 bg-white px-3 py-2 text-xs font-semibold text-stone-800 sm:w-auto"
              aria-expanded={suggestEditsOpen}
              onClick={() => setSuggestEditsOpen((v) => !v)}
              data-testid="simple-pro-suggest-changes-toggle"
            >
              {suggestEditsOpen ? "Hide suggest changes" : "Suggest changes"}
            </button>
          ) : null}
        </div>
        {exportError ? (
          <p className="text-[11px] font-medium text-amber-800" role="alert">
            {exportError}
          </p>
        ) : null}
      </div>

      {canSuggestEdits && suggestEditsOpen ? (
        <div
          className="rounded-md border border-stone-200/95 bg-stone-50/95 px-2.5 py-2.5"
          data-testid="simple-pro-suggest-edits-card"
        >
          <p className="text-xs font-semibold text-stone-900">Suggest changes</p>
          <p className="mt-1 text-[11px] leading-relaxed text-stone-600">
            Type notes for LawDog to apply, or upload a revised file. Side-by-side redline comparison is not
            available yet.
          </p>
          <textarea
            className="mt-2 min-h-[4.5rem] w-full resize-y rounded-md border border-stone-300/90 bg-white px-2.5 py-2 text-xs leading-relaxed text-stone-900 placeholder:text-stone-400"
            placeholder="Type requested changes…"
            value={suggestEditsDraft}
            disabled={suggestEditsBusy}
            onChange={(e) => onSuggestEditsDraftChange?.(e.target.value)}
            data-testid="simple-pro-suggest-edits-input"
          />
          {suggestEditsError ? (
            <p className="mt-1.5 text-[11px] font-medium text-amber-800" role="alert">
              {suggestEditsError}
            </p>
          ) : null}
          <div className="mt-2 flex flex-col gap-1.5 sm:flex-row sm:flex-wrap">
            <button
              type="button"
              className="rounded-md bg-stone-800 px-2.5 py-1.5 text-[11px] font-semibold text-white disabled:opacity-45"
              disabled={suggestEditsBusy || !suggestEditsDraft.trim()}
              onClick={onApplySuggestEdits}
              data-testid="simple-pro-apply-suggest-edits"
            >
              {suggestEditsBusy ? "Applying…" : "Apply suggestions"}
            </button>
            <button
              type="button"
              className="rounded-md border border-stone-300/90 px-2.5 py-1.5 text-[11px] font-medium text-stone-700"
              disabled={uploadBusy}
              onClick={() => fileRef.current?.click()}
              data-testid="simple-pro-upload-revised-document"
            >
              {uploadBusy ? "Uploading…" : "Upload revised document"}
            </button>
          </div>
          <p className="mt-1.5 text-[10px] leading-relaxed text-stone-500">
            PDF, TXT, Markdown, or Word (.doc/.docx) when text can be extracted.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept={PRO_REVIEW_EDITED_FILE_INPUT_ACCEPT}
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) {
                onUploadFile?.(f);
                setShowUploadActions(true);
              }
              e.target.value = "";
            }}
          />
        </div>
      ) : null}

      {uploadError ? (
        <p className="text-[11px] font-medium text-amber-800" role="alert">
          {uploadError}
        </p>
      ) : null}

      {showUploadActions && uploadedSource ? (
        <div
          className="space-y-2 rounded-md border border-stone-200/90 bg-white/90 px-2.5 py-2.5"
          data-testid="simple-pro-edited-version-actions"
        >
          <p className="text-xs font-semibold text-stone-900">Uploaded revision saved</p>
          {uploadedSource.fileName ? (
            <p className="text-[11px] text-stone-600">{uploadedSource.fileName}</p>
          ) : null}
          <p className="text-[11px] leading-relaxed text-stone-600">
            LawDog cannot show a redline against your draft yet. Use this file for signing or keep the LawDog
            version.
          </p>
          <div className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap">
            {onUseUploadedForSigning ? (
              <button
                type="button"
                className="rounded-md bg-emerald-800 px-2.5 py-1.5 text-[11px] font-semibold text-white"
                onClick={onUseUploadedForSigning}
                data-testid="simple-pro-use-uploaded-for-signing"
              >
                Use uploaded version for signing
              </button>
            ) : null}
            {onKeepLawDogVersion ? (
              <button
                type="button"
                className="rounded-md border border-stone-300/90 px-2.5 py-1.5 text-[11px] font-medium text-stone-700"
                onClick={onKeepLawDogVersion}
                data-testid="simple-pro-keep-lawdog-version"
              >
                Keep LawDog version
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

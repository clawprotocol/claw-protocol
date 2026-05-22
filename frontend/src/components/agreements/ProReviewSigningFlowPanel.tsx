import { useRef, useState } from "react";
import { PRO_REVIEW_EDITED_FILE_INPUT_ACCEPT } from "./reviewEditedVersionUpload";
import type { ProReviewSigningFlowState } from "./proReviewSigningFlowState";
import type { UploadedSourceDocumentRecord } from "./uploadedSourceDocumentStorage";

export type ProReviewSigningFlowPanelProps = {
  flowState: ProReviewSigningFlowState;
  uploadedSource: UploadedSourceDocumentRecord | null;
  packetStale?: boolean;
  uploadBusy?: boolean;
  uploadError?: string | null;
  /** Post-guided final review moment — agreement dominates, signers deferred. */
  finalReviewMoment?: boolean;
  suggestEditsDraft?: string;
  suggestEditsBusy?: boolean;
  suggestEditsError?: string | null;
  onSuggestEditsDraftChange?: (value: string) => void;
  onApplySuggestEdits?: () => void;
  onContinueToSigning: () => void;
  onUploadFile: (file: File) => void;
  onUseUploadedForSigning?: () => void;
  onKeepLawDogVersion?: () => void;
  onCompareChanges?: () => void;
  onReadAgreement?: () => void;
  continueDisabled?: boolean;
  className?: string;
};

export function ProReviewSigningFlowPanel({
  flowState,
  uploadedSource,
  packetStale = false,
  uploadBusy = false,
  uploadError = null,
  finalReviewMoment = false,
  suggestEditsDraft = "",
  suggestEditsBusy = false,
  suggestEditsError = null,
  onSuggestEditsDraftChange,
  onApplySuggestEdits,
  onContinueToSigning,
  onUploadFile,
  onUseUploadedForSigning,
  onKeepLawDogVersion,
  onCompareChanges,
  onReadAgreement,
  continueDisabled = false,
  className = "",
}: ProReviewSigningFlowPanelProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [suggestEditsOpen, setSuggestEditsOpen] = useState(false);
  const [showUploadOptions, setShowUploadOptions] = useState(Boolean(uploadedSource));

  const showEditedActions = flowState.id === "edited_version_uploaded" && uploadedSource;
  const canSuggestEdits = Boolean(finalReviewMoment && onApplySuggestEdits && onSuggestEditsDraftChange);

  const triggerUpload = () => {
    fileRef.current?.click();
  };

  if (finalReviewMoment) {
    return (
      <div
        className={`rounded-lg border border-stone-300/90 bg-stone-50/95 px-3 py-3 ${className}`}
        data-testid="pro-review-signing-flow-panel"
        data-flow-state={flowState.id}
        data-final-review="true"
        role="region"
        aria-label="Final review before signing"
      >
        <h3 className="font-serif text-base font-semibold tracking-tight text-stone-900 sm:text-lg">
          Your agreement is ready to review
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-stone-600 sm:text-sm">
          Read the agreement, suggest changes, or continue to signing when you are ready.
        </p>

        {packetStale ? (
          <p
            className="mt-2 rounded-md border border-amber-300/80 bg-amber-50 px-2.5 py-2 text-[11px] font-medium text-amber-950"
            role="alert"
          >
            Agreement changed — refresh signing packet before sending.
          </p>
        ) : null}

        <div className="mt-3 flex flex-col gap-2">
          <button
            type="button"
            className="w-full rounded-lg bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-45"
            disabled={continueDisabled || packetStale}
            onClick={onContinueToSigning}
            data-testid="pro-review-continue-to-signing"
          >
            Continue to signing
          </button>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {onReadAgreement ? (
              <button
                type="button"
                className="w-full rounded-lg border border-stone-300/90 bg-white px-3 py-2 text-xs font-semibold text-stone-800 sm:w-auto"
                onClick={onReadAgreement}
                data-testid="pro-review-read-agreement"
              >
                Read agreement
              </button>
            ) : null}
            {canSuggestEdits ? (
              <button
                type="button"
                className="w-full rounded-lg border border-stone-300/90 bg-white px-3 py-2 text-xs font-semibold text-stone-800 sm:w-auto"
                aria-expanded={suggestEditsOpen}
                onClick={() => setSuggestEditsOpen((v) => !v)}
                data-testid="pro-review-suggest-changes-toggle"
              >
                {suggestEditsOpen ? "Hide suggest changes" : "Suggest changes"}
              </button>
            ) : null}
          </div>
        </div>

        {canSuggestEdits && suggestEditsOpen ? (
          <div
            className="mt-3 rounded-md border border-stone-200/95 bg-white/95 px-2.5 py-2.5"
            data-testid="pro-review-suggest-edits-card"
          >
            <p className="text-xs font-semibold text-stone-900">Suggest changes before signing</p>
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
              data-testid="pro-review-suggest-edits-input"
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
                data-testid="pro-review-apply-suggest-edits"
              >
                {suggestEditsBusy ? "Applying…" : "Apply suggestions"}
              </button>
              <button
                type="button"
                className="rounded-md border border-stone-300/90 px-2.5 py-1.5 text-[11px] font-medium text-stone-700"
                disabled={uploadBusy}
                onClick={triggerUpload}
                data-testid="pro-review-upload-revised-document"
              >
                {uploadBusy ? "Uploading…" : "Upload revised document"}
              </button>
            </div>
            <p className="mt-1.5 text-[10px] leading-relaxed text-stone-500">
              PDF, TXT, Markdown, or Word (.doc/.docx) when text can be extracted.
            </p>
          </div>
        ) : null}

        {uploadError ? (
          <p className="mt-2 text-[11px] font-medium text-amber-800" role="alert">
            {uploadError}
          </p>
        ) : null}

        {showEditedActions && showUploadOptions ? (
          <div
            className="mt-3 space-y-2 rounded-md border border-stone-200/90 bg-white/90 px-2.5 py-2.5"
            data-testid="pro-review-edited-version-actions"
          >
            <p className="text-xs font-semibold text-stone-900">Uploaded revision saved</p>
            {uploadedSource?.fileName ? (
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
                  data-testid="pro-review-use-uploaded-for-signing"
                >
                  Use uploaded version for signing
                </button>
              ) : null}
              {onKeepLawDogVersion ? (
                <button
                  type="button"
                  className="rounded-md border border-stone-300/90 px-2.5 py-1.5 text-[11px] font-medium text-stone-700"
                  onClick={onKeepLawDogVersion}
                  data-testid="pro-review-keep-lawdog-version"
                >
                  Keep LawDog version
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        <input
          ref={fileRef}
          type="file"
          accept={PRO_REVIEW_EDITED_FILE_INPUT_ACCEPT}
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) {
              onUploadFile(f);
              setShowUploadOptions(true);
              setSuggestEditsOpen(true);
            }
            e.target.value = "";
          }}
        />
      </div>
    );
  }

  return (
    <div
      className={`rounded-lg border border-stone-300/90 bg-stone-50/95 px-3 py-3 ${className}`}
      data-testid="pro-review-signing-flow-panel"
      data-flow-state={flowState.id}
      data-final-review="false"
      role="region"
      aria-label="Review and signing"
    >
      <p className="text-[10px] font-bold uppercase tracking-wide text-stone-500">{flowState.label}</p>
      {flowState.detail ? (
        <p className="mt-0.5 text-[11px] leading-snug text-stone-600">{flowState.detail}</p>
      ) : null}

      {packetStale ? (
        <p
          className="mt-2 rounded-md border border-amber-300/80 bg-amber-50 px-2.5 py-2 text-[11px] font-medium text-amber-950"
          role="alert"
        >
          Agreement changed — refresh signing packet before sending.
        </p>
      ) : null}

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <button
          type="button"
          className="w-full rounded-lg bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-45 sm:w-auto"
          disabled={continueDisabled || packetStale}
          onClick={onContinueToSigning}
          data-testid="pro-review-continue-to-signing"
        >
          Continue to signing
        </button>
        {onReadAgreement ? (
          <button
            type="button"
            className="w-full rounded-lg border border-stone-300/90 bg-white px-3 py-2 text-xs font-semibold text-stone-800 sm:w-auto"
            onClick={onReadAgreement}
            data-testid="pro-review-read-agreement"
          >
            Read agreement
          </button>
        ) : null}
        {!showEditedActions ? (
          <button
            type="button"
            className="w-full text-left text-xs font-medium text-stone-600 underline-offset-2 hover:text-stone-900 hover:underline sm:w-auto"
            disabled={uploadBusy}
            onClick={triggerUpload}
            data-testid="pro-review-upload-edited-version"
          >
            {uploadBusy ? "Uploading…" : "Upload edited version"}
          </button>
        ) : null}
        <input
          ref={fileRef}
          type="file"
          accept={PRO_REVIEW_EDITED_FILE_INPUT_ACCEPT}
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) {
              onUploadFile(f);
              setShowUploadOptions(true);
            }
            e.target.value = "";
          }}
        />
      </div>

      <p className="mt-2 text-[11px] leading-relaxed text-stone-500">
        If the other side sends back edits, upload their version and LawDog will help you compare or continue from
        the latest draft.
      </p>

      {uploadError ? (
        <p className="mt-2 text-[11px] font-medium text-amber-800" role="alert">
          {uploadError}
        </p>
      ) : null}

      {showEditedActions && showUploadOptions ? (
        <div
          className="mt-3 space-y-2 rounded-md border border-stone-200/90 bg-white/90 px-2.5 py-2.5"
          data-testid="pro-review-edited-version-actions"
        >
          <p className="text-xs font-semibold text-stone-900">Uploaded revision ready for review</p>
          {uploadedSource?.fileName ? (
            <p className="text-[11px] text-stone-600">{uploadedSource.fileName}</p>
          ) : null}
          <p className="text-[11px] leading-relaxed text-stone-600">
            Uploaded version saved. Full redline comparison is coming soon. You can use this version for signing
            or continue with the LawDog draft.
          </p>
          <div className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap">
            {onCompareChanges ? (
              <button
                type="button"
                className="rounded-md border border-stone-300/90 bg-stone-50 px-2.5 py-1.5 text-[11px] font-semibold text-stone-800"
                onClick={onCompareChanges}
                data-testid="pro-review-compare-versions"
              >
                Compare versions
              </button>
            ) : null}
            {onUseUploadedForSigning ? (
              <button
                type="button"
                className="rounded-md bg-emerald-800 px-2.5 py-1.5 text-[11px] font-semibold text-white"
                onClick={onUseUploadedForSigning}
                data-testid="pro-review-use-uploaded-for-signing"
              >
                Use uploaded version for signing
              </button>
            ) : null}
            {onKeepLawDogVersion ? (
              <button
                type="button"
                className="rounded-md border border-stone-300/90 px-2.5 py-1.5 text-[11px] font-medium text-stone-700"
                onClick={onKeepLawDogVersion}
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

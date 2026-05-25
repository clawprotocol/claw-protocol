import { useEffect, useRef, useState } from "react";
import { PremiumAgreementReadonlyView } from "./PremiumAgreementReadonlyView";
import { PRO_REVIEW_EDITED_FILE_INPUT_ACCEPT } from "./reviewEditedVersionUpload";
import { highlightAllGuidedChangedSections, scrollToGuidedAppliedChecklistSection } from "./guidedDealCompletion/guidedSectionScroll";
import {
  SIMPLE_PRO_FINAL_REVIEW_HEADLINE,
  SIMPLE_PRO_FINAL_REVIEW_SUBCOPY,
} from "./guidedDealCompletion/guidedFinalReviewTransition";
import type { GuidedAppliedChecklistLabel } from "./guidedDealCompletion/guidedAppliedSummaryChecklist";
import type { UploadedSourceDocumentRecord } from "./uploadedSourceDocumentStorage";

export type SimpleProFinalReviewScreenProps = {
  agreementHtml: string;
  suppressEmptyFallback?: boolean;
  appliedAnswerCount?: number;
  appliedChecklist?: readonly GuidedAppliedChecklistLabel[];
  appliedAreas?: readonly string[];
  appliedVariableIds?: readonly string[];
  bulkApplyBusy?: boolean;
  bulkApplyError?: string | null;
  packetStale?: boolean;
  copyAck?: boolean;
  exportBusy?: boolean;
  exportError?: string | null;
  sendDisabled?: boolean;
  /** Signer/reviewer emails captured before final review. */
  signersReady?: boolean;
  /** Hide edit/suggest/upload chrome after signer setup is complete. */
  suppressPostReviewEditUx?: boolean;
  /** Shown when authoritative corpus is blocked or empty. */
  corpusRecoveryMessage?: string | null;
  /** When false, checklist shows without broken jump links (DOM anchors missing). */
  enableSectionJump?: boolean;
  signaturePrimaryLabel?: string;
  signatureSecondaryLabel?: string;
  reviewSecondaryLabel?: string;
  onChangeSigningOrder?: () => void;
  onSendForSignature: () => void;
  onSendForReview: () => void;
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
  /** Full agreement plain text for direct edit before signing. */
  editablePlainText?: string;
  onEditablePlainTextChange?: (value: string) => void;
  onSavePlainTextEdits?: () => void;
  savePlainTextBusy?: boolean;
  savePlainTextAck?: boolean;
  onUploadFile?: (file: File) => void;
  onUseUploadedForSigning?: () => void;
  onKeepLawDogVersion?: () => void;
  onBackToSignerDetails?: () => void;
  className?: string;
};

export function SimpleProFinalReviewScreen({
  agreementHtml,
  suppressEmptyFallback = false,
  appliedAnswerCount = 0,
  appliedChecklist = [],
  appliedAreas = [],
  appliedVariableIds = [],
  bulkApplyBusy = false,
  bulkApplyError = null,
  packetStale = false,
  copyAck = false,
  exportBusy = false,
  exportError = null,
  sendDisabled = false,
  signersReady = false,
  suppressPostReviewEditUx = false,
  corpusRecoveryMessage = null,
  enableSectionJump = true,
  signaturePrimaryLabel = "Send for signature",
  signatureSecondaryLabel = "Change signing order",
  reviewSecondaryLabel = "Send for review",
  onChangeSigningOrder,
  onSendForSignature,
  onSendForReview,
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
  editablePlainText,
  onEditablePlainTextChange,
  onSavePlainTextEdits,
  savePlainTextBusy = false,
  savePlainTextAck = false,
  onUploadFile,
  onUseUploadedForSigning,
  onKeepLawDogVersion,
  onBackToSignerDetails,
  className = "",
}: SimpleProFinalReviewScreenProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [editAgreementTextOpen, setEditAgreementTextOpen] = useState(false);
  const [showUploadActions, setShowUploadActions] = useState(Boolean(uploadedSource));
  const canDirectEditPlainText = Boolean(onEditablePlainTextChange && onSavePlainTextEdits);
  const canSuggestEdits =
    !suppressPostReviewEditUx &&
    Boolean(onApplySuggestEdits && onSuggestEditsDraftChange && onUploadFile);
  const canEditAgreementText = canDirectEditPlainText || canSuggestEdits;
  const showDocument = agreementHtml.trim().length > 0 && !corpusRecoveryMessage;
  const answerCount = appliedAnswerCount > 0 ? appliedAnswerCount : appliedVariableIds.length;

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
      aria-label={SIMPLE_PRO_FINAL_REVIEW_HEADLINE}
    >
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500">LawDog Pro</p>
        <h2
          className="mt-1 font-serif text-lg font-semibold tracking-tight text-stone-900 sm:text-xl"
          data-testid="simple-pro-final-review-headline"
        >
          {SIMPLE_PRO_FINAL_REVIEW_HEADLINE}
        </h2>
        {answerCount > 0 ? (
          <p className="mt-1 text-xs font-medium text-emerald-900/95" data-testid="simple-pro-final-review-trust-line">
            {answerCount} answer{answerCount === 1 ? "" : "s"} applied to this version
          </p>
        ) : null}
        {signersReady ? (
          <p
            className="mt-1 text-xs font-medium text-emerald-900/95"
            data-testid="simple-pro-final-review-signers-ready"
          >
            Signer/reviewer details ready
          </p>
        ) : null}
        <p className="mt-0.5 text-[11px] leading-relaxed text-stone-600" data-testid="simple-pro-final-review-send-trust">
          This is the version that will be sent.
        </p>
        {appliedChecklist.length > 0 && !bulkApplyBusy ? (
          <div
            className="mt-2.5 rounded-md border border-emerald-200/80 bg-emerald-50/60 px-2.5 py-2"
            data-testid="simple-pro-applied-updates-card"
          >
            <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-900/80">Updates applied</p>
            <ul className="mt-1.5 space-y-1" data-testid="simple-pro-applied-checklist" aria-label="Applied guided updates">
              {appliedChecklist.map((item) => (
                <li key={item} className="flex items-center justify-between gap-2 text-[11px] leading-snug text-emerald-950/90">
                  <span className="flex min-w-0 items-start gap-1.5">
                    <span className="mt-0.5 text-emerald-700" aria-hidden>
                      ✓
                    </span>
                    <span>{item}</span>
                  </span>
                  {enableSectionJump && appliedVariableIds.length > 0 ? (
                    <button
                      type="button"
                      className="shrink-0 text-[10px] font-semibold text-emerald-800 underline decoration-emerald-600/50 underline-offset-2 hover:text-emerald-950"
                      data-testid={`simple-pro-jump-section-${item.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`}
                      onClick={() => scrollToGuidedAppliedChecklistSection(item, appliedVariableIds)}
                    >
                      Jump to section
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : appliedAreas.length > 0 && !bulkApplyBusy ? (
          <p className="mt-2 text-[11px] leading-relaxed text-emerald-900/90">
            Updated: {appliedAreas.slice(0, 4).join(" · ")}
            {appliedAreas.length > 4 ? ` (+${appliedAreas.length - 4} more)` : ""}
          </p>
        ) : null}
        <p
          className="mt-2 text-xs leading-relaxed text-stone-600 sm:text-sm"
          data-testid="simple-pro-final-review-subcopy"
        >
          {SIMPLE_PRO_FINAL_REVIEW_SUBCOPY}
        </p>
        {onBackToSignerDetails ? (
          <button
            type="button"
            className="mt-2 text-[11px] font-medium text-stone-600 underline decoration-stone-400/70 underline-offset-2 hover:text-stone-800"
            onClick={onBackToSignerDetails}
            data-testid="simple-pro-back-to-signer-details"
          >
            Back to signer details
          </button>
        ) : null}
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
      </div>

      {packetStale ? (
        <p
          className="rounded-md border border-amber-300/80 bg-amber-50 px-2.5 py-2 text-[11px] font-medium text-amber-950"
          role="alert"
        >
          Agreement changed — refresh signing packet before sending.
        </p>
      ) : null}

      {corpusRecoveryMessage ? (
        <div
          className="rounded-md border border-amber-300/90 bg-amber-50 px-3 py-3 text-sm leading-relaxed text-amber-950"
          role="alert"
          data-testid="simple-pro-final-review-corpus-recovery"
        >
          {corpusRecoveryMessage}
        </div>
      ) : null}
      <div
        className="rounded-sm border border-stone-200/90 bg-white shadow-sm ring-1 ring-black/[0.05]"
        data-testid="simple-pro-final-review-document"
      >
        {showDocument ? (
          <PremiumAgreementReadonlyView html={agreementHtml} suppressEmptyFallback={suppressEmptyFallback} />
        ) : (
          <p
            className="px-4 py-8 text-center text-sm leading-relaxed text-stone-600"
            data-testid="simple-pro-final-review-document-empty"
          >
            Agreement preview is not available. Use Back to signer details, then continue to final review again.
          </p>
        )}
      </div>
      {signersReady ? (
        <p
          className="rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-[11px] leading-relaxed text-stone-700"
          data-testid="simple-pro-final-review-signing-fields-note"
        >
          LawDog will place matching e-signature fields on the signature lines when you continue.
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        <button
          type="button"
          className="w-full rounded-lg bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-45"
          disabled={sendDisabled || packetStale || bulkApplyBusy}
          onClick={onSendForSignature}
          data-testid="simple-pro-send-for-signature"
        >
          {signaturePrimaryLabel}
        </button>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {onChangeSigningOrder ? (
            <button
              type="button"
              className="w-full rounded-lg border border-stone-300/90 bg-white px-3 py-2 text-xs font-semibold text-stone-800 sm:w-auto"
              disabled={sendDisabled || packetStale || bulkApplyBusy}
              onClick={onChangeSigningOrder}
              data-testid="simple-pro-change-signing-order"
            >
              {signatureSecondaryLabel}
            </button>
          ) : null}
          <button
            type="button"
            className="w-full rounded-lg border border-stone-300/90 bg-white px-3 py-2 text-xs font-semibold text-stone-800 sm:w-auto"
            disabled={sendDisabled || packetStale || bulkApplyBusy}
            onClick={onSendForReview}
            data-testid="simple-pro-send-for-review"
          >
            {reviewSecondaryLabel}
          </button>
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
        </div>
        {exportError ? (
          <p className="text-[11px] font-medium text-amber-800" role="alert">
            {exportError}
          </p>
        ) : null}
        {canEditAgreementText ? (
          <button
            type="button"
            className="self-start text-[11px] font-medium text-stone-600 underline decoration-stone-400/70 underline-offset-2 hover:text-stone-800"
            aria-expanded={editAgreementTextOpen}
            onClick={() => setEditAgreementTextOpen((v) => !v)}
            data-testid="simple-pro-edit-agreement-text-toggle"
          >
            {editAgreementTextOpen ? "Hide edit options" : "Edit agreement text"}
          </button>
        ) : null}
      </div>

      {canEditAgreementText && editAgreementTextOpen ? (
        <div
          className="rounded-md border border-stone-200/95 bg-stone-50/95 px-2.5 py-2.5"
          data-testid="simple-pro-edit-agreement-text-card"
        >
          {canDirectEditPlainText ? (
            <>
              <label
                className="text-xs font-semibold text-stone-900"
                htmlFor="simple-pro-edit-agreement-plain-input"
              >
                Edit agreement text before sending
              </label>
              <textarea
                id="simple-pro-edit-agreement-plain-input"
                className="mt-2 min-h-[12rem] w-full resize-y rounded-md border border-stone-300/90 bg-white px-2.5 py-2 font-mono text-[11px] leading-relaxed text-stone-900"
                value={editablePlainText ?? ""}
                disabled={savePlainTextBusy}
                onChange={(e) => onEditablePlainTextChange?.(e.target.value)}
                data-testid="simple-pro-edit-agreement-plain-input"
              />
              <div className="mt-2 flex flex-col gap-1.5 sm:flex-row sm:flex-wrap">
                <button
                  type="button"
                  className="rounded-md bg-emerald-800 px-2.5 py-1.5 text-[11px] font-semibold text-white disabled:opacity-45"
                  disabled={savePlainTextBusy || !(editablePlainText ?? "").trim()}
                  onClick={onSavePlainTextEdits}
                  data-testid="simple-pro-save-agreement-edits"
                >
                  {savePlainTextBusy ? "Saving…" : savePlainTextAck ? "Saved ✓" : "Save edits"}
                </button>
              </div>
              <p className="mt-1.5 text-[10px] leading-relaxed text-stone-500">
                Saved edits update the version sent for signing and e-sign field placement.
              </p>
            </>
          ) : null}
          {canSuggestEdits ? (
            <>
              <label
                className="text-xs font-semibold text-stone-900"
                htmlFor="simple-pro-edit-agreement-text-input"
              >
                {canDirectEditPlainText ? "Or suggest AI edits" : "Edit or paste changes before sending"}
              </label>
              <textarea
                id="simple-pro-edit-agreement-text-input"
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
                  {suggestEditsBusy ? "Applying…" : "Apply changes"}
                </button>
                <button
                  type="button"
                  className="rounded-md border border-stone-300/90 px-2.5 py-1.5 text-[11px] font-medium text-stone-700"
                  disabled={uploadBusy}
                  onClick={() => fileRef.current?.click()}
                  data-testid="simple-pro-upload-revised-document"
                >
                  {uploadBusy ? "Uploading…" : "Upload revised agreement"}
                </button>
              </div>
              <p className="mt-1.5 text-[10px] leading-relaxed text-stone-500">
                PDF, TXT, Markdown, or Word (.doc/.docx) when text can be extracted.
              </p>
            </>
          ) : null}
          {canSuggestEdits ? (
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
          ) : null}
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
            Use this file for signing or keep the LawDog version.
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

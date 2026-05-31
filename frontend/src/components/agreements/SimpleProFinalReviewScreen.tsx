import { useEffect, useRef, useState } from "react";
import { PremiumAgreementReadonlyView } from "./PremiumAgreementReadonlyView";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import type { ProVisiblePaperCandidate } from "./visibleProPaperRenderBoundary";
import { PRO_REVIEW_EDITED_FILE_INPUT_ACCEPT } from "./reviewEditedVersionUpload";
import { highlightAllGuidedChangedSections, scrollToGuidedAppliedChecklistSection } from "./guidedDealCompletion/guidedSectionScroll";
import {
  PAID_PRO_REVIEW_CHIP_STATE,
  PAID_PRO_REVIEW_EDIT_SIGNER_DETAILS_LABEL,
  PAID_PRO_REVIEW_SHELL_SUBTITLE,
  PAID_PRO_REVIEW_SHELL_TITLE,
  suppressPaidProFinalReviewFinalizingState,
} from "./authoritativePaidProReview";
import { PAID_PRO_AUTHORITY_MIN_LEN } from "./paidProAgreementAuthority";
import {
  SIMPLE_PRO_FINAL_REVIEW_HEADLINE,
  SIMPLE_PRO_FINAL_REVIEW_SUBCOPY,
} from "./guidedDealCompletion/guidedFinalReviewTransition";
import type { GuidedAppliedChecklistLabel } from "./guidedDealCompletion/guidedAppliedSummaryChecklist";
import type { UploadedSourceDocumentRecord } from "./uploadedSourceDocumentStorage";
import { REVIEW_FIRST_SIGNING_TOKEN_SECRET_OPERATOR_HINT } from "../../launch/simpleProduct/reviewFirstSendSurface";

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
  reviewFirstHandoffBusy?: boolean;
  reviewFirstHandoffError?: string | null;
  /** Railway/production: signing token secret unset — hide retry loop. */
  reviewFirstSigningTokenSecretMissing?: boolean;
  onBackToFinalReviewFromReviewHandoff?: () => void;
  onRetryReviewFirstHandoff?: () => void;
  /** Signer/reviewer emails captured before final review. */
  signersReady?: boolean;
  /** Hide edit/suggest/upload chrome after signer setup is complete. */
  suppressPostReviewEditUx?: boolean;
  /** Shown when authoritative corpus is blocked or empty. */
  corpusRecoveryMessage?: string | null;
  /** When false, checklist shows without broken jump links (DOM anchors missing). */
  enableSectionJump?: boolean;
  /** Post-checkout paid SoT — canonical Pro review shell (no guided Q&A chrome). */
  canonicalPaidProReview?: boolean;
  /** Frozen paid SoT plain — renders when HTML prop is still empty after acceptance. */
  paidReviewPlain?: string;
  /** Corpus authority label for diagnostics (hydrated vs raw SoT). */
  paidReviewAuthoritativeSource?: string;
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
  visibleProPaperTrace?: {
    declaredSource: string;
    candidates: readonly ProVisiblePaperCandidate[];
    intakeText?: string | null;
    draft?: ParsedDraftShape | null;
    paidProReviewSurface?: boolean;
    isAuthoritative?: boolean;
    isFreeBodyMatch?: boolean;
  };
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
  reviewFirstHandoffBusy = false,
  reviewFirstHandoffError = null,
  reviewFirstSigningTokenSecretMissing = false,
  onBackToFinalReviewFromReviewHandoff,
  onRetryReviewFirstHandoff,
  signersReady = false,
  suppressPostReviewEditUx = false,
  corpusRecoveryMessage = null,
  enableSectionJump = true,
  canonicalPaidProReview = false,
  paidReviewPlain = "",
  paidReviewAuthoritativeSource = "paidProSourceOfTruth",
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
  visibleProPaperTrace,
}: SimpleProFinalReviewScreenProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const reviewFirstErrorRef = useRef<HTMLDivElement>(null);
  const [editAgreementTextOpen, setEditAgreementTextOpen] = useState(false);
  const [showUploadActions, setShowUploadActions] = useState(Boolean(uploadedSource));
  const reviewFirstActionsBlocked = Boolean(reviewFirstHandoffError?.trim());
  const canDirectEditPlainText = Boolean(onEditablePlainTextChange && onSavePlainTextEdits);
  const canSuggestEdits =
    !suppressPostReviewEditUx &&
    Boolean(onApplySuggestEdits && onSuggestEditsDraftChange && onUploadFile);
  const canEditAgreementText = canDirectEditPlainText || canSuggestEdits;
  const paidReviewBodyLen = paidReviewPlain.trim().length;
  const hasCanonicalPaidReviewBody =
    canonicalPaidProReview && paidReviewBodyLen >= PAID_PRO_AUTHORITY_MIN_LEN;
  const signerSetupRequired = canonicalPaidProReview && !signersReady;
  const suppressFinalizingForPaidAuthority =
    hasCanonicalPaidReviewBody || suppressPaidProFinalReviewFinalizingState();
  const effectiveCorpusRecoveryMessage =
    suppressFinalizingForPaidAuthority && hasCanonicalPaidReviewBody ? null : corpusRecoveryMessage;
  const effectiveAgreementHtml = agreementHtml.trim();
  const preferHydratedReviewHtml =
    canonicalPaidProReview && signersReady && effectiveAgreementHtml.length > 0;
  const showCanonicalPaidPre = hasCanonicalPaidReviewBody && !preferHydratedReviewHtml;
  const showDocument =
    (effectiveAgreementHtml.length > 0 || hasCanonicalPaidReviewBody) && !effectiveCorpusRecoveryMessage;
  const showPreviewUnavailable =
    !showDocument &&
    !hasCanonicalPaidReviewBody &&
    !suppressFinalizingForPaidAuthority;
  const reviewHeadline = canonicalPaidProReview ? PAID_PRO_REVIEW_SHELL_TITLE : SIMPLE_PRO_FINAL_REVIEW_HEADLINE;
  const reviewSubcopy = canonicalPaidProReview ? PAID_PRO_REVIEW_SHELL_SUBTITLE : SIMPLE_PRO_FINAL_REVIEW_SUBCOPY;
  const answerCount = canonicalPaidProReview
    ? 0
    : appliedAnswerCount > 0
      ? appliedAnswerCount
      : appliedVariableIds.length;

  useEffect(() => {
    if (canonicalPaidProReview || !appliedVariableIds.length || !agreementHtml.trim()) return;
    const timer = window.setTimeout(() => {
      highlightAllGuidedChangedSections(appliedVariableIds);
    }, 150);
    return () => window.clearTimeout(timer);
  }, [appliedVariableIds, agreementHtml]);

  useEffect(() => {
    if (uploadedSource) setShowUploadActions(true);
  }, [uploadedSource]);

  useEffect(() => {
    if (!reviewFirstHandoffError?.trim()) return;
    const el = reviewFirstErrorRef.current;
    if (!el) return;
    const timer = window.setTimeout(() => {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
    return () => window.clearTimeout(timer);
  }, [reviewFirstHandoffError]);

  return (
    <div
      className={`flex flex-col gap-3 ${className}`}
      data-testid="simple-pro-final-review-screen"
      role="region"
      aria-label={reviewHeadline}
    >
      <div className="min-w-0">
        {canonicalPaidProReview ? (
          <>
            {/* Enterprise paid Pro header: one primary title, one status chip, one sentence. */}
            <h2
              className="font-serif text-lg font-semibold uppercase tracking-[0.14em] text-stone-900 sm:text-xl"
              data-testid="simple-pro-final-review-headline"
            >
              {reviewHeadline}
            </h2>
            <div className="mt-1.5">
              <span
                className="rounded-full border border-emerald-300/80 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-900"
                data-testid="canonical-paid-pro-review-chip-state"
              >
                {PAID_PRO_REVIEW_CHIP_STATE}
              </span>
            </div>
          </>
        ) : (
          <>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500">LawDog Pro</p>
            <h2
              className="mt-1 font-serif text-lg font-semibold tracking-tight text-stone-900 sm:text-xl"
              data-testid="simple-pro-final-review-headline"
            >
              {reviewHeadline}
            </h2>
          </>
        )}
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
        ) : signerSetupRequired ? (
          <p
            className="mt-1 text-xs font-medium text-amber-900"
            data-testid="simple-pro-final-review-signers-required"
          >
            Add signer details before continuing.
          </p>
        ) : null}
        {!canonicalPaidProReview ? (
          <p className="mt-0.5 text-[11px] leading-relaxed text-stone-600" data-testid="simple-pro-final-review-send-trust">
            This is the version that will be sent.
          </p>
        ) : null}
        {!canonicalPaidProReview && appliedChecklist.length > 0 && !bulkApplyBusy ? (
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
        ) : !canonicalPaidProReview && appliedAreas.length > 0 && !bulkApplyBusy ? (
          <p className="mt-2 text-[11px] leading-relaxed text-emerald-900/90">
            Updated: {appliedAreas.slice(0, 4).join(" · ")}
            {appliedAreas.length > 4 ? ` (+${appliedAreas.length - 4} more)` : ""}
          </p>
        ) : null}
        <p
          className="mt-2 text-xs leading-relaxed text-stone-600 sm:text-sm"
          data-testid="simple-pro-final-review-subcopy"
        >
          {reviewSubcopy}
        </p>
        {onBackToSignerDetails ? (
          <button
            type="button"
            className="mt-2 text-[11px] font-medium text-stone-600 underline decoration-stone-400/70 underline-offset-2 hover:text-stone-800"
            onClick={onBackToSignerDetails}
            data-testid="simple-pro-back-to-signer-details"
          >
            {PAID_PRO_REVIEW_EDIT_SIGNER_DETAILS_LABEL}
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

      {effectiveCorpusRecoveryMessage ? (
        <div
          className="rounded-md border border-amber-300/90 bg-amber-50 px-3 py-3 text-sm leading-relaxed text-amber-950"
          role="alert"
          data-testid="simple-pro-final-review-corpus-recovery"
        >
          {effectiveCorpusRecoveryMessage}
        </div>
      ) : null}
      <div
        className="rounded-sm border border-stone-200/90 bg-white shadow-sm ring-1 ring-black/[0.05]"
        data-testid="simple-pro-final-review-document"
      >
        {showDocument ? (
          preferHydratedReviewHtml ? (
            <PremiumAgreementReadonlyView
              html={effectiveAgreementHtml}
              suppressEmptyFallback={suppressEmptyFallback}
              fullDocumentFlow={false}
              visibleProPaperTrace={visibleProPaperTrace}
            />
          ) : showCanonicalPaidPre ? (
            <article
              aria-label="Agreement document preview"
              className="premium-readonly-doc min-h-0 overflow-visible px-[clamp(1.85rem,6.5vw,3.5rem)] pb-16 pt-11 text-left"
              data-testid="premium-agreement-readonly-article"
              data-paid-pro-authoritative-source={paidReviewAuthoritativeSource}
            >
              <pre
                className="whitespace-pre-wrap font-serif text-[15px] leading-[1.75] text-stone-800"
                data-testid="simple-pro-final-review-paid-sot-body"
              >{paidReviewPlain.trim()}</pre>
            </article>
          ) : effectiveAgreementHtml.length > 0 ? (
            <PremiumAgreementReadonlyView
              html={effectiveAgreementHtml}
              suppressEmptyFallback={suppressEmptyFallback}
              fullDocumentFlow={false}
              visibleProPaperTrace={visibleProPaperTrace}
            />
          ) : null
        ) : showPreviewUnavailable ? (
          <p
            className="px-4 py-8 text-center text-sm leading-relaxed text-stone-600"
            data-testid="simple-pro-final-review-document-empty"
          >
            Agreement preview is not available. Use Edit signer details, then continue to final review again.
          </p>
        ) : null}
      </div>
      {signersReady ? (
        <p
          className="rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-[11px] leading-relaxed text-stone-700"
          data-testid="simple-pro-final-review-signing-fields-note"
        >
          LawDog will place matching e-signature fields on the signature lines when you continue.
        </p>
      ) : null}

      <div
        className="flex flex-col gap-2"
        data-testid="simple-pro-final-review-actions"
        aria-live={reviewFirstActionsBlocked ? "assertive" : undefined}
      >
        {reviewFirstHandoffBusy && !reviewFirstActionsBlocked ? (
          <p
            className="rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-center text-xs font-medium text-stone-700"
            role="status"
            data-testid="simple-pro-review-first-handoff-busy"
          >
            Creating review links…
          </p>
        ) : null}

        {reviewFirstActionsBlocked ? (
          <div
            ref={reviewFirstErrorRef}
            className="rounded-lg border-2 border-amber-500/90 bg-amber-50 px-4 py-4 text-sm text-amber-950 shadow-md shadow-amber-900/10"
            role="alert"
            data-testid="simple-pro-review-first-handoff-error"
          >
            <p className="text-base font-semibold text-amber-950">Review links unavailable</p>
            <p className="mt-2 leading-relaxed">{reviewFirstHandoffError}</p>
            {reviewFirstSigningTokenSecretMissing ? (
              <p
                className="mt-3 rounded-md border border-amber-600/50 bg-amber-100/80 px-3 py-2 text-[11px] leading-relaxed text-amber-950"
                data-testid="review-first-env-config-hint"
              >
                {REVIEW_FIRST_SIGNING_TOKEN_SECRET_OPERATOR_HINT}
              </p>
            ) : null}
            {onBackToFinalReviewFromReviewHandoff || onRetryReviewFirstHandoff ? (
              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                {onRetryReviewFirstHandoff && !reviewFirstSigningTokenSecretMissing ? (
                  <button
                    type="button"
                    className="w-full rounded-lg bg-amber-900 px-4 py-2.5 text-sm font-semibold text-amber-50 sm:w-auto"
                    disabled={reviewFirstHandoffBusy}
                    onClick={onRetryReviewFirstHandoff}
                    data-testid="simple-pro-review-first-retry"
                  >
                    {reviewFirstHandoffBusy ? "Retrying…" : "Retry creating review links"}
                  </button>
                ) : null}
                {onBackToFinalReviewFromReviewHandoff ? (
                  <button
                    type="button"
                    className="w-full rounded-lg border border-amber-500/80 bg-white px-4 py-2.5 text-sm font-semibold text-amber-950 sm:w-auto"
                    disabled={reviewFirstHandoffBusy}
                    onClick={onBackToFinalReviewFromReviewHandoff}
                    data-testid="simple-pro-review-first-back"
                  >
                    Back to final review
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : (
          <>
            <button
              type="button"
              className="w-full rounded-lg bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-45"
              disabled={sendDisabled || packetStale || bulkApplyBusy}
              onClick={onSendForSignature}
              data-testid="simple-pro-send-for-signature"
            >
              {signaturePrimaryLabel}
            </button>
            {signerSetupRequired ? (
              <p
                className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-medium text-amber-950"
                role="note"
                data-testid="simple-pro-signer-details-required-note"
              >
                Add signer details before continuing.
              </p>
            ) : null}
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              {onChangeSigningOrder && !signerSetupRequired ? (
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
              {!signerSetupRequired ? (
                <button
                  type="button"
                  className="w-full rounded-lg border border-stone-300/90 bg-white px-3 py-2 text-xs font-semibold text-stone-800 sm:w-auto"
                  disabled={sendDisabled || packetStale || bulkApplyBusy || reviewFirstHandoffBusy}
                  onClick={onSendForReview}
                  data-testid="simple-pro-send-for-review"
                >
                  {reviewFirstHandoffBusy ? "Creating review links…" : reviewSecondaryLabel}
                </button>
              ) : null}
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
              {canEditAgreementText && !suppressPostReviewEditUx ? (
                <button
                  type="button"
                  className="w-full rounded-lg border border-stone-300/90 bg-white px-3 py-2 text-xs font-semibold text-stone-800 sm:w-auto"
                  aria-expanded={editAgreementTextOpen}
                  onClick={() => setEditAgreementTextOpen((v) => !v)}
                  data-testid="simple-pro-edit-agreement-text-toggle"
                >
                  {editAgreementTextOpen ? "Hide agreement text editor" : "Edit agreement text"}
                </button>
              ) : null}
            </div>
            {exportError ? (
              <p className="text-[11px] font-medium text-amber-800" role="alert">
                {exportError}
              </p>
            ) : null}
          </>
        )}
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

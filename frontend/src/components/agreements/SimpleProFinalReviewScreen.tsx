import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { PaidProReviewStickyScrollSpacer } from "./paidProStickyBottomInset";
import { PremiumAgreementReadonlyView } from "./PremiumAgreementReadonlyView";
import type { VisibleProPaperDiagnosticsTrace } from "./visibleProPaperRenderBoundary";
import { PRO_REVIEW_EDITED_FILE_INPUT_ACCEPT } from "./reviewEditedVersionUpload";
import { highlightAllGuidedChangedSections, scrollToGuidedAppliedChecklistSection } from "./guidedDealCompletion/guidedSectionScroll";
import {
  resolvePaidProReviewSignerDetailsActionLabel,
  PAID_PRO_REVIEW_SHELL_SUBTITLE,
  PAID_PRO_REVIEW_SHELL_TITLE,
  suppressPaidProFinalReviewFinalizingState,
} from "./authoritativePaidProReview";
import {
  PAID_PRO_REVIEW_DOCUMENT_TAIL_PADDING_CLASS,
  PAID_PRO_REVIEW_DOCUMENT_TAIL_PADDING_LEGACY_CLASS,
  PAID_PRO_REVIEW_POST_DOCUMENT_STACK_GAP_CLASS,
} from "./paidProReviewLayoutConstants";
import { PaidProReviewNextStepCallout } from "./PaidProReviewNextStepCallout";
import { PaidProReviewStatusPanel } from "./PaidProReviewStatusPanel";
import { PaidProSignerSavedConfirmationBanner } from "./PaidProSignerSavedConfirmationBanner";
import {
  PAID_PRO_FINAL_VERSION_HEADLINE,
  resolvePaidProFinalVersionCopy,
  type PaidProSignerSavedMapping,
} from "./paidProReviewTrustUx";
import { PAID_PRO_AUTHORITY_MIN_LEN } from "./paidProAgreementAuthority";
import { PaidProCanonicalPlainReviewDocument } from "./paidProCanonicalPlainReviewDocument";
import {
  auditPaidProFirstReviewVisibleCorpus,
  hasPaidProFirstReviewAuthoritativeCorpus,
  logPaidProFirstReviewDomVisible,
  logPaidProFirstReviewEmergencyFallback,
  logPaidProFirstReviewRenderBranch,
  logPaidProReviewRenderSourceOnce,
  logPaidProReviewVisibleRenderGuardOnce,
  measureElementVisibleTextLen,
  PAID_PRO_REVIEW_VISIBLE_TEXT_MIN,
  readPaidProFirstReviewDomVisibilitySnapshot,
  resolveEffectivePaidProReviewPlain,
  resolvePaidProFirstReviewDocumentPresentation,
  resolvePaidProFirstReviewEmergencyPlain,
  shouldForcePaidProCanonicalPlainFallback,
  shouldRenderPaidProFirstReviewDiagnostics,
  shouldSynchronouslyRenderCanonicalPlainFirstReview,
} from "./paidProFirstReviewRenderGuard";
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
  /** Agreement save service unreachable — dedicated persist blocker (not mint failure). */
  reviewLinkPersistFailureActive?: boolean;
  /** Railway/production: signing token secret unset — hide retry loop. */
  reviewFirstSigningTokenSecretMissing?: boolean;
  onCopyReviewLinkPersistDebugInfo?: () => void;
  onBackToFinalReviewFromReviewHandoff?: () => void;
  onRetryReviewFirstHandoff?: () => void;
  /** Signer/reviewer emails captured before final review. */
  signersReady?: boolean;
  /** Hide edit/suggest/upload chrome after signer setup is complete. */
  suppressPostReviewEditUx?: boolean;
  /** Signing snapshot finalized — signature-link prep step complete. */
  signerMetadataFinalized?: boolean;
  /** Party → signer mapping for post-save confirmation banner. */
  signerSavedMappings?: readonly PaidProSignerSavedMapping[];
  /** Shown when authoritative corpus is blocked or empty. */
  corpusRecoveryMessage?: string | null;
  /** When false, checklist shows without broken jump links (DOM anchors missing). */
  enableSectionJump?: boolean;
  /** Post-checkout paid SoT — canonical Pro review shell (no guided Q&A chrome). */
  canonicalPaidProReview?: boolean;
  /** Shell already shows title + trust line — hide in-panel duplicate chrome. */
  suppressShellDuplicatedChrome?: boolean;
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
  /** Measured sticky CTA clearance — spacer after execution block (px). */
  stickyBottomScrollInsetPx?: number;
  /** Inline signer setup follows — scroll padding handled on outer preview shell only. */
  suppressPostDocumentScrollSpacer?: boolean;
  /** Inline signer + sticky CTA own primary actions — hide in-panel send/copy/export strip. */
  suppressFinalReviewActions?: boolean;
  className?: string;
  visibleProPaperTrace?: VisibleProPaperDiagnosticsTrace;
  selectedTrack?: string | null;
  signaturePreparationRequested?: boolean;
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
  reviewLinkPersistFailureActive = false,
  reviewFirstSigningTokenSecretMissing = false,
  onBackToFinalReviewFromReviewHandoff,
  onRetryReviewFirstHandoff,
  onCopyReviewLinkPersistDebugInfo,
  signersReady = false,
  signerMetadataFinalized = false,
  signerSavedMappings = [],
  suppressPostReviewEditUx = false,
  corpusRecoveryMessage = null,
  enableSectionJump = true,
  canonicalPaidProReview = false,
  suppressShellDuplicatedChrome = false,
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
  stickyBottomScrollInsetPx = 0,
  suppressPostDocumentScrollSpacer = false,
  suppressFinalReviewActions = false,
  className = "",
  visibleProPaperTrace,
  selectedTrack = null,
  signaturePreparationRequested = false,
}: SimpleProFinalReviewScreenProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const reviewFirstErrorRef = useRef<HTMLDivElement>(null);
  const documentVisibleMeasureRef = useRef<HTMLDivElement>(null);
  const [domVisibleFallback, setDomVisibleFallback] = useState(false);
  const [emergencyFallbackActive, setEmergencyFallbackActive] = useState(false);
  const editAgreementTextBaselineRef = useRef("");
  const [editAgreementTextOpen, setEditAgreementTextOpen] = useState(false);
  const [showUploadActions, setShowUploadActions] = useState(Boolean(uploadedSource));
  const reviewFirstActionsBlocked = Boolean(reviewFirstHandoffError?.trim());
  const persistSaveFailure = reviewLinkPersistFailureActive && !reviewFirstSigningTokenSecretMissing;
  const canDirectEditPlainText = Boolean(onEditablePlainTextChange && onSavePlainTextEdits);
  const canSuggestEdits =
    !suppressPostReviewEditUx &&
    Boolean(onApplySuggestEdits && onSuggestEditsDraftChange && onUploadFile);
  const signerSetupRequired = canonicalPaidProReview && !signersReady;
  const canEditAgreementText =
    canDirectEditPlainText || (!signerSetupRequired && !suppressPostReviewEditUx && canSuggestEdits);
  const effectivePaidReviewPlain = resolveEffectivePaidProReviewPlain({
    paidReviewPlain,
    canonicalPaidProReview,
  });
  const paidReviewBodyLen = effectivePaidReviewPlain.trim().length;
  const firstReviewAuthorityActive = hasPaidProFirstReviewAuthoritativeCorpus({
    paidReviewPlain: effectivePaidReviewPlain,
    canonicalPaidProReview,
  });
  const hasCanonicalPaidReviewBody =
    firstReviewAuthorityActive && paidReviewBodyLen >= PAID_PRO_AUTHORITY_MIN_LEN;
  const documentPresentation = resolvePaidProFirstReviewDocumentPresentation({
    agreementHtml,
    paidReviewPlain: effectivePaidReviewPlain,
    canonicalPaidProReview: firstReviewAuthorityActive || canonicalPaidProReview,
  });
  const paidProFirstReviewDiagnosticsActive = shouldRenderPaidProFirstReviewDiagnostics({
    canonicalPaidProReview: firstReviewAuthorityActive || canonicalPaidProReview,
    paidReviewPlain: effectivePaidReviewPlain,
  });
  const syncCanonicalPlain = shouldSynchronouslyRenderCanonicalPlainFirstReview({
    paidReviewPlain: effectivePaidReviewPlain,
    canonicalPaidProReview: firstReviewAuthorityActive || canonicalPaidProReview,
    presentation: documentPresentation,
  });
  const emergencyPlain = resolvePaidProFirstReviewEmergencyPlain();
  const showSignerSavedBanner =
    canonicalPaidProReview && signersReady && signerSavedMappings.length > 0;
  const finalVersionCopy = canonicalPaidProReview
    ? resolvePaidProFinalVersionCopy({ signersReady })
    : null;
  const suppressFinalizingForPaidAuthority =
    hasCanonicalPaidReviewBody || suppressPaidProFinalReviewFinalizingState();
  const effectiveCorpusRecoveryMessage =
    suppressFinalizingForPaidAuthority && hasCanonicalPaidReviewBody ? null : corpusRecoveryMessage;
  const effectiveAgreementHtml = documentPresentation.agreementHtml;
  const renderCanonicalPlain = Boolean(
    syncCanonicalPlain ||
      domVisibleFallback ||
      emergencyFallbackActive,
  );
  const preferHydratedReviewHtml =
    documentPresentation.mode === "html" &&
    !renderCanonicalPlain &&
    !domVisibleFallback &&
    !emergencyFallbackActive &&
    !documentPresentation.fallbackApplied &&
    !documentPresentation.hardInvariantForced &&
    documentPresentation.htmlVisibleTextLen >= PAID_PRO_REVIEW_VISIBLE_TEXT_MIN;
  const showDocument =
    (documentPresentation.renderedVisibleTextLen > 0 ||
      hasCanonicalPaidReviewBody ||
      effectiveAgreementHtml.length > 0) &&
    !effectiveCorpusRecoveryMessage;
  const renderBranch = emergencyFallbackActive
    ? "emergency_sot_plain"
    : renderCanonicalPlain
      ? "canonical_plain_sync"
      : preferHydratedReviewHtml
        ? "premium_readonly_html_full"
        : effectiveAgreementHtml.length > 0
          ? "premium_readonly_html_compact"
          : hasCanonicalPaidReviewBody
            ? "canonical_plain_tail"
            : "empty";
  const showPreviewUnavailable =
    !showDocument &&
    !hasCanonicalPaidReviewBody &&
    !suppressFinalizingForPaidAuthority;
  const hideInPanelTitleChrome = Boolean(canonicalPaidProReview && suppressShellDuplicatedChrome);
  const documentFirst = Boolean(canonicalPaidProReview && hasCanonicalPaidReviewBody);
  const stackGapClass = hideInPanelTitleChrome
    ? PAID_PRO_REVIEW_POST_DOCUMENT_STACK_GAP_CLASS
    : "gap-3";
  const documentTailPaddingClass = hideInPanelTitleChrome
    ? PAID_PRO_REVIEW_DOCUMENT_TAIL_PADDING_CLASS
    : PAID_PRO_REVIEW_DOCUMENT_TAIL_PADDING_LEGACY_CLASS;
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
    if (!signerSetupRequired && !suppressPostReviewEditUx) return;
    setEditAgreementTextOpen(false);
  }, [signerSetupRequired, suppressPostReviewEditUx]);

  useEffect(() => {
    if (!reviewFirstHandoffError?.trim()) return;
    const el = reviewFirstErrorRef.current;
    if (!el) return;
    const timer = window.setTimeout(() => {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
    return () => window.clearTimeout(timer);
  }, [reviewFirstHandoffError]);

  useLayoutEffect(() => {
    if (!firstReviewAuthorityActive || paidReviewBodyLen < PAID_PRO_REVIEW_VISIBLE_TEXT_MIN) {
      setDomVisibleFallback(false);
      setEmergencyFallbackActive(false);
      return;
    }
    if (syncCanonicalPlain || renderCanonicalPlain) {
      const domSnap = readPaidProFirstReviewDomVisibilitySnapshot(documentVisibleMeasureRef.current);
      logPaidProFirstReviewDomVisible(domSnap);
      if (
        domSnap.containerInnerTextLen < PAID_PRO_REVIEW_VISIBLE_TEXT_MIN &&
        emergencyPlain.length >= PAID_PRO_REVIEW_VISIBLE_TEXT_MIN
      ) {
        setEmergencyFallbackActive(true);
        logPaidProFirstReviewEmergencyFallback({
          canonicalLen: emergencyPlain.length,
          containerInnerTextLen: domSnap.containerInnerTextLen,
          reason: "container_empty_after_sync_canonical",
        });
      }
      return;
    }
    const measuredVisibleLen = measureElementVisibleTextLen(documentVisibleMeasureRef.current);
    const needsFallback = shouldForcePaidProCanonicalPlainFallback({
      canonicalPaidProReview: firstReviewAuthorityActive || canonicalPaidProReview,
      paidReviewPlain: effectivePaidReviewPlain,
      measuredVisibleTextLen: measuredVisibleLen,
    });
    const domSnap = readPaidProFirstReviewDomVisibilitySnapshot(documentVisibleMeasureRef.current);
    logPaidProFirstReviewDomVisible(domSnap);
    if (needsFallback) {
      setDomVisibleFallback(true);
      logPaidProReviewVisibleRenderGuardOnce({
        canonicalLen: paidReviewBodyLen,
        htmlLen: documentPresentation.htmlLen,
        visibleTextLen: measuredVisibleLen,
        renderMode: "canonical_plain",
        fallbackApplied: true,
      });
    } else if (
      measuredVisibleLen < PAID_PRO_REVIEW_VISIBLE_TEXT_MIN &&
      emergencyPlain.length >= PAID_PRO_REVIEW_VISIBLE_TEXT_MIN
    ) {
      setEmergencyFallbackActive(true);
      logPaidProFirstReviewEmergencyFallback({
        canonicalLen: emergencyPlain.length,
        containerInnerTextLen: measuredVisibleLen,
        reason: "container_empty_after_html_paint",
      });
    }
  }, [
    firstReviewAuthorityActive,
    canonicalPaidProReview,
    paidReviewPlain,
    paidReviewBodyLen,
    agreementHtml,
    documentPresentation.htmlLen,
    documentPresentation.mode,
    documentPresentation.fallbackApplied,
    syncCanonicalPlain,
    renderCanonicalPlain,
    emergencyPlain,
    effectivePaidReviewPlain,
  ]);

  useEffect(() => {
    if (!paidProFirstReviewDiagnosticsActive) return;
    logPaidProFirstReviewRenderBranch({
      bodyLen: paidReviewBodyLen,
      canonicalLen: documentPresentation.plainLen,
      htmlLen: documentPresentation.htmlLen,
      visibleTextLen: renderCanonicalPlain || emergencyFallbackActive
        ? documentPresentation.plainLen
        : documentPresentation.htmlVisibleTextLen,
      renderMode: renderCanonicalPlain || emergencyFallbackActive
        ? "canonical_plain"
        : documentPresentation.mode,
      componentBranch: renderBranch,
      fallbackApplied:
        documentPresentation.fallbackApplied ||
        documentPresentation.hardInvariantForced ||
        domVisibleFallback ||
        emergencyFallbackActive,
    });
    auditPaidProFirstReviewVisibleCorpus({
      paidReviewPlain: effectivePaidReviewPlain,
      presentation: documentPresentation,
    });
    const effectiveVisibleLen = renderCanonicalPlain
      ? documentPresentation.plainLen
      : domVisibleFallback
        ? documentPresentation.plainLen
        : documentPresentation.renderedVisibleTextLen;
    logPaidProReviewRenderSourceOnce({
      hasCanonicalCorpus: hasCanonicalPaidReviewBody,
      canonicalLen: documentPresentation.plainLen,
      htmlLen: documentPresentation.htmlLen,
      plainLen: documentPresentation.plainLen,
      renderedVisibleTextLen: effectiveVisibleLen,
      renderMode: renderCanonicalPlain || domVisibleFallback ? "canonical_plain" : documentPresentation.mode,
      selectedTrack,
      signaturePreparationRequested,
    });
    logPaidProReviewVisibleRenderGuardOnce({
      canonicalLen: documentPresentation.plainLen,
      htmlLen: documentPresentation.htmlLen,
      visibleTextLen: renderCanonicalPlain
        ? documentPresentation.plainLen
        : domVisibleFallback
          ? 0
          : documentPresentation.htmlVisibleTextLen,
      renderMode: renderCanonicalPlain || domVisibleFallback ? "canonical_plain" : documentPresentation.mode,
      fallbackApplied:
        documentPresentation.fallbackApplied ||
        documentPresentation.hardInvariantForced ||
        domVisibleFallback,
    });
  }, [
    paidProFirstReviewDiagnosticsActive,
    effectivePaidReviewPlain,
    agreementHtml,
    hasCanonicalPaidReviewBody,
    documentPresentation.mode,
    documentPresentation.fallbackApplied,
    documentPresentation.hardInvariantForced,
    documentPresentation.renderedVisibleTextLen,
    documentPresentation.plainLen,
    documentPresentation.htmlLen,
    documentPresentation.htmlVisibleTextLen,
    renderCanonicalPlain,
    domVisibleFallback,
    selectedTrack,
    signaturePreparationRequested,
    firstReviewAuthorityActive,
    renderBranch,
    emergencyFallbackActive,
  ]);

  const canonicalPlainForRender = (
    emergencyFallbackActive && emergencyPlain.length >= PAID_PRO_REVIEW_VISIBLE_TEXT_MIN
      ? emergencyPlain
      : effectivePaidReviewPlain
  ).trim();

  const documentBlock = (
    <div
      ref={documentVisibleMeasureRef}
      className="w-full max-w-full min-w-0 overflow-x-hidden rounded-sm border border-stone-200/90 bg-white shadow-sm ring-1 ring-black/[0.05]"
      data-testid="simple-pro-final-review-document"
      data-paid-pro-review-render-mode={
        renderCanonicalPlain ? "canonical_plain" : documentPresentation.mode
      }
    >
      {showDocument ? (
        emergencyFallbackActive && emergencyPlain.length >= PAID_PRO_REVIEW_VISIBLE_TEXT_MIN ? (
          <>
            <p
              className="border-b border-amber-200/80 bg-amber-50/90 px-4 py-2.5 text-xs font-medium text-amber-950"
              data-testid="paid-pro-first-review-emergency-banner"
              role="status"
            >
              Pro agreement generated. Showing canonical agreement text.
            </p>
            <PaidProCanonicalPlainReviewDocument
              plain={emergencyPlain}
              tailPaddingClass={documentTailPaddingClass}
              compactTopPadding={hideInPanelTitleChrome}
              authoritativeSource="paidProSourceOfTruth"
            />
          </>
        ) : renderCanonicalPlain ? (
          <PaidProCanonicalPlainReviewDocument
            plain={canonicalPlainForRender}
            tailPaddingClass={documentTailPaddingClass}
            compactTopPadding={hideInPanelTitleChrome}
            authoritativeSource={paidReviewAuthoritativeSource}
          />
        ) : preferHydratedReviewHtml ? (
          <PremiumAgreementReadonlyView
            html={effectiveAgreementHtml}
            suppressEmptyFallback={hasCanonicalPaidReviewBody ? true : suppressEmptyFallback}
            emptyFallback={
              hasCanonicalPaidReviewBody ? undefined : "No document text yet."
            }
            fullDocumentFlow={canonicalPaidProReview}
            compactDocumentTopPadding={hideInPanelTitleChrome}
            bottomScrollInsetPx={canonicalPaidProReview ? 0 : stickyBottomScrollInsetPx}
            visibleProPaperTrace={visibleProPaperTrace}
          />
        ) : effectiveAgreementHtml.length > 0 ? (
          <PremiumAgreementReadonlyView
            html={effectiveAgreementHtml}
            suppressEmptyFallback={hasCanonicalPaidReviewBody ? true : suppressEmptyFallback}
            fullDocumentFlow={false}
            visibleProPaperTrace={visibleProPaperTrace}
          />
        ) : hasCanonicalPaidReviewBody ? (
          <PaidProCanonicalPlainReviewDocument
            plain={canonicalPlainForRender}
            tailPaddingClass={documentTailPaddingClass}
            compactTopPadding={hideInPanelTitleChrome}
            authoritativeSource={paidReviewAuthoritativeSource}
          />
        ) : null
      ) : showPreviewUnavailable ? (
        <p
          className="px-6 py-10 text-center text-sm text-stone-500"
          data-testid="simple-pro-final-review-document-empty"
        >
          Agreement preview is not available. Use Add signer details, then continue to final review again.
        </p>
      ) : null}
    </div>
  );

  const postDocumentGuidance = (
    <>
      {canonicalPaidProReview && hasCanonicalPaidReviewBody ? (
        <PaidProReviewStatusPanel
          signersReady={signersReady}
          signerMetadataFinalized={signerMetadataFinalized}
          signingReadyHydrated={signerMetadataFinalized}
          compactShell={hideInPanelTitleChrome}
          previewPlainText={paidReviewPlain}
        />
      ) : null}
      {showSignerSavedBanner ? (
        <PaidProSignerSavedConfirmationBanner mappings={signerSavedMappings} />
      ) : null}
      {!hideInPanelTitleChrome && canonicalPaidProReview && hasCanonicalPaidReviewBody && finalVersionCopy ? (
        <div
          className="rounded-md border border-stone-200/90 bg-white px-3 py-2.5 shadow-sm ring-1 ring-black/[0.04] sm:px-3.5"
          data-testid="paid-pro-final-version-indicator"
        >
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-700">
            {PAID_PRO_FINAL_VERSION_HEADLINE}
          </p>
          <p className="mt-1.5 text-xs leading-relaxed text-stone-600 sm:text-[13px]">
            {finalVersionCopy}
          </p>
        </div>
      ) : null}
      {canonicalPaidProReview && hasCanonicalPaidReviewBody ? (
        <PaidProReviewNextStepCallout signersReady={signersReady} compactShell={hideInPanelTitleChrome} />
      ) : null}
    </>
  );

  return (
    <div
      className={`flex flex-col ${stackGapClass} ${className}`}
      data-testid="simple-pro-final-review-screen"
      role="region"
      aria-label={reviewHeadline}
    >
      <div className="min-w-0">
        {hideInPanelTitleChrome ? null : canonicalPaidProReview ? (
          <>
            {/* Enterprise paid Pro header: one primary title, one status chip, one sentence. */}
            <h2
              className="font-serif text-lg font-semibold uppercase tracking-[0.14em] text-stone-900 sm:text-xl"
              data-testid="simple-pro-final-review-headline"
            >
              {reviewHeadline}
            </h2>
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
        {canonicalPaidProReview ? null : signersReady ? (
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
        {hideInPanelTitleChrome ? null : (
          <p
            className="mt-2 text-xs leading-relaxed text-stone-600 sm:text-sm"
            data-testid="simple-pro-final-review-subcopy"
          >
            {reviewSubcopy}
          </p>
        )}
        {onBackToSignerDetails ? (
          <button
            type="button"
            className="mt-2 text-[11px] font-medium text-stone-600 underline decoration-stone-400/70 underline-offset-2 hover:text-stone-800"
            onClick={onBackToSignerDetails}
            data-testid="simple-pro-back-to-signer-details"
          >
            {resolvePaidProReviewSignerDetailsActionLabel(signersReady)}
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
          Agreement changed after links were created. Those links are no longer valid. Create new links for this version.
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

      {documentFirst ? (
        <>
          {documentBlock}
          {postDocumentGuidance}
          {!suppressPostDocumentScrollSpacer && stickyBottomScrollInsetPx > 0 ? (
            <PaidProReviewStickyScrollSpacer heightPx={stickyBottomScrollInsetPx} />
          ) : null}
        </>
      ) : (
        <>
          {postDocumentGuidance}
          {documentBlock}
          {!suppressPostDocumentScrollSpacer && stickyBottomScrollInsetPx > 0 ? (
            <PaidProReviewStickyScrollSpacer heightPx={stickyBottomScrollInsetPx} />
          ) : null}
        </>
      )}
      {signersReady && !suppressFinalReviewActions ? (
        <p
          className="rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-[11px] leading-relaxed text-stone-700"
          data-testid="simple-pro-final-review-signing-fields-note"
        >
          LawDog will place matching e-signature fields on the signature lines when you continue.
        </p>
      ) : null}

      {suppressFinalReviewActions ? null : (
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
            data-testid={
              persistSaveFailure
                ? "simple-pro-review-link-persist-failure"
                : "simple-pro-review-first-handoff-error"
            }
          >
            <p className="text-base font-semibold text-amber-950">
              {persistSaveFailure ? "Review link could not be created" : "Review links unavailable"}
            </p>
            <p className="mt-2 leading-relaxed">{reviewFirstHandoffError}</p>
            {reviewFirstSigningTokenSecretMissing ? (
              <p
                className="mt-3 rounded-md border border-amber-600/50 bg-amber-100/80 px-3 py-2 text-[11px] leading-relaxed text-amber-950"
                data-testid="review-first-env-config-hint"
              >
                {REVIEW_FIRST_SIGNING_TOKEN_SECRET_OPERATOR_HINT}
              </p>
            ) : null}
            {onBackToFinalReviewFromReviewHandoff ||
            onRetryReviewFirstHandoff ||
            (persistSaveFailure && onCopyAgreement) ||
            (persistSaveFailure && onCopyReviewLinkPersistDebugInfo) ? (
              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                {onRetryReviewFirstHandoff && !reviewFirstSigningTokenSecretMissing ? (
                  <button
                    type="button"
                    className="w-full rounded-lg bg-amber-900 px-4 py-2.5 text-sm font-semibold text-amber-50 sm:w-auto"
                    disabled={reviewFirstHandoffBusy}
                    onClick={onRetryReviewFirstHandoff}
                    data-testid="simple-pro-review-first-retry"
                  >
                    {reviewFirstHandoffBusy
                      ? "Retrying…"
                      : persistSaveFailure
                        ? "Retry creating review link"
                        : "Retry creating review links"}
                  </button>
                ) : null}
                {persistSaveFailure && onCopyAgreement ? (
                  <button
                    type="button"
                    className="w-full rounded-lg border border-amber-500/80 bg-white px-4 py-2.5 text-sm font-semibold text-amber-950 sm:w-auto"
                    disabled={reviewFirstHandoffBusy}
                    onClick={onCopyAgreement}
                    data-testid="simple-pro-review-link-copy-agreement"
                  >
                    Copy agreement text
                  </button>
                ) : null}
                {persistSaveFailure && onCopyReviewLinkPersistDebugInfo ? (
                  <button
                    type="button"
                    className="w-full rounded-lg border border-amber-500/80 bg-white px-4 py-2.5 text-sm font-semibold text-amber-950 sm:w-auto"
                    disabled={reviewFirstHandoffBusy}
                    onClick={onCopyReviewLinkPersistDebugInfo}
                    data-testid="simple-pro-review-link-copy-debug"
                  >
                    Copy debug info
                  </button>
                ) : null}
                {onBackToFinalReviewFromReviewHandoff && !persistSaveFailure ? (
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
              {canEditAgreementText ? (
                <button
                  type="button"
                  className="w-full rounded-lg border border-stone-300/90 bg-white px-3 py-2 text-xs font-semibold text-stone-800 sm:w-auto"
                  aria-expanded={editAgreementTextOpen}
                  onClick={() => {
                    setEditAgreementTextOpen((open) => {
                      const next = !open;
                      if (next) {
                        editAgreementTextBaselineRef.current = (editablePlainText ?? "").trim();
                      }
                      return next;
                    });
                  }}
                  data-testid="simple-pro-edit-agreement-text-toggle"
                >
                  {editAgreementTextOpen ? "Hide direct editor" : "Edit agreement directly"}
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
      )}

      {!suppressFinalReviewActions && canEditAgreementText && editAgreementTextOpen ? (
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
                Edit agreement directly — no AI call
              </label>
              <textarea
                id="simple-pro-edit-agreement-plain-input"
                className="mt-2 min-h-[12rem] w-full resize-y rounded-md border border-stone-300/90 bg-white px-2.5 py-2 font-mono text-[11px] leading-relaxed text-stone-900"
                value={editablePlainText ?? ""}
                disabled={savePlainTextBusy}
                onChange={(e) => onEditablePlainTextChange?.(e.target.value)}
                data-testid="simple-pro-edit-agreement-plain-input"
              />
              {savePlainTextBusy ? (
                <p className="mt-1.5 text-[11px] font-medium text-stone-700" role="status">
                  Saving changes…
                </p>
              ) : savePlainTextAck ? (
                <p className="mt-1.5 text-[11px] font-medium text-emerald-800" role="status" data-testid="simple-pro-save-ack">
                  Changes saved. The agreement text is updated.
                </p>
              ) : (editablePlainText ?? "").trim() !== editAgreementTextBaselineRef.current ? (
                <p className="mt-1.5 text-[11px] font-medium text-amber-800" role="status" data-testid="simple-pro-unsaved">
                  Unsaved changes
                </p>
              ) : null}
              <div className="mt-2 flex flex-col gap-1.5 sm:flex-row sm:flex-wrap">
                <button
                  type="button"
                  className="rounded-md bg-emerald-800 px-2.5 py-1.5 text-[11px] font-semibold text-white disabled:opacity-45"
                  disabled={savePlainTextBusy || !(editablePlainText ?? "").trim()}
                  onClick={onSavePlainTextEdits}
                  data-testid="simple-pro-save-agreement-edits"
                >
                  {savePlainTextBusy ? "Saving…" : savePlainTextAck ? "Changes saved" : "Save edits"}
                </button>
                <button
                  type="button"
                  className="rounded-md border border-stone-300/90 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-stone-800"
                  disabled={savePlainTextBusy}
                  onClick={() => {
                    onEditablePlainTextChange?.(editAgreementTextBaselineRef.current);
                    setEditAgreementTextOpen(false);
                  }}
                  data-testid="simple-pro-cancel-agreement-edits"
                >
                  Cancel
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
                {canDirectEditPlainText ? "Ask LawDog to revise" : "Edit or paste changes before sending"}
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

      {!suppressFinalReviewActions && uploadError ? (
        <p className="text-[11px] font-medium text-amber-800" role="alert">
          {uploadError}
        </p>
      ) : null}

      {!suppressFinalReviewActions && showUploadActions && uploadedSource ? (
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

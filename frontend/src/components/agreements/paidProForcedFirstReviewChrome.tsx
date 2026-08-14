/**
 * Post-signer-finalize review decision chrome for forced paid Pro document route.
 * Practical GTM: equal Option A (signing) vs Option B (party review / redline).
 */

import { useEffect } from "react";
import { PremiumAgreementCopyButton } from "./PremiumAgreementCopyButton";
import { PaidProSignerSavedConfirmationBanner } from "./PaidProSignerSavedConfirmationBanner";
import { logPaidProReviewActionsVisible } from "./hydratePaidProExecutionBlockWithSignerMetadata";
import { logPaidProPostFinalizeActionClick } from "./paidProPostFinalizeReviewSurface";
import { PaidProReviewNextStepCallout } from "./PaidProReviewNextStepCallout";
import { PaidProReviewStatusPanel } from "./PaidProReviewStatusPanel";
import { logPaidProSignaturePrepCtaVisible } from "./paidProSignaturePrepUi";
import {
  resolvePaidProPostFinalizeSignerDetailsActionLabel,
} from "./paidProPostFinalizeEditSignerDetails";
import {
  PAID_PRO_DELIVERY_TRACK_BEFORE_SIGNERS_HINT,
  PAID_PRO_DELIVERY_TRACK_CHOOSER_EYEBROW,
  PAID_PRO_DELIVERY_TRACK_REVIEW_BUSY_CTA,
  PAID_PRO_DELIVERY_TRACK_REVIEW_CTA,
  PAID_PRO_DELIVERY_TRACK_REVIEW_DESCRIPTION,
  PAID_PRO_DELIVERY_TRACK_REVIEW_TITLE,
  PAID_PRO_DELIVERY_TRACK_SIGNATURE_CTA,
  PAID_PRO_DELIVERY_TRACK_SIGNATURE_DESCRIPTION,
  PAID_PRO_DELIVERY_TRACK_SIGNATURE_TITLE,
  PAID_PRO_DELIVERY_TRACK_TRUST_LINE,
} from "./paidProDeliveryTrackGtmCopy";

export type PaidProSignerSavedMapping = {
  partyLegalName: string;
  signerName: string;
};

type Props = {
  signersReady: boolean;
  signerMetadataFinalized: boolean;
  hydrationBlocked?: boolean;
  compactShell?: boolean;
  sendDisabled?: boolean;
  reviewBusy?: boolean;
  exportBusy?: boolean;
  copyDisabled?: boolean;
  editDisabled?: boolean;
  exportError?: string | null;
  signerSavedMappings?: readonly PaidProSignerSavedMapping[];
  postFinalizeCorpusHash?: string;
  postFinalizeActionsReady?: boolean;
  getCopyPlainText: () => string;
  onEditAgreement: () => void;
  onEditSignerDetails?: () => void;
  onExportAgreement: () => void;
  onShareForReview: () => void;
  onPrepareSignatures: () => void;
};

export function PaidProForcedFirstReviewChrome({
  signersReady,
  signerMetadataFinalized,
  hydrationBlocked = false,
  compactShell = false,
  sendDisabled = false,
  reviewBusy = false,
  exportBusy = false,
  copyDisabled = false,
  editDisabled = false,
  exportError = null,
  signerSavedMappings = [],
  postFinalizeCorpusHash = "",
  postFinalizeActionsReady = false,
  getCopyPlainText,
  onEditAgreement,
  onEditSignerDetails,
  onExportAgreement,
  onShareForReview,
  onPrepareSignatures,
}: Props) {
  useEffect(() => {
    logPaidProSignaturePrepCtaVisible({
      reviewCtaVisible: true,
      prepareSignaturesCtaVisible: true,
      signerFieldsMounted: false,
    });
    logPaidProReviewActionsVisible({
      copyVisible: true,
      editVisible: true,
      exportVisible: true,
      prepareVisible: true,
      surface: "paid_pro_forced_first_review",
    });
  }, []);

  const showSignerSavedBanner =
    signerMetadataFinalized && signersReady && signerSavedMappings.length > 0;
  const primaryActionsDisabled = sendDisabled || hydrationBlocked;
  const signerDetailsActionLabel = resolvePaidProPostFinalizeSignerDetailsActionLabel(signersReady);

  const logPostFinalizeAction = (action: string) => {
    if (!signerMetadataFinalized || !postFinalizeCorpusHash) return;
    logPaidProPostFinalizeActionClick({
      action,
      corpusHash: postFinalizeCorpusHash,
      hydrated: true,
      canProceed: postFinalizeActionsReady && !hydrationBlocked,
    });
  };

  return (
    <div
      className="mt-4 flex flex-col gap-3"
      data-testid="paid-pro-forced-first-review-chrome"
    >
      <PaidProReviewStatusPanel
        signersReady={signersReady}
        signerMetadataFinalized={signerMetadataFinalized}
        signingReadyHydrated={signerMetadataFinalized && !hydrationBlocked}
        compactShell={compactShell}
        previewPlainText={getCopyPlainText()}
      />
      {showSignerSavedBanner ? (
        <PaidProSignerSavedConfirmationBanner mappings={signerSavedMappings} />
      ) : (
        <PaidProReviewNextStepCallout signersReady={signersReady} compactShell={compactShell} />
      )}
      {hydrationBlocked ? (
        <p
          className="rounded-md border border-amber-200/90 bg-amber-50 px-3 py-2 text-[11px] font-medium text-amber-900"
          role="alert"
          data-testid="paid-pro-post-finalize-hydration-blocked"
        >
          Signer details were saved, but the agreement still shows blank signer lines. Refresh or re-finalize
          signer details before continuing.
        </p>
      ) : null}
      <div
        className="flex flex-col gap-2.5 rounded-md border border-stone-200/90 bg-white px-3 py-3 shadow-sm ring-1 ring-black/[0.04] sm:px-4 sm:py-4"
        data-testid="paid-pro-forced-first-review-actions"
      >
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500">
          {PAID_PRO_DELIVERY_TRACK_CHOOSER_EYEBROW}
        </p>
        {!signersReady && onEditSignerDetails ? (
          <>
            <p
              className="text-xs leading-relaxed text-stone-600"
              data-testid="paid-pro-delivery-track-before-signers-hint"
            >
              {PAID_PRO_DELIVERY_TRACK_BEFORE_SIGNERS_HINT}
            </p>
            <button
              type="button"
              className="w-full rounded-lg bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-45"
              disabled={primaryActionsDisabled}
              onClick={() => {
                logPostFinalizeAction("add_signer_details");
                onEditSignerDetails();
              }}
              data-testid="paid-pro-forced-add-signer-details"
            >
              <span data-testid="simple-pro-send-for-signature">
                {signerDetailsActionLabel}
              </span>
            </button>
            <button
              type="button"
              className="w-full rounded-lg border border-emerald-700/40 bg-white px-4 py-2.5 text-sm font-semibold text-emerald-900 shadow-sm hover:bg-emerald-50 disabled:opacity-45"
              disabled={primaryActionsDisabled || reviewBusy}
              onClick={() => {
                logPostFinalizeAction("send_for_review");
                onShareForReview();
              }}
              data-testid="paid-pro-forced-share-for-review"
            >
              <span data-testid="simple-pro-send-for-review">
                {reviewBusy
                  ? PAID_PRO_DELIVERY_TRACK_REVIEW_BUSY_CTA
                  : PAID_PRO_DELIVERY_TRACK_REVIEW_CTA}
              </span>
            </button>
          </>
        ) : (
          <div
            className="grid gap-2.5 sm:grid-cols-2"
            data-testid="paid-pro-delivery-track-chooser"
          >
            <div
              className="flex flex-col rounded-lg border border-stone-200/90 bg-stone-50/80 px-3 py-3"
              data-testid="paid-pro-delivery-track-signature-card"
            >
              <p className="text-sm font-semibold text-stone-900">
                {PAID_PRO_DELIVERY_TRACK_SIGNATURE_TITLE}
              </p>
              <p className="mt-1.5 flex-1 text-xs leading-relaxed text-stone-600">
                {PAID_PRO_DELIVERY_TRACK_SIGNATURE_DESCRIPTION}
              </p>
              <button
                type="button"
                className="mt-3 w-full rounded-lg bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-45"
                disabled={primaryActionsDisabled}
                onClick={() => {
                  logPostFinalizeAction("prepare_for_signing");
                  onPrepareSignatures();
                }}
                data-testid="paid-pro-forced-prepare-signatures"
              >
                <span data-testid="simple-pro-send-for-signature">
                  {PAID_PRO_DELIVERY_TRACK_SIGNATURE_CTA}
                </span>
              </button>
            </div>
            <div
              className="flex flex-col rounded-lg border border-emerald-200/80 bg-emerald-50/50 px-3 py-3"
              data-testid="paid-pro-delivery-track-review-card"
            >
              <p className="text-sm font-semibold text-stone-900">
                {PAID_PRO_DELIVERY_TRACK_REVIEW_TITLE}
              </p>
              <p className="mt-1.5 flex-1 text-xs leading-relaxed text-stone-600">
                {PAID_PRO_DELIVERY_TRACK_REVIEW_DESCRIPTION}
              </p>
              <button
                type="button"
                className="mt-3 w-full rounded-lg border border-emerald-700/40 bg-white px-4 py-2.5 text-sm font-semibold text-emerald-900 shadow-sm hover:bg-emerald-50 disabled:opacity-45"
                disabled={primaryActionsDisabled || reviewBusy}
                onClick={() => {
                  logPostFinalizeAction("send_for_review");
                  onShareForReview();
                }}
                data-testid="paid-pro-forced-share-for-review"
              >
                <span data-testid="simple-pro-send-for-review">
                  {reviewBusy
                    ? PAID_PRO_DELIVERY_TRACK_REVIEW_BUSY_CTA
                    : PAID_PRO_DELIVERY_TRACK_REVIEW_CTA}
                </span>
              </button>
            </div>
          </div>
        )}
        <div
          className="flex flex-col gap-2 sm:flex-row sm:flex-wrap"
          data-testid="paid-pro-forced-first-review-secondary-actions"
        >
          <PremiumAgreementCopyButton
            getPlainText={getCopyPlainText}
            onCopyIntent={() => logPostFinalizeAction("copy_agreement")}
            disabled={copyDisabled}
            className="w-full rounded-lg border border-stone-300/90 bg-white px-3 py-2 text-xs font-semibold text-stone-800 sm:w-auto"
            data-testid="paid-pro-forced-copy-agreement"
          />
          <button
            type="button"
            className="w-full rounded-lg border border-stone-300/90 bg-white px-3 py-2 text-xs font-semibold text-stone-800 sm:w-auto"
            disabled={exportBusy || copyDisabled}
            onClick={() => {
              logPostFinalizeAction("download_export");
              onExportAgreement();
            }}
            data-testid="paid-pro-forced-export-agreement"
          >
            {exportBusy ? "Preparing export…" : "Download / export"}
          </button>
          {onEditSignerDetails && signersReady ? (
            <button
              type="button"
              className="w-full rounded-lg border border-stone-300/90 bg-white px-3 py-2 text-xs font-semibold text-stone-800 sm:w-auto"
              onClick={() => {
                logPostFinalizeAction("edit_signer_details");
                onEditSignerDetails();
              }}
              data-testid="paid-pro-forced-edit-signer-details"
            >
              {signerDetailsActionLabel}
            </button>
          ) : null}
          <button
            type="button"
            className="w-full rounded-lg border border-stone-300/90 bg-white px-3 py-2 text-xs font-semibold text-stone-800 sm:w-auto"
            disabled={editDisabled}
            onClick={() => {
              logPostFinalizeAction("edit_agreement_text");
              onEditAgreement();
            }}
            data-testid="paid-pro-forced-edit-agreement"
          >
            <span data-testid="simple-pro-edit-agreement-text-toggle">Edit agreement text</span>
          </button>
        </div>
        {exportError ? (
          <p className="text-[11px] font-medium text-amber-800" role="alert">
            {exportError}
          </p>
        ) : null}
        <p className="text-[11px] leading-relaxed text-stone-600">
          {PAID_PRO_DELIVERY_TRACK_TRUST_LINE}
        </p>
      </div>
    </div>
  );
}

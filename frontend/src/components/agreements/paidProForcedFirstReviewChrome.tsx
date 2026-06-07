/**
 * Post-signer-finalize review decision chrome for forced paid Pro document route.
 */

import { useEffect } from "react";
import { PremiumAgreementCopyButton } from "./PremiumAgreementCopyButton";
import { PaidProSignerSavedConfirmationBanner } from "./PaidProSignerSavedConfirmationBanner";
import { logPaidProReviewActionsVisible } from "./hydratePaidProExecutionBlockWithSignerMetadata";
import { PaidProReviewNextStepCallout } from "./PaidProReviewNextStepCallout";
import { PaidProReviewStatusPanel } from "./PaidProReviewStatusPanel";
import { logPaidProSignaturePrepCtaVisible } from "./paidProSignaturePrepUi";
import { PAID_PRO_PREPARE_ESIGN_DECISION_CTA } from "./signerSetupPartyIdentity";

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
  getCopyPlainText: () => string;
  onEditAgreement: () => void;
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
  getCopyPlainText,
  onEditAgreement,
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
  const actionsDisabled = sendDisabled || hydrationBlocked;

  return (
    <div
      className="mt-4 flex flex-col gap-3"
      data-testid="paid-pro-forced-first-review-chrome"
    >
      <PaidProReviewStatusPanel
        signersReady={signersReady}
        signerMetadataFinalized={signerMetadataFinalized}
        compactShell={compactShell}
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
          Choose your next step
        </p>
        <button
          type="button"
          className="w-full rounded-lg bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-45"
          disabled={actionsDisabled}
          onClick={onPrepareSignatures}
          data-testid="paid-pro-forced-prepare-signatures"
        >
          {PAID_PRO_PREPARE_ESIGN_DECISION_CTA}
        </button>
        <div
          className="flex flex-col gap-2 sm:flex-row sm:flex-wrap"
          data-testid="paid-pro-forced-first-review-secondary-actions"
        >
          <button
            type="button"
            className="w-full rounded-lg border border-stone-300/90 bg-white px-3 py-2 text-xs font-semibold text-stone-800 sm:w-auto"
            disabled={actionsDisabled || reviewBusy}
            onClick={onShareForReview}
            data-testid="paid-pro-forced-share-for-review"
          >
            {reviewBusy ? "Creating review links…" : "Send for review / compare edits"}
          </button>
          <PremiumAgreementCopyButton
            getPlainText={getCopyPlainText}
            disabled={copyDisabled || hydrationBlocked}
            className="w-full rounded-lg border border-stone-300/90 bg-white px-3 py-2 text-xs font-semibold text-stone-800 sm:w-auto"
            data-testid="paid-pro-forced-copy-agreement"
          />
          <button
            type="button"
            className="w-full rounded-lg border border-stone-300/90 bg-white px-3 py-2 text-xs font-semibold text-stone-800 sm:w-auto"
            disabled={exportBusy || copyDisabled || hydrationBlocked}
            onClick={onExportAgreement}
            data-testid="paid-pro-forced-export-agreement"
          >
            {exportBusy ? "Preparing export…" : "Download / export"}
          </button>
          <button
            type="button"
            className="w-full rounded-lg border border-stone-300/90 bg-white px-3 py-2 text-xs font-semibold text-stone-800 sm:w-auto"
            disabled={editDisabled || hydrationBlocked}
            onClick={onEditAgreement}
            data-testid="paid-pro-forced-edit-agreement"
          >
            Edit agreement text
          </button>
        </div>
        {exportError ? (
          <p className="text-[11px] font-medium text-amber-800" role="alert">
            {exportError}
          </p>
        ) : null}
        <p className="text-[11px] leading-relaxed text-stone-600">
          Nothing is sent or signed until you confirm the next step.
        </p>
      </div>
    </div>
  );
}

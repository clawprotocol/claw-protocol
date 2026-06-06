/**
 * First-review actions for forced paid Pro document route — review + prepare signatures.
 */

import { useEffect } from "react";
import { PaidProReviewNextStepCallout } from "./PaidProReviewNextStepCallout";
import { PaidProReviewStatusPanel } from "./PaidProReviewStatusPanel";
import { logPaidProSignaturePrepCtaVisible } from "./paidProSignaturePrepUi";

type Props = {
  signersReady: boolean;
  signerMetadataFinalized: boolean;
  compactShell?: boolean;
  sendDisabled?: boolean;
  reviewBusy?: boolean;
  onShareForReview: () => void;
  onPrepareSignatures: () => void;
};

export function PaidProForcedFirstReviewChrome({
  signersReady,
  signerMetadataFinalized,
  compactShell = false,
  sendDisabled = false,
  reviewBusy = false,
  onShareForReview,
  onPrepareSignatures,
}: Props) {
  useEffect(() => {
    logPaidProSignaturePrepCtaVisible({
      reviewCtaVisible: true,
      prepareSignaturesCtaVisible: true,
      signerFieldsMounted: false,
    });
  }, []);

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
      <PaidProReviewNextStepCallout signersReady={signersReady} compactShell={compactShell} />
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
          disabled={sendDisabled || reviewBusy}
          onClick={onShareForReview}
          data-testid="paid-pro-forced-share-for-review"
        >
          {reviewBusy ? "Creating review links…" : "Send for review / compare edits"}
        </button>
        <button
          type="button"
          className="w-full rounded-lg border border-stone-300/90 bg-white px-4 py-2.5 text-sm font-semibold text-stone-800 shadow-sm hover:bg-stone-50 disabled:opacity-45"
          disabled={sendDisabled}
          onClick={onPrepareSignatures}
          data-testid="paid-pro-forced-prepare-signatures"
        >
          Prepare signatures
        </button>
        <p className="text-[11px] leading-relaxed text-stone-600">
          Nothing is sent or signed until you confirm the next step.
        </p>
      </div>
    </div>
  );
}

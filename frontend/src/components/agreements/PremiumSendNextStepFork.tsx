import type { PremiumSendIntent } from "../../launch/simpleProduct/premiumSendIntent";
import {
  PAID_PRO_DELIVERY_TRACK_CHOOSER_EYEBROW,
  PAID_PRO_DELIVERY_TRACK_REVIEW_CTA,
  PAID_PRO_DELIVERY_TRACK_REVIEW_DESCRIPTION,
  PAID_PRO_DELIVERY_TRACK_REVIEW_TITLE,
  PAID_PRO_DELIVERY_TRACK_SIGNATURE_CTA,
  PAID_PRO_DELIVERY_TRACK_SIGNATURE_DESCRIPTION,
  PAID_PRO_DELIVERY_TRACK_SIGNATURE_TITLE,
  PAID_PRO_DELIVERY_TRACK_TRUST_LINE,
} from "./paidProDeliveryTrackGtmCopy";

export type PremiumSendNextStepForkLabels = {
  reviewTitle?: string;
  reviewDescription?: string;
  reviewCta?: string;
  signatureTitle?: string;
  signatureDescription?: string;
  signatureCta?: string;
};

export type PremiumSendNextStepForkProps = {
  selected: PremiumSendIntent;
  onPick: (mode: PremiumSendIntent) => void;
  /** Tighter layout when embedded beside the document preview. */
  compact?: boolean;
  labels?: PremiumSendNextStepForkLabels;
};

/**
 * Premium flow: maps to existing review vs signature send modes.
 * Practical GTM: Option B (party review / redline) is peer to Option A (signing).
 */
export function PremiumSendNextStepFork({ selected, onPick, compact, labels }: PremiumSendNextStepForkProps) {
  const pad = compact ? "p-3.5 sm:p-4.5" : "p-5 sm:p-6";
  const gap = compact ? "gap-2.5" : "gap-3.5";
  const reviewTitle = labels?.reviewTitle ?? PAID_PRO_DELIVERY_TRACK_REVIEW_TITLE;
  const reviewDescription =
    labels?.reviewDescription ?? PAID_PRO_DELIVERY_TRACK_REVIEW_DESCRIPTION;
  const reviewCta = labels?.reviewCta ?? PAID_PRO_DELIVERY_TRACK_REVIEW_CTA;
  const signatureTitle = labels?.signatureTitle ?? PAID_PRO_DELIVERY_TRACK_SIGNATURE_TITLE;
  const signatureDescription =
    labels?.signatureDescription ?? PAID_PRO_DELIVERY_TRACK_SIGNATURE_DESCRIPTION;
  const signatureCta = labels?.signatureCta ?? PAID_PRO_DELIVERY_TRACK_SIGNATURE_CTA;
  return (
    <section
      className={`rounded-xl border border-slate-700/55 bg-slate-900/40 ${pad}`}
      aria-labelledby="premium-next-step-heading"
    >
      <p
        id="premium-next-step-heading"
        className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400"
      >
        {PAID_PRO_DELIVERY_TRACK_CHOOSER_EYEBROW}
      </p>
      <div className={`mt-3.5 grid ${gap} sm:grid-cols-2`}>
        <div
          className={`flex flex-col rounded-xl border p-3.5 text-left transition sm:p-4 ${
            selected === "review"
              ? "border-emerald-500/55 bg-emerald-950/30 shadow-sm shadow-emerald-950/25"
              : "border-slate-700/70 bg-slate-950/55"
          }`}
        >
          <p className="text-sm font-semibold text-slate-100">{reviewTitle}</p>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-400">{reviewDescription}</p>
          <button
            type="button"
            className="mt-3.5 min-h-[2.45rem] w-full rounded-lg bg-emerald-600 px-3 py-2 text-center text-sm font-semibold text-white transition hover:bg-emerald-500 sm:mt-4"
            onClick={() => onPick("review")}
            data-testid="pro-delivery-track-review"
          >
            {reviewCta}
          </button>
        </div>
        <div
          className={`flex flex-col rounded-xl border p-3.5 text-left transition sm:p-4 ${
            selected === "signature"
              ? "border-emerald-500/55 bg-emerald-950/30 shadow-sm shadow-emerald-950/25"
              : "border-slate-700/70 bg-slate-950/55"
          }`}
        >
          <p className="text-sm font-semibold text-slate-100">{signatureTitle}</p>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-400">{signatureDescription}</p>
          <button
            type="button"
            className="mt-3.5 min-h-[2.45rem] w-full rounded-lg border border-slate-600/80 bg-slate-900/85 px-3 py-2 text-center text-sm font-semibold text-slate-100 transition hover:border-emerald-500/50 hover:bg-slate-900 sm:mt-4"
            onClick={() => onPick("signature")}
            data-testid="pro-delivery-track-signing"
          >
            {signatureCta}
          </button>
        </div>
      </div>
      <p className="mt-3 text-[10px] leading-relaxed text-slate-500 sm:text-[11px]">
        {PAID_PRO_DELIVERY_TRACK_TRUST_LINE}
      </p>
      <p className="mt-1.5 text-[10px] leading-relaxed text-slate-500 sm:text-[11px]">
        {selected === "signature"
          ? "Need a redline pass with the other parties first? Switch back to review before preparing signatures."
          : "Once track-changes comments are resolved, prepare for signing in one click."}
      </p>
    </section>
  );
}

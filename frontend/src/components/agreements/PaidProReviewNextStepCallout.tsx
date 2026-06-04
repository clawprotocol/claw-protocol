import {
  PAID_PRO_REVIEW_STEP_NEXT_PREFIX,
  resolvePaidProReviewNextStepCopy,
} from "./paidProWorkflowGuidance";

type Props = {
  signersReady?: boolean;
};

type PaidProReviewNextStepCalloutProps = Props & {
  compactShell?: boolean;
};

export function PaidProReviewNextStepCallout({
  signersReady = false,
  compactShell = false,
}: PaidProReviewNextStepCalloutProps) {
  const copy = resolvePaidProReviewNextStepCopy({ signersReady, compactShell });
  if (!copy.showCallout) return null;

  return (
    <section
      className="rounded-md border border-sky-200/80 bg-sky-50/90 px-3 py-2.5 sm:px-3.5 sm:py-3"
      data-testid="paid-pro-review-next-step-callout"
      aria-label="Review step guidance"
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-800/90">
        {copy.stepLabel}
      </p>
      <p className="mt-1.5 text-sm font-semibold text-stone-900">{copy.headline}</p>
      <p className="mt-2 text-xs leading-relaxed text-stone-700 sm:text-[13px]">
        <span className="font-semibold text-stone-800">{PAID_PRO_REVIEW_STEP_NEXT_PREFIX}</span>{" "}
        {copy.nextLine}
      </p>
    </section>
  );
}

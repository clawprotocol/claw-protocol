import {
  PAID_PRO_REVIEW_STATUS_HEADLINE,
  resolvePaidProReviewSupportingCopy,
  resolvePaidProReviewTrustSteps,
  type PaidProReviewTrustStep,
} from "./paidProReviewTrustUx";

type Props = {
  signersReady: boolean;
  signerMetadataFinalized?: boolean;
};

function StepIcon({ state }: { state: PaidProReviewTrustStep["state"] }) {
  if (state === "done") {
    return (
      <span
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-emerald-600/50 bg-emerald-50 text-[11px] font-bold text-emerald-800"
        aria-hidden
      >
        ✓
      </span>
    );
  }
  if (state === "active") {
    return (
      <span
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-amber-500/60 bg-amber-50 text-[10px] font-bold text-amber-900"
        aria-hidden
      >
        ○
      </span>
    );
  }
  return (
    <span
      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-stone-300 bg-stone-50 text-[10px] font-semibold text-stone-400"
      aria-hidden
    >
      ○
    </span>
  );
}

export function PaidProReviewStatusPanel({ signersReady, signerMetadataFinalized }: Props) {
  const steps = resolvePaidProReviewTrustSteps({ signersReady, signerMetadataFinalized });
  const supporting = resolvePaidProReviewSupportingCopy({ signersReady });

  return (
    <section
      className="rounded-md border border-stone-200/90 bg-stone-50/80 px-3 py-2.5 sm:px-3.5 sm:py-3"
      data-testid="paid-pro-review-status-panel"
      aria-label={PAID_PRO_REVIEW_STATUS_HEADLINE}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500">
        {PAID_PRO_REVIEW_STATUS_HEADLINE}
      </p>
      <ol className="mt-2 space-y-1.5" data-testid="paid-pro-review-status-steps">
        {steps.map((step) => (
          <li
            key={step.id}
            className="flex items-center gap-2 text-xs leading-snug text-stone-800"
            data-testid={`paid-pro-review-status-step-${step.id}`}
            data-state={step.state}
          >
            <StepIcon state={step.state} />
            <span className={step.state === "pending" ? "text-stone-500" : "font-medium"}>
              {step.label}
            </span>
          </li>
        ))}
      </ol>
      <p
        className="mt-2.5 text-xs leading-relaxed text-stone-600 sm:text-[13px]"
        data-testid="paid-pro-review-status-supporting"
      >
        {supporting}
      </p>
    </section>
  );
}

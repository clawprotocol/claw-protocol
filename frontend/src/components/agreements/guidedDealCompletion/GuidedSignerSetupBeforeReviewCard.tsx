import {
  GUIDED_BACKGROUND_APPLY_PROGRESS,
  GUIDED_SIGNER_SETUP_BACKGROUND_HEADLINE,
  GUIDED_SIGNER_SETUP_BACKGROUND_SUBCOPY,
} from "./guidedAnswerApplyOrchestration";
import { GUIDED_SIGNER_SETUP_CTA } from "./guidedSignerSetupUx";

export type GuidedSignerSetupBeforeReviewCardProps = {
  slotsComplete?: boolean;
  filledCount?: number;
  requiredCount?: number;
  backgroundApplyActive?: boolean;
  backgroundApplyComplete?: boolean;
  onScrollToSignerFields?: () => void;
  className?: string;
};

export function GuidedSignerSetupBeforeReviewCard({
  slotsComplete = false,
  filledCount = 0,
  requiredCount = 2,
  backgroundApplyActive = false,
  backgroundApplyComplete = false,
  onScrollToSignerFields,
  className = "",
}: GuidedSignerSetupBeforeReviewCardProps) {
  return (
    <div
      className={`rounded-lg border border-sky-200/90 bg-sky-50/95 px-4 py-4 ${className}`}
      data-testid="guided-signer-setup-before-review-card"
      role="region"
      aria-label={GUIDED_SIGNER_SETUP_BACKGROUND_HEADLINE}
    >
      <p className="text-sm font-semibold text-stone-900">{GUIDED_SIGNER_SETUP_BACKGROUND_HEADLINE}</p>
      <p className="mt-1 text-[11px] leading-relaxed text-stone-600">
        {GUIDED_SIGNER_SETUP_BACKGROUND_SUBCOPY}
      </p>
      {backgroundApplyActive && !backgroundApplyComplete ? (
        <p
          className="mt-2 text-[11px] font-medium text-sky-800"
          data-testid="guided-background-apply-progress"
        >
          {GUIDED_BACKGROUND_APPLY_PROGRESS}
        </p>
      ) : null}
      <p className="mt-2 text-[11px] text-stone-600" data-testid="guided-signer-setup-progress">
        {filledCount} of {requiredCount} signer slots complete
      </p>
      {!slotsComplete ? (
        <button
          type="button"
          className="mt-3 w-full rounded-lg bg-sky-800 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-sky-700 sm:w-auto"
          data-testid="guided-signer-setup-cta"
          onClick={() => onScrollToSignerFields?.()}
        >
          {GUIDED_SIGNER_SETUP_CTA}
        </button>
      ) : null}
    </div>
  );
}

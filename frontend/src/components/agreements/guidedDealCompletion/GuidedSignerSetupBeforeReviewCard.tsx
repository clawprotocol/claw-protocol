import {
  GUIDED_BACKGROUND_APPLY_PROGRESS,
  GUIDED_SIGNER_SETUP_APPLY_COMPLETE_SUBCOPY,
  GUIDED_SIGNER_SETUP_BACKGROUND_SUBCOPY,
  GUIDED_SIGNER_SETUP_HEADLINE,
} from "./guidedAnswerApplyOrchestration";
import { GUIDED_SIGNER_SETUP_CTA } from "./guidedSignerSetupUx";

export type GuidedSignerSetupBeforeReviewCardProps = {
  slotsComplete?: boolean;
  filledCount?: number;
  requiredCount?: number;
  backgroundApplyActive?: boolean;
  backgroundApplyComplete?: boolean;
  /** Shown when signer slots complete — final corpus will use these identities. */
  finalVersionPartyLines?: readonly string[];
  onEditSignerDetails?: () => void;
  onScrollToSignerFields?: () => void;
  className?: string;
};

export function GuidedSignerSetupBeforeReviewCard({
  slotsComplete = false,
  filledCount = 0,
  requiredCount = 2,
  backgroundApplyActive = false,
  backgroundApplyComplete = false,
  finalVersionPartyLines = [],
  onEditSignerDetails,
  onScrollToSignerFields,
  className = "",
}: GuidedSignerSetupBeforeReviewCardProps) {
  return (
    <div
      className={`rounded-lg border border-sky-200/90 bg-sky-50/95 px-4 py-4 ${className}`}
      data-testid="guided-signer-setup-before-review-card"
      role="region"
      aria-label={GUIDED_SIGNER_SETUP_HEADLINE}
    >
      <p className="text-sm font-semibold text-stone-900">{GUIDED_SIGNER_SETUP_HEADLINE}</p>
      <p className="mt-1 text-[11px] leading-relaxed text-stone-600">
        {backgroundApplyComplete
          ? GUIDED_SIGNER_SETUP_APPLY_COMPLETE_SUBCOPY
          : GUIDED_SIGNER_SETUP_BACKGROUND_SUBCOPY}
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
      {slotsComplete && finalVersionPartyLines.length > 0 ? (
        <div
          className="mt-3 rounded-md border border-emerald-200/90 bg-white/80 px-3 py-2.5"
          data-testid="guided-signer-final-version-preview"
        >
          <p className="text-[11px] font-semibold text-stone-800">Final version will use:</p>
          <ul className="mt-1 list-none space-y-0.5 text-[11px] text-stone-700">
            {finalVersionPartyLines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          {onEditSignerDetails ? (
            <button
              type="button"
              className="mt-2 text-[11px] font-semibold text-sky-800 underline hover:text-sky-900"
              data-testid="guided-signer-edit-details"
              onClick={() => onEditSignerDetails()}
            >
              Edit signer details
            </button>
          ) : null}
        </div>
      ) : null}
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

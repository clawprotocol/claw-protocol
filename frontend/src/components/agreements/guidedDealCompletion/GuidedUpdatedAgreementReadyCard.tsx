import type { GuidedAppliedChecklistLabel } from "./guidedAppliedSummaryChecklist";
import {
  GUIDED_READY_STATE_BODY,
  GUIDED_READY_STATE_CTA,
  GUIDED_READY_STATE_HEADLINE,
  GUIDED_READY_STATE_SUBCOPY,
} from "./friendlyProCompletionCopy";

export type GuidedUpdatedAgreementReadyCardProps = {
  appliedAnswerCount: number;
  appliedChecklist?: readonly GuidedAppliedChecklistLabel[];
  applying?: boolean;
  applyError?: string | null;
  onReviewUpdatedAgreement: () => void;
  onRetryApply?: () => void;
  className?: string;
};

export function GuidedUpdatedAgreementReadyCard({
  appliedAnswerCount,
  appliedChecklist = [],
  applying = false,
  applyError = null,
  onReviewUpdatedAgreement,
  onRetryApply,
  className = "",
}: GuidedUpdatedAgreementReadyCardProps) {
  if (applying) {
    return (
      <div
        className={`rounded-lg border border-sky-200/90 bg-sky-50/95 px-4 py-4 ${className}`}
        data-testid="guided-updated-agreement-applying"
        role="status"
        aria-live="polite"
      >
        <p className="text-sm font-semibold text-stone-900">Updating your Pro agreement…</p>
        <p className="mt-1 text-[11px] leading-relaxed text-stone-600">
          Applying your answers to the full agreement.
        </p>
      </div>
    );
  }

  return (
    <div
      className={`rounded-lg border border-emerald-200/90 bg-emerald-50/95 px-4 py-4 ${className}`}
      data-testid="guided-updated-agreement-ready-card"
      role="region"
      aria-label="Updated Pro agreement ready"
    >
      <p className="text-sm font-semibold text-emerald-950">{GUIDED_READY_STATE_HEADLINE}</p>
      <p className="mt-1 text-[11px] leading-relaxed text-emerald-900/90">{GUIDED_READY_STATE_SUBCOPY}</p>
      {appliedAnswerCount > 0 ? (
        <p className="mt-2 text-[11px] font-medium text-emerald-900/95" data-testid="guided-ready-trust-line">
          {appliedAnswerCount} answer{appliedAnswerCount === 1 ? "" : "s"} applied to this version
        </p>
      ) : null}
      {appliedChecklist.length > 0 ? (
        <div className="mt-2.5" data-testid="guided-ready-what-changed">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-900/80">What changed</p>
          <ul className="mt-1 space-y-0.5">
            {appliedChecklist.map((item) => (
              <li key={item} className="text-[11px] text-emerald-950/90">
                • {item} updated
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="mt-2 text-[11px] leading-relaxed text-emerald-900/85">{GUIDED_READY_STATE_BODY}</p>
      {applyError ? (
        <p className="mt-2 text-[11px] font-medium text-amber-800" role="alert">
          {applyError}
        </p>
      ) : null}
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <button
          type="button"
          className="w-full rounded-lg bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 sm:w-auto"
          onClick={onReviewUpdatedAgreement}
          data-testid="guided-review-updated-agreement-cta"
        >
          {GUIDED_READY_STATE_CTA}
        </button>
        {applyError && onRetryApply ? (
          <button
            type="button"
            className="w-full rounded-lg border border-stone-300/90 bg-white px-4 py-2.5 text-sm font-semibold text-stone-800 sm:w-auto"
            onClick={onRetryApply}
            data-testid="guided-retry-apply-cta"
          >
            Retry update
          </button>
        ) : null}
      </div>
    </div>
  );
}

import type { GuidedAppliedChange } from "./guidedChangeTypes";

type Props = {
  change: GuidedAppliedChange;
  onViewChange: () => void;
  onContinue: () => void;
  onLooksGood: () => void;
};

export function GuidedChangeCard({ change, onViewChange, onContinue, onLooksGood }: Props) {
  return (
    <div
      className="mt-3 rounded-lg border border-emerald-300/90 bg-emerald-50/95 px-3 py-3 sm:px-4"
      role="status"
      aria-live="polite"
      data-testid="guided-change-card"
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-900">Updated</p>
      <p className="mt-1 text-sm font-medium text-emerald-950">{change.targetSectionLabel}</p>
      <p className="mt-1.5 text-xs leading-relaxed text-emerald-950/90">
        <span className="font-medium text-emerald-900">Summary: </span>
        {change.summary}
      </p>
      {change.recommendationReason ? (
        <p className="mt-1.5 text-[11px] leading-relaxed text-emerald-900/85">
          <span className="font-medium">Why we recommended this: </span>
          {change.recommendationReason}
        </p>
      ) : null}
      {!change.anchorFound ? (
        <p className="mt-1.5 text-[11px] italic text-emerald-900/75">
          Updated agreement, but exact section highlight unavailable.
        </p>
      ) : null}
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <button
          type="button"
          className="rounded-lg border border-emerald-600/80 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-950 shadow-sm hover:bg-emerald-50 sm:text-sm"
          onClick={onViewChange}
        >
          View change
        </button>
        <button
          type="button"
          className="rounded-lg bg-emerald-800 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-900 sm:text-sm"
          onClick={onContinue}
        >
          Continue questions
        </button>
        <button
          type="button"
          className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-stone-800 hover:bg-stone-50 sm:text-sm"
          onClick={onLooksGood}
        >
          Looks good
        </button>
      </div>
    </div>
  );
}

import { useState } from "react";
import { reviewGuidedUpdatesAtIndex } from "./guidedSectionScroll";

export type GuidedAgreementUpdateSummaryProps = {
  areas: readonly string[];
  variableIds?: readonly string[];
  onReviewUpdates?: () => void;
  className?: string;
  /** When true, this is the dominant primary action on mobile */
  primaryFocus?: boolean;
};

export function GuidedAgreementUpdateSummary({
  areas,
  variableIds = [],
  onReviewUpdates,
  className = "",
  primaryFocus = true,
}: GuidedAgreementUpdateSummaryProps) {
  const [reviewIndex, setReviewIndex] = useState(0);

  if (areas.length === 0) return null;

  const handleReview = () => {
    if (variableIds.length > 0) {
      const { nextIndex } = reviewGuidedUpdatesAtIndex(variableIds, reviewIndex);
      setReviewIndex(nextIndex);
    }
    onReviewUpdates?.();
  };

  return (
    <div
      className={`rounded-lg border border-emerald-300/80 bg-emerald-50/95 px-3 py-2.5 shadow-sm ${primaryFocus ? "ring-1 ring-emerald-400/35" : ""} ${className}`}
      data-testid="guided-agreement-update-summary"
      role="status"
      aria-live="polite"
    >
      <p className="text-sm font-semibold text-emerald-950">Agreement updated</p>
      <p className="mt-0.5 text-[11px] text-emerald-900/90">
        Your answers are in the agreement — this is the signing version.
      </p>
      <p className="mt-2 text-[10px] font-bold uppercase tracking-wide text-emerald-800/80">
        Included changes
      </p>
      <ul className="mt-1 space-y-0.5">
        {areas.map((area) => (
          <li key={area} className="flex items-center gap-1.5 text-xs text-emerald-950">
            <span className="font-bold text-emerald-600" aria-hidden>
              ✓
            </span>
            {area}
          </li>
        ))}
      </ul>
      <button
        type="button"
        className={`mt-2.5 w-full rounded-md px-3 py-2 text-[11px] font-semibold text-white sm:w-auto ${
          primaryFocus
            ? "bg-emerald-800 py-2.5 shadow-sm hover:bg-emerald-700"
            : "bg-emerald-800 py-1.5 hover:bg-emerald-700"
        }`}
        onClick={handleReview}
      >
        Review updates
      </button>
    </div>
  );
}

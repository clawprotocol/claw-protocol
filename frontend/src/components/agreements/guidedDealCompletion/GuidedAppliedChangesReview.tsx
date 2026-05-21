import type { GuidedAppliedChange } from "./guidedChangeTypes";

type Props = {
  changes: readonly GuidedAppliedChange[];
  onJumpToSection: (change: GuidedAppliedChange) => void;
};

export function GuidedAppliedChangesReview({ changes, onJumpToSection }: Props) {
  if (!changes.length) return null;
  return (
    <div
      className="rounded-xl border border-emerald-200/90 bg-emerald-50/90 p-4 sm:p-5"
      role="status"
      data-testid="guided-final-review-list"
    >
      <p className="text-sm font-semibold text-emerald-950">
        All key gaps are filled. Review your {changes.length} update{changes.length === 1 ? "" : "s"}.
      </p>
      <ul className="mt-3 space-y-2">
        {changes.map((c) => (
          <li
            key={`${c.questionKey}-${c.timestamp}`}
            className="flex flex-col gap-1 rounded-lg border border-emerald-200/80 bg-white/80 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <p className="text-xs font-medium text-emerald-950">{c.targetSectionLabel}</p>
              <p className="text-[11px] leading-relaxed text-emerald-900/85">{c.summary}</p>
            </div>
            <button
              type="button"
              className="shrink-0 self-start rounded-md border border-emerald-600/70 px-2.5 py-1 text-[11px] font-semibold text-emerald-950 hover:bg-emerald-50 sm:text-xs"
              onClick={() => onJumpToSection(c)}
            >
              View
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Shared segmented control: tracked changes on/off for recipient preview (clauses, side-by-side, advanced).
 */
export function RecipientTrackedChangesToggle({
  showTrackedChanges,
  onChange,
}: {
  showTrackedChanges: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div
      className="mt-2 flex w-full flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2"
      data-testid="recipient-tracked-changes-toggle"
    >
      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Tracked changes</span>
      <div
        className="flex w-full max-w-md rounded-lg border border-slate-600/90 bg-slate-950/80 p-0.5 shadow-inner sm:w-auto"
        role="group"
        aria-label="Tracked changes"
      >
        <button
          type="button"
          className={`min-h-[44px] flex-1 rounded-md px-3 py-2 text-[11px] font-semibold transition-colors sm:min-h-0 sm:px-4 sm:py-1.5 ${
            showTrackedChanges ? "bg-slate-700 text-slate-50 shadow-sm" : "text-slate-500 hover:text-slate-300"
          }`}
          aria-pressed={showTrackedChanges}
          onClick={() => onChange(true)}
        >
          Show changes
        </button>
        <button
          type="button"
          className={`min-h-[44px] flex-1 rounded-md px-3 py-2 text-[11px] font-semibold transition-colors sm:min-h-0 sm:px-4 sm:py-1.5 ${
            !showTrackedChanges ? "bg-slate-700 text-slate-50 shadow-sm" : "text-slate-500 hover:text-slate-300"
          }`}
          aria-pressed={!showTrackedChanges}
          onClick={() => onChange(false)}
        >
          Hide changes
        </button>
      </div>
    </div>
  );
}

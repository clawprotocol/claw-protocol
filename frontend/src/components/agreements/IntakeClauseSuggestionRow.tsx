import type { IntakeClauseSuggestionRowItem } from "./clauseSuggestionRowModel";
import { chipLabelForRowItem, tooltipForRowItem } from "./clauseSuggestionRowModel";

export function IntakeClauseSuggestionRow(props: {
  items: IntakeClauseSuggestionRowItem[];
  disabled?: boolean;
  onApply: (item: IntakeClauseSuggestionRowItem) => void;
  /** Short confirmation line, e.g. "IP ownership" → parent shows `Added ${addedToastChip}` */
  addedToastChip?: string | null;
}) {
  const { items, disabled, onApply, addedToastChip } = props;
  if (items.length === 0) return null;

  return (
    <div className="mt-3" aria-live="polite">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 sm:text-[11px]">Suggestions</p>
      <div className="flex flex-wrap gap-2" role="list" aria-label="Clause suggestions">
        {items.map((item) => {
          const chip = chipLabelForRowItem(item);
          const tip = tooltipForRowItem(item);
          return (
            <button
              key={`${item.kind}-${item.kind === "context" ? item.suggestion.id : item.kind === "smart" ? item.suggestion.id : item.suggestion.id}`}
              type="button"
              role="listitem"
              disabled={disabled}
              title={tip}
              aria-label={`Add ${chip}. ${tip.replace(/\s+/g, " ").slice(0, 160)}`}
              className="inline-flex max-w-full items-center rounded-lg border border-slate-600/55 bg-slate-900/50 px-2.5 py-1.5 text-left text-[11px] font-semibold leading-snug text-slate-100 shadow-sm outline-none transition-[border-color,box-shadow,transform,color] duration-200 motion-safe:active:scale-[0.99] enabled:hover:border-emerald-500/45 enabled:hover:text-emerald-50 enabled:hover:shadow-[0_0_24px_-8px_rgba(52,211,153,0.38)] enabled:focus-visible:ring-2 enabled:focus-visible:ring-emerald-500/40 disabled:cursor-not-allowed disabled:opacity-45 sm:text-xs"
              onClick={() => onApply(item)}
            >
              <span className="text-slate-500" aria-hidden>
                [
              </span>
              <span className="px-0.5 text-emerald-400/95" aria-hidden>
                +
              </span>
              <span className="min-w-0 truncate">{chip}</span>
              <span className="text-slate-500" aria-hidden>
                ]
              </span>
            </button>
          );
        })}
      </div>
      {addedToastChip ? (
        <p className="mt-2 text-[11px] font-medium text-emerald-400/95 sm:text-xs" role="status">
          Added {addedToastChip}
        </p>
      ) : null}
    </div>
  );
}

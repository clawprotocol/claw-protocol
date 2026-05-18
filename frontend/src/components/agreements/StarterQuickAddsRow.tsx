import type { StarterQuickAdd } from "../../launch/simpleProduct/starterQuickAdds";
import {
  STARTER_QUICK_ADDS_HELPER,
  STARTER_QUICK_ADDS_SECTION_TITLE,
} from "../../launch/simpleProduct/starterQuickAdds";

export function StarterQuickAddsRow(props: {
  items: readonly StarterQuickAdd[];
  disabled?: boolean;
  onApply: (item: StarterQuickAdd) => void;
  addedToastLabel?: string | null;
  className?: string;
}) {
  const { items, disabled, onApply, addedToastLabel, className } = props;
  if (items.length === 0) return null;

  return (
    <div className={className ?? "mt-4 mb-6"} aria-live="polite">
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 sm:text-[11px]">
        {STARTER_QUICK_ADDS_SECTION_TITLE}
      </p>
      <p className="mb-2.5 text-xs leading-relaxed text-slate-500 sm:text-[0.8125rem]">
        {STARTER_QUICK_ADDS_HELPER}
      </p>
      <div className="flex flex-wrap gap-2" role="list" aria-label="Optional quick adds">
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            role="listitem"
            disabled={disabled}
            title={item.append.trim()}
            aria-label={`Add ${item.label}. ${item.append.trim()}`}
            className="inline-flex max-w-full items-center rounded-lg border border-slate-600/55 bg-slate-900/50 px-2.5 py-1.5 text-left text-[11px] font-semibold leading-snug text-slate-100 shadow-sm outline-none transition-[border-color,box-shadow,transform,color] duration-200 motion-safe:active:scale-[0.99] enabled:hover:border-emerald-500/45 enabled:hover:text-emerald-50 enabled:hover:shadow-[0_0_24px_-8px_rgba(52,211,153,0.38)] enabled:focus-visible:ring-2 enabled:focus-visible:ring-emerald-500/40 disabled:cursor-not-allowed disabled:opacity-45 sm:text-xs"
            onClick={() => onApply(item)}
          >
            <span className="text-slate-500" aria-hidden>
              [
            </span>
            <span className="px-0.5 text-emerald-400/95" aria-hidden>
              +
            </span>
            <span className="min-w-0 truncate">{item.label}</span>
            <span className="text-slate-500" aria-hidden>
              ]
            </span>
          </button>
        ))}
      </div>
      {addedToastLabel ? (
        <p className="mt-2 text-[11px] font-medium text-emerald-400/95 sm:text-xs" role="status">
          Added {addedToastLabel}
        </p>
      ) : null}
    </div>
  );
}

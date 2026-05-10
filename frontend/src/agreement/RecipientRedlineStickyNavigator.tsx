import type { BusinessReviewSemanticId, RecipientRedlineStickyNavRow } from "./recipientBusinessReviewCardsModel";
import { recipientRedlineReviewAreasLabel } from "./portableReviewCopy";

type Props = {
  rows: readonly RecipientRedlineStickyNavRow[];
  onSelectSemantic: (id: BusinessReviewSemanticId) => void | Promise<void>;
  className?: string;
};

/**
 * Compact sticky chips above changed-clause panels (same scroll targets as business cards).
 */
export function RecipientRedlineStickyNavigator({ rows, onSelectSemantic, className }: Props) {
  if (rows.length === 0) return null;
  const label = recipientRedlineReviewAreasLabel(rows.length);
  return (
    <div
      className={`sticky top-0 z-10 -mx-0.5 mb-3 border-b border-slate-300/80 bg-slate-100/95 px-0.5 pb-2 pt-1 backdrop-blur-sm ${className ?? ""}`}
      data-testid="recipient-redline-sticky-nav"
    >
      <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <div className="-mx-0.5 flex gap-1.5 overflow-x-auto px-0.5 pb-0.5 md:flex-wrap md:overflow-visible">
        {rows.map((r) => (
          <button
            key={r.key}
            type="button"
            data-testid={`recipient-redline-nav-${r.key.replace(/[^a-z0-9_-]/gi, "_")}`}
            className="shrink-0 rounded-full border border-slate-400/70 bg-white/90 px-2.5 py-1 text-[11px] font-medium text-slate-800 shadow-sm hover:border-sky-500/50 hover:bg-sky-50/90 hover:text-sky-950"
            onClick={() => void onSelectSemantic(r.semanticId)}
          >
            {r.label}
          </button>
        ))}
      </div>
    </div>
  );
}

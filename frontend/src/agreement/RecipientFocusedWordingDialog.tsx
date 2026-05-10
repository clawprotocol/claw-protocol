import {
  RECIPIENT_BUSINESS_REVIEW_EXACT_WORDING_TITLE,
  RECIPIENT_FOCUS_COMPARE_OPEN_FULL_REDLINE,
  RECIPIENT_SEMANTIC_PRIOR_LABEL,
  RECIPIENT_SEMANTIC_REVISED_LABEL,
} from "./portableReviewCopy";

export type RecipientFocusedWordingDialogProps = {
  open: boolean;
  /** Card title (compare fallback) or combined title (exact wording path). */
  sectionTitle: string;
  /** Matched section label when known (compare fallback). */
  sectionSubline?: string;
  oldText: string;
  newText: string;
  onClose: () => void;
  variant?: "exact" | "compare_fallback";
  /** Opens full redline and retries relaxed scroll (compare fallback). */
  onOpenFullRedline?: () => void | Promise<void>;
};

/**
 * Focused OLD / NEW wording (Business Review Mode — not full-document redline).
 */
export function RecipientFocusedWordingDialog({
  open,
  sectionTitle,
  sectionSubline,
  oldText,
  newText,
  onClose,
  variant = "exact",
  onOpenFullRedline,
}: RecipientFocusedWordingDialogProps) {
  if (!open) return null;
  const compare = variant === "compare_fallback";
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="recipient-focused-wording-title"
      data-testid="recipient-focused-wording-dialog"
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-hidden rounded-xl border border-slate-600 bg-slate-950 shadow-xl">
        <div className="flex items-start justify-between gap-2 border-b border-slate-700 px-4 py-3">
          <div>
            <h2 id="recipient-focused-wording-title" className="text-sm font-semibold text-slate-100">
              {compare ? sectionTitle : RECIPIENT_BUSINESS_REVIEW_EXACT_WORDING_TITLE}
            </h2>
            {compare ? (
              sectionSubline ? (
                <p className="mt-0.5 text-[11px] text-slate-400">{sectionSubline}</p>
              ) : null
            ) : (
              <p className="mt-0.5 text-[11px] text-slate-400">{sectionTitle}</p>
            )}
            {!compare ? null : (
              <p className="mt-1 text-[10px] leading-snug text-slate-500">
                We could not scroll to an exact matching clause in the redline below. Compare the wording here, then
                open the full redline if you need line-level markup.
              </p>
            )}
          </div>
          <button
            type="button"
            className="rounded-md px-2 py-1 text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <div className="max-h-[min(70vh,560px)] space-y-3 overflow-y-auto px-4 py-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-rose-200/90">
              {compare ? RECIPIENT_SEMANTIC_PRIOR_LABEL : "Previous"}
            </p>
            <pre className="mt-1 whitespace-pre-wrap rounded-md border border-rose-900/40 bg-rose-950/30 p-2.5 text-[12px] leading-relaxed text-rose-50">
              {oldText}
            </pre>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-200/90">
              {compare ? RECIPIENT_SEMANTIC_REVISED_LABEL : "Proposed"}
            </p>
            <pre className="mt-1 whitespace-pre-wrap rounded-md border border-emerald-900/40 bg-emerald-950/25 p-2.5 text-[12px] leading-relaxed text-emerald-50">
              {newText}
            </pre>
          </div>
          {compare && onOpenFullRedline ? (
            <div className="flex flex-col gap-2 border-t border-slate-800/60 pt-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="rounded-md border border-slate-600 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800"
                data-testid="recipient-focused-wording-back"
                onClick={onClose}
              >
                Back to review
              </button>
              <button
                type="button"
                className="rounded-md bg-sky-700 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-600"
                data-testid="recipient-focused-wording-open-redline"
                onClick={() => void onOpenFullRedline()}
              >
                {RECIPIENT_FOCUS_COMPARE_OPEN_FULL_REDLINE}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

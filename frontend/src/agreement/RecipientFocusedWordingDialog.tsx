import { RECIPIENT_BUSINESS_REVIEW_EXACT_WORDING_TITLE } from "./portableReviewCopy";

export type RecipientFocusedWordingDialogProps = {
  open: boolean;
  sectionTitle: string;
  oldText: string;
  newText: string;
  onClose: () => void;
};

/**
 * Focused OLD / NEW wording (Business Review Mode — not full-document redline).
 */
export function RecipientFocusedWordingDialog({
  open,
  sectionTitle,
  oldText,
  newText,
  onClose,
}: RecipientFocusedWordingDialogProps) {
  if (!open) return null;
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
              {RECIPIENT_BUSINESS_REVIEW_EXACT_WORDING_TITLE}
            </h2>
            <p className="mt-0.5 text-[11px] text-slate-400">{sectionTitle}</p>
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
            <p className="text-[10px] font-semibold uppercase tracking-wide text-rose-200/90">Previous</p>
            <pre className="mt-1 whitespace-pre-wrap rounded-md border border-rose-900/40 bg-rose-950/30 p-2.5 text-[12px] leading-relaxed text-rose-50">
              {oldText}
            </pre>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-200/90">Proposed</p>
            <pre className="mt-1 whitespace-pre-wrap rounded-md border border-emerald-900/40 bg-emerald-950/25 p-2.5 text-[12px] leading-relaxed text-emerald-50">
              {newText}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}

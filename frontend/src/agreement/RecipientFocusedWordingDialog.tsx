import { useMemo, useState } from "react";
import {
  RECIPIENT_BUSINESS_REVIEW_EXACT_WORDING_TITLE,
  RECIPIENT_FOCUS_COMPARE_BUSINESS_NOTE_LABEL,
  RECIPIENT_FOCUS_COMPARE_OPEN_FULL_REDLINE,
  RECIPIENT_FOCUS_COMPARE_SCROLL_MISS_NOTE,
  RECIPIENT_SEMANTIC_PRIOR_LABEL,
  RECIPIENT_SEMANTIC_REVISED_LABEL,
} from "./portableReviewCopy";

const REVISED_PREVIEW_MAX = 1000;

export type RecipientFocusedWordingDialogProps = {
  open: boolean;
  /** Card title (compare fallback) or combined title (exact wording path). */
  sectionTitle: string;
  /** Matched section label when known (compare fallback). */
  sectionSubline?: string;
  oldText: string;
  newText: string;
  /** Optional “why this matters” line (compare fallback). */
  businessNote?: string;
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
  businessNote,
  onClose,
  variant = "exact",
  onOpenFullRedline,
}: RecipientFocusedWordingDialogProps) {
  const [showFullRevised, setShowFullRevised] = useState(false);
  const compare = variant === "compare_fallback";
  const revisedChunks = useMemo(() => {
    const t = String(newText ?? "");
    if (t.length <= REVISED_PREVIEW_MAX || showFullRevised) return { text: t, truncated: false };
    return { text: `${t.slice(0, REVISED_PREVIEW_MAX).trim()}…`, truncated: true };
  }, [newText, showFullRevised]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="recipient-focused-wording-title"
      data-testid="recipient-focused-wording-dialog"
    >
      <div className="max-h-[92vh] w-full max-w-[760px] overflow-hidden rounded-xl border border-slate-600 bg-slate-950 shadow-xl">
        <div className="flex items-start justify-between gap-2 border-b border-slate-700 px-5 py-4">
          <div className="min-w-0 pr-2">
            <h2 id="recipient-focused-wording-title" className="text-base font-semibold tracking-tight text-slate-100">
              {compare ? sectionTitle : RECIPIENT_BUSINESS_REVIEW_EXACT_WORDING_TITLE}
            </h2>
            {compare ? (
              sectionSubline ? (
                <p className="mt-1 text-[12px] leading-snug text-slate-400">{sectionSubline}</p>
              ) : null
            ) : (
              <p className="mt-1 text-[12px] leading-snug text-slate-400">{sectionTitle}</p>
            )}
            {compare ? (
              <p className="mt-2 text-[11px] leading-relaxed text-slate-500">{RECIPIENT_FOCUS_COMPARE_SCROLL_MISS_NOTE}</p>
            ) : null}
            {compare && businessNote ? (
              <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
                <span className="font-semibold text-slate-300">{RECIPIENT_FOCUS_COMPARE_BUSINESS_NOTE_LABEL}:</span>{" "}
                {businessNote}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <div className="max-h-[min(78vh,640px)] space-y-4 overflow-y-auto px-5 py-4">
          <section>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-rose-200/90">
              {compare ? RECIPIENT_SEMANTIC_PRIOR_LABEL : "Previous wording"}
            </p>
            <pre className="mt-1.5 whitespace-pre-wrap rounded-lg border border-rose-900/40 bg-rose-950/30 p-3 text-[13px] leading-[1.75] text-rose-50">
              {oldText}
            </pre>
          </section>
          <section>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-200/90">
              {compare ? RECIPIENT_SEMANTIC_REVISED_LABEL : "Revised wording"}
            </p>
            <pre className="mt-1.5 whitespace-pre-wrap rounded-lg border border-emerald-900/40 bg-emerald-950/25 p-3 text-[13px] leading-[1.75] text-emerald-50">
              {revisedChunks.text}
            </pre>
            {revisedChunks.truncated && !showFullRevised ? (
              <button
                type="button"
                className="mt-2 text-left text-[11px] font-semibold text-sky-300 underline decoration-sky-700/50 underline-offset-2 hover:text-sky-200"
                data-testid="recipient-focused-wording-show-full-revised"
                onClick={() => setShowFullRevised(true)}
              >
                Show full revised text
              </button>
            ) : null}
          </section>
          {compare && onOpenFullRedline ? (
            <div className="flex flex-col gap-2 border-t border-slate-800/60 pt-4 sm:flex-row sm:justify-end">
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

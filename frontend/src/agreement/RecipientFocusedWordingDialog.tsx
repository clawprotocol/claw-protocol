import { useEffect, useMemo, useState } from "react";
import {
  RECIPIENT_BUSINESS_REVIEW_EXACT_WORDING_TITLE,
  RECIPIENT_FOCUS_COMPARE_BUSINESS_NOTE_LABEL,
  RECIPIENT_FOCUS_COMPARE_OPEN_FULL_REDLINE,
  RECIPIENT_FOCUS_COMPARE_SCROLL_MISS_NOTE,
  RECIPIENT_FOCUS_COMPARE_SHOW_LEGAL_MARKUP,
  RECIPIENT_SEMANTIC_PRIOR_LABEL,
  RECIPIENT_SEMANTIC_REVISED_LABEL,
} from "./portableReviewCopy";

const REVISED_PREVIEW_MAX = 1000;
const PRIOR_PREVIEW_MAX = 900;

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
  const compare = variant === "compare_fallback";
  const [showFullRevised, setShowFullRevised] = useState(false);
  const [showFullPrior, setShowFullPrior] = useState(false);

  useEffect(() => {
    if (!open) {
      setShowFullRevised(false);
      setShowFullPrior(false);
    }
  }, [open]);

  const revisedChunks = useMemo(() => {
    const t = String(newText ?? "");
    if (t.length <= REVISED_PREVIEW_MAX || showFullRevised) return { text: t, truncated: false };
    return { text: `${t.slice(0, REVISED_PREVIEW_MAX).trim()}…`, truncated: true };
  }, [newText, showFullRevised]);

  const priorChunks = useMemo(() => {
    const t = String(oldText ?? "");
    if (t.length <= PRIOR_PREVIEW_MAX || showFullPrior) return { text: t, truncated: false };
    return { text: `${t.slice(0, PRIOR_PREVIEW_MAX).trim()}…`, truncated: true };
  }, [oldText, showFullPrior]);

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
            {compare && businessNote ? (
              <p className="mt-3 text-[12px] leading-relaxed text-slate-200">
                <span className="font-semibold text-slate-100">{RECIPIENT_FOCUS_COMPARE_BUSINESS_NOTE_LABEL}:</span>{" "}
                {businessNote}
              </p>
            ) : null}
            {compare ? (
              <p className="mt-2 text-[11px] leading-relaxed text-slate-500">{RECIPIENT_FOCUS_COMPARE_SCROLL_MISS_NOTE}</p>
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
            <pre className="mt-1.5 max-h-52 min-h-0 overflow-y-auto whitespace-pre-wrap rounded-lg border border-rose-900/40 bg-rose-950/30 p-3 text-[13px] leading-[1.75] text-rose-50">
              {priorChunks.text}
            </pre>
            {priorChunks.truncated && !showFullPrior ? (
              <button
                type="button"
                className="mt-2 text-left text-[11px] font-semibold text-sky-300 underline decoration-sky-700/50 underline-offset-2 hover:text-sky-200"
                data-testid="recipient-focused-wording-show-full-prior"
                onClick={() => setShowFullPrior(true)}
              >
                Show full original text
              </button>
            ) : null}
          </section>
          <section>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-200/90">
              {compare ? RECIPIENT_SEMANTIC_REVISED_LABEL : "Revised wording"}
            </p>
            <pre className="mt-1.5 max-h-52 min-h-0 overflow-y-auto whitespace-pre-wrap rounded-lg border border-emerald-900/40 bg-emerald-950/25 p-3 text-[13px] leading-[1.75] text-emerald-50">
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
          {compare ? (
            <details className="rounded-lg border border-slate-700/60 bg-slate-900/40 px-3 py-2">
              <summary className="cursor-pointer text-[11px] font-semibold text-slate-400 marker:content-none hover:text-slate-200 [&::-webkit-details-marker]:hidden">
                {RECIPIENT_FOCUS_COMPARE_SHOW_LEGAL_MARKUP}
              </summary>
              <div className="mt-2 grid gap-2 border-t border-slate-800/50 pt-2 sm:grid-cols-2">
                <pre className="max-h-36 overflow-y-auto whitespace-pre-wrap rounded-md border border-slate-800/80 bg-slate-950/80 p-2 font-mono text-[10px] leading-snug text-slate-400">
                  {oldText}
                </pre>
                <pre className="max-h-36 overflow-y-auto whitespace-pre-wrap rounded-md border border-slate-800/80 bg-slate-950/80 p-2 font-mono text-[10px] leading-snug text-slate-400">
                  {newText}
                </pre>
              </div>
            </details>
          ) : null}
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

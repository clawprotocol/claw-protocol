import {
  RECIPIENT_REVISED_UPLOAD_ANALYZING_CHECKLIST,
  RECIPIENT_REVISED_UPLOAD_ANALYZING_SUB,
  RECIPIENT_REVISED_UPLOAD_ANALYZING_TITLE,
} from "./portableReviewCopy";

/**
 * Calm “processing” surface after a revised draft file is chosen — before compare appears.
 */
export function RecipientRevisedDraftAnalyzingCard() {
  return (
    <div
      data-testid="recipient-revised-upload-analyzing"
      className="relative overflow-hidden rounded-xl border border-emerald-800/30 bg-gradient-to-b from-emerald-950/40 to-slate-950/50 px-4 py-6 shadow-inner shadow-emerald-950/20"
      role="status"
      aria-live="polite"
    >
      <div
        className="pointer-events-none absolute inset-0 -translate-x-full animate-[shimmer_1.8s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white/[0.04] to-transparent"
        aria-hidden
      />
      <h3 className="relative text-base font-semibold tracking-tight text-emerald-50/95">
        {RECIPIENT_REVISED_UPLOAD_ANALYZING_TITLE}
      </h3>
      <p className="relative mt-1.5 text-sm leading-relaxed text-slate-400">{RECIPIENT_REVISED_UPLOAD_ANALYZING_SUB}</p>
      <ul className="relative mt-4 space-y-2 text-[11px] leading-snug text-slate-500">
        {RECIPIENT_REVISED_UPLOAD_ANALYZING_CHECKLIST.map((line) => (
          <li key={line} className="flex items-center gap-2">
            <span className="inline-block size-1.5 shrink-0 rounded-full bg-emerald-500/60 shadow-[0_0_8px_rgba(16,185,129,0.35)]" />
            <span className="animate-pulse">{line}</span>
          </li>
        ))}
      </ul>
      <style>{`
        @keyframes shimmer {
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
}

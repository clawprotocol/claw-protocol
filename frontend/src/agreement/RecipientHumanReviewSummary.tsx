import {
  RECIPIENT_PREVIEW_NOTES_SEPARATE_FROM_AGREEMENT,
  RECIPIENT_PREVIEW_NOTHING_SENT_UNTIL_SENDER_ACCEPTS,
} from "./portableReviewCopy";

export type RecipientHumanReviewSummaryProps = {
  /** e.g. "Alex proposed 4 meaningful revisions." */
  headline: string;
  /** Short trust chip, e.g. "6 key updates" */
  keyUpdatesLabel: string | null;
  importantBullets: readonly string[];
  clarificationBullets: readonly string[];
  negativeAssurances: readonly string[];
  confidenceHeadline: string;
  confidenceBody: string;
};

/**
 * Signer-facing summary card shown before the redline body (human review mode).
 */
export function RecipientHumanReviewSummary({
  headline,
  keyUpdatesLabel,
  importantBullets,
  clarificationBullets,
  negativeAssurances,
  confidenceHeadline,
  confidenceBody,
}: RecipientHumanReviewSummaryProps) {
  return (
    <section
      className="mt-4 rounded-lg border border-slate-600/45 bg-slate-950/40 px-4 py-3.5 shadow-sm"
      data-testid="recipient-human-review-summary"
      aria-label="Summary of proposed changes"
    >
      <p className="text-[15px] font-semibold leading-snug tracking-tight text-slate-50">{headline}</p>
      {keyUpdatesLabel ? (
        <p
          className="mt-1.5 inline-flex rounded-full border border-sky-800/50 bg-sky-950/35 px-2.5 py-0.5 text-[11px] font-medium text-sky-100"
          data-testid="recipient-human-review-key-updates"
        >
          {keyUpdatesLabel}
        </p>
      ) : null}

      {importantBullets.length > 0 ? (
        <div className="mt-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Important changes</p>
          <ul className="mt-1.5 list-disc space-y-1 pl-5 text-[13px] leading-relaxed text-slate-200">
            {importantBullets.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {clarificationBullets.length > 0 ? (
        <div className="mt-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Clarifications</p>
          <ul className="mt-1.5 list-disc space-y-1 pl-5 text-[13px] leading-relaxed text-slate-300">
            {clarificationBullets.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {negativeAssurances.length > 0 ? (
        <ul className="mt-3 space-y-1 border-t border-slate-700/50 pt-3 text-[12px] leading-relaxed text-slate-400">
          {negativeAssurances.map((line) => (
            <li key={line}>— {line}</li>
          ))}
        </ul>
      ) : null}

      <div className="mt-3 rounded-md border border-slate-700/40 bg-slate-950/50 px-3 py-2" data-testid="recipient-compare-confidence">
        <p className="text-[12px] font-semibold text-slate-200">{confidenceHeadline}</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-slate-400">{confidenceBody}</p>
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-slate-500">{RECIPIENT_PREVIEW_NOTHING_SENT_UNTIL_SENDER_ACCEPTS}</p>
      <p className="sr-only">{RECIPIENT_PREVIEW_NOTES_SEPARATE_FROM_AGREEMENT}</p>
    </section>
  );
}

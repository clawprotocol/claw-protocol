import {
  RECIPIENT_BUSINESS_REVIEW_MOST_IMPORTANT_HEADING,
  RECIPIENT_BUSINESS_REVIEW_NO_CHANGES_SECTION,
  RECIPIENT_BUSINESS_REVIEW_OTHER_EDITS_LINE,
  RECIPIENT_BUSINESS_REVIEW_RECOMMENDED_FOCUS_HEADING,
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
  /** Numbered lines for sender review priority */
  recommendedFocusLines: readonly string[];
  confidenceHeadline: string;
  confidenceBody: string;
};

/**
 * Signer-facing summary card — primary decision surface before the full legal redline.
 */
export function RecipientHumanReviewSummary({
  headline,
  keyUpdatesLabel,
  importantBullets,
  clarificationBullets,
  negativeAssurances,
  recommendedFocusLines,
  confidenceHeadline,
  confidenceBody,
}: RecipientHumanReviewSummaryProps) {
  return (
    <section
      className="mt-4 rounded-lg border border-slate-600/45 bg-slate-950/40 px-4 py-3 shadow-sm"
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

      {recommendedFocusLines.length > 0 ? (
        <div className="mt-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            {RECIPIENT_BUSINESS_REVIEW_RECOMMENDED_FOCUS_HEADING}
          </p>
          <ol className="mt-1.5 list-decimal space-y-1 pl-5 text-[13px] leading-relaxed text-slate-200">
            {recommendedFocusLines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ol>
          <p className="mt-2 text-[11px] leading-relaxed text-slate-500">{RECIPIENT_BUSINESS_REVIEW_OTHER_EDITS_LINE}</p>
        </div>
      ) : null}

      {importantBullets.length > 0 ? (
        <div className="mt-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            {RECIPIENT_BUSINESS_REVIEW_MOST_IMPORTANT_HEADING}
          </p>
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
        <div className="mt-3 border-t border-slate-700/50 pt-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            {RECIPIENT_BUSINESS_REVIEW_NO_CHANGES_SECTION}
          </p>
          <ul className="mt-1.5 space-y-1 text-[12px] leading-relaxed text-slate-400">
            {negativeAssurances.map((line) => (
              <li key={line}>— {line}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-3 rounded-md border border-slate-700/40 bg-slate-950/50 px-3 py-2" data-testid="recipient-compare-confidence">
        <p className="text-[12px] font-semibold text-slate-200">{confidenceHeadline}</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-slate-400">{confidenceBody}</p>
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-slate-500" data-testid="recipient-nothing-sent-footnote">
        {RECIPIENT_PREVIEW_NOTHING_SENT_UNTIL_SENDER_ACCEPTS}
      </p>
      <p className="sr-only">{RECIPIENT_PREVIEW_NOTES_SEPARATE_FROM_AGREEMENT}</p>
    </section>
  );
}

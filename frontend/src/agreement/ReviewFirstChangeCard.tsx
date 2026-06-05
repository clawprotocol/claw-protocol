import type { ReviewFirstChangedSection, ReviewFirstDiffPart } from "./reviewFirstTextDiff";

type Props = {
  section: ReviewFirstChangedSection;
};

function renderPhraseDiffParts(parts: ReviewFirstDiffPart[] | null | undefined, changedKind: "added" | "removed") {
  if (!parts?.length) return null;
  return parts.map((part, index) => {
    const changed = part.kind === changedKind;
    const className = changed
      ? changedKind === "added"
        ? "rounded bg-emerald-100 px-1 py-0.5 font-semibold text-emerald-900"
        : "rounded bg-rose-100 px-1 py-0.5 font-semibold text-rose-900"
      : "text-slate-800";
    return (
      <span key={`${part.kind}-${index}-${part.text.slice(0, 10)}`} className={className}>
        {part.text}
        {index < parts.length - 1 ? " " : ""}
      </span>
    );
  });
}

/**
 * Change-first review card — exact wording delta is primary; clause context is secondary/collapsed.
 */
export function ReviewFirstChangeCard({ section }: Props) {
  const clauseLabel = section.clauseLabel || section.clauseTitle;
  const showPhrase = section.changeMagnitude !== "section" || section.beforePhrase.length < 200;

  return (
    <article
      className="min-w-0 max-w-full rounded-xl border border-slate-200 bg-slate-50/90 p-3 sm:p-4"
      data-testid="recipient-review-first-change-card"
      data-change-magnitude={section.changeMagnitude}
    >
      <h3
        className="text-base font-semibold tracking-tight text-slate-950 sm:text-lg"
        data-testid="recipient-review-first-change-title"
      >
        {section.title}
      </h3>

      <div className="mt-3 space-y-2.5" data-testid="recipient-review-first-phrase-delta">
        <div className="min-w-0 rounded-lg border border-rose-100 bg-white px-3 py-2.5">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-rose-700">Previous</div>
          <p
            className="mt-1 break-words text-sm font-medium leading-snug text-slate-900 sm:text-[15px]"
            data-testid="recipient-review-first-before-phrase"
          >
            {showPhrase
              ? renderPhraseDiffParts(section.phrasePreviousParts, "removed") ?? section.beforePhrase
              : section.previous}
          </p>
        </div>
        <div className="min-w-0 rounded-lg border border-emerald-100 bg-white px-3 py-2.5">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Updated</div>
          <p
            className="mt-1 break-words text-sm font-medium leading-snug text-slate-900 sm:text-[15px]"
            data-testid="recipient-review-first-after-phrase"
          >
            {showPhrase
              ? renderPhraseDiffParts(section.phraseProposedParts, "added") ?? section.afterPhrase
              : section.proposed}
          </p>
        </div>
      </div>

      {clauseLabel ? (
        <div className="mt-3 min-w-0" data-testid="recipient-review-first-clause-label">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Clause</div>
          <p className="mt-0.5 break-words text-xs leading-snug text-slate-600 sm:text-sm">{clauseLabel}</p>
        </div>
      ) : null}

      {section.clauseContextSnippet ? (
        <details className="mt-3 text-xs text-slate-600" data-testid="recipient-review-first-clause-context">
          <summary className="cursor-pointer font-medium text-slate-500">View clause context</summary>
          <p className="mt-2 break-words rounded-lg border border-slate-200 bg-white p-3 text-xs leading-relaxed text-slate-700">
            {section.clauseContextSnippet}
          </p>
        </details>
      ) : null}

      <details className="mt-2 text-xs text-slate-600" data-testid="recipient-review-first-full-clause">
        <summary className="cursor-pointer font-medium text-slate-500">View full clause</summary>
        <div className="mt-2 grid min-w-0 gap-2 md:grid-cols-2">
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-slate-200 bg-white p-3 font-sans text-xs leading-relaxed">
            {section.fullPrevious}
          </pre>
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-slate-200 bg-white p-3 font-sans text-xs leading-relaxed">
            {section.fullProposed}
          </pre>
        </div>
      </details>
    </article>
  );
}

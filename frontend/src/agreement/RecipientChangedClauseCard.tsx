import { RecipientRedlineInline } from "./RecipientRedlineInline";
import {
  CLAUSE_CARD_DISCLOSURE_CHAR_THRESHOLD,
  buildClauseCardDisplayRedline,
  capRedlineChangeSegmentsForClauseUi,
  insertTextsForAddedPills,
  redlineHasSignificantRemovals,
  type RecipientClauseCard,
} from "./recipientPreviewDiffModel";

type Props = {
  card: RecipientClauseCard;
  /** When true, show field-level redline (green/red). When false, clean proposed snippets only. */
  showTrackedChanges: boolean;
};

/**
 * Changed-clause card: with tracked changes ON, always prefer inline redline (insert/delete) when the field diff has segments.
 */
export function RecipientChangedClauseCard({ card, showTrackedChanges }: Props) {
  const long =
    card.currentText.length > CLAUSE_CARD_DISCLOSURE_CHAR_THRESHOLD ||
    card.proposedText.length > CLAUSE_CARD_DISCLOSURE_CHAR_THRESHOLD;
  const fieldRl = card.fieldRedline;
  const displayRedline = fieldRl
    ? capRedlineChangeSegmentsForClauseUi(buildClauseCardDisplayRedline(fieldRl))
    : null;
  const hasFieldRedline = Boolean(displayRedline?.hasChanges);

  const showInlineFallback =
    !hasFieldRedline &&
    card.trackMode === "inline" &&
    Boolean(fieldRl?.hasChanges) &&
    card.trackAddedDisplayLines.length === 0 &&
    !card.trackSnippetPair;
  const showDeleteInsertRow =
    showInlineFallback && displayRedline && redlineHasSignificantRemovals(displayRedline);
  const addedPills =
    showInlineFallback && displayRedline && !showDeleteInsertRow ? insertTextsForAddedPills(fieldRl!) : [];
  const useAddedPillsRow = !showDeleteInsertRow && addedPills.length > 0;

  if (!showTrackedChanges) {
    return (
      <div
        className="rounded-md border border-slate-700/80 bg-slate-950/40 px-3 py-2 text-[11px] leading-snug text-slate-100"
        data-testid={`recipient-clause-card-${card.id}`}
      >
        <div data-testid="clause-card-primary">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="m-0 text-[12px] font-semibold tracking-tight text-slate-50">{card.cardTitle}</h3>
            <span className="shrink-0 rounded border border-slate-600/80 bg-slate-900/60 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-slate-300">
              Proposed
            </span>
          </div>
          <div className="mt-2" data-testid="clause-clean-proposed">
            <div className="text-[9px] font-semibold uppercase tracking-wide text-emerald-200/70">Clean proposed</div>
            <div className="mt-0.5 space-y-1 rounded border border-emerald-900/35 bg-emerald-950/25 px-2 py-1.5 text-[10.5px] text-emerald-50/95">
              {card.suggestedSnippetLines.map((line) => (
                <div key={line}>{line}</div>
              ))}
            </div>
          </div>
        </div>
        <details className="mt-2 rounded-md border border-slate-800/70 bg-slate-900/25 px-2 py-1" data-testid="clause-full-before-after">
          <summary className="cursor-pointer select-none text-[10px] font-medium text-sky-300/95 hover:text-sky-200">
            Show full before/after
            {long ? <span className="ml-1 font-normal text-slate-500">(long text)</span> : null}
          </summary>
          <div className="mt-2 space-y-2 border-t border-slate-800/60 pt-2 text-[10px] text-slate-300">
            <div>
              <span className="font-medium text-slate-500">Current: </span>
              <span className="whitespace-pre-wrap break-words">{card.currentText}</span>
            </div>
            <div>
              <span className="font-medium text-emerald-200/80">Proposed: </span>
              <span className="whitespace-pre-wrap break-words">{card.proposedText}</span>
            </div>
          </div>
        </details>
      </div>
    );
  }

  return (
    <div
      className="rounded-md border border-slate-700/80 bg-slate-950/40 px-3 py-2 text-[11px] leading-snug text-slate-100"
      data-testid={`recipient-clause-card-${card.id}`}
    >
      <div data-testid="clause-card-primary">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="m-0 text-[12px] font-semibold tracking-tight text-slate-50">{card.cardTitle}</h3>
          <span
            className="shrink-0 rounded border border-amber-800/50 bg-amber-950/40 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-amber-100/95"
            data-testid="clause-changed-badge"
          >
            Changed
          </span>
        </div>

        <div className="mt-2">
          <div className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">What changed</div>
          <ul className="mb-0 mt-0.5 list-disc space-y-0.5 pl-4 text-[10.5px] text-slate-200" data-testid="clause-what-changed">
            {card.whatChangedBullets.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>

        <div className="mt-2 space-y-1.5">
          <div>
            <div className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">Current</div>
            <div
              className="mt-0.5 rounded border border-slate-800/90 bg-slate-900/60 px-2 py-1 text-[10.5px] text-slate-300/95"
              data-testid="clause-current-snippet"
            >
              {card.currentSnippet}
            </div>
          </div>
        </div>

        {hasFieldRedline && displayRedline ? (
          <div className="mt-2" data-testid="clause-field-redline">
            <div className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">Track changes</div>
            <div className="mt-0.5 max-h-56 overflow-y-auto rounded-md border border-slate-600/80 bg-white px-2 py-2 shadow-sm">
              <RecipientRedlineInline redline={displayRedline} paragraphBreaks embedded contrast="high" />
            </div>
          </div>
        ) : null}

        {!hasFieldRedline && card.trackMode === "lines" && card.trackAddedDisplayLines.length > 0 ? (
          <div className="mt-2" data-testid="clause-track-lines">
            <div className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">Track changes</div>
            <ul className="mb-0 mt-1 space-y-1.5 rounded-md border border-slate-600/80 bg-white px-2 py-2">
              {card.trackAddedDisplayLines.map((line) => {
                const body = line.startsWith("Added:") ? line.slice(6).trim() : line;
                return (
                  <li key={line} className="list-none text-[10px] leading-snug text-slate-800">
                    <span className="font-semibold text-slate-600">Added: </span>
                    <span className="rounded bg-emerald-500 px-1 py-px font-semibold text-emerald-950 ring-1 ring-emerald-800/40">
                      {body}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        {!hasFieldRedline && card.trackMode === "pair" && card.trackSnippetPair ? (
          <div className="mt-2" data-testid="clause-track-pair">
            <div className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">Track changes</div>
            <div className="mt-1 flex flex-wrap items-baseline gap-1.5 rounded-md border border-slate-600/80 bg-white px-2 py-2 text-[10px] leading-snug">
              <span
                className="max-w-[48%] rounded bg-rose-400 px-1 py-px font-semibold text-rose-950 line-through decoration-rose-950 decoration-2 ring-1 ring-rose-800/45"
                data-testid="clause-track-removed"
              >
                {card.trackSnippetPair.removed}
              </span>
              <span className="text-slate-400" aria-hidden>
                →
              </span>
              <span
                className="max-w-[48%] rounded bg-emerald-500 px-1 py-px font-semibold text-emerald-950 ring-1 ring-emerald-800/40"
                data-testid="clause-track-inserted"
              >
                {card.trackSnippetPair.added}
              </span>
            </div>
          </div>
        ) : null}

        {!hasFieldRedline && showInlineFallback && displayRedline ? (
          <div className="mt-2" data-testid="clause-field-redline-fallback">
            <div className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">Track changes</div>
            {showDeleteInsertRow ? (
              <div className="mt-0.5 rounded-md border border-slate-600/80 bg-white px-2 py-1.5 shadow-sm">
                <RecipientRedlineInline redline={displayRedline} paragraphBreaks embedded contrast="high" />
              </div>
            ) : useAddedPillsRow ? (
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5 rounded-md border border-slate-600/80 bg-white px-2 py-1.5 text-[10px] text-slate-800">
                <span className="font-semibold text-slate-600">Added:</span>
                {addedPills.map((t, idx) => (
                  <span
                    key={`${idx}_${t.slice(0, 48)}`}
                    className="max-w-full rounded px-1 py-0.5 font-semibold bg-emerald-500 text-emerald-950 ring-1 ring-emerald-800/40"
                    data-redline="insert-pill"
                  >
                    {t}
                  </span>
                ))}
              </div>
            ) : (
              <div className="mt-0.5 rounded-md border border-slate-600/80 bg-white px-2 py-1.5 shadow-sm">
                <RecipientRedlineInline redline={displayRedline} paragraphBreaks embedded contrast="high" />
              </div>
            )}
          </div>
        ) : null}

        <div className="mt-2">
          <div className="text-[9px] font-semibold uppercase tracking-wide text-emerald-200/70">Suggested (summary)</div>
          <div
            className="mt-0.5 space-y-1 rounded border border-emerald-900/35 bg-emerald-950/25 px-2 py-1 text-[10.5px] text-emerald-50/95"
            data-testid="clause-suggested-snippet"
          >
            {card.suggestedSnippetLines.map((line) => (
              <div key={line}>{line}</div>
            ))}
          </div>
        </div>
      </div>

      <details className="mt-2 rounded-md border border-slate-800/70 bg-slate-900/25 px-2 py-1" data-testid="clause-full-before-after">
        <summary className="cursor-pointer select-none text-[10px] font-medium text-sky-300/95 hover:text-sky-200">
          Show full before/after
          {long ? <span className="ml-1 font-normal text-slate-500">(long text)</span> : null}
        </summary>
        <div className="mt-2 space-y-2 border-t border-slate-800/60 pt-2 text-[10px] text-slate-300">
          <div>
            <span className="font-medium text-slate-500">Current: </span>
            <span className="whitespace-pre-wrap break-words">{card.currentText}</span>
          </div>
          <div>
            <span className="font-medium text-emerald-200/80">Proposed: </span>
            <span className="whitespace-pre-wrap break-words">{card.proposedText}</span>
          </div>
        </div>
      </details>
    </div>
  );
}

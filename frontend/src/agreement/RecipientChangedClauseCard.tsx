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
};

/**
 * Compact “track changes” clause card: heading, Current / Suggested snippets, bullets, tracked row; full text in disclosure.
 */
export function RecipientChangedClauseCard({ card }: Props) {
  const long =
    card.currentText.length > CLAUSE_CARD_DISCLOSURE_CHAR_THRESHOLD ||
    card.proposedText.length > CLAUSE_CARD_DISCLOSURE_CHAR_THRESHOLD;
  const fieldRl = card.fieldRedline;
  const showTracked = Boolean(fieldRl?.hasChanges);
  const displayRedline = fieldRl
    ? capRedlineChangeSegmentsForClauseUi(buildClauseCardDisplayRedline(fieldRl))
    : null;
  const showDeleteInsertRow =
    showTracked && displayRedline && redlineHasSignificantRemovals(displayRedline);
  const addedPills =
    showTracked && displayRedline && !showDeleteInsertRow ? insertTextsForAddedPills(fieldRl!) : [];
  const useAddedPillsRow = !showDeleteInsertRow && addedPills.length > 0;

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
          <div>
            <div className="text-[9px] font-semibold uppercase tracking-wide text-emerald-200/70">Suggested</div>
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

        <div className="mt-2">
          <div className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">What changed</div>
          <ul className="mb-0 mt-0.5 list-disc space-y-0.5 pl-4 text-[10.5px] text-slate-200" data-testid="clause-what-changed">
            {card.whatChangedBullets.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>

        {showTracked && displayRedline ? (
          <div className="mt-2" data-testid="clause-field-redline">
            <div className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">Tracked changes</div>
            {showDeleteInsertRow ? (
              <div className="mt-0.5 rounded-md border border-slate-600/80 bg-white px-2 py-1.5 shadow-sm">
                <RecipientRedlineInline redline={displayRedline} paragraphBreaks embedded trackingStrong />
              </div>
            ) : useAddedPillsRow ? (
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5 rounded-md border border-slate-600/80 bg-white px-2 py-1.5 text-[10px] text-slate-800">
                <span className="font-semibold text-slate-600">Added:</span>
                {addedPills.map((t, idx) => (
                  <span
                    key={`${idx}_${t.slice(0, 48)}`}
                    className="max-w-full rounded-full border border-emerald-600/40 bg-emerald-300/95 px-2 py-0.5 font-medium text-emerald-950"
                    data-redline="insert-pill"
                  >
                    {t}
                  </span>
                ))}
              </div>
            ) : (
              <div className="mt-0.5 rounded-md border border-slate-600/80 bg-white px-2 py-1.5 shadow-sm">
                <RecipientRedlineInline redline={displayRedline} paragraphBreaks embedded trackingStrong />
              </div>
            )}
          </div>
        ) : null}
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

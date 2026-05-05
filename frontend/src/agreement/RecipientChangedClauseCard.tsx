import { RecipientRedlineInline } from "./RecipientRedlineInline";
import { CLAUSE_CARD_DISCLOSURE_CHAR_THRESHOLD, type RecipientClauseCard } from "./recipientPreviewDiffModel";

type Props = {
  card: RecipientClauseCard;
};

/**
 * Single “Changed clauses” card: Word-style bullets + field-scoped inline redline;
 * full before/after lives in a disclosure.
 */
export function RecipientChangedClauseCard({ card }: Props) {
  const long =
    card.currentText.length > CLAUSE_CARD_DISCLOSURE_CHAR_THRESHOLD ||
    card.proposedText.length > CLAUSE_CARD_DISCLOSURE_CHAR_THRESHOLD;
  const showInline = Boolean(card.fieldRedline?.hasChanges);

  return (
    <div
      className="rounded-md border border-slate-700/80 bg-slate-950/40 px-3 py-2.5 text-[11px] leading-snug text-slate-100"
      data-testid={`recipient-clause-card-${card.id}`}
    >
      <div className="font-semibold text-slate-100">{card.sectionLabel}</div>

      <div className="mt-2">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">What changed</div>
        <ul className="mb-0 mt-1 list-disc space-y-0.5 pl-4 text-[11px] text-slate-200" data-testid="clause-what-changed">
          {card.whatChangedBullets.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>

      {showInline ? (
        <div className="mt-2" data-testid="clause-field-redline">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">In this clause</div>
          <div className="mt-1 max-h-40 overflow-y-auto rounded-md border border-slate-600/70 bg-white px-2 py-1.5">
            <RecipientRedlineInline redline={card.fieldRedline!} paragraphBreaks embedded />
          </div>
          <p className="mt-1 text-[9px] text-slate-500">
            <span className="text-emerald-700/90">Green</span> = added wording ·{" "}
            <span className="text-rose-700/90">Red strikethrough</span> = removed wording
          </p>
        </div>
      ) : null}

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

      <p className="mt-2 border-t border-slate-800/80 pt-2 text-[10px] italic text-slate-500">{card.reason}</p>
    </div>
  );
}

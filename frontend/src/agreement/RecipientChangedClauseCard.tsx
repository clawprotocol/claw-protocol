import { RecipientRedlineInline } from "./RecipientRedlineInline";
import {
  CLAUSE_CARD_DISCLOSURE_CHAR_THRESHOLD,
  INSTRUCTION_GAP_BULLET_PREFIX,
  buildClauseCardDisplayRedline,
  capRedlineChangeSegmentsForClauseUi,
  type RecipientClauseCard,
  type RedlineSegmentVM,
} from "./recipientPreviewDiffModel";
import type { RedlineResult } from "../vs01/agreementRedline";

type Props = {
  card: RecipientClauseCard;
  showTrackedChanges: boolean;
  /** Narrow layout for side-by-side “tracked summary” stack (same redline view models). */
  compact?: boolean;
};

function inlineDisplaySegments(vm: RecipientClauseCard["redlineView"]): RedlineSegmentVM[] | null {
  if (!vm.canRenderTrackedDiff || vm.segments.length === 0) return null;
  if (!(vm.hasAdds || vm.hasDeletes)) return null;
  const capped: RedlineResult = capRedlineChangeSegmentsForClauseUi({
    hasChanges: true,
    segments: vm.segments,
  });
  const display = buildClauseCardDisplayRedline(capped);
  return display.segments.length > 0 ? display.segments : null;
}

/**
 * Changed clause card — canonical {@link RecipientClauseCard.redlineView} only.
 */
export function RecipientChangedClauseCard({ card, showTrackedChanges, compact = false }: Props) {
  const long =
    card.currentText.length > CLAUSE_CARD_DISCLOSURE_CHAR_THRESHOLD ||
    card.proposedText.length > CLAUSE_CARD_DISCLOSURE_CHAR_THRESHOLD;
  const vm = card.redlineView;
  const inlineSegments = inlineDisplaySegments(vm);
  const gapBullets = card.whatChangedBullets.filter((b) => b.startsWith(INSTRUCTION_GAP_BULLET_PREFIX));
  const whatChangedNarrative = card.whatChangedBullets.filter((b) => !b.startsWith(INSTRUCTION_GAP_BULLET_PREFIX));

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

  const trackPanelInner =
    <>
      {gapBullets.length > 0 ? (
        <div className="mb-2 space-y-1.5">
          {gapBullets.map((line) => (
            <div
              key={line}
              className="rounded-md border border-amber-700/50 bg-amber-950/45 px-2 py-1.5 text-[10px] leading-snug text-amber-50"
              data-testid="clause-requested-not-reflected-row"
            >
              <span className="font-semibold text-amber-200/95">Requested but not reflected — </span>
              <span>
                {line.startsWith(INSTRUCTION_GAP_BULLET_PREFIX)
                  ? line.slice(INSTRUCTION_GAP_BULLET_PREFIX.length).trimStart()
                  : line}
              </span>
            </div>
          ))}
        </div>
      ) : null}
      {inlineSegments && inlineSegments.length > 0 ? (
        <div className="mt-0.5">
          {vm.hasAdds && !vm.hasDeletes ? (
            <p className="mb-1 text-[9px] leading-snug text-slate-500" data-testid="clause-additions-label">
              Additions shown.
            </p>
          ) : null}
          <div
            className="rounded-md border border-slate-600/80 bg-white px-2 py-2 shadow-sm"
            data-testid="clause-field-redline"
          >
            <RecipientRedlineInline segments={inlineSegments} embedded contrast="high" />
          </div>
        </div>
      ) : vm.addedLines.length > 0 ? (
        <div className="mt-0.5" data-testid="clause-add-only-fallback">
          <ul className="mb-0 mt-1 space-y-1.5 rounded-md border border-slate-600/80 bg-white px-2 py-2" data-testid="clause-track-lines">
            {vm.addedLines.map((line) => {
              const body = line.replace(/^Added:\s*/i, "").trim();
              return (
                <li key={line} className="list-none text-[10px] leading-snug text-slate-800">
                  <span className="font-semibold text-slate-600">Added: </span>
                  <span
                    className="rounded bg-emerald-500 px-1 py-px font-semibold text-emerald-950 ring-1 ring-emerald-800/40"
                    data-redline="insert"
                  >
                    {body}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : card.suggestedSnippetLines.length > 0 ? (
        <div className="mt-0.5" data-testid="clause-track-snippet-fallback">
          <ul className="mb-0 mt-1 space-y-1.5 rounded-md border border-slate-600/80 bg-white px-2 py-2">
            {card.suggestedSnippetLines.map((line) => (
              <li key={line} className="list-none text-[10px] leading-snug text-slate-800">
                <span className="font-semibold text-slate-600">Added: </span>
                <span
                  className="rounded bg-emerald-500 px-1 py-px font-semibold text-emerald-950 ring-1 ring-emerald-800/40"
                  data-redline="insert"
                >
                  {line}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="mt-1 text-[10px] leading-snug text-slate-400">
          {vm.fallbackReason || "No tracked insert/delete segments for this field."}
        </p>
      )}
    </>;

  return (
    <div
      className={`rounded-md border border-slate-700/80 bg-slate-950/40 text-[11px] leading-snug text-slate-100 ${
        compact ? "px-2 py-1.5" : "px-3 py-2"
      }`}
      data-testid={`recipient-clause-card-${card.id}`}
    >
      <div data-testid="clause-card-primary">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className={`m-0 font-semibold tracking-tight text-slate-50 ${compact ? "text-[11px]" : "text-[12px]"}`}>
            {card.cardTitle}
          </h3>
          <span
            className="shrink-0 rounded border border-amber-800/50 bg-amber-950/40 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-amber-100/95"
            data-testid="clause-changed-badge"
          >
            Changed
          </span>
        </div>

        {!compact && whatChangedNarrative.length > 0 ? (
          <div className="mt-2">
            <div className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">What changed</div>
            <ul className="mb-0 mt-0.5 list-disc space-y-0.5 pl-4 text-[10.5px] text-slate-200" data-testid="clause-what-changed">
              {whatChangedNarrative.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className={compact ? "mt-1.5" : "mt-2"} data-testid="clause-track-changes-panel">
          <div className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">Track changes</div>
          {trackPanelInner}
        </div>
      </div>

      {!compact ? (
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
      ) : null}
    </div>
  );
}

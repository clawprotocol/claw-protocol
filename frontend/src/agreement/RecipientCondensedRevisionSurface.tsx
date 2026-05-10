import { forwardRef } from "react";
import type { LegalRedlineDocumentViewModel } from "./legalRedlineBlocks";
import { RecipientLegalRedlineDocument } from "./RecipientLegalRedlineDocument";
import { RecipientRedlineStickyNavigator } from "./RecipientRedlineStickyNavigator";
import type { RecipientSemanticRedlinePresentation } from "./recipientWholeDocSemanticRender";
import type { CondensedTopicReviewCardModel } from "./recipientCondensedTopicReviewModel";
import type { BusinessReviewSemanticId, RecipientRedlineStickyNavRow } from "./recipientBusinessReviewCardsModel";
import type { FocusedWordingResult } from "./recipientBusinessReviewCardsModel";
import {
  RECIPIENT_ADVANCED_REDLINE_INTRO,
  RECIPIENT_BUSINESS_REVIEW_WHY_DETAILS,
  RECIPIENT_CONDENSED_COMPARE_FOCUS_CHIPS,
  RECIPIENT_CONDENSED_COMPARE_FOCUS_LABEL,
  RECIPIENT_CONDENSED_REVISION_BANNER,
  RECIPIENT_CONDENSED_TAB_ADVANCED,
  RECIPIENT_CONDENSED_TAB_CHANGED,
  RECIPIENT_CONDENSED_TAB_CLEAN,
  RECIPIENT_NOT_RESTAT_ORIGINAL_DETAILS_SUMMARY,
  RECIPIENT_NOT_RESTAT_ORIGINAL_FOOTNOTE,
  RECIPIENT_NOT_RESTAT_ORIGINAL_INTRO,
  RECIPIENT_ONLY_CHANGED_SECTIONS,
  RECIPIENT_REDLINE_CHANGED_WORDING_INSTRUCTION,
  RECIPIENT_REDLINE_CHANGED_SECTIONS_HEADING,
  RECIPIENT_SEMANTIC_PRIOR_LABEL,
  RECIPIENT_SEMANTIC_REVISED_LABEL,
  RECIPIENT_SHOW_ADVANCED_LEGAL_MARKUP,
  RECIPIENT_SHOW_UNCHANGED_CONTEXT,
} from "./portableReviewCopy";

export type CondensedRevisionTab = "clean" | "changed" | "advanced";

export type RecipientCondensedRevisionSurfaceProps = {
  proposedPlainClean: string;
  topicCards: readonly CondensedTopicReviewCardModel[];
  notRestatedLabels: readonly string[];
  legalVm: LegalRedlineDocumentViewModel;
  onlyChangedRedlineSections: boolean;
  onOnlyChangedChange: (next: boolean) => void;
  recipientNarrowIntentAnchors: boolean;
  narrowRedlineHighlightAnchor: string | null;
  semanticPresentation: RecipientSemanticRedlinePresentation | null;
  highlightedSemanticAnchor: string | null;
  stickyNavRows: readonly RecipientRedlineStickyNavRow[];
  onStickySelect: (id: BusinessReviewSemanticId, meta?: { chipLabel?: string }) => void | Promise<void>;
  onDenseExactWording: (w: FocusedWordingResult) => void;
  selectedTab: CondensedRevisionTab;
  onTabChange: (tab: CondensedRevisionTab) => void;
};

const tabBtn = (active: boolean) =>
  [
    "rounded-md px-3 py-1.5 text-[11px] font-semibold transition-colors",
    active
      ? "bg-sky-700 text-white shadow-sm"
      : "border border-slate-600/60 bg-slate-900/40 text-slate-200 hover:border-slate-500 hover:bg-slate-900/70",
  ].join(" ");

/**
 * Tabbed compare surface for condensed clean-revision uploads (clean draft default, not giant redline).
 */
export const RecipientCondensedRevisionSurface = forwardRef<HTMLDivElement, RecipientCondensedRevisionSurfaceProps>(
  function RecipientCondensedRevisionSurface(
    {
      proposedPlainClean,
      topicCards,
      notRestatedLabels,
      legalVm,
      onlyChangedRedlineSections,
      onOnlyChangedChange,
      recipientNarrowIntentAnchors,
      narrowRedlineHighlightAnchor,
      semanticPresentation,
      highlightedSemanticAnchor,
      stickyNavRows,
      onStickySelect,
      onDenseExactWording,
      selectedTab,
      onTabChange,
    },
    ref,
  ) {
    return (
      <div className="mt-4 space-y-3" data-testid="recipient-condensed-revision-surface">
        <div
          className="flex flex-wrap gap-1.5 rounded-lg border border-slate-600/50 bg-slate-950/40 p-1.5"
          role="tablist"
          aria-label="Review version"
        >
          <button
            type="button"
            role="tab"
            aria-selected={selectedTab === "clean"}
            className={tabBtn(selectedTab === "clean")}
            data-testid="recipient-condensed-tab-clean"
            onClick={() => onTabChange("clean")}
          >
            {RECIPIENT_CONDENSED_TAB_CLEAN}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={selectedTab === "changed"}
            className={tabBtn(selectedTab === "changed")}
            data-testid="recipient-condensed-tab-changed"
            onClick={() => onTabChange("changed")}
          >
            {RECIPIENT_CONDENSED_TAB_CHANGED}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={selectedTab === "advanced"}
            className={tabBtn(selectedTab === "advanced")}
            data-testid="recipient-condensed-tab-advanced"
            onClick={() => onTabChange("advanced")}
          >
            {RECIPIENT_CONDENSED_TAB_ADVANCED}
          </button>
        </div>

        {selectedTab === "clean" ? (
          <div
            role="tabpanel"
            className="rounded-lg border border-slate-600/40 bg-slate-950/25 p-3 sm:p-4"
            data-testid="recipient-condensed-panel-clean"
          >
            <p className="rounded-md border border-sky-900/35 bg-sky-950/30 px-3 py-2 text-[11px] leading-relaxed text-sky-100/95">
              {RECIPIENT_CONDENSED_REVISION_BANNER}
            </p>
            <p className="mt-3 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              {RECIPIENT_CONDENSED_COMPARE_FOCUS_LABEL}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5" data-testid="recipient-condensed-focus-chips">
              {RECIPIENT_CONDENSED_COMPARE_FOCUS_CHIPS.map((label) => (
                <span
                  key={label}
                  className="inline-flex rounded-full border border-slate-600/60 bg-slate-900/50 px-2.5 py-0.5 text-[10px] font-medium text-slate-300"
                >
                  {label}
                </span>
              ))}
            </div>
            <pre className="mt-4 max-h-[min(70vh,720px)] overflow-auto whitespace-pre-wrap rounded-md border border-slate-700/50 bg-white px-4 py-3 font-serif text-[13px] leading-[1.75] text-slate-900 shadow-inner">
              {proposedPlainClean}
            </pre>
          </div>
        ) : null}

        {selectedTab === "changed" ? (
          <div
            role="tabpanel"
            className="space-y-2"
            data-testid="recipient-condensed-panel-changed"
          >
            <p className="text-[11px] leading-snug text-slate-500">{RECIPIENT_NOT_RESTAT_ORIGINAL_INTRO}</p>
            {topicCards.map((c) => (
              <details
                key={c.semanticId}
                className="rounded-lg border border-slate-600/45 bg-slate-950/30 px-3 py-2"
                data-testid={`recipient-condensed-topic-card-${c.semanticId}`}
              >
                <summary className="cursor-pointer list-none text-[12px] font-semibold text-slate-100 marker:content-none hover:text-white [&::-webkit-details-marker]:hidden">
                  {c.title}
                </summary>
                <div className="mt-2 space-y-2 border-t border-slate-800/50 pt-2 text-[11px] leading-snug text-slate-300">
                  <p>
                    <span className="font-medium text-slate-200">{RECIPIENT_BUSINESS_REVIEW_WHY_DETAILS}:</span>{" "}
                    {c.whyMatters}
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="rounded-md border border-rose-900/35 bg-rose-950/20 p-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-rose-200/90">
                        {RECIPIENT_SEMANTIC_PRIOR_LABEL}
                      </p>
                      <pre className="mt-1 max-h-52 overflow-auto whitespace-pre-wrap font-sans text-[11px] leading-relaxed text-rose-50/95">
                        {c.priorExcerpt}
                      </pre>
                    </div>
                    <div className="rounded-md border border-emerald-900/35 bg-emerald-950/15 p-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-200/90">
                        {RECIPIENT_SEMANTIC_REVISED_LABEL}
                      </p>
                      <pre className="mt-1 max-h-52 overflow-auto whitespace-pre-wrap font-sans text-[11px] leading-relaxed text-emerald-50/95">
                        {c.revisedExcerpt}
                      </pre>
                    </div>
                  </div>
                  {c.hasAdvancedMarkup ? (
                    <p className="text-[10px] text-slate-500">
                      {RECIPIENT_SHOW_ADVANCED_LEGAL_MARKUP} — switch to the &quot;{RECIPIENT_CONDENSED_TAB_ADVANCED}&quot; tab for
                      insert/delete markup.
                    </p>
                  ) : null}
                </div>
              </details>
            ))}
            <details className="rounded-lg border border-slate-700/50 bg-slate-950/25 px-3 py-2">
              <summary className="cursor-pointer list-none text-[11px] font-semibold text-slate-400 marker:content-none hover:text-slate-200 [&::-webkit-details-marker]:hidden">
                {RECIPIENT_NOT_RESTAT_ORIGINAL_DETAILS_SUMMARY}
              </summary>
              <p className="mt-2 text-[11px] leading-relaxed text-slate-500">{RECIPIENT_NOT_RESTAT_ORIGINAL_FOOTNOTE}</p>
              <ul className="mt-2 list-disc space-y-0.5 pl-4 text-[11px] text-slate-400">
                {notRestatedLabels.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            </details>
          </div>
        ) : null}

        {selectedTab === "advanced" ? (
          <div role="tabpanel" className="space-y-2" data-testid="recipient-condensed-panel-advanced">
            <p className="text-[11px] leading-relaxed text-slate-500">{RECIPIENT_ADVANCED_REDLINE_INTRO}</p>
            <h3 className="text-sm font-semibold tracking-tight text-slate-200">{RECIPIENT_REDLINE_CHANGED_SECTIONS_HEADING}</h3>
            <p className="text-[11px] leading-snug text-slate-500">{RECIPIENT_REDLINE_CHANGED_WORDING_INSTRUCTION}</p>
            <div className="rounded-lg border border-slate-600/40 bg-slate-950/30 p-2 sm:p-3">
              <div
                ref={ref}
                className="max-h-[min(72vh,880px)] min-h-[40vh] overflow-y-auto rounded-md bg-slate-100/40"
                data-testid="recipient-suggested-changes-document"
              >
                <label className="mb-2 flex cursor-pointer items-center gap-2 px-1 text-[11px] text-slate-700">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 rounded border-slate-400 text-sky-700 focus:ring-sky-600"
                    checked={onlyChangedRedlineSections}
                    data-testid="recipient-redline-only-changed-toggle"
                    onChange={(e) => onOnlyChangedChange(e.target.checked)}
                  />
                  <span>
                    {RECIPIENT_ONLY_CHANGED_SECTIONS}
                    {!onlyChangedRedlineSections ? (
                      <span className="ml-1 text-slate-500">({RECIPIENT_SHOW_UNCHANGED_CONTEXT})</span>
                    ) : null}
                  </span>
                </label>
                <RecipientRedlineStickyNavigator rows={stickyNavRows} onSelectSemantic={onStickySelect} />
                <RecipientLegalRedlineDocument
                  document={legalVm}
                  variant="suggested"
                  hideUnchangedBlocks={onlyChangedRedlineSections}
                  collapseDenseMicroDiff
                  recipientNarrowIntentAnchors={recipientNarrowIntentAnchors}
                  highlightedRecipientAnchor={narrowRedlineHighlightAnchor}
                  semanticPresentation={semanticPresentation}
                  highlightedSemanticAnchor={highlightedSemanticAnchor}
                  onDenseBlockViewExactWording={onDenseExactWording}
                />
              </div>
            </div>
          </div>
        ) : null}
      </div>
    );
  },
);

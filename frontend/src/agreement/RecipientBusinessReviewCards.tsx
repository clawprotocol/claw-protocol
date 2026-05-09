import { useCallback, useId, useState } from "react";
import type { LegalRedlineDocumentViewModel } from "./legalRedlineBlocks";
import {
  businessReviewCardForSemanticId,
  businessReviewCardTitleSubline,
  extractBusinessReviewCardPreviewExcerpt,
  extractFocusedWordingForSemanticId,
  friendlyChipToSemanticId,
  type BusinessReviewSemanticId,
} from "./recipientBusinessReviewCardsModel";
import {
  RECIPIENT_BUSINESS_REVIEW_PREVIEW_WORDING,
  RECIPIENT_BUSINESS_REVIEW_PREVIEW_WORDING_HINT,
  RECIPIENT_BUSINESS_REVIEW_SUGGESTED_EDITS_HEADING,
} from "./portableReviewCopy";

export type RecipientBusinessReviewCardsProps = {
  chips: readonly string[];
  legalVm: LegalRedlineDocumentViewModel;
  onViewExactWording: (payload: { sectionTitle: string; oldText: string; newText: string }) => void;
};

/**
 * Section-style cards for Business Review Mode (before Audit mode redline).
 * Desktop: hover/focus shows detail popover. Mobile: opens same content in a bottom sheet.
 */
export function RecipientBusinessReviewCards({ chips, legalVm, onViewExactWording }: RecipientBusinessReviewCardsProps) {
  const seen = new Set<string>();
  const rows: { chip: string; id: BusinessReviewSemanticId }[] = [];
  for (const c of chips) {
    const t = c.trim();
    if (!t) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    rows.push({ chip: t, id: friendlyChipToSemanticId(t) });
  }
  const [mobileSheetId, setMobileSheetId] = useState<BusinessReviewSemanticId | null>(null);
  const sheetTitleId = useId();

  const openPreviewSheet = useCallback((id: BusinessReviewSemanticId) => {
    setMobileSheetId(id);
  }, []);

  const closePreviewSheet = useCallback(() => {
    setMobileSheetId(null);
  }, []);

  if (rows.length === 0) return null;

  return (
    <div className="mt-4 space-y-3" data-testid="recipient-business-review-cards">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        {RECIPIENT_BUSINESS_REVIEW_SUGGESTED_EDITS_HEADING}
      </p>
      {rows.map(({ chip, id }) => {
        const card = businessReviewCardForSemanticId(id, chip);
        const subline = businessReviewCardTitleSubline(card);
        const excerpt = extractBusinessReviewCardPreviewExcerpt(legalVm, id);
        const detailBody = (
          <div className="space-y-2 text-left text-[11px] leading-snug text-slate-200">
            <p>
              <span className="font-semibold text-slate-300">What changed:</span> {card.title}
            </p>
            <p>
              <span className="font-semibold text-slate-300">Why this matters:</span> {card.whyMatters}
            </p>
            <p>
              <span className="font-semibold text-slate-300">Risk:</span> {card.riskImpact}{" "}
              <span className="font-semibold text-slate-300">Business effect:</span> {card.businessEffect}
            </p>
            {excerpt ? (
              <p className="rounded border border-slate-700/60 bg-slate-900/80 px-2 py-1.5 font-mono text-[10px] text-slate-300">
                {excerpt}
              </p>
            ) : null}
          </div>
        );

        return (
          <article
            key={chip}
            className="group relative rounded-lg border border-slate-600/50 bg-slate-950/45 px-3 py-2.5 shadow-sm"
            data-testid={`recipient-business-review-card-${card.id}`}
          >
            <div
              tabIndex={0}
              className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60"
              data-testid={`recipient-business-review-card-focus-root-${card.id}`}
            >
              <h4 className="text-[13px] font-semibold text-slate-50">{card.title}</h4>
              <p className="mt-0.5 text-[11px] leading-snug text-slate-400" data-testid={`recipient-business-review-card-subline-${card.id}`}>
                {subline}
              </p>
              <dl className="mt-2 space-y-1.5 text-[11px] leading-snug text-slate-300">
                <div>
                  <dt className="font-medium text-slate-400">Why this matters</dt>
                  <dd>{card.whyMatters}</dd>
                </div>
                <div>
                  <dt className="font-medium text-slate-400">Risk impact</dt>
                  <dd>{card.riskImpact}</dd>
                </div>
                <div>
                  <dt className="font-medium text-slate-400">Business effect</dt>
                  <dd>{card.businessEffect}</dd>
                </div>
              </dl>

              {/* Desktop / tablet: hover + keyboard focus popover */}
              <div
                role="tooltip"
                data-testid={`recipient-business-review-card-popover-${card.id}`}
                className="pointer-events-none invisible absolute left-0 right-0 top-full z-30 mt-1 hidden max-h-[min(70vh,22rem)] overflow-y-auto rounded-lg border border-slate-600/90 bg-slate-900/98 p-3 text-left opacity-0 shadow-xl ring-1 ring-slate-700/50 transition-opacity duration-150 sm:left-auto sm:right-0 sm:min-w-[18rem] sm:max-w-[22rem] md:block md:group-hover:visible md:group-hover:pointer-events-auto md:group-hover:opacity-100 md:group-focus-within:visible md:group-focus-within:pointer-events-auto md:group-focus-within:opacity-100"
              >
                {detailBody}
              </div>
            </div>

            <div className="mt-2.5 flex flex-col gap-0.5">
              <button
                type="button"
                className="text-left text-[11px] font-semibold text-sky-300 underline decoration-sky-700/60 underline-offset-2 hover:text-sky-200"
                data-testid="recipient-business-review-view-wording"
                onClick={() => {
                  const w = extractFocusedWordingForSemanticId(legalVm, id);
                  if (!w) return;
                  onViewExactWording({
                    sectionTitle: `${card.title} — ${w.sectionLabel}`,
                    oldText: w.oldText,
                    newText: w.newText,
                  });
                }}
              >
                {RECIPIENT_BUSINESS_REVIEW_PREVIEW_WORDING}
              </button>
              <span className="text-[10px] leading-snug text-slate-500">{RECIPIENT_BUSINESS_REVIEW_PREVIEW_WORDING_HINT}</span>
            </div>

            {/* Mobile / coarse pointer: compact sheet */}
            <button
              type="button"
              className="mt-2 w-full rounded-md border border-slate-700/60 bg-slate-900/50 py-2 text-center text-[11px] font-semibold text-sky-200 hover:bg-slate-900/80 md:hidden"
              data-testid={`recipient-business-review-card-mobile-preview-${card.id}`}
              onClick={() => openPreviewSheet(id)}
            >
              Preview details
            </button>
          </article>
        );
      })}

      {mobileSheetId ? (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-black/55 md:hidden"
          role="presentation"
          data-testid="recipient-business-review-card-mobile-sheet-backdrop"
          onClick={closePreviewSheet}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={sheetTitleId}
            className="max-h-[78vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-slate-600 bg-slate-950 p-4 shadow-2xl"
            data-testid="recipient-business-review-card-mobile-sheet"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 id={sheetTitleId} className="text-sm font-semibold text-slate-100">
                {rows.find((r) => r.id === mobileSheetId)?.chip ?? "Change"}
              </h2>
              <button
                type="button"
                className="rounded-md px-2 py-1 text-xs font-medium text-slate-400 hover:bg-slate-800 hover:text-white"
                onClick={closePreviewSheet}
              >
                Close
              </button>
            </div>
            {(() => {
              const row = rows.find((r) => r.id === mobileSheetId);
              if (!row) return null;
              const c = businessReviewCardForSemanticId(row.id, row.chip);
              const ex = extractBusinessReviewCardPreviewExcerpt(legalVm, row.id);
              return (
                <div className="space-y-2 text-[11px] leading-snug text-slate-200">
                  <p>
                    <span className="font-semibold text-slate-300">What changed:</span> {c.title}
                  </p>
                  <p>
                    <span className="font-semibold text-slate-300">Why this matters:</span> {c.whyMatters}
                  </p>
                  <p>
                    <span className="font-semibold text-slate-300">Risk:</span> {c.riskImpact}{" "}
                    <span className="font-semibold text-slate-300">Business effect:</span> {c.businessEffect}
                  </p>
                  {ex ? (
                    <p className="rounded border border-slate-700/60 bg-slate-900/80 px-2 py-1.5 font-mono text-[10px] text-slate-300">
                      {ex}
                    </p>
                  ) : null}
                </div>
              );
            })()}
          </div>
        </div>
      ) : null}
    </div>
  );
}

import { useCallback, useEffect, useId, useState } from "react";
import type { LegalRedlineDocumentViewModel } from "./legalRedlineBlocks";
import {
  businessReviewCardForSemanticId,
  businessReviewCardTitleSubline,
  extractBusinessReviewCardPreviewExcerpt,
  extractStrongFocusedWordingForSemanticId,
  friendlyChipToSemanticId,
  getFocusedWordingPickForSemanticId,
  type BusinessReviewSemanticId,
} from "./recipientBusinessReviewCardsModel";
import {
  RECIPIENT_BUSINESS_REVIEW_CARD_WEAK_WORLING_LINE,
  RECIPIENT_BUSINESS_REVIEW_PREVIEW_WORDING,
  RECIPIENT_BUSINESS_REVIEW_PREVIEW_WORDING_HINT,
  RECIPIENT_BUSINESS_REVIEW_SHOW_CHANGED_WORDING_IN_REDLINE,
  RECIPIENT_BUSINESS_REVIEW_SHOW_CHANGED_WORDING_IN_REDLINE_HINT,
  RECIPIENT_BUSINESS_REVIEW_SUGGESTED_EDITS_HEADING,
  RECIPIENT_BUSINESS_REVIEW_WHY_DETAILS,
} from "./portableReviewCopy";

export type RecipientBusinessReviewCardsProps = {
  chips: readonly string[];
  legalVm: LegalRedlineDocumentViewModel;
  onViewExactWording: (payload: { sectionTitle: string; oldText: string; newText: string }) => void;
  /** Opens the collapsed full legal redline section in the parent panel. */
  onOpenFullRedline?: () => void;
  /** Scrolls to the best-matching block inside the opened redline (full-doc mode). */
  onNavigateSemanticInRedline?: (
    semanticId: BusinessReviewSemanticId,
    meta?: { cardTitle?: string; chipLabel?: string },
  ) => void | Promise<void>;
};

/**
 * Section-style cards for Business Review Mode (before the full legal redline).
 * Desktop: explicit "Details" toggle (click / keyboard / focus). Mobile: bottom sheet.
 */
export function RecipientBusinessReviewCards({
  chips,
  legalVm,
  onViewExactWording,
  onOpenFullRedline,
  onNavigateSemanticInRedline,
}: RecipientBusinessReviewCardsProps) {
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
  const [expandedDesktopId, setExpandedDesktopId] = useState<BusinessReviewSemanticId | null>(null);
  const sheetTitleId = useId();

  const openPreviewSheet = useCallback((id: BusinessReviewSemanticId) => {
    setMobileSheetId(id);
  }, []);

  const closePreviewSheet = useCallback(() => {
    setMobileSheetId(null);
  }, []);

  useEffect(() => {
    if (!expandedDesktopId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpandedDesktopId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expandedDesktopId]);

  if (rows.length === 0) return null;

  return (
    <div className="mt-4 space-y-2.5" data-testid="recipient-business-review-cards">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        {RECIPIENT_BUSINESS_REVIEW_SUGGESTED_EDITS_HEADING}
      </p>
      {rows.map(({ chip, id }) => {
        const card = businessReviewCardForSemanticId(id, chip);
        const subline = businessReviewCardTitleSubline(card);
        const pick = getFocusedWordingPickForSemanticId(legalVm, id);
        const strongWording = extractStrongFocusedWordingForSemanticId(legalVm, id);
        const excerpt = extractBusinessReviewCardPreviewExcerpt(legalVm, id);
        const showPreviewCta = Boolean(strongWording);
        const detailBody = (
          <div className="space-y-2 text-left text-[11px] leading-snug text-slate-200">
            <p>
              <span className="font-medium text-slate-300">Why this matters:</span> {card.whyMatters}
            </p>
            <p className="text-slate-400">
              <span className="font-medium text-slate-300">Commercial:</span> {card.businessEffect}
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
            className="relative rounded-lg border border-slate-600/50 bg-slate-950/45 px-3 py-2 shadow-sm"
            data-testid={`recipient-business-review-card-${card.id}`}
          >
            <div className="rounded-md outline-none focus-within:ring-2 focus-within:ring-sky-500/40" data-testid={`recipient-business-review-card-focus-root-${card.id}`}>
              <h4 className="text-[13px] font-semibold text-slate-50">{card.title}</h4>
              <p
                className="mt-0.5 text-[11px] leading-snug text-slate-400"
                data-testid={`recipient-business-review-card-subline-${card.id}`}
              >
                {subline}
              </p>
              <p className="mt-1 text-[11px] text-slate-500" data-testid={`recipient-business-review-card-risk-${card.id}`}>
                Risk: {card.riskImpact}
              </p>
              {pick.quality === "weak" && pick.wording ? (
                <p className="mt-1.5 text-[10px] leading-snug text-slate-500" data-testid={`recipient-business-review-card-weak-mapping-${card.id}`}>
                  {RECIPIENT_BUSINESS_REVIEW_CARD_WEAK_WORLING_LINE}
                </p>
              ) : null}

              <button
                type="button"
                className="mt-2 hidden w-full rounded-md border border-slate-700/55 bg-slate-900/40 px-2 py-1.5 text-left text-[11px] font-semibold text-sky-200 hover:bg-slate-900/70 md:block"
                aria-expanded={expandedDesktopId === id}
                data-testid={`recipient-business-review-card-popover-${card.id}`}
                onClick={() => setExpandedDesktopId((cur) => (cur === id ? null : id))}
              >
                {RECIPIENT_BUSINESS_REVIEW_WHY_DETAILS}
              </button>
              {expandedDesktopId === id ? (
                <div
                  className="mt-2 hidden max-h-[min(70vh,18rem)] overflow-y-auto rounded-md border border-slate-700/60 bg-slate-900/95 p-3 shadow-inner md:block"
                  data-testid={`recipient-business-review-card-detail-panel-${card.id}`}
                >
                  {detailBody}
                </div>
              ) : null}
            </div>

            <div className="mt-2 flex flex-col gap-0.5">
              {showPreviewCta && strongWording ? (
                <>
                  <button
                    type="button"
                    className="text-left text-[11px] font-semibold text-sky-300 underline decoration-sky-700/60 underline-offset-2 hover:text-sky-200"
                    data-testid="recipient-business-review-view-wording"
                    onClick={() => {
                      onViewExactWording({
                        sectionTitle: `${card.title} — ${strongWording.sectionLabel}`,
                        oldText: strongWording.oldText,
                        newText: strongWording.newText,
                      });
                    }}
                  >
                    {RECIPIENT_BUSINESS_REVIEW_PREVIEW_WORDING}
                  </button>
                  <span className="text-[10px] leading-snug text-slate-500">{RECIPIENT_BUSINESS_REVIEW_PREVIEW_WORDING_HINT}</span>
                </>
              ) : onOpenFullRedline ? (
                <>
                  <button
                    type="button"
                    className="w-full rounded-md border border-sky-800/40 bg-sky-950/30 px-2 py-1.5 text-left text-[11px] font-semibold text-sky-200 hover:bg-sky-950/55"
                    data-testid="recipient-business-review-show-changed-wording"
                    onClick={async () => {
                      onOpenFullRedline?.();
                      if (onNavigateSemanticInRedline) await onNavigateSemanticInRedline(id, { cardTitle: card.title });
                    }}
                  >
                    {RECIPIENT_BUSINESS_REVIEW_SHOW_CHANGED_WORDING_IN_REDLINE}
                  </button>
                  <span className="text-[10px] leading-snug text-slate-500">
                    {RECIPIENT_BUSINESS_REVIEW_SHOW_CHANGED_WORDING_IN_REDLINE_HINT}
                  </span>
                </>
              ) : null}
            </div>

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
                    <span className="font-medium text-slate-300">Why this matters:</span> {c.whyMatters}
                  </p>
                  <p className="text-slate-400">
                    <span className="font-medium text-slate-300">Risk:</span> {c.riskImpact}
                  </p>
                  <p className="text-slate-400">
                    <span className="font-medium text-slate-300">Commercial:</span> {c.businessEffect}
                  </p>
                  {ex ? (
                    <p className="rounded border border-slate-700/60 bg-slate-900/80 px-2 py-1.5 font-mono text-[10px] text-slate-300">
                      {ex}
                    </p>
                  ) : null}
                  {onOpenFullRedline && onNavigateSemanticInRedline && mobileSheetId ? (
                    <button
                      type="button"
                      className="mt-3 w-full rounded-md border border-sky-800/45 bg-sky-950/35 px-3 py-2 text-center text-[11px] font-semibold text-sky-200 hover:bg-sky-950/55"
                      data-testid="recipient-business-review-mobile-show-changed-wording"
                      onClick={async () => {
                        const row = rows.find((r) => r.id === mobileSheetId);
                        onOpenFullRedline();
                        if (row) {
                          const c = businessReviewCardForSemanticId(row.id, row.chip);
                          await onNavigateSemanticInRedline(row.id, { cardTitle: c.title });
                        }
                        closePreviewSheet();
                      }}
                    >
                      {RECIPIENT_BUSINESS_REVIEW_SHOW_CHANGED_WORDING_IN_REDLINE}
                    </button>
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

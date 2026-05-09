import type { LegalRedlineDocumentViewModel } from "./legalRedlineBlocks";
import {
  businessReviewCardForSemanticId,
  extractFocusedWordingForSemanticId,
  friendlyChipToSemanticId,
  type BusinessReviewSemanticId,
} from "./recipientBusinessReviewCardsModel";
import { RECIPIENT_BUSINESS_REVIEW_VIEW_EXACT_WORDING } from "./portableReviewCopy";

export type RecipientBusinessReviewCardsProps = {
  chips: readonly string[];
  legalVm: LegalRedlineDocumentViewModel;
  onViewExactWording: (payload: { sectionTitle: string; oldText: string; newText: string }) => void;
};

/**
 * Section-style cards for Business Review Mode (before Audit mode redline).
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
  if (rows.length === 0) return null;

  return (
    <div className="mt-4 space-y-3" data-testid="recipient-business-review-cards">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Most important changes</p>
      {rows.map(({ chip, id }) => {
        const card = businessReviewCardForSemanticId(id, chip);
        return (
          <article
            key={chip}
            className="rounded-lg border border-slate-600/50 bg-slate-950/45 px-3 py-2.5 shadow-sm"
            data-testid={`recipient-business-review-card-${card.id}`}
          >
            <h4 className="text-[13px] font-semibold text-slate-50">{card.title}</h4>
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
            <button
              type="button"
              className="mt-2.5 text-left text-[11px] font-semibold text-sky-300 underline decoration-sky-700/60 underline-offset-2 hover:text-sky-200"
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
              {RECIPIENT_BUSINESS_REVIEW_VIEW_EXACT_WORDING}
            </button>
          </article>
        );
      })}
    </div>
  );
}

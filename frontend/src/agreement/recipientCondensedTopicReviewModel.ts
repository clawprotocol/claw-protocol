import { escapeHtml } from "../components/agreements/premiumAgreementDocumentHtml";
import type { LegalRedlineDocumentViewModel } from "./legalRedlineBlocks";
import { RECIPIENT_SEMANTIC_PRIOR_LABEL, RECIPIENT_SEMANTIC_REVISED_LABEL } from "./portableReviewCopy";
import {
  businessReviewCardForSemanticId,
  friendlyChipToSemanticId,
  getFocusedWordingPickForSemanticId,
  getScrollTargetBlockIdForSemanticOrFallback,
  type BusinessReviewSemanticId,
} from "./recipientBusinessReviewCardsModel";
import { extractOriginalPlainExcerptForSemanticTopic } from "./recipientCondensedDraftSemanticMap";
import { recipientBlockEligibleForAdvancedLegalMarkup } from "./recipientWholeDocSemanticRender";

export type CondensedTopicReviewCardModel = {
  semanticId: BusinessReviewSemanticId;
  title: string;
  whyMatters: string;
  priorExcerpt: string;
  revisedExcerpt: string;
  hasAdvancedMarkup: boolean;
};

const PRIORITY: BusinessReviewSemanticId[] = [
  "payment_terms",
  "scope",
  "ownership",
  "third_party",
  "acceptance",
  "timeline_protections",
  "term_timing",
  "generic",
];

function truncate(s: string, max: number): string {
  const t = String(s ?? "").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trim()}…`;
}

/**
 * Topic-level before/after cards for condensed clean-revision review (in-page).
 */
export function buildCondensedTopicReviewCards(
  vm: LegalRedlineDocumentViewModel,
  currentPlain: string,
  chips: readonly string[],
): CondensedTopicReviewCardModel[] {
  const chipRows: { id: BusinessReviewSemanticId; chip: string }[] = [];
  const seenChip = new Set<string>();
  for (const c of chips) {
    const t = c.trim();
    if (!t) continue;
    const k = t.toLowerCase();
    if (seenChip.has(k)) continue;
    seenChip.add(k);
    chipRows.push({ id: friendlyChipToSemanticId(t), chip: t });
  }

  const ordered: { id: BusinessReviewSemanticId; chip: string }[] = [];
  for (const p of PRIORITY) {
    const hit = chipRows.find((r) => r.id === p);
    if (hit && !ordered.some((o) => o.id === hit.id)) ordered.push(hit);
  }
  for (const r of chipRows) {
    if (!ordered.some((o) => o.id === r.id)) ordered.push(r);
  }

  const out: CondensedTopicReviewCardModel[] = [];
  const used = new Set<BusinessReviewSemanticId>();
  for (const { id, chip } of ordered) {
    if (used.has(id)) continue;
    const card = businessReviewCardForSemanticId(id, chip);
    const prior = extractOriginalPlainExcerptForSemanticTopic(currentPlain, id, 1000);
    const pick = getFocusedWordingPickForSemanticId(vm, id);
    const w = pick.wording;
    const revised = w ? truncate(w.newText, 900) : "";
    if (!prior.trim() && !revised.trim()) continue;
    used.add(id);
    const bid = getScrollTargetBlockIdForSemanticOrFallback(vm, id);
    const blk = bid ? vm.blocks.find((b) => b.id === bid) : null;
    const hasAdvancedMarkup = blk ? recipientBlockEligibleForAdvancedLegalMarkup(blk) : false;
    out.push({
      semanticId: id,
      title: card.title,
      whyMatters: card.whyMatters,
      priorExcerpt: prior.trim() || "—",
      revisedExcerpt: revised.trim() || "—",
      hasAdvancedMarkup,
    });
  }
  for (const id of PRIORITY) {
    if (used.has(id)) continue;
    const chip = id.replace(/_/g, " ");
    const card = businessReviewCardForSemanticId(id, chip);
    const prior = extractOriginalPlainExcerptForSemanticTopic(currentPlain, id, 1000);
    const pick = getFocusedWordingPickForSemanticId(vm, id);
    const w = pick.wording;
    const revised = w ? truncate(w.newText, 900) : "";
    if (!prior.trim() && !revised.trim()) continue;
    used.add(id);
    const bid = getScrollTargetBlockIdForSemanticOrFallback(vm, id);
    const blk = bid ? vm.blocks.find((b) => b.id === bid) : null;
    const hasAdvancedMarkup = blk ? recipientBlockEligibleForAdvancedLegalMarkup(blk) : false;
    out.push({
      semanticId: id,
      title: card.title,
      whyMatters: card.whyMatters,
      priorExcerpt: prior.trim() || "—",
      revisedExcerpt: revised.trim() || "—",
      hasAdvancedMarkup,
    });
  }
  return out.slice(0, 8);
}

/** Escaped HTML sections for condensed redline PDF export. */
export function buildCondensedTopicReviewCardsPdfHtml(cards: readonly CondensedTopicReviewCardModel[]): string {
  return cards
    .map(
      (c) => `<section style="margin:0 0 16px;padding:14px 16px;border:1px solid #e2e8f0;border-radius:8px;background:#ffffff;">
<p style="margin:0 0 8px;font-size:14px;font-weight:600;color:#0f172a;">${escapeHtml(c.title)}</p>
<p style="margin:0 0 12px;font-size:12px;color:#475569;line-height:1.55;">${escapeHtml(c.whyMatters)}</p>
<p style="margin:0 0 4px;font-size:10px;font-weight:600;color:#64748b;letter-spacing:0.04em;text-transform:uppercase;">${escapeHtml(
        RECIPIENT_SEMANTIC_PRIOR_LABEL,
      )}</p>
<pre style="margin:0 0 12px;font:13px/1.65 Georgia,serif;white-space:pre-wrap;color:#334155;">${escapeHtml(c.priorExcerpt)}</pre>
<p style="margin:0 0 4px;font-size:10px;font-weight:600;color:#065f46;letter-spacing:0.04em;text-transform:uppercase;">${escapeHtml(
        RECIPIENT_SEMANTIC_REVISED_LABEL,
      )}</p>
<pre style="margin:0;font:13px/1.65 Georgia,serif;white-space:pre-wrap;color:#064e3b;">${escapeHtml(c.revisedExcerpt)}</pre>
</section>`,
    )
    .join("");
}

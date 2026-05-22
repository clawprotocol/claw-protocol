/**
 * Visible causality for guided Pro answers — queued updates, then one authoritative apply.
 */

import { resolveGuidedQuestionConfig } from "./guidedQuestionConfig";
import { resolveGuidedQuestionTarget } from "./guidedRevisionAnchors";
import { highlightGuidedSectionInDocument, highlightAllGuidedChangedSections } from "./guidedSectionScroll";
import { assessGuidedMutationStrength } from "./guidedMutationQuality";

const PENDING_BADGE_CLASS = "guided-pending-update-badge";
const PENDING_STYLE_ID = "guided-pending-update-style";

export type GuidedAnswerCausalityPhase = "queued" | "applied";

export type GuidedAnswerCausalityPayload = {
  variableId: string;
  displayAnswer: string;
  phase: GuidedAnswerCausalityPhase;
  previousAnswer?: string | null;
};

function ensurePendingBadgeStyles(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById(PENDING_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = PENDING_STYLE_ID;
  style.textContent = `
.premium-readonly-doc .${PENDING_BADGE_CLASS} {
  display: inline-block;
  margin: 0.35rem 0 0.65rem;
  padding: 0.2rem 0.55rem;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: #92400e;
  background: rgba(254, 243, 199, 0.92);
  border: 1px solid rgba(180, 83, 9, 0.35);
  animation: guided-pending-pulse 1.4s ease-in-out 2;
}
@keyframes guided-pending-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.55; }
}
`;
  document.head.appendChild(style);
}

function injectQueuedBadge(target: ReturnType<typeof resolveGuidedQuestionTarget>, areaLabel: string): void {
  if (typeof document === "undefined") return;
  ensurePendingBadgeStyles();
  const root = document.querySelector(".premium-readonly-doc");
  if (!root) return;
  for (const h2 of root.querySelectorAll("h2")) {
    const text = (h2.textContent || "").trim();
    if (!text) continue;
    const match =
      target.headingPatterns.some((p) => p.test(text)) ||
      (target.sectionNumber != null && new RegExp(`^${target.sectionNumber}\\.`).test(text));
    if (!match) continue;
    const existing = h2.parentElement?.querySelector(`.${PENDING_BADGE_CLASS}`);
    if (existing) existing.remove();
    const badge = document.createElement("span");
    badge.className = PENDING_BADGE_CLASS;
    badge.setAttribute("data-guided-causality", "queued");
    badge.textContent = `Queued · ${areaLabel}`;
    h2.insertAdjacentElement("afterend", badge);
    window.setTimeout(() => badge.remove(), 6000);
    return;
  }
}

export function formatGuidedQueuedToast(variableId: string): string {
  const area = resolveGuidedQuestionConfig(variableId).finalAppliedAreaLabel;
  return `Queued update · ${area}`;
}

export function formatGuidedAuthoritativeUpdatedToast(): string {
  return "Agreement updated";
}

export function extractGuidedNumericTransition(
  previousAnswer: string | null | undefined,
  displayAnswer: string,
): { label: string; before: string; after: string } | null {
  const prev = (previousAnswer || "").trim();
  const next = (displayAnswer || "").trim();
  if (!next) return null;
  const money = /\$[\d,]+(?:\.\d{2})?|\b\d{1,3}(?:,\d{3})+\b|\b\d{4,}\b/i;
  if (!money.test(next) && !money.test(prev)) return null;
  if (!prev || prev === next) return null;
  return { label: "Fee / amount", before: prev.slice(0, 80), after: next.slice(0, 80) };
}

/** Queued update — anticipation only, no live mutation implied. */
export function reinforceGuidedQueuedUpdate(payload: GuidedAnswerCausalityPayload): {
  toast: string;
  areaLabel: string;
  numericTransition: ReturnType<typeof extractGuidedNumericTransition>;
} {
  const target = resolveGuidedQuestionTarget(payload.variableId);
  const areaLabel = resolveGuidedQuestionConfig(payload.variableId).finalAppliedAreaLabel;
  const toast = formatGuidedQueuedToast(payload.variableId);
  const numericTransition = extractGuidedNumericTransition(payload.previousAnswer, payload.displayAnswer);

  window.requestAnimationFrame(() => {
    highlightGuidedSectionInDocument(target, { mode: "queued", scroll: false });
    injectQueuedBadge(target, areaLabel);
  });

  return { toast, areaLabel, numericTransition };
}

export type GuidedAuthoritativeApplyResult = {
  toast: string;
  areas: string[];
  highlightResults: ReturnType<typeof highlightAllGuidedChangedSections>;
};

/** Authoritative apply moment — full highlight pass + logging. */
export function reinforceGuidedAuthoritativeApply(args: {
  variableIds: readonly string[];
  preBodyLen: number;
  postBodyLen: number;
  preBody?: string;
  postBody?: string;
}): GuidedAuthoritativeApplyResult {
  const areas = [...new Set(args.variableIds.map((id) => resolveGuidedQuestionConfig(id).finalAppliedAreaLabel))];
  const answeredIds = args.variableIds.filter((id) => id.trim());

  // eslint-disable-next-line no-console
  console.info("[guided-authoritative-apply]", {
    preBodyLen: args.preBodyLen,
    postBodyLen: args.postBodyLen,
    delta: args.postBodyLen - args.preBodyLen,
    changedClauseCount: areas.length,
  });

  const highlightResults = highlightAllGuidedChangedSections(answeredIds);
  const renderedCount = highlightResults.filter((r) => r.rendered).length;

  if (args.preBody != null && args.postBody != null) {
    assessGuidedMutationStrength({
      preBody: args.preBody,
      postBody: args.postBody,
      changedSectionCount: areas.length,
      renderedMarkerCount: renderedCount,
    });
  }

  // eslint-disable-next-line no-console
  console.info("[guided-authoritative-apply-complete]", {
    visibleMutationMarkersRendered: renderedCount,
    changedSectionIds: highlightResults.filter((r) => r.rendered).map((r) => r.variableId),
  });

  window.requestAnimationFrame(() => {
    const doc = document.querySelector(".premium-readonly-doc");
    doc?.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  return {
    toast: formatGuidedAuthoritativeUpdatedToast(),
    areas,
    highlightResults,
  };
}

/** @deprecated Use reinforceGuidedQueuedUpdate / reinforceGuidedAuthoritativeApply */
export function reinforceGuidedAnswerCausality(payload: GuidedAnswerCausalityPayload): {
  toast: string;
  numericTransition: ReturnType<typeof extractGuidedNumericTransition>;
} {
  const r = reinforceGuidedQueuedUpdate(payload);
  return { toast: r.toast, numericTransition: r.numericTransition };
}

export function reinforceGuidedBulkApplyCausality(_variableIds?: readonly string[]): string {
  return formatGuidedAuthoritativeUpdatedToast();
}

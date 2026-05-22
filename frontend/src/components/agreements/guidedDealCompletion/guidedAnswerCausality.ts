/**
 * Visible causality for guided Pro answers — highlight, toast, pending badges (collect-all UX).
 */

import { resolveGuidedQuestionConfig } from "./guidedQuestionConfig";
import { resolveGuidedQuestionTarget } from "./guidedRevisionAnchors";
import { highlightGuidedSectionInDocument } from "./guidedSectionScroll";

const PENDING_BADGE_CLASS = "guided-pending-update-badge";
const PENDING_STYLE_ID = "guided-pending-update-style";

export type GuidedAnswerCausalityPhase = "queued" | "applied";

export type GuidedAnswerCausalityPayload = {
  variableId: string;
  displayAnswer: string;
  phase: GuidedAnswerCausalityPhase;
  /** Prior answer text when re-saving the same question. */
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
.guided-applied-update-badge {
  display: inline-block;
  margin: 0.35rem 0 0.65rem;
  padding: 0.2rem 0.55rem;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 600;
  color: #065f46;
  background: rgba(209, 250, 229, 0.95);
  border: 1px solid rgba(5, 150, 105, 0.35);
}
`;
  document.head.appendChild(style);
}

function injectSectionBadge(
  target: ReturnType<typeof resolveGuidedQuestionTarget>,
  label: string,
  className: string,
  ttlMs: number,
): void {
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
    const existing = h2.parentElement?.querySelector(`.${className}`);
    if (existing) existing.remove();
    const badge = document.createElement("span");
    badge.className = className;
    badge.setAttribute("data-guided-causality", "true");
    badge.textContent = label;
    h2.insertAdjacentElement("afterend", badge);
    window.setTimeout(() => badge.remove(), ttlMs);
    return;
  }
}

export function formatGuidedAgreementUpdatedToast(variableId: string, phase: GuidedAnswerCausalityPhase): string {
  const area = resolveGuidedQuestionConfig(variableId).finalAppliedAreaLabel;
  if (phase === "queued") return `Will update: ${area}`;
  return `Agreement updated: ${area}`;
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

/** Reinforce that the user's answer connects to a specific agreement section. */
export function reinforceGuidedAnswerCausality(payload: GuidedAnswerCausalityPayload): {
  toast: string;
  numericTransition: ReturnType<typeof extractGuidedNumericTransition>;
} {
  const target = resolveGuidedQuestionTarget(payload.variableId);
  const toast = formatGuidedAgreementUpdatedToast(payload.variableId, payload.phase);
  const numericTransition = extractGuidedNumericTransition(payload.previousAnswer, payload.displayAnswer);

  window.requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      highlightGuidedSectionInDocument(target);
      const badgeLabel =
        payload.phase === "queued" ? "Will update from your answer" : "Updated from your answer";
      injectSectionBadge(
        target,
        badgeLabel,
        payload.phase === "queued" ? PENDING_BADGE_CLASS : "guided-applied-update-badge",
        payload.phase === "queued" ? 8000 : 6000,
      );
      const doc = document.querySelector(".premium-readonly-doc");
      if (doc && typeof doc.scrollIntoView === "function") {
        const mobile = window.matchMedia("(max-width: 640px)").matches;
        if (mobile) doc.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  });

  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.info("[guided-answer-causality]", {
      variableId: payload.variableId,
      phase: payload.phase,
      toast,
      hasNumericTransition: Boolean(numericTransition),
    });
  }
  return { toast, numericTransition };
}

/** After bulk apply — highlight each answered section. */
export function reinforceGuidedBulkApplyCausality(variableIds: readonly string[]): string {
  const areas = variableIds.map((id) => resolveGuidedQuestionConfig(id).finalAppliedAreaLabel);
  const unique = [...new Set(areas)];
  for (const id of variableIds) {
    reinforceGuidedAnswerCausality({ variableId: id, displayAnswer: "", phase: "applied" });
  }
  const toast =
    unique.length === 1
      ? `Agreement updated: ${unique[0]}`
      : `Agreement updated: ${unique.slice(0, 3).join(", ")}${unique.length > 3 ? "…" : ""}`;
  return toast;
}

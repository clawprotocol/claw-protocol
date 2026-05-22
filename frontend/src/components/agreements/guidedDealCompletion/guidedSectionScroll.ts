/**
 * Scroll preservation and section highlight for guided Pro completion.
 */

import {
  GUIDED_CHECKLIST_SECTION_HEADING_FALLBACKS,
  type GuidedAppliedChecklistLabel,
} from "./guidedAppliedSummaryChecklist";
import { resolveGuidedQuestionTarget, type GuidedRevisionTarget } from "./guidedRevisionAnchors";

const HIGHLIGHT_CLASS = "guided-section-highlight";
const APPLIED_CLASS = "guided-section-applied";
const APPLIED_BODY_CLASS = "guided-section-body-applied";
const HIGHLIGHT_STYLE_ID = "guided-section-highlight-style";
const APPLIED_FADE_MS = 5200;
const SCROLL_TOP_OFFSET_PX = 72;

function ensureHighlightStyles(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById(HIGHLIGHT_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = HIGHLIGHT_STYLE_ID;
  style.textContent = `
.premium-readonly-doc h2.guided-section-scroll-target {
  scroll-margin-top: ${SCROLL_TOP_OFFSET_PX}px;
}
.premium-readonly-doc .${HIGHLIGHT_CLASS},
.premium-readonly-doc h2.${HIGHLIGHT_CLASS} {
  background: rgba(254, 243, 199, 0.65) !important;
  box-shadow: inset 0 0 0 2px rgba(180, 83, 9, 0.5);
  animation: guided-section-pulse 1.2s ease-in-out 2;
  transition: background 0.3s ease, box-shadow 0.3s ease;
}
.premium-readonly-doc .${APPLIED_CLASS},
.premium-readonly-doc h2.${APPLIED_CLASS} {
  background: rgba(209, 250, 229, 0.55) !important;
  border-left: 4px solid rgba(5, 150, 105, 0.85) !important;
  padding-left: 0.4rem !important;
  margin-left: -0.4rem;
  box-shadow: inset 0 0 0 1px rgba(5, 150, 105, 0.3);
  animation: guided-applied-pulse 1.4s ease-in-out 3;
  transition: background 0.4s ease, border-color 0.4s ease;
}
.premium-readonly-doc .${APPLIED_BODY_CLASS} {
  background: linear-gradient(90deg, rgba(209, 250, 229, 0.42), rgba(209, 250, 229, 0.08)) !important;
  border-radius: 0.2rem;
  transition: background 1.2s ease;
}
.premium-readonly-doc .guided-heading-updated-pill {
  display: inline-flex;
  align-items: center;
  margin-left: 0.45rem;
  padding: 0.1rem 0.45rem;
  border-radius: 999px;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #065f46;
  background: rgba(167, 243, 208, 0.95);
  border: 1px solid rgba(5, 150, 105, 0.4);
  vertical-align: middle;
}
.premium-readonly-doc .guided-applied-update-badge {
  display: block;
  margin: 0.25rem 0 0.5rem;
  font-size: 10px;
  font-weight: 600;
  color: #047857;
}
.premium-readonly-doc .guided-applied-just-now {
  display: inline;
  margin-left: 0.35rem;
  font-size: 9px;
  font-weight: 500;
  color: #059669;
  opacity: 0.9;
}
@media (max-width: 640px) {
  .premium-readonly-doc .${APPLIED_CLASS},
  .premium-readonly-doc h2.${APPLIED_CLASS} {
    border-left-width: 5px !important;
  }
  .premium-readonly-doc h2.guided-section-scroll-target {
    scroll-margin-top: ${SCROLL_TOP_OFFSET_PX + 16}px;
  }
}
@keyframes guided-section-pulse {
  0%, 100% { box-shadow: inset 0 0 0 2px rgba(180, 83, 9, 0.45); }
  50% { box-shadow: inset 0 0 0 3px rgba(217, 119, 6, 0.75); }
}
@keyframes guided-applied-pulse {
  0%, 100% { background: rgba(209, 250, 229, 0.4); }
  50% { background: rgba(167, 243, 208, 0.62); }
}
`;
  document.head.appendChild(style);
}

export function captureGuidedScrollSnapshot(): { windowY: number; panelAnchorTop: number | null } {
  if (typeof window === "undefined") {
    return { windowY: 0, panelAnchorTop: null };
  }
  const panel = document.querySelector('[data-guided-completion-panel="true"]');
  const panelAnchorTop = panel ? panel.getBoundingClientRect().top + window.scrollY : null;
  return { windowY: window.scrollY, panelAnchorTop };
}

export function restoreGuidedScrollSnapshot(snapshot: { windowY: number; panelAnchorTop: number | null }): void {
  if (typeof window === "undefined") return;
  window.scrollTo({ top: snapshot.windowY, left: 0, behavior: "instant" as ScrollBehavior });
}

export function runWithGuidedScrollPreserved<T>(fn: () => T | Promise<T>): Promise<T> {
  const snap = captureGuidedScrollSnapshot();
  const result = fn();
  if (result instanceof Promise) {
    return result.finally(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => restoreGuidedScrollSnapshot(snap));
      });
    });
  }
  requestAnimationFrame(() => restoreGuidedScrollSnapshot(snap));
  return Promise.resolve(result);
}

function findMatchingHeading(root: Element, target: GuidedRevisionTarget): HTMLElement | null {
  for (const h2 of root.querySelectorAll("h2")) {
    const text = (h2.textContent || "").trim();
    if (!text) continue;
    const match =
      target.headingPatterns.some((p) => p.test(text)) ||
      (target.sectionNumber != null && new RegExp(`^${target.sectionNumber}\\.`).test(text));
    if (match) return h2 as HTMLElement;
  }
  return null;
}

function highlightSectionBodyUntilNextHeading(heading: HTMLElement, root: Element): void {
  let node = heading.nextElementSibling;
  while (node && node.tagName !== "H2") {
    node.classList.add(APPLIED_BODY_CLASS);
    const el = node;
    window.setTimeout(() => el.classList.remove(APPLIED_BODY_CLASS), APPLIED_FADE_MS);
    node = node.nextElementSibling;
  }
  void root;
}

function injectAppliedMarkersOnHeading(heading: HTMLElement): void {
  heading.classList.add("guided-section-scroll-target");
  const parent = heading.parentElement;
  parent?.querySelectorAll(".guided-heading-updated-pill, .guided-applied-update-badge").forEach((n) => n.remove());

  const pill = document.createElement("span");
  pill.className = "guided-heading-updated-pill";
  pill.setAttribute("data-guided-causality", "applied-pill");
  pill.textContent = "Updated";
  heading.appendChild(pill);

  const badge = document.createElement("span");
  badge.className = "guided-applied-update-badge";
  badge.setAttribute("data-guided-causality", "applied");
  badge.innerHTML = `Updated from your answers<span class="guided-applied-just-now">· Updated just now</span>`;
  heading.insertAdjacentElement("afterend", badge);

  window.setTimeout(() => {
    pill.remove();
    badge.remove();
    heading.classList.remove("guided-section-scroll-target");
  }, APPLIED_FADE_MS);
}

function scrollHeadingIntoViewPrecise(heading: HTMLElement): void {
  const top = heading.getBoundingClientRect().top + window.scrollY - SCROLL_TOP_OFFSET_PX;
  window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
}

export function highlightGuidedSectionInDocument(
  target: GuidedRevisionTarget,
  opts?: { mode?: "queued" | "applied"; scroll?: boolean },
): boolean {
  if (typeof document === "undefined") return false;
  ensureHighlightStyles();
  const root = document.querySelector(".premium-readonly-doc");
  if (!root) return false;
  const h2 = findMatchingHeading(root, target);
  if (!h2) return false;
  const mode = opts?.mode ?? "queued";
  const applied = mode === "applied";
  h2.classList.remove(HIGHLIGHT_CLASS);
  h2.classList.add(applied ? APPLIED_CLASS : HIGHLIGHT_CLASS);
  if (opts?.scroll !== false) {
    scrollHeadingIntoViewPrecise(h2);
  }
  if (applied) {
    injectAppliedMarkersOnHeading(h2);
    highlightSectionBodyUntilNextHeading(h2, root);
    window.setTimeout(() => {
      h2.classList.remove(APPLIED_CLASS);
    }, APPLIED_FADE_MS);
  } else {
    window.setTimeout(() => h2.classList.remove(HIGHLIGHT_CLASS), 2800);
  }
  // eslint-disable-next-line no-console
  console.info("[guided-clause-highlight]", {
    heading: (h2.textContent || "").slice(0, 80),
    mode,
    rendered: true,
  });
  return true;
}

export type GuidedClauseHighlightResult = {
  variableId: string;
  heading: string | null;
  rendered: boolean;
};

/** Highlight all answered sections after authoritative apply (precise scroll to first). */
export function highlightAllGuidedChangedSections(
  variableIds: readonly string[],
): GuidedClauseHighlightResult[] {
  const results: GuidedClauseHighlightResult[] = [];
  let firstScrolled = false;
  for (const id of variableIds) {
    const target = resolveGuidedQuestionTarget(id);
    const root = document.querySelector(".premium-readonly-doc");
    const h2 = root ? findMatchingHeading(root, target) : null;
    const rendered = highlightGuidedSectionInDocument(target, {
      mode: "applied",
      scroll: !firstScrolled,
    });
    if (rendered && !firstScrolled) firstScrolled = true;
    results.push({
      variableId: id,
      heading: h2 ? (h2.textContent || "").trim().slice(0, 80) : null,
      rendered,
    });
  }
  const renderedCount = results.filter((r) => r.rendered).length;
  // eslint-disable-next-line no-console
  console.info("[guided-update-summary]", {
    requested: variableIds.length,
    renderedCount,
    sectionIds: results.filter((r) => r.rendered).map((r) => r.variableId),
  });
  return results;
}

/** Cycle review scroll — one section per tap with precise anchor. */
function findHeadingByTextPatterns(root: Element, patterns: readonly string[]): HTMLElement | null {
  const normalized = patterns.map((p) => p.toLowerCase());
  let best: { el: HTMLElement; score: number } | null = null;
  for (const h2 of root.querySelectorAll("h2")) {
    const text = (h2.textContent || "").trim().toLowerCase();
    if (!text) continue;
    for (const p of normalized) {
      if (!text.includes(p)) continue;
      const score = p.length / Math.max(text.length, 1);
      if (!best || score > best.score) best = { el: h2 as HTMLElement, score };
    }
  }
  return best?.el ?? null;
}

/** Scroll to a checklist section using variable anchors, then heading-text fallback. */
export function scrollToGuidedAppliedChecklistSection(
  label: GuidedAppliedChecklistLabel,
  variableIds: readonly string[],
): boolean {
  if (typeof document === "undefined") return false;
  ensureHighlightStyles();
  const root = document.querySelector(".premium-readonly-doc");
  if (!root) return false;

  for (const id of variableIds) {
    const target = resolveGuidedQuestionTarget(id);
    const h2 = findMatchingHeading(root, target);
    if (h2) {
      highlightGuidedSectionInDocument(target, { mode: "applied", scroll: true });
      return true;
    }
  }

  const patterns = GUIDED_CHECKLIST_SECTION_HEADING_FALLBACKS[label];
  const fallback = findHeadingByTextPatterns(root, patterns);
  if (!fallback) return false;

  fallback.classList.add(APPLIED_CLASS, "guided-section-scroll-target");
  scrollHeadingIntoViewPrecise(fallback);
  injectAppliedMarkersOnHeading(fallback);
  // eslint-disable-next-line no-console
  console.info("[guided-update-section-fallback-match]", {
    label,
    heading: (fallback.textContent || "").slice(0, 80),
  });
  return true;
}

export function reviewGuidedUpdatesAtIndex(
  variableIds: readonly string[],
  index: number,
): { nextIndex: number; rendered: boolean } {
  if (!variableIds.length) return { nextIndex: 0, rendered: false };
  const safe = ((index % variableIds.length) + variableIds.length) % variableIds.length;
  const target = resolveGuidedQuestionTarget(variableIds[safe]!);
  const rendered = highlightGuidedSectionInDocument(target, { mode: "applied", scroll: true });
  return { nextIndex: (safe + 1) % variableIds.length, rendered };
}

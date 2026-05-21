/**
 * Scroll preservation and section highlight for guided Pro completion.
 */

import type { GuidedRevisionTarget } from "./guidedRevisionAnchors";

const HIGHLIGHT_CLASS = "guided-section-highlight";
const HIGHLIGHT_STYLE_ID = "guided-section-highlight-style";

function ensureHighlightStyles(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById(HIGHLIGHT_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = HIGHLIGHT_STYLE_ID;
  style.textContent = `
.premium-readonly-doc .${HIGHLIGHT_CLASS},
.premium-readonly-doc h2.${HIGHLIGHT_CLASS} {
  background: rgba(254, 243, 199, 0.55) !important;
  box-shadow: inset 0 0 0 2px rgba(180, 83, 9, 0.45);
  transition: background 0.3s ease, box-shadow 0.3s ease;
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
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.info("[guided-scroll-preserved]", { windowY: snapshot.windowY });
  }
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

export function highlightGuidedSectionInDocument(target: GuidedRevisionTarget): boolean {
  if (typeof document === "undefined") return false;
  ensureHighlightStyles();
  const root = document.querySelector(".premium-readonly-doc");
  if (!root) return false;
  const headings = root.querySelectorAll("h2");
  for (const h2 of headings) {
    const text = (h2.textContent || "").trim();
    if (!text) continue;
    const match =
      target.headingPatterns.some((p) => p.test(text)) ||
      (target.sectionNumber != null && new RegExp(`^${target.sectionNumber}\\.`).test(text));
    if (!match) continue;
    h2.classList.add(HIGHLIGHT_CLASS);
    h2.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => h2.classList.remove(HIGHLIGHT_CLASS), 2200);
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.info("[guided-change-scroll-highlight]", { heading: text.slice(0, 80) });
    }
    return true;
  }
  return false;
}

import { useCallback, useLayoutEffect, useState, type RefObject } from "react";

/** Homepage hero textarea caps (visible box before internal scroll). */
export const HOMEPAGE_TEXTAREA_MAX_PX_MOBILE = 240;
export const HOMEPAGE_TEXTAREA_MAX_PX_TABLET = 320;
export const HOMEPAGE_TEXTAREA_MAX_PX_DESKTOP = 400;

/** Visible lines before we show the “large agreement” helper. */
export const HOMEPAGE_TEXTAREA_LARGE_LINE_THRESHOLD = 10;

export type SyncTextareaSizeOpts = {
  minRows?: number;
  /** Max height in px before internal scrolling. */
  maxPx: number;
};

export type SyncTextareaSizeResult = {
  heightPx: number;
  scrollHeight: number;
  overflowAuto: boolean;
};

/** Device-aware cap from viewport width (mobile / tablet / desktop). */
export function resolveHomepageTextareaMaxPx(viewportWidth: number): number {
  if (viewportWidth < 640) return HOMEPAGE_TEXTAREA_MAX_PX_MOBILE;
  if (viewportWidth <= 1024) return HOMEPAGE_TEXTAREA_MAX_PX_TABLET;
  return HOMEPAGE_TEXTAREA_MAX_PX_DESKTOP;
}

/**
 * Measure full content height without an applied maxHeight cap (must run before setting maxHeight).
 */
export function measureTextareaScrollHeight(el: HTMLTextAreaElement): number {
  el.style.boxSizing = "border-box";
  el.style.minHeight = "0";
  el.style.maxHeight = "none";
  el.style.height = "0px";
  el.style.overflowY = "hidden";
  el.style.overflowX = "hidden";

  let scrollH = el.scrollHeight;
  if (scrollH <= 0 && el.value.trim()) {
    el.style.height = "auto";
    scrollH = el.scrollHeight;
  }
  return Math.ceil(scrollH);
}

function textareaVerticalMetrics(el: HTMLTextAreaElement) {
  const style = getComputedStyle(el);
  const lineHeight = parseFloat(style.lineHeight) || 24;
  const padY =
    (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
  const borderY =
    (parseFloat(style.borderTopWidth) || 0) + (parseFloat(style.borderBottomWidth) || 0);
  return { lineHeight, padY, borderY };
}

/** Approximate rendered line count from scroll height (for large-prompt helper). */
export function estimateTextareaContentLineCount(
  el: HTMLTextAreaElement,
  scrollHeight?: number,
): number {
  const { lineHeight, padY, borderY } = textareaVerticalMetrics(el);
  const sh = scrollHeight ?? measureTextareaScrollHeight(el);
  return Math.max(1, Math.ceil((sh - padY - borderY) / lineHeight));
}

/** True when the textarea is scrolled to (or near) the bottom. */
export function textareaIsScrolledToBottom(el: HTMLTextAreaElement, thresholdPx = 10): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= thresholdPx;
}

/** Keep caret in view when content scrolls inside a capped textarea. */
export function scrollTextareaCaretIntoView(el: HTMLTextAreaElement): void {
  if (el.scrollHeight <= el.clientHeight) return;
  const { lineHeight, padY } = textareaVerticalMetrics(el);
  const padBottom = parseFloat(getComputedStyle(el).paddingBottom) || 0;
  const fadeClearance = 20;
  const pos = el.selectionStart ?? el.value.length;
  const lineIndex = Math.max(0, el.value.slice(0, pos).split("\n").length - 1);
  const caretTop = lineIndex * lineHeight + padY;
  const caretBottom = caretTop + lineHeight;
  const viewTop = el.scrollTop + padY;
  const viewBottom = el.scrollTop + el.clientHeight - padBottom - fadeClearance;
  if (caretTop < viewTop || caretBottom > viewBottom) {
    const target = Math.max(0, caretTop - el.clientHeight * 0.32);
    el.scrollTop = Math.min(target, el.scrollHeight - el.clientHeight);
  }
}

/**
 * Measure and apply textarea height from content. The hook owns height, maxHeight, and overflowY.
 */
export function syncTextareaSize(
  el: HTMLTextAreaElement,
  opts: SyncTextareaSizeOpts,
): SyncTextareaSizeResult {
  const minRows = opts.minRows ?? 3;
  const maxPx = opts.maxPx;

  const { lineHeight, padY, borderY } = textareaVerticalMetrics(el);
  const minPx = Math.ceil(lineHeight * minRows + padY + borderY);

  const scrollH = measureTextareaScrollHeight(el);
  const overflowAuto = scrollH > maxPx;
  let heightPx = Math.min(maxPx, Math.max(minPx, scrollH));
  // Avoid clipping the last line when still below the cap (subpixel / padding).
  if (!overflowAuto && heightPx < maxPx) {
    heightPx = Math.min(maxPx, heightPx + 1);
  }

  el.style.maxHeight = `${maxPx}px`;
  el.style.height = `${heightPx}px`;
  el.style.overflowY = overflowAuto ? "auto" : "hidden";

  return { heightPx, scrollHeight: scrollH, overflowAuto };
}

export type AutoResizeTextareaOpts = {
  minRows?: number;
  maxPx?: number;
};

export type AutoResizeTextareaHandlers = {
  sync: () => void;
  onPaste: () => void;
  onDrop: () => void;
  onScroll: () => void;
  overflowActive: boolean;
  /** Show bottom fade only when capped and user has not scrolled to the bottom. */
  showBottomFade: boolean;
  contentLineCount: number;
};

/** Responsive max height: 240px mobile, 320px tablet, 400px desktop. */
export function useResponsiveTextareaMaxPx(): number {
  const [maxPx, setMaxPx] = useState(() =>
    typeof window !== "undefined"
      ? resolveHomepageTextareaMaxPx(window.innerWidth)
      : HOMEPAGE_TEXTAREA_MAX_PX_DESKTOP,
  );
  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    const apply = () => setMaxPx(resolveHomepageTextareaMaxPx(window.innerWidth));
    apply();
    window.addEventListener("resize", apply);
    const mobileMq = window.matchMedia("(max-width: 639px)");
    const tabletMq = window.matchMedia("(min-width: 640px) and (max-width: 1024px)");
    const desktopMq = window.matchMedia("(min-width: 1025px)");
    mobileMq.addEventListener("change", apply);
    tabletMq.addEventListener("change", apply);
    desktopMq.addEventListener("change", apply);
    return () => {
      window.removeEventListener("resize", apply);
      mobileMq.removeEventListener("change", apply);
      tabletMq.removeEventListener("change", apply);
      desktopMq.removeEventListener("change", apply);
    };
  }, []);
  return maxPx;
}

function scheduleTextareaSync(sync: () => void): void {
  requestAnimationFrame(() => {
    sync();
    requestAnimationFrame(sync);
  });
}

/** Grows with content up to maxPx; internal scroll only after cap. */
export function useAutoResizeTextarea(
  ref: RefObject<HTMLTextAreaElement | null>,
  value: string,
  opts?: AutoResizeTextareaOpts,
): AutoResizeTextareaHandlers {
  const minRows = opts?.minRows ?? 3;
  const maxPx = opts?.maxPx ?? HOMEPAGE_TEXTAREA_MAX_PX_DESKTOP;
  const [overflowActive, setOverflowActive] = useState(false);
  const [scrollAtBottom, setScrollAtBottom] = useState(true);
  const [contentLineCount, setContentLineCount] = useState(0);

  const updateScrollState = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setScrollAtBottom(textareaIsScrolledToBottom(el));
  }, [ref]);

  const sync = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const result = syncTextareaSize(el, { minRows, maxPx });
    const lines = estimateTextareaContentLineCount(el, result.scrollHeight);
    setOverflowActive(result.overflowAuto);
    setContentLineCount(lines);
    if (result.overflowAuto) {
      scrollTextareaCaretIntoView(el);
      updateScrollState();
    } else {
      setScrollAtBottom(true);
    }
  }, [ref, minRows, maxPx, updateScrollState]);

  const onScroll = useCallback(() => {
    updateScrollState();
  }, [updateScrollState]);

  const onPaste = useCallback(() => {
    scheduleTextareaSync(sync);
  }, [sync]);

  const onDrop = useCallback(() => {
    scheduleTextareaSync(sync);
  }, [sync]);

  useLayoutEffect(() => {
    sync();
  }, [value, maxPx, sync]);

  useLayoutEffect(() => {
    scheduleTextareaSync(sync);
  }, [sync]);

  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => sync();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [sync]);

  useLayoutEffect(() => {
    if (typeof document === "undefined" || !document.fonts?.ready) return;
    let cancelled = false;
    void document.fonts.ready.then(() => {
      if (!cancelled) sync();
    });
    return () => {
      cancelled = true;
    };
  }, [sync, value]);

  return {
    sync,
    onPaste,
    onDrop,
    onScroll,
    overflowActive,
    showBottomFade: overflowActive && !scrollAtBottom,
    contentLineCount,
  };
}

import { useCallback, useLayoutEffect, useState, type RefObject } from "react";

/** Homepage hero textarea caps (visible box before internal scroll). */
export const HOMEPAGE_TEXTAREA_MAX_PX_MOBILE = 240;
export const HOMEPAGE_TEXTAREA_MAX_PX_TABLET = 320;
export const HOMEPAGE_TEXTAREA_MAX_PX_DESKTOP = 400;

/** Visible lines before we show the “large agreement” helper. */
export const HOMEPAGE_TEXTAREA_LARGE_LINE_THRESHOLD = 10;

/** Bottom/right inset for mic control (matches homepage `pb-16` / `pr-16`). */
export const HOMEPAGE_TEXTAREA_MIC_INSET_PX = 64;

/** Scroll slack before treating textarea as “at bottom” (fade off). */
export const BOTTOM_FADE_SCROLL_THRESHOLD_PX = 6;

/** Decorative bottom fade only at this viewport width and up (mobile uses native scroll). */
export const BOTTOM_FADE_OVERLAY_MIN_VIEWPORT_PX = 480;

/** Mobile height tiers — snap instead of growing every keystroke. */
export type HomepageTextareaHeightTier = "compact" | "medium" | "scroll" | "fluid";

export const HOMEPAGE_TEXTAREA_TIER_COMPACT_LINES = 3;
export const HOMEPAGE_TEXTAREA_TIER_MEDIUM_LINES = 6;

/** scrollHeight thresholds (px) for tier selection on mobile. */
export const HOMEPAGE_TEXTAREA_MOBILE_TIER_MEDIUM_THRESHOLD_PX = 128;
export const HOMEPAGE_TEXTAREA_MOBILE_TIER_SCROLL_THRESHOLD_PX = 200;

export function isHomepageTextareaTieredViewport(viewportWidth: number): boolean {
  return viewportWidth < 640;
}

export function getHomepageTextareaHeightTier(params: {
  valueLength: number;
  scrollHeight: number;
  viewportWidth: number;
}): HomepageTextareaHeightTier {
  if (!isHomepageTextareaTieredViewport(params.viewportWidth)) {
    return "fluid";
  }
  if (params.valueLength === 0) {
    return "compact";
  }
  if (params.scrollHeight <= HOMEPAGE_TEXTAREA_MOBILE_TIER_MEDIUM_THRESHOLD_PX) {
    return "compact";
  }
  if (params.scrollHeight <= HOMEPAGE_TEXTAREA_MOBILE_TIER_SCROLL_THRESHOLD_PX) {
    return "medium";
  }
  return "scroll";
}

export function getHomepageTextareaTierMaxHeightPx(
  tier: HomepageTextareaHeightTier,
  metrics: { lineHeight: number; padY: number; borderY: number },
  viewportWidth: number,
): number {
  if (tier === "fluid" || !isHomepageTextareaTieredViewport(viewportWidth)) {
    return resolveHomepageTextareaMaxPx(viewportWidth);
  }
  if (tier === "scroll") {
    return HOMEPAGE_TEXTAREA_MAX_PX_MOBILE;
  }
  const lines =
    tier === "compact" ? HOMEPAGE_TEXTAREA_TIER_COMPACT_LINES : HOMEPAGE_TEXTAREA_TIER_MEDIUM_LINES;
  return Math.ceil(metrics.lineHeight * lines + metrics.padY + metrics.borderY);
}

export type SyncTextareaSizeOpts = {
  minRows?: number;
  /** Max height in px before internal scrolling (fluid desktop/tablet). */
  maxPx: number;
  viewportWidth?: number;
};

export type SyncTextareaSizeResult = {
  heightPx: number;
  scrollHeight: number;
  overflowAuto: boolean;
  heightTier: HomepageTextareaHeightTier;
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
export function textareaIsScrolledToBottom(
  el: HTMLTextAreaElement,
  thresholdPx = BOTTOM_FADE_SCROLL_THRESHOLD_PX,
): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= thresholdPx;
}

export function isBottomFadeOverlayEnabled(viewportWidth: number): boolean {
  return viewportWidth >= BOTTOM_FADE_OVERLAY_MIN_VIEWPORT_PX;
}

/** Fade only when content overflows and the user has not reached the bottom. */
export function computeShowBottomFade(
  el: HTMLTextAreaElement,
  thresholdPx = BOTTOM_FADE_SCROLL_THRESHOLD_PX,
): boolean {
  if (el.scrollHeight <= el.clientHeight) return false;
  return !textareaIsScrolledToBottom(el, thresholdPx);
}

/** Keep caret in view when content scrolls inside a capped textarea. */
export function scrollTextareaCaretIntoView(el: HTMLTextAreaElement): void {
  if (el.scrollHeight <= el.clientHeight) return;
  const { lineHeight, padY } = textareaVerticalMetrics(el);
  const padBottom = parseFloat(getComputedStyle(el).paddingBottom) || 0;
  const fadeClearance = HOMEPAGE_TEXTAREA_MIC_INSET_PX;
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
  const viewportWidth =
    opts.viewportWidth ?? (typeof window !== "undefined" ? window.innerWidth : 1280);

  const { lineHeight, padY, borderY } = textareaVerticalMetrics(el);
  const metrics = { lineHeight, padY, borderY };
  const minPx = Math.ceil(lineHeight * minRows + padY + borderY);

  const scrollH = measureTextareaScrollHeight(el);
  const tier = getHomepageTextareaHeightTier({
    valueLength: el.value.length,
    scrollHeight: scrollH,
    viewportWidth,
  });
  const tiered = tier !== "fluid";
  const effectiveMaxPx = tiered
    ? getHomepageTextareaTierMaxHeightPx(tier, metrics, viewportWidth)
    : maxPx;

  const overflowAuto = scrollH > effectiveMaxPx;
  let heightPx: number;
  if (tiered) {
    heightPx = Math.max(minPx, effectiveMaxPx);
  } else {
    heightPx = Math.min(maxPx, Math.max(minPx, scrollH));
    if (!overflowAuto && heightPx < maxPx) {
      heightPx = Math.min(maxPx, heightPx + 1);
    }
  }

  el.style.maxHeight = `${effectiveMaxPx}px`;
  el.style.height = `${heightPx}px`;
  el.style.overflowY = overflowAuto ? "auto" : "hidden";

  return { heightPx, scrollHeight: scrollH, overflowAuto, heightTier: tier };
}

export type AutoResizeTextareaOpts = {
  minRows?: number;
  maxPx?: number;
  viewportWidth?: number;
  /** When false (mobile), never show the decorative bottom fade overlay. */
  bottomFadeOverlayEnabled?: boolean;
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
  heightTier: HomepageTextareaHeightTier;
};

export type HomepageTextareaViewport = {
  maxPx: number;
  bottomFadeOverlayEnabled: boolean;
  viewportWidth: number;
  tieredMobile: boolean;
};

/** Responsive max height + whether the decorative bottom fade may render. */
export function useResponsiveTextareaMaxPx(): HomepageTextareaViewport {
  const [layout, setLayout] = useState<HomepageTextareaViewport>(() => {
    if (typeof window === "undefined") {
      return {
        maxPx: HOMEPAGE_TEXTAREA_MAX_PX_DESKTOP,
        bottomFadeOverlayEnabled: true,
        viewportWidth: 1280,
        tieredMobile: false,
      };
    }
    const w = window.innerWidth;
    return {
      maxPx: resolveHomepageTextareaMaxPx(w),
      bottomFadeOverlayEnabled: isBottomFadeOverlayEnabled(w),
      viewportWidth: w,
      tieredMobile: isHomepageTextareaTieredViewport(w),
    };
  });
  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    const apply = () => {
      const w = window.innerWidth;
      setLayout({
        maxPx: resolveHomepageTextareaMaxPx(w),
        bottomFadeOverlayEnabled: isBottomFadeOverlayEnabled(w),
        viewportWidth: w,
        tieredMobile: isHomepageTextareaTieredViewport(w),
      });
    };
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
  return layout;
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
  const viewportWidth = opts?.viewportWidth ?? 1280;
  const bottomFadeOverlayEnabled = opts?.bottomFadeOverlayEnabled ?? true;
  const [overflowActive, setOverflowActive] = useState(false);
  const [showBottomFade, setShowBottomFade] = useState(false);
  const [contentLineCount, setContentLineCount] = useState(0);
  const [heightTier, setHeightTier] = useState<HomepageTextareaHeightTier>("fluid");

  const updateScrollState = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    if (!bottomFadeOverlayEnabled) {
      setShowBottomFade(false);
      return;
    }
    setShowBottomFade(computeShowBottomFade(el));
  }, [ref, bottomFadeOverlayEnabled]);

  const sync = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const result = syncTextareaSize(el, { minRows, maxPx, viewportWidth });
    const lines = estimateTextareaContentLineCount(el, result.scrollHeight);
    setOverflowActive(result.overflowAuto);
    setContentLineCount(lines);
    setHeightTier(result.heightTier);
    if (result.overflowAuto) {
      scrollTextareaCaretIntoView(el);
    }
    if (!result.overflowAuto || !bottomFadeOverlayEnabled) {
      setShowBottomFade(false);
    } else {
      setShowBottomFade(computeShowBottomFade(el));
    }
  }, [ref, minRows, maxPx, viewportWidth, bottomFadeOverlayEnabled]);

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
    if (!bottomFadeOverlayEnabled) {
      setShowBottomFade(false);
      return;
    }
    const el = ref.current;
    if (el) setShowBottomFade(computeShowBottomFade(el));
  }, [bottomFadeOverlayEnabled, ref]);

  useLayoutEffect(() => {
    sync();
  }, [value, maxPx, viewportWidth, sync]);

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
    showBottomFade,
    contentLineCount,
    heightTier,
  };
}

import { useCallback, useLayoutEffect, useState, type RefObject } from "react";

/** Homepage hero textarea caps (visible box before internal scroll). */
export const HOMEPAGE_TEXTAREA_MAX_PX_MOBILE = 360;
export const HOMEPAGE_TEXTAREA_MAX_PX_DESKTOP = 520;

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

/**
 * Measure and apply textarea height from content. The hook owns height, maxHeight, and overflowY.
 */
export function syncTextareaSize(
  el: HTMLTextAreaElement,
  opts: SyncTextareaSizeOpts,
): SyncTextareaSizeResult {
  const minRows = opts.minRows ?? 4;
  const maxPx = opts.maxPx;

  const style = getComputedStyle(el);
  const lineHeight = parseFloat(style.lineHeight) || 24;
  const padY =
    (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
  const borderY =
    (parseFloat(style.borderTopWidth) || 0) + (parseFloat(style.borderBottomWidth) || 0);
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
};

/** Responsive max height: 360px mobile, 520px desktop. */
export function useResponsiveTextareaMaxPx(): number {
  const [maxPx, setMaxPx] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches
      ? HOMEPAGE_TEXTAREA_MAX_PX_MOBILE
      : HOMEPAGE_TEXTAREA_MAX_PX_DESKTOP,
  );
  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 639px)");
    const apply = () =>
      setMaxPx(mq.matches ? HOMEPAGE_TEXTAREA_MAX_PX_MOBILE : HOMEPAGE_TEXTAREA_MAX_PX_DESKTOP);
    apply();
    mq.addEventListener("change", apply);
    window.addEventListener("resize", apply);
    return () => {
      mq.removeEventListener("change", apply);
      window.removeEventListener("resize", apply);
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
  const minRows = opts?.minRows ?? 4;
  const maxPx = opts?.maxPx ?? HOMEPAGE_TEXTAREA_MAX_PX_DESKTOP;

  const sync = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    syncTextareaSize(el, { minRows, maxPx });
  }, [ref, minRows, maxPx]);

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

  return { sync, onPaste, onDrop };
}

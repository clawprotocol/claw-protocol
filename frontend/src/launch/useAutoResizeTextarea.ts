import { useCallback, useLayoutEffect, useState, type RefObject } from "react";

export type SyncTextareaSizeOpts = {
  minRows?: number;
  /** Max height in px before internal scrolling (desktop ~420, mobile ~300). */
  maxPx: number;
};

export type SyncTextareaSizeResult = {
  heightPx: number;
  scrollHeight: number;
  overflowAuto: boolean;
};

/**
 * Measure and apply textarea height from content. Resets height before reading scrollHeight
 * so growth is not capped by a previous smaller inline height.
 */
export function syncTextareaSize(
  el: HTMLTextAreaElement,
  opts: SyncTextareaSizeOpts,
): SyncTextareaSizeResult {
  const minRows = opts.minRows ?? 4;
  const maxPx = opts.maxPx;

  el.style.boxSizing = "border-box";
  el.style.maxHeight = "none";
  el.style.height = "auto";
  el.style.overflowY = "hidden";

  const style = getComputedStyle(el);
  const lineHeight = parseFloat(style.lineHeight) || 24;
  const padY =
    (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
  const borderY =
    (parseFloat(style.borderTopWidth) || 0) + (parseFloat(style.borderBottomWidth) || 0);
  const minPx = lineHeight * minRows + padY + borderY;

  const scrollH = el.scrollHeight;
  const heightPx = Math.min(maxPx, Math.max(minPx, scrollH));
  const overflowAuto = scrollH > maxPx;

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

/** Responsive max height: ~300px mobile, ~420px desktop. */
export function useResponsiveTextareaMaxPx(): number {
  const [maxPx, setMaxPx] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches ? 300 : 420,
  );
  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 639px)");
    const apply = () => setMaxPx(mq.matches ? 300 : 420);
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

/** Collapsed ~4–5 lines; grows with content up to maxPx, then scrolls inside the field. */
export function useAutoResizeTextarea(
  ref: RefObject<HTMLTextAreaElement | null>,
  value: string,
  opts?: AutoResizeTextareaOpts,
): AutoResizeTextareaHandlers {
  const minRows = opts?.minRows ?? 4;
  const maxPx = opts?.maxPx ?? 420;

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

  return { sync, onPaste, onDrop };
}

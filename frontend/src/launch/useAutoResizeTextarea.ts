import { useCallback, useLayoutEffect, type RefObject } from "react";

export type AutoResizeTextareaOpts = {
  minRows?: number;
  /** Max height in px before scrolling (desktop ~320, mobile ~280). */
  maxPx?: number;
};

export type AutoResizeTextareaHandlers = {
  /** Re-measure height from current content. */
  sync: () => void;
  /** Call on paste so layout runs after the browser applies pasted text. */
  onPaste: () => void;
};

/** Collapsed ~4–5 lines; grows smoothly with content up to maxPx, then scrolls. */
export function useAutoResizeTextarea(
  ref: RefObject<HTMLTextAreaElement | null>,
  value: string,
  opts?: AutoResizeTextareaOpts,
): AutoResizeTextareaHandlers {
  const minRows = opts?.minRows ?? 4;
  const maxPx = opts?.maxPx ?? 320;

  const sync = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    const style = getComputedStyle(el);
    const lineHeight = parseFloat(style.lineHeight) || 24;
    const padY =
      (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
    const minPx = lineHeight * minRows + padY;
    const scrollH = el.scrollHeight;
    const next = Math.min(maxPx, Math.max(minPx, scrollH));
    el.style.height = `${next}px`;
    el.style.overflowY = scrollH > maxPx ? "auto" : "hidden";
  }, [ref, minRows, maxPx]);

  const onPaste = useCallback(() => {
    requestAnimationFrame(() => {
      sync();
      requestAnimationFrame(sync);
    });
  }, [sync]);

  useLayoutEffect(() => {
    sync();
  }, [value, sync]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => sync());
    ro.observe(el);
    return () => ro.disconnect();
  }, [sync, ref]);

  useLayoutEffect(() => {
    const t = window.setTimeout(sync, 0);
    return () => window.clearTimeout(t);
  }, [sync]);

  return { sync, onPaste };
}

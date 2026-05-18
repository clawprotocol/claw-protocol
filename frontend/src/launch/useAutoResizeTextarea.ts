import { useCallback, useLayoutEffect, useState, type RefObject } from "react";

export type AutoResizeTextareaOpts = {
  minRows?: number;
  /** Max height in px before scrolling (desktop ~360, mobile ~280). */
  maxPx?: number;
};

export type AutoResizeTextareaHandlers = {
  /** Re-measure height from current content. */
  sync: () => void;
  /** Call on paste/drop so layout runs after the browser applies new text. */
  onPaste: () => void;
  onDrop: () => void;
};

/** Responsive max height: ~280px mobile, ~360px desktop. */
export function useResponsiveTextareaMaxPx(): number {
  const [maxPx, setMaxPx] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches ? 280 : 360,
  );
  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 639px)");
    const apply = () => setMaxPx(mq.matches ? 280 : 360);
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

/** Collapsed ~4–5 lines; grows smoothly with content up to maxPx, then scrolls. */
export function useAutoResizeTextarea(
  ref: RefObject<HTMLTextAreaElement | null>,
  value: string,
  opts?: AutoResizeTextareaOpts,
): AutoResizeTextareaHandlers {
  const minRows = opts?.minRows ?? 4;
  const maxPx = opts?.maxPx ?? 360;

  const sync = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.boxSizing = "border-box";
    el.style.height = "auto";
    const style = getComputedStyle(el);
    const lineHeight = parseFloat(style.lineHeight) || 24;
    const padY =
      (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
    const borderY =
      (parseFloat(style.borderTopWidth) || 0) + (parseFloat(style.borderBottomWidth) || 0);
    const minPx = lineHeight * minRows + padY + borderY;
    const scrollH = el.scrollHeight;
    const next = Math.min(maxPx, Math.max(minPx, scrollH));
    el.style.height = `${next}px`;
    el.style.overflowY = scrollH > maxPx ? "auto" : "hidden";
  }, [ref, minRows, maxPx]);

  const scheduleSync = useCallback(() => {
    requestAnimationFrame(() => {
      sync();
      requestAnimationFrame(sync);
    });
  }, [sync]);

  const onPaste = useCallback(() => {
    scheduleSync();
  }, [scheduleSync]);

  const onDrop = useCallback(() => {
    scheduleSync();
  }, [scheduleSync]);

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
    if (typeof window === "undefined") return;
    const onResize = () => sync();
    window.addEventListener("resize", onResize);
    const t = window.setTimeout(sync, 0);
    return () => {
      window.removeEventListener("resize", onResize);
      window.clearTimeout(t);
    };
  }, [sync]);

  return { sync, onPaste, onDrop };
}

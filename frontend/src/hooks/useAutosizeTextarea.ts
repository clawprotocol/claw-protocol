import { useLayoutEffect, type RefObject } from "react";

export type UseAutosizeTextareaOptions = {
  /** Minimum height in px (default 72). */
  minPx?: number;
  /** Maximum height before scrolling (default 420). */
  maxPx?: number;
};

/**
 * Grows a textarea with its content up to maxPx, then scrolls. Use for long pastes without layout jumps.
 */
export function useAutosizeTextarea(
  ref: RefObject<HTMLTextAreaElement | null>,
  value: string,
  options?: UseAutosizeTextareaOptions,
): void {
  const minPx = options?.minPx ?? 72;
  const maxPx = options?.maxPx ?? 420;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    const next = Math.min(Math.max(el.scrollHeight, minPx), maxPx);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > maxPx ? "auto" : "hidden";
    el.style.maxHeight = `${maxPx}px`;
  }, [value, minPx, maxPx, ref]);
}

import { useCallback, useLayoutEffect, type RefObject } from "react";

/** Collapsed ~4–5 lines, grows smoothly with content (cap optional). */
export function useAutoResizeTextarea(
  ref: RefObject<HTMLTextAreaElement | null>,
  value: string,
  opts?: { minRows?: number; maxPx?: number },
) {
  const minRows = opts?.minRows ?? 4;
  const maxPx = opts?.maxPx ?? 420;

  const sync = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 24;
    const minPx = lineHeight * minRows + (parseFloat(getComputedStyle(el).paddingTop) || 0) * 2;
    const next = Math.min(maxPx, Math.max(minPx, el.scrollHeight));
    el.style.height = `${next}px`;
  }, [ref, minRows, maxPx]);

  useLayoutEffect(() => {
    sync();
  }, [value, sync]);

  return sync;
}

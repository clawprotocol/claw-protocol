import { useLayoutEffect, useState, type RefObject } from "react";

const STICKY_BOTTOM_BUFFER_PX = 24;

function readSafeAreaInsetBottomPx(): number {
  if (typeof window === "undefined") return 0;
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:fixed;left:0;bottom:0;visibility:hidden;pointer-events:none;padding-bottom:env(safe-area-inset-bottom);";
  document.body.appendChild(probe);
  const inset = Math.max(0, probe.getBoundingClientRect().height);
  probe.remove();
  return inset;
}

export function measureStickyBottomInsetPx(barEl: HTMLElement | null): number {
  if (!barEl) return 0;
  const height = Math.ceil(barEl.getBoundingClientRect().height);
  return height + STICKY_BOTTOM_BUFFER_PX + readSafeAreaInsetBottomPx();
}

/** Dynamic scroll padding under the agreement when a bottom sticky CTA is visible. */
export function usePaidProStickyBottomInset(
  barRef: RefObject<HTMLElement | null>,
  active: boolean,
): number {
  const [insetPx, setInsetPx] = useState(0);

  useLayoutEffect(() => {
    if (!active) {
      setInsetPx(0);
      return;
    }
    const el = barRef.current;
    if (!el) return;

    const update = () => setInsetPx(measureStickyBottomInsetPx(el));
    update();

    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    ro?.observe(el);
    window.addEventListener("resize", update);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [active, barRef]);

  return insetPx;
}

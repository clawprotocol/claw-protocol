import { useLayoutEffect, useState } from "react";

const MOBILE_MQ = "(max-width: 640px)";

function isMobileViewport(windowObj: Pick<Window, "innerHeight"> & { matchMedia?: Window["matchMedia"] }): boolean {
  return typeof windowObj.matchMedia === "function" ? windowObj.matchMedia(MOBILE_MQ).matches : false;
}

/** Paste / edit draft: desktop 420px min, mobile 280px min. */
export function computeRecipientDraftTextareaMinPx(
  windowObj: Pick<Window, "innerHeight"> & { matchMedia?: Window["matchMedia"] },
): number {
  return isMobileViewport(windowObj) ? 280 : 420;
}

/** Desktop max min(900px, 80vh); mobile max 65vh (capped at 900 for very tall phones). */
export function computeRecipientDraftTextareaMaxPx(
  windowObj: Pick<Window, "innerHeight"> & { matchMedia?: Window["matchMedia"] },
): number {
  const h = windowObj.innerHeight;
  const mobile = isMobileViewport(windowObj);
  const vhFrac = mobile ? 0.65 : 0.8;
  const fromVh = Math.floor(h * vhFrac);
  const cap = 900;
  return Math.min(cap, Math.max(mobile ? 280 : 420, fromVh));
}

export function useRecipientDraftTextareaSizing(): { minPx: number; maxPx: number } {
  const [minPx, setMinPx] = useState(() =>
    typeof window !== "undefined" ? computeRecipientDraftTextareaMinPx(window) : 420,
  );
  const [maxPx, setMaxPx] = useState(() =>
    typeof window !== "undefined" ? computeRecipientDraftTextareaMaxPx(window) : 900,
  );

  useLayoutEffect(() => {
    const compute = () => {
      setMinPx(computeRecipientDraftTextareaMinPx(window));
      setMaxPx(computeRecipientDraftTextareaMaxPx(window));
    };
    compute();
    if (typeof window.matchMedia !== "function") {
      window.addEventListener("resize", compute);
      return () => window.removeEventListener("resize", compute);
    }
    const mq = window.matchMedia(MOBILE_MQ);
    mq.addEventListener("change", compute);
    window.addEventListener("resize", compute);
    return () => {
      mq.removeEventListener("change", compute);
      window.removeEventListener("resize", compute);
    };
  }, []);

  return { minPx, maxPx };
}

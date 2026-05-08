import { useLayoutEffect, useState } from "react";

const MOBILE_MQ = "(max-width: 640px)";

/** Desktop ~70vh capped at 720px; mobile ~55vh — scroll inside textarea after cap. */
export function computeRecipientDraftTextareaMaxPx(
  windowObj: Pick<Window, "innerHeight"> & { matchMedia?: Window["matchMedia"] },
): number {
  const h = windowObj.innerHeight;
  const isMobile =
    typeof windowObj.matchMedia === "function" ? windowObj.matchMedia(MOBILE_MQ).matches : false;
  const vhFrac = isMobile ? 0.55 : 0.7;
  const fromVh = Math.floor(h * vhFrac);
  const desktopCap = 720;
  return Math.min(desktopCap, Math.max(280, fromVh));
}

export function useRecipientDraftTextareaMaxPx(): number {
  const [maxPx, setMaxPx] = useState(() =>
    typeof window !== "undefined" ? computeRecipientDraftTextareaMaxPx(window) : 720,
  );

  useLayoutEffect(() => {
    const compute = () => setMaxPx(computeRecipientDraftTextareaMaxPx(window));
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

  return maxPx;
}

import { useEffect } from "react";

export type LawdogMarketingPixelSurface = "homepage" | "signup_success";

/**
 * Third-party marketing tags must load **only** here — never inside agreement, signing, or verification flows.
 *
 * Enable with `VITE_LAWDOG_MARKETING_PIXELS_ENABLED=1` and optional `VITE_LAWDOG_MARKETING_PIXEL_SCRIPT_URL`.
 * We do not inject fingerprinting libraries; keep tags minimal and consent-aligned.
 */
export function LawdogMarketingPixels(props: { surface: LawdogMarketingPixelSurface }) {
  const { surface } = props;

  useEffect(() => {
    if (typeof document === "undefined") return;
    const enabled = String(import.meta.env.VITE_LAWDOG_MARKETING_PIXELS_ENABLED ?? "").toLowerCase();
    if (enabled !== "1" && enabled !== "true") return;
    const src = (import.meta.env.VITE_LAWDOG_MARKETING_PIXEL_SCRIPT_URL || "").trim();
    if (!src) return;
    const s = document.createElement("script");
    s.async = true;
    s.src = src;
    s.dataset.lawdogMarketing = surface;
    document.head.appendChild(s);
    return () => {
      try {
        s.remove();
      } catch {
        /* ignore */
      }
    };
  }, [surface]);

  return null;
}

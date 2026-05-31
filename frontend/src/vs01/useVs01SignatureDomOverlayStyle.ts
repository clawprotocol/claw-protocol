import { useLayoutEffect, useState, type CSSProperties } from "react";
import type { Vs01NormalizedRect } from "./vs01FieldCssGeometry";
import { normalizedPdfRectToCssPercent } from "./vs01FieldCssGeometry";
import { resolveSignatureDomFieldRect } from "./vs01SignatureDomPlacement";

export function useVs01SignatureDomOverlayStyle(args: {
  enabled: boolean;
  partyIndex: number;
  normalizedFallback: Vs01NormalizedRect;
  placementHost: HTMLElement | null;
}): { style: CSSProperties | null; domAnchored: boolean } {
  const [style, setStyle] = useState<CSSProperties | null>(null);
  const [domAnchored, setDomAnchored] = useState(false);

  useLayoutEffect(() => {
    if (!args.enabled || !args.placementHost) {
      setStyle(null);
      setDomAnchored(false);
      return;
    }

    const host = args.placementHost;
    const pageSurface =
      host.closest<HTMLElement>(".vs01-sign-page-surface") ?? host;

    const measure = () => {
      if (pageSurface.clientWidth < 8 || pageSurface.clientHeight < 8) return;
      const before = args.normalizedFallback;
      const resolved = resolveSignatureDomFieldRect({
        pageSurface,
        partyIndex: args.partyIndex,
        normalizedFallback: before,
      });
      const domAnchoredNow =
        resolved.x !== before.x ||
        resolved.y !== before.y ||
        resolved.width !== before.width ||
        resolved.height !== before.height;
      const css = normalizedPdfRectToCssPercent(resolved);
      setDomAnchored(domAnchoredNow);
      setStyle({
        position: "absolute",
        left: css.left,
        top: css.top,
        width: css.width,
        height: css.height,
        zIndex: 3,
      });
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(pageSurface);
    return () => ro.disconnect();
  }, [
    args.enabled,
    args.partyIndex,
    args.placementHost,
    args.normalizedFallback.x,
    args.normalizedFallback.y,
    args.normalizedFallback.width,
    args.normalizedFallback.height,
  ]);

  return { style, domAnchored };
}

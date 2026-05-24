import { useLayoutEffect, useState, type CSSProperties } from "react";
import type { Vs01NormalizedRect } from "./vs01FieldCssGeometry";
import {
  computeInitialsDomPlacementPx,
  initialsDomPlacementCssStyle,
  initialsDomSignerColumn,
  logInitialsDomPlacementForPage,
  validateInitialsDomPlacement,
  VS01_INITIALS_DOM_BOTTOM_MAX_PX,
} from "./vs01InitialsDomPlacement";

export function useVs01InitialsDomOverlayStyle(args: {
  enabled: boolean;
  page: number;
  signerIndex: number;
  signerCount: number;
  fieldObstacles?: readonly Vs01NormalizedRect[];
  placementHost: HTMLElement | null;
}): CSSProperties | null {
  const [style, setStyle] = useState<CSSProperties | null>(null);

  useLayoutEffect(() => {
    if (!args.enabled || !args.placementHost) {
      setStyle(null);
      return;
    }

    const host = args.placementHost;

    const measure = () => {
      const pageWidth = host.clientWidth;
      const pageHeight = host.clientHeight;
      if (pageWidth < 8 || pageHeight < 8) return;

      const dom = computeInitialsDomPlacementPx({
        pageWidth,
        pageHeight,
        signerIndex: args.signerIndex,
        signerCount: args.signerCount,
        fieldObstacles: args.fieldObstacles,
        allowSignatureShift: true,
      });

      const { colFromRight } = initialsDomSignerColumn(args.signerIndex, args.signerCount);
      const isRightmost = colFromRight === 0;
      const shifted = dom.bottomDistance > VS01_INITIALS_DOM_BOTTOM_MAX_PX + 4;
      validateInitialsDomPlacement({
        page: args.page,
        signerIndex: args.signerIndex,
        placement: dom,
        isRightmostInRow: isRightmost,
        shiftedForSignature: shifted,
      });
      logInitialsDomPlacementForPage({
        page: args.page,
        pageWidth,
        pageHeight,
        signerIndex: args.signerIndex,
        placement: dom,
      });

      setStyle(initialsDomPlacementCssStyle(dom));
    };

    measure();
    const ro = new ResizeObserver(() => measure());
    ro.observe(host);
    return () => ro.disconnect();
  }, [
    args.enabled,
    args.page,
    args.signerIndex,
    args.signerCount,
    args.placementHost,
    args.fieldObstacles,
  ]);

  return style;
}

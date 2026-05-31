import { useLayoutEffect, useRef, useState, type CSSProperties, type HTMLAttributes, type ReactNode } from "react";
import type { Vs01NormalizedRect } from "./vs01FieldCssGeometry";
import { normalizedPdfRectToCssPercent } from "./vs01FieldCssGeometry";
import { useVs01SignatureDomOverlayStyle } from "./useVs01SignatureDomOverlayStyle";

export type Vs01SignatureDomFieldShellProps = {
  enabled: boolean;
  partyIndex: number;
  normalizedFallback: Vs01NormalizedRect;
  className?: string;
  styleExtras?: CSSProperties;
  children: ReactNode;
} & Omit<HTMLAttributes<HTMLDivElement>, "style" | "children" | "className">;

/**
 * Wraps a canonical signature field and snaps it to measured underline DOM geometry.
 */
export function Vs01SignatureDomFieldShell({
  enabled,
  partyIndex,
  normalizedFallback,
  className,
  styleExtras,
  children,
  ...shellAttrs
}: Vs01SignatureDomFieldShellProps) {
  const shellRef = useRef<HTMLDivElement>(null);
  const [placementHost, setPlacementHost] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const el = shellRef.current;
    if (!el) return;
    const host =
      el.closest<HTMLElement>(".vs01-sign-page-placement-host") ??
      el.closest<HTMLElement>(".vs01-sign-overlay") ??
      el.closest<HTMLElement>(".vs01-sign-page-surface");
    setPlacementHost(host);
  }, [enabled, partyIndex]);

  const { style: domStyle } = useVs01SignatureDomOverlayStyle({
    enabled,
    partyIndex,
    normalizedFallback,
    placementHost,
  });

  const fallbackStyle = normalizedPdfRectToCssPercent(normalizedFallback);
  const positionStyle: CSSProperties =
    enabled && domStyle
      ? { ...domStyle, ...styleExtras }
      : {
          position: "absolute",
          left: fallbackStyle.left,
          top: fallbackStyle.top,
          width: fallbackStyle.width,
          height: fallbackStyle.height,
          zIndex: 3,
          ...styleExtras,
        };

  return (
    <div
      ref={shellRef}
      className={className}
      style={positionStyle}
      data-vs01-signature-dom-anchored={enabled ? "1" : "0"}
      {...shellAttrs}
    >
      {children}
    </div>
  );
}

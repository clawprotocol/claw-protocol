import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { Vs01NormalizedRect } from "./vs01FieldCssGeometry";
import { normalizedPdfRectToCssPercent } from "./vs01FieldCssGeometry";
import { useVs01InitialsDomOverlayStyle } from "./useVs01InitialsDomOverlayStyle";
import { vs01InitialsDomDebugEnabled } from "./vs01InitialsDomPlacement";

export type Vs01InitialsDomFieldShellProps = {
  enabled: boolean;
  page: number;
  signerIndex: number;
  signerCount: number;
  normalizedFallback: Vs01NormalizedRect;
  fieldObstacles?: readonly Vs01NormalizedRect[];
  textRects?: readonly Vs01NormalizedRect[];
  className?: string;
  styleExtras?: CSSProperties;
  children: ReactNode;
};

/**
 * Wraps a signing field and pins auto-initials to measured page DOM bottom-right.
 */
export function Vs01InitialsDomFieldShell({
  enabled,
  page,
  signerIndex,
  signerCount,
  normalizedFallback,
  fieldObstacles,
  textRects,
  className,
  styleExtras,
  children,
}: Vs01InitialsDomFieldShellProps) {
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
  }, [page, enabled]);

  const domStyle = useVs01InitialsDomOverlayStyle({
    enabled,
    page,
    signerIndex,
    signerCount,
    fieldObstacles,
    textRects,
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
          ...styleExtras,
        };

  const showDebug = enabled && vs01InitialsDomDebugEnabled() && domStyle;

  return (
    <>
      {showDebug ? (
        <div
          className="vs01-initials-dom-debug-zone"
          aria-hidden
          style={{
            position: "absolute",
            right: "64px",
            bottom: "64px",
            width: "200px",
            height: "80px",
            border: "1px dashed rgba(180, 83, 9, 0.45)",
            pointerEvents: "none",
            zIndex: 1,
          }}
        />
      ) : null}
      <div ref={shellRef} className={className} style={positionStyle}>
        {children}
      </div>
    </>
  );
}

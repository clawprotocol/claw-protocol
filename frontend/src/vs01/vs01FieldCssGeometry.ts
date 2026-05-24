import type { SigningFieldType } from "./signingFields";

export type Vs01NormalizedRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type Vs01CssRectPx = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type Vs01CssRectPercent = {
  left: string;
  top: string;
  width: string;
  height: string;
};

export type Vs01RectYOrigin = "top-left" | "bottom-left";

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function clampNormalizedRect(rect: Vs01NormalizedRect): Vs01NormalizedRect {
  const width = clamp01(rect.width);
  const height = clamp01(rect.height);
  return {
    x: Math.max(0, Math.min(1 - width, rect.x)),
    y: Math.max(0, Math.min(1 - height, rect.y)),
    width,
    height,
  };
}

/**
 * VS01 placement rects are stored as normalized top-left page coordinates:
 * x/y/width/height are all 0..1, y grows downward from the visible page top.
 */
export function normalizedPdfRectToCssRect(
  rect: Vs01NormalizedRect,
  page: { width: number; height: number },
  options?: { yOrigin?: Vs01RectYOrigin },
): Vs01CssRectPx {
  const r = clampNormalizedRect(rect);
  const yOrigin = options?.yOrigin ?? "top-left";
  const topNorm = yOrigin === "bottom-left" ? 1 - r.y - r.height : r.y;
  return {
    left: r.x * page.width,
    top: Math.max(0, Math.min(1 - r.height, topNorm)) * page.height,
    width: r.width * page.width,
    height: r.height * page.height,
  };
}

export function normalizedPdfRectToCssPercent(
  rect: Vs01NormalizedRect,
  options?: { yOrigin?: Vs01RectYOrigin },
): Vs01CssRectPercent {
  const px = normalizedPdfRectToCssRect(rect, { width: 100, height: 100 }, options);
  return {
    left: `${px.left}%`,
    top: `${px.top}%`,
    width: `${px.width}%`,
    height: `${px.height}%`,
  };
}

export function vs01InitialsVisualBottomRightCheck(args: {
  rect: Vs01NormalizedRect;
  pageWidthPx: number;
  pageHeightPx: number;
  overlapsTextApprox?: boolean;
  allowShiftedUp?: boolean;
}): {
  distanceFromRightPx: number;
  distanceFromBottomPx: number;
  overlapsTextApprox: boolean;
  passed: boolean;
} {
  const css = normalizedPdfRectToCssRect(args.rect, {
    width: args.pageWidthPx,
    height: args.pageHeightPx,
  });
  const distanceFromRightPx = args.pageWidthPx - css.left - css.width;
  const distanceFromBottomPx = args.pageHeightPx - css.top - css.height;
  // For multiple signers, the group is bottom-right anchored and earlier boxes sit leftward.
  const rightOk = distanceFromRightPx >= 36 && distanceFromRightPx <= 140;
  const bottomMax = args.allowShiftedUp ? 220 : 96;
  const bottomOk = distanceFromBottomPx >= 36 && distanceFromBottomPx <= bottomMax;
  const overlapsTextApprox = args.overlapsTextApprox === true;
  return {
    distanceFromRightPx,
    distanceFromBottomPx,
    overlapsTextApprox,
    passed: rightOk && bottomOk && !overlapsTextApprox,
  };
}

export function logVs01InitialsCoordinateAudit(payload: {
  page: number;
  fieldType?: SigningFieldType;
  normalizedRect: Vs01NormalizedRect;
  pdfPageWidth: number | null;
  pdfPageHeight: number | null;
  viewportWidth: number | null;
  viewportHeight: number | null;
  domPageWidth: number;
  domPageHeight: number;
  renderedCssLeft: number;
  renderedCssTop: number;
  renderedCssWidth: number;
  renderedCssHeight: number;
  yOrigin: Vs01RectYOrigin;
  scaleX: number;
  scaleY: number;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[vs01-initials-coordinate-audit]", payload);
}

export function logVs01InitialsVisualBottomRightCheck(payload: {
  page: number;
  distanceFromRightPx: number;
  distanceFromBottomPx: number;
  overlapsTextApprox: boolean;
  passed: boolean;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[vs01-initials-visual-bottom-right-check]", payload);
}

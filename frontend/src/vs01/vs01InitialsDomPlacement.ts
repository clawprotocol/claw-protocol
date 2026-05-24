/**
 * DocuSign-style initials overlay: fixed bottom-right margin in page CSS pixels.
 * Placement does not use PDF text-layer Y values.
 */

import { fieldRectsOverlap } from "./signingFields";
import type { Vs01NormalizedRect } from "./vs01FieldCssGeometry";

/** Default overlay box (CSS px on rendered page). */
export const VS01_INITIALS_DOM_BOX_WIDTH_PX = 76;
export const VS01_INITIALS_DOM_BOX_HEIGHT_PX = 48;
export const VS01_INITIALS_DOM_RIGHT_MARGIN_PX = 64;
export const VS01_INITIALS_DOM_BOTTOM_MARGIN_PX = 64;
export const VS01_INITIALS_DOM_SIGNER_GAP_PX = 12;
export const VS01_INITIALS_DOM_MAX_COLS = 2;

/** US Letter reference for persisted normalized geometry (72dpi). */
export const VS01_INITIALS_DOM_REFERENCE_PAGE_WIDTH_PX = 612;
export const VS01_INITIALS_DOM_REFERENCE_PAGE_HEIGHT_PX = 792;

export const VS01_INITIALS_DOM_RIGHT_MIN_PX = 48;
export const VS01_INITIALS_DOM_RIGHT_MAX_PX = 96;
export const VS01_INITIALS_DOM_BOTTOM_MIN_PX = 48;
export const VS01_INITIALS_DOM_BOTTOM_MAX_PX = 96;

export type Vs01InitialsDomPlacementPx = {
  left: number;
  top: number;
  width: number;
  height: number;
  rightDistance: number;
  bottomDistance: number;
};

export type Vs01InitialsDomPlacementOptions = {
  pageWidth: number;
  pageHeight: number;
  signerIndex: number;
  signerCount: number;
  boxWidth?: number;
  boxHeight?: number;
  rightMargin?: number;
  bottomMargin?: number;
  signerGap?: number;
  /** Signature / footer obstacles in normalized 0..1 top-left coords. */
  fieldObstacles?: readonly Vs01NormalizedRect[];
  /** Shift up when overlapping signature fields (not body text). */
  allowSignatureShift?: boolean;
};

export function logVs01InitialsDomPlacement(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[vs01-initials-dom-placement]", payload);
}

export function logVs01InitialsDomPlacementFail(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.warn("[vs01-initials-dom-placement-fail]", payload);
}

export function initialsDomSignerColumn(signerIndex: number, signerCount: number): {
  colInRow: number;
  colFromRight: number;
  row: number;
  colsPerRow: number;
} {
  const count = Math.max(1, signerCount);
  const colsPerRow = Math.min(count, VS01_INITIALS_DOM_MAX_COLS);
  const row = Math.floor(signerIndex / colsPerRow);
  const colInRow = signerIndex % colsPerRow;
  const colFromRight = colsPerRow - 1 - colInRow;
  return { colInRow, colFromRight, row, colsPerRow };
}

/**
 * Fixed bottom-right initials position in page CSS pixels.
 */
export function computeInitialsDomPlacementPx(
  args: Vs01InitialsDomPlacementOptions,
): Vs01InitialsDomPlacementPx {
  const pageWidth = Math.max(1, args.pageWidth);
  const pageHeight = Math.max(1, args.pageHeight);
  const boxWidth = args.boxWidth ?? VS01_INITIALS_DOM_BOX_WIDTH_PX;
  const boxHeight = args.boxHeight ?? VS01_INITIALS_DOM_BOX_HEIGHT_PX;
  const rightMargin = args.rightMargin ?? VS01_INITIALS_DOM_RIGHT_MARGIN_PX;
  const bottomMargin = args.bottomMargin ?? VS01_INITIALS_DOM_BOTTOM_MARGIN_PX;
  const signerGap = args.signerGap ?? VS01_INITIALS_DOM_SIGNER_GAP_PX;
  const { colFromRight, row } = initialsDomSignerColumn(args.signerIndex, args.signerCount);
  const rowStep = boxHeight + signerGap;

  let left =
    pageWidth - rightMargin - boxWidth - colFromRight * (boxWidth + signerGap);
  let top = pageHeight - bottomMargin - boxHeight - row * rowStep;

  const obstacles = args.fieldObstacles ?? [];
  const allowShift = args.allowSignatureShift !== false && obstacles.length > 0;

  if (allowShift) {
    for (let attempt = 0; attempt < 32; attempt += 1) {
      const norm = domPlacementPxToNormalized(
        { left, top, width: boxWidth, height: boxHeight },
        pageWidth,
        pageHeight,
      );
      const hitsSignature = obstacles.some(
        (o) =>
          o.width > 0 &&
          o.height > 0 &&
          fieldRectsOverlap(norm, o, 0.012),
      );
      if (!hitsSignature) break;
      top -= rowStep;
      if (top < 8) break;
    }
  }

  left = Math.max(0, Math.min(pageWidth - boxWidth, left));
  top = Math.max(0, Math.min(pageHeight - boxHeight, top));

  const rightDistance = pageWidth - left - boxWidth;
  const bottomDistance = pageHeight - top - boxHeight;
  return { left, top, width: boxWidth, height: boxHeight, rightDistance, bottomDistance };
}

export function domPlacementPxToNormalized(
  px: Pick<Vs01InitialsDomPlacementPx, "left" | "top" | "width" | "height">,
  pageWidth: number,
  pageHeight: number,
): Vs01NormalizedRect {
  const w = Math.max(1, pageWidth);
  const h = Math.max(1, pageHeight);
  return {
    x: px.left / w,
    y: px.top / h,
    width: px.width / w,
    height: px.height / h,
  };
}

export function computeInitialsDomPlacementNormalized(
  args: Omit<Vs01InitialsDomPlacementOptions, "pageWidth" | "pageHeight"> & {
    pageWidth?: number;
    pageHeight?: number;
  },
): Vs01NormalizedRect & { dom: Vs01InitialsDomPlacementPx } {
  const pageWidth = args.pageWidth ?? VS01_INITIALS_DOM_REFERENCE_PAGE_WIDTH_PX;
  const pageHeight = args.pageHeight ?? VS01_INITIALS_DOM_REFERENCE_PAGE_HEIGHT_PX;
  const dom = computeInitialsDomPlacementPx({ ...args, pageWidth, pageHeight });
  return { ...domPlacementPxToNormalized(dom, pageWidth, pageHeight), dom };
}

export function validateInitialsDomPlacement(args: {
  page: number;
  signerIndex: number;
  placement: Vs01InitialsDomPlacementPx;
  isRightmostInRow?: boolean;
  shiftedForSignature?: boolean;
}): { passed: boolean; reason?: string } {
  const { placement, isRightmostInRow = false, shiftedForSignature = false } = args;
  const rightMin = VS01_INITIALS_DOM_RIGHT_MIN_PX;
  const rightMax = shiftedForSignature ? 220 : VS01_INITIALS_DOM_RIGHT_MAX_PX;
  const bottomMin = VS01_INITIALS_DOM_BOTTOM_MIN_PX;
  const bottomMax = shiftedForSignature ? 220 : VS01_INITIALS_DOM_BOTTOM_MAX_PX;

  if (placement.width <= 0 || placement.height <= 0) {
    return { passed: false, reason: "zero_box" };
  }
  if (placement.left < -1 || placement.top < -1) {
    return { passed: false, reason: "outside_page" };
  }

  if (isRightmostInRow) {
    if (placement.rightDistance < rightMin || placement.rightDistance > rightMax) {
      logVs01InitialsDomPlacementFail({
        page: args.page,
        signerIndex: args.signerIndex,
        reason: "right_margin",
        expectedRightPx: VS01_INITIALS_DOM_RIGHT_MARGIN_PX,
        actualRightPx: placement.rightDistance,
        expectedBottomPx: VS01_INITIALS_DOM_BOTTOM_MARGIN_PX,
        actualBottomPx: placement.bottomDistance,
      });
      return { passed: false, reason: "right_margin" };
    }
  }

  if (placement.bottomDistance < bottomMin || placement.bottomDistance > bottomMax) {
    logVs01InitialsDomPlacementFail({
      page: args.page,
      signerIndex: args.signerIndex,
      reason: "bottom_margin",
      expectedRightPx: VS01_INITIALS_DOM_RIGHT_MARGIN_PX,
      actualRightPx: placement.rightDistance,
      expectedBottomPx: VS01_INITIALS_DOM_BOTTOM_MARGIN_PX,
      actualBottomPx: placement.bottomDistance,
    });
    return { passed: false, reason: "bottom_margin" };
  }

  return { passed: true };
}

export function logInitialsDomPlacementForPage(args: {
  page: number;
  pageWidth: number;
  pageHeight: number;
  signerIndex: number;
  placement: Vs01InitialsDomPlacementPx;
}): void {
  logVs01InitialsDomPlacement({
    page: args.page,
    signerIndex: args.signerIndex,
    pageWidth: args.pageWidth,
    pageHeight: args.pageHeight,
    left: args.placement.left,
    top: args.placement.top,
    rightDistance: args.placement.rightDistance,
    bottomDistance: args.placement.bottomDistance,
    boxWidth: args.placement.width,
    boxHeight: args.placement.height,
  });
}

export function initialsDomPlacementCssStyle(
  placement: Vs01InitialsDomPlacementPx,
): { left: string; top: string; width: string; height: string; position: "absolute" } {
  return {
    position: "absolute",
    left: `${placement.left}px`,
    top: `${placement.top}px`,
    width: `${placement.width}px`,
    height: `${placement.height}px`,
  };
}

export function vs01InitialsDomDebugEnabled(): boolean {
  if (typeof import.meta === "undefined" || !import.meta.env?.DEV) return false;
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage?.getItem("lawdogVs01InitialsDomDebug") === "1";
  } catch {
    return false;
  }
}

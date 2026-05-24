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
export const VS01_INITIALS_RESERVED_BOTTOM_BAND_PX = 220;
export const VS01_INITIALS_DOM_COMPACT_BOX_WIDTH_PX = 72;
export const VS01_INITIALS_DOM_COMPACT_BOX_HEIGHT_PX = 42;

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

export function logVs01InitialsReservedBand(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[vs01-initials-reserved-band]", payload);
}

export function logVs01PageReservedBandEnforced(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[vs01-page-reserved-band-enforced]", payload);
}

export function logVs01InitialsTextCollisionCheck(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[vs01-initials-text-collision-check]", payload);
}

export function logVs01InitialsOverlapPrevented(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[vs01-initials-overlap-prevented]", payload);
}

export function logVs01InitialsOverlapFail(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.warn("[vs01-initials-overlap-fail]", payload);
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
  const { contentBottomLimit } = initialsReservedBandForPage(pageHeight);
  let top = pageHeight - bottomMargin - boxHeight - row * rowStep;
  top = Math.max(contentBottomLimit, top);

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

export type Vs01InitialsTextCollisionSummary = {
  collisionCount: number;
  worstOverlapPx: number;
};

export function initialsReservedBandForPage(pageHeight: number): {
  reservedBottomPx: number;
  contentBottomLimit: number;
} {
  const h = Math.max(1, pageHeight);
  const reservedBottomPx = Math.min(VS01_INITIALS_RESERVED_BOTTOM_BAND_PX, Math.max(0, h - 1));
  return {
    reservedBottomPx,
    contentBottomLimit: h - reservedBottomPx,
  };
}

function pxRectsOverlap(
  a: Pick<Vs01InitialsDomPlacementPx, "left" | "top" | "width" | "height">,
  b: Pick<Vs01InitialsDomPlacementPx, "left" | "top" | "width" | "height">,
): { overlaps: boolean; overlapPx: number } {
  const x = Math.max(0, Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left));
  const y = Math.max(0, Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top));
  return { overlaps: x > 0 && y > 0, overlapPx: Math.max(x, y) };
}

function normalizedTextRectToPagePx(
  rect: Vs01NormalizedRect,
  pageWidth: number,
  pageHeight: number,
): Vs01InitialsDomPlacementPx {
  const left = rect.x * pageWidth;
  const top = rect.y * pageHeight;
  const width = rect.width * pageWidth;
  const height = rect.height * pageHeight;
  return {
    left,
    top,
    width,
    height,
    rightDistance: pageWidth - left - width,
    bottomDistance: pageHeight - top - height,
  };
}

export function checkInitialsDomTextCollisions(args: {
  placement: Pick<Vs01InitialsDomPlacementPx, "left" | "top" | "width" | "height">;
  pageWidth: number;
  pageHeight: number;
  textRects?: readonly Vs01NormalizedRect[];
}): Vs01InitialsTextCollisionSummary {
  const textRects = args.textRects ?? [];
  let collisionCount = 0;
  let worstOverlapPx = 0;
  for (const rect of textRects) {
    if (rect.width <= 0 || rect.height <= 0) continue;
    const textPx = normalizedTextRectToPagePx(rect, args.pageWidth, args.pageHeight);
    const hit = pxRectsOverlap(args.placement, textPx);
    if (!hit.overlaps) continue;
    collisionCount += 1;
    worstOverlapPx = Math.max(worstOverlapPx, hit.overlapPx);
  }
  return { collisionCount, worstOverlapPx };
}

function placementWithBox(
  placement: Vs01InitialsDomPlacementPx,
  boxWidth: number,
  boxHeight: number,
  pageWidth: number,
  pageHeight: number,
): Vs01InitialsDomPlacementPx {
  const rightDistance = placement.rightDistance;
  const bottomDistance = placement.bottomDistance;
  const left = pageWidth - rightDistance - boxWidth;
  const top = pageHeight - bottomDistance - boxHeight;
  return { left, top, width: boxWidth, height: boxHeight, rightDistance, bottomDistance };
}

export function resolveInitialsDomTextOverlap(args: {
  page: number;
  signerIndex: number;
  placement: Vs01InitialsDomPlacementPx;
  pageWidth: number;
  pageHeight: number;
  textRects?: readonly Vs01NormalizedRect[];
}): { placement: Vs01InitialsDomPlacementPx; collision: Vs01InitialsTextCollisionSummary; strategy: string | null } {
  const { contentBottomLimit } = initialsReservedBandForPage(args.pageHeight);
  const fitsBand = (p: Vs01InitialsDomPlacementPx) =>
    p.top >= contentBottomLimit &&
    p.left >= 0 &&
    p.top >= 0 &&
    p.left + p.width <= args.pageWidth &&
    p.top + p.height <= args.pageHeight;
  const candidates: Array<{ strategy: string | null; placement: Vs01InitialsDomPlacementPx }> = [
    { strategy: null, placement: args.placement },
  ];

  const down = {
    ...args.placement,
    top: Math.min(
      args.pageHeight - args.placement.height - VS01_INITIALS_DOM_BOTTOM_MIN_PX,
      args.placement.top + 16,
    ),
  };
  down.bottomDistance = args.pageHeight - down.top - down.height;
  candidates.push({ strategy: "shift_down_inside_reserved_band", placement: down });

  const right = {
    ...args.placement,
    left: Math.min(
      args.pageWidth - args.placement.width - VS01_INITIALS_DOM_RIGHT_MIN_PX,
      args.placement.left + 16,
    ),
  };
  right.rightDistance = args.pageWidth - right.left - right.width;
  candidates.push({ strategy: "shift_right_inside_reserved_band", placement: right });

  candidates.push({
    strategy: "compact_box_inside_reserved_band",
    placement: placementWithBox(
      args.placement,
      VS01_INITIALS_DOM_COMPACT_BOX_WIDTH_PX,
      VS01_INITIALS_DOM_COMPACT_BOX_HEIGHT_PX,
      args.pageWidth,
      args.pageHeight,
    ),
  });

  let best = candidates[0]!;
  let bestCollision = checkInitialsDomTextCollisions({
    placement: best.placement,
    pageWidth: args.pageWidth,
    pageHeight: args.pageHeight,
    textRects: args.textRects,
  });

  for (const candidate of candidates) {
    if (!fitsBand(candidate.placement)) continue;
    const collision = checkInitialsDomTextCollisions({
      placement: candidate.placement,
      pageWidth: args.pageWidth,
      pageHeight: args.pageHeight,
      textRects: args.textRects,
    });
    if (collision.collisionCount === 0) {
      if (candidate.strategy) {
        logVs01InitialsOverlapPrevented({
          page: args.page,
          signerIndex: args.signerIndex,
          strategy: candidate.strategy,
        });
      }
      return { placement: candidate.placement, collision, strategy: candidate.strategy };
    }
    if (
      collision.collisionCount < bestCollision.collisionCount ||
      (collision.collisionCount === bestCollision.collisionCount &&
        collision.worstOverlapPx < bestCollision.worstOverlapPx)
    ) {
      best = candidate;
      bestCollision = collision;
    }
  }

  logVs01InitialsOverlapFail({
    page: args.page,
    signerIndex: args.signerIndex,
    reason: "text_collision_in_reserved_band",
  });
  return { placement: best.placement, collision: bestCollision, strategy: best.strategy };
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
  pageHeight?: number;
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

  if (args.pageHeight != null) {
    const { contentBottomLimit } = initialsReservedBandForPage(args.pageHeight);
    if (placement.top < contentBottomLimit - 1) {
      logVs01InitialsDomPlacementFail({
        page: args.page,
        signerIndex: args.signerIndex,
        reason: "outside_reserved_band",
        expectedRightPx: VS01_INITIALS_DOM_RIGHT_MARGIN_PX,
        actualRightPx: placement.rightDistance,
        expectedBottomPx: VS01_INITIALS_DOM_BOTTOM_MARGIN_PX,
        actualBottomPx: placement.bottomDistance,
      });
      return { passed: false, reason: "outside_reserved_band" };
    }
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

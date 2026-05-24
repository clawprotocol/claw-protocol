/**
 * Deterministic bottom-right initials placement for 8.5×11 (normalized) VS01 pages.
 * Does not depend on PDF text extraction for page eligibility — only for collision shift.
 */

import {
  clampPrepareFieldRectToSafeBounds,
  fieldRectsOverlap,
  prepareAutoInitialsPlacementDims,
  PREPARE_PAGE_FOOTER_BAND_Y,
  PREPARE_PAGE_WATERMARK_BAND_Y,
} from "./signingFields";
import { fieldOverlapsDocumentText } from "./vs01FieldGeometry";
import type { Vs01PageTextLayout } from "./vs01PageTextLayout";
import { textObstaclesForInitialsPlacement } from "./vs01InitialsSafeZone";

export type Vs01InitialsNormRect = { x: number; y: number; width: number; height: number };

/** Normalized letter page (0–1). */
export const CANONICAL_PAGE_WIDTH = 1;
export const CANONICAL_PAGE_HEIGHT = 1;
export const CANONICAL_INITIALS_RIGHT_MARGIN = 0.072;
export const CANONICAL_INITIALS_BOTTOM_MARGIN = 0.058;
export const CANONICAL_INITIALS_BOX_GAP = 0.014;
export const CANONICAL_INITIALS_MIN_Y = 0.085;
export const CANONICAL_INITIALS_MAX_COLS_PER_ROW = 2;

const FIELD_COLLISION_PAD = 0.014;
const TEXT_COLLISION_PAD = 0.012;
const FOOTER_COLLISION_PAD = 0.01;

export function logVs01InitialsCanonicalPagePlan(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[vs01-initials-canonical-page-plan]", payload);
}

export function logVs01InitialsCanonicalPlaced(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[vs01-initials-canonical-placed]", payload);
}

export function logVs01InitialsCanonicalShifted(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[vs01-initials-canonical-shifted]", payload);
}

export function logVs01InitialsCanonicalMissing(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.warn("[vs01-initials-canonical-missing]", payload);
}

function hardFooterObstacles(): Vs01InitialsNormRect[] {
  return [
    { x: 0, y: PREPARE_PAGE_FOOTER_BAND_Y, width: 1, height: 0.1 },
    { x: 0.04, y: PREPARE_PAGE_WATERMARK_BAND_Y, width: 0.92, height: 0.05 },
  ];
}

function withinPageBounds(rect: Vs01InitialsNormRect): boolean {
  if (rect.x < -1e-5 || rect.y < CANONICAL_INITIALS_MIN_Y - 1e-5) return false;
  if (rect.x + rect.width > CANONICAL_PAGE_WIDTH + 1e-5) return false;
  if (rect.y + rect.height > PREPARE_PAGE_FOOTER_BAND_Y + 1e-5) return false;
  return true;
}

export function overlapsHardFooterControls(rect: Vs01InitialsNormRect): boolean {
  return hardFooterObstacles().some((o) => fieldRectsOverlap(rect, o, FOOTER_COLLISION_PAD));
}

export function overlapsSignatureFieldObstacles(
  rect: Vs01InitialsNormRect,
  fieldObstacles: readonly Vs01InitialsNormRect[],
): boolean {
  return fieldObstacles.some((o) => fieldRectsOverlap(rect, o, FIELD_COLLISION_PAD));
}

/** Text rects that intersect the bottom-right initials anchor band (not full-page body). */
function bottomRightTextObstaclesForInitials(
  pageLayout: Vs01PageTextLayout | null | undefined,
  dims: { width: number; height: number },
  signerCount: number,
): ReturnType<typeof textObstaclesForInitialsPlacement> {
  const cols = Math.min(Math.max(1, signerCount), CANONICAL_INITIALS_MAX_COLS_PER_ROW);
  const bandWidth =
    cols * dims.width + Math.max(0, cols - 1) * CANONICAL_INITIALS_BOX_GAP + CANONICAL_INITIALS_RIGHT_MARGIN;
  const bandLeft = CANONICAL_PAGE_WIDTH - bandWidth;
  const bandTop =
    CANONICAL_PAGE_HEIGHT -
    CANONICAL_INITIALS_BOTTOM_MARGIN -
    Math.ceil(signerCount / cols) * (dims.height + CANONICAL_INITIALS_BOX_GAP);
  const obstacles = textObstaclesForInitialsPlacement(pageLayout);
  return obstacles.filter(
    (o) =>
      o.x + o.width > bandLeft - TEXT_COLLISION_PAD &&
      o.y + o.height > bandTop - TEXT_COLLISION_PAD,
  );
}

export function overlapsBottomRightText(
  rect: Vs01InitialsNormRect,
  pageLayout: Vs01PageTextLayout | null | undefined,
  signerCount = 2,
): boolean {
  const dims = prepareAutoInitialsPlacementDims();
  const obstacles = bottomRightTextObstaclesForInitials(pageLayout, dims, signerCount);
  if (!obstacles.length) return false;
  return fieldOverlapsDocumentText(rect, obstacles, TEXT_COLLISION_PAD);
}

export function canonicalInitialsGridPosition(args: {
  signerIndex: number;
  signerCount: number;
  dims: { width: number; height: number };
}): { x: number; y: number; row: number; colFromRight: number } {
  const signerCount = Math.max(1, args.signerCount);
  const colsPerRow = Math.min(signerCount, CANONICAL_INITIALS_MAX_COLS_PER_ROW);
  const row = Math.floor(args.signerIndex / colsPerRow);
  const colInRow = args.signerIndex % colsPerRow;
  const colFromRight = colsPerRow - 1 - colInRow;
  const x =
    CANONICAL_PAGE_WIDTH -
    CANONICAL_INITIALS_RIGHT_MARGIN -
    args.dims.width -
    colFromRight * (args.dims.width + CANONICAL_INITIALS_BOX_GAP);
  const y =
    CANONICAL_PAGE_HEIGHT -
    CANONICAL_INITIALS_BOTTOM_MARGIN -
    args.dims.height -
    row * (args.dims.height + CANONICAL_INITIALS_BOX_GAP);
  return { x, y, row, colFromRight };
}

export type PlaceCanonicalInitialsRectResult =
  | {
      rect: Vs01InitialsNormRect;
      shifted: boolean;
      shiftReason?: string;
      from?: Vs01InitialsNormRect;
      to?: Vs01InitialsNormRect;
    }
  | { rect: null; missingReason: string };

export function verifyCanonicalInitialsRectClear(args: {
  rect: Vs01InitialsNormRect;
  pageLayout?: Vs01PageTextLayout | null;
  fieldObstacles?: readonly Vs01InitialsNormRect[];
  signerCount?: number;
}): { ok: boolean; overlapSignature: boolean; overlapFooter: boolean; overlapText: boolean } {
  const overlapFooter = overlapsHardFooterControls(args.rect);
  const overlapSignature = overlapsSignatureFieldObstacles(args.rect, args.fieldObstacles ?? []);
  const overlapText = overlapsBottomRightText(args.rect, args.pageLayout, args.signerCount ?? 2);
  const ok =
    withinPageBounds(args.rect) && !overlapFooter && !overlapSignature && !overlapText;
  return { ok, overlapSignature, overlapFooter, overlapText };
}

/**
 * Bottom-right initials for one signer on one page. Shifts upward only for signature/footer/text at rect.
 */
export function placeCanonicalInitialsRect(args: {
  page: number;
  signerIndex: number;
  signerCount: number;
  fieldObstacles?: readonly Vs01InitialsNormRect[];
  pageLayout?: Vs01PageTextLayout | null;
  dims?: { width: number; height: number };
  logPagePlan?: boolean;
}): PlaceCanonicalInitialsRectResult {
  const dims = args.dims ?? prepareAutoInitialsPlacementDims();
  const signerCount = Math.max(1, args.signerCount);

  if (args.logPagePlan) {
    logVs01InitialsCanonicalPagePlan({
      page: args.page,
      pageWidth: CANONICAL_PAGE_WIDTH,
      pageHeight: CANONICAL_PAGE_HEIGHT,
      signerCount,
      boxWidth: dims.width,
      boxHeight: dims.height,
    });
  }

  const grid = canonicalInitialsGridPosition({
    signerIndex: args.signerIndex,
    signerCount,
    dims,
  });
  const step = dims.height + CANONICAL_INITIALS_BOX_GAP;
  const fromAnchor: Vs01InitialsNormRect = {
    x: grid.x,
    y: grid.y,
    width: dims.width,
    height: dims.height,
  };

  for (let attempt = 0; attempt < 48; attempt += 1) {
    const y = grid.y - attempt * step;
    if (y < CANONICAL_INITIALS_MIN_Y - 1e-5) break;
    const raw: Vs01InitialsNormRect = { x: grid.x, y, width: dims.width, height: dims.height };
    const rect = clampPrepareFieldRectToSafeBounds(raw, { kind: "initials" });
    const check = verifyCanonicalInitialsRectClear({
      rect,
      pageLayout: args.pageLayout,
      fieldObstacles: args.fieldObstacles,
      signerCount,
    });
    if (check.ok) {
      if (attempt > 0) {
        logVs01InitialsCanonicalShifted({
          page: args.page,
          signerIndex: args.signerIndex,
          reason: check.overlapText
            ? "text_in_bottom_right"
            : check.overlapSignature
              ? "signature_field"
              : "footer_band",
          from: fromAnchor,
          to: rect,
        });
      }
      logVs01InitialsCanonicalPlaced({
        page: args.page,
        signerIndex: args.signerIndex,
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      });
      return {
        rect,
        shifted: attempt > 0,
        shiftReason: attempt > 0 ? "shifted_up_for_clearance" : undefined,
        from: attempt > 0 ? fromAnchor : undefined,
        to: attempt > 0 ? rect : undefined,
      };
    }
  }

  const fallbackY = CANONICAL_INITIALS_MIN_Y;
  const fallbackRaw: Vs01InitialsNormRect = {
    x: grid.x,
    y: fallbackY,
    width: dims.width,
    height: dims.height,
  };
  const fallback = clampPrepareFieldRectToSafeBounds(fallbackRaw, { kind: "initials" });
  const fallbackCheck = verifyCanonicalInitialsRectClear({
    rect: fallback,
    pageLayout: null,
    fieldObstacles: args.fieldObstacles,
    signerCount,
  });
  if (fallbackCheck.ok || (!fallbackCheck.overlapSignature && !fallbackCheck.overlapFooter)) {
    logVs01InitialsCanonicalPlaced({
      page: args.page,
      signerIndex: args.signerIndex,
      rect: { x: fallback.x, y: fallback.y, width: fallback.width, height: fallback.height },
      fallback: true,
    });
    return { rect: fallback, shifted: true, shiftReason: "min_y_fallback" };
  }

  logVs01InitialsCanonicalMissing({
    page: args.page,
    signerIndex: args.signerIndex,
    signerCount,
    reason: "no_clear_rect_after_shift",
  });
  return { rect: null, missingReason: "no_clear_rect_after_shift" };
}

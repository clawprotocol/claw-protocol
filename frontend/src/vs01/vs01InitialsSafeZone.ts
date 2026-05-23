/**
 * Page-aware VS01 initials placement — verified safe zones from PDF/corpus text geometry.
 */

import {
  PREPARE_PAGE_FOOTER_BAND_Y,
  PREPARE_PAGE_WATERMARK_BAND_Y,
  clampPrepareFieldRectToSafeBounds,
  fieldRectsOverlap,
  prepareAutoInitialsPlacementDims,
} from "./signingFields";
import { fieldOverlapsDocumentText } from "./vs01FieldGeometry";
import type { Vs01PageTextLayout } from "./vs01PageTextLayout";
import { textRectsToObstacles } from "./vs01PageTextLayout";

const INITIALS_TEXT_PAD = 0.016;
const INITIALS_FIELD_PAD = 0.014;
const INITIALS_MARGIN_RIGHT = 0.072;
const INITIALS_BOTTOM_SCAN_X_MIN = 0.66;
const BELOW_TEXT_EXTRA_PAD = 0.022;

export type Vs01InitialsNormRect = { x: number; y: number; width: number; height: number };

export function logVs01InitialsCandidateTested(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[vs01-initials-candidate-tested]", payload);
}

export function logVs01InitialsSafeZoneSelected(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[vs01-initials-safe-zone-selected]", payload);
}

export function logVs01InitialsOverlapBlocked(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.warn("[vs01-initials-overlap-blocked]", payload);
}

function footerWatermarkObstacles(): Vs01InitialsNormRect[] {
  return [
    { x: 0, y: PREPARE_PAGE_FOOTER_BAND_Y, width: 1, height: 0.1 },
    { x: 0.04, y: PREPARE_PAGE_WATERMARK_BAND_Y, width: 0.92, height: 0.05 },
  ];
}

/** All readable PDF/corpus text on a page (not footer-band metadata). */
export function textObstaclesForInitialsPlacement(
  layout: Vs01PageTextLayout | null | undefined,
): Vs01InitialsNormRect[] {
  const rects = layout?.textRects ?? [];
  const readable = rects.filter((r) => r.kind !== "footer");
  const source = readable.length > 0 ? readable : rects;
  return textRectsToObstacles(source, INITIALS_TEXT_PAD);
}

export function computePageTextExtents(layout: Vs01PageTextLayout | null | undefined): {
  maxBottom: number;
  maxRight: number;
  minLeft: number;
} {
  const rects = (layout?.textRects ?? []).filter((r) => r.kind !== "footer");
  if (!rects.length) {
    return { maxBottom: 0.42, maxRight: 0.88, minLeft: 0.072 };
  }
  let maxBottom = 0;
  let maxRight = 0;
  let minLeft = 1;
  for (const r of rects) {
    maxBottom = Math.max(maxBottom, r.y + r.height);
    maxRight = Math.max(maxRight, r.x + r.width);
    minLeft = Math.min(minLeft, r.x);
  }
  return { maxBottom, maxRight, minLeft };
}

function withinPageBounds(rect: Vs01InitialsNormRect): boolean {
  if (rect.x < -1e-5 || rect.y < -1e-5) return false;
  if (rect.x + rect.width > 1 + 1e-5) return false;
  if (rect.y + rect.height > PREPARE_PAGE_FOOTER_BAND_Y + 1e-5) return false;
  return true;
}

export function verifyInitialsRectClear(args: {
  rect: Vs01InitialsNormRect;
  pageLayout: Vs01PageTextLayout | null | undefined;
  fieldObstacles: readonly Vs01InitialsNormRect[];
}): { ok: boolean; overlapText: boolean; overlapField: boolean } {
  const textObstacles = [
    ...footerWatermarkObstacles(),
    ...textObstaclesForInitialsPlacement(args.pageLayout),
  ];
  const overlapText = fieldOverlapsDocumentText(args.rect, textObstacles, INITIALS_TEXT_PAD);
  const overlapField = args.fieldObstacles.some((o) =>
    fieldRectsOverlap(args.rect, o, INITIALS_FIELD_PAD),
  );
  return { ok: !overlapText && !overlapField && withinPageBounds(args.rect), overlapText, overlapField };
}

function layoutHasReadableText(layout: Vs01PageTextLayout | null | undefined): boolean {
  return (layout?.textRects ?? []).some(
    (r) => r.kind === "body" || r.kind === "heading" || r.kind === "signature_label",
  );
}

export function yBelowPageText(
  layout: Vs01PageTextLayout | null | undefined,
  fieldHeight: number,
): number {
  if (!layoutHasReadableText(layout)) {
    return Math.min(
      1 - 0.058 - fieldHeight,
      PREPARE_PAGE_FOOTER_BAND_Y - fieldHeight - 0.012,
      PREPARE_PAGE_WATERMARK_BAND_Y - fieldHeight - 0.014,
    );
  }
  const { maxBottom } = computePageTextExtents(layout);
  const desired = maxBottom + BELOW_TEXT_EXTRA_PAD;
  if (desired + fieldHeight <= PREPARE_PAGE_FOOTER_BAND_Y - 0.008) {
    return Math.max(0.06, desired);
  }
  return Math.max(0.06, PREPARE_PAGE_FOOTER_BAND_Y - fieldHeight - 0.008);
}

export function pageBottomTooCrowdedForBelowTextPlacement(
  layout: Vs01PageTextLayout | null | undefined,
  fieldHeight: number,
): boolean {
  const { maxBottom } = computePageTextExtents(layout);
  return maxBottom + BELOW_TEXT_EXTRA_PAD + fieldHeight > PREPARE_PAGE_FOOTER_BAND_Y - 0.008;
}

function scanVerifiedInitialsRect(args: {
  page: number;
  partyIndex: number;
  pageLayout: Vs01PageTextLayout | null | undefined;
  fieldObstacles: readonly Vs01InitialsNormRect[];
  dims: { width: number; height: number };
}): { rect: Vs01InitialsNormRect | null; candidate: string | null } {
  const { width: w, height: h } = args.dims;
  const lane = Math.max(0, Math.floor(args.partyIndex));
  const xRight = Math.max(
    INITIALS_BOTTOM_SCAN_X_MIN,
    1 - INITIALS_MARGIN_RIGHT - w - lane * (w + 0.014),
  );
  const yMax = PREPARE_PAGE_FOOTER_BAND_Y - h - 0.008;
  for (let y = yMax; y >= 0.08 - 1e-5; y -= 0.026) {
    for (let x = xRight; x >= INITIALS_BOTTOM_SCAN_X_MIN - 1e-5; x -= 0.024) {
      const rect = clampPrepareFieldRectToSafeBounds({ x, y, width: w, height: h }, { kind: "initials" });
      const check = verifyInitialsRectClear({
        rect,
        pageLayout: args.pageLayout,
        fieldObstacles: args.fieldObstacles,
      });
      logVs01InitialsCandidateTested({
        page: args.page,
        partyIndex: args.partyIndex,
        candidate: `scan_${x.toFixed(3)}_${y.toFixed(3)}`,
        overlapText: check.overlapText,
        overlapField: check.overlapField,
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      });
      if (check.ok) {
        logVs01InitialsSafeZoneSelected({
          page: args.page,
          partyIndex: args.partyIndex,
          candidate: "page_scan",
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        });
        return { rect, candidate: "page_scan" };
      }
    }
  }
  return { rect: null, candidate: null };
}

function buildInitialsCandidates(args: {
  partyIndex: number;
  pageLayout: Vs01PageTextLayout | null | undefined;
  dims: { width: number; height: number };
  isSignaturePage: boolean;
}): Array<{ name: string; rect: Vs01InitialsNormRect }> {
  const { width: w, height: h } = args.dims;
  const lane = Math.max(0, Math.floor(args.partyIndex));
  const extents = computePageTextExtents(args.pageLayout);
  const yBelow = yBelowPageText(args.pageLayout, h);
  const xRight = Math.max(
    INITIALS_BOTTOM_SCAN_X_MIN,
    1 - INITIALS_MARGIN_RIGHT - w - lane * (w + 0.014),
  );
  const xLeft = Math.max(0.072, extents.minLeft);
  const out: Array<{ name: string; rect: Vs01InitialsNormRect }> = [];
  const crowdedBottom = pageBottomTooCrowdedForBelowTextPlacement(args.pageLayout, h);

  if (crowdedBottom) {
    out.push({
      name: "upper_right_clear_margin",
      rect: { x: xRight, y: 0.1 + lane * 0.038, width: w, height: h },
    });
    out.push({
      name: "upper_left_clear_margin",
      rect: { x: xLeft, y: 0.1 + lane * 0.038, width: w, height: h },
    });
  }

  out.push({
    name: "below_text_bottom_right",
    rect: { x: xRight, y: yBelow, width: w, height: h },
  });
  out.push({
    name: "below_text_bottom_left",
    rect: { x: xLeft + lane * (w + 0.014), y: yBelow, width: w, height: h },
  });

  const yMidRight = Math.min(yBelow, Math.max(extents.maxBottom + INITIALS_TEXT_PAD, 0.52));
  for (let y = yBelow; y >= yMidRight - 1e-5; y -= 0.038) {
    out.push({
      name: `margin_right_scan_${y.toFixed(3)}`,
      rect: { x: xRight, y, width: w, height: h },
    });
  }

  out.push({
    name: "footer_center_below_text",
    rect: { x: Math.max(0.072, 0.5 - w / 2), y: yBelow, width: w, height: h },
  });

  if (args.isSignaturePage) {
    const yUpperRight = Math.max(0.088, extents.maxBottom - h - 0.12);
    if (yUpperRight + h < extents.maxBottom - INITIALS_TEXT_PAD) {
      out.push({
        name: "signature_page_upper_right",
        rect: { x: xRight, y: yUpperRight, width: w, height: h },
      });
    }
  }

  return out;
}

export function isFooterOnlyPageLayout(layout: Vs01PageTextLayout | null | undefined): boolean {
  const rects = layout?.textRects ?? [];
  if (rects.length === 0) return false;
  if (rects.some((r) => r.kind === "body" || r.kind === "heading")) return false;
  return rects.every((r) => r.kind === "footer" || r.y >= 0.9);
}

export function layoutHasPlaceableInitialsContent(layout: Vs01PageTextLayout | null | undefined): boolean {
  if (isFooterOnlyPageLayout(layout)) return false;
  const rects = layout?.textRects ?? [];
  if (rects.length === 0) return true;
  return rects.some((r) => r.kind === "body" || r.kind === "heading" || r.kind === "signature_label");
}

export function selectVerifiedInitialsRect(args: {
  page: number;
  partyIndex: number;
  pageLayout: Vs01PageTextLayout | null | undefined;
  fieldObstacles: readonly Vs01InitialsNormRect[];
  dims?: { width: number; height: number };
  isSignaturePage?: boolean;
}): { rect: Vs01InitialsNormRect | null; candidate: string | null } {
  if (!layoutHasPlaceableInitialsContent(args.pageLayout)) {
    return { rect: null, candidate: null };
  }
  const dims = args.dims ?? prepareAutoInitialsPlacementDims();
  const candidates = buildInitialsCandidates({
    partyIndex: args.partyIndex,
    pageLayout: args.pageLayout,
    dims,
    isSignaturePage: args.isSignaturePage ?? false,
  });

  for (const c of candidates) {
    const rect = clampPrepareFieldRectToSafeBounds(c.rect, { kind: "initials" });
    const check = verifyInitialsRectClear({
      rect,
      pageLayout: args.pageLayout,
      fieldObstacles: args.fieldObstacles,
    });
    logVs01InitialsCandidateTested({
      page: args.page,
      partyIndex: args.partyIndex,
      candidate: c.name,
      overlapText: check.overlapText,
      overlapField: check.overlapField,
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    });
    if (!check.ok) {
      if (check.overlapText || check.overlapField) {
        logVs01InitialsOverlapBlocked({
          page: args.page,
          partyIndex: args.partyIndex,
          candidate: c.name,
          overlapText: check.overlapText,
          overlapField: check.overlapField,
          rect: { x: rect.x, y: rect.y },
        });
      }
      continue;
    }
    logVs01InitialsSafeZoneSelected({
      page: args.page,
      partyIndex: args.partyIndex,
      candidate: c.name,
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    });
    return { rect, candidate: c.name };
  }
  return scanVerifiedInitialsRect({
    page: args.page,
    partyIndex: args.partyIndex,
    pageLayout: args.pageLayout,
    fieldObstacles: args.fieldObstacles,
    dims,
  });
}

export function initialsFieldsOverlapDocumentText(
  fields: readonly { type: string; page: number; x: number; y: number; width: number; height: number }[],
  pageLayouts: readonly Vs01PageTextLayout[],
): boolean {
  for (const f of fields) {
    if (f.type !== "initials") continue;
    const layout = pageLayouts.find((l) => l.pageIndex === f.page) ?? null;
    const check = verifyInitialsRectClear({
      rect: f,
      pageLayout: layout,
      fieldObstacles: [],
    });
    if (!check.ok) return true;
  }
  return false;
}

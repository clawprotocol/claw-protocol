/**
 * Canonical signature overlay placement from measured DOM underline geometry.
 * Never estimate execution-line Y from typography — read `.vs01-canonical-signature-underline` rects.
 */

import type { Vs01NormalizedRect } from "./vs01FieldCssGeometry";
import {
  logVs01SignatureLineDomAnchor,
  logVs01SignatureOpticalOffset,
} from "./vs01CanonicalPageRender";
import {
  VS01_SIGNATURE_BELOW_LINE_FRAC,
  VS01_SIGNATURE_FIELD_LEFT_INSET_FRAC,
  VS01_SIGNATURE_FIELD_WIDTH_MAX_FRAC,
  VS01_SIGNATURE_FIELD_WIDTH_MIN_FRAC,
  VS01_SIGNATURE_FIELD_WIDTH_TARGET_FRAC,
  VS01_SIGNATURE_OPTICAL_OFFSET_NORM,
  VS01_SIGNATURE_OVERLAY_HEIGHT_NORM,
} from "./vs01VisualConstants";

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

/** Measured underline rects keyed by party index (0 = client, 1 = counterparty, …). */
export function measureSignatureUnderlineNormRects(pageSurface: HTMLElement): Map<number, Vs01NormalizedRect> {
  const surfaceRect = pageSurface.getBoundingClientRect();
  const out = new Map<number, Vs01NormalizedRect>();
  if (surfaceRect.width < 8 || surfaceRect.height < 8) return out;

  pageSurface.querySelectorAll<HTMLElement>("[data-vs01-signature-execution-line]").forEach((lineEl) => {
    const partyIndex = Number.parseInt(lineEl.getAttribute("data-vs01-signature-party") ?? "", 10);
    if (!Number.isFinite(partyIndex)) return;
    const underline = lineEl.querySelector<HTMLElement>(".vs01-canonical-signature-underline");
    if (!underline) return;
    const uRect = underline.getBoundingClientRect();
    out.set(
      partyIndex,
      clampNormalizedRect({
        x: (uRect.left - surfaceRect.left) / surfaceRect.width,
        y: (uRect.top - surfaceRect.top) / surfaceRect.height,
        width: uRect.width / surfaceRect.width,
        height: Math.max(uRect.height / surfaceRect.height, 0.001),
      }),
    );
  });
  return out;
}

/**
 * Map a measured underline rect (normalized to the canonical page box) to a signature field rect
 * anchored on the underline stroke baseline with a subtle optical Y correction.
 */
export function signatureFieldRectFromMeasuredUnderline(
  underline: Vs01NormalizedRect,
  fieldHeightNorm = VS01_SIGNATURE_OVERLAY_HEIGHT_NORM,
  opticalOffsetNorm = VS01_SIGNATURE_OPTICAL_OFFSET_NORM,
  belowLineFrac = VS01_SIGNATURE_BELOW_LINE_FRAC,
): Vs01NormalizedRect {
  const leftInset = underline.width * VS01_SIGNATURE_FIELD_LEFT_INSET_FRAC;
  const usableWidth = Math.max(0.18, underline.width - leftInset);
  const targetWidth = underline.width * VS01_SIGNATURE_FIELD_WIDTH_TARGET_FRAC;
  const fieldWidth = Math.min(
    usableWidth,
    Math.max(
      underline.width * VS01_SIGNATURE_FIELD_WIDTH_MIN_FRAC,
      Math.min(targetWidth, underline.width * VS01_SIGNATURE_FIELD_WIDTH_MAX_FRAC),
    ),
  );
  const fieldHeight = fieldHeightNorm;
  // Border-bottom sits on the underline box bottom edge in canonical flow CSS.
  const underlineBaselineY = underline.y + underline.height;
  // Shell hangs mostly above the stroke; only belowLineFrac extends beneath it.
  const preferredY =
    underlineBaselineY - fieldHeight * (1 - belowLineFrac) + opticalOffsetNorm;
  return clampNormalizedRect({
    x: underline.x + leftInset,
    y: preferredY,
    width: fieldWidth,
    height: fieldHeight,
  });
}

export function resolveSignatureDomFieldRect(args: {
  pageSurface: HTMLElement;
  partyIndex: number;
  normalizedFallback: Vs01NormalizedRect;
}): Vs01NormalizedRect {
  const measured = measureSignatureUnderlineNormRects(args.pageSurface).get(args.partyIndex);
  if (!measured) return args.normalizedFallback;
  const field = signatureFieldRectFromMeasuredUnderline(measured);
  logVs01SignatureLineDomAnchor({
    partyIndex: args.partyIndex,
    source: "dom_measured_underline",
    measured,
    field,
  });
  logVs01SignatureOpticalOffset({
    partyIndex: args.partyIndex,
    opticalOffsetNorm: VS01_SIGNATURE_OPTICAL_OFFSET_NORM,
    belowLineFrac: VS01_SIGNATURE_BELOW_LINE_FRAC,
    overlayHeightNorm: VS01_SIGNATURE_OVERLAY_HEIGHT_NORM,
    underlineBaselineY: measured.y + measured.height,
    fieldBottomY: field.y + field.height,
  });
  return field;
}

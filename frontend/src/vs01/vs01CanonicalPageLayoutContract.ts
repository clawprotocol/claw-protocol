/**
 * Single source of truth for VS01 canonical page geometry:
 * pagination stack units, DOM typography, and render-time line descriptors.
 */
import {
  VS01_PACKET_LINE_HEIGHT_PT,
  VS01_PACKET_MARGIN_LEFT_PT,
  VS01_PACKET_MARGIN_RIGHT_PT,
  VS01_PACKET_PAGE_HEIGHT_PT,
  VS01_PACKET_PAGE_WIDTH_PT,
} from "./vs01PacketLayoutConstants";
import {
  buildFlowLineDescriptors,
  type Vs01CanonicalFlowLineDescriptor,
} from "./vs01CanonicalTextLayout";
import {
  VS01_CANONICAL_BODY_FONT_SIZE_PX,
  VS01_CANONICAL_BODY_LINE_HEIGHT_PX,
  canonicalDescriptorDomHeightUnits,
  canonicalDescriptorVisualLineCount,
} from "./vs01CanonicalPreWrapMeasure";
import {
  VS01_EXECUTION_LABEL_LINE_HEIGHT_FRAC,
  VS01_EXECUTION_SIGNATURE_MARGIN_BOTTOM_EM,
  VS01_EXECUTION_SPACER_FRAC,
} from "./vs01VisualConstants";

export {
  VS01_CANONICAL_BODY_FONT_SIZE_PX,
  VS01_CANONICAL_BODY_LINE_HEIGHT_PX,
  VS01_CANONICAL_DOCUMENT_TITLE_FONT_SCALE,
} from "./vs01CanonicalPreWrapMeasure";
export const VS01_CANONICAL_DOCUMENT_TITLE_LINE_HEIGHT = 1.2;
export const VS01_CANONICAL_DOCUMENT_TITLE_MARGIN_BOTTOM_EM = 0.35;
export const VS01_CANONICAL_HEADING_LINE_SCALE = 1.02;
/** @deprecated Use measureCanonicalPreWrapVisualLineCount — kept for diagnostics only. */
export const VS01_CANONICAL_DOM_VISUAL_CHARS_PER_LINE = Math.floor(
  (VS01_PACKET_PAGE_WIDTH_PT - VS01_PACKET_MARGIN_LEFT_PT - VS01_PACKET_MARGIN_RIGHT_PT) / 7.0,
);

/** Normalized line height — multiplies stack units to page Y. */
export const VS01_CANONICAL_LINE_HEIGHT_NORM =
  VS01_PACKET_LINE_HEIGHT_PT / VS01_PACKET_PAGE_HEIGHT_PT;

export type Vs01CanonicalPageTypography = {
  pageWidthPx: number;
  pageHeightPx: number;
  fontSizePx: number;
  lineHeightPx: number;
  contentWidthPx: number;
};

export function canonicalPageTypography(pageWidthPx = VS01_PACKET_PAGE_WIDTH_PT): Vs01CanonicalPageTypography {
  const scale = pageWidthPx / VS01_PACKET_PAGE_WIDTH_PT;
  const pageHeightPx = VS01_PACKET_PAGE_HEIGHT_PT * scale;
  const fontSizePx = VS01_CANONICAL_BODY_FONT_SIZE_PX * scale;
  const lineHeightPx = VS01_CANONICAL_BODY_LINE_HEIGHT_PX * scale;
  const contentWidthPx =
    pageWidthPx - (VS01_PACKET_MARGIN_LEFT_PT + VS01_PACKET_MARGIN_RIGHT_PT) * scale;
  return { pageWidthPx, pageHeightPx, fontSizePx, lineHeightPx, contentWidthPx };
}

export function canonicalDomVisualWrapLineCount(
  line: string,
  contentWidthPx?: number,
  kind: Vs01CanonicalFlowLineDescriptor["kind"] = "body",
): number {
  return canonicalDescriptorVisualLineCount(
    { trimmed: line.trim(), kind, isSignatureExecutionLine: false },
    contentWidthPx,
  );
}

/** Stack units for one rendered flow-line block (must match Vs01CanonicalSigningPage CSS). */
export function canonicalDescriptorDomStackUnits(
  descriptor: Vs01CanonicalFlowLineDescriptor,
  contentWidthPx?: number,
): number {
  const t = descriptor.trimmed;
  if (!t) return VS01_EXECUTION_SPACER_FRAC;

  if (descriptor.isSignatureExecutionLine) {
    return 1.02 + VS01_EXECUTION_SIGNATURE_MARGIN_BOTTOM_EM;
  }
  if (descriptor.kind === "signature_label") {
    return VS01_EXECUTION_LABEL_LINE_HEIGHT_FRAC;
  }

  const heightUnits = canonicalDescriptorDomHeightUnits(descriptor, contentWidthPx);
  if (descriptor.kind === "document_title") {
    return heightUnits;
  }
  if (descriptor.kind === "heading") {
    return heightUnits * VS01_CANONICAL_HEADING_LINE_SCALE;
  }
  return heightUnits;
}

export function canonicalFlowLineDescriptorsForPage(
  flowLines: readonly string[],
  pageIndex: number,
): Vs01CanonicalFlowLineDescriptor[] {
  return buildFlowLineDescriptors(flowLines, { pageIndex });
}

export function canonicalPageRenderStackUnits(
  flowLines: readonly string[],
  pageIndex: number,
): number {
  return canonicalFlowLineDescriptorsForPage(flowLines, pageIndex).reduce(
    (sum, descriptor) => sum + canonicalDescriptorDomStackUnits(descriptor),
    0,
  );
}

/** Incremental stack units when appending one corpus line to a page (includes render-time splits). */
export function canonicalCorpusLineIncrementalStackUnits(
  pageLines: readonly string[],
  line: string,
  pageIndex: number,
): number {
  const before = canonicalFlowLineDescriptorsForPage(pageLines, pageIndex);
  const after = canonicalFlowLineDescriptorsForPage([...pageLines, line], pageIndex);
  let units = 0;
  for (let i = before.length; i < after.length; i += 1) {
    units += canonicalDescriptorDomStackUnits(after[i]!);
  }
  return units;
}

export function canonicalModelStackBottomNorm(
  contentTopNorm: number,
  flowLines: readonly string[],
  pageIndex: number,
): number {
  return contentTopNorm + canonicalPageRenderStackUnits(flowLines, pageIndex) * VS01_CANONICAL_LINE_HEIGHT_NORM;
}

/** Max normalized delta allowed between model stack bottom and measured DOM bottom. */
export const VS01_CANONICAL_MODEL_DOM_STACK_TOLERANCE_NORM = 0.028;

export function canonicalModelDomStackDeltaNorm(
  modelStackBottomNorm: number,
  actualDomContentBottomNorm: number,
): number {
  return Math.abs(modelStackBottomNorm - actualDomContentBottomNorm);
}

export function canonicalPageDomMatchesModel(args: {
  modelStackBottomNorm: number;
  actualDomContentBottomNorm: number;
  clipped: boolean;
  toleranceNorm?: number;
}): boolean {
  if (args.clipped) return false;
  const tolerance = args.toleranceNorm ?? VS01_CANONICAL_MODEL_DOM_STACK_TOLERANCE_NORM;
  return canonicalModelDomStackDeltaNorm(args.modelStackBottomNorm, args.actualDomContentBottomNorm) <= tolerance;
}

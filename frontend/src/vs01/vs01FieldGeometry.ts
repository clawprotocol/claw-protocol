/**
 * Canonical VS01 signing field geometry — shared by prepare and recipient signing surfaces.
 */

import {
  PREPARE_PAGE_FOOTER_BAND_Y,
  PREPARE_PAGE_WATERMARK_BAND_Y,
  clampPrepareFieldRectToSafeBounds,
  fieldRectsOverlap,
  prepareAutoInitialsPlacementDims,
  type PlacedSigningField,
} from "./signingFields";
import {
  findSignatureLineAnchorsFromCorpusText,
  logVs01FieldGeometry,
  logVs01SignatureAnchorFallbackVisibleLines,
  logVs01SignaturePlacementInvalid,
  signatureAnchorToPrepareRect,
  SIGNATURE_BY_LINE_HEIGHT,
} from "./vs01SignatureBlockAnchors";
import type { Vs01PrepareSigningRole } from "./vs01SignerFieldAssignment";
import { getVs01DocumentPageLayouts } from "./vs01DocumentLayoutCache";
import {
  findSignatureLinePlacementsFromPageLayout,
  pageLayoutForIndex,
  reconcileVs01PageLayouts,
  signatureTailTextRectsOnPage,
  textRectsToObstacles,
  type Vs01ByLinePlacement,
  type Vs01PageTextLayout,
} from "./vs01PageTextLayout";

export type Vs01FieldPlacementAnchorKind =
  | "by_line_layout"
  | "by_line_corpus"
  | "manual_required"
  | "initials_margin"
  | "initials_suppressed";

const TEXT_OVERLAP_PAD = 0.01;
const INITIALS_TEXT_PAD = 0.012;
const INITIALS_MARGIN_RIGHT = 0.072;
const INITIALS_BOTTOM_SCAN_X_MIN = 0.66;

export function logVs01FieldOverlapRejected(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.warn("[vs01-field-overlap-rejected]", payload);
}

export function logVs01SignatureAnchorUsed(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[vs01-signature-anchor-used]", payload);
}

export function logVs01InitialsPlacementSuppressed(payload: Record<string, unknown>): void {
  // eslint-disable-next-line no-console
  console.warn("[vs01-initials-placement-suppressed]", payload);
}

export function logVs01InitialsPlacementFallback(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[vs01-initials-placement-fallback]", payload);
}

export function logVs01InitialsFieldGenerated(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[vs01-initials-field-generated]", payload);
}

export function footerInitialsFallbackRect(
  partyIndex: number,
  dims?: { width: number; height: number },
): { x: number; y: number; width: number; height: number } {
  const { width: w, height: h } = dims ?? prepareAutoInitialsPlacementDims();
  const lane = Math.max(0, Math.floor(partyIndex));
  const compactW = Math.min(w, 0.1);
  return clampPrepareFieldRectToSafeBounds(
    {
      x: Math.max(INITIALS_BOTTOM_SCAN_X_MIN, 0.86 - lane * (compactW + 0.014)),
      y: 0.92,
      width: compactW,
      height: h,
    },
    { kind: "initials" },
  );
}

export function logVs01SignatureAnchorMissing(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.warn("[vs01-signature-anchor-missing]", payload);
}

export function logVs01InitialsPageDecision(payload: Record<string, unknown>): void {
  // eslint-disable-next-line no-console
  console.info("[vs01-initials-page-decision]", payload);
}

function witnessBlockPresent(corpusText: string | null | undefined): boolean {
  return /\bIN WITNESS WHEREOF\b/i.test(corpusText ?? "");
}

/** Text obstacles for signature fields — excludes the By: underline row (field sits on that line). */
export function textObstaclesForSignaturePlacement(
  layout: Vs01PageTextLayout | null | undefined,
): Array<{ x: number; y: number; width: number; height: number }> {
  const all = layout?.textRects ?? [];
  const byLines = all.filter((r) => /^(?:By|Signature)\s*:/i.test(r.text.trim()));
  const body = all.filter((r) => r.kind === "body");
  const filtered = body.filter((r) => {
    const partyLineAboveBy = byLines.some(
      (by) =>
        by.y >= r.y - 1e-5 &&
        by.y - (r.y + r.height) < 0.024 &&
        Math.abs(by.x - r.x) < 0.14,
    );
    return !partyLineAboveBy;
  });
  return textRectsToObstacles(filtered);
}

function footerWatermarkObstacles(): Array<{ x: number; y: number; width: number; height: number }> {
  return [
    { x: 0, y: PREPARE_PAGE_FOOTER_BAND_Y, width: 1, height: 0.1 },
    { x: 0.04, y: PREPARE_PAGE_WATERMARK_BAND_Y, width: 0.92, height: 0.05 },
  ];
}

export function fieldOverlapsDocumentText(
  rect: { x: number; y: number; width: number; height: number },
  textObstacles: readonly { x: number; y: number; width: number; height: number }[],
  pad = TEXT_OVERLAP_PAD,
): boolean {
  return textObstacles.some((t) => fieldRectsOverlap(rect, t, pad));
}

export function byLinePlacementToSignatureRect(placement: Vs01ByLinePlacement): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const height = Math.min(SIGNATURE_BY_LINE_HEIGHT, Math.max(0.03, placement.height * 1.5));
  const y = placement.y;
  return clampPrepareFieldRectToSafeBounds(
    {
      x: placement.x,
      y,
      width: placement.width,
      height,
    },
    { kind: "signature" },
  );
}

export function resolveSignatureRectForRole(args: {
  role: Pick<Vs01PrepareSigningRole, "partyIndex" | "kind">;
  roleCount: number;
  corpusText?: string | null;
  pageLayouts: readonly Vs01PageTextLayout[];
  /** Zero-based witness / signature block page (not assumed last PDF page). */
  lastPage: number;
}): {
  rect: { x: number; y: number; width: number; height: number } | null;
  anchorKind: Vs01FieldPlacementAnchorKind;
  byPlacement: Vs01ByLinePlacement | null;
} {
  const layout = pageLayoutForIndex(args.pageLayouts, args.lastPage);
  const byLines = findSignatureLinePlacementsFromPageLayout(layout);
  const by = byLines.find((b) => b.partyIndex === args.role.partyIndex) ?? null;

  if (by) {
    const rect = byLinePlacementToSignatureRect(by);
    const overlapsBody = fieldOverlapsDocumentText(rect, textObstaclesForSignaturePlacement(layout));
    if (!overlapsBody) {
      logVs01SignatureAnchorUsed({
        partyIndex: args.role.partyIndex,
        page: args.lastPage,
        blockHeading: by.blockHeading,
        x: rect.x,
        y: rect.y,
        width: rect.width,
        lineText: by.lineText,
      });
      logVs01FieldGeometry({
        page: args.lastPage,
        role: args.role.kind,
        type: "signature",
        rect,
        anchorKind: "by_line_layout",
        overlap: false,
        partyIndex: args.role.partyIndex,
      });
      return { rect, anchorKind: "by_line_layout", byPlacement: by };
    }
    logVs01FieldOverlapRejected({
      partyIndex: args.role.partyIndex,
      page: args.lastPage,
      reason: "by_line_overlaps_body",
    });
    logVs01SignatureAnchorUsed({
      partyIndex: args.role.partyIndex,
      page: args.lastPage,
      blockHeading: by.blockHeading,
      x: rect.x,
      y: rect.y,
      width: rect.width,
      lineText: by.lineText,
      overlapExempt: true,
    });
    return { rect, anchorKind: "by_line_layout", byPlacement: by };
  }

  if (witnessBlockPresent(args.corpusText)) {
    const corpusAnchors = findSignatureLineAnchorsFromCorpusText(args.corpusText ?? "");
    const corpusAnchor = corpusAnchors.find((a) => a.partyIndex === args.role.partyIndex) ?? null;
    if (corpusAnchor) {
      const rect = by
        ? byLinePlacementToSignatureRect(by)
        : signatureAnchorToPrepareRect({
            anchor: corpusAnchor,
            partyIndex: args.role.partyIndex,
            roleCount: args.roleCount,
            fieldType: "signature",
          });
      logVs01SignatureAnchorFallbackVisibleLines({
        partyIndex: args.role.partyIndex,
        page: args.lastPage,
        blockHeading: corpusAnchor.blockHeading,
        layoutByLines: byLines.length,
      });
      logVs01SignatureAnchorUsed({
        partyIndex: args.role.partyIndex,
        page: args.lastPage,
        blockHeading: corpusAnchor.blockHeading,
        x: rect.x,
        y: rect.y,
        width: rect.width,
        source: by ? "layout_visible_lines" : "corpus_visible_lines",
      });
      return { rect, anchorKind: by ? "by_line_layout" : "by_line_corpus", byPlacement: by };
    }
    logVs01SignaturePlacementInvalid({
      partyIndex: args.role.partyIndex,
      pageIndex: args.lastPage,
      visibleLineCount: byLines.length,
      signerCount: args.roleCount,
      reason: "witness_block_missing_execution_lines",
    });
    logVs01SignatureAnchorMissing({
      role: args.role.kind,
      partyIndex: args.role.partyIndex,
      pageIndex: args.lastPage,
      reason: "witness_block_missing_by_lines",
      byLinesOnPage: byLines.length,
    });
    return { rect: null, anchorKind: "manual_required", byPlacement: null };
  }

  const corpusAnchors = args.corpusText ? findSignatureLineAnchorsFromCorpusText(args.corpusText) : [];
  const corpusAnchor = corpusAnchors.find((a) => a.partyIndex === args.role.partyIndex) ?? null;
  if (corpusAnchor) {
    const rect = signatureAnchorToPrepareRect({
      anchor: corpusAnchor,
      partyIndex: args.role.partyIndex,
      roleCount: args.roleCount,
      fieldType: "signature",
    });
    logVs01SignatureAnchorUsed({
      partyIndex: args.role.partyIndex,
      page: args.lastPage,
      blockHeading: corpusAnchor.blockHeading,
      x: rect.x,
      y: rect.y,
      width: rect.width,
      source: "corpus_anchor",
    });
    return { rect, anchorKind: "by_line_corpus", byPlacement: null };
  }

  const fallback = signatureAnchorToPrepareRect({
    anchor: null,
    partyIndex: args.role.partyIndex,
    roleCount: args.roleCount,
    fieldType: "signature",
  });
  return { rect: fallback, anchorKind: "by_line_corpus", byPlacement: null };
}

export function findSafeInitialsRectOnPage(args: {
  page: number;
  partyIndex: number;
  pageLayout: Vs01PageTextLayout | null;
  corpusText?: string | null;
  /** Last page index when corpus has witness signature blocks. */
  signatureLastPage?: number;
  fieldObstacles: readonly { x: number; y: number; width: number; height: number }[];
  dims?: { width: number; height: number };
}): {
  rect: { x: number; y: number; width: number; height: number } | null;
  anchorKind: Vs01FieldPlacementAnchorKind;
} {
  const dims = args.dims ?? prepareAutoInitialsPlacementDims();
  const { width: w, height: h } = dims;
  const lane = Math.max(0, Math.floor(args.partyIndex));
  const textObstacles = [
    ...footerWatermarkObstacles(),
    ...textRectsToObstacles(
      (args.pageLayout?.textRects ?? []).filter((r) => r.kind === "body"),
      INITIALS_TEXT_PAD,
    ),
  ];

  const signatureLastPage =
    args.signatureLastPage ??
    (args.corpusText && findSignatureLineAnchorsFromCorpusText(args.corpusText).length > 0
      ? args.page
      : -1);
  if (signatureLastPage >= 0 && args.page > signatureLastPage) {
    logVs01InitialsPlacementSuppressed({
      page: args.page,
      reason: "post_signature_page",
      partyIndex: args.partyIndex,
    });
    return { rect: null, anchorKind: "initials_suppressed" };
  }
  if (signatureLastPage >= 0 && args.page === signatureLastPage) {
    const tailRects = args.pageLayout && args.corpusText
      ? signatureTailTextRectsOnPage(args.pageLayout, args.corpusText)
      : [];
    if (tailRects.length > 0) {
      logVs01InitialsPlacementSuppressed({
        page: args.page,
        reason: "signature_page_not_blank",
        partyIndex: args.partyIndex,
      });
      return { rect: null, anchorKind: "initials_suppressed" };
    }
  }

  const yBottom = Math.min(
    1 - 0.08 - h,
    PREPARE_PAGE_WATERMARK_BAND_Y - h - 0.014,
    PREPARE_PAGE_FOOTER_BAND_Y - h - 0.014,
  );
  const yLow = yBottom - 0.14;
  const xRight = 1 - INITIALS_MARGIN_RIGHT - w - lane * (w + 0.014);
  const pad = 0.014;

  const tryRect = (rect: { x: number; y: number; width: number; height: number }) => {
    if (rect.x + rect.width > 1 - INITIALS_MARGIN_RIGHT + 1e-5) return false;
    if (rect.x < INITIALS_BOTTOM_SCAN_X_MIN - 1e-5) return false;
    if (rect.y + rect.height > PREPARE_PAGE_FOOTER_BAND_Y + 1e-5) return false;
    if (fieldOverlapsDocumentText(rect, textObstacles, INITIALS_TEXT_PAD)) {
      logVs01FieldOverlapRejected({
        page: args.page,
        partyIndex: args.partyIndex,
        type: "initials",
        x: rect.x,
        y: rect.y,
      });
      return false;
    }
    if (args.fieldObstacles.some((o) => fieldRectsOverlap(rect, o, pad))) return false;
    return true;
  };

  for (let y = yBottom; y >= yLow - 1e-5; y -= 0.042) {
    for (let x = Math.min(xRight, 1 - w); x >= INITIALS_BOTTOM_SCAN_X_MIN - 1e-5; x -= 0.028) {
      const rect = clampPrepareFieldRectToSafeBounds(
        { x: Math.max(0, x), y: Math.max(0, y), width: w, height: h },
        { kind: "initials" },
      );
      if (tryRect(rect)) {
        logVs01FieldGeometry({
          page: args.page,
          type: "initials",
          rect,
          anchorKind: "initials_margin",
          overlap: false,
          partyIndex: args.partyIndex,
        });
        return { rect, anchorKind: "initials_margin" };
      }
    }
  }

  const footerRect = footerInitialsFallbackRect(args.partyIndex, dims);
  if (!args.fieldObstacles.some((o) => fieldRectsOverlap(footerRect, o, 0.01))) {
    logVs01InitialsPlacementFallback({
      page: args.page,
      partyIndex: args.partyIndex,
      reason: "footer_band",
      x: footerRect.x,
      y: footerRect.y,
    });
    logVs01InitialsFieldGenerated({
      page: args.page,
      partyIndex: args.partyIndex,
      rect: footerRect,
      source: "footer_fallback",
    });
    return { rect: footerRect, anchorKind: "initials_margin" };
  }

  logVs01InitialsPlacementSuppressed({
    page: args.page,
    reason: "no_clear_margin",
    partyIndex: args.partyIndex,
  });
  return { rect: null, anchorKind: "initials_suppressed" };
}

export function assertFieldsClearOfText(
  fields: readonly PlacedSigningField[],
  pageLayouts: readonly Vs01PageTextLayout[],
): boolean {
  for (const f of fields) {
    const layout = pageLayoutForIndex(pageLayouts, f.page);
    if (f.type === "signature") {
      const obstacles = textObstaclesForSignaturePlacement(layout);
      if (fieldOverlapsDocumentText(f, obstacles)) return false;
      continue;
    }
    const obstacles = textRectsToObstacles(
      (layout?.textRects ?? []).filter((r) => r.kind === "body"),
    );
    if (fieldOverlapsDocumentText(f, obstacles)) return false;
  }
  return true;
}

export function buildVs01PageLayoutsForPlacement(args: {
  corpusText?: string | null;
  pageCount: number;
  pageLayouts?: readonly Vs01PageTextLayout[] | null;
  documentId?: string | null;
  roleCount?: number;
}): Vs01PageTextLayout[] {
  return buildVs01PlacementContext(args).layouts;
}

export function buildVs01PlacementContext(args: {
  corpusText?: string | null;
  pageCount: number;
  pageLayouts?: readonly Vs01PageTextLayout[] | null;
  documentId?: string | null;
  roleCount?: number;
}) {
  const pdfLayouts =
    args.pageLayouts ?? getVs01DocumentPageLayouts(args.documentId) ?? undefined;
  return reconcileVs01PageLayouts({
    corpusText: args.corpusText,
    pageCount: args.pageCount,
    pageLayouts: pdfLayouts,
    roleCount: args.roleCount,
  });
}

export function resolveVs01WitnessPageIndex(args: {
  corpusText?: string | null;
  pageCount: number;
  pageLayouts?: readonly Vs01PageTextLayout[] | null;
  documentId?: string | null;
  roleCount?: number;
}): number {
  const ctx = buildVs01PlacementContext(args);
  return ctx.witnessPageIndex ?? Math.max(0, args.pageCount - 1);
}

/** True when witness block exists but not every role has a layout `By:` anchor. */
export function vs01SignatureManualPlacementRequired(args: {
  roles: readonly Vs01PrepareSigningRole[];
  corpusText?: string | null;
  pageLayouts: readonly Vs01PageTextLayout[];
  lastPage: number;
}): boolean {
  if (!witnessBlockPresent(args.corpusText)) return false;
  const layout = pageLayoutForIndex(args.pageLayouts, args.lastPage);
  const sigLines = findSignatureLinePlacementsFromPageLayout(layout);
  if (sigLines.length >= args.roles.length) return false;
  return true;
}

export function geometryUsesLayoutByAnchors(pageLayouts: readonly Vs01PageTextLayout[], lastPage: number): boolean {
  return findSignatureLinePlacementsFromPageLayout(pageLayoutForIndex(pageLayouts, lastPage)).length > 0;
}

/**
 * Canonical VS01 signing field geometry — shared by prepare and recipient signing surfaces.
 */

import {
  clampPrepareFieldRectToSafeBounds,
  fieldRectsOverlap,
  prepareAutoInitialsPlacementDims,
  type PlacedSigningField,
} from "./signingFields";
import {
  findSignatureLineAnchorsFromCorpusText,
  logVs01SignatureAnchorFallbackVisibleLines,
  logVs01SignaturePlacementInvalid,
  signatureAnchorToPrepareRect,
  SIGNATURE_BY_LINE_HEIGHT,
} from "./vs01SignatureBlockAnchors";
import {
  resolveSignatureFieldRect,
  type Vs01SignaturePlacementMode,
} from "./vs01SignaturePlacement";
import type { Vs01PrepareSigningRole } from "./vs01SignerFieldAssignment";
import { getVs01DocumentPageLayouts } from "./vs01DocumentLayoutCache";
import {
  computeInitialsDomPlacementNormalized,
  logInitialsDomPlacementForPage,
  VS01_INITIALS_DOM_REFERENCE_PAGE_HEIGHT_PX,
  VS01_INITIALS_DOM_REFERENCE_PAGE_WIDTH_PX,
} from "./vs01InitialsDomPlacement";
import { textObstaclesForInitialsPlacement, yBelowPageText } from "./vs01InitialsSafeZone";
import {
  findSignatureLinePlacementsFromPageLayout,
  pageLayoutForIndex,
  reconcileVs01PageLayouts,
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
  pageLayout: Vs01PageTextLayout | null | undefined,
  dims?: { width: number; height: number },
): { x: number; y: number; width: number; height: number } {
  const { width: w, height: h } = dims ?? prepareAutoInitialsPlacementDims();
  const lane = Math.max(0, Math.floor(partyIndex));
  const compactW = Math.min(w, 0.1);
  const y = yBelowPageText(pageLayout, h);
  return clampPrepareFieldRectToSafeBounds(
    {
      x: Math.max(INITIALS_BOTTOM_SCAN_X_MIN, 0.86 - lane * (compactW + 0.014)),
      y,
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
  const height = Math.min(SIGNATURE_BY_LINE_HEIGHT, Math.max(0.017, placement.height * 0.96));
  const x = placement.x + 0.034;
  const y = placement.y + Math.max(0, (placement.height - height) / 2) + 0.002;
  return clampPrepareFieldRectToSafeBounds(
    {
      x,
      y,
      width: Math.max(0.16, (placement.width - 0.034) * 0.86),
      height,
    },
    { kind: "signature" },
  );
}

function placementModeToAnchorKind(mode: Vs01SignaturePlacementMode): Vs01FieldPlacementAnchorKind {
  switch (mode) {
    case "explicit_execution":
    case "explicit_signature_line":
      return "by_line_layout";
    case "witness_region":
    case "synthesized_fallback":
      return "by_line_corpus";
    default:
      return "manual_required";
  }
}

export function resolveSignatureRectForRole(args: {
  role: Pick<Vs01PrepareSigningRole, "partyIndex" | "kind">;
  roleCount: number;
  corpusText?: string | null;
  pageLayouts: readonly Vs01PageTextLayout[];
  /** Zero-based witness / signature block page (not assumed last PDF page). */
  lastPage: number;
  fieldObstacles?: readonly PlacedSigningField[];
}): {
  rect: { x: number; y: number; width: number; height: number } | null;
  anchorKind: Vs01FieldPlacementAnchorKind;
  byPlacement: Vs01ByLinePlacement | null;
} {
  const layout = pageLayoutForIndex(args.pageLayouts, args.lastPage);
  const byLines = findSignatureLinePlacementsFromPageLayout(layout);
  const by = byLines.find((b) => b.partyIndex === args.role.partyIndex) ?? null;
  const corpusAnchors = args.corpusText ? findSignatureLineAnchorsFromCorpusText(args.corpusText) : [];
  const corpusAnchor = corpusAnchors.find((a) => a.partyIndex === args.role.partyIndex) ?? null;

  const resolved = resolveSignatureFieldRect({
    page: args.lastPage,
    partyIndex: args.role.partyIndex,
    roleCount: args.roleCount,
    fieldType: "signature",
    pageLayout: layout,
    corpusAnchor,
    fieldObstacles: args.fieldObstacles,
  });

  if (resolved.rect) {
    logVs01SignatureAnchorUsed({
      partyIndex: args.role.partyIndex,
      page: args.lastPage,
      blockHeading: by?.blockHeading ?? corpusAnchor?.blockHeading,
      x: resolved.rect.x,
      y: resolved.rect.y,
      width: resolved.rect.width,
      mode: resolved.mode,
      lineText: by?.lineText,
    });
    return {
      rect: resolved.rect,
      anchorKind: placementModeToAnchorKind(resolved.mode),
      byPlacement: by,
    };
  }

  if (witnessBlockPresent(args.corpusText) && byLines.length < args.roleCount) {
    logVs01SignatureAnchorFallbackVisibleLines({
      partyIndex: args.role.partyIndex,
      page: args.lastPage,
      blockHeading: corpusAnchor?.blockHeading,
      layoutByLines: byLines.length,
    });
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

  if (corpusAnchor) {
    const fallbackRect = signatureAnchorToPrepareRect({
      anchor: corpusAnchor,
      partyIndex: args.role.partyIndex,
      roleCount: args.roleCount,
      fieldType: "signature",
    });
    const retry = resolveSignatureFieldRect({
      page: args.lastPage,
      partyIndex: args.role.partyIndex,
      roleCount: args.roleCount,
      fieldType: "signature",
      pageLayout: layout,
      corpusAnchor,
      fieldObstacles: args.fieldObstacles,
    });
    if (retry.rect) {
      return {
        rect: retry.rect,
        anchorKind: placementModeToAnchorKind(retry.mode),
        byPlacement: by,
      };
    }
    logVs01FieldOverlapRejected({
      partyIndex: args.role.partyIndex,
      page: args.lastPage,
      reason: "corpus_fallback_rejected",
      y: fallbackRect.y,
    });
  }

  return { rect: null, anchorKind: "manual_required", byPlacement: by };
}

export function findSafeInitialsRectOnPage(args: {
  page: number;
  partyIndex: number;
  pageLayout: Vs01PageTextLayout | null;
  corpusText?: string | null;
  /** @deprecated Signature page is included; only post-document pages are skipped. */
  signatureLastPage?: number;
  fieldObstacles: readonly { x: number; y: number; width: number; height: number }[];
  dims?: { width: number; height: number };
  isSignaturePage?: boolean;
  /** Total signers on the agreement (for bottom-right grid spacing). */
  signerCount?: number;
}): {
  rect: { x: number; y: number; width: number; height: number } | null;
  anchorKind: Vs01FieldPlacementAnchorKind;
} {
  if (args.signatureLastPage != null && args.signatureLastPage >= 0 && args.page > args.signatureLastPage) {
    logVs01InitialsPlacementSuppressed({
      page: args.page,
      reason: "post_signature_page",
      partyIndex: args.partyIndex,
    });
    return { rect: null, anchorKind: "initials_suppressed" };
  }

  const signerCount = Math.max(1, args.signerCount ?? 2);
  const signatureObstacles = args.fieldObstacles.filter((o) => o.width > 0.04 && o.height > 0.02);
  const placedNorm = computeInitialsDomPlacementNormalized({
    signerIndex: args.partyIndex,
    signerCount,
    fieldObstacles: signatureObstacles,
    allowSignatureShift: true,
    pageWidth: VS01_INITIALS_DOM_REFERENCE_PAGE_WIDTH_PX,
    pageHeight: VS01_INITIALS_DOM_REFERENCE_PAGE_HEIGHT_PX,
  });
  if (args.partyIndex === 0) {
    logInitialsDomPlacementForPage({
      page: args.page,
      pageWidth: VS01_INITIALS_DOM_REFERENCE_PAGE_WIDTH_PX,
      pageHeight: VS01_INITIALS_DOM_REFERENCE_PAGE_HEIGHT_PX,
      signerIndex: args.partyIndex,
      placement: placedNorm.dom,
    });
  }
  logVs01InitialsFieldGenerated({
    page: args.page,
    partyIndex: args.partyIndex,
    rect: {
      x: placedNorm.x,
      y: placedNorm.y,
      width: placedNorm.width,
      height: placedNorm.height,
    },
    source: "dom_bottom_right",
  });
  return {
    rect: {
      x: placedNorm.x,
      y: placedNorm.y,
      width: placedNorm.width,
      height: placedNorm.height,
    },
    anchorKind: "initials_margin",
  };
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
    const obstacles = textObstaclesForInitialsPlacement(layout);
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

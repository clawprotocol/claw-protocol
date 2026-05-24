/**
 * Deterministic VS01 signature placement — witness band, collision checks, anchor priority.
 */

import {
  PREPARE_PAGE_FOOTER_BAND_Y,
  PREPARE_PAGE_WATERMARK_BAND_Y,
  clampPrepareFieldRectToSafeBounds,
  fieldRectsOverlap,
  type PlacedSigningField,
} from "./signingFields";
import { fieldOverlapsDocumentText } from "./vs01FieldGeometry";
import {
  fallbackSignatureY,
  SIGNATURE_BY_LINE_HEIGHT,
  SIGNATURE_BY_LINE_WIDTH,
  SIGNATURE_BY_LINE_X,
  type SignatureLineAnchor,
} from "./vs01SignatureBlockAnchors";
import {
  findSignatureLinePlacementsFromPageLayout,
  textRectsToObstacles,
  type Vs01ByLinePlacement,
  type Vs01PageTextLayout,
} from "./vs01PageTextLayout";

const SIGNATURE_TEXT_PAD = 0.014;
const SIGNATURE_FIELD_PAD = 0.012;
const DISCLOSURE_LINE_RE =
  /(?:LawDog|electronic signing step|Draft for Review|Execution and signature placement|Generated with LawDog)/i;

export type Vs01SignaturePlacementMode =
  | "explicit_execution"
  | "explicit_signature_line"
  | "witness_region"
  | "synthesized_fallback";

export function logVs01FooterZoneRejected(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.warn("[vs01-footer-zone-rejected]", payload);
}

export function logVs01SignatureAnchorSelected(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[vs01-signature-anchor-selected]", payload);
}

export function logVs01SignatureAnchorRejected(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.warn("[vs01-signature-anchor-rejected]", payload);
}

export function logVs01SignaturePlacementMode(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[vs01-signature-placement-mode]", payload);
}

export function logVs01SignatureAnchorValidation(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[vs01-signature-anchor-validation]", payload);
}

export function logVs01CollisionRejected(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.warn("[vs01-collision-rejected]", payload);
}

export function computeWitnessExecutionBand(
  layout: Vs01PageTextLayout | null | undefined,
): { yMin: number; yMax: number; witnessY: number | null } {
  const rects = layout?.textRects ?? [];
  const witnessRect = rects.find((r) => /\bIN WITNESS WHEREOF\b/i.test(r.text));
  const byLines = findSignatureLinePlacementsFromPageLayout(layout);
  const witnessY = witnessRect?.y ?? byLines[0]?.y ?? null;

  let yMin = witnessY ?? 0.52;
  if (byLines.length > 0) {
    yMin = Math.min(yMin, ...byLines.map((b) => b.y)) - 0.01;
  }

  let yMax = PREPARE_PAGE_FOOTER_BAND_Y - 0.016;
  for (const r of rects) {
    if (!DISCLOSURE_LINE_RE.test(r.text)) continue;
    if (witnessY != null && r.y < witnessY + 0.04) continue;
    yMax = Math.min(yMax, r.y - 0.012);
  }
  if (byLines.length > 0) {
    const lowestBy = Math.max(...byLines.map((b) => b.y + b.height));
    yMax = Math.max(yMin + 0.14, Math.max(yMax, lowestBy + 0.14));
  }
  yMax = Math.min(yMax, PREPARE_PAGE_FOOTER_BAND_Y - 0.016);
  return { yMin, yMax, witnessY };
}

/** Body/disclosure obstacles above the execution block — not witness Name/By rows. */
export function textObstaclesForSignatureCollision(
  layout: Vs01PageTextLayout | null | undefined,
): Array<{ x: number; y: number; width: number; height: number }> {
  const band = computeWitnessExecutionBand(layout);
  const rects = layout?.textRects ?? [];
  const readable = rects.filter((r) => {
    const t = r.text.trim();
    if (!t) return false;
    if (/^(?:By|Signature|Name|Title|Date)\s*:/i.test(t)) return false;
    if (/^(?:CLIENT|SERVICE PROVIDER|PARTY\s+\d+)\s*:?\s*$/i.test(t)) return false;
    if (/\bIN WITNESS WHEREOF\b/i.test(t)) return false;
    if (band.witnessY != null && r.y >= band.witnessY - 0.012 && r.x < 0.78) return false;
    if (DISCLOSURE_LINE_RE.test(t)) return true;
    if (r.kind === "footer") return true;
    if (r.y >= PREPARE_PAGE_WATERMARK_BAND_Y) return true;
    return (r.kind === "body" || r.kind === "heading") && r.y < band.yMin + 0.08;
  });
  const footerBand = [
    {
      x: 0,
      y: PREPARE_PAGE_WATERMARK_BAND_Y,
      width: 1,
      height: PREPARE_PAGE_FOOTER_BAND_Y - PREPARE_PAGE_WATERMARK_BAND_Y + 0.02,
    },
  ];
  return [...textRectsToObstacles(readable, SIGNATURE_TEXT_PAD), ...footerBand];
}

export function verifySignatureRectClear(args: {
  rect: { x: number; y: number; width: number; height: number };
  pageLayout: Vs01PageTextLayout | null | undefined;
  fieldObstacles?: readonly { x: number; y: number; width: number; height: number }[];
}): { ok: boolean; overlapText: boolean; overlapField: boolean; footerZone: boolean } {
  const band = computeWitnessExecutionBand(args.pageLayout);
  const obstacles = textObstaclesForSignatureCollision(args.pageLayout);
  const overlapText = fieldOverlapsDocumentText(args.rect, obstacles, SIGNATURE_TEXT_PAD);
  const overlapField = (args.fieldObstacles ?? []).some((o) =>
    fieldRectsOverlap(args.rect, o, SIGNATURE_FIELD_PAD),
  );
  const footerZone =
    args.rect.y + args.rect.height > band.yMax + 1e-5 ||
    args.rect.y + args.rect.height > PREPARE_PAGE_FOOTER_BAND_Y - 0.008;
  return { ok: !overlapText && !overlapField && !footerZone, overlapText, overlapField, footerZone };
}

export function byLinePlacementToFieldRect(
  placement: Vs01ByLinePlacement,
  fieldType: "signature" | "printed_name" | "text" | "date",
): { x: number; y: number; width: number; height: number } {
  if (fieldType === "signature") {
    const height = Math.min(SIGNATURE_BY_LINE_HEIGHT, Math.max(0.03, placement.height * 1.5));
    return clampPrepareFieldRectToSafeBounds(
      {
        x: placement.x,
        y: placement.y,
        width: Math.max(placement.width, SIGNATURE_BY_LINE_WIDTH * 0.85),
        height,
      },
      { kind: "signature" },
    );
  }
  const height = 0.038;
  const width = 0.3;
  const y = placement.y + (fieldType === "printed_name" ? 0.048 : fieldType === "date" ? 0.096 : 0.072);
  return clampPrepareFieldRectToSafeBounds(
    { x: placement.x, y, width, height },
    { kind: "signature" },
  );
}

function companionRectFromLayout(
  layout: Vs01PageTextLayout | null | undefined,
  by: Vs01ByLinePlacement,
  fieldType: "printed_name" | "text" | "date",
): { x: number; y: number; width: number; height: number } | null {
  const rects = (layout?.textRects ?? []).filter((r) => r.y > by.y - 0.005 && r.y < by.y + 0.2);
  const want =
    fieldType === "printed_name"
      ? /^Name\s*:/i
      : fieldType === "date"
        ? /^Date\s*:/i
        : /^Title\s*:/i;
  const match = rects.find((r) => want.test(r.text.trim()));
  if (!match) return null;
  return clampPrepareFieldRectToSafeBounds(
    { x: match.x, y: match.y, width: Math.max(0.22, match.width), height: 0.038 },
    { kind: "signature" },
  );
}

export function resolveSignatureFieldRect(args: {
  page: number;
  partyIndex: number;
  roleCount: number;
  fieldType: "signature" | "printed_name" | "text" | "date";
  pageLayout: Vs01PageTextLayout | null | undefined;
  corpusAnchor: SignatureLineAnchor | null;
  fieldObstacles?: readonly PlacedSigningField[];
}): {
  rect: { x: number; y: number; width: number; height: number } | null;
  mode: Vs01SignaturePlacementMode;
} {
  const band = computeWitnessExecutionBand(args.pageLayout);
  const byLines = findSignatureLinePlacementsFromPageLayout(args.pageLayout);
  const by = byLines.find((b) => b.partyIndex === args.partyIndex) ?? null;
  const obstacles = (args.fieldObstacles ?? []).map((f) => ({
    x: f.x,
    y: f.y,
    width: f.width,
    height: f.height,
  }));

  const tryRect = (
    rect: { x: number; y: number; width: number; height: number },
    mode: Vs01SignaturePlacementMode,
  ): { rect: typeof rect | null; mode: Vs01SignaturePlacementMode } => {
    if (rect.y < band.yMin - 0.02 || rect.y + rect.height > band.yMax + 1e-5) {
      logVs01FooterZoneRejected({
        page: args.page,
        partyIndex: args.partyIndex,
        y: rect.y,
        reason: "outside_witness_execution_band",
        yMin: band.yMin,
        yMax: band.yMax,
      });
      return { rect: null, mode };
    }
    const check = verifySignatureRectClear({
      rect,
      pageLayout: args.pageLayout,
      fieldObstacles: obstacles,
    });
    if (!check.ok) {
      logVs01CollisionRejected({
        blockType: args.fieldType,
        page: args.page,
        overlapText: check.overlapText,
        overlapField: check.overlapField,
        footerZone: check.footerZone,
        anchorType: mode,
        y: rect.y,
      });
      return { rect: null, mode };
    }
    logVs01SignatureAnchorSelected({
      page: args.page,
      partyIndex: args.partyIndex,
      fieldType: args.fieldType,
      mode,
      y: rect.y,
      x: rect.x,
    });
    const anchorLine = (args.pageLayout?.textRects ?? []).find(
      (r) =>
        /^(?:By|Signature)\s*:/i.test(r.text.trim()) &&
        Math.abs(r.y - rect.y) < 0.06,
    );
    logVs01SignatureAnchorValidation({
      page: args.page,
      signer: args.partyIndex,
      anchorText: anchorLine?.text?.trim() ?? mode,
      anchorY: rect.y,
      overlapsFooter: check.footerZone,
      overlapsBodyText: check.overlapText,
      accepted: true,
    });
    logVs01SignaturePlacementMode({ page: args.page, partyIndex: args.partyIndex, mode });
    return { rect, mode };
  };

  if (by) {
    if (args.fieldType === "signature") {
      return tryRect(byLinePlacementToFieldRect(by, "signature"), "explicit_signature_line");
    }
    const companion = companionRectFromLayout(args.pageLayout, by, args.fieldType);
    if (companion) {
      return tryRect(companion, "explicit_execution");
    }
    return tryRect(byLinePlacementToFieldRect(by, args.fieldType), "explicit_signature_line");
  }

  if (band.witnessY != null && args.corpusAnchor) {
    const slot =
      args.partyIndex / Math.max(1, args.roleCount - 1 || 1);
    const y =
      band.yMin +
      slot * Math.max(0.08, band.yMax - band.yMin - 0.12) -
      SIGNATURE_BY_LINE_HEIGHT * 0.4;
    const rect = clampPrepareFieldRectToSafeBounds(
      {
        x: 0.118,
        y,
        width: SIGNATURE_BY_LINE_WIDTH,
        height: SIGNATURE_BY_LINE_HEIGHT,
      },
      { kind: "signature" },
    );
    if (args.fieldType === "signature") {
      return tryRect(rect, "witness_region");
    }
  }

  if (args.fieldType === "signature") {
    const height = SIGNATURE_BY_LINE_HEIGHT;
    const synthesized = clampPrepareFieldRectToSafeBounds(
      {
        x: SIGNATURE_BY_LINE_X,
        y: fallbackSignatureY(args.partyIndex, args.roleCount, height),
        width: SIGNATURE_BY_LINE_WIDTH,
        height,
      },
      { kind: "signature" },
    );
    const fallback = tryRect(synthesized, "synthesized_fallback");
    if (fallback.rect) return fallback;
  }

  logVs01SignatureAnchorRejected({
    page: args.page,
    partyIndex: args.partyIndex,
    fieldType: args.fieldType,
    reason: "no_explicit_anchor",
  });
  return { rect: null, mode: "synthesized_fallback" };
}

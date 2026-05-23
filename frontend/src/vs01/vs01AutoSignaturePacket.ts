/**
 * Auto-place signature block fields on the last page for prepare_signing_packet (default, not manual-first).
 */

import {
  findNonOverlappingPrepareRect,
  newSigningFieldId,
  PREPARE_PAGE_FOOTER_BAND_Y,
  clampPrepareFieldRectToSafeBounds,
  type PlacedSigningField,
  type SigningPlacementValueContext,
} from "./signingFields";
import {
  findSignatureLineAnchorsFromCorpusText,
  signatureAnchorToPrepareRect,
  corpusHasPrefilledSignatureIdentity,
  logSignatureAnchorPlacementMiss,
  logVs01SignatureAnchorResolved,
  logVs01SignaturePlacementInvalid,
} from "./vs01SignatureBlockAnchors";
import {
  buildVs01PlacementContext,
  resolveSignatureRectForRole,
} from "./vs01FieldGeometry";
import type { Vs01PageTextLayout } from "./vs01PageTextLayout";
import {
  findSignatureLinePlacementsFromPageLayout,
  pageLayoutForIndex,
} from "./vs01PageTextLayout";
import { getVs01DocumentPageLayouts } from "./vs01DocumentLayoutCache";
import { stampPrepareSenderFieldOrReject, type Vs01PrepareSigningRole } from "./vs01SignerFieldAssignment";
import { PREPARE_FIELD_ASSIGNMENT_SOURCE } from "./vs01PrepareFieldPlacement";
import { buildPrepareTemplateValueContext, defaultPrepareTemplateStoredValue } from "./vs01PrepareTemplateField";
import { vs01DiagnosticsEnabled } from "./vs01SignerFieldAssignment";

export type AutoSignaturePacketResult = {
  fields: PlacedSigningField[];
  confidence: "high" | "draft";
  placedCount: number;
  mode: "signature_only" | "full_stack";
  requiredSignatureCount: number;
  optionalFieldCount: number;
};

export function logVs01PersistedGeometryHash(
  surface: string,
  fields: readonly Pick<PlacedSigningField, "type" | "page" | "x" | "y" | "width" | "height" | "assignedPartyIndex">[],
): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[vs01-persisted-geometry-hash]", {
    surface,
    hash: signingFieldGeometryHash(fields),
    fieldCount: fields.length,
    signatureCount: fields.filter((f) => f.type === "signature").length,
  });
}

export function signingFieldGeometryHash(fields: readonly Pick<PlacedSigningField, "type" | "page" | "x" | "y" | "width" | "height" | "assignedPartyIndex">[]): string {
  return fields
    .map((f) =>
      [
        f.assignedPartyIndex ?? -1,
        f.type,
        f.page,
        f.x.toFixed(4),
        f.y.toFixed(4),
        f.width.toFixed(4),
        f.height.toFixed(4),
      ].join(":"),
    )
    .sort()
    .join("|");
}

export function removeStaleSignatureOnlyAutoplaceFields(
  fields: readonly PlacedSigningField[],
): PlacedSigningField[] {
  return fields.filter((f) => {
    if (f.autoInitials) return true;
    if (f.assignmentSource !== "autoplace") return true;
    return f.type === "signature";
  });
}

const SIGNATURE_BLOCK_TOOLS: Array<{
  type: "signature" | "printed_name" | "text" | "date";
  textPurpose?: "title";
  dy: number;
}> = [
  { type: "signature", dy: 0 },
  { type: "printed_name", dy: 0.065 },
  { type: "text", textPurpose: "title", dy: 0.13 },
  { type: "date", dy: 0.195 },
];

const AUTO_SIGNATURE_ONLY_TOOLS: Array<{
  type: "signature" | "printed_name" | "text" | "date";
  textPurpose?: "title";
  dy: number;
}> = [{ type: "signature", dy: 0 }];

/** Keep auto signature stacks above footer/watermark bands. */
const AUTO_SIGNATURE_MAX_Y = 0.82;

function layoutHasCanonicalSignatureIdentityBlocks(
  pageLayouts: readonly Vs01PageTextLayout[],
  lastPage: number,
  roleCount: number,
): boolean {
  const layout = pageLayoutForIndex(pageLayouts, lastPage);
  const sigLines = findSignatureLinePlacementsFromPageLayout(layout);
  if (sigLines.length < Math.min(1, roleCount)) return false;
  const lines = (layout?.textRects ?? [])
    .map((r) => r.text.trim())
    .filter(Boolean);
  let completeBlocks = 0;
  for (const sig of sigLines) {
    const start = lines.findIndex((line) => line === sig.lineText);
    if (start < 0) continue;
    const window = lines.slice(start, start + 5).join("\n");
    if (/\bName\s*:\s*\S+/i.test(window) && /\bDate\s*:/i.test(window)) {
      completeBlocks += 1;
    }
  }
  return completeBlocks >= Math.min(roleCount, sigLines.length);
}

export type Vs01SigningAutoPlacementQuality = {
  placementOk: boolean;
  signatureOk: boolean;
  initialsOk: boolean;
  warnings: string[];
};

/** Gate misleading auto-placement success when signatures or initials are incomplete. */
export function evaluateVs01SigningAutoPlacementQuality(args: {
  signatureFieldCount: number;
  initialsFieldCount: number;
  roleCount: number;
  pageCount: number;
  witnessPageIndex: number;
  layoutSignatureLineCount: number;
  corpusAnchorCount: number;
  intendsInitials?: boolean;
}): Vs01SigningAutoPlacementQuality {
  const warnings: string[] = [];
  const signatureOk = args.signatureFieldCount >= args.roleCount;
  const minInitialsPages = Math.max(0, args.witnessPageIndex);
  const intendsInitials = args.intendsInitials !== false;
  const initialsOk =
    !intendsInitials ||
    (args.initialsFieldCount > 0 &&
      args.initialsFieldCount >= minInitialsPages * Math.max(1, args.roleCount) * 0.5);
  const hasVisibleAnchors =
    args.layoutSignatureLineCount >= args.roleCount || args.corpusAnchorCount >= args.roleCount;
  if (!signatureOk) warnings.push("signature_count_below_signer_count");
  if (intendsInitials && args.initialsFieldCount === 0) warnings.push("initials_missing");
  if (!hasVisibleAnchors) warnings.push("signature_lines_not_anchored_to_visible_block");
  const placementOk = signatureOk && (!intendsInitials || initialsOk) && hasVisibleAnchors;
  return { placementOk, signatureOk, initialsOk, warnings };
}

export function resolveAutoSignaturePacketMode(args: {
  corpusText?: string | null;
  pageLayouts?: readonly Vs01PageTextLayout[] | null;
  lastPage: number;
  roleCount: number;
}): "signature_only" | "full_stack" {
  if (corpusHasPrefilledSignatureIdentity(args.corpusText)) return "signature_only";
  if (args.pageLayouts?.length) {
    return layoutHasCanonicalSignatureIdentityBlocks(
      args.pageLayouts,
      args.lastPage,
      args.roleCount,
    )
      ? "signature_only"
      : "full_stack";
  }
  return "full_stack";
}

function resolveAutoSignatureBlockTools(mode: "signature_only" | "full_stack") {
  return mode === "signature_only" ? AUTO_SIGNATURE_ONLY_TOOLS : SIGNATURE_BLOCK_TOOLS;
}

function logAutoPacketMode(payload: Record<string, unknown>): void {
  // eslint-disable-next-line no-console
  console.info("[vs01-auto-packet-mode]", payload);
}

function logFieldGenerated(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[vs01-field-generated]", payload);
}

function logFieldRejected(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.warn("[vs01-field-rejected]", payload);
}

function roleHasSignatureBlock(existing: PlacedSigningField[], roleId: string, page: number): boolean {
  return existing.some(
    (f) =>
      f.page === page &&
      f.type === "signature" &&
      (f.assignedSignerRoleId ?? "").trim() === roleId.trim(),
  );
}

function createAutoField(
  role: Vs01PrepareSigningRole,
  page: number,
  type: "signature" | "printed_name" | "text" | "date",
  rect: { x: number; y: number; width: number; height: number },
  valueCtx: SigningPlacementValueContext,
  textPurpose?: "title",
): PlacedSigningField | null {
  const raw: PlacedSigningField = {
    id: newSigningFieldId(),
    type,
    page,
    ...rect,
    value: defaultPrepareTemplateStoredValue(type, role, valueCtx, textPurpose),
    ...(type === "text" && textPurpose ? { textPurpose } : {}),
    assignmentSource: "autoplace",
  };
  return stampPrepareSenderFieldOrReject(raw, role, role.roleId, PREPARE_FIELD_ASSIGNMENT_SOURCE);
}

/**
 * Places signature / printed name / title / date on the last page for each prepare role when none exist.
 */
export function buildAutoSignaturePacketForAllRoles(args: {
  roles: Vs01PrepareSigningRole[];
  pageCount: number;
  existingFields: PlacedSigningField[];
  ownerValueCtx: SigningPlacementValueContext;
  /** Agreement corpus text — used to anchor fields on signature block lines. */
  corpusText?: string | null;
  /** Rendered PDF/corpus text layout per page (canonical geometry). */
  pageLayouts?: readonly Vs01PageTextLayout[] | null;
  documentId?: string | null;
}): AutoSignaturePacketResult {
  const pageCount = Math.max(1, args.pageCount);
  const manual = args.existingFields.filter((f) => !f.autoInitials);
  const out: PlacedSigningField[] = [];
  let placedSoFar = [...manual];
  const roleCount = args.roles.length;
  const placementCtx = buildVs01PlacementContext({
    corpusText: args.corpusText,
    pageCount,
    pageLayouts: args.pageLayouts ?? getVs01DocumentPageLayouts(args.documentId),
    documentId: args.documentId,
    roleCount,
  });
  const pageLayouts = placementCtx.layouts;
  const witnessPage = placementCtx.witnessPageIndex ?? pageCount - 1;
  const anchors = args.corpusText ? findSignatureLineAnchorsFromCorpusText(args.corpusText) : [];
  const layoutByLines = findSignatureLinePlacementsFromPageLayout(
    pageLayoutForIndex(pageLayouts, witnessPage),
  );
  const mode = resolveAutoSignaturePacketMode({
    corpusText: args.corpusText,
    pageLayouts,
    lastPage: witnessPage,
    roleCount: args.roles.length,
  });
  const blockTools = resolveAutoSignatureBlockTools(mode);
  const witnessPresent = /\bIN WITNESS WHEREOF\b/i.test(args.corpusText ?? "");
  logAutoPacketMode({
    mode,
    pageCount,
    witnessPage,
    layoutSource: placementCtx.layoutSource,
    roleCount: args.roles.length,
    corpusHasCanonicalIdentity: corpusHasPrefilledSignatureIdentity(args.corpusText),
    layoutByLines: layoutByLines.length,
  });
  if (args.corpusText && anchors.length < Math.min(2, args.roles.length)) {
    logSignatureAnchorPlacementMiss({
      roleCount: args.roles.length,
      anchorsFound: anchors.length,
      corpusLen: args.corpusText.length,
    });
  }

  let anchorPlacements = 0;
  let layoutAnchorPlacements = 0;

  for (const role of args.roles) {
    if (roleHasSignatureBlock([...placedSoFar, ...out], role.roleId, witnessPage)) continue;
    const valueCtx =
      role.kind === "owner"
        ? args.ownerValueCtx
        : buildPrepareTemplateValueContext(role, args.ownerValueCtx);
    const anchor = anchors.find((a) => a.partyIndex === role.partyIndex) ?? null;

    for (const tool of blockTools) {
      if (tool.type === "signature") {
        const placement = resolveSignatureRectForRole({
          role,
          roleCount,
          corpusText: args.corpusText,
          pageLayouts,
          lastPage: witnessPage,
        });
        if (!placement.rect) {
          logFieldRejected({
            type: "signature",
            page: witnessPage,
            role: role.kind,
            source: "autoplace",
            reason: placement.anchorKind,
          });
          continue;
        }
        if (placement.anchorKind === "by_line_layout") {
          anchorPlacements += 1;
          layoutAnchorPlacements += 1;
          logVs01SignatureAnchorResolved({
            partyIndex: role.partyIndex,
            page: witnessPage,
            anchorKind: placement.anchorKind,
          });
        } else if (placement.anchorKind === "by_line_corpus" && anchors.some((a) => a.partyIndex === role.partyIndex)) {
          anchorPlacements += 1;
        }
        const clamped = placement.rect;
        if (clamped.y + clamped.height > PREPARE_PAGE_FOOTER_BAND_Y) {
          logFieldRejected({
            type: "signature",
            page: witnessPage,
            rect: clamped,
            source: "autoplace",
            reason: "footer_overlap",
          });
          continue;
        }
        const field = createAutoField(role, witnessPage, "signature", clamped, valueCtx);
        if (field) {
          out.push(field);
          placedSoFar = [...manual, ...out];
          logFieldGenerated({
            type: field.type,
            page: field.page,
            rect: { x: field.x, y: field.y, width: field.width, height: field.height },
            source: "signature_anchor",
            mode,
          });
        }
        continue;
      }

      if (witnessPresent && layoutByLines.length >= args.roles.length) continue;

      const anchored = signatureAnchorToPrepareRect({
        anchor,
        partyIndex: role.partyIndex,
        roleCount,
        fieldType: tool.type,
      });
      const desired = clampPrepareFieldRectToSafeBounds(
        {
          x: anchored.x,
          y: Math.min(AUTO_SIGNATURE_MAX_Y - tool.dy, anchored.y),
          width: 0.3,
          height: 0.04,
        },
        { kind: "signature" },
      );
      if (desired.y + desired.height > PREPARE_PAGE_FOOTER_BAND_Y) {
        logFieldRejected({
          type: tool.type,
          page: witnessPage,
          rect: desired,
          source: "autoplace",
          reason: "footer_overlap",
        });
        continue;
      }
      const resolved = findNonOverlappingPrepareRect({
        desiredRect: desired,
        page: witnessPage,
        roleId: role.roleId,
        existingFields: [...placedSoFar, ...out],
        placementMode: "manual",
      });
      const clamped = clampPrepareFieldRectToSafeBounds(resolved, { kind: "signature" });
      const field = createAutoField(role, witnessPage, tool.type, clamped, valueCtx, tool.textPurpose);
      if (field) {
        out.push(field);
        placedSoFar = [...manual, ...out];
        logFieldGenerated({
          type: field.type,
          page: field.page,
          rect: { x: field.x, y: field.y, width: field.width, height: field.height },
          source: "signature_stack",
          mode,
        });
      }
    }
  }

  const placedCount = out.length;
  const signatureFields = out.filter((f) => f.type === "signature").length;
  const optionalFieldCount = placedCount - signatureFields;
  const anchorBacked =
    layoutAnchorPlacements >= args.roles.length ||
    (witnessPresent &&
      layoutByLines.length >= args.roles.length &&
      anchorPlacements >= args.roles.length) ||
    (!witnessPresent && anchorPlacements >= args.roles.length && anchors.length >= args.roles.length);
  if (witnessPresent && layoutByLines.length < args.roles.length && anchors.length < args.roles.length) {
    logVs01SignaturePlacementInvalid({
      witnessPage,
      visibleLineCount: Math.max(layoutByLines.length, anchors.length),
      signerCount: args.roles.length,
      reason: "insufficient_visible_execution_lines",
    });
  }
  const confidence: AutoSignaturePacketResult["confidence"] =
    mode === "signature_only"
      ? signatureFields >= args.roles.length &&
        anchorBacked &&
        layoutAnchorPlacements >= args.roles.length &&
        out.every((f) => f.type === "signature")
        ? "high"
        : "draft"
      : placedCount >= args.roles.length * 2 && anchorBacked
        ? "high"
        : "draft";

  // eslint-disable-next-line no-console
  console.info("[signing-auto-placement-start]", {
    pageCount,
    witnessPage,
    roleCount: args.roles.length,
  });

  if (vs01DiagnosticsEnabled()) {
    // eslint-disable-next-line no-console
    console.info("[vs01-auto-signature-packet]", {
      pageCount,
      witnessPage,
      roleCount: args.roles.length,
      placedCount,
      mode,
      confidence,
    });
  }

  if (placedCount > 0) {
    const quality = evaluateVs01SigningAutoPlacementQuality({
      signatureFieldCount: signatureFields,
      initialsFieldCount: 0,
      roleCount: args.roles.length,
      pageCount,
      witnessPageIndex: witnessPage,
      layoutSignatureLineCount: layoutByLines.length,
      corpusAnchorCount: anchors.length,
      intendsInitials: false,
    });
    if (quality.placementOk && confidence === "high") {
      // eslint-disable-next-line no-console
      console.info("[signing-auto-placement-success]", { placedCount, confidence });
    } else {
      // eslint-disable-next-line no-console
      console.warn("[signing-auto-placement-incomplete]", {
        placedCount,
        confidence,
        warnings: quality.warnings,
      });
    }
    // eslint-disable-next-line no-console
    console.info("[signature-fields-auto-placed]", {
      signerCount: args.roles.length,
      fieldCount: placedCount,
      source: "signature_blocks",
      layoutSignatureLines: layoutByLines.length,
      corpusAnchors: anchors.length,
    });
  } else {
    // eslint-disable-next-line no-console
    console.warn("[signing-auto-placement-fallback]", { pageCount, roleCount: args.roles.length });
  }

  return {
    fields: out,
    confidence,
    placedCount,
    mode,
    requiredSignatureCount: signatureFields,
    optionalFieldCount,
  };
}

export function autoSignaturePacketStatusMessage(result: AutoSignaturePacketResult): string | null {
  if (result.placedCount <= 0) {
    // eslint-disable-next-line no-console
    console.info("[signing-auto-placement-needs-review]", { placedCount: 0 });
    return null;
  }
  if (result.mode === "signature_only") {
    return `${result.requiredSignatureCount} signature field${result.requiredSignatureCount === 1 ? "" : "s"} placed. Initials added where safe.`;
  }
  if (result.confidence === "high") {
    return "Signature fields were placed automatically. Review once, then send.";
  }
  return "Draft signature locations prepared — review placement before sending.";
}

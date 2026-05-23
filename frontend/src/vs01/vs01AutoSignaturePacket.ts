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
import { findSignatureLineAnchorsFromCorpusText, signatureAnchorToPrepareRect, corpusHasPrefilledSignatureIdentity, logSignatureAnchorPlacementMiss } from "./vs01SignatureBlockAnchors";
import { stampPrepareSenderFieldOrReject, type Vs01PrepareSigningRole } from "./vs01SignerFieldAssignment";
import { PREPARE_FIELD_ASSIGNMENT_SOURCE } from "./vs01PrepareFieldPlacement";
import { buildPrepareTemplateValueContext, defaultPrepareTemplateStoredValue } from "./vs01PrepareTemplateField";
import { vs01DiagnosticsEnabled } from "./vs01SignerFieldAssignment";

export type AutoSignaturePacketResult = {
  fields: PlacedSigningField[];
  confidence: "high" | "draft";
  placedCount: number;
};

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

function resolveAutoSignatureBlockTools(corpusText?: string | null) {
  if (corpusHasPrefilledSignatureIdentity(corpusText)) {
    return AUTO_SIGNATURE_ONLY_TOOLS;
  }
  return SIGNATURE_BLOCK_TOOLS;
}

function anchoredSignatureRect(args: {
  anchor: ReturnType<typeof findSignatureLineAnchorsFromCorpusText>[number] | null;
  partyIndex: number;
  roleCount: number;
}): { x: number; y: number; width: number; height: number } {
  return signatureAnchorToPrepareRect({
    anchor: args.anchor,
    partyIndex: args.partyIndex,
    roleCount: args.roleCount,
    fieldType: "signature",
  });
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
}): AutoSignaturePacketResult {
  const pageCount = Math.max(1, args.pageCount);
  const lastPage = pageCount - 1;
  const manual = args.existingFields.filter((f) => !f.autoInitials);
  const out: PlacedSigningField[] = [];
  let placedSoFar = [...manual];
  const roleCount = args.roles.length;
  const anchors = args.corpusText ? findSignatureLineAnchorsFromCorpusText(args.corpusText) : [];
  const blockTools = resolveAutoSignatureBlockTools(args.corpusText);
  if (args.corpusText && anchors.length < Math.min(2, args.roles.length)) {
    logSignatureAnchorPlacementMiss({
      roleCount: args.roles.length,
      anchorsFound: anchors.length,
      corpusLen: args.corpusText.length,
    });
  }

  for (const role of args.roles) {
    if (roleHasSignatureBlock([...placedSoFar, ...out], role.roleId, lastPage)) continue;
    const valueCtx =
      role.kind === "owner"
        ? args.ownerValueCtx
        : buildPrepareTemplateValueContext(role, args.ownerValueCtx);
    const anchor = anchors.find((a) => a.partyIndex === role.partyIndex) ?? null;

    for (const tool of blockTools) {
      const anchored =
        tool.type === "signature"
          ? anchoredSignatureRect({ anchor, partyIndex: role.partyIndex, roleCount })
          : signatureAnchorToPrepareRect({
              anchor,
              partyIndex: role.partyIndex,
              roleCount,
              fieldType: tool.type,
            });
      const useAnchorY = Boolean(anchor) || tool.type === "signature";
      const desired = clampPrepareFieldRectToSafeBounds(
        {
          x: anchored.x,
          y: useAnchorY ? anchored.y : Math.min(AUTO_SIGNATURE_MAX_Y - tool.dy, anchored.y),
          width: tool.type === "signature" ? anchored.width : 0.3,
          height: tool.type === "signature" ? anchored.height : 0.04,
        },
        { kind: "signature" },
      );
      if (desired.y + desired.height > PREPARE_PAGE_FOOTER_BAND_Y) continue;
      const resolved =
        tool.type === "signature" && anchor
          ? desired
          : findNonOverlappingPrepareRect({
              desiredRect: desired,
              page: lastPage,
              roleId: role.roleId,
              existingFields: [...placedSoFar, ...out],
              placementMode: "manual",
            });
      const clamped = clampPrepareFieldRectToSafeBounds(resolved, { kind: "signature" });
      const field = createAutoField(role, lastPage, tool.type, clamped, valueCtx, tool.textPurpose);
      if (field) {
        out.push(field);
        placedSoFar = [...manual, ...out];
      }
    }
  }

  const placedCount = out.length;
  const signatureOnlyMode = corpusHasPrefilledSignatureIdentity(args.corpusText);
  const confidence: AutoSignaturePacketResult["confidence"] =
    signatureOnlyMode
      ? placedCount >= args.roles.length && anchors.length >= Math.min(2, args.roles.length)
        ? "high"
        : "draft"
      : placedCount >= args.roles.length * 2 && anchors.length >= Math.min(2, args.roles.length)
        ? "high"
        : "draft";

  // eslint-disable-next-line no-console
  console.info("[signing-auto-placement-start]", {
    pageCount,
    lastPage,
    roleCount: args.roles.length,
  });

  if (vs01DiagnosticsEnabled()) {
    // eslint-disable-next-line no-console
    console.info("[vs01-auto-signature-packet]", {
      pageCount,
      lastPage,
      roleCount: args.roles.length,
      placedCount,
      confidence,
    });
  }

  if (placedCount > 0) {
    // eslint-disable-next-line no-console
    console.info("[signing-auto-placement-success]", { placedCount, confidence });
    // eslint-disable-next-line no-console
    console.info("[signature-fields-auto-placed]", {
      signerCount: args.roles.length,
      fieldCount: placedCount,
      source: "signature_blocks",
    });
  } else {
    // eslint-disable-next-line no-console
    console.warn("[signing-auto-placement-fallback]", { pageCount, roleCount: args.roles.length });
  }

  return { fields: out, confidence, placedCount };
}

export function autoSignaturePacketStatusMessage(result: AutoSignaturePacketResult): string | null {
  if (result.placedCount <= 0) {
    // eslint-disable-next-line no-console
    console.info("[signing-auto-placement-needs-review]", { placedCount: 0 });
    return null;
  }
  if (result.confidence === "high") {
    return "Signature fields were placed automatically. Review once, then send.";
  }
  return "Draft signature locations prepared — review placement before sending.";
}

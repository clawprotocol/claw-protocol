/**
 * Auto-place signature block fields on the last page for prepare_signing_packet (default, not manual-first).
 */

import {
  findNonOverlappingPrepareRect,
  newSigningFieldId,
  type PlacedSigningField,
  type SigningPlacementValueContext,
} from "./signingFields";
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
  { type: "printed_name", dy: 0.055 },
  { type: "text", textPurpose: "title", dy: 0.105 },
  { type: "date", dy: 0.155 },
];

function laneBaseX(partyIndex: number, roleCount: number): number {
  if (roleCount <= 1) return 0.1;
  const lane = Math.min(Math.max(0, partyIndex), roleCount - 1);
  return 0.08 + lane * (0.54 / Math.max(1, roleCount - 1)) * (roleCount > 2 ? 1 : 0);
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
}): AutoSignaturePacketResult {
  const pageCount = Math.max(1, args.pageCount);
  const lastPage = pageCount - 1;
  const manual = args.existingFields.filter((f) => !f.autoInitials);
  const out: PlacedSigningField[] = [];
  let placedSoFar = [...manual];
  const roleCount = args.roles.length;

  for (const role of args.roles) {
    if (roleHasSignatureBlock([...placedSoFar, ...out], role.roleId, lastPage)) continue;
    const valueCtx =
      role.kind === "owner"
        ? args.ownerValueCtx
        : buildPrepareTemplateValueContext(role, args.ownerValueCtx);
    const baseX = laneBaseX(role.partyIndex, roleCount);
    const baseY = 0.68;

    for (const tool of SIGNATURE_BLOCK_TOOLS) {
      const desired = {
        x: baseX,
        y: Math.min(0.88, baseY + tool.dy),
        width: tool.type === "signature" ? 0.34 : 0.3,
        height: tool.type === "signature" ? 0.07 : 0.04,
      };
      const resolved = findNonOverlappingPrepareRect({
        desiredRect: desired,
        page: lastPage,
        roleId: role.roleId,
        existingFields: [...placedSoFar, ...out],
        placementMode: "manual",
      });
      const field = createAutoField(role, lastPage, tool.type, resolved, valueCtx, tool.textPurpose);
      if (field) {
        out.push(field);
        placedSoFar = [...manual, ...out];
      }
    }
  }

  const placedCount = out.length;
  const confidence: AutoSignaturePacketResult["confidence"] =
    placedCount >= args.roles.length * 2 ? "high" : "draft";

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

  return { fields: out, confidence, placedCount };
}

export function autoSignaturePacketStatusMessage(result: AutoSignaturePacketResult): string | null {
  if (result.placedCount <= 0) return null;
  if (result.confidence === "high") {
    return "Signature fields prepared automatically — review placement below.";
  }
  return "We prepared draft signature locations for review.";
}

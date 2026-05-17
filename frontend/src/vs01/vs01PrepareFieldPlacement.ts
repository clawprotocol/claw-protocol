import {
  stampPrepareRecipientFieldOrReject,
  stampPrepareSenderFieldOrReject,
  type Vs01PrepareSigningRole,
  vs01DiagnosticsEnabled,
} from "./vs01SignerFieldAssignment";
import {
  clampFieldRectToPage,
  computePrepareRectFromClick,
  computeRecipientRectFromClick,
  findNonOverlappingPrepareRect,
  logVs01FieldOverlapAdjusted,
  newSigningFieldId,
  normalizePlacedFieldGeometryIfBelowMinimum,
  prepareAutoInitialsLaneAnchor,
  prepareAutoInitialsPlacementDims,
  type PlacedSigningField,
  type SigningFieldType,
  type SigningPlacementValueContext,
} from "./signingFields";
import { ownerPadFromPlacementContext, resolveVs01FieldValueForRole } from "./vs01FieldValueResolution";
import type { Vs01RecipientFieldType, Vs01RecipientPlacedField } from "./types";
import type { Vs01PrepareRoleAuthority } from "./vs01PrepareRoleAuthority";
import {
  defaultPrepareTemplateStoredValue,
  logVs01PlacementFieldAdded,
  logVs01PlacementFieldRejected,
} from "./vs01PrepareTemplateField";

export const PREPARE_FIELD_ASSIGNMENT_SOURCE = "prepare_active_role" as const;

export type PrepareStampedSenderField = PlacedSigningField & {
  assignedPartyId: string;
  assignedPartyIndex: number;
  assignedSignerRoleId: string;
  assignedSignerRoleKind: "owner" | "counterparty";
  assignedSignerRoleLabel: string;
  assignmentSource: typeof PREPARE_FIELD_ASSIGNMENT_SOURCE;
};

export type PrepareStampedRecipientField = Vs01RecipientPlacedField & {
  assignedPartyId: string;
  assignedPartyIndex: number;
  assignedSignerRoleId: string;
  assignedSignerRoleKind: "owner" | "counterparty";
  assignedSignerRoleLabel: string;
  assignmentSource: typeof PREPARE_FIELD_ASSIGNMENT_SOURCE;
};

export type PrepareSenderPlacementResult =
  | { ok: true; field: PrepareStampedSenderField }
  | { ok: false; reason: string };

function assertPrepareSenderStamped(f: PlacedSigningField): PrepareStampedSenderField | null {
  if (
    !f.assignedPartyId?.trim() ||
    f.assignedPartyIndex == null ||
    !f.assignedSignerRoleId?.trim() ||
    !f.assignedSignerRoleKind ||
    !f.assignedSignerRoleLabel?.trim() ||
    f.assignmentSource !== PREPARE_FIELD_ASSIGNMENT_SOURCE
  ) {
    logVs01PlacementFieldRejected({
      reason: "incomplete_sender_stamp",
      fieldType: f.type,
    });
    return null;
  }
  return f as PrepareStampedSenderField;
}

function assertPrepareRecipientStamped(f: Vs01RecipientPlacedField): PrepareStampedRecipientField | null {
  if (
    !f.assignedPartyId?.trim() ||
    f.assignedPartyIndex == null ||
    !f.assignedSignerRoleId?.trim() ||
    !f.assignedSignerRoleKind ||
    !f.assignedSignerRoleLabel?.trim() ||
    f.assignmentSource !== PREPARE_FIELD_ASSIGNMENT_SOURCE
  ) {
    logVs01PlacementFieldRejected({
      reason: "incomplete_recipient_stamp",
      fieldType: f.type,
    });
    return null;
  }
  return f as PrepareStampedRecipientField;
}

export function prepareAutoInitialsFieldId(roleId: string, page: number): string {
  const safe = roleId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 48);
  return `prep_auto_${safe}_p${page}`;
}

function createPreparePlacedFieldAtClick(
  type: SigningFieldType,
  page: number,
  clickX: number,
  clickY: number,
  role: Vs01PrepareSigningRole,
  ownerValueCtx: SigningPlacementValueContext,
  existingOnPage: PlacedSigningField[],
  options?: { autoInitials?: boolean },
): PlacedSigningField {
  const clicked = computePrepareRectFromClick(type, clickX, clickY, existingOnPage, role.roleId);
  const resolved = findNonOverlappingPrepareRect({
    desiredRect: clicked,
    page,
    roleId: role.roleId,
    existingFields: existingOnPage,
  });
  const { x, y, width, height } = resolved;
  if (resolved.adjusted) {
    logVs01FieldOverlapAdjusted({
      fieldType: type,
      roleIdShort: role.roleId.slice(0, 16),
      page,
      fromY: clicked.y,
      toY: y,
      fromX: clicked.x,
      toX: x,
    });
    if (resolved.adjusted && vs01DiagnosticsEnabled()) {
      // eslint-disable-next-line no-console
      console.info("[vs01-initials-overlap-resolved]", {
        fieldType: type,
        page,
        roleIdShort: role.roleId.slice(0, 16),
        fromX: clicked.x,
        fromY: clicked.y,
        toX: x,
        toY: y,
      });
    }
  }
  const auto = options?.autoInitials === true;
  return {
    id: newSigningFieldId(),
    type,
    page,
    x,
    y,
    width,
    height,
    value: defaultPrepareTemplateStoredValue(type, role, ownerValueCtx),
    ...(auto ? { autoInitials: true } : {}),
  };
}

/**
 * Role-scoped initials-on-every-page for prepare_signing_packet (sender layer).
 */
export function buildPrepareAutoInitialsEveryPage(args: {
  role: Vs01PrepareSigningRole;
  pageCount: number;
  skippedPages: Set<number>;
  existingFields: PlacedSigningField[];
  valueCtx: SigningPlacementValueContext;
}): PlacedSigningField[] {
  const dims = prepareAutoInitialsPlacementDims();
  const { width, height } = dims;
  const roleId = args.role.roleId;
  const roleLane = args.role.partyIndex;
  const pagesWithRoleInitials = new Set(
    args.existingFields
      .filter(
        (f) =>
          f.type === "initials" &&
          (f.assignedSignerRoleId ?? "").trim() === roleId,
      )
      .map((f) => f.page),
  );
  const out: PlacedSigningField[] = [];
  const placedSoFar: PlacedSigningField[] = [...args.existingFields];
  let added = 0;
  let skipped = 0;
  const laneAnchor = prepareAutoInitialsLaneAnchor(roleLane, dims);
  if (vs01DiagnosticsEnabled()) {
    // eslint-disable-next-line no-console
    console.info("[vs01-initials-lane-assigned]", {
      roleIdShort: roleId.slice(0, 16),
      partyIndex: args.role.partyIndex,
      roleLane,
      anchorX: laneAnchor.x,
      anchorY: laneAnchor.y,
      width,
      height,
    });
  }
  for (let p = 0; p < args.pageCount; p++) {
    if (args.skippedPages.has(p)) {
      skipped += 1;
      continue;
    }
    if (pagesWithRoleInitials.has(p)) {
      skipped += 1;
      continue;
    }
    const desired = clampFieldRectToPage(laneAnchor.x, laneAnchor.y, width, height);
    const onPage = placedSoFar.filter((f) => f.page === p);
    const resolved = findNonOverlappingPrepareRect({
      desiredRect: desired,
      page: p,
      roleId,
      existingFields: onPage,
    });
    if (resolved.adjusted && vs01DiagnosticsEnabled()) {
      // eslint-disable-next-line no-console
      console.info("[vs01-initials-overlap-resolved]", {
        roleIdShort: roleId.slice(0, 16),
        page: p,
        partyIndex: args.role.partyIndex,
        fromX: desired.x,
        fromY: desired.y,
        toX: resolved.x,
        toY: resolved.y,
      });
    }
    const raw: PlacedSigningField = {
      id: prepareAutoInitialsFieldId(roleId, p),
      type: "initials",
      page: p,
      x: resolved.x,
      y: resolved.y,
      width,
      height,
      value: defaultPrepareTemplateStoredValue("initials", args.role, args.valueCtx),
      autoInitials: true,
    };
    const stamped = stampPrepareSenderFieldOrReject(raw, args.role, roleId, PREPARE_FIELD_ASSIGNMENT_SOURCE);
    if (!stamped) continue;
    const withSource = {
      ...stamped,
      assignmentSource: PREPARE_FIELD_ASSIGNMENT_SOURCE as typeof PREPARE_FIELD_ASSIGNMENT_SOURCE,
    };
    const { field } = normalizePlacedFieldGeometryIfBelowMinimum(withSource);
    out.push(field);
    placedSoFar.push(field);
    added += 1;
  }
  if (vs01DiagnosticsEnabled()) {
    // eslint-disable-next-line no-console
    console.info("[vs01-initials-every-page-added]", {
      roleId: roleId,
      roleIdShort: roleId.slice(0, 16),
      pageCount: args.pageCount,
      addedCount: added,
      skippedCount: skipped,
      roleLane,
    });
  }
  return out;
}

export function createPrepareStampedSenderField(args: {
  authority: Vs01PrepareRoleAuthority;
  type: SigningFieldType;
  page: number;
  clickX: number;
  clickY: number;
  valueCtx: SigningPlacementValueContext;
  existingFields?: PlacedSigningField[];
  visualRoleId?: string | null;
  autoInitials?: boolean;
}): PrepareSenderPlacementResult {
  const resolved = args.authority.resolveRoleForPlacement({
    tool: args.type,
    page: args.page,
    visualRoleId: args.visualRoleId,
  });
  if (!resolved.ok) {
    logVs01PlacementFieldRejected({
      reason: resolved.reason,
      tool: args.type,
      page: args.page,
    });
    return { ok: false, reason: resolved.reason };
  }
  const onPage = (args.existingFields ?? []).filter((f) => f.page === args.page);
  const raw = createPreparePlacedFieldAtClick(
    args.type,
    args.page,
    args.clickX,
    args.clickY,
    resolved.role,
    args.valueCtx,
    onPage,
    args.autoInitials ? { autoInitials: true } : undefined,
  );
  const stamped = stampPrepareSenderFieldOrReject(
    raw,
    resolved.role,
    resolved.authorityRoleId,
    PREPARE_FIELD_ASSIGNMENT_SOURCE,
  );
  if (!stamped) {
    logVs01PlacementFieldRejected({
      reason: "stamp_sender_rejected",
      tool: args.type,
      page: args.page,
    });
    return { ok: false, reason: "stamp_sender_rejected" };
  }
  const withMeta = {
    ...stamped,
    assignmentSource: PREPARE_FIELD_ASSIGNMENT_SOURCE,
  };
  const { field } = normalizePlacedFieldGeometryIfBelowMinimum(withMeta);
  const ok = assertPrepareSenderStamped(field);
  if (!ok) {
    return { ok: false, reason: "incomplete_sender_stamp" };
  }
  logVs01PlacementFieldAdded({
    fieldType: ok.type,
    partyIndex: ok.assignedPartyIndex,
    partyId: ok.assignedPartyId,
    roleKind: ok.assignedSignerRoleKind,
    roleIdShort: ok.assignedSignerRoleId.slice(0, 16),
  });
  return { ok: true, field: ok };
}

export function createPrepareStampedRecipientField(args: {
  authority: Vs01PrepareRoleAuthority;
  type: Vs01RecipientFieldType;
  page: number;
  clickX: number;
  clickY: number;
  counterpartyId: string;
  displayName: string;
  email?: string;
  visualRoleId?: string | null;
}): PrepareStampedRecipientField | null {
  const resolved = args.authority.resolveRoleForPlacement({
    tool: args.type,
    page: args.page,
    visualRoleId: args.visualRoleId,
  });
  if (!resolved.ok) {
    logVs01PlacementFieldRejected({
      reason: resolved.reason,
      tool: args.type,
      page: args.page,
    });
    return null;
  }
  if (!resolved.role.vs01CounterpartyId) {
    logVs01PlacementFieldRejected({ reason: "owner_role_on_recipient_layer" });
    return null;
  }
  const { x, y, width, height } = computeRecipientRectFromClick(args.type, args.clickX, args.clickY);
  const ownerPad = ownerPadFromPlacementContext({
    typedName: args.displayName,
    initials: "",
    signerEmail: args.email,
  });
  const raw: Vs01RecipientPlacedField = {
    id: newSigningFieldId(),
    counterpartyId: args.counterpartyId,
    type: args.type,
    page: args.page,
    x,
    y,
    width,
    height,
    value: resolveVs01FieldValueForRole({
      fieldType: args.type,
      role: resolved.role,
      mode: "prepare_stored",
      ownerPad,
    }),
  };
  const stamped = stampPrepareRecipientFieldOrReject(
    raw,
    resolved.role,
    resolved.authorityRoleId,
    PREPARE_FIELD_ASSIGNMENT_SOURCE,
  );
  if (!stamped) {
    logVs01PlacementFieldRejected({ reason: "stamp_recipient_rejected", tool: args.type });
    return null;
  }
  const withMeta = {
    ...stamped,
    assignmentSource: PREPARE_FIELD_ASSIGNMENT_SOURCE,
  };
  const { field } = normalizePlacedFieldGeometryIfBelowMinimum(withMeta);
  const ok = assertPrepareRecipientStamped(field);
  if (ok) {
    logVs01PlacementFieldAdded({
      surface: "recipient_assign",
      fieldType: ok.type,
      partyIndex: ok.assignedPartyIndex,
      partyId: ok.assignedPartyId,
      roleKind: ok.assignedSignerRoleKind,
      roleIdShort: ok.assignedSignerRoleId.slice(0, 16),
    });
  }
  return ok;
}

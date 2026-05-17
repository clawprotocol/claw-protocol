import {
  stampPrepareRecipientFieldOrReject,
  stampPrepareSenderFieldOrReject,
  type Vs01PrepareSigningRole,
  vs01DiagnosticsEnabled,
} from "./vs01SignerFieldAssignment";
import {
  computePrepareRectFromClick,
  findNonOverlappingPrepareRect,
  isRectInPrepareAutoInitialsSafeZone,
  layoutPrepareAutoInitialsRectOnPage,
  logVs01FieldOverlapAdjusted,
  newSigningFieldId,
  normalizePlacedFieldGeometryIfBelowMinimum,
  prepareAutoInitialsPlacementDims,
  snapPreparePlacementClickY,
  type PlacedSigningField,
  type SigningFieldType,
  type SigningPlacementValueContext,
} from "./signingFields";
import type { Vs01RecipientFieldType, Vs01RecipientPlacedField } from "./types";
import type { Vs01PrepareRoleAuthority } from "./vs01PrepareRoleAuthority";
import {
  defaultPrepareTemplateStoredValue,
  logVs01PlacementFieldAdded,
  logVs01PlacementFieldRejected,
  logVs01PlacementRectComputed,
  logVs01PlacementRectFinal,
  logVs01PlacementRectNudged,
  logVs01PlacementRectSnapped,
} from "./vs01PrepareTemplateField";
import { resolvePreparePartyEntityLabel } from "./vs01PrepareSignerDisplay";

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
  type: SigningFieldType | Vs01RecipientFieldType,
  page: number,
  clickX: number,
  clickY: number,
  role: Vs01PrepareSigningRole,
  ownerValueCtx: SigningPlacementValueContext,
  existingOnPage: PlacedSigningField[],
  options?: { autoInitials?: boolean; textPurpose?: import("./signingFields").Vs01TextFieldPurpose },
): PlacedSigningField {
  const fieldType = type as SigningFieldType;
  const snap = snapPreparePlacementClickY(clickY, fieldType, existingOnPage, role.roleId);
  const clicked = computePrepareRectFromClick(fieldType, clickX, snap.clickY, existingOnPage, role.roleId);
  logVs01PlacementRectComputed({
    clickX,
    clickY,
    snappedY: snap.clickY,
    proposedX: clicked.x,
    proposedY: clicked.y,
    proposedW: clicked.width,
    proposedH: clicked.height,
    roleId: role.roleId,
    partyName: resolvePreparePartyEntityLabel(role),
    fieldType: type,
    page,
  });
  if (snap.snapped) {
    logVs01PlacementRectSnapped({
      clickY,
      snappedY: snap.clickY,
      reason: snap.reason,
      roleId: role.roleId,
      fieldType: type,
      page,
    });
  }
  const resolved = findNonOverlappingPrepareRect({
    desiredRect: clicked,
    page,
    roleId: role.roleId,
    existingFields: existingOnPage,
    placementMode: options?.autoInitials ? "auto_initials" : "manual",
  });
  const { x, y, width, height } = resolved;
  if (resolved.adjusted) {
    logVs01PlacementRectNudged({
      fieldType: type,
      roleIdShort: role.roleId.slice(0, 16),
      page,
      fromY: clicked.y,
      toY: y,
      fromX: clicked.x,
      toX: x,
    });
    logVs01FieldOverlapAdjusted({
      fieldType: type,
      roleIdShort: role.roleId.slice(0, 16),
      page,
      fromY: clicked.y,
      toY: y,
      fromX: clicked.x,
      toX: x,
    });
  }
  logVs01PlacementRectFinal({
    clickX,
    clickY,
    finalX: x,
    finalY: y,
    finalW: width,
    finalH: height,
    roleId: role.roleId,
    partyName: resolvePreparePartyEntityLabel(role),
    fieldType: type,
    page,
    adjusted: resolved.adjusted,
  });
  const auto = options?.autoInitials === true;
  const textPurpose = options?.textPurpose;
  return {
    id: newSigningFieldId(),
    type,
    page,
    x,
    y,
    width,
    height,
    value: defaultPrepareTemplateStoredValue(type, role, ownerValueCtx, textPurpose),
    ...(auto ? { autoInitials: true } : {}),
    ...(type === "text" && textPurpose ? { textPurpose } : {}),
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
  const partyIndex = args.role.partyIndex;
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
  for (let p = 0; p < args.pageCount; p++) {
    if (args.skippedPages.has(p)) {
      skipped += 1;
      continue;
    }
    if (pagesWithRoleInitials.has(p)) {
      skipped += 1;
      continue;
    }
    const onPage = placedSoFar.filter((f) => f.page === p);
    const layout = layoutPrepareAutoInitialsRectOnPage({
      partyIndex,
      page: p,
      existingFields: placedSoFar,
      roleId,
      dims,
    });
    if (vs01DiagnosticsEnabled()) {
      // eslint-disable-next-line no-console
      console.info("[vs01-auto-initials-layout]", {
        page: p,
        roleIdShort: roleId.slice(0, 16),
        partyIndex,
        lane: layout.lane,
        collisionCount: layout.collisionCount,
        width,
        height,
      });
    }
    if (!layout.rect) {
      skipped += 1;
      if (vs01DiagnosticsEnabled()) {
        // eslint-disable-next-line no-console
        console.info("[vs01-auto-initials-layout]", {
          page: p,
          roleIdShort: roleId.slice(0, 16),
          skipped: true,
          reason: "no_clean_bottom_slot",
        });
      }
      continue;
    }
    const resolved = findNonOverlappingPrepareRect({
      desiredRect: layout.rect,
      page: p,
      roleId,
      existingFields: onPage,
      placementMode: "auto_initials",
    });
    if (resolved.adjusted && vs01DiagnosticsEnabled()) {
      // eslint-disable-next-line no-console
      console.info("[vs01-auto-initials-collision-resolved]", {
        roleIdShort: roleId.slice(0, 16),
        page: p,
        partyIndex,
        lane: layout.lane,
        fromX: layout.rect.x,
        fromY: layout.rect.y,
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
    if (vs01DiagnosticsEnabled()) {
      // eslint-disable-next-line no-console
      console.info("[vs01-auto-initials-final]", {
        page: p,
        roleIdShort: roleId.slice(0, 16),
        partyIndex,
        lane: layout.lane,
        x: field.x,
        y: field.y,
        width: field.width,
        height: field.height,
        inSafeZone: isRectInPrepareAutoInitialsSafeZone(field),
      });
    }
  }
  if (vs01DiagnosticsEnabled()) {
    // eslint-disable-next-line no-console
    console.info("[vs01-initials-every-page-added]", {
      roleId: roleId,
      roleIdShort: roleId.slice(0, 16),
      pageCount: args.pageCount,
      addedCount: added,
      skippedCount: skipped,
      partyIndex,
    });
  }
  return out;
}

export function prepareAutoInitialsSkipKey(roleId: string, page: number): string {
  return `${roleId.trim()}:${page}`;
}

export function parsePrepareAutoInitialsSkipKey(key: string): { roleId: string; page: number } | null {
  const i = key.lastIndexOf(":");
  if (i <= 0) return null;
  const roleId = key.slice(0, i).trim();
  const page = parseInt(key.slice(i + 1), 10);
  if (!roleId || !Number.isFinite(page) || page < 0) return null;
  return { roleId, page };
}

/** Packet-level: auto-initials for every prepare role on every page (deduped per role/page). */
export function buildPrepareAutoInitialsForAllRoles(args: {
  roles: Vs01PrepareSigningRole[];
  pageCount: number;
  skippedSlots: Set<string>;
  existingFields: PlacedSigningField[];
  valueCtxForRole: (role: Vs01PrepareSigningRole) => SigningPlacementValueContext;
}): PlacedSigningField[] {
  const manual = args.existingFields.filter((f) => !f.autoInitials);
  const out: PlacedSigningField[] = [];
  let placedSoFar: PlacedSigningField[] = [...manual];
  for (const role of args.roles) {
    const skippedPages = new Set<number>();
    for (const key of args.skippedSlots) {
      const parsed = parsePrepareAutoInitialsSkipKey(key);
      if (parsed?.roleId === role.roleId) skippedPages.add(parsed.page);
    }
    const batch = buildPrepareAutoInitialsEveryPage({
      role,
      pageCount: args.pageCount,
      skippedPages,
      existingFields: [...placedSoFar, ...out],
      valueCtx: args.valueCtxForRole(role),
    });
    out.push(...batch);
    placedSoFar = [...manual, ...out];
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
  textPurpose?: import("./signingFields").Vs01TextFieldPurpose;
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
    args.autoInitials ? { autoInitials: true, textPurpose: args.textPurpose } : { textPurpose: args.textPurpose },
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
  existingFields?: Vs01RecipientPlacedField[];
  textPurpose?: import("./signingFields").Vs01TextFieldPurpose;
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
  const onPage = (args.existingFields ?? []).map((f) => ({
    ...f,
    assignedSignerRoleId: f.assignedSignerRoleId,
    type: f.type as SigningFieldType,
  }));
  const placed = createPreparePlacedFieldAtClick(
    args.type,
    args.page,
    args.clickX,
    args.clickY,
    resolved.role,
    {
      typedName: (resolved.role.signerName ?? "").trim() || "",
      initials: "",
      signerEmail: args.email,
    },
    onPage as PlacedSigningField[],
    args.type === "text" && args.textPurpose ? { textPurpose: args.textPurpose } : undefined,
  );
  const raw: Vs01RecipientPlacedField = {
    id: placed.id,
    counterpartyId: args.counterpartyId,
    type: args.type,
    page: placed.page,
    x: placed.x,
    y: placed.y,
    width: placed.width,
    height: placed.height,
    value: placed.value,
    ...(args.type === "text" && args.textPurpose ? { textPurpose: args.textPurpose } : {}),
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

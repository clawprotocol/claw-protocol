import {
  buildPreparePlacementValueContext,
  stampPrepareRecipientFieldOrReject,
  stampPrepareSenderFieldOrReject,
  type Vs01PrepareSigningRole,
  vs01DiagnosticsEnabled,
} from "./vs01SignerFieldAssignment";
import {
  clampFieldRectToPage,
  computeRecipientRectFromClick,
  createPlacedFieldAtClick,
  defaultRecipientFieldValue,
  getVs01DefaultFieldGeometry,
  newSigningFieldId,
  normalizePlacedFieldGeometryIfBelowMinimum,
  type PlacedSigningField,
  type SigningFieldType,
  type SigningPlacementValueContext,
} from "./signingFields";
import type { Vs01RecipientFieldType, Vs01RecipientPlacedField } from "./types";
import type { Vs01PrepareRoleAuthority } from "./vs01PrepareRoleAuthority";

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

function assertPrepareSenderStamped(f: PlacedSigningField): PrepareStampedSenderField | null {
  if (
    !f.assignedPartyId?.trim() ||
    f.assignedPartyIndex == null ||
    !f.assignedSignerRoleId?.trim() ||
    !f.assignedSignerRoleKind ||
    !f.assignedSignerRoleLabel?.trim() ||
    f.assignmentSource !== PREPARE_FIELD_ASSIGNMENT_SOURCE
  ) {
    if (vs01DiagnosticsEnabled()) {
      // eslint-disable-next-line no-console
      console.warn("[vs01-prepare-field-rejected]", {
        reason: "incomplete_sender_stamp",
        fieldType: f.type,
      });
    }
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
    if (vs01DiagnosticsEnabled()) {
      // eslint-disable-next-line no-console
      console.warn("[vs01-prepare-field-rejected]", {
        reason: "incomplete_recipient_stamp",
        fieldType: f.type,
      });
    }
    return null;
  }
  return f as PrepareStampedRecipientField;
}

export function prepareAutoInitialsFieldId(roleId: string, page: number): string {
  const safe = roleId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 48);
  return `prep_auto_${safe}_p${page}`;
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
  const { width, height } = getVs01DefaultFieldGeometry("initials");
  const roleId = args.role.roleId;
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
    const { x, y } = clampFieldRectToPage(1 - width - 0.02, 1 - height - 0.058, width, height);
    const raw = createPlacedFieldAtClick("initials", p, x, y, args.valueCtx, { autoInitials: true });
    raw.id = prepareAutoInitialsFieldId(roleId, p);
    const stamped = stampPrepareSenderFieldOrReject(raw, args.role, roleId, PREPARE_FIELD_ASSIGNMENT_SOURCE);
    if (!stamped) continue;
    const withSource = {
      ...stamped,
      assignmentSource: PREPARE_FIELD_ASSIGNMENT_SOURCE as typeof PREPARE_FIELD_ASSIGNMENT_SOURCE,
    };
    const { field } = normalizePlacedFieldGeometryIfBelowMinimum(withSource);
    out.push(field);
    added += 1;
  }
  if (vs01DiagnosticsEnabled()) {
    // eslint-disable-next-line no-console
    console.info("[vs01-initials-every-page-added]", {
      roleIdShort: roleId.slice(0, 16),
      pageCount: args.pageCount,
      addedCount: added,
      skippedCount: skipped,
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
  visualRoleId?: string | null;
  autoInitials?: boolean;
}): PrepareStampedSenderField | null {
  const resolved = args.authority.resolveRoleForPlacement({
    tool: args.type,
    page: args.page,
    visualRoleId: args.visualRoleId,
  });
  if (!resolved.ok) return null;
  const ctx = buildPreparePlacementValueContext(resolved.role, args.valueCtx);
  const raw = createPlacedFieldAtClick(
    args.type,
    args.page,
    args.clickX,
    args.clickY,
    ctx,
    args.autoInitials ? { autoInitials: true } : undefined,
  );
  const stamped = stampPrepareSenderFieldOrReject(
    raw,
    resolved.role,
    resolved.authorityRoleId,
    PREPARE_FIELD_ASSIGNMENT_SOURCE,
  );
  if (!stamped) return null;
  const withMeta = {
    ...stamped,
    assignmentSource: PREPARE_FIELD_ASSIGNMENT_SOURCE,
  };
  const { field } = normalizePlacedFieldGeometryIfBelowMinimum(withMeta);
  const ok = assertPrepareSenderStamped(field);
  if (ok && vs01DiagnosticsEnabled()) {
    // eslint-disable-next-line no-console
    console.info("[vs01-prepare-field-added]", {
      fieldType: ok.type,
      partyIndex: ok.assignedPartyIndex,
      partyId: ok.assignedPartyId,
      roleKind: ok.assignedSignerRoleKind,
      roleIdShort: ok.assignedSignerRoleId.slice(0, 16),
    });
  }
  return ok;
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
  if (!resolved.ok) return null;
  if (!resolved.role.vs01CounterpartyId) {
    if (vs01DiagnosticsEnabled()) {
      // eslint-disable-next-line no-console
      console.warn("[vs01-prepare-field-rejected]", { reason: "owner_role_on_recipient_layer" });
    }
    return null;
  }
  const { x, y, width, height } = computeRecipientRectFromClick(args.type, args.clickX, args.clickY);
  const raw: Vs01RecipientPlacedField = {
    id: newSigningFieldId(),
    counterpartyId: args.counterpartyId,
    type: args.type,
    page: args.page,
    x,
    y,
    width,
    height,
    value: defaultRecipientFieldValue(args.type, args.displayName, args.email),
  };
  const stamped = stampPrepareRecipientFieldOrReject(
    raw,
    resolved.role,
    resolved.authorityRoleId,
    PREPARE_FIELD_ASSIGNMENT_SOURCE,
  );
  if (!stamped) return null;
  const withMeta = {
    ...stamped,
    assignmentSource: PREPARE_FIELD_ASSIGNMENT_SOURCE,
  };
  const { field } = normalizePlacedFieldGeometryIfBelowMinimum(withMeta);
  const ok = assertPrepareRecipientStamped(field);
  if (ok && vs01DiagnosticsEnabled()) {
    // eslint-disable-next-line no-console
    console.info("[vs01-prepare-field-added]", {
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

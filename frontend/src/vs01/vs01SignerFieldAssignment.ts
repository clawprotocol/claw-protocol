import { prepareRoleSignerName, signerMetadataInputRaw } from "../agreement/signerMetadataNormalize";
import { isPlausibleEmail } from "./detailsStepValidation";
import {
  normalizePlacedFieldGeometryIfBelowMinimum,
  type PlacedSigningField,
} from "./signingFields";
import type { Vs01Counterparty, Vs01RecipientPlacedField, Vs01SignerFieldAssignmentSource } from "./types";
import {
  fieldCountsAsTitle,
  fieldForPrepareGate,
  logVs01PrepareRequiredFields,
  logVs01PrepareRoleCompletion,
} from "./vs01PreparePacketCompletion";
import {
  resolveVs01RequiredSignerFields,
  type Vs01SignerFieldTallies,
  VS01_DEFAULT_REQUIRED_KEYS,
} from "./vs01RequiredSignerFields";

function looksLikeLegalEntityPartyNameLocal(name: string): boolean {
  const t = name.trim();
  if (!t) return false;
  const u = t.toUpperCase();
  return /\b(LLC|L\.L\.C\.|INC|INC\.|CORP|CORP\.|CO\.|LTD|LP|L\.P\.|PLC|GMBH|BV|NV|SA|AG)\b/.test(u);
}

/** Stable per-agreement signer role id (no raw emails, no document body). */
export function buildStableSignerRoleId(agreementId: string, partyIndex: number, partyId: string): string {
  const a = agreementId.trim().slice(0, 12).replace(/[^a-zA-Z0-9_-]/g, "_");
  const p = partyId.trim().slice(0, 32).replace(/[^a-zA-Z0-9_-]/g, "_");
  return `vs01r:${a}:i${partyIndex}:${p}`;
}

export type Vs01PrepareSigningRole = {
  roleId: string;
  partyIndex: number;
  partyId: string;
  /** Legal / org party name on the agreement (entity). */
  entityName: string;
  /** Same as entityName — explicit party label for prepare diagnostics. */
  partyName: string;
  /** UI label for the signer slot (defaults to party name). */
  roleLabel: string;
  /** Human representative name when known from intake; not the entity name. */
  signerName?: string;
  signerTitle?: string;
  signerEmail?: string;
  reviewEmail?: string;
  isEntityParty: boolean;
  requiresSignature: boolean;
  /** Vs01 counterparty row id when this role maps to a counterparty; null for owner/sender row. */
  vs01CounterpartyId: string | null;
  kind: "owner" | "counterparty";
};

/**
 * Roles used for paid Pro prepare-mode placement + packet gate (owner + named counterparties only).
 */
export function buildVs01PrepareSigningRoles(args: {
  agreementId: string;
  /** Owner legal entity / party name only. */
  creatorName: string;
  creatorEmail: string;
  /** Optional human representative for owner (never initials or signature typed text). */
  ownerSignerName?: string;
  ownerSignerTitle?: string;
  counterparties: Vs01Counterparty[];
}): Vs01PrepareSigningRole[] {
  const aid = args.agreementId.trim();
  const ownerName = (args.creatorName || "").trim() || "Owner";
  const ownerPartyId = "owner";
  const ownerRoleId = buildStableSignerRoleId(aid, 0, ownerPartyId);
  const out: Vs01PrepareSigningRole[] = [
    {
      roleId: ownerRoleId,
      partyIndex: 0,
      partyId: ownerPartyId,
      entityName: ownerName,
      partyName: ownerName,
      roleLabel: "Owner",
      signerName: prepareRoleSignerName(args.ownerSignerName, ownerName),
      signerTitle: signerMetadataInputRaw(args.ownerSignerTitle) || undefined,
      signerEmail: (args.creatorEmail || "").trim() || undefined,
      reviewEmail: undefined,
      isEntityParty: looksLikeLegalEntityPartyNameLocal(ownerName),
      requiresSignature: true,
      vs01CounterpartyId: null,
      kind: "owner",
    },
  ];
  let idx = 1;
  for (const c of args.counterparties) {
    if (!c.name.trim()) continue;
    const roleId = buildStableSignerRoleId(aid, idx, c.id);
    const rowEmail = [c.signerEmail, c.reviewEmail, c.email]
      .map((x) => (x ?? "").trim())
      .find((x) => isPlausibleEmail(x));
    const partyName = c.name.trim();
    const preparedSignerName = prepareRoleSignerName(c.signerName, partyName);
    const isEntityParty = looksLikeLegalEntityPartyNameLocal(c.name);
    out.push({
      roleId,
      partyIndex: idx,
      partyId: c.id,
      entityName: partyName,
      partyName,
      roleLabel: partyName,
      signerName: preparedSignerName ?? (!isEntityParty ? partyName : undefined),
      signerTitle: signerMetadataInputRaw(c.signerTitle) || undefined,
      signerEmail: rowEmail || undefined,
      reviewEmail: c.reviewEmail?.trim() || undefined,
      isEntityParty,
      requiresSignature: true,
      vs01CounterpartyId: c.id,
      kind: "counterparty",
    });
    idx += 1;
  }
  return out;
}

export function migrateLegacySenderPlacedFields(
  fields: PlacedSigningField[],
  ownerRole: Vs01PrepareSigningRole,
): PlacedSigningField[] {
  return fields.map((f) => {
    let next: PlacedSigningField = f;
    if (!f.assignedSignerRoleId?.trim()) {
      next = {
        ...f,
        assignedSignerRoleId: ownerRole.roleId,
        assignedPartyId: ownerRole.partyId,
        assignedPartyIndex: ownerRole.partyIndex,
        assignedSignerEmail: ownerRole.signerEmail,
        assignedSignerRoleLabel: ownerRole.entityName,
        assignedSignerRoleKind: ownerRole.kind,
        assignmentSource: "migration",
      };
    } else if (!f.assignedSignerRoleKind) {
      const roleKind =
        f.assignedPartyId === ownerRole.partyId || f.assignedPartyIndex === 0
          ? ownerRole.kind
          : "counterparty";
      next = { ...next, assignedSignerRoleKind: roleKind };
    }
    const { field, normalized } = normalizePlacedFieldGeometryIfBelowMinimum(next);
    if (normalized && vs01DiagnosticsEnabled()) {
      // eslint-disable-next-line no-console
      console.info("[vs01-signature-geometry-normalized]", {
        fieldType: field.type,
        partyIndex: field.assignedPartyIndex ?? null,
      });
    }
    return field;
  });
}

export function migrateLegacyRecipientPlacedFields(
  fields: Vs01RecipientPlacedField[],
  roles: Vs01PrepareSigningRole[],
): Vs01RecipientPlacedField[] {
  const byCp = new Map<string, Vs01PrepareSigningRole>();
  for (const r of roles) {
    if (r.vs01CounterpartyId) byCp.set(r.vs01CounterpartyId, r);
  }
  return fields.map((f) => {
    if (f.assignedSignerRoleId?.trim()) return f;
    const role = byCp.get(f.counterpartyId);
    if (!role) {
      return { ...f, assignmentSource: "migration" };
    }
    const migrated: Vs01RecipientPlacedField = {
      ...f,
      assignedSignerRoleId: role.roleId,
      assignedPartyId: role.partyId,
      assignedPartyIndex: role.partyIndex,
      assignedSignerEmail: role.signerEmail ?? role.reviewEmail,
      assignedSignerRoleLabel: role.entityName,
      assignedSignerRoleKind: role.kind,
      assignmentSource: "migration",
    };
    const { field, normalized } = normalizePlacedFieldGeometryIfBelowMinimum(migrated);
    if (normalized && vs01DiagnosticsEnabled()) {
      // eslint-disable-next-line no-console
      console.info("[vs01-signature-geometry-normalized]", {
        fieldType: field.type,
        partyIndex: field.assignedPartyIndex ?? null,
      });
    }
    return field;
  });
}

export function resolveSenderFieldRoleId(
  f: PlacedSigningField,
  ownerRole: Vs01PrepareSigningRole,
  _roles: Vs01PrepareSigningRole[],
): string {
  const rid = (f.assignedSignerRoleId || "").trim();
  if (rid) return rid;
  return ownerRole.roleId;
}

export function resolveRecipientFieldRoleId(
  f: Vs01RecipientPlacedField,
  roles: Vs01PrepareSigningRole[],
): string | null {
  const rid = (f.assignedSignerRoleId || "").trim();
  if (rid) return rid;
  const role = roles.find((r) => r.vs01CounterpartyId === f.counterpartyId);
  return role?.roleId ?? null;
}

export function recipientFieldBelongsToLockedSigner(
  f: Vs01RecipientPlacedField,
  lockedCounterpartyId: string,
  lockedSignerRoleId: string | null,
): boolean {
  const lock = (lockedSignerRoleId ?? "").trim();
  if (lock) {
    const eff = (f.assignedSignerRoleId ?? "").trim();
    if (eff) return eff === lock;
    return f.counterpartyId.trim() === lockedCounterpartyId.trim();
  }
  return f.counterpartyId.trim() === lockedCounterpartyId.trim();
}

export function senderTemplateFieldVisibleToRecipientSigner(
  f: PlacedSigningField,
  lockedCounterpartyId: string,
  lockedSignerRoleId: string | null,
  roles: Vs01PrepareSigningRole[],
): boolean {
  const ownerRole = roles.find((r) => r.kind === "owner");
  if (!ownerRole) return false;
  const sid = resolveSenderFieldRoleId(f, ownerRole, roles);
  const lockedRole =
    (lockedSignerRoleId?.trim() && roles.find((r) => r.roleId === lockedSignerRoleId.trim())) ||
    roles.find((r) => r.vs01CounterpartyId === lockedCounterpartyId);
  if (!lockedRole) return sid !== ownerRole.roleId;
  return sid !== lockedRole.roleId;
}

/**
 * Hide sender “reference” overlay slots that belong to the locked signer (those fields are filled
 * on the recipient layer). When {@link agreementId} or {@link lockedSignerRoleId} is missing, keeps
 * legacy behavior (show all sender reference boxes).
 */
export function hideSenderTemplateFieldForRecipientSigner(
  f: PlacedSigningField,
  agreementId: string | null | undefined,
  lockedSignerRoleId: string | null | undefined,
): boolean {
  const aid = (agreementId ?? "").trim();
  const lock = (lockedSignerRoleId ?? "").trim();
  if (!aid || !lock) return false;
  const ownerRoleId = buildStableSignerRoleId(aid, 0, "owner");
  const eff = (f.assignedSignerRoleId || "").trim() || ownerRoleId;
  return eff === lock;
}

export function stampSenderFieldWithPrepareRole(
  f: PlacedSigningField,
  role: Vs01PrepareSigningRole,
  source: Vs01SignerFieldAssignmentSource = "active_role_selector",
): PlacedSigningField {
  return {
    ...f,
    assignedSignerRoleId: role.roleId,
    assignedPartyId: role.partyId,
    assignedPartyIndex: role.partyIndex,
    assignedSignerEmail: role.signerEmail ?? role.reviewEmail,
    assignedSignerRoleLabel: role.entityName,
    assignedSignerRoleKind: role.kind,
    assignmentSource: source,
  };
}

export function stampRecipientFieldForPrepareRole(
  f: Vs01RecipientPlacedField,
  role: Vs01PrepareSigningRole,
  source: Vs01SignerFieldAssignmentSource = "active_role_selector",
): Vs01RecipientPlacedField {
  return {
    ...f,
    assignedSignerRoleId: role.roleId,
    assignedPartyId: role.partyId,
    assignedPartyIndex: role.partyIndex,
    assignedSignerEmail: role.signerEmail ?? role.reviewEmail,
    assignedSignerRoleLabel: role.entityName,
    assignedSignerRoleKind: role.kind,
    assignmentSource: source,
  };
}

function placementAssignmentMismatch(
  stamped: {
    assignedSignerRoleId?: string;
    assignedPartyId?: string;
    assignedPartyIndex?: number;
    assignedSignerRoleKind?: string;
  },
  role: Vs01PrepareSigningRole,
  expectedRoleId: string,
): boolean {
  const expected = expectedRoleId.trim();
  return (
    (stamped.assignedSignerRoleId ?? "").trim() !== expected ||
    stamped.assignedPartyIndex !== role.partyIndex ||
    (stamped.assignedPartyId ?? "").trim() !== role.partyId.trim() ||
    stamped.assignedSignerRoleKind !== role.kind
  );
}

/** Stamp sender field for active role; returns null (do not add) when assignment diverges. */
export function stampPrepareSenderFieldOrReject(
  field: PlacedSigningField,
  role: Vs01PrepareSigningRole,
  expectedRoleId: string,
  source: Vs01SignerFieldAssignmentSource = "active_role_selector",
): PlacedSigningField | null {
  const expected = expectedRoleId.trim();
  if (!expected || expected !== role.roleId.trim()) {
    if (vs01DiagnosticsEnabled()) {
      // eslint-disable-next-line no-console
      console.warn("[vs01-field-assignment-mismatch]", {
        reason: "expected_role_id_mismatch",
        expectedRoleIdShort: expected.slice(0, 16),
        roleIdShort: role.roleId.slice(0, 16),
      });
    }
    return null;
  }
  const stamped = stampSenderFieldWithPrepareRole(field, role, source);
  if (placementAssignmentMismatch(stamped, role, expected)) {
    if (vs01DiagnosticsEnabled()) {
      // eslint-disable-next-line no-console
      console.warn("[vs01-field-assignment-mismatch]", {
        expectedRoleIdShort: expected.slice(0, 16),
        actualRoleIdShort: (stamped.assignedSignerRoleId ?? "").slice(0, 16),
        expectedPartyIndex: role.partyIndex,
        actualPartyIndex: stamped.assignedPartyIndex ?? null,
        expectedPartyId: role.partyId,
        actualPartyId: stamped.assignedPartyId ?? null,
      });
    }
    return null;
  }
  if (vs01DiagnosticsEnabled()) {
    // eslint-disable-next-line no-console
    console.info("[vs01-field-assigned]", {
      fieldType: stamped.type,
      roleKind: role.kind,
      partyIndex: role.partyIndex,
      partyId: role.partyId,
      assignmentSource: stamped.assignmentSource,
      roleIdShort: role.roleId.slice(0, 16),
    });
  }
  return stamped;
}

/** Stamp recipient field for active role; returns null (do not add) when assignment diverges. */
export function stampPrepareRecipientFieldOrReject(
  field: Vs01RecipientPlacedField,
  role: Vs01PrepareSigningRole,
  expectedRoleId: string,
  source: Vs01SignerFieldAssignmentSource = "active_role_selector",
): Vs01RecipientPlacedField | null {
  const expected = expectedRoleId.trim();
  if (!expected || expected !== role.roleId.trim()) {
    if (vs01DiagnosticsEnabled()) {
      // eslint-disable-next-line no-console
      console.warn("[vs01-field-assignment-mismatch]", {
        reason: "expected_role_id_mismatch",
        surface: "recipient_assign",
        expectedRoleIdShort: expected.slice(0, 16),
        roleIdShort: role.roleId.slice(0, 16),
      });
    }
    return null;
  }
  const stamped = stampRecipientFieldForPrepareRole(field, role, source);
  if (placementAssignmentMismatch(stamped, role, expected)) {
    if (vs01DiagnosticsEnabled()) {
      // eslint-disable-next-line no-console
      console.warn("[vs01-field-assignment-mismatch]", {
        surface: "recipient_assign",
        expectedRoleIdShort: expected.slice(0, 16),
        actualRoleIdShort: (stamped.assignedSignerRoleId ?? "").slice(0, 16),
        expectedPartyIndex: role.partyIndex,
        actualPartyIndex: stamped.assignedPartyIndex ?? null,
      });
    }
    return null;
  }
  if (vs01DiagnosticsEnabled()) {
    // eslint-disable-next-line no-console
    console.info("[vs01-field-assigned]", {
      surface: "recipient_assign",
      fieldType: stamped.type,
      roleKind: role.kind,
      partyIndex: role.partyIndex,
      partyId: role.partyId,
      assignmentSource: stamped.assignmentSource,
      roleIdShort: role.roleId.slice(0, 16),
    });
  }
  return stamped;
}

/** First signer role that still has missing required fields (stable order). */
export function findNextIncompletePrepareRole(
  roles: Vs01PrepareSigningRole[],
  gate: SigningPacketPrepareGate,
): Vs01PrepareSigningRole | null {
  for (const role of roles) {
    if (!role.requiresSignature) continue;
    const miss = gate.missingByParty[role.roleId];
    if (miss?.length) return role;
  }
  return null;
}

export function findPrepareSigningRole(
  roles: Vs01PrepareSigningRole[] | undefined | null,
  roleId: string | null | undefined,
): Vs01PrepareSigningRole | null {
  if (!roles?.length) return null;
  const id = (roleId ?? "").trim();
  if (id) {
    const hit = roles.find((r) => r.roleId === id);
    if (hit) return hit;
  }
  return roles[0] ?? null;
}

export type PreparePlacementValueContext = {
  typedName: string;
  initials: string;
  signerEmail?: string;
};

/** @deprecated Prefer {@link buildPrepareTemplateValueContext} from vs01PrepareTemplateField for prepare placement. */
export function buildPreparePlacementValueContext(
  role: Vs01PrepareSigningRole,
  fallback: PreparePlacementValueContext,
): PreparePlacementValueContext {
  if (role.kind === "counterparty") {
    return { typedName: "", initials: "", signerEmail: undefined };
  }
  const emailRaw = (role.signerEmail ?? role.reviewEmail ?? "").trim();
  const email = isPlausibleEmail(emailRaw) ? emailRaw : fallback.signerEmail;
  return {
    typedName: fallback.typedName,
    initials: fallback.initials,
    signerEmail: email,
  };
}

export function resolvePlacedFieldSignerRoleId(
  field: { assignedSignerRoleId?: string },
  ownerRole: Vs01PrepareSigningRole,
): string {
  const rid = (field.assignedSignerRoleId ?? "").trim();
  return rid || ownerRole.roleId;
}

export function placedFieldMatchesPrepareRole(
  field: { assignedSignerRoleId?: string },
  activeRoleId: string,
  ownerRole: Vs01PrepareSigningRole,
): boolean {
  return resolvePlacedFieldSignerRoleId(field, ownerRole) === activeRoleId.trim();
}

export function vs01DiagnosticsEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.localStorage?.getItem("lawdogVs01FieldDiag") === "1") return true;
  } catch {
    /* ignore */
  }
  return typeof import.meta !== "undefined" && Boolean(import.meta.env?.DEV);
}

export function logVs01ActiveRoleChange(role: Vs01PrepareSigningRole, prevRoleId?: string | null): void {
  if (!vs01DiagnosticsEnabled()) return;
  // eslint-disable-next-line no-console
  console.info("[vs01-active-role-change]", {
    partyIndex: role.partyIndex,
    roleKind: role.kind,
    label: role.entityName,
    roleIdShort: role.roleId.slice(0, 16),
    prevRoleIdShort: prevRoleId?.trim() ? prevRoleId.trim().slice(0, 16) : null,
  });
}

export function logVs01RequiredProgress(gate: SigningPacketPrepareGate, roles: Vs01PrepareSigningRole[]): void {
  if (!vs01DiagnosticsEnabled()) return;
  // eslint-disable-next-line no-console
  console.info("[vs01-required-progress]", {
    canFinish: gate.canFinish,
    missingRoleCount: Object.keys(gate.missingByParty).length,
    roleProgress: roles.map((r) => ({
      roleKind: r.kind,
      partyIndex: r.partyIndex,
      tally: gate.fieldsByRole[r.roleId],
      missing: gate.missingByParty[r.roleId] ?? [],
    })),
  });
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE !== "test") {
    logVs01PrepareRequiredFields(gate, roles);
    logVs01PrepareRoleCompletion(gate, roles);
  }
}

/** @deprecated Use {@link stampPrepareSenderFieldOrReject}. */
export function stampAndLogSenderFieldForPrepareRole(
  field: PlacedSigningField,
  role: Vs01PrepareSigningRole,
  expectedRoleId: string,
  source: Vs01SignerFieldAssignmentSource = "active_role_selector",
): PlacedSigningField {
  return stampPrepareSenderFieldOrReject(field, role, expectedRoleId, source) ?? field;
}

/** @deprecated Use {@link stampPrepareRecipientFieldOrReject}. */
export function stampAndLogRecipientFieldForPrepareRole(
  field: Vs01RecipientPlacedField,
  role: Vs01PrepareSigningRole,
  expectedRoleId: string,
  source: Vs01SignerFieldAssignmentSource = "active_role_selector",
): Vs01RecipientPlacedField {
  return stampPrepareRecipientFieldOrReject(field, role, expectedRoleId, source) ?? field;
}

/** Gate from already-built roles (prepare UI progress without re-deriving parties). */
export function evaluatePreparePacketGateFromRoles(
  roles: Vs01PrepareSigningRole[],
  senderPlacedFields: PlacedSigningField[],
  recipientPlacedFields: Vs01RecipientPlacedField[],
): SigningPacketPrepareGate {
  const owner = roles[0];
  if (!owner || owner.kind !== "owner") {
    return emptySigningPacketPrepareGate({ __owner__: ["no_owner_role"] });
  }
  return buildSigningPacketPrepareGate(roles, owner, roles, senderPlacedFields, recipientPlacedFields);
}

function emptySigningPacketPrepareGate(
  missingByParty: Record<string, string[]>,
): SigningPacketPrepareGate {
  return {
    canFinish: false,
    missingByParty,
    missingSignatureRoles: [],
    optionalSuggestedFieldsByRole: {},
    requiredKeys: [...VS01_DEFAULT_REQUIRED_KEYS],
    totalRequiredRoles: 0,
    fieldsByRole: {},
  };
}

export type SigningPacketPrepareGate = {
  canFinish: boolean;
  missingByParty: Record<string, string[]>;
  missingSignatureRoles: Array<{ roleId: string; displayName: string }>;
  optionalSuggestedFieldsByRole: Record<string, string[]>;
  requiredKeys: readonly string[];
  totalRequiredRoles: number;
  fieldsByRole: Record<string, Vs01SignerFieldTallies>;
};

function buildSigningPacketPrepareGate(
  roles: Vs01PrepareSigningRole[],
  ownerRole: Vs01PrepareSigningRole,
  allRoles: Vs01PrepareSigningRole[],
  senderPlacedFields: PlacedSigningField[],
  recipientPlacedFields: Vs01RecipientPlacedField[],
  templateRequiredKeysByRole?: Record<string, readonly string[]>,
): SigningPacketPrepareGate {
  const fieldsByRole: SigningPacketPrepareGate["fieldsByRole"] = {};
  for (const role of roles) {
    if (!role.requiresSignature) continue;
    const bucket = collectFieldsForRole(role, ownerRole, allRoles, senderPlacedFields, recipientPlacedFields);
    fieldsByRole[role.roleId] = countTypes(bucket);
  }
  const resolved = resolveVs01RequiredSignerFields({
    roles,
    fieldsByRole,
    templateRequiredKeysByRole,
  });
  return {
    canFinish: resolved.canContinue,
    missingByParty: resolved.missingByParty,
    missingSignatureRoles: resolved.missingSignatureRoles,
    optionalSuggestedFieldsByRole: resolved.optionalSuggestedFieldsByRole,
    requiredKeys: resolved.requiredKeys,
    totalRequiredRoles: roles.length,
    fieldsByRole,
  };
}

function countTypes(
  fields: Iterable<{ type: string; textPurpose?: import("./signingFields").Vs01TextFieldPurpose; autoInitials?: boolean }>,
): { signature: number; printed_name: number; date: number; title: number } {
  let signature = 0;
  let printed_name = 0;
  let date = 0;
  let title = 0;
  for (const f of fields) {
    if (f.autoInitials) continue;
    if (f.type === "signature") signature += 1;
    else if (f.type === "printed_name") printed_name += 1;
    else if (f.type === "date") date += 1;
    else if (fieldCountsAsTitle(f)) title += 1;
  }
  return { signature, printed_name, date, title };
}

function collectFieldsForRole(
  role: Vs01PrepareSigningRole,
  ownerRole: Vs01PrepareSigningRole,
  roles: Vs01PrepareSigningRole[],
  senderPlacedFields: PlacedSigningField[],
  recipientPlacedFields: Vs01RecipientPlacedField[],
): { type: string; textPurpose?: import("./signingFields").Vs01TextFieldPurpose; autoInitials?: boolean }[] {
  const out: { type: string; textPurpose?: import("./signingFields").Vs01TextFieldPurpose; autoInitials?: boolean }[] = [];
  for (const f of senderPlacedFields) {
    if (resolveSenderFieldRoleId(f, ownerRole, roles) === role.roleId) out.push(fieldForPrepareGate(f));
  }
  for (const f of recipientPlacedFields) {
    const rid = resolveRecipientFieldRoleId(f, roles);
    if (rid === role.roleId) out.push(fieldForPrepareGate(f));
  }
  return out;
}

/** Convert a sender-layer field into a recipient-execution field for the same signer role (deep links). */
export function senderSigningFieldToRecipientExecutionField(
  f: PlacedSigningField,
  counterpartyId: string,
): Vs01RecipientPlacedField | null {
  const t = f.type;
  if (
    t !== "signature" &&
    t !== "initials" &&
    t !== "printed_name" &&
    t !== "text" &&
    t !== "email" &&
    t !== "date"
  ) {
    return null;
  }
  return {
    id: `s2r_${f.id}`,
    counterpartyId,
    type: t,
    page: f.page,
    x: f.x,
    y: f.y,
    width: f.width,
    height: f.height,
    ...(typeof f.value === "string" ? { value: f.value } : {}),
    ...(f.autoInitials ? { autoInitials: true } : {}),
    ...(f.textPurpose ? { textPurpose: f.textPurpose } : {}),
    ...(f.assignedPartyId ? { assignedPartyId: f.assignedPartyId } : {}),
    ...(f.assignedPartyIndex != null ? { assignedPartyIndex: f.assignedPartyIndex } : {}),
    ...(f.assignedSignerEmail ? { assignedSignerEmail: f.assignedSignerEmail } : {}),
    ...(f.assignedSignerRoleId ? { assignedSignerRoleId: f.assignedSignerRoleId } : {}),
    ...(f.assignedSignerRoleLabel ? { assignedSignerRoleLabel: f.assignedSignerRoleLabel } : {}),
    ...(f.assignedSignerRoleKind ? { assignedSignerRoleKind: f.assignedSignerRoleKind } : {}),
    assignmentSource: f.assignmentSource ?? "legacy",
  };
}

/**
 * Recipient signing URLs only embed {@link Vs01RecipientPlacedField}; merge any sender-layer fields
 * assigned to the same signer role so packet prep on step 2 is visible on the recipient link.
 */
export function mergeRecipientManifestFieldsForSignerRole(args: {
  ownerRole: Vs01PrepareSigningRole;
  roles: Vs01PrepareSigningRole[];
  counterpartyId: string;
  signerRoleId: string;
  recipientPlacedFields: Vs01RecipientPlacedField[];
  senderPlacedFields: PlacedSigningField[];
}): Vs01RecipientPlacedField[] {
  const base = args.recipientPlacedFields.filter((f) => f.counterpartyId === args.counterpartyId);
  const seen = new Set(base.map((f) => f.id));
  const out = [...base];
  for (const sf of args.senderPlacedFields) {
    if (resolveSenderFieldRoleId(sf, args.ownerRole, args.roles) !== args.signerRoleId) continue;
    const conv = senderSigningFieldToRecipientExecutionField(sf, args.counterpartyId);
    if (!conv || seen.has(conv.id)) continue;
    seen.add(conv.id);
    out.push(conv);
  }
  return out;
}

/** Counterparty id stamped on sender→recipient conversion for a prepare role. */
export function recipientCounterpartyIdForPrepareRole(role: Vs01PrepareSigningRole): string {
  return (role.vs01CounterpartyId ?? role.partyId).trim();
}

/**
 * All packet fields visible on recipient signing (active signer + locked counterparty overlays).
 * Merges sender-layer prep fields into recipient execution shape per role.
 */
export function buildRecipientSigningDocumentFields(args: {
  ownerRole: Vs01PrepareSigningRole;
  roles: Vs01PrepareSigningRole[];
  recipientPlacedFields: Vs01RecipientPlacedField[];
  senderPlacedFields: PlacedSigningField[];
  initialsEnabled?: boolean;
}): Vs01RecipientPlacedField[] {
  const initialsOn = args.initialsEnabled === true;
  const seen = new Set<string>();
  const out: Vs01RecipientPlacedField[] = [];
  const add = (f: Vs01RecipientPlacedField) => {
    if (!initialsOn && f.type === "initials") return;
    if (seen.has(f.id)) return;
    seen.add(f.id);
    out.push(f);
  };
  for (const f of args.recipientPlacedFields) add(f);
  for (const role of args.roles) {
    const cpId = recipientCounterpartyIdForPrepareRole(role);
    for (const f of mergeRecipientManifestFieldsForSignerRole({
      ownerRole: args.ownerRole,
      roles: args.roles,
      counterpartyId: cpId,
      signerRoleId: role.roleId,
      recipientPlacedFields: args.recipientPlacedFields,
      senderPlacedFields: args.senderPlacedFields,
    })) {
      add(f);
    }
  }
  return out;
}

export function findPrepareRoleForCounterparty(
  roles: Vs01PrepareSigningRole[],
  counterpartyId: string,
  signerRoleId?: string | null,
): Vs01PrepareSigningRole | null {
  const lock = (signerRoleId ?? "").trim();
  if (lock) {
    const hit = roles.find((r) => r.roleId === lock);
    if (hit) return hit;
  }
  return roles.find((r) => r.vs01CounterpartyId === counterpartyId) ?? null;
}

export function canFinishPreparePacketSignerCentric(args: {
  agreementId: string;
  creatorName: string;
  creatorEmail: string;
  counterparties: Vs01Counterparty[];
  senderPlacedFields: PlacedSigningField[];
  recipientPlacedFields: Vs01RecipientPlacedField[];
}): SigningPacketPrepareGate {
  const roles = buildVs01PrepareSigningRoles(args);
  const owner = roles[0];
  if (!owner || owner.kind !== "owner") {
    return emptySigningPacketPrepareGate({ __owner__: ["no_owner_role"] });
  }
  return buildSigningPacketPrepareGate(
    roles,
    owner,
    roles,
    args.senderPlacedFields,
    args.recipientPlacedFields,
  );
}

export { resolveVs01RequiredSignerFields, VS01_DEFAULT_REQUIRED_KEYS } from "./vs01RequiredSignerFields";
export type {
  ResolveVs01RequiredSignerFieldsInput,
  ResolveVs01RequiredSignerFieldsResult,
  Vs01SignerFieldTallies,
} from "./vs01RequiredSignerFields";

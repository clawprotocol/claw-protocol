import type { PlacedSigningField } from "./signingFields";
import type { Vs01Counterparty, Vs01RecipientPlacedField, Vs01SignerFieldAssignmentSource } from "./types";

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
  entityName: string;
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
  creatorName: string;
  creatorEmail: string;
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
      signerName: undefined,
      signerTitle: undefined,
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
    out.push({
      roleId,
      partyIndex: idx,
      partyId: c.id,
      entityName: c.name.trim(),
      signerName: c.signerName?.trim() || undefined,
      signerTitle: c.signerTitle?.trim() || undefined,
      signerEmail: c.signerEmail?.trim() || undefined,
      reviewEmail: c.reviewEmail?.trim() || undefined,
      isEntityParty: looksLikeLegalEntityPartyNameLocal(c.name),
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
    if (f.assignedSignerRoleId?.trim()) return f;
    return {
      ...f,
      assignedSignerRoleId: ownerRole.roleId,
      assignedPartyId: ownerRole.partyId,
      assignedPartyIndex: ownerRole.partyIndex,
      assignedSignerEmail: ownerRole.signerEmail,
      assignedSignerRoleLabel: ownerRole.entityName,
      assignmentSource: "migration",
    };
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
    return {
      ...f,
      assignedSignerRoleId: role.roleId,
      assignedPartyId: role.partyId,
      assignedPartyIndex: role.partyIndex,
      assignedSignerEmail: role.signerEmail ?? role.reviewEmail,
      assignedSignerRoleLabel: role.entityName,
      assignmentSource: "migration",
    };
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
  if (f.counterpartyId !== lockedCounterpartyId) return false;
  if (!lockedSignerRoleId?.trim()) return true;
  const eff = (f.assignedSignerRoleId || "").trim();
  if (!eff) return true;
  return eff === lockedSignerRoleId.trim();
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
    assignmentSource: source,
  };
}

export type SigningPacketPrepareGate = {
  canFinish: boolean;
  missingByParty: Record<string, string[]>;
  totalRequiredRoles: number;
  fieldsByRole: Record<string, { signature: number; printed_name: number; date: number; title: number }>;
};

function countTypes(
  fields: Iterable<{ type: string }>,
): { signature: number; printed_name: number; date: number; title: number } {
  let signature = 0;
  let printed_name = 0;
  let date = 0;
  let title = 0;
  for (const f of fields) {
    if (f.type === "signature") signature += 1;
    else if (f.type === "printed_name") printed_name += 1;
    else if (f.type === "date") date += 1;
    else if (f.type === "text") title += 1;
  }
  return { signature, printed_name, date, title };
}

function missingForRole(
  tallies: { signature: number; printed_name: number; date: number; title: number },
  needsTitle: boolean,
): string[] {
  const m: string[] = [];
  if (tallies.signature < 1) m.push("signature");
  if (tallies.printed_name < 1) m.push("printed_name");
  if (tallies.date < 1) m.push("date");
  if (needsTitle && tallies.title < 1) m.push("title");
  return m;
}

function collectFieldsForRole(
  role: Vs01PrepareSigningRole,
  ownerRole: Vs01PrepareSigningRole,
  roles: Vs01PrepareSigningRole[],
  senderPlacedFields: PlacedSigningField[],
  recipientPlacedFields: Vs01RecipientPlacedField[],
): { type: string }[] {
  const out: { type: string }[] = [];
  for (const f of senderPlacedFields) {
    if (resolveSenderFieldRoleId(f, ownerRole, roles) === role.roleId) out.push(f);
  }
  for (const f of recipientPlacedFields) {
    const rid = resolveRecipientFieldRoleId(f, roles);
    if (rid === role.roleId) out.push(f);
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
    ...(f.assignedPartyId ? { assignedPartyId: f.assignedPartyId } : {}),
    ...(f.assignedPartyIndex != null ? { assignedPartyIndex: f.assignedPartyIndex } : {}),
    ...(f.assignedSignerEmail ? { assignedSignerEmail: f.assignedSignerEmail } : {}),
    ...(f.assignedSignerRoleId ? { assignedSignerRoleId: f.assignedSignerRoleId } : {}),
    ...(f.assignedSignerRoleLabel ? { assignedSignerRoleLabel: f.assignedSignerRoleLabel } : {}),
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
  if (args.signerRoleId === args.ownerRole.roleId) {
    return base;
  }
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
    return {
      canFinish: false,
      missingByParty: { __owner__: ["no_owner_role"] },
      totalRequiredRoles: 0,
      fieldsByRole: {},
    };
  }
  const fieldsByRole: SigningPacketPrepareGate["fieldsByRole"] = {};
  const missingByParty: Record<string, string[]> = {};
  for (const role of roles) {
    if (!role.requiresSignature) continue;
    const bucket = collectFieldsForRole(role, owner, roles, args.senderPlacedFields, args.recipientPlacedFields);
    const t = countTypes(bucket);
    fieldsByRole[role.roleId] = t;
    const miss = missingForRole(t, role.isEntityParty);
    if (miss.length) missingByParty[role.roleId] = miss;
  }
  return {
    canFinish: Object.keys(missingByParty).length === 0,
    missingByParty,
    totalRequiredRoles: roles.length,
    fieldsByRole,
  };
}

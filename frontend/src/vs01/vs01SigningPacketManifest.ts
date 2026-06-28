import type { PlacedSigningField } from "./signingFields";
import type { Vs01RecipientPlacedField } from "./types";
import { buildVs01RecipientSigningUrl } from "./StepReceipt";
import type { Vs01SigningPacketModel } from "./buildVs01SigningPacketModel";
import {
  mergeRecipientManifestFieldsForSignerRole,
  recipientCounterpartyIdForPrepareRole,
  resolveSenderFieldRoleId,
  senderSigningFieldToRecipientExecutionField,
  type Vs01PrepareSigningRole,
} from "./vs01SignerFieldAssignment";

/** Scope manifest fields to one signer role (never pass full packet to every URL). */
export function filterPacketManifestFieldsForRole(
  fields: readonly Vs01RecipientPlacedField[],
  role: Vs01PrepareSigningRole,
): Vs01RecipientPlacedField[] {
  const roleId = role.roleId;
  const cpId = recipientCounterpartyIdForPrepareRole(role);
  return fields.filter((f) => {
    const assigned = (f.assignedSignerRoleId ?? "").trim();
    if (assigned) return assigned === roleId;
    return f.counterpartyId.trim() === cpId;
  });
}

/** Manifest fields for a signer role (owner merges sender-layer owner fields). */
export function buildSignerManifestForRole(args: {
  role: Vs01PrepareSigningRole;
  ownerRole: Vs01PrepareSigningRole;
  roles: Vs01PrepareSigningRole[];
  senderPlacedFields: PlacedSigningField[];
  recipientPlacedFields: Vs01RecipientPlacedField[];
}): Vs01RecipientPlacedField[] {
  const { role, ownerRole, roles, senderPlacedFields, recipientPlacedFields } = args;
  const cpId = role.vs01CounterpartyId ?? role.partyId;
  if (role.roleId !== ownerRole.roleId) {
    return mergeRecipientManifestFieldsForSignerRole({
      ownerRole,
      roles,
      counterpartyId: cpId,
      signerRoleId: role.roleId,
      recipientPlacedFields,
      senderPlacedFields,
    });
  }
  const base = recipientPlacedFields.filter((f) => f.counterpartyId === cpId);
  const seen = new Set(base.map((f) => f.id));
  const out = [...base];
  for (const sf of senderPlacedFields) {
    if (resolveSenderFieldRoleId(sf, ownerRole, roles) !== role.roleId) continue;
    const conv = senderSigningFieldToRecipientExecutionField(sf, ownerRole.partyId);
    if (!conv || seen.has(conv.id)) continue;
    seen.add(conv.id);
    out.push(conv);
  }
  return out;
}

/**
 * Build a full-packet manifest from the canonical signing model so recipient URLs
 * carry the same field geometry Prepare displayed (initials + witness signatures).
 */
export function buildFullPacketManifestFromCanonicalModel(args: {
  model: Pick<Vs01SigningPacketModel, "fields">;
  roles: readonly Vs01PrepareSigningRole[];
}): Vs01RecipientPlacedField[] {
  const seen = new Set<string>();
  const out: Vs01RecipientPlacedField[] = [];
  const roles = [...args.roles];
  const ownerRole = roles.find((r) => r.kind === "owner") ?? roles[0]!;
  for (const role of roles) {
    const cpId = recipientCounterpartyIdForPrepareRole(role);
    for (const sf of args.model.fields) {
      if (resolveSenderFieldRoleId(sf, ownerRole, roles) !== role.roleId) continue;
      const conv = senderSigningFieldToRecipientExecutionField(sf, cpId);
      if (!conv || seen.has(conv.id)) continue;
      seen.add(conv.id);
      out.push({
        ...conv,
        assignedSignerRoleId: role.roleId,
        assignedSignerRoleLabel: role.roleLabel,
        assignmentSource: "autoplace",
      });
    }
  }
  return out;
}

/** All signer fields for one document view (deduped by field id). */
export function buildFullPacketSigningManifestFields(args: {
  ownerRole: Vs01PrepareSigningRole;
  roles: Vs01PrepareSigningRole[];
  senderPlacedFields: PlacedSigningField[];
  recipientPlacedFields: Vs01RecipientPlacedField[];
}): Vs01RecipientPlacedField[] {
  const seen = new Set<string>();
  const out: Vs01RecipientPlacedField[] = [];
  const add = (f: Vs01RecipientPlacedField) => {
    if (seen.has(f.id)) return;
    seen.add(f.id);
    out.push(f);
  };
  for (const f of args.recipientPlacedFields) add(f);
  for (const role of args.roles) {
    for (const f of buildSignerManifestForRole({
      role,
      ownerRole: args.ownerRole,
      roles: args.roles,
      senderPlacedFields: args.senderPlacedFields,
      recipientPlacedFields: args.recipientPlacedFields,
    })) {
      add(f);
    }
  }
  return out;
}

export function buildSigningUrlForPrepareRole(args: {
  role: Vs01PrepareSigningRole;
  ownerRole: Vs01PrepareSigningRole;
  roles: Vs01PrepareSigningRole[];
  senderPlacedFields: PlacedSigningField[];
  recipientPlacedFields: Vs01RecipientPlacedField[];
  packetManifestFields?: readonly Vs01RecipientPlacedField[] | null;
  canonicalPacketPayload?: string | null;
  canonicalPacketStored?: boolean;
  packetRevision?: string | null;
  documentId: string;
  agreementId: string;
  receiptId?: string | null;
  /** Use {@link Vs01PrepareSigningRole.partyIndex} — not counterparties array index. */
  recipientIndex: number;
}): string {
  const cpId = recipientCounterpartyIdForPrepareRole(args.role);
  const email =
    (args.role.signerEmail ?? args.role.reviewEmail ?? "").trim() ||
    (args.role.kind === "owner" ? "" : "");
  const fields =
    args.packetManifestFields && args.packetManifestFields.length > 0
      ? filterPacketManifestFieldsForRole(args.packetManifestFields, args.role)
      : buildSignerManifestForRole({
          role: args.role,
          ownerRole: args.ownerRole,
          roles: args.roles,
          senderPlacedFields: args.senderPlacedFields,
          recipientPlacedFields: args.recipientPlacedFields,
        });
  return buildVs01RecipientSigningUrl({
    recipientIndex: args.role.partyIndex,
    recipientName: args.role.entityName?.trim() || args.role.partyName,
    recipientEmail: email,
    counterpartyId: cpId,
    documentId: args.documentId,
    receiptId: args.receiptId ?? null,
    recipientFieldsForSigner: fields,
    agreementId: args.agreementId,
    signerRoleId: args.role.roleId,
    canonicalPacketPayload: args.canonicalPacketPayload ?? null,
    canonicalPacketStored: args.canonicalPacketStored,
    packetRevision: args.packetRevision ?? null,
  });
}

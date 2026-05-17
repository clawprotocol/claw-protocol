import type { PlacedSigningField } from "./signingFields";
import type { Vs01RecipientPlacedField } from "./types";
import { buildVs01RecipientSigningUrl } from "./StepReceipt";
import {
  mergeRecipientManifestFieldsForSignerRole,
  resolveSenderFieldRoleId,
  senderSigningFieldToRecipientExecutionField,
  type Vs01PrepareSigningRole,
} from "./vs01SignerFieldAssignment";

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

export function buildSigningUrlForPrepareRole(args: {
  role: Vs01PrepareSigningRole;
  ownerRole: Vs01PrepareSigningRole;
  roles: Vs01PrepareSigningRole[];
  senderPlacedFields: PlacedSigningField[];
  recipientPlacedFields: Vs01RecipientPlacedField[];
  documentId: string;
  agreementId: string;
  receiptId?: string | null;
  recipientIndex: number;
}): string {
  const cpId = args.role.vs01CounterpartyId ?? args.role.partyId;
  const email =
    (args.role.signerEmail ?? args.role.reviewEmail ?? "").trim() ||
    (args.role.kind === "owner" ? "" : "");
  const fields = buildSignerManifestForRole({
    role: args.role,
    ownerRole: args.ownerRole,
    roles: args.roles,
    senderPlacedFields: args.senderPlacedFields,
    recipientPlacedFields: args.recipientPlacedFields,
  });
  return buildVs01RecipientSigningUrl({
    recipientIndex: args.recipientIndex,
    recipientName: args.role.entityName?.trim() || args.role.partyName,
    recipientEmail: email,
    counterpartyId: cpId,
    documentId: args.documentId,
    receiptId: args.receiptId ?? null,
    recipientFieldsForSigner: fields,
    agreementId: args.agreementId,
    signerRoleId: args.role.roleId,
  });
}

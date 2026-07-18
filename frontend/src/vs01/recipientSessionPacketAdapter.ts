import { buildVs01SigningPacketModel, type Vs01SigningPacketModel } from "./buildVs01SigningPacketModel";
import type { RecipientSessionPacketProjection } from "./recipientSessionPacketApi";
import type { Vs01Counterparty, Vs01RecipientPlacedField } from "./types";
import type { Vs01PrepareSigningRole } from "./vs01SignerFieldAssignment";

export type AdaptedRecipientSessionPacket = {
  projection: RecipientSessionPacketProjection;
  fields: Vs01RecipientPlacedField[];
  lockedSignerRoleId: string;
  lockedCounterpartyId: string;
  counterparties: Vs01Counterparty[];
  model: Vs01SigningPacketModel;
};

function buildLayoutRoles(projection: RecipientSessionPacketProjection): Vs01PrepareSigningRole[] {
  const signerRole: Vs01PrepareSigningRole = {
    roleId: projection.signer_role_id,
    partyIndex: 0,
    partyId: projection.party_id,
    entityName: projection.document_label,
    partyName: projection.document_label,
    roleLabel: projection.signer_display_name,
    signerName: projection.signer_display_name,
    signerTitle: projection.signer_title,
    isEntityParty: true,
    requiresSignature: true,
    vs01CounterpartyId: projection.party_id,
    kind: "counterparty",
  };
  const layoutPlaceholder: Vs01PrepareSigningRole = {
    roleId: "session-layout-placeholder",
    partyIndex: 1,
    partyId: "session-layout-placeholder",
    entityName: "Counterparty",
    partyName: "Counterparty",
    roleLabel: "Counterparty",
    isEntityParty: true,
    requiresSignature: true,
    vs01CounterpartyId: null,
    kind: "counterparty",
  };
  return [signerRole, layoutPlaceholder];
}

export function adaptRecipientSessionPacketProjection(
  projection: RecipientSessionPacketProjection,
): AdaptedRecipientSessionPacket | null {
  const roles = buildLayoutRoles(projection);
  const model = buildVs01SigningPacketModel({
    mode: "guided_pro",
    authoritativeCorpusPlain: projection.corpus_plain,
    roles,
    initialsEnabled: projection.initials_policy.enabled,
    corpusGateArgs: {
      manifestPartyCount: Math.max(2, projection.page_count >= 2 ? 2 : 2),
    },
  });
  if (!model.allowed || model.pages.length === 0) {
    return null;
  }

  const lockedSignerRoleId = projection.signer_role_id.trim();
  const lockedCounterpartyId = projection.party_id.trim();
  const fields: Vs01RecipientPlacedField[] = projection.fields.map((field) => ({
    id: field.id,
    counterpartyId: lockedCounterpartyId,
    type: field.type as Vs01RecipientPlacedField["type"],
    page: field.page,
    x: field.x,
    y: field.y,
    width: field.width,
    height: field.height,
    autoInitials: field.autoInitials,
    assignedSignerRoleId: lockedSignerRoleId,
    assignedPartyId: lockedCounterpartyId,
    assignedSignerRoleLabel: projection.signer_display_name,
    assignedSignerRoleKind: "counterparty",
    assignmentSource: "prepare_active_role",
  }));

  const counterparties: Vs01Counterparty[] = [
    {
      id: lockedCounterpartyId,
      name: projection.signer_display_name,
      email: "",
      signerName: projection.signer_display_name,
      signerTitle: projection.signer_title,
    },
  ];

  return {
    projection,
    fields,
    lockedSignerRoleId,
    lockedCounterpartyId,
    counterparties,
    model,
  };
}

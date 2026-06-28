/** Shared TEST463/463B/463C/465 four-party VS01 prepare + portable packet fixtures. */

import type { AgreementParty } from "../agreement/agreementTypes";
import {
  TEST440_ATLAS,
  TEST440_BRIGHT_PEAK,
  TEST440_EVERGREEN,
  TEST440_HORIZON,
} from "../components/agreements/paidProTest440BrandLicensingDegradedRecoveryFixtures";
import { TEST461_SIGNER_METADATA } from "../components/agreements/paidProTest461Vs01PreparePacketFixtures";
import type { PlacedSigningField } from "./signingFields";
import { handlePreparePacketContinue } from "./vs01PreparePacketContinue";
import {
  buildVs01PrepareSigningRolesFromLegalParties,
  stampSenderFieldWithPrepareRole,
  type Vs01PrepareSigningRole,
} from "./vs01SignerFieldAssignment";
import type { Vs01CanonicalPacketPortableV1 } from "./vs01CanonicalPacketSeed";
import type { PaidProVs01PostSignHandoffV1 } from "./vs01PaidProPostSignHandoff";

export const TEST463_AG = "ag_test463";
export const TEST463_DOC = "doc_test463";

export const TEST463_LEGAL_PARTIES: AgreementParty[] = [
  {
    id: "party_evergreen",
    name: TEST440_EVERGREEN,
    role: "owner",
    signerEmail: TEST461_SIGNER_METADATA.recipient1Email,
    signerName: TEST461_SIGNER_METADATA.partySignerNames[0],
    signerTitle: TEST461_SIGNER_METADATA.partySignerTitles[0],
    requiresSignature: true,
  },
  {
    id: "party_atlas",
    name: TEST440_ATLAS,
    role: "party",
    signerEmail: TEST461_SIGNER_METADATA.recipient2Email,
    signerName: TEST461_SIGNER_METADATA.partySignerNames[1],
    signerTitle: TEST461_SIGNER_METADATA.partySignerTitles[1],
    requiresSignature: true,
  },
  {
    id: "party_horizon",
    name: TEST440_HORIZON,
    role: "party",
    signerEmail: TEST461_SIGNER_METADATA.extraPartyReviewEmails[0],
    signerName: TEST461_SIGNER_METADATA.partySignerNames[2],
    signerTitle: TEST461_SIGNER_METADATA.partySignerTitles[2],
    requiresSignature: true,
  },
  {
    id: "party_brightpeak",
    name: TEST440_BRIGHT_PEAK,
    role: "party",
    signerEmail: TEST461_SIGNER_METADATA.extraPartyReviewEmails[1],
    signerName: TEST461_SIGNER_METADATA.partySignerNames[3],
    signerTitle: TEST461_SIGNER_METADATA.partySignerTitles[3],
    requiresSignature: true,
  },
];

export function test463FourPartyCorpus(): string {
  return `${"Premium operational clause with detailed duties and payment mechanics. ".repeat(90)}

IN WITNESS WHEREOF, the Parties execute this Agreement.

${TEST440_EVERGREEN}
By: ______________________

${TEST440_ATLAS}
By: ______________________

${TEST440_HORIZON}
By: ______________________

${TEST440_BRIGHT_PEAK}
By: ______________________`;
}

function completeRoleFields(role: Vs01PrepareSigningRole): PlacedSigningField[] {
  const base: PlacedSigningField = {
    id: `sig-${role.roleId}`,
    type: "signature",
    page: 0,
    x: 0.1,
    y: 0.1,
    width: 0.34,
    height: 0.075,
    assignedSignerRoleId: role.roleId,
  };
  return [stampSenderFieldWithPrepareRole(base, role)];
}

export function buildTest463FourPartyPreparePacket(): {
  roles: Vs01PrepareSigningRole[];
  portable: Vs01CanonicalPacketPortableV1;
  handoff: PaidProVs01PostSignHandoffV1;
} {
  const roles = buildVs01PrepareSigningRolesFromLegalParties({
    agreementId: TEST463_AG,
    parties: TEST463_LEGAL_PARTIES,
  });
  let senderPlacedFields: PlacedSigningField[] = [];
  for (const role of roles) {
    senderPlacedFields = [...senderPlacedFields, ...completeRoleFields(role)];
  }
  const result = handlePreparePacketContinue({
    agreementId: TEST463_AG,
    agreementTitle: "Four-party agreement",
    documentId: TEST463_DOC,
    creatorName: TEST440_EVERGREEN,
    creatorEmail: TEST461_SIGNER_METADATA.recipient1Email,
    counterparties: [],
    senderPlacedFields,
    recipientPlacedFields: [],
    prepareCorpusPlain: test463FourPartyCorpus(),
    bridge: { creatorIsParty: true, legalParties: TEST463_LEGAL_PARTIES },
    initialsEnabled: true,
  });
  if (!result.ok) {
    throw new Error("TEST463 prepare failed");
  }
  return { roles, portable: result.portablePacket!, handoff: result.handoff };
}

export function test463RoleByEntity(entityName: string, roles: Vs01PrepareSigningRole[]): Vs01PrepareSigningRole {
  const role = roles.find((r) => r.entityName === entityName);
  if (!role) throw new Error(`missing role for ${entityName}`);
  return role;
}
